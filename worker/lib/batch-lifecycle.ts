import type { Env } from '../types';
import { all, one, uuid } from './db';

/**
 * D-S039 (owner, 28 Oct): deleting or moving a sonuc upload.
 *
 * The results an upload produced (its students' participation, answers, nets, ranks, report rows and result access)
 * are removed at once, so reports and the live ranks never show them again. The read sheets and the original file
 * stay for 7 days so the upload can be restored and evaluated again; after that a schedule purges them.
 * Guest students the upload brought in that now take part in nothing are archived, so a later upload to the same
 * school is never matched to a student who came from a wrong file.
 */
export const RESTORE_DAYS = 7;

/** Participants the upload wrote: created from its sheets, or (two-session exams) updated by its evaluation. */
async function batchParticipants(env: Env, batchId: string): Promise<Array<{ id: string; student_id: string | null; exam_id: string }>> {
  return all<any>(env.DB.prepare(`SELECT DISTINCT ep.id,ep.student_id,ep.exam_id FROM exam_participants ep
    WHERE ep.scan_record_id IN (SELECT id FROM scan_records WHERE batch_id=?)
       OR ep.id IN (SELECT participant_id FROM scan_evaluation_progress WHERE batch_id=? AND participant_id IS NOT NULL)`).bind(batchId, batchId));
}

/** Removes everything the upload's evaluation wrote. Returns the number of students removed. */
export async function clearBatchResults(env: Env, batchId: string): Promise<{ removed: number; examId: string | null }> {
  const batch = await one<any>(env.DB.prepare('SELECT id,exam_id,institution_id FROM scan_batches WHERE id=?').bind(batchId));
  if (!batch) return { removed: 0, examId: null };
  const parts = await batchParticipants(env, batchId);
  const statements: D1PreparedStatement[] = [];
  for (let i = 0; i < parts.length; i += 400) {
    const ids = JSON.stringify(parts.slice(i, i + 400).map((p) => p.id));
    const students = JSON.stringify(parts.slice(i, i + 400).map((p) => p.student_id).filter(Boolean));
    const inP = `(SELECT value FROM json_each(?))`;
    const identities = `(SELECT id FROM result_access_identities WHERE participant_id IN ${inP})`;
    statements.push(
      env.DB.prepare(`DELETE FROM result_portal_sessions WHERE identity_id IN ${identities}`).bind(ids),
      env.DB.prepare(`DELETE FROM result_lookup_challenges WHERE identity_id IN ${identities}`).bind(ids),
      env.DB.prepare(`DELETE FROM result_ai_tips WHERE identity_id IN ${identities}`).bind(ids),
      env.DB.prepare(`DELETE FROM result_access_identities WHERE participant_id IN ${inP}`).bind(ids),
      env.DB.prepare(`DELETE FROM result_artifact_manifest WHERE participant_id IN ${inP}`).bind(ids),
      env.DB.prepare(`DELETE FROM exam_result_snapshots WHERE participant_id IN ${inP}`).bind(ids),
      env.DB.prepare(`DELETE FROM exam_result_scope_ranks WHERE participant_id IN ${inP}`).bind(ids),
      env.DB.prepare(`DELETE FROM exam_outcome_analysis_history WHERE participant_id IN ${inP}`).bind(ids),
      env.DB.prepare(`DELETE FROM tyt_optional_philosophy_answers WHERE participant_id IN ${inP}`).bind(ids),
      env.DB.prepare(`DELETE FROM tyt_optional_philosophy_results WHERE participant_id IN ${inP}`).bind(ids),
      env.DB.prepare(`DELETE FROM student_answers WHERE participant_id IN ${inP}`).bind(ids),
      env.DB.prepare(`DELETE FROM subject_results WHERE participant_id IN ${inP}`).bind(ids),
      env.DB.prepare(`DELETE FROM exam_results WHERE participant_id IN ${inP}`).bind(ids),
      env.DB.prepare(`DELETE FROM outcome_results WHERE exam_id=? AND student_id IN ${inP}`).bind(batch.exam_id, students),
      env.DB.prepare(`DELETE FROM assessment_runs WHERE source_type='EXAM' AND exam_id=? AND student_id IN ${inP}`).bind(batch.exam_id, students),
      env.DB.prepare(`DELETE FROM scan_evaluation_progress WHERE participant_id IN ${inP}`).bind(ids),
      env.DB.prepare(`UPDATE admissions_candidates SET participant_id=NULL WHERE participant_id IN ${inP}`).bind(ids),
      env.DB.prepare(`DELETE FROM exam_participants WHERE id IN ${inP}`).bind(ids),
      // Guests this upload brought in and who now take part in nothing are archived (never matched again).
      env.DB.prepare(`UPDATE student_entities SET status='ARCHIVED' WHERE status='GUEST' AND id IN ${inP} AND NOT EXISTS(SELECT 1 FROM exam_participants ep WHERE ep.student_id=student_entities.id)`).bind(students),
      env.DB.prepare(`UPDATE student_enrollments SET status='ARCHIVED' WHERE institution_id=? AND student_id IN ${inP} AND student_id IN (SELECT id FROM student_entities WHERE status='ARCHIVED')`).bind(batch.institution_id, students),
    );
  }
  statements.push(env.DB.prepare('DELETE FROM scan_evaluation_progress WHERE batch_id=?').bind(batchId));
  // Sheets that pointed at an archived guest are matched afresh when the upload is evaluated again.
  statements.push(env.DB.prepare(`UPDATE scan_records SET matched_student_id=NULL,match_status=CASE WHEN match_status='GUEST_MATCH' THEN 'NEW_GUEST' ELSE match_status END,resolution_status=CASE WHEN resolution_status='RESOLVED' AND match_status='GUEST_MATCH' THEN 'PENDING' ELSE resolution_status END
    WHERE batch_id=? AND matched_student_id IN (SELECT id FROM student_entities WHERE status='ARCHIVED')`).bind(batchId));
  for (let i = 0; i < statements.length; i += 50) await env.DB.batch(statements.slice(i, i + 50));
  return { removed: parts.length, examId: batch.exam_id };
}

