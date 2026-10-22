import { describe, expect, it } from 'vitest';
import { evaluatedExam, TITLE } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import app from '../worker/preview-policy-production-entry';

/** A032: the exam catalog lists what each role may manage, with correct counts and labels, and rows open. */
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('other','Other School','OTHER','ACTIVE');
    INSERT INTO institution_seasons(id,institution_id,academic_year,status) VALUES('season2','other','2026-2027','ACTIVE');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('mgr','INSTITUTION_MANAGER','Manager','unused','unused',1,'school'),('othermgr','INSTITUTION_MANAGER','Other','unused','unused',1,'other');`);
  const cookies: Record<string, string> = {};
  for (const id of ['admin', 'mgr', 'othermgr']) cookies[id] = (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const as = async (id: string, path: string, method = 'GET', body?: any) => {
    const res = await (app as any).fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookies[id], Origin: 'https://app.anunex.com', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {} });
    const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, text, data };
  };
  const catalog = async (id: string, qs = '') => ((await as(id, `/api/platform/exam-center/catalog${qs}`)).data.exams as any[]);
  return { ...t, as, catalog };
}

describe('A032: exam catalog', () => {
  it('each role sees its own exams; a central exam is labelled central; a manager counts only their participants', async () => {
    const t = await setup();
    try {
      // a participant of another institution in the same central exam
      t.db.exec(`INSERT INTO exam_institutions(id,exam_id,institution_id,enabled) VALUES('ei2','${t.examId}','other',1);
        INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES('s9','X','Y','x y','ACTIVE');
        INSERT INTO exam_participants(id,exam_id,institution_id,season_id,student_id,name_snapshot,participant_status) VALUES('p9','${t.examId}','other','season2','s9','X Y','ACTIVE');`);
      const admin = (await t.catalog('admin')).find((r) => r.id === t.examId);
      expect(admin).toMatchObject({ scope: 'CENTRAL', participant_count: 3, status: 'ACTIVE' });
      expect((await t.catalog('mgr')).find((r) => r.id === t.examId)).toMatchObject({ participant_count: 2 });
      expect((await t.catalog('othermgr')).find((r) => r.id === t.examId)).toMatchObject({ participant_count: 1 });
      const own = await t.as('mgr', '/api/exam-definitions', 'POST', { ownerType: 'INSTITUTION', institutionId: 'school', academicYear: '2026-2027', title: 'KURUM DENEMESI', examType: 'LGS', gradeLevel: 8, publisherName: 'Kurum', sessionLabel: 'Tek', scoringRuleVersionId: 'srv_meb_lgs_2627', outcomeMode: 'OPTIONAL' });
      expect(own.status, own.text).toBe(201);
      expect((await t.catalog('mgr')).map((r) => r.title)).toContain('KURUM DENEMESI');
      expect((await t.catalog('othermgr')).map((r) => r.title)).not.toContain('KURUM DENEMESI');
      expect((await t.catalog('mgr')).find((r) => r.title === 'KURUM DENEMESI')).toMatchObject({ scope: 'INSTITUTION', status: 'DRAFT' });
      // every listed row opens for the role that sees it
      for (const r of await t.catalog('mgr')) expect((await t.as('mgr', `/api/exam-definitions/${r.id}`)).status).toBe(200);
      expect((await t.as('othermgr', `/api/exam-definitions/${own.data.id}`)).status).toBe(404);
    } finally { t.db.close(); }
  }, 60000);

  it('an exam restored from the trash comes back to the catalog for the Super Admin and its owner', async () => {
    const t = await setup();
    try {
      expect((await t.as('admin', `/api/admin/exams/${t.examId}/trash`, 'POST', { scope: 'APP' })).status).toBe(200);
      expect((await t.catalog('admin')).map((r) => r.id)).not.toContain(t.examId);
      expect((await t.as('admin', `/api/admin/exams/${t.examId}/restore`, 'POST', {})).status).toBe(200);
      const row = (await t.catalog('admin')).find((r) => r.id === t.examId);
      expect(row).toMatchObject({ status: 'ACTIVE', app_channel_status: 'ARCHIVED' });
      // an institution it was only offered to does not get it back until the app channel is republished
      expect((await t.catalog('mgr')).map((r) => r.id)).not.toContain(t.examId);

      const own = await t.as('mgr', '/api/exam-definitions', 'POST', { ownerType: 'INSTITUTION', institutionId: 'school', academicYear: '2026-2027', title: 'KURUM DENEMESI', examType: 'LGS', gradeLevel: 8, publisherName: 'Kurum', sessionLabel: 'Tek', scoringRuleVersionId: 'srv_meb_lgs_2627', outcomeMode: 'OPTIONAL' });
      t.db.prepare(`UPDATE exams SET status='ACTIVE' WHERE id=?`).run(own.data.id);
      expect((await t.as('mgr', `/api/admin/exams/${own.data.id}/trash`, 'POST', { scope: 'APP' })).status).toBe(200);
      expect((await t.as('mgr', `/api/admin/exams/${own.data.id}/restore`, 'POST', {})).status).toBe(200);
      expect((await t.catalog('mgr')).map((r) => r.id)).toContain(own.data.id);
    } finally { t.db.close(); }
  }, 60000);

  it('archived exams leave the main list and are found under the archive filter', async () => {
    const t = await setup();
    try {
      expect((await t.as('admin', `/api/exam-definitions/${t.examId}/status`, 'PATCH', { status: 'ARCHIVED' })).status).toBe(200);
      expect((await t.catalog('admin')).map((r) => r.id)).not.toContain(t.examId);
      expect((await t.catalog('admin', '?archived=1')).map((r) => r.title)).toEqual([TITLE]);
      expect((await t.catalog('mgr', '?archived=1')).map((r) => r.id)).toEqual([t.examId]);
      expect(await t.catalog('othermgr', '?archived=1')).toEqual([]);
      expect((await t.as('mgr', `/api/exam-definitions/${t.examId}`)).status).toBe(200);
    } finally { t.db.close(); }
  }, 60000);
});
