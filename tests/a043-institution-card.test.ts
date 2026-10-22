import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import app from '../worker/preview-policy-production-entry';
import { normalizeInstitutionUpdate } from '../worker/lib/institution-card';

/** A043: institution card — add, view, correct, deactivate; MEB code checked; linked students kept. */
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT INTO institutions(id,name,code,status,city,district,source_type,meb_code) VALUES('other','Other School','OTHER','ACTIVE','İzmir','Konak','MEB','765432');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('mgr','INSTITUTION_MANAGER','Mgr','unused','unused',1,'school'),('othermgr','INSTITUTION_MANAGER','O','unused','unused',1,'other');`);
  t.db.exec(`UPDATE institutions SET city='Ankara',district='Çankaya' WHERE id='school'`);
  const cookies: Record<string, string> = {};
  for (const id of ['admin', 'mgr', 'othermgr', 'teacher']) cookies[id] = (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const as = async (who: string, path: string, method = 'GET', body?: any, origin = 'https://app.anunex.com') => {
    const res = await (app as any).fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookies[who], Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {} });
    const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ } return { status: res.status, text, data };
  };
  return { ...t, as };
}

describe('A043: institution card', () => {
  it('validation: MEB code digits and required for MEB source; code immutable; only changed fields', () => {
    const cur = { code: 'SYN', name: 'A', city: 'B', district: 'C', source_type: 'MANUAL', meb_code: null };
    expect(normalizeInstitutionUpdate({ mebCode: '12A45' }, cur).error).toContain('rakam');
    expect(normalizeInstitutionUpdate({ sourceType: 'MEB' }, cur).error).toContain('zorunludur');
    expect(normalizeInstitutionUpdate({ sourceType: 'MEB', mebCode: '123456' }, cur).changes).toEqual({ source_type: 'MEB', meb_code: '123456' });
    expect(normalizeInstitutionUpdate({ code: 'NEW' }, cur).error).toContain('değiştirilemez');
    expect(normalizeInstitutionUpdate({ name: ' ' }, cur).error).toContain('boş');
    expect(normalizeInstitutionUpdate({ name: 'A', officialUrl: 'http://x.com' }, cur).error).toContain('https');
    expect(normalizeInstitutionUpdate({ name: 'A' }, cur).changes).toEqual({});
  });

  it('add, view, correct and deactivate; students and results are kept; only the Super Admin edits', async () => {
    const t = await setup();
    try {
      // add (existing onboarding API) with a duplicate MEB code is refused
      const dup = await t.as('admin', '/api/institutions', 'POST', { sourceType: 'MEB', mebCode: '765432', code: '765432', name: 'Yeni', city: 'Ankara', district: 'Keçiören', manager: { displayName: 'Yönetici', username: 'yeni.mgr', password: 'Sentetik-Parola-1' } });
      expect(dup.status).toBe(409);
      const add = await t.as('admin', '/api/institutions', 'POST', { sourceType: 'MEB', mebCode: '112233', code: '112233', name: 'Yeni Okul', city: 'Ankara', district: 'Keçiören', manager: { displayName: 'Yönetici', username: 'yeni.mgr', password: 'Sentetik-Parola-1' } });
      expect(add.status, add.text).toBe(201);

      const view = await t.as('admin', '/api/institutions/school');
      expect(view.status, view.text).toBe(200);
      expect(view.data.institution).toMatchObject({ id: 'school', code: 'SYNTHETIC', lifecycle_status: 'ACTIVE', students: { active: 1, guest: 1, total: 2 } });
      expect((await t.as('mgr', '/api/institutions/school')).status).toBe(200);
      for (const [who, id] of [['mgr', 'other'], ['othermgr', 'school'], ['teacher', 'school']]) expect((await t.as(who, `/api/institutions/${id}`)).status, `${who} ${id}`).toBe(403);

      const before = { enr: t.db.prepare(`SELECT count(*) c FROM student_enrollments WHERE institution_id='school'`).get(), res: t.db.prepare(`SELECT count(*) c FROM exam_participants WHERE institution_id='school'`).get() };
      // correct: MEB code checked for format and uniqueness
      expect((await t.as('admin', '/api/institutions/school', 'PATCH', { sourceType: 'MEB', mebCode: '765432' })).data.error.code).toBe('MEB_CODE_EXISTS');
      expect((await t.as('admin', '/api/institutions/school', 'PATCH', { mebCode: '7654-32' })).status).toBe(400);
      expect((await t.as('admin', '/api/institutions/school', 'PATCH', { code: 'BASKA' })).data.error.message).toContain('değiştirilemez');
      expect((await t.as('mgr', '/api/institutions/school', 'PATCH', { name: 'Kendi Adım' })).status).toBe(403);
      expect((await t.as('admin', '/api/institutions/school', 'PATCH', { name: 'Kötü' }, 'https://evil.example')).status).toBe(403);
      const upd = await t.as('admin', '/api/institutions/school', 'PATCH', { name: 'Synthetic School (düzeltildi)', sourceType: 'MEB', mebCode: '445566', district: 'Yenimahalle' });
      expect(upd.status, upd.text).toBe(200);
      expect(upd.data.changed.sort()).toEqual(['district', 'meb_code', 'name', 'source_type']);
      expect(t.db.prepare(`SELECT name,code,meb_code,source_type,district FROM institutions WHERE id='school'`).get()).toEqual({ name: 'Synthetic School (düzeltildi)', code: 'SYNTHETIC', meb_code: '445566', source_type: 'MEB', district: 'Yenimahalle' });
      const audit = JSON.parse((t.db.prepare(`SELECT details_json d FROM audit_logs WHERE action='INSTITUTION_UPDATED'`).get() as any).d);
      expect(audit.changes.meb_code).toEqual({ from: null, to: '445566' });

      // deactivate (A032b lifecycle) and back: students, enrolments and participations are kept
      expect((await t.as('admin', '/api/institutions/school/status', 'POST', { status: 'PASSIVE', reason: 'Dönem arası' })).status).toBe(200);
      expect((await t.as('admin', '/api/institutions/school')).data.institution.lifecycle_status).toBe('PASSIVE');
      expect((await t.as('admin', '/api/institutions/school/status', 'POST', { status: 'ACTIVE' })).status).toBe(200);
      expect({ enr: t.db.prepare(`SELECT count(*) c FROM student_enrollments WHERE institution_id='school'`).get(), res: t.db.prepare(`SELECT count(*) c FROM exam_participants WHERE institution_id='school'`).get() }).toEqual(before);
      expect((await t.as('admin', '/api/institutions/school')).data.institution.students).toMatchObject({ active: 1, total: 2 });
    } finally { t.db.close(); }
  }, 90000);
});
