/**
 * Pilot okul başvurusu (owner, 12 Nov 2026). The anunex.com form posts here (app.anunex.com, cross-origin from
 * anunex.com only); the Super Admin sees the list under "Pilot Başvuruları" and gets a notification for each one.
 * KVKK: only the contact details needed to call the school back; the applicant ticks the notice (version recorded);
 * the IP is kept only as a salted hash for abuse limits. Limits: 3 a day per phone, 10 a day per connection.
 */
import type { Env } from '../types';
import { all, audit, json, one, uuid } from './db';

export const PILOT_KVKK_VERSION = 'pilot-2026-11-12';
const ORIGINS = new Set(['https://anunex.com', 'https://www.anunex.com', 'http://localhost:5173', 'http://127.0.0.1:5173']);
const TYPES = ['DEVLET_OKULU', 'OZEL_OKUL', 'KURS', 'ETUT_MERKEZI', 'DIGER'];
const STATUSES = ['NEW', 'CONTACTED', 'PILOT', 'DECLINED'];
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function cors(request: Request, res: Response) {
  const origin = request.headers.get('Origin');
  const h = new Headers(res.headers);
  if (origin && ORIGINS.has(origin)) { h.set('access-control-allow-origin', origin); h.set('vary', 'Origin'); }
  return new Response(res.body, { status: res.status, headers: h });
}
const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);

/** Turkish mobile/landline in any common writing → 05XXXXXXXXX, else null. */
export function normalizePhone(v: string) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('90') && d.length === 12) d = '0' + d.slice(2);
  if (d.length === 10 && d.startsWith('5')) d = '0' + d;
  return /^0[2-5]\d{9}$/.test(d) ? d : null;
}

async function hashIp(env: Env, ip: string) {
  const data = new TextEncoder().encode(`${(env as any).SESSION_SECRET || 'anunex'}|pilot|${ip}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function apply(request: Request, env: Env) {
  const b = await request.json().catch(() => null) as any;
  if (!b || typeof b !== 'object') return fail(400, 'VALIDATION_ERROR', 'Form okunamadı.');
  if (text(b.website, 200)) return json({ ok: true }, 201); // honeypot: bots fill the hidden field
  const institutionName = text(b.institutionName, 160), city = text(b.city, 60), contactName = text(b.contactName, 120);
  const type = TYPES.includes(b.institutionType) ? b.institutionType : null;
  const phone = normalizePhone(text(b.phone, 30));
  const email = text(b.email, 160).toLowerCase();
  if (!institutionName || !city || !contactName || !type) return fail(400, 'VALIDATION_ERROR', 'Kurum adı, il, kurum türü ve yetkili adı gerekli.');
  if (!phone) return fail(400, 'VALIDATION_ERROR', 'Geçerli bir telefon numarası yazın (ör. 0532 123 45 67).');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(400, 'VALIDATION_ERROR', 'E-posta adresi geçersiz.');
  if (b.kvkk !== true) return fail(400, 'KVKK_REQUIRED', 'Devam etmek için aydınlatma metnini okuduğunuzu onaylayın.');
  const ipHash = await hashIp(env, request.headers.get('CF-Connecting-IP') || 'unknown');
  const byPhone = await one<any>(env.DB.prepare(`SELECT count(*) n FROM pilot_applications WHERE phone=? AND created_at>=datetime('now','-1 day')`).bind(phone));
  const byIp = await one<any>(env.DB.prepare(`SELECT count(*) n FROM pilot_applications WHERE ip_hash=? AND created_at>=datetime('now','-1 day')`).bind(ipHash));
  if (Number(byPhone?.n) >= 3 || Number(byIp?.n) >= 10) return fail(429, 'TOO_MANY', 'Başvurunuz bize ulaştı; kısa süre içinde sizi arayacağız.');
  const id = uuid('pil');
  await env.DB.prepare(`INSERT INTO pilot_applications(id,institution_name,city,institution_type,student_count,contact_name,phone,email,message,kvkk_version,ip_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, institutionName, city, type, text(b.studentCount, 20) || null, contactName, phone, email || null, text(b.message, 600) || null, PILOT_KVKK_VERSION, ipHash).run();
  const admins = await all<any>(env.DB.prepare(`SELECT id FROM users WHERE role='SUPER_ADMIN' AND active=1`));
  if (admins.length) await env.DB.batch(admins.map((a) => env.DB.prepare(`INSERT INTO notifications(id,recipient_user_id,institution_id,type,title,body,action_url,entity_type,entity_id) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(uuid('ntf'), a.id, null, 'PILOT_APPLICATION', 'Yeni pilot okul başvurusu', `${institutionName} · ${city}`, '/pilot-basvurulari', 'pilot_application', id))).catch(() => undefined);
  return json({ ok: true }, 201);
}

export async function handlePilotApplications(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/public/pilot-applications') {
    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('Origin');
      if (!origin || !ORIGINS.has(origin)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'Origin' } });
    }
    if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
    const origin = request.headers.get('Origin');
    if (!origin || !(ORIGINS.has(origin) || origin === url.origin)) return fail(403, 'FORBIDDEN', 'Başvuru anunex.com üzerinden yapılır.');
    return cors(request, await apply(request, env));
  }
  if (!url.pathname.startsWith('/api/pilot-applications')) return null;
  const { getAuthUser } = await import('./auth');
  const user = await getAuthUser(env, request);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (user.role !== 'SUPER_ADMIN') return fail(403, 'FORBIDDEN', 'Pilot başvuruları yalnız Süper Admin içindir.');
  if (url.pathname === '/api/pilot-applications' && request.method === 'GET') {
    const status = text(url.searchParams.get('status'), 20);
    const rows = await all<any>(env.DB.prepare(`SELECT id,institution_name,city,institution_type,student_count,contact_name,phone,email,message,status,note,created_at FROM pilot_applications ${STATUSES.includes(status) ? 'WHERE status=?' : ''} ORDER BY created_at DESC LIMIT 200`).bind(...(STATUSES.includes(status) ? [status] : [])));
    return json({ ok: true, applications: rows });
  }
  const m = url.pathname.match(/^\/api\/pilot-applications\/([^/]+)$/);
  if (m && request.method === 'PATCH') {
    if (request.headers.get('Origin') !== url.origin) return fail(403, 'FORBIDDEN', 'İsteği ANUNEX üzerinden başlatın.');
    const b = await request.json().catch(() => ({})) as any;
    const status = STATUSES.includes(b?.status) ? b.status : null;
    const r = await env.DB.prepare(`UPDATE pilot_applications SET status=coalesce(?,status),note=coalesce(?,note),updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status, b?.note !== undefined ? text(b.note, 600) : null, m[1]).run();
    if (!r.meta.changes) return fail(404, 'NOT_FOUND', 'Başvuru bulunamadı.');
    await audit(env.DB, user.id, null, 'PILOT_APPLICATION_UPDATED', 'pilot_application', m[1], { status });
    return json({ ok: true });
  }
  return fail(404, 'NOT_FOUND', 'Yol bulunamadı.');
}
