import type { AuthUser, Env } from '../types';
import { all, json, one, uuid } from './db';

/**
 * S048 (D-S046/D-S047): live lessons are the institution's own business. The institution runs them on its own
 * Zoom / Teams / Meet account; ANUNEX only keeps the timetable entry, shows "Derse katıl" to the class and lets
 * the teacher take attendance. No video, no recording, no payment. Only institutions with the app (feature LIVE,
 * license not locked) see it.
 */
const STAFF = ['INSTITUTION_MANAGER', 'TEACHER', 'GUIDANCE_TEACHER', 'SUPER_ADMIN'];
const PROVIDERS = ['ZOOM', 'TEAMS', 'MEET', 'OTHER'] as const;
type Provider = typeof PROVIDERS[number];
const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);

/** The join link must be https and, for a named provider, on that provider's own domain. */
export function validJoinUrl(provider: Provider, raw: unknown): string | null {
  let url: URL;
  try { url = new URL(String(raw || '').trim()); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const on = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (provider === 'ZOOM' && !on('zoom.us')) return null;
  if (provider === 'TEAMS' && !(on('teams.microsoft.com') || on('teams.live.com'))) return null;
  if (provider === 'MEET' && host !== 'meet.google.com') return null;
  return url.toString();
}

async function featureOn(env: Env, user: AuthUser): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true;
  if (!user.institution_id) return false;
  const row = await one<any>(env.DB.prepare(`SELECT COALESCE(o.enabled,f.enabled_default) enabled FROM platform_features f
    LEFT JOIN institution_feature_overrides o ON o.feature_key=f.feature_key AND o.institution_id=? WHERE f.feature_key='LIVE'`).bind(user.institution_id));
  if (Number(row?.enabled || 0) !== 1) return false;
  const { getEffectiveLicense } = await import('./license');
  return !(await getEffectiveLicense(env, user.institution_id)).locked;
}

function institutionOf(user: AuthUser, url: URL, body?: any): string | null {
  if (user.role === 'SUPER_ADMIN') return String(body?.institutionId || url.searchParams.get('institutionId') || '') || null;
  return user.institution_id;
}

/** Classes whose lessons this student/parent may see. */
async function viewerClassIds(env: Env, user: AuthUser): Promise<string[]> {
  if (user.role === 'STUDENT' && user.student_id) {
    return (await all<{ class_id: string }>(env.DB.prepare(`SELECT class_id FROM student_enrollments WHERE student_id=? AND status='ACTIVE' AND class_id IS NOT NULL`).bind(user.student_id))).map((r) => r.class_id);
  }
  if (user.role === 'PARENT') {
    return (await all<{ class_id: string }>(env.DB.prepare(`SELECT e.class_id FROM parent_student_links p JOIN student_enrollments e ON e.student_id=p.student_id AND e.status='ACTIVE'
      WHERE p.parent_user_id=? AND p.active=1 AND e.class_id IS NOT NULL`).bind(user.id))).map((r) => r.class_id);
  }
  return [];
}

const SELECT = `SELECT l.id,l.institution_id,l.class_id,c.name class_name,l.subject_id,s.name subject_name,l.title,l.teacher_user_id,u.display_name teacher_name,
  l.starts_at,l.duration_minutes,l.provider,l.join_url,l.status,l.created_at
  FROM institution_live_lessons l JOIN classes c ON c.id=l.class_id LEFT JOIN subjects s ON s.id=l.subject_id LEFT JOIN users u ON u.id=l.teacher_user_id`;

