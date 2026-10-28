import type { AuthUser, Env } from '../types';
import { all, badRequest, forbidden, json, notFound, one, uuid } from './db';
import { clearBatchResults } from './batch-lifecycle';

/**
 * D-S039 (owner, 28 Oct): an exam in the trash is deleted for good after 30 days, or earlier by the Super Admin (or the
 * owning school for its own exam) typing its title. A draft that never had a result is deleted at once. What stays is
 * one audit row: title, who, when, why and how many students it had.
 *
 * Results that came from uploads are removed with the uploads. An exam that has results from somewhere else (online
 * answers, an app-only flow, admissions, Nibiru) is not deleted by this; the reason is told instead.
 */
export const TRASH_DAYS = 30;
const BLOCKERS: Array<[string, string]> = [
  ['admissions_campaigns', 'kabul kampanyası'], ['nibiru_sessions', 'Nibiru oturumu'], ['personal_book_profiles', 'kişisel kitap profili'],
  ['recovery_plans', 'telafi planı'], ['target_analysis_snapshots', 'hedef analizi'], ['zero_error_booklets', 'sıfır hata kitapçığı'],
];
const norm = (v: unknown) => String(v ?? '').trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');

export async function listTrash(env: Env, user: AuthUser) {
  const own = user.role === 'SUPER_ADMIN' ? '' : `AND e.owner_type='INSTITUTION' AND e.institution_id=?`;
  const rows = await all<any>(env.DB.prepare(`SELECT e.id,e.title,e.exam_type,e.academic_year,e.owner_type,r.app_trashed_at trashed_at,
      datetime(r.app_trashed_at,'+${TRASH_DAYS} days') purge_at,(SELECT count(*) FROM exam_participants ep WHERE ep.exam_id=e.id) students
    FROM exams e JOIN exam_revision_state r ON r.exam_id=e.id WHERE r.app_trashed_at IS NOT NULL ${own} ORDER BY r.app_trashed_at DESC LIMIT 200`).bind(...(own ? [user.institution_id] : [])));
  return json({ ok: true, days: TRASH_DAYS, exams: rows });
}

async function purge(env: Env, examId: string, actorId: string | null, reason: string) {
  const exam = await one<any>(env.DB.prepare('SELECT id,title,institution_id FROM exams WHERE id=?').bind(examId));
  if (!exam) return { ok: false, code: 'NOT_FOUND', message: 'Sınav bulunamadı.' };
  const batches = await all<any>(env.DB.prepare(`SELECT b.id,f.object_key FROM scan_batches b LEFT JOIN scan_batch_files f ON f.batch_id=b.id WHERE b.exam_id=?`).bind(examId));
  let students = 0;
  for (const b of batches) students += (await clearBatchResults(env, b.id)).removed;
  const left = await one<any>(env.DB.prepare('SELECT count(*) c FROM exam_participants WHERE exam_id=?').bind(examId));
  if (Number(left?.c || 0)) return { ok: false, code: 'EXAM_HAS_OTHER_RESULTS', message: `Bu sınavda yükleme dışında ${left.c} öğrencinin sonucu var (çevrimiçi veya uygulama içi). Kalıcı silinmedi; Süper Admin ile görüşün.` };
  for (const [table, label] of BLOCKERS) {
    const r = await one<any>(env.DB.prepare(`SELECT count(*) c FROM ${table} WHERE exam_id=?`).bind(examId)).catch(() => null);
    if (Number(r?.c || 0)) return { ok: false, code: 'EXAM_IN_USE', message: `Bu sınav bir ${label} kaydında kullanılıyor. Kalıcı silinmedi.` };
  }
  for (const b of batches) if (b.object_key) { try { await env.FILES.delete(b.object_key); } catch (e) { console.error('EXAM_PURGE_FILE', e instanceof Error ? e.message : e); } }
  const admins = `(SELECT id FROM exam_administrations WHERE exam_id=?)`;
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`DELETE FROM scan_batch_files WHERE batch_id IN (SELECT id FROM scan_batches WHERE exam_id=?)`).bind(examId),
    env.DB.prepare(`DELETE FROM scan_records WHERE batch_id IN (SELECT id FROM scan_batches WHERE exam_id=?)`).bind(examId),
    env.DB.prepare(`DELETE FROM scan_batches WHERE exam_id=?`).bind(examId),
    env.DB.prepare(`DELETE FROM outcome_results WHERE exam_id=?`).bind(examId),
    env.DB.prepare(`DELETE FROM result_network_institutions WHERE administration_id IN ${admins}`).bind(examId),
    env.DB.prepare(`DELETE FROM result_artifact_preparation_jobs WHERE administration_id IN ${admins}`).bind(examId),
    env.DB.prepare(`DELETE FROM result_artifact_retirements WHERE administration_id IN ${admins}`).bind(examId),
    env.DB.prepare(`DELETE FROM result_retention_events WHERE administration_id IN ${admins}`).bind(examId),
    env.DB.prepare(`DELETE FROM result_retention_queue_jobs WHERE administration_id IN ${admins}`).bind(examId),
    env.DB.prepare(`DELETE FROM exam_administrations WHERE exam_id=?`).bind(examId),
    env.DB.prepare(`DELETE FROM exams WHERE id=?`).bind(examId),
    env.DB.prepare('INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,?,?,?,?)').bind(uuid('aud'), actorId, exam.institution_id || null, 'EXAM_PERMANENTLY_DELETED', 'exam', examId, JSON.stringify({ title: exam.title, reason, uploads: batches.length, studentsRemoved: students })),
  ];
  await env.DB.batch(statements);
  return { ok: true, title: exam.title, uploads: batches.length, students };
}

