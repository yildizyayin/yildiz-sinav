import type { AuthUser, Env } from '../types';
import { all, one, uuid } from './db';

export type LicensePlan = 'TRIAL_7_DAY' | 'ANNUAL' | 'PILOT' | 'CUSTOM' | 'LEGACY';
export type LicenseStatus = 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED' | 'LEGACY_ACTIVE';

export type EffectiveLicense = {
  id: string | null;
  institutionId: string;
  planCode: LicensePlan;
  status: LicenseStatus;
  trialStartedAt: string | null;
  trialExpiresAt: string | null;
  licenseStartedAt: string | null;
  licenseExpiresAt: string | null;
  convertedFromTrial: boolean;
  conversionMode: 'KEEP_DATA' | 'RESET_DATA' | null;
  daysRemaining: number | null;
  locked: boolean;
  legacy: boolean;
};

function isoAfterDays(days: number) {
  return new Date(Date.now() + Math.max(1, days) * 86400000).toISOString();
}

function remainingDays(expiresAt: string | null) {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000));
}

export async function getEffectiveLicense(env: Env, institutionId: string): Promise<EffectiveLicense> {
  const row = await one<any>(env.DB.prepare('SELECT * FROM institution_licenses WHERE institution_id=? LIMIT 1').bind(institutionId));
  if (!row) {
    return {
      id: null,
      institutionId,
      planCode: 'LEGACY',
      status: 'LEGACY_ACTIVE',
      trialStartedAt: null,
      trialExpiresAt: null,
      licenseStartedAt: null,
      licenseExpiresAt: null,
      convertedFromTrial: false,
      conversionMode: null,
      daysRemaining: null,
      locked: false,
      legacy: true,
    };
  }
  let status = row.status as LicenseStatus;
  const expiry = row.plan_code === 'TRIAL_7_DAY' ? row.trial_expires_at : row.license_expires_at;
  if (status === 'ACTIVE' && expiry && new Date(expiry).getTime() <= Date.now()) status = 'EXPIRED';
  return {
    id: row.id,
    institutionId,
    planCode: row.plan_code,
    status,
    trialStartedAt: row.trial_started_at,
    trialExpiresAt: row.trial_expires_at,
    licenseStartedAt: row.license_started_at,
    licenseExpiresAt: row.license_expires_at,
    convertedFromTrial: Boolean(row.converted_from_trial),
    conversionMode: row.conversion_mode,
    daysRemaining: remainingDays(expiry),
    locked: status !== 'ACTIVE' && status !== 'LEGACY_ACTIVE',
    legacy: false,
  };
}

