import type {AuthUser,Env} from '../types';
import {all,one,json,forbidden,badRequest,notFound,audit,uuid} from './db';
import {withExamOperationLock} from './exam-operation-lock';
import {examReadiness} from './exam-readiness';
export type Channel='LICENSED'|'RESULT_NETWORK';
export async function channelState(env:Env,id:string){
 const exam=await one<any>(env.DB.prepare('SELECT e.*,r.revision,r.app_trashed_at FROM exams e JOIN exam_revision_state r ON r.exam_id=e.id WHERE e.id=?').bind(id));if(!exam)return null;
 const rows=await all<any>(env.DB.prepare('SELECT * FROM channel_definition_publications WHERE exam_id=?').bind(id));
 const n=await one<any>(env.DB.prepare('SELECT count(*) c FROM exam_participants WHERE exam_id=?').bind(id));
 return {ok:true,examId:id,title:exam.title,examStatus:exam.status,savedRevision:exam.revision,trashedAt:exam.app_trashed_at,hasResults:Number(n?.c||0)>0,resultPortalAvailable:env.ENVIRONMENT==='production',channels:(['LICENSED','RESULT_NETWORK'] as Channel[]).map(channel=>{const row=rows.find(r=>r.channel===channel);return {channel,status:!row?'NOT_PUBLISHED':row.status!=='ACTIVE'?'UNPUBLISHED':row.source_revision===exam.revision?'CURRENT':'PENDING_UPDATE',publishedRevision:row?.source_revision||null,publishedAt:row?.published_at||null,definition:row?JSON.parse(row.definition_json):null}})};
}
export async function changeChannel(env:Env,user:AuthUser,id:string,channel:Channel,action:string,expectedRevision:number){
 if(user.role!=='SUPER_ADMIN')return forbidden();
 if(channel==='RESULT_NETWORK'&&env.ENVIRONMENT!=='production')return json({ok:false,error:{code:'RESULT_PORTAL_ENVIRONMENT_MISMATCH',message:'Demo kayıtları üretim sonuc portalına aktarılmaz. Bu işlemi app.anunex.com üzerinden yapın.'}},503);
 return withExamOperationLock(env,id,'CHANNEL_PUBLISH',async(env)=>{
 const exam=await one<any>(env.DB.prepare('SELECT e.*,r.revision,r.app_trashed_at FROM exams e JOIN exam_revision_state r ON r.exam_id=e.id WHERE e.id=?').bind(id));if(!exam)return notFound();
 if(exam.revision!==expectedRevision)return json({ok:false,error:{code:'REVISION_CONFLICT',message:'Sınav değişti. Önizlemeyi yenileyin.'}},409);
 const statements:D1PreparedStatement[]=[];
 if(['publish','update'].includes(action)){
 if(exam.app_trashed_at||!['ACTIVE','CLOSED'].includes(exam.status))return badRequest('Önce sınavı aktifleştirin veya çöp kutusundan geri alın.');
 const ready=await examReadiness(env,id);if(!ready.ready_to_publish)return badRequest('Sınavın cevap anahtarı ve puanlama kontrollerini tamamlayın.','EXAM_NOT_READY',ready);
 const definition=JSON.stringify({title:exam.title,publisher_name:exam.publisher_name,exam_date:exam.exam_date,description:exam.description});
 statements.push(env.DB.prepare(`INSERT INTO channel_definition_publications(exam_id,channel,source_revision,definition_json,published_by,status) VALUES(?,?,?,?,?,'ACTIVE') ON CONFLICT(exam_id,channel) DO UPDATE SET source_revision=excluded.source_revision,definition_json=excluded.definition_json,published_by=excluded.published_by,published_at=CURRENT_TIMESTAMP,status='ACTIVE'`).bind(id,channel,exam.revision,definition,user.id));
 statements.push(env.DB.prepare(`INSERT INTO exam_channel_publications(id,exam_id,channel,status,published_by,published_at) VALUES(?,?,?,'ACTIVE',?,CURRENT_TIMESTAMP) ON CONFLICT(exam_id,channel) DO UPDATE SET status='ACTIVE',published_by=excluded.published_by,published_at=CURRENT_TIMESTAMP`).bind(uuid('pub'),id,channel,user.id));
 statements.push(env.DB.prepare(`UPDATE exam_outcome_analysis_revisions SET ${channel==='RESULT_NETWORK'?'published_result_at':'published_app_at'}=CURRENT_TIMESTAMP WHERE exam_id=? AND revision=(SELECT MAX(revision) FROM exam_outcome_analysis_revisions WHERE exam_id=?)`).bind(id,id));
 }else if(['unpublish','remove'].includes(action)){
 statements.push(env.DB.prepare("UPDATE channel_definition_publications SET status='ARCHIVED' WHERE exam_id=? AND channel=?").bind(id,channel),env.DB.prepare("UPDATE exam_channel_publications SET status='ARCHIVED' WHERE exam_id=? AND channel=?").bind(id,channel));
 if(channel==='RESULT_NETWORK')statements.push(env.DB.prepare("UPDATE exam_administrations SET status='ARCHIVED' WHERE exam_id=? AND channel='RESULT_NETWORK' AND status='PUBLISHED'").bind(id));
 }else return badRequest('Yayın işlemi desteklenmiyor.');
 await env.DB.batch(statements);await audit(env.DB,user.id,exam.institution_id,'EXAM_CHANNEL_'+action.toUpperCase(),'exam',id,{channel,sourceRevision:exam.revision});return json(await channelState(env,id));
 });
}
export async function trashExam(env:Env,user:AuthUser,id:string,scope='APP'){
 const exam=await one<any>(env.DB.prepare('SELECT * FROM exams WHERE id=?').bind(id));if(!exam)return notFound();
 if(user.role!=='SUPER_ADMIN'&&!(user.role==='INSTITUTION_MANAGER'&&exam.owner_type==='INSTITUTION'&&exam.institution_id===user.institution_id&&scope==='APP'))return forbidden();
 if(!['APP','RESULT_PORTAL','BOTH'].includes(scope))return badRequest('Kaldırılacak platformu seçin.');
 if(scope!=='APP'&&env.ENVIRONMENT!=='production')return badRequest('Sonuc yayını app.anunex.com üzerinden yönetilir.','RESULT_PORTAL_ENVIRONMENT_MISMATCH');
 return withExamOperationLock(env,id,'EXAM_TRASH',async(env)=>{
 const result=await one<any>(env.DB.prepare("SELECT 1 ok FROM exam_channel_publications WHERE exam_id=? AND channel='RESULT_NETWORK' AND status='ACTIVE'").bind(id));
 const st:D1PreparedStatement[]=[];
 if(scope!=='RESULT_PORTAL'){
 st.push(env.DB.prepare('UPDATE exam_revision_state SET app_trashed_at=CURRENT_TIMESTAMP,prior_status=COALESCE(prior_status,?) WHERE exam_id=?').bind(exam.status,id));
 if(!result||scope==='BOTH')st.push(env.DB.prepare("UPDATE exams SET status='ARCHIVED',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id));
 st.push(env.DB.prepare("UPDATE exam_channel_publications SET status='ARCHIVED' WHERE exam_id=? AND channel='LICENSED'").bind(id),env.DB.prepare("UPDATE channel_definition_publications SET status='ARCHIVED' WHERE exam_id=? AND channel='LICENSED'").bind(id));
 }
 if(scope!=='APP')st.push(env.DB.prepare("UPDATE exam_channel_publications SET status='ARCHIVED' WHERE exam_id=? AND channel='RESULT_NETWORK'").bind(id),env.DB.prepare("UPDATE channel_definition_publications SET status='ARCHIVED' WHERE exam_id=? AND channel='RESULT_NETWORK'").bind(id),env.DB.prepare("UPDATE exam_administrations SET status='ARCHIVED' WHERE exam_id=? AND channel='RESULT_NETWORK' AND status='PUBLISHED'").bind(id));
 await env.DB.batch(st);await audit(env.DB,user.id,exam.institution_id,'EXAM_TRASHED','exam',id,{scope,resultsPreserved:true});return json({ok:true,scope,resultsPreserved:true});
 });
}
export async function restoreExam(env:Env,user:AuthUser,id:string){
 const owner=await one<any>(env.DB.prepare('SELECT owner_type,institution_id FROM exams WHERE id=?').bind(id));
 if(user.role!=='SUPER_ADMIN'&&!(user.role==='INSTITUTION_MANAGER'&&owner?.owner_type==='INSTITUTION'&&owner.institution_id===user.institution_id))return forbidden();return withExamOperationLock(env,id,'EXAM_RESTORE',async(env)=>{
 const r=await one<any>(env.DB.prepare('SELECT prior_status FROM exam_revision_state WHERE exam_id=? AND app_trashed_at IS NOT NULL').bind(id));if(!r)return notFound();
 await env.DB.batch([env.DB.prepare("UPDATE exams SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(r.prior_status||'DRAFT',id),env.DB.prepare('UPDATE exam_revision_state SET app_trashed_at=NULL,prior_status=NULL WHERE exam_id=?').bind(id)]);await audit(env.DB,user.id,null,'EXAM_RESTORED','exam',id,{publicationsRestored:false});return json({ok:true});});
}
export async function publishedDefinitions(env:Env,rows:any[]){
 const cache=new Map<string,any>();for(const row of rows){const id=row.exam_id||row.id;if(!id)continue;if(!cache.has(id)){const r=await one<any>(env.DB.prepare("SELECT definition_json FROM channel_definition_publications WHERE exam_id=? AND channel='RESULT_NETWORK' AND status='ACTIVE'").bind(id));cache.set(id,r?JSON.parse(r.definition_json):null)}const d=cache.get(id);if(!d)continue;Object.assign(row,{title:d.title,publisher_name:d.publisher_name,exam_date:d.exam_date});if(row.payload_json){try{const p=JSON.parse(row.payload_json);p.exam={...p.exam,title:d.title,publisher_name:d.publisher_name,exam_date:d.exam_date};row.payload_json=JSON.stringify(p)}catch{}}}return rows;
}