/** "Kalıcı sil": trashed exams (or drafts that never had a result) only, after typing the exam's title. */
export async function permanentlyDeleteExam(request: Request, env: Env, user: AuthUser, examId: string) {
  const exam = await one<any>(env.DB.prepare(`SELECT e.id,e.title,e.status,e.owner_type,e.institution_id,r.app_trashed_at,(SELECT count(*) FROM scan_batches b WHERE b.exam_id=e.id)+(SELECT count(*) FROM exam_participants ep WHERE ep.exam_id=e.id) used FROM exams e LEFT JOIN exam_revision_state r ON r.exam_id=e.id WHERE e.id=?`).bind(examId));
  if (!exam) return notFound();
  if (user.role !== 'SUPER_ADMIN' && !(user.role === 'INSTITUTION_MANAGER' && exam.owner_type === 'INSTITUTION' && exam.institution_id === user.institution_id)) return forbidden();
  const draftUnused = exam.status === 'DRAFT' && !Number(exam.used);
  if (!exam.app_trashed_at && !draftUnused) return badRequest('Kalıcı silmeden önce sınavı "Kaldır" ile çöp kutusuna taşıyın.', 'NOT_IN_TRASH');
  const body: any = await request.json().catch(() => ({}));
  if (!draftUnused && norm(body.confirmTitle) !== norm(exam.title)) return badRequest('Onay için sınavın adını aynen yazın.', 'CONFIRM_TITLE_MISMATCH');
  // No operation lock row here: it references the exam and would block its deletion. A running operation stops it instead.
  if (await one(env.DB.prepare('SELECT 1 x FROM exam_operation_locks WHERE exam_id=?').bind(examId))) return json({ ok: false, error: { code: 'EXAM_OPERATION_BUSY', message: 'Bu sınavda başka bir işlem sürüyor. Bittikten sonra tekrar deneyin.' } }, 409);
  const out = await purge(env, examId, user.id, String(body.reason || 'Kullanıcı kalıcı sildi'));
  if (!out.ok) return json({ ok: false, error: { code: out.code, message: out.message } }, 409);
  return json(out);
}

/** Schedule: trashed exams older than 30 days are deleted for good; one that cannot be is left and logged. */
export async function purgeTrashedExams(env: Env, limit = 10) {
  const due = await all<any>(env.DB.prepare(`SELECT exam_id FROM exam_revision_state WHERE app_trashed_at IS NOT NULL AND app_trashed_at<=datetime('now','-${TRASH_DAYS} days') LIMIT ?`).bind(limit));
  let n = 0;
  for (const d of due) {
    if (await one(env.DB.prepare('SELECT 1 x FROM exam_operation_locks WHERE exam_id=?').bind(d.exam_id))) continue;
    const out: any = await purge(env, d.exam_id, null, `Çöp kutusunda ${TRASH_DAYS} gün doldu`);
    if (out.ok) n++; else console.warn('EXAM_PURGE_SKIPPED', d.exam_id, out.code);
  }
  return n;
}
