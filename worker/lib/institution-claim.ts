/**
 * S020: every MEB school is known from the national directory; nobody has to open it by hand.
 * - The Super Admin or a dealer (inside its scope) issues a one-time PIN for a school. The school's record is
 *   created from the directory the first time it is needed.
 * - The school claims its account once with MEB code + PIN and creates its own manager login; the PIN then ends.
 *   Guesses are counted atomically; five failures lock the PIN until a new one is issued.
 * - The school (and the Super Admin / dealer) keeps the card's contact fields up to date.
 */
import type { AuthUser, Env } from '../types';
import { all, audit, json, one, uuid } from './db';

const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);
const PIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PIN_FAILURE_LIMIT = 5;
export function newPin(): string { const b = new Uint8Array(8); crypto.getRandomValues(b); return [...b].map((x) => PIN_ALPHABET[x % PIN_ALPHABET.length]).join(''); }
/** a MEB code, or the ANX- code of a school opened by hand */
const CODE = /^(\d{5,12}|ANX-[A-Z0-9-]{4,30})$/;
const normalPin = (v: unknown) => String(v ?? '').toUpperCase().replace(/[\s-]/g, '');
const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

/** The school's own record; created once from the national directory. */
export async function ensureInstitutionFromDirectory(env: Env, mebCode: string, actorId: string | null): Promise<any | null> {
  const existing = await one<any>(env.DB.prepare('SELECT * FROM institutions WHERE code=? OR meb_code=? LIMIT 1').bind(mebCode, mebCode));
  if (existing) return existing;
  const d = await one<any>(env.DB.prepare(`SELECT * FROM national_institution_directory WHERE meb_code=? AND status='ACTIVE'`).bind(mebCode));
  if (!d) return null;
  const id = uuid('inst');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO institutions(id,name,code,city,district,status,source_type,meb_code,institution_type,ownership,education_level,official_url) VALUES(?,?,?,?,?,'ACTIVE','MEB',?,?,?,?,?)`)
      .bind(id, d.name, d.meb_code, d.city, d.district, d.meb_code, d.institution_type ? String(d.institution_type).toLocaleUpperCase('tr-TR') : 'OTHER', d.ownership || null, d.education_level || null, d.official_url || null),
    env.DB.prepare(`INSERT INTO institution_access_controls(institution_id,lifecycle_status,updated_by) VALUES(?,'ACTIVE',?)`).bind(id, actorId || 'system'),
    env.DB.prepare(`INSERT INTO institution_governance_events(id,institution_id,actor_user_id,action,next_status,metadata_json) VALUES(?,?,?,'CREATE','ACTIVE',?)`).bind(uuid('ige'), id, actorId, JSON.stringify({ mebCode, source: 'NATIONAL_DIRECTORY' })),
  ]);
  return one<any>(env.DB.prepare('SELECT * FROM institutions WHERE id=?').bind(id));
}

async function canManage(env: Env, user: AuthUser, inst: any): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role === 'INSTITUTION_MANAGER' && user.institution_id === inst.id) return true;
  const { dealerCanAct } = await import('../result-network-entry');
  return (await dealerCanAct(env, user, inst.meb_code || inst.code)).ok;
}

async function issuePin(request: Request, env: Env, user: AuthUser): Promise<Response> {
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'INSTITUTION_MANAGER') return fail(403, 'FORBIDDEN', 'Kurum PIN\'ini Süper Admin veya yetkili bayi verir.');
  const body: any = await request.json().catch(() => ({}));
  const mebCode = text(body.mebCode, 40).toUpperCase();
  if (!CODE.test(mebCode)) return fail(400, 'MEB_CODE_REQUIRED', 'Geçerli bir MEB kurum kodu (veya ANX- ile başlayan manuel kurum kodu) girin.');
  if (user.role !== 'SUPER_ADMIN') {
    const { dealerCanAct } = await import('../result-network-entry');
    if (!(await dealerCanAct(env, user, mebCode)).ok) return fail(403, 'FORBIDDEN', 'Bu kurum bayi kapsamınızda değil.');
  }
  const inst = /^ANX-/.test(mebCode) ? await one<any>(env.DB.prepare('SELECT * FROM institutions WHERE code=?').bind(mebCode)) : await ensureInstitutionFromDirectory(env, mebCode, user.id);
  if (!inst) return fail(404, 'DIRECTORY_INSTITUTION_NOT_FOUND', 'Bu MEB kodu kurum rehberinde yok. Kurumu elle açın veya rehberi güncelleyin.');
  const pin = newPin(); const { hashPassword } = await import('./auth'); const h = await hashPassword(pin);
  await env.DB.prepare(`INSERT INTO institution_claim_pins(institution_id,pin_hash,pin_salt,pin_iterations,issued_by) VALUES(?,?,?,?,?)
    ON CONFLICT(institution_id) DO UPDATE SET pin_hash=excluded.pin_hash,pin_salt=excluded.pin_salt,pin_iterations=excluded.pin_iterations,issued_by=excluded.issued_by,issued_at=CURRENT_TIMESTAMP,used_at=NULL,used_by_user_id=NULL,failed_attempts=0,locked_until=NULL`)
    .bind(inst.id, h.hash, h.salt, h.iterations, user.id).run();
  await audit(env.DB, user.id, inst.id, 'INSTITUTION_CLAIM_PIN_ISSUED', 'institution', inst.id, { mebCode });
  return json({ ok: true, pin, oneTimeDisplay: true, institution: { id: inst.id, code: inst.code, name: inst.name, city: inst.city, district: inst.district } }, 201);
}

async function claim(request: Request, env: Env): Promise<Response> {
  const body: any = await request.json().catch(() => ({}));
  const { verifyTurnstile, verifyPassword, hashPassword } = await import('./auth');
  const ip = request.headers.get('CF-Connecting-IP');
  const t = await verifyTurnstile(env, body.turnstileToken, ip);
  if (!t.ok) return fail(400, t.error || 'TURNSTILE_FAILED', 'Robot doğrulaması tamamlanamadı.');
  const mebCode = text(body.mebCode, 40).toUpperCase(), pin = normalPin(body.pin), displayName = text(body.displayName, 120), email = text(body.email, 160).toLowerCase(), phone = text(body.phone, 32), address = text(body.address, 300), password = String(body.password ?? '');
  if (!CODE.test(mebCode) || !/^[A-Z0-9]{8}$/.test(pin)) return fail(400, 'CLAIM_INPUT_INVALID', 'Kurum kodu ve 8 karakterlik PIN gerekli.');
  if (displayName.length < 3 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !/^\+?[0-9 ()-]{10,20}$/.test(phone)) return fail(400, 'CLAIM_INPUT_INVALID', 'Yetkili adı, geçerli e-posta ve telefon gerekli.');
  if (password.length < 10) return fail(400, 'PASSWORD_TOO_SHORT', 'Şifre en az 10 karakter olmalı.');
  const row = await one<any>(env.DB.prepare(`SELECT p.*,i.id inst_id,i.name FROM institution_claim_pins p JOIN institutions i ON i.id=p.institution_id WHERE (i.code=? OR i.meb_code=?) LIMIT 1`).bind(mebCode, mebCode));
  // one answer for "no such school", "no PIN" and "wrong PIN", so codes cannot be probed
  const wrong = () => fail(401, 'CLAIM_FAILED', 'Kurum kodu veya PIN hatalı ya da PIN kullanılmış.');
  if (!row) return wrong();
  if (await one(env.DB.prepare('SELECT 1 FROM users WHERE lower(email)=? OR lower(username)=? LIMIT 1').bind(email, email))) return fail(409, 'USER_ALREADY_EXISTS', 'Bu e-posta ile bir hesap zaten var.');
  // count the attempt before checking, atomically: parallel guesses cannot pass the limit
  const attempt = await env.DB.prepare(`UPDATE institution_claim_pins SET failed_attempts=failed_attempts+1,locked_until=CASE WHEN failed_attempts+1>=? THEN datetime('now','+30 minutes') ELSE locked_until END
    WHERE institution_id=? AND used_at IS NULL AND failed_attempts<? AND (locked_until IS NULL OR datetime(locked_until)<=CURRENT_TIMESTAMP)`).bind(PIN_FAILURE_LIMIT, row.inst_id, PIN_FAILURE_LIMIT).run();
  if (Number((attempt as any)?.meta?.changes || 0) !== 1) {
    const st = await one<any>(env.DB.prepare('SELECT used_at,locked_until FROM institution_claim_pins WHERE institution_id=?').bind(row.inst_id));
    if (st && !st.used_at) return fail(429, 'CLAIM_LOCKED', 'Çok fazla hatalı deneme yapıldı ve PIN kilitlendi. Kurumunuzun bayisinden veya ANUNEX\'ten yeni PIN isteyin.');
    return wrong();
  }
  if (!(await verifyPassword(pin, row.pin_salt, row.pin_hash, row.pin_iterations))) return wrong();
  const userId = uuid('usr');
  const used = await env.DB.prepare(`UPDATE institution_claim_pins SET used_at=CURRENT_TIMESTAMP,used_by_user_id=NULL,failed_attempts=0,locked_until=NULL WHERE institution_id=? AND used_at IS NULL AND pin_hash=?`).bind(row.inst_id, row.pin_hash).run();
  if (Number((used as any)?.meta?.changes || 0) !== 1) return wrong();
  const h = await hashPassword(password);
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users(id,institution_id,role,display_name,email,phone,username,password_hash,password_salt,password_iterations,password_algo,must_change_password,active) VALUES(?,?,'INSTITUTION_MANAGER',?,?,?,?,?,?,?,'PBKDF2-SHA256-v1',0,1)`)
        .bind(userId, row.inst_id, displayName, email, phone, email, h.hash, h.salt, h.iterations),
      env.DB.prepare('UPDATE institution_claim_pins SET used_by_user_id=? WHERE institution_id=?').bind(userId, row.inst_id),
      env.DB.prepare(`UPDATE institutions SET contact_name=?,contact_phone=?,contact_email=?,address=COALESCE(NULLIF(?,''),address),updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(displayName, phone, email, address, row.inst_id),
    ]);
  } catch {
    await env.DB.prepare('UPDATE institution_claim_pins SET used_at=NULL WHERE institution_id=? AND used_by_user_id IS NULL').bind(row.inst_id).run();
    return fail(409, 'USER_ALREADY_EXISTS', 'Hesap oluşturulamadı; bu e-posta kullanılıyor olabilir.');
  }
  await audit(env.DB, userId, row.inst_id, 'INSTITUTION_CLAIMED', 'institution', row.inst_id, { mebCode });
  return json({ ok: true, institution: { id: row.inst_id, name: row.name }, login: email }, 201);
}

async function card(request: Request, env: Env, user: AuthUser, id: string): Promise<Response> {
  const inst = await one<any>(env.DB.prepare('SELECT * FROM institutions WHERE id=? OR code=? LIMIT 1').bind(id, id.toUpperCase()));
  if (inst) id = inst.id;
  if (!inst || !(await canManage(env, user, inst))) return fail(404, 'INSTITUTION_NOT_FOUND', 'Kurum bulunamadı veya yetkiniz dışında.');
  if (request.method === 'PATCH') {
    if (request.headers.get('Origin') !== new URL(request.url).origin) return fail(403, 'FORBIDDEN', 'İsteği ANUNEX üzerinden başlatın.');
    const b: any = await request.json().catch(() => ({}));
    const phone = b.contactPhone === undefined ? undefined : text(b.contactPhone, 32), email = b.contactEmail === undefined ? undefined : text(b.contactEmail, 160).toLowerCase();
    if (phone && !/^\+?[0-9 ()-]{10,20}$/.test(phone)) return fail(400, 'VALIDATION_ERROR', 'Telefon numarası geçersiz.');
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(400, 'VALIDATION_ERROR', 'E-posta geçersiz.');
    await env.DB.prepare(`UPDATE institutions SET contact_name=COALESCE(?,contact_name),contact_phone=COALESCE(?,contact_phone),contact_email=COALESCE(?,contact_email),address=COALESCE(?,address),updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(b.contactName === undefined ? null : text(b.contactName, 120), phone ?? null, email ?? null, b.address === undefined ? null : text(b.address, 300), id).run();
    await audit(env.DB, user.id, id, 'INSTITUTION_CONTACT_UPDATED', 'institution', id, { fields: ['contactName', 'contactPhone', 'contactEmail', 'address'].filter((k) => b[k] !== undefined) });
  }
  const fresh = await one<any>(env.DB.prepare('SELECT id,code,meb_code,name,city,district,institution_type,ownership,education_level,contact_name,contact_phone,contact_email,address,status FROM institutions WHERE id=?').bind(id));
  const pin = await one<any>(env.DB.prepare('SELECT issued_at,used_at,failed_attempts,locked_until FROM institution_claim_pins WHERE institution_id=?').bind(id));
  const managers = await all<any>(env.DB.prepare(`SELECT display_name,email,active FROM users WHERE institution_id=? AND role='INSTITUTION_MANAGER' ORDER BY created_at`).bind(id));
  return json({ ok: true, institution: fresh, pin: pin ? { issuedAt: pin.issued_at, usedAt: pin.used_at, locked: !!pin.locked_until && Date.parse(String(pin.locked_until).replace(' ', 'T') + 'Z') > Date.now() } : null, managers: user.role === 'SUPER_ADMIN' ? managers : managers.map((m) => ({ display_name: m.display_name, active: m.active })) });
}

export async function handleInstitutionClaim(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/public/results/institution-claim') {
    if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
    return claim(request, env);
  }
  const pinPath = url.pathname === '/api/admin/result-network/institution-pins';
  const cardMatch = url.pathname.match(/^\/api\/admin\/result-network\/institutions\/([^/]+)\/card$/);
  if (!pinPath && !cardMatch) return null;
  const { getAuthUser } = await import('./auth');
  const user = await getAuthUser(env, request);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (user.must_change_password) return fail(403, 'PASSWORD_CHANGE_REQUIRED', 'Önce geçici şifrenizi değiştirin.');
  if (pinPath) {
    if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
    if (request.headers.get('Origin') !== url.origin) return fail(403, 'FORBIDDEN', 'İsteği ANUNEX üzerinden başlatın.');
    return issuePin(request, env, user);
  }
  if (!['GET', 'PATCH'].includes(request.method)) return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
  return card(request, env, user, decodeURIComponent(cardMatch![1]));
}
