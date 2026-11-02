import type { AuthUser, Env } from '../types';
import { all, audit, badRequest, forbidden, json, one } from './db';

/** LGS/YKS sayacı (30 Oct): which national exam a grade counts down to, and the Super Admin's editing of the dates. */
export const COUNTDOWN_FOR_GRADE: Record<number, 'LGS' | 'YKS'> = { 8: 'LGS', 12: 'YKS' };

export type ExamCountdown = { code: 'LGS' | 'YKS'; title: string; date: string | null; time: string | null; status: 'PENDING' | 'OFFICIAL'; sourceLabel: string | null; sourceUrl: string | null };

/** Only for 8th and 12th graders; other grades get no countdown. A missing table (older schema) means no countdown. */
export async function countdownForGrade(env: Env, grade: unknown): Promise<ExamCountdown | null> {
  const code = COUNTDOWN_FOR_GRADE[Number(grade)];
  if (!code) return null;
  const row = await one<any>(env.DB.prepare(`SELECT code,title,exam_date,exam_time,status,source_label,source_url FROM national_exam_dates WHERE code=?`).bind(code)).catch(() => null);
  if (!row) return null;
  const official = row.status === 'OFFICIAL' && row.exam_date;
  return { code, title: row.title, date: official ? row.exam_date : null, time: official ? row.exam_time || null : null, status: official ? 'OFFICIAL' : 'PENDING', sourceLabel: row.source_label || null, sourceUrl: row.source_url || null };
}

export async function listExamDates(env: Env, user: AuthUser) {
  if (user.role !== 'SUPER_ADMIN') return forbidden('Sınav tarihlerini yalnız Süper Admin yönetir.');
  return json({ ok: true, items: await all<any>(env.DB.prepare(`SELECT * FROM national_exam_dates ORDER BY grade_level`)) });
}

/** PUT { code, title?, date: 'YYYY-MM-DD'|null, time?: 'HH:MM'|null, sourceLabel, sourceUrl? }. A date needs its source. */
export async function saveExamDate(request: Request, env: Env, user: AuthUser) {
  if (user.role !== 'SUPER_ADMIN') return forbidden('Sınav tarihlerini yalnız Süper Admin yönetir.');
  const b: any = await request.json().catch(() => ({}));
  const code = String(b.code || '').toUpperCase();
  if (code !== 'LGS' && code !== 'YKS') return badRequest('Sınav LGS ya da YKS olmalı.', 'EXAM_CODE_INVALID');
  const before = await one<any>(env.DB.prepare(`SELECT * FROM national_exam_dates WHERE code=?`).bind(code));
  if (!before) return badRequest('Sınav kaydı bulunamadı.', 'EXAM_CODE_INVALID');
  const date = b.date ? String(b.date) : null, time = b.time ? String(b.time) : null;
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)))) return badRequest('Tarih YYYY-AA-GG biçiminde olmalı.', 'DATE_INVALID');
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return badRequest('Saat SS:DD biçiminde olmalı.', 'TIME_INVALID');
  const sourceLabel = String(b.sourceLabel || '').trim().slice(0, 200) || null, sourceUrl = String(b.sourceUrl || '').trim().slice(0, 500) || null;
  if (date && !sourceLabel) return badRequest('Tarihin kaynağını yazın (ör. MEB duyurusu, ÖSYM takvimi).', 'SOURCE_REQUIRED');
  if (sourceUrl && !/^https:\/\//i.test(sourceUrl)) return badRequest('Kaynak bağlantısı https:// ile başlamalı.', 'SOURCE_URL_INVALID');
  const title = String(b.title || before.title).trim().slice(0, 80) || before.title;
  await env.DB.prepare(`UPDATE national_exam_dates SET title=?,exam_date=?,exam_time=?,status=?,source_label=?,source_url=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE code=?`)
    .bind(title, date, date ? time : null, date ? 'OFFICIAL' : 'PENDING', sourceLabel, sourceUrl, user.id, code).run();
  await audit(env.DB, user.id, null, 'NATIONAL_EXAM_DATE_SAVED', 'national_exam_dates', code, { from: { date: before.exam_date, time: before.exam_time }, to: { date, time }, sourceLabel });
  return listExamDates(env, user);
}
