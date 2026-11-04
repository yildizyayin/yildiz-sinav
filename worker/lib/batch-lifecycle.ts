import type { Env } from '../types';
import { all, one, uuid } from './db';

/**
 * D-S039 (owner, 28 Oct): deleting or moving a sonuc upload.
 *
 * The results an upload produced (its students' participation, answers, nets, ranks, report rows and result access)
 * are removed at once, so reports and the live ranks never show them again. Owner (3 Nov): the read sheets and the
 * original file go at the same time — a deleted upload cannot be restored.
 * Guest students the upload brought in that now take part in nothing are archived, so a later upload to the same
 * school is never matched to a student who came from a wrong file.
 * Owner (4 Nov, KVKK): such archived students are then deleted for good (name, number, T.C., enrolment and the learning
 * data derived from the deleted results); the learning evidence the upload's exam gave its students goes as well.
 */
/** Kept for older readers; deleting is permanent since 3 Nov. */
export const RESTORE_DAYS = 0;

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
      env.DB.prepare(`DELETE FROM learning_evidence WHERE source_type='EXAM' AND source_id=? AND student_id IN ${inP}`).bind(batch.exam_id, students),
      env.DB.prepare(`DELETE FROM student_learning_state WHERE student_id IN ${inP} AND NOT EXISTS(SELECT 1 FROM learning_evidence le WHERE le.student_id=student_learning_state.student_id AND le.node_id=student_learning_state.node_id)`).bind(students),
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
  const studentIds = parts.map((p) => p.student_id).filter(Boolean) as string[];
  for (let i = 0; i < studentIds.length; i += 400) await purgeArchivedStudents(env, studentIds.slice(i, i + 400), 400);
  return { removed: parts.length, examId: batch.exam_id };
}

/**
 * Owner (4 Nov, KVKK): an archived student who takes part in nothing and has no account, parent link or read sheet is
 * deleted for good. Rows that cascade (learning state, evidence, profiles) go with it. If anything else still points at
 * the student, the personal data is erased instead (name, T.C., student number). Runs right after a deletion and on
 * every scheduled run for anything left over.
 */
export async function purgeArchivedStudents(env: Env, ids?: string[], limit = 100): Promise<{ deleted: number; anonymized: number }> {
  const scope = ids ? ` AND s.id IN (SELECT value FROM json_each(?))` : '';
  const rows = await all<{ id: string }>(env.DB.prepare(`SELECT s.id FROM student_entities s WHERE s.status='ARCHIVED'${scope}
    AND NOT EXISTS(SELECT 1 FROM exam_participants ep WHERE ep.student_id=s.id)
    AND NOT EXISTS(SELECT 1 FROM users u WHERE u.student_id=s.id)
    AND NOT EXISTS(SELECT 1 FROM parent_student_links l WHERE l.student_id=s.id)
    AND NOT EXISTS(SELECT 1 FROM scan_records r WHERE r.matched_student_id=s.id)
    AND NOT (s.first_name='Silinmiş' AND s.last_name='Öğrenci')
    LIMIT ?`).bind(...(ids ? [JSON.stringify(ids)] : []), limit));
  let deleted = 0, anonymized = 0;
  for (const { id } of rows) {
    try {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM guest_profiles WHERE student_id=?').bind(id),
        env.DB.prepare('DELETE FROM student_enrollments WHERE student_id=?').bind(id),
        env.DB.prepare('DELETE FROM student_entities WHERE id=?').bind(id),
      ]);
      deleted++;
    } catch {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM guest_profiles WHERE student_id=?').bind(id),
        env.DB.prepare('UPDATE student_enrollments SET student_number=NULL WHERE student_id=?').bind(id),
        env.DB.prepare(`UPDATE student_entities SET first_name='Silinmiş',last_name='Öğrenci',normalized_name='silinmis ogrenci',tckn=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id),
      ]);
      anonymized++;
    }
  }
  if (deleted || anonymized) await env.DB.prepare('INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,?,?,?,?)').bind(uuid('aud'), null, null, 'ARCHIVED_STUDENTS_PURGED', 'student_entity', null, JSON.stringify({ deleted, anonymized })).run();
  return { deleted, anonymized };
}

export const deletedBatchSql = (alias = 'b') => `NOT EXISTS(SELECT 1 FROM scan_batch_deletions d WHERE d.batch_id=${alias}.id)`;

/**
 * Owner (3 Nov): deleting an upload is permanent and immediate — its results, read sheets and original file go at once;
 * only the audit row (who, when, why, how many students) stays.
 */
export async function deleteBatch(env: Env, batchId: string, actorId: string, reason: string) {
  const batch = await one<any>(env.DB.prepare('SELECT id,status,institution_id,exam_id FROM scan_batches WHERE id=?').bind(batchId));
  if (!batch) return { ok: false as const, code: 'NOT_FOUND' };
  const cleared = await clearBatchResults(env, batchId);
  await purgeBatchRows(env, batchId);
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,?,?,?,?)').bind(uuid('aud'), actorId, batch.institution_id, 'SCAN_BATCH_DELETED', 'scan_batch', batchId, JSON.stringify({ reason, priorStatus: batch.status, participantsRemoved: cleared.removed, examId: batch.exam_id, permanent: true })).run();
  return { ok: true as const, examId: batch.exam_id, removed: cleared.removed, wasEvaluated: batch.status === 'COMMITTED' };
}

/** A deleted upload cannot come back (owner, 3 Nov). Kept so old links answer clearly. */
export async function restoreBatch(_env: Env, _batchId: string, _actorId: string) {
  return { ok: false as const };
}

/** Removes the upload's own rows and its original file. */
async function purgeBatchRows(env: Env, batchId: string) {
  const file = await one<any>(env.DB.prepare('SELECT object_key FROM scan_batch_files WHERE batch_id=?').bind(batchId));
  if (file?.object_key) { try { await env.FILES.delete(file.object_key); } catch (e) { console.error('BATCH_PURGE_FILE', e instanceof Error ? e.message : e); } }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM result_deferred_evaluations WHERE batch_id=?').bind(batchId),
    env.DB.prepare('DELETE FROM scan_evaluation_progress WHERE batch_id=?').bind(batchId),
    env.DB.prepare('DELETE FROM scan_batch_files WHERE batch_id=?').bind(batchId),
    env.DB.prepare('DELETE FROM scan_records WHERE batch_id=?').bind(batchId),
    env.DB.prepare('DELETE FROM scan_batch_deletions WHERE batch_id=?').bind(batchId),
    env.DB.prepare('DELETE FROM scan_batches WHERE id=?').bind(batchId),
  ]);
}

/** Uploads deleted before 3 Nov waited 7 days; they are now removed for good on the next run (the audit trail stays). */
export async function purgeDeletedBatches(env: Env, limit = 20) {
  const due = await all<any>(env.DB.prepare(`SELECT batch_id FROM scan_batch_deletions LIMIT ?`).bind(limit));
  for (const d of due) { await clearBatchResults(env, d.batch_id); await purgeBatchRows(env, d.batch_id); }
  return due.length;
}