export const deletedBatchSql = (alias = 'b') => `NOT EXISTS(SELECT 1 FROM scan_batch_deletions d WHERE d.batch_id=${alias}.id)`;

/** Deletes an upload: results go now, the sheets stay restorable for 7 days. */
export async function deleteBatch(env: Env, batchId: string, actorId: string, reason: string) {
  const batch = await one<any>(env.DB.prepare('SELECT id,status,institution_id,exam_id FROM scan_batches WHERE id=?').bind(batchId));
  if (!batch) return { ok: false as const, code: 'NOT_FOUND' };
  if (await one(env.DB.prepare('SELECT 1 x FROM scan_batch_deletions WHERE batch_id=?').bind(batchId))) return { ok: false as const, code: 'ALREADY_DELETED' };
  const cleared = await clearBatchResults(env, batchId);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO scan_batch_deletions(batch_id,deleted_by,reason,prior_status,participants_removed,purge_after) VALUES(?,?,?,?,?,datetime('now','+${RESTORE_DAYS} days'))`).bind(batchId, actorId, reason || null, batch.status, cleared.removed),
    env.DB.prepare(`UPDATE scan_batches SET status=CASE WHEN status='COMMITTED' THEN 'READY' ELSE status END WHERE id=?`).bind(batchId),
    env.DB.prepare('INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,?,?,?,?)').bind(uuid('aud'), actorId, batch.institution_id, 'SCAN_BATCH_DELETED', 'scan_batch', batchId, JSON.stringify({ reason, priorStatus: batch.status, participantsRemoved: cleared.removed, restorableDays: RESTORE_DAYS })),
  ]);
  return { ok: true as const, examId: batch.exam_id, removed: cleared.removed, wasEvaluated: batch.status === 'COMMITTED' };
}

/** Brings a deleted upload back (within 7 days); it is evaluated again by the person, as a new evaluation. */
export async function restoreBatch(env: Env, batchId: string, actorId: string) {
  const row = await one<any>(env.DB.prepare(`SELECT d.*,b.institution_id FROM scan_batch_deletions d JOIN scan_batches b ON b.id=d.batch_id WHERE d.batch_id=? AND d.purge_after>CURRENT_TIMESTAMP`).bind(batchId));
  if (!row) return { ok: false as const };
  await env.DB.batch([
    env.DB.prepare('DELETE FROM scan_batch_deletions WHERE batch_id=?').bind(batchId),
    env.DB.prepare('INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,?,?,?,?)').bind(uuid('aud'), actorId, row.institution_id, 'SCAN_BATCH_RESTORED', 'scan_batch', batchId, JSON.stringify({ deletedAt: row.deleted_at })),
  ]);
  return { ok: true as const };
}

/** After 7 days a deleted upload's sheets and original file are removed for good (the audit trail stays). */
export async function purgeDeletedBatches(env: Env, limit = 20) {
  const due = await all<any>(env.DB.prepare(`SELECT d.batch_id,f.object_key FROM scan_batch_deletions d LEFT JOIN scan_batch_files f ON f.batch_id=d.batch_id WHERE d.purge_after<=CURRENT_TIMESTAMP LIMIT ?`).bind(limit));
  for (const d of due) {
    await clearBatchResults(env, d.batch_id);
    if (d.object_key) { try { await env.FILES.delete(d.object_key); } catch (e) { console.error('BATCH_PURGE_FILE', e instanceof Error ? e.message : e); } }
    await env.DB.batch([
      env.DB.prepare('DELETE FROM scan_batch_files WHERE batch_id=?').bind(d.batch_id),
      env.DB.prepare('DELETE FROM scan_records WHERE batch_id=?').bind(d.batch_id),
      env.DB.prepare('DELETE FROM scan_batch_deletions WHERE batch_id=?').bind(d.batch_id),
      env.DB.prepare('DELETE FROM scan_batches WHERE id=?').bind(d.batch_id),
    ]);
  }
  return due.length;
}
