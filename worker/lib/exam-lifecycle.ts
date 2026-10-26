import type { Env } from '../types';
import { all, one, uuid } from './db';
import { examReadiness } from './exam-readiness';
import { withExamOperationLock } from './exam-operation-lock';

/**
 * S029 (owner decision 26 Oct): an exam becomes active by itself once the required parts are complete —
 * the exam card and every booklet's answer key. With a start date it waits for that date; without one it is active at once.
 * A central exam then appears in both catalogues: the app (LICENSED) and the result network (RESULT_NETWORK).
 * Outcomes, PDFs and videos stay optional; they only change the light from green to yellow.
 */
export type ExamLight = 'GREEN' | 'YELLOW' | 'BLUE' | 'ORANGE' | 'RED';

const due = (startAt: string | null | undefined) => !startAt || new Date(String(startAt).includes('T') ? String(startAt) : `${String(startAt).replace(' ', 'T')}Z`).getTime() <= Date.now();

/** Statements that make an exam active and publish it to its catalogues. Shared by the button, the automatic path and the schedule. */
export function activationStatements(env: Env, exam: { id: string; owner_type: string; institution_id: string | null }, actorId: string | null, reason: string): D1PreparedStatement[] {
  const channels = ['LICENSED', ...(exam.owner_type === 'CENTRAL' && env.ENVIRONMENT !== 'staging' ? ['RESULT_NETWORK'] : [])];
  const st: D1PreparedStatement[] = [env.DB.prepare(`UPDATE exams SET status='ACTIVE',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='DRAFT'`).bind(exam.id)];
  for (const channel of channels) {
    st.push(env.DB.prepare(`INSERT INTO exam_channel_publications(id,exam_id,channel,status,published_by,published_at) VALUES(?,?,?,'ACTIVE',?,CURRENT_TIMESTAMP) ON CONFLICT(exam_id,channel) DO UPDATE SET status='ACTIVE',published_by=excluded.published_by,published_at=CURRENT_TIMESTAMP`).bind(uuid('pub'), exam.id, channel, actorId));
    st.push(env.DB.prepare(`INSERT INTO channel_definition_publications(exam_id,channel,source_revision,definition_json,published_by,status)
      SELECT e.id,?,r.revision,json_object('title',e.title,'publisher_name',e.publisher_name,'exam_date',e.exam_date,'description',e.description,'listed_by','ACTIVATION'),?,'ACTIVE'
      FROM exams e JOIN exam_revision_state r ON r.exam_id=e.id WHERE e.id=?
      ON CONFLICT(exam_id,channel) DO UPDATE SET source_revision=excluded.source_revision,definition_json=excluded.definition_json,published_by=excluded.published_by,published_at=CURRENT_TIMESTAMP,status='ACTIVE'`).bind(channel, actorId, exam.id));
  }
  st.push(env.DB.prepare('INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,?,?,?,?)')
    .bind(uuid('aud'), actorId, exam.institution_id, 'EXAM_STATUS_ACTIVE', 'exam', exam.id, JSON.stringify({ before: { status: 'DRAFT' }, after: { status: 'ACTIVE' }, channels, reason })));
  return st;
}

/** Activates a draft whose required parts are complete and whose start date has come. Quietly does nothing otherwise. */
export async function tryAutoActivate(env: Env, examId: string, actorId: string | null): Promise<boolean> {
  const exam = await one<any>(env.DB.prepare(`SELECT e.id,e.status,e.owner_type,e.institution_id,e.application_start_at,r.app_trashed_at FROM exams e LEFT JOIN exam_revision_state r ON r.exam_id=e.id WHERE e.id=?`).bind(examId));
  if (!exam || exam.status !== 'DRAFT' || exam.app_trashed_at || !due(exam.application_start_at)) return false;
  if (!(await examReadiness(env, examId)).ready_to_publish) return false;
  let done = false;
  await withExamOperationLock(env, examId, 'EXAM_AUTO_ACTIVATE', async (locked) => {
    const current = await one<any>(locked.DB.prepare(`SELECT status FROM exams WHERE id=?`).bind(examId));
    if (current?.status !== 'DRAFT') return new Response(null, { status: 204 });
    await locked.DB.batch(activationStatements(locked, exam, actorId, exam.application_start_at ? 'Başlangıç tarihi geldi; zorunlu bilgiler tamam, otomatik aktif edildi.' : 'Zorunlu bilgiler tamamlandı; otomatik aktif edildi.'));
    done = true;
    return new Response(null, { status: 204 });
  });
  return done;
}

