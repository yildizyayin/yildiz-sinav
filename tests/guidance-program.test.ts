import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import { addDays, istanbulToday, mondayOf, readSettings } from '../worker/lib/guidance-program';

/** Rehberlik R2 (owner, 12 Nov 2026): the ready weekly programme, Bu Haftam, verified vs declared work. Synthetic data only. */
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
const base = { week, weeklyTarget: 200, weakPct: 60, worksheetPct: 30, reviewPct: 10 };

describe('guidance weekly programme R2', () => {
  it('validates the settings', () => {
    expect(readSettings({ weeklyTarget: 5 })).toHaveProperty('error');
    expect(readSettings({ weeklyTarget: 100, weakPct: 50, worksheetPct: 30, reviewPct: 10 })).toHaveProperty('error');
    expect(readSettings({ weeklyTarget: 100 })).toMatchObject({ weakPct: 60, worksheetPct: 30, reviewPct: 10, studyDays: [1, 2, 3, 4, 5, 6], reviewDay: 7 });
  });

  it('prepares a week from the student’s weak outcomes and the class worksheet, each row with its reason', async () => {
    const t = await setup();
    t.db.exec(`INSERT INTO worksheets(id,academic_year,grade_level,track,sequence_no,title,status) VALUES('ws1','2026-2027',8,'NUMERIC',6,'Mavi Föy 8 · 6. hafta','PUBLISHED');
      INSERT INTO worksheet_subjects(id,worksheet_id,subject_id,question_count) VALUES('wss1','ws1','sub_mat',20);
      INSERT INTO worksheet_calendar_entries(id,worksheet_id,institution_id,class_id,planned_date) VALUES('wc1','ws1','school','c8a','${addDays(week, 1)}');`);
    expect((await t.as('gt', '/api/guidance-program/generate', 'POST', { ...base, studentIds: ['s9'] })).response.status).toBe(403);
    expect((await t.as('gt', '/api/guidance-program/generate', 'POST', { ...base, weeklyTarget: 0, studentIds: ['s1'] })).response.status).toBe(400);
    expect((await t.as('gt', '/api/guidance-program/generate', 'POST', { ...base, week: addDays(week, 1), studentIds: ['s1'] })).response.status).toBe(400); // not a Monday
    const g = await t.as('gt', '/api/guidance-program/generate', 'POST', { ...base, classId: 'c8a' });
    expect(g.response.status, g.text).toBe(200);
    const pid = g.data.results[0].programId;
    const d = await t.as('gt', `/api/guidance-program/programs/${pid}`);
    const items = d.data.items;
    expect(items.some((i: any) => i.kind === 'WEAK' && /yanlış ya da boş/.test(i.reason))).toBe(true);
    expect(items.some((i: any) => i.kind === 'WORKSHEET' && i.source === 'MAVI_FOY' && i.source_detail === 'Mavi Föy 8 · 6. hafta')).toBe(true);
    const review = items.find((i: any) => i.kind === 'REVIEW');
    expect(review).toMatchObject({ day: 7, topic: 'Haftanın yanlışlarını tekrar' });
    expect(items.filter((i: any) => i.kind !== 'REVIEW').every((i: any) => i.day >= 1 && i.day <= 6)).toBe(true);
    const sum = items.reduce((a: number, i: any) => a + i.target_count, 0);
    expect(Math.abs(sum - 200)).toBeLessThanOrEqual(25); // rows are rounded to fives
    expect(items.every((i: any) => i.reason)).toBe(true);
    // a draft is not the student's yet
    expect((await t.as('stuuser', `/api/guidance-program/programs/${pid}`)).response.status).toBe(404);
    expect((await t.as('stuuser', `/api/guidance-program/mine?week=${week}`)).data.program).toBeNull();
    expect((await t.as('gtb', `/api/guidance-program/programs/${pid}`)).response.status).toBe(404);
  });

  it('adds the subject teacher’s target, gives the week and tells the student and parent', async () => {
    const t = await setup();
    const g = await t.as('gt', '/api/guidance-program/generate', 'POST', { ...base, studentIds: ['s1'] });
    const pid = g.data.results[0].programId;
    expect((await t.as('teacher', '/api/guidance-program/targets', 'POST', { week, classId: 'c8b', subjectId: 'sub_mat', topic: 'Üslü ifadeler', targetCount: 40 })).response.status).toBe(403);
    const tt = await t.as('teacher', '/api/guidance-program/targets', 'POST', { week, classId: 'c8a', subjectId: 'sub_mat', topic: 'Üslü ifadeler', targetCount: 40 });
    expect(tt.response.status, tt.text).toBe(201); expect(tt.data.addedToPrograms).toBe(1);
    const d = await t.as('gt', `/api/guidance-program/programs/${pid}`);
    expect(d.data.items.find((i: any) => i.origin === 'TEACHER')).toMatchObject({ topic: 'Üslü ifadeler', target_count: 40, reason: 'Synthetic Teacher öğretmenin bu haftaki ders hedefi.' });
    // the guidance teacher edits: moves a row, adds one, removes one
    const first = d.data.items[0];
    expect((await t.as('gt', `/api/guidance-program/items/${first.id}`, 'PATCH', { day: 3, targetCount: 25 })).response.status).toBe(200);
    expect((await t.as('gt', `/api/guidance-program/programs/${pid}/items`, 'POST', { day: 2, topic: 'Paragraf', subjectId: 'sub_tur', source: 'OKUL_KITABI', targetCount: 30 })).response.status).toBe(201);
    expect((await t.as('gt', `/api/guidance-program/programs/${pid}`, 'PATCH', { note: 'Hafta sonu dinlenmeyi unutma.', showSignature: false })).response.status).toBe(200);
    expect((await t.as('gt', `/api/guidance-program/programs/${pid}/give`, 'POST', {})).data.given).toBe(1);
    expect(t.db.prepare(`SELECT recipient_user_id r FROM notifications WHERE type='GUIDANCE_PROGRAM' ORDER BY r`).all()).toEqual([{ r: 'parent' }, { r: 'stuuser' }]);
    const mine = await t.as('stuuser', `/api/guidance-program/mine?week=${week}`);
    expect(mine.data.program).toMatchObject({ id: pid, status: 'GIVEN', note: 'Hafta sonu dinlenmeyi unutma.', show_signature: 0 });
    const child = await t.as('parent', `/api/guidance-program/child?week=${week}`);
    expect(child.data.program.id).toBe(pid); expect(child.data.children.map((c: any) => c.id)).toEqual(['s1']);
    // a given week is not re-prepared over the guidance teacher's head
    expect((await t.as('gt', '/api/guidance-program/generate', 'POST', { ...base, studentIds: ['s1'] })).data.results[0].skipped).toBe('GIVEN');
  });

  it('keeps verified work and the student’s declarations apart', async () => {
    const t = await setup();
    const pid = (await t.as('gt', '/api/guidance-program/generate', 'POST', { ...base, studentIds: ['s1'] })).data.results[0].programId;
    await t.as('gt', `/api/guidance-program/programs/${pid}/give`, 'POST', {});
    // questions solved inside ANUNEX
    t.db.exec(`INSERT INTO question_bank(id,subject_id,stem_text,correct_answer) VALUES('qb1','sub_mat','2+2?','A'),('qb2','sub_mat','3+3?','B');
      INSERT INTO question_practice_attempts(id,student_id,question_id,selected_answer,is_correct) VALUES('pa1','s1','qb1','A',1),('pa2','s1','qb2','C',0);`);
    expect((await t.as('stuuser', '/api/guidance-program/logs', 'POST', { subjectId: 'sub_mat', source: 'ANUNEX', solved: 10 })).response.status).toBe(400);
    expect((await t.as('stuuser', '/api/guidance-program/logs', 'POST', { subjectId: 'sub_mat', source: 'OKUL_KITABI', solved: 5, correct: 4, wrong: 3 })).response.status).toBe(400);
    expect((await t.as('stuuser', '/api/guidance-program/logs', 'POST', { subjectId: 'sub_mat', source: 'OKUL_KITABI', solved: 20, correct: 15, wrong: 4, blank: 1, date: addDays(istanbulToday(), -9) })).response.status).toBe(400);
    expect((await t.as('stuuser', '/api/guidance-program/logs', 'POST', { subjectId: 'sub_mat', source: 'OKUL_KITABI', solved: 20, correct: 15, wrong: 4, blank: 1 })).response.status).toBe(201);
    expect((await t.as('parent', '/api/guidance-program/logs', 'POST', { solved: 5 })).response.status).toBe(403);
    const p = (await t.as('stuuser', `/api/guidance-program/mine?week=${week}`)).data.progress;
    expect(p.verified).toEqual({ solved: 2, correct: 1, accuracy: 0.5 });
    expect(p.declared).toEqual({ solved: 20, correct: 15, accuracy: 0.75 });
    expect(p.activeDays).toBe(1);
    // the student ticks a row, may add an own goal but not change the guidance teacher's rows
    const items = (await t.as('stuuser', `/api/guidance-program/programs/${pid}`)).data.items;
    expect((await t.as('stuuser', `/api/guidance-program/items/${items[0].id}`, 'PATCH', { done: true, targetCount: 1 })).response.status).toBe(200);
    expect(t.db.prepare(`SELECT done,target_count FROM guidance_program_items WHERE id=?`).get(items[0].id)).toEqual({ done: 1, target_count: items[0].target_count });
    expect((await t.as('stuuser', `/api/guidance-program/items/${items[0].id}`, 'DELETE')).response.status).toBe(403);
    const own = await t.as('stuuser', `/api/guidance-program/programs/${pid}/items`, 'POST', { day: 6, topic: 'Kendi denemem', targetCount: 15 });
    expect(own.response.status).toBe(201);
    expect(t.db.prepare(`SELECT origin,kind FROM guidance_program_items WHERE id=?`).get(own.data.id)).toEqual({ origin: 'STUDENT', kind: 'OWN' });
    expect((await t.as('stuuser', `/api/guidance-program/items/${own.data.id}`, 'DELETE')).response.status).toBe(200);
    const after = (await t.as('gt', `/api/guidance-program/overview?classId=c8a&week=${week}`)).data.students[0].program;
    expect(after.completion).toBeGreaterThan(0); expect(after.status).toBe('GIVEN');
  });

  it('warns when two weeks in a row stay under half, and adjusts the next week to the pace', async () => {
    const t = await setup();
    for (const w of [addDays(week, -14), addDays(week, -7)]) {
      const pid = (await t.as('gt', '/api/guidance-program/generate', 'POST', { ...base, week: w, studentIds: ['s1'] })).data.results[0].programId;
      await t.as('gt', `/api/guidance-program/programs/${pid}/give`, 'POST', {});
    }
    const w = await t.as('gt', '/api/guidance-center/warnings');
    expect(w.data.warnings.find((x: any) => x.key === 'PROGRAM')).toMatchObject({ studentId: 's1', reason: 'Son iki haftada programın %0 ve %0’i yapıldı.' });
    const g = await t.as('gt', '/api/guidance-program/generate', 'POST', { ...base, studentIds: ['s1'] });
    expect(g.data.results[0].total).toBe(140); // 200 × 0.7 after a week with nothing done
    expect(g.data.results[0].notes[0]).toMatch(/Geçen hafta programın %0’i yapıldı/);
  });
});
