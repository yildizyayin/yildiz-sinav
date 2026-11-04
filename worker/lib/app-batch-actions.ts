import type { AuthUser, Env } from '../types';
import { all, badRequest, forbidden, json, notFound, one } from './db';
import { canEvaluateExam } from './permissions';
import { withExamOperationLock } from './exam-operation-lock';

/**
 * Wrong uploads in the app (owner, 3 Nov): the staff who evaluate an exam see that exam's uploads for their
 * institution and can delete one for good (owner, 3 Nov: results, sheets and file go at once).
 * The same lifecycle as sonuc (D-S039), so both products agree on what a deleted upload is.
 */
/** Same rule as the app's evaluation screen: the Super Admin everywhere, a manager in their own institution. */
async function userCanAccessInstitution(_db: D1Database, user: AuthUser, institutionId: string) { return user.role === 'SUPER_ADMIN' || user.institution_id === institutionId; }

async function batchFor(env: Env, user: AuthUser, batchId: string) {
  if (!canEvaluateExam(user.role)) return forbidden();
  const batch = await one<any>(env.DB.prepare('SELECT id,exam_id,institution_id,status FROM scan_batches WHERE id=?').bind(batchId));
  if (!batch) return notFound('Yükleme bulunamadı.');
  if (!(await userCanAccessInstitution(env.DB, user, batch.institution_id))) return forbidden();
  return batch;
}

export async function listAppUploads(env: Env, user: AuthUser, examId: string, url: URL): Promise<Response> {
  if (!canEvaluateExam(user.role)) return forbidden();
  const institutionId = user.role === 'SUPER_ADMIN' ? String(url.searchParams.get('institutionId') || '') : String(user.institution_id || '');
  if (!institutionId) return badRequest('Kurum seçin.', 'INSTITUTION_REQUIRED');
  if (!(await userCanAccessInstitution(env.DB, user, institutionId))) return forbidden();
  const rows = await all<any>(env.DB.prepare(`SELECT b.id,b.status,b.source_type,b.created_at,u.display_name created_by_name,
    (SELECT count(*) FROM scan_records r WHERE r.batch_id=b.id) total,del.deleted_at,del.purge_after,del.reason deleted_reason
    FROM scan_batches b LEFT JOIN users u ON u.id=b.created_by LEFT JOIN scan_batch_deletions del ON del.batch_id=b.id
    WHERE b.exam_id=? AND b.institution_id=? ORDER BY b.created_at DESC,b.rowid DESC LIMIT 200`).bind(examId, institutionId));
  return json({ ok: true, uploads: rows });
}

/** After results left an exam, both publications (app and Sonuç Ağı) are written again without them. */
async function refreshPublications(env: Env, examId: string, actorId: string) {
  const { syncAppResults } = await import('./platform-expansion');
  await syncAppResults(env, examId, actorId).catch((e) => console.error('APP_REFRESH_AFTER_DELETE', e instanceof Error ? e.message : e));
  const { republishAfterRemoval } = await import('../result-network-entry');
  await republishAfterRemoval(env, examId, actorId).catch((e) => console.error('NETWORK_REFRESH_AFTER_DELETE', e instanceof Error ? e.message : e));
}

export async function deleteAppUpload(request: Request, env: Env, user: AuthUser, batchId: string): Promise<Response> {
  const batch = await batchFor(env, user, batchId); if (batch instanceof Response) return batch;
  const body: any = await request.json().catch(() => ({})); const reason = String(body.reason || '').trim();
  if (batch.status === 'COMMITTED' && reason.length < 5) return badRequest('Değerlendirilmiş yüklemeyi silmek için kısa bir neden yazın (en az 5 harf).', 'DELETE_REASON_REQUIRED');
  const { deleteBatch } = await import('./batch-lifecycle');
  const r = await withExamOperationLock(env, batch.exam_id, 'APP_BATCH_DELETE', async (env) => {
    const done = await deleteBatch(env, batchId, user.id, reason);
    return done.ok ? json(done) : json({ ok: false, error: { code: done.code, message: done.code === 'ALREADY_DELETED' ? 'Bu yükleme zaten silinmiş.' : 'Yükleme bulunamadı.' } }, done.code === 'NOT_FOUND' ? 404 : 409);
  });
  if (!r.ok) return r;
  const out: any = await r.json();
  if (out.wasEvaluated) await refreshPublications(env, batch.exam_id, user.id);
  return json({ ...out, permanent: true });
}

export async function restoreAppUpload(env: Env, user: AuthUser, batchId: string): Promise<Response> {
  const batch = await batchFor(env, user, batchId); if (batch instanceof Response) return batch;
  const { restoreBatch } = await import('./batch-lifecycle');
  const r = await restoreBatch(env, batchId, user.id);
  return r.ok ? json({ ok: true }) : json({ ok: false, error: { code: 'RESTORE_NOT_AVAILABLE', message: 'Silinen yükleme geri alınamaz; dosyayı yeniden yükleyin.' } }, 410);
}
