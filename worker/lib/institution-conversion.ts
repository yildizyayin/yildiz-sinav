/**
 * S022: moving a Result Network school into the licensed app. The school and its students already live in the
 * same database and the same institution record, so nothing is copied:
 * - PLAN marks the school; from then on the end-of-term clean-up never deletes its students or results.
 * - CONVERT (Super Admin, after payment is confirmed) turns the school's guest students into app students within
 *   the season's licensed-student limit; their exam history stays attached. CONVERTED cannot be undone here.
 */
import type { AuthUser, Env } from '../types';
import { all, audit, json, one } from './db';

const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);

async function summary(env: Env, id: string) {
  const [conv, counts] = await Promise.all([
    one<any>(env.DB.prepare('SELECT status,planned_at,converted_at,note FROM institution_app_conversions WHERE institution_id=?').bind(id)),
    one<any>(env.DB.prepare(`SELECT count(DISTINCT CASE WHEN s.status='GUEST' THEN s.id END) guests,count(DISTINCT CASE WHEN s.status='ACTIVE' THEN s.id END) active,
      (SELECT count(*) FROM exam_participants ep WHERE ep.institution_id=?) participations FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.institution_id=?`).bind(id, id)),
  ]);
  return { status: conv?.status || 'NONE', plannedAt: conv?.planned_at || null, convertedAt: conv?.converted_at || null, note: conv?.note || null, guestStudents: Number(counts?.guests || 0), activeStudents: Number(counts?.active || 0), examParticipations: Number(counts?.participations || 0) };
}

async function convert(env: Env, user: AuthUser, id: string, body: any) {
  if (body.paymentConfirmed !== true) return fail(400, 'PAYMENT_CONFIRMATION_REQUIRED', 'Lisans ödemesi/onayı tamamlanmadan kurum app\'e geçirilemez.');
  const conv = await one<any>(env.DB.prepare('SELECT status FROM institution_app_conversions WHERE institution_id=?').bind(id));
  if (!conv) return fail(409, 'CONVERSION_NOT_PLANNED', 'Önce kurumu app\'e geçiş için işaretleyin.');
  const guests = await all<any>(env.DB.prepare(`SELECT DISTINCT s.id,e.season_id FROM student_entities s JOIN student_enrollments e ON e.student_id=s.id WHERE e.institution_id=? AND s.status='GUEST' ORDER BY s.id`).bind(id));
  const chosen = Array.isArray(body.studentIds) ? new Set(body.studentIds.map(String)) : null;
  let activated = 0, skippedForLimit = 0;
  for (const g of guests) {
    if (chosen && !chosen.has(g.id)) continue;
    const lic = await one<any>(env.DB.prepare('SELECT id,licensed_student_limit,licensed_student_count FROM institution_license_state WHERE institution_id=? AND season_id=?').bind(id, g.season_id));
    if (lic && lic.licensed_student_limit > 0 && lic.licensed_student_count >= lic.licensed_student_limit) { skippedForLimit++; continue; }
    const r = await env.DB.prepare(`UPDATE student_entities SET status='ACTIVE',activated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='GUEST'`).bind(g.id).run();
    if (!Number((r as any)?.meta?.changes || 0)) continue;
    await env.DB.prepare('UPDATE guest_profiles SET converted_by=?,converted_at=CURRENT_TIMESTAMP WHERE student_id=?').bind(user.id, g.id).run();
    if (lic) await env.DB.prepare('UPDATE institution_license_state SET licensed_student_count=licensed_student_count+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(lic.id).run();
    activated++;
  }
  await env.DB.prepare(`UPDATE institution_app_conversions SET status='CONVERTED',converted_by=?,converted_at=COALESCE(converted_at,CURRENT_TIMESTAMP),note=COALESCE(?,note) WHERE institution_id=?`).bind(user.id, body.note ? String(body.note).slice(0, 500) : null, id).run();
  await audit(env.DB, user.id, id, 'INSTITUTION_APP_CONVERTED', 'institution', id, { activated, skippedForLimit });
  return json({ ok: true, activated, skippedForLimit, ...(await summary(env, id)) });
}

export async function handleInstitutionConversion(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/api\/admin\/result-network\/institutions\/([^/]+)\/app-conversion$/);
  if (!m) return null;
  const { getAuthUser } = await import('./auth');
  const user = await getAuthUser(env, request);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (user.role !== 'SUPER_ADMIN' || user.must_change_password) return fail(403, 'FORBIDDEN', 'App\'e geçişi yalnız Süper Admin yönetir.');
  const id = decodeURIComponent(m[1]);
  if (!(await one(env.DB.prepare('SELECT 1 FROM institutions WHERE id=?').bind(id)))) return fail(404, 'INSTITUTION_NOT_FOUND', 'Kurum bulunamadı.');
  if (request.method === 'GET') return json({ ok: true, ...(await summary(env, id)) });
  if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
  if (request.headers.get('Origin') !== url.origin) return fail(403, 'FORBIDDEN', 'İsteği ANUNEX üzerinden başlatın.');
  const body: any = await request.json().catch(() => ({}));
  if (body.action === 'PLAN') {
    await env.DB.prepare(`INSERT INTO institution_app_conversions(institution_id,status,planned_by,note) VALUES(?,'PLANNED',?,?) ON CONFLICT(institution_id) DO NOTHING`).bind(id, user.id, body.note ? String(body.note).slice(0, 500) : null).run();
    await audit(env.DB, user.id, id, 'INSTITUTION_APP_CONVERSION_PLANNED', 'institution', id, {});
    return json({ ok: true, ...(await summary(env, id)) });
  }
  if (body.action === 'CANCEL') {
    const r = await env.DB.prepare(`DELETE FROM institution_app_conversions WHERE institution_id=? AND status='PLANNED'`).bind(id).run();
    if (!Number((r as any)?.meta?.changes || 0)) return fail(409, 'CONVERSION_NOT_CANCELLABLE', 'Yalnız planlanmış (henüz tamamlanmamış) geçiş iptal edilebilir.');
    await audit(env.DB, user.id, id, 'INSTITUTION_APP_CONVERSION_CANCELLED', 'institution', id, {});
    return json({ ok: true, ...(await summary(env, id)) });
  }
  if (body.action === 'CONVERT') return convert(env, user, id, body);
  return fail(400, 'ACTION_REQUIRED', 'İşlem PLAN, CONVERT veya CANCEL olmalıdır.');
}
