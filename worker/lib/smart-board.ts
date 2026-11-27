/**
 * Akıllı tahta (owner, 27 Nov 2026: "akıllı tahta çok önemli … telefondan tabletten pcden pardüsten her yerden").
 * One call gives the board everything a lesson needs for a test: each question with its images, the answer, the
 * written solution split into steps, the solution video and the outcome's topic video. Media come from ANUNEX's own
 * storage through this Worker (with byte ranges, so a video can be sought and starts at once on any browser).
 * Only the teacher who made the test (or the institution's manager / Super Admin) opens it; a topic video shows only
 * once it is approved.
 */
import type { AuthUser, Env } from '../types';
import { all, forbidden, json, notFound, one } from './db';

const STAFF = ['SUPER_ADMIN', 'INSTITUTION_MANAGER', 'TEACHER'];
const parse = <T>(s: unknown, d: T): T => { try { return JSON.parse(String(s ?? '')) as T; } catch { return d; } };

async function featureOn(env: Env, user: AuthUser, key: string) {
  if (user.role === 'SUPER_ADMIN') return true;
  const r = await one<any>(env.DB.prepare(`SELECT COALESCE(o.enabled,f.enabled_default) enabled FROM platform_features f LEFT JOIN institution_feature_overrides o ON o.feature_key=f.feature_key AND o.institution_id=? WHERE f.feature_key=?`).bind(user.institution_id, key));
  return Number(r?.enabled || 0) === 1;
}
async function boardDoc(env: Env, user: AuthUser, id: string) {
  if (!STAFF.includes(user.role)) return forbidden('Tahta yalnız öğretmen ve yöneticiler içindir.');
  if (!(await featureOn(env, user, 'STUDIO'))) return json({ ok: false, error: { code: 'FEATURE_DISABLED', message: 'Bu özellik kurumunuz için henüz etkin değil.', feature: 'STUDIO' } }, 403);
  const doc = await one<any>(env.DB.prepare(`SELECT * FROM studio_documents WHERE id=? AND status<>'ARCHIVED'`).bind(id));
  if (!doc) return notFound('Test bulunamadı.');
  if (user.role !== 'SUPER_ADMIN' && doc.institution_id !== user.institution_id) return forbidden();
  if (user.role === 'TEACHER' && doc.created_by !== user.id) return forbidden('Öğretmen yalnız kendi testini tahtada açabilir.');
  return doc;
}

/** A written solution becomes steps the class reveals one by one: by line, else by sentence (at most 6). */
export function solutionSteps(text: string | null | undefined): string[] {
  const t = String(text || '').trim();
  if (!t) return [];
  const lines = t.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  const parts = lines.length > 1 ? lines : t.split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ0-9])/).map((x) => x.trim()).filter(Boolean);
  if (parts.length <= 6) return parts;
  const size = Math.ceil(parts.length / 6), out: string[] = [];
  for (let k = 0; k < parts.length; k += size) out.push(parts.slice(k, k + size).join(' '));
  return out;
}

