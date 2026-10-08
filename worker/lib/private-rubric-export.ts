import type {AuthUser,Env} from '../types';
import {all,badRequest,forbidden,json,one,uuid} from './db';
import {handleRubricObservations,authorizeRubricExportIds} from './rubric-observations';

const enabled=(env:Env)=>env.REPORT_EXPORTS_ENABLED==='true'&&!!env.REPORT_EXPORT_QUEUE&&/^anunex-rubric-exports-(staging|production)$/.test(env.REPORT_EXPORT_QUEUE_NAME||'')&&!!env.REPORT_EXPORT_FILES;
const fail=(status:number,code:string,message:string)=>json({ok:false,error:{code,message}},status);
const actorScope=(u:AuthUser)=>JSON.stringify([u.role,u.institution_id,u.student_id]);
function sourceUrl(selection:any,cursor?:string|null){const url=new URL('https://internal.invalid/api/learning-observations/students/'+encodeURIComponent(selection.studentId));for(const key of ['view','enrollmentId','institutionId'])if(selection[key])url.searchParams.set(key,selection[key]);if(cursor)url.searchParams.set('cursor',cursor);return url;}
async function actor(env:Env,job:any){const user=await one<AuthUser>(env.DB.prepare('SELECT id,institution_id,student_id,role,display_name,email,username FROM users WHERE id=? AND active=1').bind(job.actor_user_id));return user&&actorScope(user)===job.actor_scope_json?user:null;}
async function page(env:Env,user:AuthUser,selection:any,cursor?:string|null){return handleRubricObservations(new Request(sourceUrl(selection,cursor)),env,user);}
function csv(rows:any[]){const cell=(value:unknown)=>{let s=String(value??'');if(/^[\s\u0000-\u001f]*[=+\-@]|^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};const lines:any[][]=[['Eğitim yılı','Gözlem tarihi','Rubrik','Sürüm','Kaynak','Öğrenme çıktısı','Süreç','Ölçüt','Düzey','Düzey açıklaması','Kanıt','Geri bildirim','Sonraki adım']];for(const row of rows)for(const selected of row.selections){const c=row.snapshot.criteria.find((v:any)=>v.id===selected.criterionId),l=c?.levels.find((v:any)=>v.id===selected.levelId);lines.push([row.snapshot.academicYear,row.observed_at,row.snapshot.title,row.snapshot.versionLabel,row.snapshot.sourceKind==='OFFICIAL'?'Resmî doküman':'Öğretmen tasarımı',row.snapshot.outcomeCode,row.snapshot.componentCode,c?.title,l?.label,l?.description,row.evidence_note,row.feedback,row.next_step])}return '\ufeff'+lines.map(line=>line.map(cell).join(';')).join('\r\n')+'\r\n';}

export async function handlePrivateRubricExport(request:Request,env:Env,user:AuthUser):Promise<Response|null>{
 const url=new URL(request.url),base='/api/private-rubric-exports';if(url.pathname!==base&&!url.pathname.startsWith(base+'/'))return null;
 if(!enabled(env)&&url.pathname===base&&request.method==='GET')return json({ok:true,enabled:false,jobs:[]});
 if(!enabled(env))return fail(503,'REPORT_EXPORT_NOT_CONFIGURED','Arka plan rapor hazırlama henüz etkinleştirilmedi.');
 if(url.pathname===base){
  if(request.method==='GET'){
   const selection={studentId:url.searchParams.get('studentId')||'',view:url.searchParams.get('view')||'current',enrollmentId:url.searchParams.get('enrollmentId')||'',institutionId:user.role==='SUPER_ADMIN'?(url.searchParams.get('institutionId')||''):''};
   if(!selection.studentId||selection.studentId.length>100||!['current','history'].includes(selection.view)||selection.enrollmentId.length>100||selection.institutionId.length>100)return badRequest('Rapor kapsamı geçersiz.');
   const proof=await page(env,user,selection);if(!proof?.ok)return proof||forbidden();
   const jobs=await all<any>(env.DB.prepare('SELECT id jobId,status,part_count partCount,observation_count observationCount,expires_at expiresAt FROM private_rubric_export_jobs WHERE actor_user_id=? AND actor_scope_json=? AND selection_json=? AND datetime(expires_at)>CURRENT_TIMESTAMP ORDER BY created_at DESC,id DESC LIMIT 10').bind(user.id,actorScope(user),JSON.stringify(selection)));
   return json({ok:true,enabled:true,jobs});
  }
  if(request.method!=='POST')return fail(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');
  let body:any;try{const raw=await request.text();if(raw.length>4000)throw new Error();body=JSON.parse(raw);if(body.confirmedExport!==true||typeof body.studentId!=='string'||!body.studentId||body.studentId.length>100||typeof body.requestId!=='string'||body.requestId.length<8||body.requestId.length>100||!['current','history'].includes(body.view))throw new Error();for(const key of ['enrollmentId','institutionId'])if(body[key]!=null&&(typeof body[key]!=='string'||body[key].length>100))throw new Error();}catch{return badRequest('Dışa aktarım seçimi geçersiz.');}
  const selection={studentId:body.studentId,view:body.view,enrollmentId:body.enrollmentId||'',institutionId:user.role==='SUPER_ADMIN'?(body.institutionId||''):''};
  const proof=await page(env,user,selection);if(!proof?.ok)return proof||forbidden();
  const prior=await one<any>(env.DB.prepare('SELECT id,status,selection_json FROM private_rubric_export_jobs WHERE actor_user_id=? AND request_id=?').bind(user.id,body.requestId));
  if(prior){if(prior.selection_json!==JSON.stringify(selection))return fail(409,'EXPORT_REQUEST_CONFLICT','Aynı işlem kimliği farklı kapsam için kullanıldı.');return json({ok:true,jobId:prior.id,status:prior.status,replayed:true});}
  const id=uuid('rex');
  const created=await env.DB.prepare(`INSERT INTO private_rubric_export_jobs(id,actor_user_id,request_id,actor_scope_json,selection_json,status,expires_at) SELECT ?,?,?,?,?,'QUEUED',datetime('now','+1 day') WHERE (SELECT count(*) FROM private_rubric_export_jobs WHERE actor_user_id=? AND status IN ('QUEUED','RUNNING') AND datetime(expires_at)>CURRENT_TIMESTAMP)<3 AND (SELECT count(*) FROM private_rubric_export_jobs WHERE actor_user_id=? AND datetime(created_at)>=datetime('now','-1 day'))<20 ON CONFLICT(actor_user_id,request_id) DO NOTHING`).bind(id,user.id,body.requestId,actorScope(user),JSON.stringify(selection),user.id,user.id).run();
  if(!created.meta.changes){const concurrent=await one<any>(env.DB.prepare('SELECT id,status,selection_json FROM private_rubric_export_jobs WHERE actor_user_id=? AND request_id=?').bind(user.id,body.requestId));if(concurrent&&concurrent.selection_json===JSON.stringify(selection))return json({ok:true,jobId:concurrent.id,status:concurrent.status,replayed:true});return fail(409,'EXPORT_JOB_LIMIT_OR_CONFLICT','Bekleyen rapor veya günlük 20 çıktı sınırı aşıldı; işlem kimliğini de kontrol edin.');}
  try{await env.REPORT_EXPORT_QUEUE!.send({schemaVersion:1,jobId:id})}catch{/* Scheduled dispatch recovers persisted QUEUED jobs. */}
  return json({ok:true,jobId:id,status:'QUEUED'},202);
 }
 const match=url.pathname.match(/^\/api\/private-rubric-exports\/([^/]+)(?:\/parts(?:\/(\d+)\/download)?)?$/);if(!match)return fail(404,'NOT_FOUND','Rapor yolu bulunamadı.');if(request.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');
 if(match[1].length>100||match[2]?.length>9)return badRequest('Rapor veya bölüm seçimi geçersiz.');
 const job=await one<any>(env.DB.prepare('SELECT * FROM private_rubric_export_jobs WHERE id=? AND actor_user_id=?').bind(match[1],user.id));if(!job)return forbidden();
 if(Date.parse(job.expires_at.replace(' ','T')+'Z')<=Date.now())return fail(410,'EXPORT_EXPIRED','Raporun indirme süresi doldu.');
 if(actorScope(user)!==job.actor_scope_json)return forbidden('Rapor yetki bağlamı değişti.');
 const selection=JSON.parse(job.selection_json),proof=await page(env,user,selection);if(!proof?.ok)return forbidden('Rapor kapsamına erişim artık yok.');
 if(match[2]){
  if(job.status!=='READY')return fail(409,'EXPORT_NOT_READY','Rapor henüz indirilebilir durumda değil.');
  const part=await one<any>(env.DB.prepare('SELECT * FROM private_rubric_export_parts WHERE job_id=? AND part_no=?').bind(job.id,Number(match[2])));if(!part)return fail(404,'PART_NOT_FOUND','Rapor bölümü bulunamadı.');
  if(!await authorizeRubricExportIds(env,user,sourceUrl(selection),JSON.parse(part.observation_ids_json)))return forbidden('Bu bölümdeki kanıtlar veya yetki değişti; raporu yeniden hazırlayın.');
  const object=await env.REPORT_EXPORT_FILES!.get(part.object_key);if(!object)return fail(409,'EXPORT_PART_MISSING','Rapor bölümü hazır değil; raporu yeniden hazırlayın.');
  return new Response(object.body,{headers:{'Content-Type':'text/csv;charset=utf-8','Content-Disposition':`attachment; filename="rubrik-gozlemleri-${Number(match[2])+1}.csv"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 const rawCursor=url.searchParams.get('cursor')||'-1';if(!/^-?\d{1,9}$/.test(rawCursor)||Number(rawCursor)<-1)return badRequest('Bölüm listesi devamı geçersiz.');
 const parts=job.status==='READY'?await all<any>(env.DB.prepare('SELECT part_no,observation_count,byte_count FROM private_rubric_export_parts WHERE job_id=? AND part_no>? ORDER BY part_no LIMIT 51').bind(job.id,Number(rawCursor))):[];
 return json({ok:true,jobId:job.id,status:job.status,partCount:job.part_count,observationCount:job.observation_count,expiresAt:job.expires_at,errorCode:job.error_code,parts:parts.slice(0,50),nextCursor:parts.length>50?parts[49].part_no:null,message:'Rapor bölümleri ayrı CSV dosyalarıdır; indirme sırasında güncel yetki ve kanıt görünürlüğü tekrar kontrol edilir.'});
}

export async function consumePrivateRubricExports(batch:MessageBatch<any>,env:Env){
 for(const message of batch.messages){const body=message.body;if(!enabled(env)){message.retry({delaySeconds:300});continue;}if(body?.schemaVersion!==1||typeof body.jobId!=='string'||body.jobId.length>100){message.ack();continue;}
  const token=uuid('lease');let objectKey:string|null=null,committed=false;
  try{
   const claim=await env.DB.prepare(`UPDATE private_rubric_export_jobs SET status='RUNNING',lease_token=?,lease_until=datetime('now','+2 minutes') WHERE id=? AND status IN ('QUEUED','RUNNING') AND datetime(expires_at)>CURRENT_TIMESTAMP AND (lease_until IS NULL OR datetime(lease_until)<=CURRENT_TIMESTAMP)`).bind(token,body.jobId).run();
   if(!claim.meta.changes){message.ack();continue;}
   const job=await one<any>(env.DB.prepare('SELECT * FROM private_rubric_export_jobs WHERE id=? AND lease_token=?').bind(body.jobId,token));if(!job){message.ack();continue;}
   const user=await actor(env,job),selection=JSON.parse(job.selection_json),response=user?await page(env,user,selection,job.cursor):null;
   if(response&&response.status>=500)throw new Error('EXPORT_SOURCE_RETRY');
   if(!user||!response?.ok){await env.DB.prepare("UPDATE private_rubric_export_jobs SET status='REVOKED',lease_token=NULL,lease_until=NULL,error_code='EXPORT_SCOPE_REVOKED' WHERE id=? AND lease_token=?").bind(job.id,token).run();message.ack();continue;}
   const report=await response.json() as any,content=csv(report.observations);
   objectKey=`report-exports/${job.id}/${job.part_count}-${token}.csv`;
   await env.REPORT_EXPORT_FILES!.put(objectKey,content,{httpMetadata:{contentType:'text/csv;charset=utf-8'},customMetadata:{expiresAt:job.expires_at}});
   const commitAt=new Date().toISOString();
   const witness=`id=? AND lease_token=? AND status='RUNNING' AND part_count=? AND datetime(expires_at)>datetime(?)`;
   const results=await env.DB.batch([
    env.DB.prepare(`INSERT INTO private_rubric_export_parts(job_id,part_no,object_key,observation_ids_json,observation_count,byte_count) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM private_rubric_export_jobs WHERE ${witness})`).bind(job.id,job.part_count,objectKey,JSON.stringify(report.observations.map((r:any)=>r.id)),report.observations.length,new TextEncoder().encode(content).length,job.id,token,job.part_count,commitAt),
    env.DB.prepare(`UPDATE private_rubric_export_jobs SET status=?,cursor=?,part_count=part_count+1,observation_count=observation_count+?,error_code=NULL,lease_token=NULL,lease_until=NULL WHERE ${witness}`).bind(report.nextCursor?'QUEUED':'READY',report.nextCursor||null,report.observations.length,job.id,token,job.part_count,commitAt)
   ]);
   committed=results.every(r=>r.success&&Number(r.meta.changes)===1);
   if(!committed){await env.REPORT_EXPORT_FILES!.delete(objectKey);message.ack();continue;}
   if(report.nextCursor)await env.REPORT_EXPORT_QUEUE!.send({schemaVersion:1,jobId:job.id});
   message.ack();
  }catch{if(objectKey&&!committed)try{await env.REPORT_EXPORT_FILES!.delete(objectKey)}catch{}await env.DB.prepare("UPDATE private_rubric_export_jobs SET lease_token=NULL,lease_until=NULL,error_code='EXPORT_RETRY' WHERE id=? AND lease_token=?").bind(body.jobId,token).run();message.retry({delaySeconds:60});}
 }
}

export async function dispatchPrivateRubricExports(env:Env){
 if(!env.REPORT_EXPORT_FILES)return;
 const jobs=enabled(env)?await all<any>(env.DB.prepare("SELECT id FROM private_rubric_export_jobs WHERE status IN ('QUEUED','RUNNING') AND datetime(expires_at)>CURRENT_TIMESTAMP AND (lease_until IS NULL OR datetime(lease_until)<=CURRENT_TIMESTAMP) ORDER BY created_at LIMIT 10")):[];
 for(const job of jobs){try{await env.REPORT_EXPORT_QUEUE!.send({schemaVersion:1,jobId:job.id})}catch{/* Keep expiry cleanup running; the durable job remains eligible next tick. */}}
 const expired=await all<any>(env.DB.prepare('SELECT id FROM private_rubric_export_jobs WHERE datetime(expires_at)<=CURRENT_TIMESTAMP AND cleanup_done=0 ORDER BY expires_at LIMIT 2'));
 for(const job of expired){await env.DB.prepare("UPDATE private_rubric_export_jobs SET status='EXPIRED',lease_token=NULL,lease_until=NULL WHERE id=?").bind(job.id).run();const objects=await env.REPORT_EXPORT_FILES!.list({prefix:`report-exports/${job.id}/`,limit:5});for(const object of objects.objects)await env.REPORT_EXPORT_FILES!.delete(object.key);if(!objects.truncated){await env.DB.batch([env.DB.prepare('DELETE FROM private_rubric_export_parts WHERE job_id=?').bind(job.id),env.DB.prepare("UPDATE private_rubric_export_jobs SET cleanup_done=1,selection_json='{}',actor_scope_json='[]' WHERE id=?").bind(job.id)])}}
}
