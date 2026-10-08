import type {AuthUser,Env} from '../types';
import {badRequest,forbidden,json,uuid} from './db';
import {withExamOperationLock} from './exam-operation-lock';

export async function reopenNetworkResults(request:Request,env:Env,user:AuthUser,id:string):Promise<Response>{
 if(user.role!=='SUPER_ADMIN')return forbidden();
 const body:any=await request.json().catch(()=>({}));
 const reason=typeof body.reason==='string'?body.reason.trim():'';
 if(reason.length<10||reason.length>1000)return badRequest('10–1000 karakterlik düzeltme gerekçesi girin.','CORRECTION_REASON_REQUIRED');
 const version=body.expectedSnapshotVersion;
 if(!Number.isSafeInteger(version)||version<1)return badRequest('Güncel sabit sonuç sürümü gereklidir.','SNAPSHOT_VERSION_REQUIRED');
 const row=await env.DB.prepare("SELECT exam_id FROM exam_administrations WHERE id=? AND channel='RESULT_NETWORK'").bind(id).first<{exam_id:string}>();
 if(!row)return json({ok:false,error:{code:'ADMINISTRATION_NOT_FOUND',message:'Sınav yönetimi bulunamadı.'}},404);
 return withExamOperationLock(env,row.exam_id,'RESULT_NETWORK_REOPEN',async(env)=>{
  const retired=await env.DB.prepare('SELECT 1 retired FROM result_artifact_retirements WHERE administration_id=? AND retired_through_version>=?').bind(id,version).first();
  if(retired)return json({ok:false,error:{code:'RESULT_PUBLICATION_RETIRED',message:'Saklama süresi dolmuş sonuç sürümü yeniden açılamaz.'}},409);
  const guard=`EXISTS(SELECT 1 FROM exam_administrations WHERE id=? AND exam_id=? AND channel='RESULT_NETWORK' AND status='PUBLISHED' AND published_snapshot_version=?)`;
  const results=await env.DB.batch([
   env.DB.prepare(`INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) SELECT ?,?,NULL,'RESULT_NETWORK_RESULTS_REOPENED','exam_administration',?,? WHERE ${guard}`).bind(uuid('aud'),user.id,id,JSON.stringify({reason,previousVersion:version,examId:row.exam_id,publicationWithdrawn:true}),id,row.exam_id,version),
   env.DB.prepare(`DELETE FROM scan_evaluation_progress WHERE batch_id IN(SELECT id FROM scan_batches WHERE exam_id=?) AND ${guard}`).bind(row.exam_id,id,row.exam_id,version),
   env.DB.prepare(`UPDATE scan_batches SET status='READY' WHERE exam_id=? AND status='COMMITTED' AND ${guard}`).bind(row.exam_id,id,row.exam_id,version),
   env.DB.prepare(`UPDATE exam_administrations SET status='READY',published_at=NULL,ranking_frozen_at=NULL WHERE id=? AND exam_id=? AND channel='RESULT_NETWORK' AND status='PUBLISHED' AND published_snapshot_version=?`).bind(id,row.exam_id,version),
  ]);
  if(!results[3].meta?.changes)return json({ok:false,error:{code:'RESULT_PUBLICATION_STATE_CHANGED',message:'Yayın durumu veya sürümü değişti. Listeyi yenileyin.'}},409);
  return json({ok:true,id,status:'READY',previousVersion:version,publicationWithdrawn:true,requiresReevaluation:true});
 });
}
