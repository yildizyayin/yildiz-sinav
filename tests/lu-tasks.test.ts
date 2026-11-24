import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import app from '../worker/preview-policy-production-entry';
import { createSession } from '../worker/lib/auth';

/** Öğrenme Evreni PR-5 (owner, 11 Nov 2026): teacher tasks — own class, own subject, own grade; done from finished games. Synthetic data only. */
async function asUser(t: any, userId: string, path: string, method = 'GET', body?: any) {
  const cookie = (await createSession(t.env, userId, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const res = await (app as any).fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookie, Origin: 'https://app.anunex.com', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) }), t.env, { waitUntil() {}, passThroughOnException() {} });
  return { response: res, data: await res.json().catch(() => null) as any };
}
async function setup() {
  const t = await evaluatedExam('direct', { outcomes: true });
  t.db.exec(`UPDATE platform_features SET enabled_default=1 WHERE feature_key='LEARNING_UNIVERSE'`);
  const o = t.db.prepare(`SELECT o.id,o.subject_id,cv.academic_year y FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE o.code='M.8.1.1'`).get() as any;
  t.db.prepare(`INSERT OR IGNORE INTO learning_nodes(id,academic_year,node_type,subject_id,grade_level,code,title) VALUES(?,?,'OUTCOME',?,8,'M.8.1.1','Sentetik')`).run(`ln_${o.id}`, o.y, o.subject_id);
  const q = t.db.prepare(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,option_count,copyright_status,review_status) VALUES(?,'PLATFORM',?,8,?,'MULTIPLE_CHOICE',?,'["-32","32","-16","16"]','A',4,'OWNED','APPROVED')`);
  for (let i = 1; i <= 6; i++) { q.run(`lq${i}`, o.y, o.subject_id, `Sentetik soru ${i}`); t.db.prepare('INSERT INTO question_learning_links(question_id,node_id) VALUES(?,?)').run(`lq${i}`, `ln_${o.id}`); }
  const c = t.db.prepare(`INSERT INTO lu_game_contents(id,content_kind,outcome_id,academic_year,grade_level,subject_id,public_json,answer_json,copyright_status,review_status) VALUES(?,?,?,?,8,?,?,?,?,?)`);
  const pairs = JSON.stringify({ left: [{ id: 'a', text: '2³' }, { id: 'b', text: '3²' }], right: [{ id: '1', text: '8' }, { id: '2', text: '9' }] });
  c.run('gc_pairs1', 'PAIRS', o.id, o.y, o.subject_id, pairs, JSON.stringify({ pairs: [['a', '1'], ['b', '2']] }), 'OWNED', 'APPROVED');
  c.run('gc_pairs_draft', 'PAIRS', o.id, o.y, o.subject_id, pairs, JSON.stringify({ pairs: [['a', '1'], ['b', '2']] }), 'OWNED', 'DRAFT');
  c.run('gc_pairs_rights', 'PAIRS', o.id, o.y, o.subject_id, pairs, JSON.stringify({ pairs: [['a', '1'], ['b', '2']] }), 'RESTRICTED', 'APPROVED');
  c.run('gc_seq1', 'SEQUENCE', o.id, o.y, o.subject_id, JSON.stringify({ items: [{ id: 'x', text: 'Üssü yaz' }, { id: 'y', text: 'Çarp' }, { id: 'z', text: 'Sonucu yaz' }] }), JSON.stringify({ order: ['x', 'y', 'z'] }), 'OWNED', 'APPROVED');
  c.run('gc_cloze1', 'CLOZE', o.id, o.y, o.subject_id, JSON.stringify({ text: '2³ = [b1]', blanks: [{ id: 'b1' }] }), JSON.stringify({ blanks: { b1: { numeric: { value: 8 } } } }), 'OWNED', 'APPROVED');
  return { t, o };
}

function classes(t: any, o: any) {
  t.db.exec(`INSERT INTO classes(id,institution_id,season_id,grade_level,section,name) VALUES('c8a','school','season',8,'A','8/A'),('c8b','school','season',8,'B','8/B');
    UPDATE student_enrollments SET class_id='c8a' WHERE student_id='s1';
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('other','TEACHER','Başka','x','x',1,'school');
    INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,class_id,subject_id,assignment_type) VALUES
      ('ta1','teacher','school','season','c8a','${o.subject_id}','SUBJECT'),('ta3','other','school','season','c8b','${o.subject_id}','SUBJECT');`);
}
const play = async (t: any, templateCode: string, outcomeId: string) => {
  const s = await t.request('/api/student-standard/universe/sessions', 'POST', { templateCode, outcomeId }, 'stuuser');
  expect(s.response.status, s.text).toBe(201);
  const answers = s.data.items.map((it: any) => ({ seq: it.seq, response: it.kind === 'PAIRS' ? { pairs: [] } : { answer: 'A' } }));
  await t.request(`/api/student-standard/universe/sessions/${s.data.session.id}/submit`, 'POST', { answers }, 'stuuser');
};

it('a subject teacher gives an own-subject outcome to own class; the student sees it first and finishing a game closes it', async () => {
  const { t, o } = await setup();
  try {
    classes(t, o);
    const cat = await t.request('/api/reporting/universe/task-outcomes?classId=c8a', 'GET', undefined, 'teacher');
    expect(cat.response.status, cat.text).toBe(200);
    const codes = cat.data.outcomes.map((x: any) => x.code);
    expect(codes).toContain('M.8.1.1');
    expect(codes).not.toContain('T.8.1.1');                                   // not the teacher's subject
    expect(cat.data.outcomes.find((x: any) => x.code === 'M.8.1.1').games.map((g: any) => g.code)).toContain('LU_CHOICE');
    expect((await asUser(t, 'other', '/api/reporting/universe/task-outcomes?classId=c8a')).response.status).toBe(403);

    const tur = t.db.prepare(`SELECT id FROM outcomes WHERE code='T.8.1.1'`).get() as any;
    expect((await t.request('/api/reporting/universe/tasks', 'POST', { classId: 'c8a', outcomeId: tur.id }, 'teacher')).data.error.code).toBe('NO_ELIGIBLE_STUDENTS');
    expect((await t.request('/api/reporting/universe/tasks', 'POST', { classId: 'c8a', outcomeId: o.id }, 'stuuser')).response.status).toBe(403);
    const made = await t.request('/api/reporting/universe/tasks', 'POST', { classId: 'c8a', outcomeId: o.id, templateCode: 'LU_CHOICE', dueAt: '2027-03-05', note: 'Cuma derse kadar' }, 'teacher');
    expect(made.response.status, made.text).toBe(201);
    expect(made.data).toMatchObject({ recipients: 1, skipped: 0 });

    let map = (await t.request('/api/student-standard/universe/map', 'GET', undefined, 'stuuser')).data;
    expect(map.tasks).toEqual([expect.objectContaining({ outcomeId: o.id, game: 'LU_CHOICE', dueAt: '2027-03-05', note: 'Cuma derse kadar' })]);
    let list = (await t.request('/api/reporting/universe/tasks', 'GET', undefined, 'teacher')).data.tasks;
    expect(list[0]).toMatchObject({ recipients: 1, done: 0, template: { code: 'LU_CHOICE' } });
    expect((await asUser(t, 'other', '/api/reporting/universe/tasks')).data.tasks).toEqual([]);   // only own tasks
    expect((await asUser(t, 'other', `/api/reporting/universe/tasks/${made.data.id}/cancel`, 'POST', {})).response.status).toBe(404);

    await play(t, 'LU_MATCH', o.id);                                          // another kind does not close a LU_CHOICE task
    expect((await t.request('/api/student-standard/universe/map', 'GET', undefined, 'stuuser')).data.tasks).toHaveLength(1);
    await play(t, 'LU_CHOICE', o.id);
    map = (await t.request('/api/student-standard/universe/map', 'GET', undefined, 'stuuser')).data;
    expect(map.tasks).toEqual([]);
    list = (await t.request('/api/reporting/universe/tasks', 'GET', undefined, 'teacher')).data.tasks;
    expect(list[0]).toMatchObject({ recipients: 1, done: 1 });
    const detail = await t.request(`/api/reporting/universe/tasks/${made.data.id}`, 'GET', undefined, 'teacher');
    expect(detail.data.students).toEqual([expect.objectContaining({ studentId: 's1', done: true })]);

    // a manager sees the institution's tasks and can withdraw one; switched off → closed for staff
    expect((await t.request(`/api/reporting/universe/tasks/${made.data.id}/cancel`, 'POST', {}, 'teacher')).response.status).toBe(200);
    expect((await t.request('/api/reporting/universe/tasks', 'GET', undefined, 'teacher')).data.tasks).toEqual([]);
    t.db.exec(`UPDATE platform_features SET enabled_default=0 WHERE feature_key='LEARNING_UNIVERSE'`);
    expect((await t.request('/api/reporting/universe/tasks', 'GET', undefined, 'teacher')).response.status).toBe(403);
  } finally { t.db.close(); }
}, 90000);
