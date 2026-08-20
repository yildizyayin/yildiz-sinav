import opticalApp from './optical-admin-entry';
import type { AuthUser, Env } from './types';
import { getAuthUser } from './lib/auth';
import { all, audit, badRequest, forbidden, json, notFound, one, uuid } from './lib/db';

const PROGRAMS = ['SCHOOL','TYT','AYT'] as const;
const TRACKS = ['NUMERIC','VERBAL'] as const;
type ProgramCode = typeof PROGRAMS[number];
type Track = typeof TRACKS[number];

function apiError(status:number, code:string, message:string, details?:unknown){return json({ok:false,error:{code,message,details}},status)}

async function requireSuper(env:Env, request:Request):Promise<AuthUser|Response>{
  const user=await getAuthUser(env,request);
  if(!user)return apiError(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');
  if(user.role!=='SUPER_ADMIN')return forbidden('Föy içerik yönetimini yalnız Super Admin yapabilir.');
  return user;
}

function safeName(value:string){return value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').slice(0,120)||'file'}

function validSlot(programCode:ProgramCode,gradeLevel:number|null){
  if(programCode==='SCHOOL')return Number.isInteger(gradeLevel)&&Number(gradeLevel)>=5&&Number(gradeLevel)<=11;
  return gradeLevel==null;
}

async function listAdmin(env:Env,url:URL):Promise<Response>{
  const academicYear=url.searchParams.get('academicYear');
  const programCode=url.searchParams.get('programCode');
  const params:any[]=[];let where='1=1';
  if(academicYear){where+=' AND w.academic_year=?';params.push(academicYear)}
  if(programCode&&PROGRAMS.includes(programCode as ProgramCode)){where+=' AND w.program_code=?';params.push(programCode)}
  const rows=await all<any>(env.DB.prepare(`SELECT w.*,
    (SELECT group_concat(s.name, ', ') FROM worksheet_subjects ws JOIN subjects s ON s.id=ws.subject_id WHERE ws.worksheet_id=w.id) subjects,
    (SELECT coalesce(sum(question_count),0) FROM worksheet_subjects ws WHERE ws.worksheet_id=w.id) total_questions,
    (SELECT count(*) FROM worksheet_outcomes wo WHERE wo.worksheet_id=w.id) outcome_count,
    (SELECT count(*) FROM worksheet_assets wa WHERE wa.worksheet_id=w.id AND wa.asset_type='PDF') pdf_count,
    (SELECT count(*) FROM worksheet_assets wa WHERE wa.worksheet_id=w.id AND wa.asset_type='ANSWER_KEY') answer_key_count,
    (SELECT count(*) FROM worksheet_question_links q WHERE q.worksheet_id=w.id AND q.solution_url IS NOT NULL AND trim(q.solution_url)!='') solution_count,
    (SELECT count(*) FROM worksheet_question_links q WHERE q.worksheet_id=w.id AND q.topic_url IS NOT NULL AND trim(q.topic_url)!='') topic_count
    FROM worksheets w WHERE ${where}
    ORDER BY w.academic_year DESC,w.program_code,coalesce(w.grade_level,99),w.track,w.sequence_no`).bind(...params));
  return json({ok:true,worksheets:rows});
}

async function options(env:Env,url:URL):Promise<Response>{
  const gradeRaw=url.searchParams.get('gradeLevel');
  const grade=gradeRaw?Number(gradeRaw):null;
  const subjects=await all<any>(env.DB.prepare(`SELECT id,code,name,category FROM subjects WHERE active=1 ORDER BY name`));
  const outcomes=await all<any>(env.DB.prepare(`SELECT o.id,o.subject_id,o.grade_level,o.code,o.topic,o.subtopic,o.title,o.official,
    cv.academic_year,cv.program_version,coalesce(cv.verified,0) curriculum_verified
    FROM outcomes o LEFT JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
    WHERE o.active=1 AND (? IS NULL OR o.grade_level=? OR o.grade_level IS NULL)
    ORDER BY o.subject_id,o.topic,o.title`).bind(grade,grade));
  return json({ok:true,subjects,outcomes,programs:PROGRAMS,tracks:TRACKS});
}

async function createWorksheet(request:Request,env:Env,actor:AuthUser):Promise<Response>{
  const body=await request.json<{academicYear?:string;programCode?:ProgramCode;gradeLevel?:number|null;track?:Track;sequenceNo?:number;title?:string}>();
  const academicYear=body.academicYear?.trim()||'';const programCode=body.programCode||'SCHOOL';const track=body.track||'NUMERIC';const gradeLevel=body.gradeLevel==null?null:Number(body.gradeLevel);const sequenceNo=Number(body.sequenceNo);const title=body.title?.trim()||'';
  if(!academicYear||!PROGRAMS.includes(programCode)||!TRACKS.includes(track)||!Number.isInteger(sequenceNo)||sequenceNo<1||sequenceNo>99)return badRequest('Föy alanları eksik veya geçersiz.');
  if(!validSlot(programCode,gradeLevel))return badRequest(programCode==='SCHOOL'?'Okul föylerinde sınıf 5-11 arasında olmalıdır.':'TYT/AYT föylerinde sınıf alanı boş bırakılmalıdır.');
  const existing=await one(env.DB.prepare(`SELECT id FROM worksheets WHERE academic_year=? AND program_code=? AND coalesce(grade_level,0)=coalesce(?,0) AND track=? AND sequence_no=?`).bind(academicYear,programCode,gradeLevel,track,sequenceNo));
  if(existing)return apiError(409,'WORKSHEET_SLOT_EXISTS','Bu akademik yıl/program/sıra için föy zaten var.');
  const id=uuid('ws');const defaultTitle=programCode==='SCHOOL'?`${gradeLevel}. Sınıf ${track==='NUMERIC'?'Sayısal':'Sözel'} Föy ${sequenceNo}`:`${programCode} ${track==='NUMERIC'?'Sayısal':'Sözel'} Föy ${sequenceNo}`;
  await env.DB.prepare(`INSERT INTO worksheets (id,academic_year,grade_level,track,sequence_no,title,status,program_code) VALUES (?,?,?,?,?,?,'DRAFT',?)`).bind(id,academicYear,gradeLevel,track,sequenceNo,title||defaultTitle,programCode).run();
  await audit(env.DB,actor.id,null,'WORKSHEET_CREATED','worksheet',id,{academicYear,programCode,gradeLevel,track,sequenceNo});
  return json({ok:true,id},201);
}

async function generateSlots(request:Request,env:Env,actor:AuthUser):Promise<Response>{
  const body=await request.json<{academicYear?:string;programCode?:ProgramCode;gradeLevel?:number|null;numericCount?:number;verbalCount?:number}>();
  const academicYear=body.academicYear?.trim()||'';const programCode=body.programCode||'SCHOOL';const gradeLevel=body.gradeLevel==null?null:Number(body.gradeLevel);const numericCount=Math.min(32,Math.max(0,Number(body.numericCount??16)));const verbalCount=Math.min(32,Math.max(0,Number(body.verbalCount??16)));
  if(!academicYear||!PROGRAMS.includes(programCode)||!Number.isInteger(numericCount)||!Number.isInteger(verbalCount))return badRequest('Yıllık föy planı geçersiz.');
  if(!validSlot(programCode,gradeLevel))return badRequest(programCode==='SCHOOL'?'Okul föylerinde sınıf 5-11 arasında olmalıdır.':'TYT/AYT föylerinde sınıf alanı boş bırakılmalıdır.');
  let created=0,skipped=0;
  for(const [track,count] of [['NUMERIC',numericCount],['VERBAL',verbalCount]] as Array<[Track,number]>){
    for(let sequenceNo=1;sequenceNo<=count;sequenceNo++){
      const exists=await one(env.DB.prepare(`SELECT id FROM worksheets WHERE academic_year=? AND program_code=? AND coalesce(grade_level,0)=coalesce(?,0) AND track=? AND sequence_no=?`).bind(academicYear,programCode,gradeLevel,track,sequenceNo));
      if(exists){skipped++;continue}
      const id=uuid('ws');const title=programCode==='SCHOOL'?`${gradeLevel}. Sınıf ${track==='NUMERIC'?'Sayısal':'Sözel'} Föy ${sequenceNo}`:`${programCode} ${track==='NUMERIC'?'Sayısal':'Sözel'} Föy ${sequenceNo}`;
      await env.DB.prepare(`INSERT INTO worksheets (id,academic_year,grade_level,track,sequence_no,title,status,program_code) VALUES (?,?,?,?,?,?,'DRAFT',?)`).bind(id,academicYear,gradeLevel,track,sequenceNo,title,programCode).run();created++;
    }
  }
  await audit(env.DB,actor.id,null,'WORKSHEET_SLOTS_GENERATED','worksheet_plan',`${academicYear}:${programCode}:${gradeLevel??'YKS'}`,{numericCount,verbalCount,created,skipped});
  return json({ok:true,created,skipped});
}

async function detail(env:Env,id:string):Promise<Response>{
  const worksheet=await one<any>(env.DB.prepare('SELECT * FROM worksheets WHERE id=?').bind(id));if(!worksheet)return notFound('Föy bulunamadı.');
  const [subjects,outcomes,assets,questionLinks]=await Promise.all([
    all<any>(env.DB.prepare(`SELECT ws.subject_id,s.code,s.name,ws.question_count FROM worksheet_subjects ws JOIN subjects s ON s.id=ws.subject_id WHERE ws.worksheet_id=? ORDER BY s.name`).bind(id)),
    all<any>(env.DB.prepare(`SELECT wo.subject_id,wo.outcome_id,o.title,o.topic,o.code,o.official,coalesce(cv.verified,0) curriculum_verified FROM worksheet_outcomes wo JOIN outcomes o ON o.id=wo.outcome_id LEFT JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE wo.worksheet_id=? ORDER BY wo.subject_id,o.topic,o.title`).bind(id)),
    all<any>(env.DB.prepare(`SELECT id,asset_type,file_name,created_at FROM worksheet_assets WHERE worksheet_id=? ORDER BY created_at DESC`).bind(id)),
    all<any>(env.DB.prepare(`SELECT q.*,s.name subject_name,o.title outcome_title FROM worksheet_question_links q JOIN subjects s ON s.id=q.subject_id LEFT JOIN outcomes o ON o.id=q.outcome_id WHERE q.worksheet_id=? ORDER BY s.name,q.question_no`).bind(id)),
  ]);
  const readiness=await worksheetReadiness(env,id);
  return json({ok:true,worksheet,subjects,outcomes,assets,questionLinks,readiness});
}

async function saveStructure(request:Request,env:Env,actor:AuthUser,id:string):Promise<Response>{
  const worksheet=await one<any>(env.DB.prepare('SELECT * FROM worksheets WHERE id=?').bind(id));if(!worksheet)return notFound('Föy bulunamadı.');if(worksheet.status==='PUBLISHED')return badRequest('Yayınlanmış föy doğrudan değiştirilemez. Önce DRAFT durumuna alın veya yeni içerik hazırlayın.','PUBLISHED_WORKSHEET_LOCKED');
  const body=await request.json<{subjects?:Array<{subjectId:string;questionCount:number;outcomeIds?:string[]}>}>();const items=body.subjects||[];if(!items.length)return badRequest('En az bir ders seçilmelidir.');
  const seen=new Set<string>();
  for(const item of items){if(seen.has(item.subjectId))return badRequest('Aynı ders birden fazla eklenemez.');seen.add(item.subjectId);if(!Number.isInteger(Number(item.questionCount))||Number(item.questionCount)<1||Number(item.questionCount)>100)return badRequest('Soru sayısı 1-100 arasında olmalıdır.');const subject=await one(env.DB.prepare('SELECT id FROM subjects WHERE id=? AND active=1').bind(item.subjectId));if(!subject)return badRequest('Seçilen ders bulunamadı.');for(const outcomeId of item.outcomeIds||[]){const outcome=await one<any>(env.DB.prepare('SELECT id,subject_id FROM outcomes WHERE id=? AND active=1').bind(outcomeId));if(!outcome||outcome.subject_id!==item.subjectId)return badRequest('Kazanım seçimi dersle eşleşmiyor.')}}
  await env.DB.prepare('DELETE FROM worksheet_question_links WHERE worksheet_id=?').bind(id).run();
  await env.DB.prepare('DELETE FROM worksheet_outcomes WHERE worksheet_id=?').bind(id).run();
  await env.DB.prepare('DELETE FROM worksheet_subjects WHERE worksheet_id=?').bind(id).run();
  let sort=0;
  for(const item of items){sort++;await env.DB.prepare('INSERT INTO worksheet_subjects (id,worksheet_id,subject_id,question_count) VALUES (?,?,?,?)').bind(uuid('wss'),id,item.subjectId,Number(item.questionCount)).run();for(const outcomeId of new Set(item.outcomeIds||[]))await env.DB.prepare('INSERT INTO worksheet_outcomes (worksheet_id,subject_id,outcome_id) VALUES (?,?,?)').bind(id,item.subjectId,outcomeId).run();}
  await audit(env.DB,actor.id,null,'WORKSHEET_STRUCTURE_UPDATED','worksheet',id,{subjects:items.map(x=>({subjectId:x.subjectId,questionCount:x.questionCount,outcomes:x.outcomeIds?.length||0}))});
  return json({ok:true,readiness:await worksheetReadiness(env,id)});
}

async function saveQuestionLinks(request:Request,env:Env,actor:AuthUser,id:string):Promise<Response>{
  const worksheet=await one<any>(env.DB.prepare('SELECT * FROM worksheets WHERE id=?').bind(id));if(!worksheet)return notFound('Föy bulunamadı.');if(worksheet.status==='PUBLISHED')return badRequest('Yayınlanmış föy bağlantıları kilitlidir.','PUBLISHED_WORKSHEET_LOCKED');
  const body=await request.json<{entries?:Array<{subjectId:string;questionNo:number;outcomeId?:string|null;solutionUrl?:string;topicUrl?:string}>}>();const entries=body.entries||[];
  const subjectRows=await all<any>(env.DB.prepare('SELECT subject_id,question_count FROM worksheet_subjects WHERE worksheet_id=?').bind(id));const limits=new Map(subjectRows.map(x=>[x.subject_id,Number(x.question_count)]));
  for(const e of entries){const limit=limits.get(e.subjectId);if(!limit||!Number.isInteger(Number(e.questionNo))||Number(e.questionNo)<1||Number(e.questionNo)>limit)return badRequest('Soru bağlantısı ders/soru aralığıyla eşleşmiyor.');if(e.outcomeId){const out=await one<any>(env.DB.prepare('SELECT id,subject_id FROM outcomes WHERE id=?').bind(e.outcomeId));if(!out||out.subject_id!==e.subjectId)return badRequest('Soru kazanımı dersle eşleşmiyor.');}for(const url of [e.solutionUrl,e.topicUrl])if(url&& !/^https:\/\//i.test(url))return badRequest('Video bağlantıları HTTPS olmalıdır.');}
  await env.DB.prepare('DELETE FROM worksheet_question_links WHERE worksheet_id=?').bind(id).run();
  for(const e of entries)await env.DB.prepare(`INSERT INTO worksheet_question_links (id,worksheet_id,subject_id,question_no,outcome_id,solution_url,topic_url) VALUES (?,?,?,?,?,?,?)`).bind(uuid('wql'),id,e.subjectId,Number(e.questionNo),e.outcomeId||null,e.solutionUrl?.trim()||null,e.topicUrl?.trim()||null).run();
  await audit(env.DB,actor.id,null,'WORKSHEET_QUESTION_LINKS_UPDATED','worksheet',id,{count:entries.length});
  return json({ok:true,readiness:await worksheetReadiness(env,id)});
}

async function uploadAsset(request:Request,env:Env,actor:AuthUser,id:string):Promise<Response>{
  const worksheet=await one<any>(env.DB.prepare('SELECT * FROM worksheets WHERE id=?').bind(id));if(!worksheet)return notFound('Föy bulunamadı.');if(worksheet.status==='PUBLISHED')return badRequest('Yayınlanmış föye dosya eklenemez.','PUBLISHED_WORKSHEET_LOCKED');
  const form=await request.formData();const file=form.get('file');const assetType=String(form.get('assetType')||'');if(!(file instanceof File))return badRequest('Dosya seçilmelidir.');if(!['PDF','ANSWER_KEY','OTHER'].includes(assetType))return badRequest('Dosya türü geçersiz.');if(file.size>30*1024*1024)return badRequest('Dosya 30 MB sınırını aşıyor.');
  if((assetType==='PDF'||assetType==='ANSWER_KEY')&&!/pdf/i.test(file.type)&&!file.name.toLowerCase().endsWith('.pdf'))return badRequest('Föy ve cevap anahtarı PDF olmalıdır.');
  const key=`worksheets/${worksheet.academic_year}/${id}/${assetType}/${Date.now()}-${safeName(file.name)}`;await env.FILES.put(key,file.stream(),{httpMetadata:{contentType:file.type||'application/octet-stream'}});const assetId=uuid('wsa');await env.DB.prepare('INSERT INTO worksheet_assets (id,worksheet_id,asset_type,r2_key,file_name) VALUES (?,?,?,?,?)').bind(assetId,id,assetType,key,file.name).run();await audit(env.DB,actor.id,null,'WORKSHEET_ASSET_UPLOADED','worksheet',id,{assetType,fileName:file.name,r2Key:key});return json({ok:true,id:assetId},201);
}

async function worksheetReadiness(env:Env,id:string){
  const worksheet=await one<any>(env.DB.prepare('SELECT * FROM worksheets WHERE id=?').bind(id));if(!worksheet)return {ready:false,errors:['Föy bulunamadı.']};
  const subjects=await all<any>(env.DB.prepare('SELECT subject_id,question_count FROM worksheet_subjects WHERE worksheet_id=?').bind(id));const errors:string[]=[];if(!subjects.length)errors.push('En az bir ders tanımlanmalıdır.');const totalQuestions=subjects.reduce((s,x)=>s+Number(x.question_count||0),0);
  for(const s of subjects){const c=await one<{c:number}>(env.DB.prepare('SELECT count(*) c FROM worksheet_outcomes WHERE worksheet_id=? AND subject_id=?').bind(id,s.subject_id));if(!(c?.c))errors.push('Her ders için en az bir resmî kazanım seçilmelidir.');}
  const unofficial=await one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM worksheet_outcomes wo JOIN outcomes o ON o.id=wo.outcome_id LEFT JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE wo.worksheet_id=? AND (o.official!=1 OR coalesce(cv.verified,0)!=1)`).bind(id));if((unofficial?.c||0)>0)errors.push('Yayın için yalnız doğrulanmış resmî müfredat/kazanım verisi kullanılabilir.');
  const pdf=await one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM worksheet_assets WHERE worksheet_id=? AND asset_type='PDF'`).bind(id));if(!(pdf?.c))errors.push('Föy PDF dosyası gereklidir.');const key=await one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM worksheet_assets WHERE worksheet_id=? AND asset_type='ANSWER_KEY'`).bind(id));if(!(key?.c))errors.push('Cevap anahtarı PDF dosyası gereklidir.');
  const links=await one<{c:number;solution:number;topic:number}>(env.DB.prepare(`SELECT count(*) c,sum(CASE WHEN solution_url IS NOT NULL AND trim(solution_url)!='' THEN 1 ELSE 0 END) solution,sum(CASE WHEN topic_url IS NOT NULL AND trim(topic_url)!='' THEN 1 ELSE 0 END) topic FROM worksheet_question_links WHERE worksheet_id=?`).bind(id));
  if(totalQuestions>0&&(links?.c||0)<totalQuestions)errors.push(`Tüm sorular için bağlantı kaydı gereklidir (${links?.c||0}/${totalQuestions}).`);if(totalQuestions>0&&(links?.solution||0)<totalQuestions)errors.push('Her soru için çözüm video bağlantısı gereklidir.');if(totalQuestions>0&&(links?.topic||0)<totalQuestions)errors.push('Her soru için konu tekrar bağlantısı gereklidir.');
  return {ready:errors.length===0,errors,totalQuestions,subjectCount:subjects.length,questionLinkCount:links?.c||0,solutionCount:links?.solution||0,topicCount:links?.topic||0};
}

async function setStatus(request:Request,env:Env,actor:AuthUser,id:string):Promise<Response>{
  const worksheet=await one<any>(env.DB.prepare('SELECT * FROM worksheets WHERE id=?').bind(id));if(!worksheet)return notFound('Föy bulunamadı.');const body=await request.json<{status?:'DRAFT'|'REVIEW'|'PUBLISHED'|'ARCHIVED'}>();if(!body.status||!['DRAFT','REVIEW','PUBLISHED','ARCHIVED'].includes(body.status))return badRequest('Geçersiz föy durumu.');if(body.status==='PUBLISHED'){const readiness=await worksheetReadiness(env,id);if(!readiness.ready)return badRequest('Föy yayın koşullarını karşılamıyor.','WORKSHEET_NOT_READY',readiness.errors);}
  await env.DB.prepare('UPDATE worksheets SET status=? WHERE id=?').bind(body.status,id).run();await audit(env.DB,actor.id,null,'WORKSHEET_STATUS_CHANGED','worksheet',id,{from:worksheet.status,to:body.status});return json({ok:true,status:body.status,readiness:await worksheetReadiness(env,id)});
}

export default {async fetch(request:Request,env:Env):Promise<Response>{const url=new URL(request.url);if(!url.pathname.startsWith('/api/worksheet-admin'))return opticalApp.fetch(request,env);try{const actor=await requireSuper(env,request);if(actor instanceof Response)return actor;
  if(url.pathname==='/api/worksheet-admin/options'&&request.method==='GET')return options(env,url);
  if(url.pathname==='/api/worksheet-admin'){if(request.method==='GET')return listAdmin(env,url);if(request.method==='POST')return createWorksheet(request,env,actor);return apiError(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');}
  if(url.pathname==='/api/worksheet-admin/generate-slots'&&request.method==='POST')return generateSlots(request,env,actor);
  const structure=url.pathname.match(/^\/api\/worksheet-admin\/([^/]+)\/structure$/);if(structure)return request.method==='PUT'?saveStructure(request,env,actor,structure[1]):apiError(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');
  const qlinks=url.pathname.match(/^\/api\/worksheet-admin\/([^/]+)\/question-links$/);if(qlinks)return request.method==='PUT'?saveQuestionLinks(request,env,actor,qlinks[1]):apiError(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');
  const assets=url.pathname.match(/^\/api\/worksheet-admin\/([^/]+)\/assets$/);if(assets)return request.method==='POST'?uploadAsset(request,env,actor,assets[1]):apiError(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');
  const status=url.pathname.match(/^\/api\/worksheet-admin\/([^/]+)\/status$/);if(status)return request.method==='PATCH'?setStatus(request,env,actor,status[1]):apiError(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');
  const item=url.pathname.match(/^\/api\/worksheet-admin\/([^/]+)$/);if(item)return request.method==='GET'?detail(env,item[1]):apiError(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');
  return notFound('Föy yönetim API yolu bulunamadı.');}catch(e){console.error('Worksheet admin error',e);return apiError(500,'SERVER_ERROR','Föy yönetimi sırasında sunucu hatası oluştu.')}}} satisfies ExportedHandler<Env>;
