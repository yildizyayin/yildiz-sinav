import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import app from '../worker/preview-policy-production-entry';

/**
 * A052: institution / chain report. Class and institution summaries and the chain comparison are computed
 * from the same frozen snapshot and agree. Real schema, production entry chain, synthetic data.
 */
async function setup() {
  const t = await evaluatedExam('direct', { outcomes: true });
  expect((await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST')).response.status).toBe(200);
  expect((await t.request(`/api/platform/exam-center/${t.examId}/publish`, 'POST')).response.status).toBe(200);
  t.db.exec(`INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('mgr','INSTITUTION_MANAGER','M','u','u',1,'school'),('teach2','TEACHER','T','u','u',1,'school');
    INSERT INTO institution_feature_overrides(institution_id,feature_key,enabled) VALUES('school','ENTERPRISE',1);`);
  const cookies: Record<string, string> = {};
  for (const id of ['mgr', 'teacher', 'stuuser']) cookies[id] = (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const as = async (who: string, path: string, method = 'GET', body?: any) => { const res = await (app as any).fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookies[who] ?? '', Origin: 'https://app.anunex.com', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {} }); const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ } return { status: res.status, text, data }; };
  return { ...t, as };
}

describe('A052: institution / chain report', () => {
  it('class groups add up to the institution snapshot and to the chain comparison of the same exam', async () => {
    const t = await setup();
    try {
      const snaps = t.db.prepare(`SELECT net FROM exam_result_snapshots s JOIN exam_delivery_profiles p ON p.exam_id=s.exam_id AND p.snapshot_version=s.snapshot_version WHERE s.exam_id=? AND s.institution_id='school'`).all(t.examId) as any[];
      expect(snaps.length).toBe(2);
      const rep = await t.as('mgr', `/api/reporting/institution/frozen-summary?academicYear=2026-2027&examIds=${t.examId}`);
      expect(rep.status, rep.text).toBe(200);
      const total = rep.data.groups.reduce((s: number, g: any) => s + Number(g.participantCount), 0);
      expect(total).toBe(snaps.length);
      const weighted = rep.data.groups.reduce((s: number, g: any) => s + Number(g.averageNet) * Number(g.usableCount), 0) / rep.data.groups.reduce((s: number, g: any) => s + Number(g.usableCount), 0);
      const avg = snaps.reduce((s, r) => s + Number(r.net), 0) / snaps.length;
      expect(Math.abs(weighted - avg)).toBeLessThan(1e-9);

      // the same exam as a chain exam: the school's row in the comparison is the same data
      const net = await t.request('/api/platform/networks', 'POST', { name: 'Zincir', code: 'ZN1', headquartersInstitutionId: 'school' });
      await t.request(`/api/platform/networks/${net.data.id}/members`, 'POST', { institutionId: 'school' });
      t.db.prepare('UPDATE exam_delivery_profiles SET network_id=? WHERE exam_id=?').run(net.data.id, t.examId);
      const cmp = await t.request(`/api/platform/networks/${net.data.id}/comparison?examId=${t.examId}`);
      expect(cmp.response.status, cmp.text).toBe(200);
      const row = cmp.data.institutions.find((i: any) => i.id === 'school');
      expect(row.participants).toBe(total);
      expect(Math.abs(Number(row.average_net) - Math.round(avg * 100) / 100)).toBeLessThan(0.006);
      expect(cmp.data.network.participants).toBe(total);
    } finally { t.db.close(); }
  }, 90000);

  it('only managers (and the Super Admin) read the institution report; the selection is validated', async () => {
    const t = await setup();
    try {
      for (const who of ['teacher', 'stuuser']) expect((await t.as(who, `/api/reporting/institution/frozen-summary?academicYear=2026-2027&examIds=${t.examId}`)).status, who).toBe(403);
      expect((await t.as('mgr', `/api/reporting/institution/frozen-summary?academicYear=2026-2028&examIds=${t.examId}`)).status).toBe(400);
      // an unpublished version is not summarised
      t.db.prepare(`UPDATE exam_delivery_profiles SET result_freeze_status='FROZEN',published_at=NULL WHERE exam_id=?`).run(t.examId);
      expect((await t.as('mgr', `/api/reporting/institution/frozen-summary?academicYear=2026-2027&examIds=${t.examId}`)).data.groups).toEqual([]);
    } finally { t.db.close(); }
  }, 90000);
});
