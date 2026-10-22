import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import app from '../worker/preview-policy-production-entry';

/**
 * A044: chain (network) scope. Upper management sees only the chain's member schools; the comparison
 * between schools and the sub-management permissions are consistent. Real schema, production entry chain.
 */
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT INTO institutions(id,name,code,status,city,district,contact_phone) VALUES('other','Other School','OTHER','ACTIVE','İzmir','Konak','05550000000'),('hq','Merkez','HQ','ACTIVE','Ankara','Çankaya',NULL),('x','Dış Okul','XOUT','ACTIVE','Bursa','Nilüfer',NULL);
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('mgr','INSTITUTION_MANAGER','M','u','u',1,'school'),('othermgr','INSTITUTION_MANAGER','O','u','u',1,'other'),('hqmgr','INSTITUTION_MANAGER','H','u','u',1,'hq'),('xmgr','INSTITUTION_MANAGER','X','u','u',1,'x');
    INSERT INTO institution_feature_overrides(institution_id,feature_key,enabled) VALUES('school','ENTERPRISE',1),('other','ENTERPRISE',1),('hq','ENTERPRISE',1),('x','ENTERPRISE',1);`);
  const cookies: Record<string, string> = {};
  for (const id of ['admin', 'mgr', 'othermgr', 'hqmgr', 'xmgr', 'teacher', 'stuuser']) cookies[id] = (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const as = async (who: string, path: string, method = 'GET', body?: any) => {
    const res = await (app as any).fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookies[who], Origin: 'https://app.anunex.com', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {} });
    const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ } return { status: res.status, text, data };
  };
  return { ...t, as };
}

describe('A044: chain scope', () => {
  it('upper management sees only member schools; comparison adds up; membership and roles are the Super Admin’s', async () => {
    const t = await setup();
    try {
      const net = await t.as('admin', '/api/platform/networks', 'POST', { name: 'Örnek Zincir', code: 'ZNC', headquartersInstitutionId: 'hq' });
      expect(net.status, net.text).toBe(201);
      const nid = net.data.id;
      for (const inst of ['school', 'other']) expect((await t.as('admin', `/api/platform/networks/${nid}/members`, 'POST', { institutionId: inst })).status).toBe(200);

      // nobody but upper management sees the chain view
      for (const who of ['mgr', 'othermgr', 'hqmgr', 'teacher', 'stuuser', 'xmgr']) expect((await t.as(who, `/api/platform/networks/${nid}/dashboard`)).status, who).toBe(403);
      // roles: only the Super Admin grants them, and only to a manager of the headquarters or a member school
      expect((await t.as('hqmgr', `/api/platform/networks/${nid}/roles`, 'POST', { userId: 'hqmgr', role: 'NETWORK_ADMIN' })).status).toBe(403);
      expect((await t.as('admin', `/api/platform/networks/${nid}/roles`, 'POST', { userId: 'teacher', role: 'NETWORK_ADMIN' })).status).toBe(400);
      expect((await t.as('admin', `/api/platform/networks/${nid}/roles`, 'POST', { userId: 'xmgr', role: 'NETWORK_ADMIN' })).status).toBe(400);
      expect((await t.as('admin', `/api/platform/networks/${nid}/roles`, 'POST', { userId: 'hqmgr', role: 'NETWORK_ADMIN' })).status).toBe(200);
      expect((await t.as('admin', `/api/platform/networks/${nid}/roles`, 'POST', { userId: 'othermgr', role: 'NETWORK_VIEWER' })).status).toBe(200);

      const dash = await t.as('hqmgr', `/api/platform/networks/${nid}/dashboard`);
      expect(dash.status, dash.text).toBe(200);
      expect(dash.data.institutions.map((i: any) => i.id).sort()).toEqual(['other', 'school']);
      expect(dash.text).not.toContain('05550000000');
      expect((await t.as('othermgr', `/api/platform/networks/${nid}/dashboard`)).status).toBe(200);
      // a chain admin cannot widen their own view; a viewer cannot change anything
      expect((await t.as('hqmgr', `/api/platform/networks/${nid}/members`, 'POST', { institutionId: 'x' })).status).toBe(403);
      expect((await t.as('othermgr', `/api/platform/networks/${nid}/members`, 'POST', { institutionId: 'x' })).status).toBe(403);

      // a chain exam, with one participant from a school outside the chain
      t.db.exec(`INSERT INTO exam_institutions(id,exam_id,institution_id,enabled) VALUES('eix','${t.examId}','x',1);
        INSERT INTO institution_seasons(id,institution_id,academic_year,status) VALUES('sx','x','2026-2027','ACTIVE');`);
      t.db.prepare(`UPDATE exam_delivery_profiles SET network_id=? WHERE exam_id=?`).run(nid, t.examId);
      t.db.prepare(`INSERT OR IGNORE INTO exam_delivery_profiles(exam_id,network_id) VALUES(?,?)`).run(t.examId, nid);
      expect((await t.as('hqmgr', `/api/platform/networks/${nid}/comparison?examId=${t.examId}`)).data.error.code).toBe('RESULTS_NOT_FROZEN');
      expect((await t.as('admin', `/api/platform/exam-center/${t.examId}/freeze`, 'POST', {})).status).toBe(200);
      // a snapshot row of the outside school (as if it had taken part)
      const any = t.db.prepare(`SELECT * FROM exam_result_snapshots WHERE exam_id=? LIMIT 1`).get(t.examId) as any;
      t.db.exec(`INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES('sx1','D','O','d o','ACTIVE');
        INSERT INTO exam_participants(id,exam_id,institution_id,season_id,student_id,name_snapshot,participant_status) VALUES('px1','${t.examId}','x','sx','sx1','D O','ACTIVE');`);
      t.db.prepare(`INSERT INTO exam_result_snapshots(id,exam_id,participant_id,snapshot_version,institution_id,score,net,payload_json) VALUES('snx',?,'px1',?, 'x',999,99,'{}')`).run(t.examId, any.snapshot_version);
      const cmp = await t.as('hqmgr', `/api/platform/networks/${nid}/comparison?examId=${t.examId}`);
      expect(cmp.status, cmp.text).toBe(200);
      const own = t.db.prepare(`SELECT count(*) n,round(avg(score),2) a FROM exam_result_snapshots WHERE exam_id=? AND snapshot_version=? AND institution_id='school'`).get(t.examId, any.snapshot_version) as any;
      expect(cmp.data.institutions.map((i: any) => [i.id, i.participants]).sort()).toEqual([['other', 0], ['school', own.n]]);
      expect(cmp.data.institutions.find((i: any) => i.id === 'school').average_score).toBe(own.a);
      expect(cmp.data.network.participants).toBe(cmp.data.institutions.reduce((s: number, i: any) => s + i.participants, 0));
      expect(cmp.text).not.toContain('Dış Okul');
      for (const who of ['mgr', 'teacher', 'stuuser']) expect((await t.as(who, `/api/platform/networks/${nid}/comparison?examId=${t.examId}`)).status, who).toBe(403);

      // removing a school and revoking a role take effect at once
      expect((await t.as('hqmgr', `/api/platform/networks/${nid}/members/other/remove`, 'POST', {})).status).toBe(403);
      expect((await t.as('admin', `/api/platform/networks/${nid}/members/other/remove`, 'POST', {})).status).toBe(200);
      expect((await t.as('hqmgr', `/api/platform/networks/${nid}/dashboard`)).data.institutions.map((i: any) => i.id)).toEqual(['school']);
      // the removed school's manager also loses the chain view
      expect((await t.as('othermgr', `/api/platform/networks/${nid}/dashboard`)).status).toBe(403);
      expect((await t.as('admin', `/api/platform/networks/${nid}/roles`, 'POST', { userId: 'hqmgr', role: 'NETWORK_ADMIN', active: false })).status).toBe(200);
      expect((await t.as('hqmgr', `/api/platform/networks/${nid}/dashboard`)).status).toBe(403);
      const audits = t.db.prepare(`SELECT action FROM audit_logs WHERE entity_type='institution_network' ORDER BY rowid`).all().map((r: any) => r.action);
      expect(audits).toEqual(['NETWORK_MEMBER_ADDED', 'NETWORK_MEMBER_ADDED', 'NETWORK_ROLE_GRANTED', 'NETWORK_ROLE_GRANTED', 'NETWORK_MEMBER_REMOVED', 'NETWORK_ROLE_REVOKED']);
    } finally { t.db.close(); }
  }, 90000);
});
