import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';

/** A053: guidance report — the guidance teacher sees development and support plans of their group; private counselling records stay apart. Synthetic data only. */
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT INTO classes(id,institution_id,season_id,grade_level,section,name) VALUES('c8a','school','season',8,'A','8-A'),('c8b','school','season',8,'B','8-B');
    UPDATE student_enrollments SET class_id='c8a' WHERE id='enr1';
    INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES('s2','AYSE','KAYA','AYSE KAYA','ACTIVE');
    INSERT INTO student_enrollments(id,student_id,institution_id,season_id,class_id,student_number,grade_level,section,status) VALUES('enr2','s2','school','season','c8b','102',8,'B','ACTIVE');
    INSERT INTO institutions(id,name,code,status) VALUES('other','Other School','OTHER','ACTIVE');
    INSERT INTO institution_seasons(id,institution_id,academic_year,status) VALUES('season2','other','2026-2027','ACTIVE');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('gt','GUIDANCE_TEACHER','Rehber A','unused','unused',1,'school'),('gtb','GUIDANCE_TEACHER','Rehber B','unused','unused',1,'school'),('gto','GUIDANCE_TEACHER','Rehber Diğer','unused','unused',1,'other'),('mgr','INSTITUTION_MANAGER','Müdür','unused','unused',1,'school');
    INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,class_id,assignment_type,active) VALUES('g1','gt','school','season','c8a','GUIDANCE',1),('g2','gtb','school','season','c8b','GUIDANCE',1),('g3','gto','other','season2',NULL,'GUIDANCE',1),('t1','teacher','school','season','c8a','SUBJECT',1);`);
  const cookies: Record<string, string> = {};
  for (const id of ['gt', 'gtb', 'gto', 'mgr']) cookies[id] = (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const app = (await import('../worker/preview-policy-production-entry')).default as any;
  const as = async (who: string, path: string, method = 'GET', body?: any) => {
    if (!cookies[who]) return t.request(path, method, body, who);
    const res = await app.fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookies[who], Origin: 'https://app.anunex.com', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {} });
    const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ }
    return { response: res, data, text };
  };
  return { ...t, as };
}
const PR = '/api/guidance-report/students/s1/private-records', SP = '/api/guidance-report/students/s1/support-plan';
const SECRET = 'Aile içi konuşma notu — gizli.';

describe('A053 guidance report', () => {
  it('keeps private counselling records to the guidance teacher of the class (and the logged Super Admin)', async () => {
    const t = await setup();
    const add = await t.as('gt', PR, 'POST', { body: SECRET });
    expect(add.response.status, add.text).toBe(201);
    const own = await t.as('gt', PR);
    expect(own.response.status).toBe(200); expect(own.data.records[0].body).toBe(SECRET);
    for (const who of ['gtb', 'gto', 'mgr', 'teacher', 'stuuser', 'parent']) {
      const r = await t.as(who, PR);
      expect(r.response.status, who).toBe(403); expect(r.text).not.toContain(SECRET);
      expect((await t.as(who, PR, 'POST', { body: 'x' })).response.status, who).toBe(403);
    }
    const sa = await t.as('admin', PR);
    expect(sa.response.status).toBe(200); expect(sa.data.records).toHaveLength(1);
    expect((await t.as('admin', PR, 'POST', { body: 'x' })).response.status).toBe(403);
    const reads = t.db.prepare(`SELECT actor_user_id a FROM audit_logs WHERE action='GUIDANCE_PRIVATE_RECORDS_READ' ORDER BY rowid`).all() as any[];
    expect(reads.map((r) => r.a)).toEqual(['gt', 'admin']);
    expect(() => t.db.exec(`UPDATE guidance_private_records SET body='y'`)).toThrow(/PRIVATE_RECORD_IMMUTABLE/);
    expect(() => t.db.exec(`DELETE FROM guidance_private_records`)).toThrow(/PRIVATE_RECORD_IMMUTABLE/);
    expect((await t.as('gt', PR, 'POST', { body: '   ' })).response.status).toBe(400);
  });

  it('shows the support plan to the student and parent only when the guidance teacher shares it', async () => {
    const t = await setup();
    expect((await t.as('gtb', SP, 'PUT', { goals: 'g', actions: 'a' })).response.status).toBe(403);
    expect((await t.as('mgr', SP, 'PUT', { goals: 'g', actions: 'a' })).response.status).toBe(403);
    expect((await t.as('gt', SP, 'PUT', { goals: 'Matematikte düzenli tekrar', actions: 'Haftada üç oturum', reviewDate: '2026-12-01' })).response.status).toBe(200);
    for (const who of ['stuuser', 'parent', 'teacher', 'mgr', 'gtb']) expect((await t.as(who, SP)).response.status, who).toBe(403);
    expect((await t.as('gt', SP, 'PUT', { goals: 'Matematikte düzenli tekrar', actions: 'Haftada üç oturum', sharedWithStudent: true })).response.status).toBe(200);
    const st = await t.as('stuuser', SP);
    expect(st.response.status).toBe(200); expect(st.data.plan.goals).toBe('Matematikte düzenli tekrar'); expect(st.data.plan.version).toBe(2);
    expect(st.data.plan.sharedWithParent).toBeUndefined();
    expect((await t.as('parent', SP)).response.status).toBe(403);
    expect((await t.as('gt', SP, 'PUT', { goals: 'x', actions: 'y', sharedWithParent: true })).response.status).toBe(200);
    expect((await t.as('parent', SP)).response.status).toBe(200);
    expect((await t.as('stuuser', SP)).response.status).toBe(403); // sharing with the student was withdrawn
    expect((await t.as('gt', SP, 'PUT', { goals: 'x', actions: 'y', reviewDate: '01.12.2026' })).response.status).toBe(400);
  });

  it('reports the group: reviewed signals, published exams, plan status and only the count of private records', async () => {
    const t = await setup();
    await t.as('gt', PR, 'POST', { body: SECRET });
    await t.as('gt', SP, 'PUT', { goals: 'g', actions: 'a' });
    t.db.exec(`INSERT INTO guidance_assessment_sessions(id,institution_id,student_id,instrument_id,status) VALUES('ses1','school','s1','gi_study_v1','REVIEWED'),('ses2','school','s1','gi_rba_v1','SUBMITTED');
      INSERT INTO guidance_development_signals(id,institution_id,student_id,source_session_id,signal_key,score) VALUES('sig1','school','s1','ses1','planning',62),('sig2','school','s1','ses2','focus',10);`);
    const r = await t.as('gt', '/api/guidance-report');
    expect(r.response.status, r.text).toBe(200);
    expect(r.data.students.map((s: any) => s.id)).toEqual(['s1']);
    const s = r.data.students[0];
    expect(s.signals.map((x: any) => x.signal_key)).toEqual(['planning']); // unreviewed session not shown
    expect(s.plan.status).toBe('ACTIVE'); expect(s.privateRecordCount).toBe(1);
    expect(r.text).not.toContain(SECRET);
    expect(s.recentExams).toEqual([]); // nothing frozen yet
    expect((await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST')).response.status).toBe(200);
    expect((await t.as('gt', '/api/guidance-report')).data.students[0].recentExams).toEqual([]); // frozen, not published
    expect((await t.request(`/api/platform/exam-center/${t.examId}/publish`, 'POST')).response.status).toBe(200);
    const snap = t.db.prepare('SELECT count(*) c FROM exam_result_snapshots snap JOIN exam_delivery_profiles p ON p.exam_id=snap.exam_id AND p.snapshot_version=snap.snapshot_version WHERE snap.student_id=?').get('s1') as any;
    expect(snap.c).toBeGreaterThan(0);
    expect((await t.as('gt', '/api/guidance-report')).data.students[0].recentExams).toHaveLength(snap.c);
    expect((await t.as('gtb', '/api/guidance-report')).data.students.map((x: any) => x.id)).toEqual(['s2']);
    expect((await t.as('gto', '/api/guidance-report')).data.students).toEqual([]);
    for (const who of ['teacher', 'mgr', 'stuuser', 'parent']) expect((await t.as(who, '/api/guidance-report')).response.status, who).toBe(403);
  });
});
