/**
 * cozum.yildizyayin.com (owner, 27 Nov 2026: "QR'lar cevap anahtarında, girişsiz"; the address is the publisher's own,
 * "daha Türk bir şey olsun"). A student who scans the QR next to a
 * question on the printed answer sheet watches that question's solution video — no account, no login.
 *
 * Only what the editorial team has approved is public: the question must be APPROVED and its solution video approved
 * (owner: "Yalnız onaylı soruların"). A code that is not yet public says so and shows nothing else. The page never
 * shows the question's answer key or anything about who took the test; it is the video and the outcome it teaches.
 * Codes are permanent: a re-recorded video keeps its code, so every printed QR keeps working.
 */
import type { Env } from '../types';
import { all, json, one } from './db';

export const VIDEO_CODE = /^[A-Z0-9]{5,12}$/;
const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status, { 'Cache-Control': 'no-store' });

/** The public facts of one code, or null when it is not (yet) public. */
export async function publicVideo(env: Env, code: string) {
  const row = await one<any>(env.DB.prepare(`SELECT c.video_code,c.question_id,q.grade_level,s.name subject,o.id outcome_id,o.code outcome_code,o.title outcome_title,
      (SELECT a.r2_key FROM question_assets a WHERE a.question_id=q.id AND a.asset_type='SOLUTION_VIDEO' AND a.approved=1 AND a.r2_key IS NOT NULL ORDER BY a.created_at DESC LIMIT 1) r2_key
    FROM content_package_items c JOIN question_bank q ON q.id=c.question_id LEFT JOIN subjects s ON s.id=q.subject_id LEFT JOIN outcomes o ON o.id=c.outcome_id
    WHERE c.video_code=? AND q.review_status='APPROVED'`).bind(code));
  if (!row?.r2_key) return null;
  const topic = row.outcome_id ? await one<any>(env.DB.prepare(`SELECT t.r2_key FROM content_package_topics t JOIN learning_videos v ON v.id=t.learning_video_id WHERE t.outcome_id=? AND v.approved=1 AND v.active=1 LIMIT 1`).bind(row.outcome_id)) : null;
  return { code: row.video_code as string, r2Key: row.r2_key as string, topicKey: (topic?.r2_key as string) || null, gradeLevel: row.grade_level as number | null, subject: (row.subject as string) || null, outcome: row.outcome_code ? { code: row.outcome_code as string, title: row.outcome_title as string } : null };
}

/** Video codes of a booklet's questions, in its order, for the printed sheet (public ones only). */
export async function bookletVideoCodes(env: Env, documentId: string, booklet: string) {
  const rows = await all<any>(env.DB.prepare(`SELECT i.sort_order,q.id,q.correct_answer,q.review_status,c.video_code,o.code outcome_code,o.title outcome_title,
      EXISTS(SELECT 1 FROM question_assets a WHERE a.question_id=q.id AND a.asset_type='SOLUTION_VIDEO' AND a.approved=1 AND a.r2_key IS NOT NULL) has_video
    FROM studio_document_items i JOIN question_bank q ON q.id=i.question_id LEFT JOIN content_package_items c ON c.question_id=q.id LEFT JOIN outcomes o ON o.id=c.outcome_id
    WHERE i.document_id=? AND i.booklet_code=? ORDER BY i.sort_order`).bind(documentId, booklet));
  return rows.map((r) => ({ answer: String(r.correct_answer || '').trim().toUpperCase(), code: r.video_code && r.review_status === 'APPROVED' && Number(r.has_video) ? String(r.video_code) : null, outcome: r.outcome_code ? { code: String(r.outcome_code), title: String(r.outcome_title || '') } : null }));
}

/**
 * Where printed QR codes point. With the dedicated address set (VIDEO_PUBLIC_ORIGIN, e.g. https://cozum.yildizyayin.com,
 * only once it is attached to the Worker) a code sits right after the host: cozum.yildizyayin.com/K7M2QPA. Until then
 * the app's own host with /c/: app.anunex.com/c/K7M2QPA. Both addresses keep working for ever.
 */
export function videoOrigin(env: Env, request: Request) {
  const v = String((env as any).VIDEO_PUBLIC_ORIGIN || '').trim().replace(/\/+$/, '');
  return /^https:\/\/[a-z0-9.-]+$/i.test(v) ? v : `${new URL(request.url).origin}/c`;
}

/** GET /api/public/video/:code (facts) and …/:code/solution | …/:code/topic (the stream, with byte ranges). */
export async function handlePublicVideo(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/api\/public\/video\/([^/]+)(?:\/(solution|topic))?$/);
  if (!m) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
  const code = decodeURIComponent(m[1]).toUpperCase();
  if (!VIDEO_CODE.test(code)) return fail(404, 'VIDEO_NOT_FOUND', 'Bu kodun videosu bulunamadı.');
  const v = await publicVideo(env, code);
  if (!v) return fail(404, 'VIDEO_NOT_PUBLIC', 'Bu sorunun çözüm videosu henüz yayında değil. Biraz sonra yeniden dene.');
  if (!m[2]) return json({ ok: true, video: { code: v.code, gradeLevel: v.gradeLevel, subject: v.subject, outcome: v.outcome, hasTopic: !!v.topicKey } });
  const key = m[2] === 'topic' ? v.topicKey : v.r2Key;
  if (!key) return fail(404, 'VIDEO_NOT_PUBLIC', 'Bu kazanımın konu videosu henüz yayında değil.');
  const { stream } = await import('./smart-board');
  return stream(env, request, key, 'video/mp4', 'public, max-age=3600');
}
