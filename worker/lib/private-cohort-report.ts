import type {AuthUser,Env} from '../types';
import {all,badRequest,forbidden,json,one,uuid} from './db';
import {cohortLearningReport} from './cohort-learning-report';
import {cohortReportCsv,finishCohortBackgroundReport,mergeCohortPartition} from './cohort-background-aggregate';

const base='/api/private-cohort-reports';
const enabled=(env:Env)=>env.COHORT_REPORTS_ENABLED==='true'&&!!env.COHORT_REPORT_QUEUE&&/^anunex-cohort-reports-(staging|production)$/.test(env.COHORT_REPORT_QUEUE_NAME||'')&&!!env.REPORT_EXPORT_FILES;
const fail=(status:number,code:string,message:string)=>json({ok:false,error:{code,message}},status);
const actorScope=(u:AuthUser)=>JSON.stringify([u.role,u.institution_id,u.student_id]);
const asIso=(date:string)=>date.includes('T')?date:date.replace(' ','T')+'Z';
function selectionOf(value:any,user:AuthUser){
 if(!['SUPER_ADMIN','INSTITUTION_MANAGER'].includes(user.role))return null;
 const institutionId=user.role==='SUPER_ADMIN'?value.institutionId:user.institution_id;
 if(typeof institutionId!=='string'||!institutionId||institutionId.length>100||typeof value.academicYear!=='string'||value.academicYear.length>9||!Array.isArray(value.sources)||!value.sources.length||value.sources.length>5||value.sources.some((v:any)=>!['EXAM','QUESTION_BANK','MINI_TEST','FOY','MINI_GAME'].includes(v))||!Array.isArray(value.examIds)||value.examIds.length>20||value.examIds.some((v:any)=>typeof v!=='string'||!v||v.length>100)||!['FIRST','LATEST'].includes(value.repeatPolicy))return null;
 for(const key of ['fromDate','toDate'])if(value[key]!=null&&(typeof value[key]!=='string'||value[key].length>10))return null;
 return {institutionId,academicYear:value.academicYear,sources:[...new Set<string>(value.sources)].sort(),examIds:value.sources.includes('EXAM')?[...new Set<string>(value.examIds)].sort():[],repeatPolicy:value.repeatPolicy,fromDate:value.fromDate||'',toDate:value.toDate||''};
}
function sourceUrl(selection:any){const url=new URL('https://internal.invalid/api/reporting/institution/frozen-learning-summary');for(const key of ['institutionId','academicYear','repeatPolicy','fromDate','toDate'])if(selection[key])url.searchParams.set(key,selection[key]);url.searchParams.set('sources',selection.sources.join(','));url.searchParams.set('examIds',selection.examIds.join(','));return url;}
async function proof(env:Env,user:AuthUser,selection:any,asOf:string){
 const access=await cohortLearningReport(env,user,sourceUrl(selection),undefined,{enrollmentIds:[],asOf});if(!access.ok||!selection.sources.includes('EXAM'))return access;
 const available=await all<any>(env.DB.prepare(`SELECT p.exam_id FROM exam_delivery_profiles p WHERE p.exam_id IN (${selection.examIds.map(()=>'?').join(',')}) AND p.result_freeze_status='PUBLISHED' AND julianday(p.published_at)<=julianday(?) AND (p.result_publish_at IS NULL OR julianday(p.result_publish_at)<=julianday(?)) AND EXISTS(SELECT 1 FROM exam_result_snapshots x JOIN exam_participants ep ON ep.id=x.participant_id AND ep.exam_id=x.exam_id AND ep.student_id=x.student_id AND ep.institution_id=x.institution_id JOIN student_enrollments e ON e.student_id=x.student_id AND e.institution_id=x.institution_id AND e.season_id=ep.season_id JOIN institution_seasons se ON se.id=e.season_id AND se.institution_id=e.institution_id WHERE x.exam_id=p.exam_id AND x.snapshot_version=p.snapshot_version AND x.institution_id=? AND se.academic_year=? AND julianday(e.created_at)<=julianday(?) AND CASE WHEN json_valid(x.payload_json) THEN json_extract(x.payload_json,'$.exam.academic_year') END=? AND CASE WHEN json_valid(x.payload_json) THEN json_extract(x.payload_json,'$.exam.exam_id') END=x.exam_id)`).bind(...selection.examIds,asOf,asOf,selection.institutionId,selection.academicYear,asOf,selection.academicYear));
 return available.length===selection.examIds.length?access:fail(400,'REPORT_EXAM_UNAVAILABLE','Seçili sınavların tümü için bu kurum ve eğitim yılında yayımlanmış dönem kaydı sonucu bulunmuyor. Sınav seçimini kontrol edin.');
}
async function actor(env:Env,job:any){const user=await one<AuthUser>(env.DB.prepare('SELECT id,institution_id,student_id,role,display_name,email,username FROM users WHERE id=? AND active=1').bind(job.actor_user_id));return user&&actorScope(user)===job.actor_scope_json?user:null;}
async function revision(env:Env,institutionId:string){return one<any>(env.DB.prepare('SELECT COALESCE((SELECT revision FROM cohort_report_revisions WHERE institution_id=?),0) source_revision,revision global_revision FROM cohort_report_global_revision WHERE id=1').bind(institutionId));}
async function unchanged(env:Env,job:any){const current=await revision(env,job.institution_id);return !!current&&current.source_revision===job.source_revision&&current.global_revision===job.global_revision;}
const publicJob=(job:any)=>({jobId:job.id,status:job.status,processedEnrollments:job.processed_enrollments,expiresAt:job.expires_at,errorCode:job.error_code});
const sourceChanged=()=>fail(409,'REPORT_SOURCE_CHANGED','Rapor hazırlanırken kaynak kayıtları değişti. Güncel verilerle yeniden hazırlayın.');

