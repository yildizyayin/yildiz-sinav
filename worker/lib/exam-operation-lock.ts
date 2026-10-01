import type { Env } from '../types';
import { json, uuid } from './db';

// No automatic expiry: a slow owner must not keep writing after another
// operation steals its lock. Recovery of an abandoned owner is a separate action.
export async function withExamOperationLock(env: Env, examId: string, operation: string, run: () => Promise<Response>): Promise<Response> {
  const token = uuid('examop');
  const acquired = await env.DB.prepare(`INSERT INTO exam_operation_locks(exam_id,owner_token,operation) VALUES(?,?,?) ON CONFLICT(exam_id) DO NOTHING`).bind(examId,token,operation).run();
  if (!acquired.meta?.changes) return json({ok:false,error:{code:'EXAM_OPERATION_BUSY',message:'Bu sınavda başka bir işlem sürüyor. Tamamlandıktan sonra tekrar deneyin.'}},409);
  try { return await run(); }
  finally {
    await env.DB.prepare('DELETE FROM exam_operation_locks WHERE exam_id=? AND owner_token=?').bind(examId,token).run();
  }
}