async function list(env: Env, user: AuthUser, url: URL) {
  const from = url.searchParams.get('from') || new Date(Date.now() - 86400000).toISOString();
  const to = url.searchParams.get('to') || new Date(Date.now() + 14 * 86400000).toISOString();
  let lessons: any[] = [];
  let institutionId: string | null = null;
  if (STAFF.includes(user.role)) {
    institutionId = institutionOf(user, url);
    if (!institutionId) return json({ ok: true, lessons: [], remoteMode: null });
    lessons = await all<any>(env.DB.prepare(`${SELECT} WHERE l.institution_id=? AND l.starts_at>=? AND l.starts_at<=? ORDER BY l.starts_at LIMIT 500`).bind(institutionId, from, to));
  } else {
    const classes = await viewerClassIds(env, user);
    institutionId = user.institution_id;
    if (classes.length) lessons = await all<any>(env.DB.prepare(`${SELECT} WHERE l.status='SCHEDULED' AND l.class_id IN (${classes.map(() => '?').join(',')}) AND l.starts_at>=? AND l.starts_at<=? ORDER BY l.starts_at LIMIT 200`).bind(...classes, from, to));
    // The link opens only around the lesson: from 15 minutes before until it ends.
    const now = Date.now();
    lessons = lessons.map((l) => {
      const start = Date.parse(l.starts_at), end = start + Number(l.duration_minutes) * 60000;
      const open = now >= start - 15 * 60000 && now <= end;
      return { ...l, join_url: open ? l.join_url : null, joinOpen: open };
    });
  }
  const remoteMode = institutionId ? await one<any>(env.DB.prepare(`SELECT starts_on,ends_on,note FROM institution_remote_modes WHERE institution_id=? AND ends_on>=date('now')`).bind(institutionId)) : null;
  return json({ ok: true, lessons, remoteMode });
}

async function canTeachClass(env: Env, user: AuthUser, institutionId: string, classId: string) {
  const cls = await one<any>(env.DB.prepare(`SELECT id FROM classes WHERE id=? AND institution_id=? AND active=1`).bind(classId, institutionId));
  if (!cls) return false;
  if (user.role !== 'TEACHER') return true;
  const assigned = await one<any>(env.DB.prepare(`SELECT 1 ok FROM teacher_assignments WHERE user_id=? AND class_id=? AND active=1 LIMIT 1`).bind(user.id, classId));
  return Boolean(assigned);
}