async function lesson(env: Env, doc: any) {
  const media = (asset: string) => `/api/board/${encodeURIComponent(doc.id)}/media/${encodeURIComponent(asset)}`;
  const rows = await all<any>(env.DB.prepare(`SELECT i.sort_order position,q.id,q.stem_text stem,q.options_json,q.correct_answer answer,q.solution_text solution
    FROM studio_document_items i JOIN question_bank q ON q.id=i.question_id WHERE i.document_id=? AND i.booklet_code='A' ORDER BY i.sort_order`).bind(doc.id));
  const ids = rows.map((r) => r.id);
  const marks = ids.map(() => '?').join(',');
  const assets = ids.length ? await all<any>(env.DB.prepare(`SELECT id,question_id,asset_type,placement,option_label,alt_text,r2_key,external_url,mime_type FROM question_assets
    WHERE question_id IN (${marks}) AND approved=1 ORDER BY sort_order,created_at`).bind(...ids)) : [];
  const outcomes = ids.length ? await all<any>(env.DB.prepare(`SELECT l.question_id,o.id,o.code,o.title FROM question_learning_links l JOIN outcomes o ON l.node_id='ln_'||o.id WHERE l.question_id IN (${marks})`).bind(...ids)) : [];
  const outcomeIds = [...new Set(outcomes.map((o) => o.id))];
  const topics = outcomeIds.length ? await all<any>(env.DB.prepare(`SELECT t.outcome_id,v.duration_seconds FROM content_package_topics t JOIN learning_videos v ON v.id=t.learning_video_id
    WHERE t.outcome_id IN (${outcomeIds.map(() => '?').join(',')}) AND v.approved=1 AND v.active=1`).bind(...outcomeIds)) : [];
  const items = rows.map((r) => {
    const own = assets.filter((a) => a.question_id === r.id);
    const opts = parse<any[]>(r.options_json, []);
    const sol = own.find((a) => a.asset_type === 'SOLUTION_VIDEO' && (a.r2_key || /^https:\/\//.test(String(a.external_url || ''))));
    const outcome = outcomes.find((o) => o.question_id === r.id) || null;
    const topic = outcome && topics.find((t) => t.outcome_id === outcome.id);
    const image = (a: any) => ({ id: a.id, url: a.r2_key ? media(a.id) : a.external_url, alt: a.alt_text || 'Soru görseli' });
    return {
      position: r.position, id: r.id, stem: String(r.stem || ''), answer: String(r.answer || ''),
      options: (Array.isArray(opts) ? opts : []).map((o: any, k: number) => {
        const label = typeof o === 'string' ? 'ABCDE'[k] : String(o.label || 'ABCDE'[k]);
        const img = own.find((a) => a.asset_type === 'IMAGE' && a.placement === 'OPTION' && a.option_label === label);
        return { label, text: typeof o === 'string' ? o : String(o.text ?? ''), image: img ? image(img) : null };
      }),
      images: own.filter((a) => a.asset_type === 'IMAGE' && a.placement !== 'OPTION' && a.placement !== 'SOLUTION' && (a.r2_key || a.external_url)).map(image),
      solution: r.solution || null, steps: solutionSteps(r.solution),
      solutionVideo: sol ? (sol.r2_key ? { kind: 'FILE', url: media(sol.id) } : { kind: 'LINK', url: sol.external_url }) : null,
      outcome: outcome ? { code: outcome.code, title: outcome.title } : null,
      topicVideo: topic ? { url: `/api/board/${encodeURIComponent(doc.id)}/topic/${encodeURIComponent(outcome!.id)}`, seconds: topic.duration_seconds || null } : null,
    };
  });
  const { lastCheck } = await import('./teacher-tests');
  return json({ ok: true, test: { id: doc.id, title: doc.title, gradeLevel: doc.grade_level }, checked: !!(await lastCheck(env, doc.id)), items });
}

/** Streams a stored file with HTTP byte ranges (seeking, instant start, Safari/iPad need it). */
async function stream(env: Env, request: Request, key: string, mime: string) {
  const head = await env.FILES.head(key);
  if (!head) return notFound('Dosya bulunamadı.');
  const size = head.size;
  const range = request.headers.get('Range');
  const base: Record<string, string> = { 'Content-Type': mime || head.httpMetadata?.contentType || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' };
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    let end = m[1] && m[2] ? Number(m[2]) : size - 1;
    end = Math.min(end, size - 1);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${size}` } });
    const obj = await env.FILES.get(key, { range: { offset: start, length: end - start + 1 } });
    if (!obj) return notFound('Dosya bulunamadı.');
    return new Response(obj.body, { status: 206, headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } });
  }
  const obj = await env.FILES.get(key);
  if (!obj) return notFound('Dosya bulunamadı.');
  return new Response(obj.body, { status: 200, headers: { ...base, 'Content-Length': String(size) } });
}

export async function handleSmartBoard(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/api\/board\/([^/]+)(?:\/(media|topic)\/([^/]+))?$/);
  if (!m) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Bu yöntem desteklenmiyor.' } }, 405);
  const { getAuthUser } = await import('./auth');
  const user: AuthUser | null = await getAuthUser(env, request);
  if (!user) return json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Oturum açmanız gerekiyor.' } }, 401);
  const doc = await boardDoc(env, user, decodeURIComponent(m[1]));
  if (doc instanceof Response) return doc;
  if (!m[2]) return lesson(env, doc);
  const ref = decodeURIComponent(m[3]);
  if (m[2] === 'media') {
    const a = await one<any>(env.DB.prepare(`SELECT a.r2_key,a.mime_type FROM question_assets a JOIN studio_document_items i ON i.question_id=a.question_id WHERE a.id=? AND i.document_id=? AND a.approved=1 AND a.r2_key IS NOT NULL LIMIT 1`).bind(ref, doc.id));
    if (!a) return notFound('Dosya bulunamadı.');
    return stream(env, request, a.r2_key, a.mime_type);
  }
  const t = await one<any>(env.DB.prepare(`SELECT t.r2_key FROM content_package_topics t JOIN learning_videos v ON v.id=t.learning_video_id
    WHERE t.outcome_id=? AND v.approved=1 AND v.active=1 AND EXISTS(SELECT 1 FROM studio_document_items i JOIN question_learning_links l ON l.question_id=i.question_id WHERE i.document_id=? AND l.node_id='ln_'||t.outcome_id) LIMIT 1`).bind(ref, doc.id));
  if (!t) return notFound('Konu videosu bulunamadı.');
  return stream(env, request, t.r2_key, 'video/mp4');
}
