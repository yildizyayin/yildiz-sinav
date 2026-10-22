/**
 * A043: institution card — view and correct an institution.
 * The Super Admin edits the card; the institution code (identity used by imports and logins) never changes;
 * the MEB code is checked (digits, required for MEB-sourced institutions, unique). Editing never touches
 * students, enrolments or results; deactivation goes through the lifecycle (A032b) and keeps every record.
 */
import type { AuthUser, Env } from '../types';
import { all, audit, json, one } from './db';
import { INSTITUTION_OWNERSHIPS, INSTITUTION_SOURCE_TYPES } from './institution-onboarding';

const FIELDS: Record<string, string> = { name: 'name', city: 'city', district: 'district', institutionType: 'institution_type', ownership: 'ownership', educationLevel: 'education_level', officialUrl: 'official_url', address: 'address', contactName: 'contact_name', contactPhone: 'contact_phone', contactEmail: 'contact_email', sourceType: 'source_type', mebCode: 'meb_code' };
const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : v === null ? '' : undefined);

/** Validated column changes, or an error message. Only fields present in the body change. */
export function normalizeInstitutionUpdate(body: any, current: any): { changes?: Record<string, string | null>; error?: string } {
  if (!body || typeof body !== 'object') return { error: 'Geçersiz istek.' };
  if (body.code !== undefined && String(body.code).trim().toUpperCase() !== current.code) return { error: 'Kurum kodu değiştirilemez; içe aktarma ve girişler bu koda bağlıdır.' };
  const changes: Record<string, string | null> = {};
  for (const [key, col] of Object.entries(FIELDS)) { const v = text(body[key]); if (v !== undefined) changes[col] = v || null; }
  const next = { ...current, ...changes };
  if (!next.name || !next.city || !next.district) return { error: 'Kurum adı, il ve ilçe boş bırakılamaz.' };
  if (String(next.name).length > 200 || String(next.city).length > 100 || String(next.district).length > 100) return { error: 'Kurum adı, il veya ilçe uzunluğu geçersiz.' };
  if ('source_type' in changes) { changes.source_type = String(changes.source_type || '').toUpperCase(); if (!(INSTITUTION_SOURCE_TYPES as readonly string[]).includes(changes.source_type)) return { error: 'Kurum kaynağı MEB veya MANUAL olmalıdır.' }; }
  if ('ownership' in changes && changes.ownership !== null) { changes.ownership = String(changes.ownership).toUpperCase(); if (!(INSTITUTION_OWNERSHIPS as readonly string[]).includes(changes.ownership)) return { error: 'Geçersiz mülkiyet türü.' }; }
  if ('institution_type' in changes) changes.institution_type = String(changes.institution_type || 'OTHER').toUpperCase();
  const meb = (next.meb_code ?? null) as string | null;
  if (meb && !/^\d{5,12}$/.test(meb)) return { error: 'MEB kurum kodu yalnız rakamlardan oluşmalı (5–12 hane).' };
  if ((next.source_type || 'MANUAL') === 'MEB' && !meb) return { error: 'MEB kaynaklı kurumda MEB kurum kodu zorunludur.' };
  if (next.contact_email && !/^\S+@\S+\.\S+$/.test(next.contact_email)) return { error: 'İletişim e-postası geçersiz.' };
  if ('contact_email' in changes && changes.contact_email) changes.contact_email = changes.contact_email.toLowerCase();
  if (next.official_url && !/^https:\/\//i.test(next.official_url)) return { error: 'Resmî web adresi https:// ile başlamalıdır.' };
  for (const k of Object.keys(changes)) if ((current[k] ?? null) === changes[k]) delete changes[k];
  return { changes };
}

async function card(env: Env, id: string) {
  const i = await one<any>(env.DB.prepare(`SELECT i.*,COALESCE(iac.lifecycle_status,CASE WHEN i.status='ACTIVE' THEN 'ACTIVE' ELSE 'PASSIVE' END) lifecycle_status,iac.reason lifecycle_reason FROM institutions i LEFT JOIN institution_access_controls iac ON iac.institution_id=i.id WHERE i.id=?`).bind(id));
  if (!i) return null;
  const [students, users, seasons, events] = await Promise.all([
    one<any>(env.DB.prepare(`SELECT count(DISTINCT CASE WHEN s.status='ACTIVE' THEN e.student_id END) active,count(DISTINCT CASE WHEN s.status='GUEST' THEN e.student_id END) guest,count(DISTINCT e.student_id) total FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.institution_id=?`).bind(id)),
    all<any>(env.DB.prepare(`SELECT role,count(*) n,sum(active) active FROM users WHERE institution_id=? AND role<>'SUPER_ADMIN' GROUP BY role ORDER BY role`).bind(id)),
    all<any>(env.DB.prepare(`SELECT academic_year,status FROM institution_seasons WHERE institution_id=? ORDER BY academic_year DESC`).bind(id)),
    all<any>(env.DB.prepare(`SELECT action,previous_status,next_status,created_at FROM institution_governance_events WHERE institution_id=? ORDER BY created_at DESC,rowid DESC LIMIT 20`).bind(id)),
  ]);
  return { ...i, students, users, seasons, events };
}

export async function handleInstitutionCard(request: Request, env: Env, user: AuthUser, id: string): Promise<Response> {
  if (request.method === 'GET') {
    if (user.role !== 'SUPER_ADMIN' && !(user.role === 'INSTITUTION_MANAGER' && user.institution_id === id)) return fail(403, 'FORBIDDEN', 'Bu kurum kartını görme yetkiniz yok.');
    const c = await card(env, id); return c ? json({ ok: true, institution: c }) : fail(404, 'INSTITUTION_NOT_FOUND', 'Kurum bulunamadı.');
  }
  if (request.method !== 'PATCH') return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
  if (user.role !== 'SUPER_ADMIN') return fail(403, 'FORBIDDEN', 'Kurum kartını yalnız Süper Admin düzeltir.');
  if (request.headers.get('Origin') !== new URL(request.url).origin) return fail(403, 'FORBIDDEN', 'İsteği ANUNEX üzerinden başlatın.');
  const current = await one<any>(env.DB.prepare('SELECT * FROM institutions WHERE id=?').bind(id));
  if (!current) return fail(404, 'INSTITUTION_NOT_FOUND', 'Kurum bulunamadı.');
  const body = await request.json().catch(() => null);
  const n = normalizeInstitutionUpdate(body, current);
  if (n.error) return fail(400, 'VALIDATION_ERROR', n.error);
  const changes = n.changes!;
  if (!Object.keys(changes).length) return json({ ok: true, id, changed: [] });
  if (changes.meb_code && (await one(env.DB.prepare('SELECT 1 FROM institutions WHERE meb_code=? AND id<>?').bind(changes.meb_code, id)))) return fail(409, 'MEB_CODE_EXISTS', 'Bu MEB kurum kodu başka bir kurumda kayıtlı.');
  const cols = Object.keys(changes);
  await env.DB.prepare(`UPDATE institutions SET ${cols.map((c) => `${c}=?`).join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...cols.map((c) => changes[c]), id).run();
  await audit(env.DB, user.id, id, 'INSTITUTION_UPDATED', 'institution', id, { changes: Object.fromEntries(cols.map((c) => [c, { from: current[c] ?? null, to: changes[c] }])) });
  return json({ ok: true, id, changed: cols, institution: await card(env, id) });
}