export async function handlePrivateCohortReport(request:Request,env:Env,user:AuthUser):Promise<Response|null>{
 const url=new URL(request.url);if(url.pathname!==base&&!url.pathname.startsWith(base+'/'))return null;
 if(!['SUPER_ADMIN','INSTITUTION_MANAGER'].includes(user.role))return forbidden();
 if(!enabled(env)&&request.method==='GET'&&url.pathname===base)return json({ok:true,enabled:false,jobs:[]});
 if(!enabled(env))return fail(503,'COHORT_REPORT_NOT_CONFIGURED','Kurum raporunu arka planda hazırlama henüz etkinleştirilmedi.');
 if(url.pathname===base){
  if(request.method==='GET'){
   let input:any;try{const raw=url.searchParams.get('selection')||'';if(raw.length>4000)throw new Error();input=JSON.parse(raw)}catch{return badRequest('Rapor seçimi geçersiz.');}
   const selection=selectionOf(input,user);if(!selection)return badRequest('Rapor seçimi geçersiz.');
   const access=await proof(env,user,selection,new Date().toISOString());if(!access.ok)return access;
   const jobs=await all<any>(env.DB.prepare('SELECT id,status,processed_enrollments,expires_at,error_code FROM private_cohort_report_jobs WHERE actor_user_id=? AND actor_scope_json=? AND selection_json=? AND datetime(expires_at)>CURRENT_TIMESTAMP ORDER BY created_at DESC,id DESC LIMIT 10').bind(user.id,actorScope(user),JSON.stringify(selection)));
   return json({ok:true,enabled:true,jobs:jobs.map(publicJob)});
  }
  if(request.method!=='POST')return fail(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');
  let input:any;try{const raw=await request.text();if(raw.length>5000)throw new Error();input=JSON.parse(raw);if(input.confirmedReport!==true||typeof input.requestId!=='string'||input.requestId.length<8||input.requestId.length>100)throw new Error()}catch{return badRequest('Rapor isteği geçersiz.');}
  const selection=selectionOf(input,user);if(!selection)return badRequest('Rapor seçimi geçersiz.');
  const asOf=new Date().toISOString(),access=await proof(env,user,selection,asOf);if(!access.ok)return access;
  const prior=await one<any>(env.DB.prepare('SELECT * FROM private_cohort_report_jobs WHERE actor_user_id=? AND request_id=?').bind(user.id,input.requestId));
  if(prior){if(prior.actor_scope_json!==actorScope(user)||prior.selection_json!==JSON.stringify(selection))return fail(409,'REPORT_REQUEST_CONFLICT','İşlem kimliği farklı kapsam için kullanılmış.');return json({ok:true,...publicJob(prior),replayed:true});}
  const id=uuid('crj');
  const inserted=await env.DB.prepare(`INSERT INTO private_cohort_report_jobs(id,actor_user_id,request_id,actor_scope_json,selection_json,institution_id,source_revision,global_revision,status,created_at,expires_at) SELECT ?,?,?,?,?,?,COALESCE((SELECT revision FROM cohort_report_revisions WHERE institution_id=?),0),(SELECT revision FROM cohort_report_global_revision WHERE id=1),'QUEUED',strftime('%Y-%m-%dT%H:%M:%fZ','now'),datetime('now','+1 day') WHERE (SELECT count(*) FROM private_cohort_report_jobs WHERE actor_user_id=? AND status IN ('QUEUED','RUNNING') AND datetime(expires_at)>CURRENT_TIMESTAMP)<2 AND (SELECT count(*) FROM private_cohort_report_jobs WHERE actor_user_id=? AND datetime(created_at)>=datetime('now','-1 day'))<10 ON CONFLICT(actor_user_id,request_id) DO NOTHING`).bind(id,user.id,input.requestId,actorScope(user),JSON.stringify(selection),selection.institutionId,selection.institutionId,user.id,user.id).run();
  if(!inserted.meta.changes){const existing=await one<any>(env.DB.prepare('SELECT * FROM private_cohort_report_jobs WHERE actor_user_id=? AND request_id=?').bind(user.id,input.requestId));if(existing&&existing.actor_scope_json===actorScope(user)&&existing.selection_json===JSON.stringify(selection))return json({ok:true,...publicJob(existing),replayed:true});return fail(409,'REPORT_JOB_LIMIT_OR_CONFLICT','İki aktif rapor veya günlük on rapor sınırı aşıldı; işlem kimliğini kontrol edin.');}
  try{await env.COHORT_REPORT_QUEUE!.send({schemaVersion:1,jobId:id})}catch{/* Cron dispatch recovers persisted jobs. */}
  return json({ok:true,jobId:id,status:'QUEUED',processedEnrollments:0},202);
 }
 const match=url.pathname.match(/^\/api\/private-cohort-reports\/([^/]+)(?:\/(result|download))?$/);if(!match||match[1].length>100)return fail(404,'NOT_FOUND','Rapor bulunamadı.');if(request.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');
 const job=await one<any>(env.DB.prepare('SELECT * FROM private_cohort_report_jobs WHERE id=? AND actor_user_id=?').bind(match[1],user.id));if(!job)return forbidden();
 if(Date.parse(asIso(job.expires_at))<=Date.now())return fail(410,'REPORT_EXPIRED','Raporun süresi doldu.');
 if(actorScope(user)!==job.actor_scope_json)return forbidden();
 const selection=JSON.parse(job.selection_json),access=await proof(env,user,selection,asIso(job.created_at));if(!access.ok)return access;
 if(!await unchanged(env,job))return sourceChanged();
 if(!match[2])return json({ok:true,...publicJob(job)});
 if(job.status!=='READY'||!job.object_key)return fail(409,'REPORT_NOT_READY','Rapor henüz hazır değil.');
 const object=await env.REPORT_EXPORT_FILES!.get(job.object_key);if(!object)return fail(409,'REPORT_FILE_MISSING','Rapor dosyası bulunamadı; yeniden hazırlayın.');
 const report=JSON.parse(await object.text());if(!await unchanged(env,job))return sourceChanged();
 if(match[2]==='result')return json(report);
 return new Response(cohortReportCsv(report),{headers:{'Content-Type':'text/csv;charset=utf-8','Content-Disposition':'attachment; filename="kurum-birlesik-rapor.csv"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}

export async function consumePrivateCohortReports(batch:MessageBatch<any>,env:Env){
 for(const message of batch.messages){const body=message.body;if(!enabled(env)){message.retry({delaySeconds:300});continue;}if(body?.schemaVersion!==1||typeof body.jobId!=='string'||!body.jobId||body.jobId.length>100){message.ack();continue;}
  const token=uuid('lease');let objectKey:string|null=null,committed=false;
  const terminal=async(status:string,code:string)=>{await env.DB.prepare('UPDATE private_cohort_report_jobs SET status=?,error_code=?,lease_token=NULL,lease_until=NULL,aggregate_json=NULL WHERE id=? AND lease_token=?').bind(status,code,body.jobId,token).run();message.ack()};
  try{
   const claim=await env.DB.prepare("UPDATE private_cohort_report_jobs SET status='RUNNING',lease_token=?,lease_until=datetime('now','+2 minutes') WHERE id=? AND status IN ('QUEUED','RUNNING') AND datetime(expires_at)>CURRENT_TIMESTAMP AND (lease_until IS NULL OR datetime(lease_until)<=CURRENT_TIMESTAMP)").bind(token,body.jobId).run();if(!claim.meta.changes){message.ack();continue;}
   const job=await one<any>(env.DB.prepare('SELECT * FROM private_cohort_report_jobs WHERE id=? AND lease_token=?').bind(body.jobId,token));if(!job){message.ack();continue;}
   const user=await actor(env,job),selection=JSON.parse(job.selection_json),asOf=asIso(job.created_at);
   if(!user){await terminal('REVOKED','REPORT_SCOPE_REVOKED');continue;}
   const access=await proof(env,user,selection,asOf);if(access.status>=500)throw new Error('REPORT_SOURCE_RETRY');if(!access.ok){const detail=await access.json() as any;await terminal(access.status===403?'REVOKED':'FAILED',detail.error?.code||'REPORT_SCOPE_REVOKED');continue;}
   if(!await unchanged(env,job)){await terminal('FAILED','REPORT_SOURCE_CHANGED');continue;}
   const rows=await all<any>(env.DB.prepare('SELECT e.id FROM student_enrollments e JOIN institution_seasons se ON se.id=e.season_id AND se.institution_id=e.institution_id WHERE e.institution_id=? AND se.academic_year=? AND e.id>? AND julianday(e.created_at)<=julianday(?) ORDER BY e.id LIMIT 21').bind(job.institution_id,selection.academicYear,job.enrollment_cursor,asOf));
   let ids=rows.slice(0,20).map(r=>r.id),response=await cohortLearningReport(env,user,sourceUrl(selection),undefined,{enrollmentIds:ids,asOf});
   let report=await response.json() as any;
   if(!response.ok&&report.error?.code==='REPORT_SCOPE_TOO_LARGE'&&ids.length>1){ids=ids.slice(0,1);response=await cohortLearningReport(env,user,sourceUrl(selection),undefined,{enrollmentIds:ids,asOf});report=await response.json() as any;}
   if(response.status>=500)throw new Error('REPORT_SOURCE_RETRY');
   if(!response.ok){await terminal(response.status===403?'REVOKED':'FAILED',report.error?.code||'REPORT_SOURCE_INVALID');continue;}
   let aggregate:any;try{aggregate=mergeCohortPartition(job.aggregate_json?JSON.parse(job.aggregate_json):null,report)}catch{await terminal('FAILED','REPORT_AGGREGATE_LIMIT');continue;}
   if(!await unchanged(env,job)){await terminal('FAILED','REPORT_SOURCE_CHANGED');continue;}
   const more=rows.length>ids.length,processed=job.processed_enrollments+ids.length,cursor=ids.length?ids[ids.length-1]:job.enrollment_cursor;
   if(!more){objectKey=`report-exports/${job.id}/${token}.json`;await env.REPORT_EXPORT_FILES!.put(objectKey,JSON.stringify(finishCohortBackgroundReport(aggregate,asOf,processed)),{httpMetadata:{contentType:'application/json;charset=utf-8'},customMetadata:{expiresAt:job.expires_at}});}
   const result=await env.DB.prepare(`UPDATE private_cohort_report_jobs SET status=?,enrollment_cursor=?,processed_enrollments=?,aggregate_json=?,object_key=?,lease_token=NULL,lease_until=NULL,error_code=NULL WHERE id=? AND lease_token=? AND status='RUNNING' AND enrollment_cursor=? AND datetime(expires_at)>datetime(?) AND COALESCE((SELECT revision FROM cohort_report_revisions WHERE institution_id=private_cohort_report_jobs.institution_id),0)=source_revision AND (SELECT revision FROM cohort_report_global_revision WHERE id=1)=global_revision`).bind(more?'QUEUED':'READY',cursor,processed,more?JSON.stringify(aggregate):null,objectKey,job.id,token,job.enrollment_cursor,new Date().toISOString()).run();
   committed=!!result.success&&Number(result.meta.changes)===1;
   if(!committed){if(objectKey)await env.REPORT_EXPORT_FILES!.delete(objectKey);await terminal('FAILED','REPORT_SOURCE_CHANGED');continue;}
   if(more)try{await env.COHORT_REPORT_QUEUE!.send({schemaVersion:1,jobId:job.id})}catch{/* Durable continuation will be picked up by cron. */}
   message.ack();
  }catch{if(objectKey&&!committed)try{await env.REPORT_EXPORT_FILES!.delete(objectKey)}catch{}try{await env.DB.prepare("UPDATE private_cohort_report_jobs SET lease_token=NULL,lease_until=NULL,error_code='REPORT_RETRY' WHERE id=? AND lease_token=?").bind(body.jobId,token).run()}catch{}message.retry({delaySeconds:60});}
 }
}

export async function dispatchPrivateCohortReports(env:Env){
 if(!env.REPORT_EXPORT_FILES)return;
 const jobs=enabled(env)?await all<any>(env.DB.prepare("SELECT id FROM private_cohort_report_jobs WHERE status IN ('QUEUED','RUNNING') AND datetime(expires_at)>CURRENT_TIMESTAMP AND (lease_until IS NULL OR datetime(lease_until)<=CURRENT_TIMESTAMP) ORDER BY created_at LIMIT 10")):[];
 for(const job of jobs)try{await env.COHORT_REPORT_QUEUE!.send({schemaVersion:1,jobId:job.id})}catch{}
 const expired=await all<any>(env.DB.prepare('SELECT id FROM private_cohort_report_jobs WHERE datetime(expires_at)<=CURRENT_TIMESTAMP AND cleanup_done=0 ORDER BY expires_at LIMIT 2'));
 for(const job of expired){await env.DB.prepare("UPDATE private_cohort_report_jobs SET status='EXPIRED',lease_token=NULL,lease_until=NULL,aggregate_json=NULL WHERE id=?").bind(job.id).run();const objects=await env.REPORT_EXPORT_FILES!.list({prefix:`report-exports/${job.id}/`,limit:5});for(const object of objects.objects)await env.REPORT_EXPORT_FILES!.delete(object.key);if(!objects.truncated)await env.DB.prepare("UPDATE private_cohort_report_jobs SET cleanup_done=1,object_key=NULL,selection_json='{}',actor_scope_json='[]' WHERE id=?").bind(job.id).run();}
}
