import type { AuthUser, Env } from '../types';
import { one } from './db';

/**
 * Türkiye geneli takvim (owner, 3 Nov). For a national exam the Super Admin sets the application window, the time the
 * results are released and the time uploads are evaluated again. Between release and resume uploads are accepted but
 * not evaluated, and ranks are not rewritten, so the release evening only serves reads. Afterwards everything is as
 * before: the waiting uploads are evaluated by the result worker and the live ranks take them in.
 */
export type ResultSchedule = { applicationStartAt: string | null; applicationEndAt: string | null; releaseAt: string | null; resumeAt: string | null };
const KEYS: Array<[keyof ResultSchedule, string]> = [['applicationStartAt', 'Uygulama başlangıcı'], ['applicationEndAt', 'Uygulama bitişi'], ['releaseAt', 'Sonuç açıklama zamanı'], ['resumeAt', 'Yüklemenin yeniden açılacağı zaman']];

function iso(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(String(value).trim());
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function validateResultSchedule(input: any, now = Date.now(), current?: Partial<ResultSchedule>): { ok: true; value: ResultSchedule } | { ok: false; message: string } {
  const value: any = {};
  for (const [key, label] of KEYS) { const v = iso(input?.[key]); if (v === undefined) return { ok: false, message: `${label} geçersiz.` }; value[key] = v; }
  const s = value as ResultSchedule, t = (x: string | null) => (x ? Date.parse(x) : null);
  if (s.applicationStartAt && s.applicationEndAt && t(s.applicationStartAt)! > t(s.applicationEndAt)!) return { ok: false, message: 'Uygulama başlangıcı bitişten sonra olamaz.' };
  if (s.applicationEndAt && s.releaseAt && t(s.applicationEndAt)! > t(s.releaseAt)!) return { ok: false, message: 'Sonuç açıklama zamanı uygulama bitişinden önce olamaz.' };
  if (s.resumeAt && !s.releaseAt) return { ok: false, message: 'Yüklemenin yeniden açılacağı zaman için önce sonuç açıklama zamanı girin.' };
  if (s.releaseAt && s.resumeAt && t(s.resumeAt)! <= t(s.releaseAt)!) return { ok: false, message: 'Yükleme, sonuç açıklandıktan sonra yeniden açılmalıdır.' };
  if (s.releaseAt && s.resumeAt && t(s.resumeAt)! - t(s.releaseAt)! > 24 * 3600000) return { ok: false, message: 'Yükleme beklemesi en fazla 24 saat olabilir.' };
  // a new release time must be ahead of now: a past one would publish at once without anyone choosing that
  if (s.releaseAt && s.releaseAt !== (current?.releaseAt ?? null) && t(s.releaseAt)! <= now) return { ok: false, message: 'Sonuç açıklama zamanı ileri bir tarih olmalıdır.' };
  return { ok: true, value: s };
}

/** True while uploads wait (release ≤ now < resume). `alias` is an exam_administrations alias. */
export const pausedSql = (alias: string) => `(${alias}.result_release_at IS NOT NULL AND ${alias}.upload_resume_at IS NOT NULL AND julianday(${alias}.result_release_at)<=julianday('now') AND julianday('now')<julianday(${alias}.upload_resume_at))`;

export async function uploadPause(env: Env, examId: string): Promise<{ paused: boolean; resumeAt: string | null; releaseAt: string | null }> {
  const row = await one<any>(env.DB.prepare(`SELECT ea.result_release_at,ea.upload_resume_at,${pausedSql('ea')} paused FROM exam_administrations ea WHERE ea.exam_id=? AND ea.channel='RESULT_NETWORK' AND ea.status IN ('UPLOADING','READY','PUBLISHED') ORDER BY ea.created_at DESC LIMIT 1`).bind(examId));
  return { paused: !!Number(row?.paused || 0), resumeAt: row?.upload_resume_at || null, releaseAt: row?.result_release_at || null };
}

const TR = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
export const trTime = (value: string | null) => (value ? TR.format(new Date(value)) : '');
export const pauseMessage = (resumeAt: string | null) => `Sonuçlar açıklanıyor. Yüklemeniz alındı; ${trTime(resumeAt)} sonrasında otomatik değerlendirilecek. Bu öğrenciler Türkiye geneli sıralamaya o zaman girer.`;

export async function queueDeferredEvaluation(env: Env, batch: { id: string; exam_id: string; institution_id: string | null }, user: AuthUser, effective: AuthUser) {
  await env.DB.prepare(`INSERT INTO result_deferred_evaluations(batch_id,exam_id,institution_id,actor_user_id,effective_json) VALUES(?,?,?,?,?)
    ON CONFLICT(batch_id) DO UPDATE SET done_at=NULL,outcome=NULL,attempts=0,last_error=NULL,actor_user_id=excluded.actor_user_id,effective_json=excluded.effective_json WHERE result_deferred_evaluations.done_at IS NOT NULL`)
    .bind(batch.id, batch.exam_id, batch.institution_id, user.id, JSON.stringify(effective)).run();
}