export async function startTrial(env: Env, institutionId: string, actor: AuthUser, days = 7, note?: string | null) {
  const institution = await one<any>(env.DB.prepare('SELECT id,name,status FROM institutions WHERE id=?').bind(institutionId));
  if (!institution) throw new Error('INSTITUTION_NOT_FOUND');
  const now = new Date().toISOString();
  const expires = isoAfterDays(days);
  const existing = await one<any>(env.DB.prepare('SELECT id FROM institution_licenses WHERE institution_id=?').bind(institutionId));
  const id = existing?.id || uuid('lic');
  if (existing) {
    await env.DB.prepare(`UPDATE institution_licenses SET plan_code='TRIAL_7_DAY',status='ACTIVE',trial_started_at=?,trial_expires_at=?,license_started_at=NULL,license_expires_at=NULL,converted_from_trial=0,conversion_mode=NULL,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(now, expires, note || null, id).run();
  } else {
    await env.DB.prepare(`INSERT INTO institution_licenses(id,institution_id,plan_code,status,trial_started_at,trial_expires_at,note,created_by) VALUES(?,?,'TRIAL_7_DAY','ACTIVE',?,?,?,?)`).bind(id, institutionId, now, expires, note || null, actor.id).run();
  }
  await env.DB.prepare(`UPDATE institutions SET status='ACTIVE',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(institutionId).run();
  await env.DB.prepare(`INSERT INTO institution_license_events(id,institution_id,license_id,event_type,actor_user_id,details_json) VALUES(?,?,?,'TRIAL_STARTED',?,?)`).bind(uuid('licev'), institutionId, id, actor.id, JSON.stringify({days,expires})).run();
  return getEffectiveLicense(env, institutionId);
}

async function resetTrialAcademicData(env: Env, institutionId: string) {
  const studentRows = await all<{student_id:string}>(env.DB.prepare(`SELECT DISTINCT student_id FROM student_enrollments WHERE institution_id=?`).bind(institutionId));
  await env.DB.batch([
    env.DB.prepare(`UPDATE exams SET status='ARCHIVED' WHERE institution_id=? AND status<>'ARCHIVED'`).bind(institutionId),
    env.DB.prepare(`UPDATE worksheet_assignments SET status='CLOSED' WHERE institution_id=? AND status='ACTIVE'`).bind(institutionId),
    env.DB.prepare(`UPDATE teacher_assignments SET active=0 WHERE institution_id=?`).bind(institutionId),
    env.DB.prepare(`UPDATE student_enrollments SET status='ARCHIVED',class_id=NULL WHERE institution_id=? AND status<>'ARCHIVED'`).bind(institutionId),
    env.DB.prepare(`DELETE FROM classes WHERE institution_id=?`).bind(institutionId),
  ]);
  for (const row of studentRows) {
    const other = await one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM student_enrollments WHERE student_id=? AND institution_id<>? AND status='ACTIVE'`).bind(row.student_id,institutionId));
    if (!other?.c) await env.DB.prepare(`UPDATE student_entities SET status='ARCHIVED',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(row.student_id).run();
  }
  return { archivedStudents: studentRows.length };
}

export async function activateAnnual(env: Env, institutionId: string, actor: AuthUser, mode: 'KEEP_DATA' | 'RESET_DATA', days = 365, note?: string | null) {
  const institution = await one<any>(env.DB.prepare('SELECT id,name FROM institutions WHERE id=?').bind(institutionId));
  if (!institution) throw new Error('INSTITUTION_NOT_FOUND');
  let resetSummary: any = null;
  if (mode === 'RESET_DATA') resetSummary = await resetTrialAcademicData(env, institutionId);
  const now = new Date().toISOString();
  const expires = isoAfterDays(days);
  const existing = await one<any>(env.DB.prepare('SELECT * FROM institution_licenses WHERE institution_id=?').bind(institutionId));
  const id = existing?.id || uuid('lic');
  if (existing) {
    await env.DB.prepare(`UPDATE institution_licenses SET plan_code='ANNUAL',status='ACTIVE',license_started_at=?,license_expires_at=?,converted_from_trial=CASE WHEN trial_started_at IS NOT NULL THEN 1 ELSE converted_from_trial END,conversion_mode=?,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(now, expires, mode, note || existing.note || null, id).run();
  } else {
    await env.DB.prepare(`INSERT INTO institution_licenses(id,institution_id,plan_code,status,license_started_at,license_expires_at,converted_from_trial,conversion_mode,note,created_by) VALUES(?,?,'ANNUAL','ACTIVE',?,?,0,?,?,?)`).bind(id, institutionId, now, expires, mode, note || null, actor.id).run();
  }
  await env.DB.prepare(`UPDATE institutions SET status='ACTIVE',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(institutionId).run();
  await env.DB.prepare(`INSERT INTO institution_license_events(id,institution_id,license_id,event_type,actor_user_id,details_json) VALUES(?,?,?,?,?,?)`).bind(uuid('licev'), institutionId, id, mode === 'RESET_DATA' ? 'ANNUAL_RESET_DATA' : 'ANNUAL_KEEP_DATA', actor.id, JSON.stringify({days,expires,resetSummary})).run();
  return { license: await getEffectiveLicense(env, institutionId), resetSummary };
}

export async function setLicenseStatus(env: Env, institutionId: string, actor: AuthUser, status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED') {
  const row = await one<any>(env.DB.prepare('SELECT id,status FROM institution_licenses WHERE institution_id=?').bind(institutionId));
  if (!row) throw new Error('LICENSE_NOT_FOUND');
  await env.DB.prepare('UPDATE institution_licenses SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(status,row.id).run();
  const eventType = status === 'SUSPENDED' ? 'SUSPENDED' : status === 'CANCELLED' ? 'CANCELLED' : 'REACTIVATED';
  await env.DB.prepare(`INSERT INTO institution_license_events(id,institution_id,license_id,event_type,actor_user_id,details_json) VALUES(?,?,?,?,?,?)`).bind(uuid('licev'),institutionId,row.id,eventType,actor.id,JSON.stringify({previousStatus:row.status,status})).run();
  return getEffectiveLicense(env,institutionId);
}

export function licenseAccessMessage(license: EffectiveLicense) {
  if (license.status === 'EXPIRED' && license.planCode === 'TRIAL_7_DAY') return 'Kurumunuzun 7 günlük deneme lisansı sona ermiştir. Yıllık lisans için sistem yöneticinizle iletişime geçin.';
  if (license.status === 'SUSPENDED') return 'Kurum lisansı geçici olarak askıya alınmıştır. Sistem yöneticinizle iletişime geçin.';
  if (license.status === 'CANCELLED') return 'Kurum lisansı iptal edilmiştir. Sistem yöneticinizle iletişime geçin.';
  return 'Kurum lisansı aktif değildir. Sistem yöneticinizle iletişime geçin.';
}
