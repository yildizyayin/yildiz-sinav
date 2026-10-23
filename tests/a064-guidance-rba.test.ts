import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';

/** A064: guidance RBA flow — the guidance teacher opens, the student answers, the guidance teacher reviews; RBA stays sensitive. Synthetic data only. */
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`UPDATE platform_features SET enabled_default=1 WHERE feature_key IN ('RBA','GUIDANCE_TESTS');
    INSERT INTO classes(id,institution_id,season_id,grade_level,section,name) VALUES('c8a','school','season',8,'A','8-A'),('c8b','school','season',8,'B','8-B');
    UPDATE student_enrollments SET class_id='c8a' WHERE id='enr1';
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('gt','GUIDANCE_TEACHER','Rehber','unused','unused',1,'school'),('gtb','GUIDANCE_TEACHER','Rehber B','unused','unused',1,'school'),('mgr','INSTITUTION_MANAGER','Müdür','unused','unused',1,'school');
    INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,class_id,assignment_type,active) VALUES('g1','gt','school','season','c8a','GUIDANCE',1),('g2','gtb','school','season','c8b','GUIDANCE',1);`);
  const cookies: Record<string, string> = {};
  for (const id of ['gt', 'gtb', 'mgr']) cookies[id] = (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const app = (await import('../worker/preview-policy-production-entry')).default as any;
  const as = async (who: string, path: string, method = 'GET', body?: any) => {
    if (!cookies[who]) return t.request(path, method, body, who);
    const res = await app.fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookies[who], Origin: 'https://app.anunex.com', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {} });
    const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ }
    return { response: res, data, text };
  };
  return { ...t, as };
}

describe('A064 guidance RBA flow', () => {
  it('lets the guidance teacher open, the student answer and the guidance teacher review; results reach the RBA profile only after review', async () => {
    const t = await setup();
    expect((await t.as('gtb', '/api/nibiru/guidance/assessments/counselor-assign', 'POST', { studentId: 's1', instrumentCode: 'RBA_EDU_V1' })).response.status).toBe(403);
    const open = await t.as('gt', '/api/nibiru/guidance/assessments/counselor-assign', 'POST', { studentId: 's1', instrumentCode: 'RBA_EDU_V1' });
    expect(open.response.status, open.text).toBe(201);
    const id = open.data.session.id;
    const mine = await t.as('stuuser', '/api/nibiru/guidance/assessments/my');
    const s = mine.data.sessions.find((x: any) => x.id === id);
    expect(s.status).toBe('APPROVED'); expect(s.question_schema.items.length).toBe(9);
    const responses = Object.fromEntries(s.question_schema.items.map((q: any, k: number) => [q.id, (k % 5) + 1]));
    const sub = await t.as('stuuser', `/api/nibiru/guidance/assessments/${id}/submit`, 'POST', { responses });
    expect(sub.response.status, sub.text).toBe(200);
    expect((await t.as('stuuser', '/api/platform/rba')).data.profile).toBeNull(); // not before the review
    const rev = await t.as('gt', `/api/nibiru/guidance/assessments/${id}/review`, 'PATCH', { note: 'Planlama üzerine birlikte çalışalım.' });
    expect(rev.response.status, rev.text).toBe(200);
    const prof = await t.as('stuuser', '/api/platform/rba');
    expect(prof.response.status).toBe(200);
    expect(JSON.parse(prof.data.profile.evidence_json).source).toBe('COUNSELOR_REVIEWED_GUIDANCE_ASSESSMENT');
    expect((await t.as('gt', '/api/platform/rba?studentId=s1')).response.status).toBe(200);
  });

  it('keeps the RBA profile from parents, branch teachers, managers and other guidance teachers, and retires self-report writes', async () => {
    const t = await setup();
    for (const who of ['parent', 'teacher', 'mgr', 'gtb']) expect((await t.as(who, '/api/platform/rba?studentId=s1')).response.status, who).toBe(403);
    for (const who of ['stuuser', 'parent', 'teacher', 'admin']) {
      const w = await t.as(who, '/api/platform/rba?studentId=s1', 'POST', { version: 'RBA-1', dimensions: { analytical: { a: 5 } } });
      expect(w.response.status, who).toBe(410);
    }
    expect(t.db.prepare(`SELECT count(*) c FROM rba_profiles`).get()).toMatchObject({ c: 0 });
    expect((await t.as('admin', '/api/platform/rba?studentId=s1')).response.status).toBe(200);
    // a student asking for another student's profile gets only their own
    t.db.exec(`INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES('s2','AYSE','KAYA','AYSE KAYA','ACTIVE');
      INSERT INTO rba_profiles(student_id,analytical_score,confidence,evidence_json) VALUES('s2',77,0.9,'{}');`);
    expect((await t.as('stuuser', '/api/platform/rba?studentId=s2')).data.profile).toBeNull();
  });
});
