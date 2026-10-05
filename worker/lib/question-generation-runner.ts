import type { AuthUser, Env } from '../types';
import { all, json, one, uuid } from './db';

type JobRow = {
  id:string; outcome_id:string; curriculum_version_id:string; academic_year:string;
  grade_level:number; subject_id:string; program_version:string; outcome_code:string|null;
  outcome_title:string; question_count:number; requested_by:string; status:'REQUESTED'|'CANCELLED';
  execution_status:'PENDING'|'RUNNING'|'RETRY'|'COMPLETED'|'FAILED'|'CANCELLED';
  lease_owner:string|null; lease_expires_at:string|null; attempt_count:number;
};
type Draft = { stemText:string; options:string[]; correctAnswer:string; solutionText:string; difficulty:number };

const base='/api/question-bank-standard/generation-jobs';
const modelDefault='@cf/zai-org/glm-4.7-flash';
function fail(status:number,code:string,message:string){return json({ok:false,error:{code,message}},status)}
function cleanText(value:unknown,max:number){return typeof value==='string'?value.trim().replace(/\s+/g,' ').slice(0,max):''}
function normalized(value:string){return value.toLocaleLowerCase('tr-TR').normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ')}
function tokenSet(value:string){return new Set(normalized(value).split(' ').filter(t=>t.length>2))}
function similarity(a:string,b:string){
 const aa=tokenSet(a),bb=tokenSet(b);if(!aa.size||!bb.size)return 0;let hit=0;for(const x of aa)if(bb.has(x))hit++;
 return hit/(aa.size+bb.size-hit);
}
async function sha256(value:string){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function aiText(result:any):string{
 if(typeof result==='string')return result.trim();
 for(const value of [result?.response,result?.result?.response,result?.result?.text,result?.text,result?.choices?.[0]?.message?.content])if(typeof value==='string'&&value.trim())return value.trim();
 return '';
}
function parseDrafts(raw:string,expected:number):Draft[]|null{
 const cleaned=raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();let parsed:any;try{parsed=JSON.parse(cleaned)}catch{return null}
 const items=Array.isArray(parsed)?parsed:parsed?.questions;if(!Array.isArray(items)||items.length!==expected)return null;
 const drafts:Draft[]=[];
 for(const item of items){
  if(!item||typeof item!=='object'||Array.isArray(item))return null;
  const keys=Object.keys(item).sort();const required=['correctAnswer','difficulty','options','solutionText','stemText'];
  if(keys.length!==required.length||keys.some((k,i)=>k!==required[i]))return null;
  const stemText=cleanText(item.stemText,1600),solutionText=cleanText(item.solutionText,2200);
  if(stemText.length<20||solutionText.length<10||!Array.isArray(item.options)||![4,5].includes(item.options.length))return null;
  const options=item.options.map((x:any)=>cleanText(x,500));if(options.some((x:string)=>!x)||new Set(options.map(normalized)).size!==options.length)return null;
  const correctAnswer=String(item.correctAnswer||'').trim().toUpperCase();
  if(!/^[A-E]$/.test(correctAnswer)||correctAnswer.charCodeAt(0)-65>=options.length)return null;
  const difficulty=Number(item.difficulty);if(!Number.isInteger(difficulty)||difficulty<1||difficulty>6)return null;
  drafts.push({stemText,options,correctAnswer,solutionText,difficulty});
 }
 return drafts;
}
async function setRetry(env:Env,jobId:string,lease:string,message:string){
 await env.DB.prepare(`UPDATE question_generation_jobs SET execution_status='RETRY',lease_owner=NULL,lease_expires_at=NULL,last_error=? WHERE id=? AND execution_status='RUNNING' AND lease_owner=?`).bind(message.slice(0,1000),jobId,lease).run();
}
async function liveContext(env:Env,job:JobRow){
 return one<any>(env.DB.prepare(`SELECT o.id FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
  WHERE o.id=? AND o.active=1 AND cv.verified=1 AND o.curriculum_version_id=? AND cv.academic_year=?
   AND o.grade_level=? AND o.subject_id=? AND cv.program_version=? AND o.code IS ? AND o.title=? AND cv.grade_level=o.grade_level`)
  .bind(job.outcome_id,job.curriculum_version_id,job.academic_year,job.grade_level,job.subject_id,job.program_version,job.outcome_code,job.outcome_title));
}
function promptFor(job:JobRow){return `MEB/ÖSYM eğitim bağlamında yalnız aşağıdaki doğrulanmış öğrenme çıktısı için özgün çoktan seçmeli soru taslakları üret.\nAkademik yıl: ${job.academic_year}\nSınıf: ${job.grade_level}\nDers kimliği: ${job.subject_id}\nProgram sürümü: ${job.program_version}\nKazanım kodu: ${job.outcome_code||'-'}\nKazanım: ${job.outcome_title}\nTam olarak ${job.question_count} soru üret. Kişisel veri, kurum/öğrenci adı, gerçek sınav sorusu kopyası veya telifli metin kullanma. Her soru 4 veya 5 seçenekli olsun; tek doğru cevap içersin; çözüm cevabı gerekçelendirsin. Zorluk 1-6 tam sayı olsun. Yalnız geçerli JSON döndür: {"questions":[{"stemText":"...","options":["..."],"correctAnswer":"A","solutionText":"...","difficulty":3}]}. Başka alan veya açıklama ekleme.`}

async function runJob(env:Env,user:AuthUser,id:string){
 if(user.role!=='SUPER_ADMIN')return fail(403,'SUPER_ADMIN_ONLY','Soru üretimini yalnız Süper Admin çalıştırabilir.');
 if(!env.AI)return fail(503,'AI_UNAVAILABLE','AI sağlayıcısı bağlı değil; istek beklemede bırakıldı.');
 const current=await one<JobRow>(env.DB.prepare(`SELECT * FROM question_generation_jobs WHERE id=?`).bind(id));
 if(!current)return fail(404,'GENERATION_JOB_NOT_FOUND','Üretim isteği bulunamadı.');
 if(current.status==='CANCELLED'||current.execution_status==='CANCELLED')return fail(409,'GENERATION_JOB_CANCELLED','İptal edilmiş üretim isteği çalıştırılamaz.');
 if(current.execution_status==='COMPLETED'){
  const lineage=await all<any>(env.DB.prepare(`SELECT question_id questionId,ordinal,output_sha256 outputSha256 FROM question_generation_lineage WHERE job_id=? ORDER BY ordinal`).bind(id));
  return json({ok:true,reused:true,jobId:id,status:'COMPLETED',questions:lineage});
 }
 const lease=uuid('qlease');
 const claimed=await env.DB.prepare(`UPDATE question_generation_jobs SET execution_status='RUNNING',lease_owner=?,lease_expires_at=datetime('now','+2 minutes'),attempt_count=attempt_count+1,started_at=COALESCE(started_at,CURRENT_TIMESTAMP),last_error=NULL
  WHERE id=? AND status='REQUESTED' AND (execution_status IN ('PENDING','RETRY','FAILED') OR (execution_status='RUNNING' AND lease_expires_at<CURRENT_TIMESTAMP))`).bind(lease,id).run();
 if(Number(claimed.meta?.changes||0)<1)return fail(409,'GENERATION_JOB_BUSY','Üretim isteği başka bir çalıştırıcıda veya henüz kiralama süresi dolmadı.');
 const job=await one<JobRow>(env.DB.prepare(`SELECT * FROM question_generation_jobs WHERE id=? AND lease_owner=? AND execution_status='RUNNING'`).bind(id,lease));
 if(!job)return fail(409,'GENERATION_LEASE_LOST','Üretim kilidi alınamadı.');
 if(!await liveContext(env,job)){await setRetry(env,id,lease,'GENERATION_CONTEXT_CHANGED');return fail(409,'GENERATION_CONTEXT_CHANGED','Doğrulanmış program veya kazanım bağlamı değişti; taslak üretilmedi.');}
 let raw='';try{
  const result:any=await env.AI.run((env.NIBIRU_AI_MODEL||modelDefault) as any,{messages:[{role:'system',content:'Sen yalnız doğrulanmış eğitim bağlamında özgün soru taslağı üreten bir yardımcı sistemsin. Çıktı insan onayı olmadan yayımlanamaz.'},{role:'user',content:promptFor(job)}],temperature:0.45,max_tokens:7000} as any);
  raw=aiText(result);
 }catch{await setRetry(env,id,lease,'AI_PROVIDER_ERROR');return fail(503,'AI_PROVIDER_ERROR','AI sağlayıcısı yanıt vermedi; istek güvenli biçimde yeniden denenebilir.');}
 const drafts=parseDrafts(raw,job.question_count);if(!drafts){await setRetry(env,id,lease,'AI_SCHEMA_INVALID');return fail(502,'AI_SCHEMA_INVALID','AI çıktısı katı soru şemasını karşılamadı; hiçbir soru kaydedilmedi.');}
 for(let i=0;i<drafts.length;i++)for(let j=i+1;j<drafts.length;j++)if(normalized(drafts[i].stemText)===normalized(drafts[j].stemText)||similarity(drafts[i].stemText,drafts[j].stemText)>=0.78){await setRetry(env,id,lease,'AI_BATCH_DUPLICATE');return fail(409,'AI_BATCH_DUPLICATE','Üretilen taslaklarda birbirine fazla benzeyen sorular bulundu; hiçbir soru kaydedilmedi.');}
 const existing=await all<any>(env.DB.prepare(`SELECT stem_text FROM question_bank WHERE academic_year=? AND grade_level=? AND subject_id=? AND review_status<>'ARCHIVED' ORDER BY created_at DESC LIMIT 1500`).bind(job.academic_year,job.grade_level,job.subject_id));
 for(const draft of drafts)for(const row of existing){const stem=String(row.stem_text||'');if(normalized(draft.stemText)===normalized(stem)||similarity(draft.stemText,stem)>=0.82){await setRetry(env,id,lease,'AI_SEMANTIC_DUPLICATE');return fail(409,'AI_SEMANTIC_DUPLICATE','Taslak mevcut soru havuzundaki bir soruya fazla benziyor; hiçbir soru kaydedilmedi.');}}
 if(!await liveContext(env,job)){await setRetry(env,id,lease,'GENERATION_CONTEXT_CHANGED');return fail(409,'GENERATION_CONTEXT_CHANGED','Program bağlamı üretim sırasında değişti; hiçbir soru kaydedilmedi.');}
 const ids=drafts.map(()=>uuid('qgq'));const digests=await Promise.all(drafts.map(d=>sha256(JSON.stringify(d))));const statements:any[]=[];
 for(let i=0;i<drafts.length;i++){
  const d=drafts[i],options=JSON.stringify(d.options.map((text,index)=>({label:String.fromCharCode(65+index),text})));
  statements.push(env.DB.prepare(`INSERT INTO question_bank(id,owner_type,owner_id,academic_year,grade_level,subject_id,topic,subtopic,question_type,difficulty,difficulty_level,stem_text,options_json,correct_answer,solution_text,source_label,copyright_status,review_status,created_by,origin_kind)
   SELECT ?,'PLATFORM',NULL,j.academic_year,j.grade_level,j.subject_id,j.outcome_title,j.outcome_code,'MULTIPLE_CHOICE',?,?,?,?,?,?,?,'OWNED','REVIEW',j.requested_by,'AI_GENERATED'
   FROM question_generation_jobs j JOIN outcomes o ON o.id=j.outcome_id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
   WHERE j.id=? AND j.status='REQUESTED' AND j.execution_status='RUNNING' AND j.lease_owner=?
    AND o.id=j.outcome_id AND o.active=1 AND cv.verified=1 AND o.curriculum_version_id=j.curriculum_version_id
    AND cv.academic_year=j.academic_year AND o.grade_level=j.grade_level AND cv.grade_level=o.grade_level
    AND o.subject_id=j.subject_id AND cv.program_version=j.program_version AND o.code IS j.outcome_code AND o.title=j.outcome_title`)
   .bind(ids[i],Math.min(d.difficulty,5),d.difficulty,d.stemText,options,d.correctAnswer,d.solutionText,`Nibiru AI taslağı · ${job.id}`,id,lease));
  statements.push(env.DB.prepare(`INSERT INTO question_learning_links(question_id,node_id,weight) SELECT ?,'ln_'||?,1 WHERE EXISTS(SELECT 1 FROM question_bank WHERE id=?)`).bind(ids[i],job.outcome_id,ids[i]));
  statements.push(env.DB.prepare(`INSERT INTO question_generation_lineage(job_id,question_id,ordinal,output_sha256) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM question_bank WHERE id=?)`).bind(id,ids[i],i+1,digests[i],ids[i]));
 }
 statements.push(env.DB.prepare(`UPDATE question_generation_jobs SET execution_status='COMPLETED',lease_owner=NULL,lease_expires_at=NULL,last_error=NULL,completed_at=CURRENT_TIMESTAMP
  WHERE id=? AND execution_status='RUNNING' AND lease_owner=? AND (SELECT COUNT(*) FROM question_generation_lineage WHERE job_id=?)=question_count`).bind(id,lease,id));
 try{await env.DB.batch(statements)}catch{await setRetry(env,id,lease,'PERSISTENCE_ROLLBACK');return fail(409,'PERSISTENCE_ROLLBACK','Taslakların atomik kaydı tamamlanamadı; hiçbir kısmi yayın yapılmadı.');}
 const done=await one<any>(env.DB.prepare(`SELECT execution_status status FROM question_generation_jobs WHERE id=?`).bind(id));
 if(done?.status!=='COMPLETED'){await setRetry(env,id,lease,'COMMIT_FENCE_FAILED');return fail(409,'COMMIT_FENCE_FAILED','Bağlam veya üretim kilidi değişti; taslaklar tamamlanmış sayılmadı.');}
 return json({ok:true,reused:false,jobId:id,status:'COMPLETED',questions:ids.map((questionId,index)=>({questionId,ordinal:index+1,outputSha256:digests[index]})),reviewStatus:'REVIEW'});
}

/** null means the URL belongs to another question-bank handler. */
export function handleQuestionGenerationRunner(request:Request,env:Env,user:AuthUser|null):Promise<Response>|null{
 const path=new URL(request.url).pathname;const match=path.match(/^\/api\/question-bank-standard\/generation-jobs\/([^/]+)\/run$/);if(!match)return null;
 if(!user)return Promise.resolve(fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.'));
 if(request.method!=='POST')return Promise.resolve(fail(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.'));
 return runJob(env,user,match[1]);
}