async function create(request: Request, env: Env, user: AuthUser, url: URL) {
  const b = await request.json<any>().catch(() => ({}));
  const institutionId = institutionOf(user, url, b);
  if (!institutionId) return fail(400, 'INSTITUTION_REQUIRED', 'Kurum seçin.');
  const provider = PROVIDERS.includes(b.provider) ? b.provider as Provider : null;
  if (!provider) return fail(400, 'PROVIDER_INVALID', 'Platform seçin: Zoom, Teams, Meet veya Diğer.');
  const joinUrl = validJoinUrl(provider, b.joinUrl);
  if (!joinUrl) return fail(400, 'JOIN_URL_INVALID', 'Toplantı bağlantısı https ile başlamalı ve seçilen platforma ait olmalı.');
  const title = String(b.title || '').trim().slice(0, 120);
  if (!title) return fail(400, 'TITLE_REQUIRED', 'Ders başlığı girin.');
  const starts = Date.parse(String(b.startsAt || ''));
  if (!Number.isFinite(starts)) return fail(400, 'START_INVALID', 'Başlangıç zamanı girin.');
  const duration = Number(b.durationMinutes || 40);
  if (!Number.isInteger(duration) || duration < 10 || duration > 240) return fail(400, 'DURATION_INVALID', 'Süre 10–240 dakika olmalı.');
  const classIds: string[] = Array.isArray(b.classIds) ? [...new Set(b.classIds.map(String))].slice(0, 40) as string[] : b.classId ? [String(b.classId)] : [];
  if (!classIds.length) return fail(400, 'CLASS_REQUIRED', 'En az bir şube seçin.');
  for (const c of classIds) if (!await canTeachClass(env, user, institutionId, c)) return fail(403, 'CLASS_FORBIDDEN', 'Bu şube için canlı ders planlama yetkiniz yok.');
  const teacher = user.role === 'TEACHER' || user.role === 'GUIDANCE_TEACHER' ? user.id : (b.teacherUserId ? String(b.teacherUserId) : null);
  if (teacher && user.role !== 'TEACHER' && user.role !== 'GUIDANCE_TEACHER') {
    const ok = await one<any>(env.DB.prepare(`SELECT 1 ok FROM users WHERE id=? AND institution_id=? AND role IN ('TEACHER','GUIDANCE_TEACHER','INSTITUTION_MANAGER') AND active=1`).bind(teacher, institutionId));
    if (!ok) return fail(400, 'TEACHER_INVALID', 'Öğretmen bu kurumda değil.');
  }
  const subjectId = b.subjectId ? String(b.subjectId) : null;
  const ids: string[] = [];
  await env.DB.batch(classIds.map((classId) => {
    const id = uuid('lvl'); ids.push(id);
    return env.DB.prepare(`INSERT INTO institution_live_lessons(id,institution_id,class_id,subject_id,title,teacher_user_id,starts_at,duration_minutes,provider,join_url,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, institutionId, classId, subjectId, title, teacher, new Date(starts).toISOString(), duration, provider, joinUrl, user.id);
  }));
  return json({ ok: true, ids }, 201);
}

async function cancel(env: Env, user: AuthUser, id: string) {
  const row = await one<any>(env.DB.prepare(`SELECT * FROM institution_live_lessons WHERE id=?`).bind(id));
  if (!row) return fail(404, 'NOT_FOUND', 'Ders bulunamadı.');
  if (user.role !== 'SUPER_ADMIN' && row.institution_id !== user.institution_id) return fail(403, 'FORBIDDEN', 'Yetkiniz yok.');
  if (user.role === 'TEACHER' && row.created_by !== user.id && row.teacher_user_id !== user.id) return fail(403, 'FORBIDDEN', 'Yalnız kendi dersinizi iptal edebilirsiniz.');
  await env.DB.prepare(`UPDATE institution_live_lessons SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
  return json({ ok: true });
}

async function remoteMode(request: Request, env: Env, user: AuthUser, url: URL) {
  if (user.role !== 'INSTITUTION_MANAGER' && user.role !== 'SUPER_ADMIN') return fail(403, 'FORBIDDEN', 'Uzaktan eğitim modunu kurum yöneticisi açar.');
  const b = await request.json<any>().catch(() => ({}));
  const institutionId = institutionOf(user, url, b);
  if (!institutionId) return fail(400, 'INSTITUTION_REQUIRED', 'Kurum seçin.');
  if (b.off) { await env.DB.prepare(`DELETE FROM institution_remote_modes WHERE institution_id=?`).bind(institutionId).run(); return json({ ok: true, remoteMode: null }); }
  const s = String(b.startsOn || ''), e = String(b.endsOn || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e) || e < s) return fail(400, 'DATES_INVALID', 'Başlangıç ve bitiş tarihini doğru girin.');
  const note = String(b.note || '').trim().slice(0, 300) || null;
  await env.DB.prepare(`INSERT INTO institution_remote_modes(institution_id,starts_on,ends_on,note,updated_by) VALUES(?,?,?,?,?)
    ON CONFLICT(institution_id) DO UPDATE SET starts_on=excluded.starts_on,ends_on=excluded.ends_on,note=excluded.note,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(institutionId, s, e, note, user.id).run();
  return json({ ok: true, remoteMode: { starts_on: s, ends_on: e, note } });
}

export async function handleInstitutionLiveLessons(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/live-lessons')) return null;
  const { getAuthUser } = await import('./auth');
  const user = await getAuthUser(env, request);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (!await featureOn(env, user)) return fail(403, 'FEATURE_DISABLED', 'Canlı ders kurumunuz için etkin değil.');
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) return fail(403, 'FORBIDDEN', 'İsteği ANUNEX üzerinden başlatın.');
  const p = url.pathname, m = request.method;
  if (p === '/api/live-lessons' && m === 'GET') return list(env, user, url);
  if (!STAFF.includes(user.role)) return fail(403, 'FORBIDDEN', 'Canlı dersleri kurum ve öğretmenler planlar.');
  if (p === '/api/live-lessons' && m === 'POST') return create(request, env, user, url);
  if (p === '/api/live-lessons/remote-mode' && m === 'PUT') return remoteMode(request, env, user, url);
  const x = p.match(/^\/api\/live-lessons\/([^/]+)\/cancel$/);
  if (x && m === 'POST') return cancel(env, user, x[1]);
  return fail(404, 'NOT_FOUND', 'Yol bulunamadı.');
}
