import type {AuthUser,Env} from '../types';
import {all,one,json,forbidden,badRequest,notFound,audit,uuid} from './db';
import {withExamOperationLock} from './exam-operation-lock';
import {examReadiness} from './exam-readiness';
export type Channel='LICENSED'|'RESULT_NETWORK';
export async function channelStates(env:Env,ids:string[]){
 if(!ids.length)return [];const marks=ids.map(()=>'?').join(',');
 const exams=await all<any>(env.DB.prepare(`SELECT e.*,r.revision,r.app_trashed_at,(SELECT count(*) FROM exam_participants ep JOIN exam_results er ON er.participant_id=ep.id WHERE ep.exam_id=e.id) result_count FROM exams e JOIN exam_revision_state r ON r.exam_id=e.id WHERE e.id IN (${marks})`).bind(...ids));
 const rows=await all<any>(env.DB.prepare(`SELECT * FROM channel_definition_publications WHERE exam_id IN (${marks})`).bind(...ids));
 return ids.flatMap(id=>{const exam=exams.find(e=>e.id===id);if(!exam)return [];return [{ok:true,examId:id,title:exam.title,examStatus:exam.status,savedRevision:exam.revision,definition:{title:exam.title,publisher_name:exam.publisher_name,exam_date:exam.exam_date,description:exam.description},trashedAt:exam.app_trashed_at,hasResults:Number(exam.result_count)>0,resultPortalAvailable:env.ENVIRONMENT==='production',channels:(['LICENSED','RESULT_NETWORK'] as Channel[]).map(channel=>{const row=rows.find(r=>r.exam_id===id&&r.channel===channel);return {channel,status:!row?'NOT_PUBLISHED':row.status!=='ACTIVE'?'UNPUBLISHED':row.source_revision===exam.revision?'CURRENT':'PENDING_UPDATE',publishedRevision:row?.source_revision||null,publishedAt:row?.published_at||null,definition:row?JSON.parse(row.definition_json):null}})}]});
}
export async function channelState(env:Env,id:string){return (await channelStates(env,[id]))[0]||null;}
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
 statements.push(channelAudit(env,user,exam.institution_id,'EXAM_CHANNEL_'+action.toUpperCase(),id,{channel,sourceRevision:exam.revision}));await env.DB.batch(statements);return json(await channelState(env,id));
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
 st.push(env.DB.prepare("INSERT INTO exam_channel_publications(id,exam_id,channel,status) VALUES(?,?,'LICENSED','ARCHIVED') ON CONFLICT(exam_id,channel) DO UPDATE SET status='ARCHIVED'").bind(uuid('pub'),id),env.DB.prepare("UPDATE channel_definition_publications SET status='ARCHIVED' WHERE exam_id=? AND channel='LICENSED'").bind(id));
 }
 if(scope!=='APP')st.push(env.DB.prepare("UPDATE exam_channel_publications SET status='ARCHIVED' WHERE exam_id=? AND channel='RESULT_NETWORK'").bind(id),env.DB.prepare("UPDATE channel_definition_publications SET status='ARCHIVED' WHERE exam_id=? AND channel='RESULT_NETWORK'").bind(id),env.DB.prepare("UPDATE exam_administrations SET status='ARCHIVED' WHERE exam_id=? AND channel='RESULT_NETWORK' AND status='PUBLISHED'").bind(id));
 st.push(channelAudit(env,user,exam.institution_id,'EXAM_TRASHED',id,{scope,resultsPreserved:true}));await env.DB.batch(st);return json({ok:true,scope,resultsPreserved:true});
 });
}
export async function restoreExam(env:Env,user:AuthUser,id:string){
 const owner=await one<any>(env.DB.prepare('SELECT owner_type,institution_id FROM exams WHERE id=?').bind(id));
 if(user.role!=='SUPER_ADMIN'&&!(user.role==='INSTITUTION_MANAGER'&&owner?.owner_type==='INSTITUTION'&&owner.institution_id===user.institution_id))return forbidden();return withExamOperationLock(env,id,'EXAM_RESTORE',async(env)=>{
 const r=await one<any>(env.DB.prepare('SELECT prior_status FROM exam_revision_state WHERE exam_id=? AND app_trashed_at IS NOT NULL').bind(id));if(!r)return notFound();
 await env.DB.batch([env.DB.prepare("UPDATE exams SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(r.prior_status||'DRAFT',id),env.DB.prepare('UPDATE exam_revision_state SET app_trashed_at=NULL,prior_status=NULL WHERE exam_id=?').bind(id),channelAudit(env,user,null,'EXAM_RESTORED',id,{publicationsRestored:false})]);return json({ok:true});});
}
export async function publishedDefinitions(env:Env,rows:any[]){
 const ids=[...new Set(rows.map(row=>row.exam_id||row.id).filter(Boolean))] as string[];const cache=new Map<string,any>();
 for(let start=0;start<ids.length;start+=250){const chunk=ids.slice(start,start+250);const definitions=await all<any>(env.DB.prepare(`SELECT exam_id,definition_json FROM channel_definition_publications WHERE channel='RESULT_NETWORK' AND status='ACTIVE' AND exam_id IN (${chunk.map(()=>'?').join(',')})`).bind(...chunk));for(const r of definitions)cache.set(r.exam_id,JSON.parse(r.definition_json));}
 for(const row of rows){const d=cache.get(row.exam_id||row.id);if(!d)continue;Object.assign(row,{title:d.title,publisher_name:d.publisher_name,exam_date:d.exam_date});if(row.payload_json){try{const p=JSON.parse(row.payload_json);p.exam={...p.exam,title:d.title,publisher_name:d.publisher_name,exam_date:d.exam_date};row.payload_json=JSON.stringify(p)}catch{}}}return rows;
}

function channelAudit(env:Env,user:AuthUser,institutionId:string|null,action:string,id:string,details:any){return env.DB.prepare('INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,?,?,?,?)').bind(uuid('aud'),user.id,institutionId,action,'exam',id,JSON.stringify(details));}
