import type { AuthUser, Env } from '../types';
import { all, forbidden, json, uuid } from './db';
import { fenceExamDatabase } from './exam-write-fence';

export async function listExamOperationLocks(env:Env,user:AuthUser):Promise<Response>{
  if(user.role!=='SUPER_ADMIN')return forbidden();
  const rows=await all<{exam_id:string;operation:string;acquired_at:string;age_seconds:number|null}>(env.DB.prepare(`SELECT exam_id,operation,acquired_at,
    max(0,CAST((julianday('now')-julianday(acquired_at))*86400 AS INTEGER)) age_seconds
    FROM exam_operation_locks ORDER BY acquired_at,exam_id LIMIT 101`));
  return json({ok:true,locks:rows.slice(0,100).map(row=>({...row,liveness:'UNKNOWN'})),hasMore:rows.length>100,recoveryAvailable:false});
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
