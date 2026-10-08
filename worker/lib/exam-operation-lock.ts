import type { AuthUser, Env } from '../types';
import { all, badRequest, forbidden, json, uuid } from './db';
import { fenceExamDatabase } from './exam-write-fence';

async function lockFingerprint(token:string):Promise<string>{
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function listExamOperationLocks(env:Env,user:AuthUser):Promise<Response>{
  if(user.role!=='SUPER_ADMIN')return forbidden();
  const rows=await all<{exam_id:string;owner_token:string;operation:string;acquired_at:string;age_seconds:number|null}>(env.DB.prepare(`SELECT exam_id,owner_token,operation,acquired_at,
    max(0,CAST((julianday('now')-julianday(acquired_at))*86400 AS INTEGER)) age_seconds
    FROM exam_operation_locks ORDER BY acquired_at,exam_id LIMIT 101`));
  const locks=await Promise.all(rows.slice(0,100).map(async({owner_token,...row})=>({...row,fingerprint:await lockFingerprint(owner_token),liveness:'UNKNOWN'})));
  return json({ok:true,locks,hasMore:rows.length>100,recoveryAvailable:true});
}
export async function recoverExamOperationLock(request:Request,env:Env,user:AuthUser):Promise<Response>{
  if(user.role!=='SUPER_ADMIN')return forbidden();
  let body:any;try{body=await request.json()}catch{return badRequest('Geçerli işlem bilgisi girin.')}
  const reason=typeof body?.reason==='string'?body.reason.trim():'';
  if(reason.length<10||reason.length>1000)return badRequest('10–1000 karakterlik kurtarma gerekçesi girin.','RECOVERY_REASON_REQUIRED');
  if(typeof body.examId!=='string'||typeof body.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(body.fingerprint))return badRequest('Güncel kilit bilgisi gereklidir.');
  const conflict=()=>json({ok:false,error:{code:'EXAM_LOCK_CHANGED',message:'Kilit değişti. Listeyi yenileyin.'}},409);
  const lock=await env.DB.prepare('SELECT owner_token,operation FROM exam_operation_locks WHERE exam_id=?').bind(body.examId).first<{owner_token:string;operation:string}>();
  if(!lock||await lockFingerprint(lock.owner_token)!==body.fingerprint)return conflict();
  const result=await env.DB.batch([
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json)
      SELECT ?,?,NULL,'EXAM_OPERATION_REVOKED','exam',?,? WHERE EXISTS(SELECT 1 FROM exam_operation_locks WHERE exam_id=? AND owner_token=?)`)
      .bind(uuid('aud'),user.id,body.examId,JSON.stringify({reason,operation:lock.operation}),body.examId,lock.owner_token),
    env.DB.prepare('DELETE FROM exam_operation_locks WHERE exam_id=? AND owner_token=?').bind(body.examId,lock.owner_token),
  ]);
  if(!result[1].meta?.changes)return conflict();
  return json({ok:true,revoked:true,examId:body.examId,requiresReview:true});
}

// No automatic expiry: a slow owner must not keep writing after another
// operation steals its lock. Recovery of an abandoned owner is a separate action.
export async function withExamOperationLock(env: Env, examId: string, operation: string, run: (operationEnv:Env) => Promise<Response>): Promise<Response> {
  const token = uuid('examop');
  const acquired = await env.DB.prepare(`INSERT INTO exam_operation_locks(exam_id,owner_token,operation) VALUES(?,?,?) ON CONFLICT(exam_id) DO NOTHING`).bind(examId,token,operation).run();
  if (!acquired.meta?.changes) return json({ok:false,error:{code:'EXAM_OPERATION_BUSY',message:'Bu sınavda başka bir işlem sürüyor. Tamamlandıktan sonra tekrar deneyin.'}},409);
  try { return await run({...env,DB:fenceExamDatabase(env.DB,examId,token)}); }
  catch(error){
    if(error instanceof Error&&error.message.includes('EXAM_OPERATION_OWNERSHIP_LOST'))return json({ok:false,error:{code:'EXAM_OPERATION_OWNERSHIP_LOST',message:'İşlem sahipliği değişti. Eski işlem sonuç yazamadı; durumu yenileyin.'}},409);
    throw error;
  }
  finally {
    await env.DB.prepare('DELETE FROM exam_operation_locks WHERE exam_id=? AND owner_token=?').bind(examId,token).run();
  }
}