/** Cron: drafts that were waiting for their start date. */
export async function activateDueExams(env: Env): Promise<number> {
  const rows = await all<{ id: string }>(env.DB.prepare(`SELECT id FROM exams WHERE status='DRAFT' AND application_start_at IS NOT NULL AND application_start_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') ORDER BY application_start_at LIMIT 25`));
  let n = 0;
  for (const row of rows) if (await tryAutoActivate(env, row.id, null)) n++;
  return n;
}

/** After a successful change to an exam definition, activate it when it has become complete. */
export async function afterExamDefinitionChange(request: Request, env: Env, response: Response): Promise<void> {
  if (!response.ok || !['POST', 'PUT', 'PATCH'].includes(request.method)) return;
  const path = new URL(request.url).pathname;
  const m = path.match(/^\/api\/exam-definitions(?:\/([^/]+)(?:\/([^/]+))?)?$/) || path.match(/^\/api\/platform\/exam-center\/([^/]+)\/(schedule)$/);
  if (!m || ['options', 'status'].includes(m[1] || '') || m[2] === 'status') return;
  let examId = m[1];
  if (!examId) { try { examId = (await response.clone().json<any>())?.id; } catch { return; } }
  if (!examId) return;
  const { getAuthUser } = await import('./auth');
  const user = await getAuthUser(env, request);
  if (!user || !['SUPER_ADMIN', 'INSTITUTION_MANAGER'].includes(user.role)) return;
  try { await tryAutoActivate(env, examId, user.id); } catch (error) { console.error(JSON.stringify({ event: 'exam_auto_activate_failed', examId, error: error instanceof Error ? error.message : String(error) })); }
}

/** The status light shown in exam lists. */
export function examLight(r: any): { light: ExamLight; label: string; missing: string[] } {
  if (r.app_trashed_at || ['CLOSED', 'ARCHIVED'].includes(r.status) || (r.status !== 'DRAFT' && Number(r.app_archived) === 1)) return { light: 'RED', label: r.status === 'CLOSED' ? 'Kapalı' : 'Pasif', missing: [] };
  const expected = Number(r.question_count || 0), booklets = Number(r.booklet_count || 0);
  const required: string[] = [];
  if (!Number(r.subject_count) || !expected) required.push('ders ve soru sayıları');
  if (!booklets || Number(r.answer_count || 0) < expected * booklets) required.push('cevap anahtarı');
  if (Number(r.scoring_verified) !== 1) required.push('puanlama profili');
  if (r.outcome_mode === 'OFFICIAL_REQUIRED' && Number(r.outcome_mapped_count || 0) < expected) required.push('kazanımlar (zorunlu seçili)');
  if (r.status === 'DRAFT') {
    if (required.length) return { light: 'ORANGE', label: 'Taslak', missing: required };
    return due(r.application_start_at) ? { light: 'ORANGE', label: 'Taslak', missing: ['aktifleştirme bekliyor'] } : { light: 'BLUE', label: 'Tarih bekliyor', missing: [] };
  }
  const optional: string[] = [];
  if (Number(r.outcome_mapped_count || 0) < expected) optional.push('kazanımlar');
  if (!Number(r.answer_pdf_count || 0)) optional.push('cevap anahtarı PDF');
  if (!Number(r.exam_pdf_count || 0)) optional.push('deneme PDF');
  if (!Number(r.video_count || 0)) optional.push('video çözümler');
  return optional.length ? { light: 'YELLOW', label: 'Aktif · eksik', missing: optional } : { light: 'GREEN', label: 'Aktif', missing: [] };
}
