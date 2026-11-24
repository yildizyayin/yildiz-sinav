import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import { istanbulToday, mondayOf } from '../worker/lib/guidance-program';

/** Kazanım videosu in the weekly programme (owner, 12 Nov 2026): an outcome row carries its video segment. Synthetic data. */
async function setup() {
  const t = await evaluatedExam('direct', { outcomes: true });
  const rel = await t.request(`${t.base}/release`, 'POST', {});
  expect(rel.response.status, rel.text).toBeLessThan(300);
  t.db.exec(`INSERT INTO classes(id,institution_id,season_id,grade_level,section,name) VALUES('c8a','school','season',8,'A','8-A'),('c8b','school','season',8,'B','8-B');
    UPDATE student_enrollments SET class_id='c8a' WHERE student_id='s1';
    UPDATE student_answers SET status='WRONG' WHERE participant_id IN (SELECT id FROM exam_participants WHERE student_id='s1') AND rowid%2=0;
    INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES('s9','AYSE','KAYA','AYSE KAYA','ACTIVE');
    INSERT INTO student_enrollments(id,student_id,institution_id,season_id,class_id,student_number,grade_level,section,status) VALUES('enr9','s9','school','season','c8b','109',8,'B','ACTIVE');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('gt','GUIDANCE_TEACHER','Rehber A','unused','unused',1,'school'),('gtb','GUIDANCE_TEACHER','Rehber B','unused','unused',1,'school');
    INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,class_id,subject_id,assignment_type,active) VALUES('g1','gt','school','season','c8a',NULL,'GUIDANCE',1),('g2','gtb','school','season','c8b',NULL,'GUIDANCE',1),('t1','teacher','school','season','c8a','sub_mat','SUBJECT',1);`);
  const cookies: Record<string, string> = {};
  for (const id of ['gt', 'gtb']) cookies[id] = (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const app = (await import('../worker/preview-policy-production-entry')).default as any;
  const as = async (who: string, path: string, method = 'GET', body?: any) => {
    if (!cookies[who]) return t.request(path, method, body, who);
    const res = await app.fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookies[who], Origin: 'https://app.anunex.com', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {}, passThroughOnException() {} });
    const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ }
    return { response: res, data, text };
  };
  return { ...t, as };
}
const week = mondayOf(istanbulToday());

describe('weekly programme video', () => {
  it('gives each weak-outcome row its automatic video segment', async () => {
    const t = await setup();
    const g = await t.as('gt', '/api/guidance-program/generate', 'POST', { week, weeklyTarget: 200, weakPct: 60, worksheetPct: 30, reviewPct: 10, classId: 'c8a' });
    expect(g.response.status, g.text).toBe(200);
    const pid = g.data.results[0].programId;
    const row = t.db.prepare(`SELECT outcome_id FROM guidance_program_items WHERE program_id=? AND outcome_id IS NOT NULL LIMIT 1`).get(pid) as any;
    expect(row).toBeTruthy();
    t.db.prepare(`INSERT INTO outcome_auto_videos(id,outcome_id,youtube_video_id,title,duration_seconds,start_seconds,end_seconds,method) VALUES('opv',?,'AAAAAAAAAAA','Konu',600,60,300,'GEMINI')`).run(row.outcome_id);
    const d = await t.as('gt', `/api/guidance-program/programs/${pid}`);
    expect(d.response.status, d.text).toBe(200);
    const item = d.data.items.find((i: any) => i.outcome_id === row.outcome_id);
    expect(item.video).toEqual({ url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA&t=60s', title: 'Konu', source: 'AUTO', start: 60, end: 300 });
    expect(d.data.items.filter((i: any) => !i.outcome_id).every((i: any) => i.video === undefined)).toBe(true);
  });
});
