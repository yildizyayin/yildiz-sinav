import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { answer, boardView, close, join, newRace, next, playerView, ranking, report } from '../worker/lib/class-race-engine';
import { RaceRoom } from '../worker/lib/class-race-room';

/** Sınıf Uzay Yarışı (owner, 25–26 Nov 2026): roster-only, one answer, no points for speed, key hidden, evidence once. Synthetic data only. */
const q = (id: string, correct = 'A') => ({ id, stem: `Soru ${id}`, options: [{ key: 'A', text: '1' }, { key: 'B', text: '2' }, { key: 'C', text: '3' }, { key: 'D', text: '4' }], assets: [], correct });
const race = () => newRace({ id: 'r1', code: '4821', className: '8/A', outcome: { id: 'o', code: 'M.8.1.1', title: 'Üslü ifadeler' }, seconds: 20, questions: [q('q1'), q('q2', 'C')], roster: { s1: 'Ali Y.', s2: 'Ece K.', s3: 'Can D.' } });

it('plays by the rules: roster only, one answer while open, a point per correct answer, never for speed', () => {
  const s = race();
  expect(join(s, 'x9', 0)).toEqual({ ok: false, reason: 'NOT_IN_CLASS' });
  expect(next(s, 0)).toEqual({ ok: false, reason: 'NO_PLAYERS' });
  for (const id of ['s1', 's2', 's3']) expect(join(s, id, 0).ok).toBe(true);
  expect(answer(s, 's1', 0, 'A', 1)).toEqual({ ok: false, reason: 'QUESTION_CLOSED' });
  expect(next(s, 1000)).toEqual({ ok: true, phase: 'QUESTION' });
  expect(playerView(s, 's1', 1000).question).not.toHaveProperty('correct');            // the key stays in the room
  expect(JSON.stringify(boardView(s, 1000))).not.toContain('"correct"');
  expect(answer(s, 's2', 0, 'A', 1500)).toMatchObject({ ok: true, allIn: false });      // slow but right
  expect(answer(s, 's1', 0, 'B', 1100)).toMatchObject({ ok: true });                      // fast but wrong
  expect(answer(s, 's1', 0, 'A', 1200)).toEqual({ ok: false, reason: 'ALREADY_ANSWERED' });
  expect(answer(s, 's3', 0, 'Z', 1300)).toEqual({ ok: false, reason: 'INVALID_OPTION' });
  expect(answer(s, 's3', 0, 'A', 1000 + 20000 + 5000)).toEqual({ ok: false, reason: 'TIME_UP' });
  expect(next(s, 2000)).toEqual({ ok: false, reason: 'QUESTION_OPEN' });
  expect(close(s)).toBe(true);
  expect(close(s)).toBe(false);                                                            // points counted once
  expect(s.scores).toEqual({ s1: 0, s2: 1, s3: 0 });
  expect(playerView(s, 's1', 3000).reveal).toMatchObject({ correct: 'A', right: false, answered: true });
  expect(boardView(s, 3000).reveal).toEqual({ correct: 'A', counts: { A: 1, B: 1, C: 0, D: 0 } });
  next(s, 4000);
  for (const id of ['s1', 's2']) answer(s, id, 1, 'C', 4100);
  expect(answer(s, 's3', 1, 'C', 4200)).toMatchObject({ allIn: true });
  close(s);
  expect(ranking(s).map((r) => [r.name, r.score, r.rank])).toEqual([['Ece K.', 2, 1], ['Ali Y.', 1, 2], ['Can D.', 1, 2]]);
  expect(next(s, 5000)).toEqual({ ok: true, phase: 'FINISHED' });
  expect(report(s)).toMatchObject({ players: 3, asked: 2, rate: 67, hardest: { index: 1, correct: 1 } });
  expect(join(s, 's1', 6000).ok).toBe(true);                                                // a player may come back to see the end
});

async function setup() {
  const t = await evaluatedExam('direct', { outcomes: true });
  t.db.exec(`UPDATE platform_features SET enabled_default=1 WHERE feature_key='LEARNING_UNIVERSE'`);
  const o = t.db.prepare(`SELECT o.id,o.subject_id,cv.academic_year y FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE o.code='M.8.1.1'`).get() as any;
  t.db.exec(`INSERT INTO classes(id,institution_id,season_id,grade_level,section,name) VALUES('c8a','school','season',8,'A','8/A'),('c8b','school','season',8,'B','8/B');
    UPDATE student_enrollments SET class_id='c8a' WHERE id='enr1';
    INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,class_id,subject_id,assignment_type) VALUES('ta1','teacher','school','season','c8a','sub_mat','SUBJECT');`);
  t.db.prepare(`INSERT OR IGNORE INTO learning_nodes(id,academic_year,node_type,subject_id,grade_level,code,title) VALUES(?,?,'OUTCOME',?,8,'M.8.1.1','Sentetik')`).run(`ln_${o.id}`, o.y, o.subject_id);
  const ins = t.db.prepare(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,option_count,copyright_status,review_status) VALUES(?,'PLATFORM',?,8,?,'MULTIPLE_CHOICE',?,'["-32","32","-16","16"]','A',4,'OWNED',?)`);
  for (let i = 1; i <= 5; i++) { ins.run(`rq${i}`, o.y, o.subject_id, `Sentetik yarış sorusu ${i}`, i === 5 ? 'REVIEW' : 'APPROVED'); t.db.prepare('INSERT INTO question_learning_links(question_id,node_id) VALUES(?,?)').run(`rq${i}`, `ln_${o.id}`); }
  const calls: any[] = [];
  t.env.RACE_ROOMS = { idFromName: (n: string) => n, get: (id: string) => ({ fetch: async (url: string, init: any = {}) => { calls.push({ id, url, init }); return new Response(url.endsWith('/ws') ? 'ws' : 'ok', { status: 200 }); } }) };
  return { t, o, calls };
}

it('a teacher starts a race on a verified outcome of their own class, with approved questions only', async () => {
  const { t, o, calls } = await setup();
  try {
    expect((await t.request('/api/class-race/classes', 'GET', undefined, 'teacher')).data.classes.map((c: any) => c.id)).toEqual(['c8a']);
    expect((await t.request('/api/class-race', 'POST', { classId: 'c8b', outcomeId: o.id }, 'teacher')).data.error.code).toBe('CLASS_NOT_YOURS');
    expect((await t.request('/api/class-race', 'POST', { classId: 'c8a', outcomeId: 'o_tur_x' }, 'teacher')).data.error.code).toBe('OUTCOME_NOT_VERIFIED');
    expect((await t.request('/api/class-race', 'POST', { classId: 'c8a', outcomeId: o.id }, 'stuuser')).response.status).toBe(403);
    const r = await t.request('/api/class-race', 'POST', { classId: 'c8a', outcomeId: o.id, questionCount: 10, seconds: 5 }, 'teacher');
    expect(r.response.status, r.text).toBe(201);
    expect(r.data.race).toMatchObject({ className: '8/A', questionCount: 4, seconds: 10, students: 1, outcome: { code: 'M.8.1.1' } });
    expect(r.data.race.code).toMatch(/^\d{4}$/);
    const init = JSON.parse(calls[0].init.body);
    expect(init.questions.map((x: any) => x.id).sort()).toEqual(['rq1', 'rq2', 'rq3', 'rq4']);       // the question still in review stays out
    expect(init.roster).toEqual({ s1: 'ALI Y.' });

    // the class joins with the code; another student's class or a wrong code does not
    expect((await t.request(`/api/class-race/join?code=${r.data.race.code}`, 'GET', undefined, 'stuuser')).data.race.id).toBe(r.data.race.id);
    expect((await t.request('/api/class-race/join?code=0000', 'GET', undefined, 'stuuser')).response.status).toBe(404);
    // the live room is reached only through a socket upgrade, and only by the class and its teacher
    const plainReq = await t.request(`/api/class-race/${r.data.race.id}/ws`, 'GET', undefined, 'stuuser');
    expect(plainReq.response.status).toBe(426);                                                          // not a socket upgrade
    expect((await t.request(`/api/class-race/${r.data.race.id}`, 'GET', undefined, 'parent')).response.status).toBe(403);
    expect((await t.request(`/api/class-race/${r.data.race.id}`, 'GET', undefined, 'stuuser')).data.race.code).toBe(null);
  } finally { t.db.close(); }
});

it('runs live in the room and writes each answer to the karne once, as evidence of the race outcome', async () => {
  const { t, o, calls } = await setup();
  try {
    const r = await t.request('/api/class-race', 'POST', { classId: 'c8a', outcomeId: o.id, questionCount: 3 }, 'teacher');
    const init = JSON.parse(calls[0].init.body);
    const store = new Map<string, any>(); const sockets: any[] = []; let alarm: number | null = null;
    const state: any = { storage: { get: async (k: string) => store.get(k), put: async (k: string, v: any) => { store.set(k, JSON.parse(JSON.stringify(v))); }, setAlarm: async (at: number) => { alarm = at; } },
      acceptWebSocket: () => undefined, getWebSockets: () => sockets, blockConcurrencyWhile: async (f: any) => f() };
    const room = new RaceRoom(state, t.env);
    await room.fetch(new Request('https://race/init', { method: 'POST', body: JSON.stringify(init) }));
    const sock = (role: string, id: string) => { const s: any = { att: { role, id }, sent: [] as any[], send(m: string) { s.sent.push(JSON.parse(m)); }, deserializeAttachment: () => s.att }; sockets.push(s); return s; };
    const board = sock('board', 'teacher'), phone = sock('player', 's1');
    (room as any).s.players.s1 = { name: 'ALI Y.', joinedAt: Date.now() };
    await room.webSocketMessage(phone, JSON.stringify({ type: 'next' }));                                // a phone cannot drive the race
    expect((room as any).s.phase).toBe('LOBBY');
    await room.webSocketMessage(board, JSON.stringify({ type: 'next' }));
    expect(alarm).not.toBeNull();
    expect(board.sent.at(-1)).toMatchObject({ role: 'board', phase: 'QUESTION', qi: 0 });
    expect(t.db.prepare(`SELECT status FROM class_races WHERE id=?`).get(r.data.race.id)).toEqual({ status: 'RUNNING' });
    for (let k = 0; k < 3; k++) {
      if (k) await room.webSocketMessage(board, JSON.stringify({ type: 'next' }));
      await room.webSocketMessage(phone, JSON.stringify({ type: 'answer', qi: k, key: k === 2 ? 'B' : 'A' }));   // everyone in: closes at once
      expect(phone.sent.at(-1)).toMatchObject({ role: 'player', phase: 'REVEAL', reveal: { correct: 'A', right: k !== 2 } });
    }
    await room.webSocketMessage(board, JSON.stringify({ type: 'next' }));
    expect(board.sent.at(-1)).toMatchObject({ phase: 'FINISHED', report: { players: 1, asked: 3, rate: 67 } });
    const row = t.db.prepare(`SELECT status,report_json FROM class_races WHERE id=?`).get(r.data.race.id) as any;
    expect(row.status).toBe('FINISHED');
    const ses = t.db.prepare(`SELECT template_code,status,item_count,answered_count,correct_count,client_key,outcome_id FROM lu_sessions WHERE student_id='s1'`).all() as any[];
    expect(ses).toEqual([{ template_code: 'LU_CHOICE', status: 'SUBMITTED', item_count: 3, answered_count: 3, correct_count: 2, client_key: `race:${r.data.race.id}`, outcome_id: o.id }]);
    expect(t.db.prepare(`SELECT count(*) n FROM lu_xp_ledger WHERE student_id='s1'`).get()).toEqual({ n: 1 });
    // a second "end" changes nothing
    await (await import('../worker/lib/class-race')).persistRaceResults(t.env, (room as any).s);
    expect(t.db.prepare(`SELECT count(*) n FROM lu_sessions WHERE student_id='s1'`).get()).toEqual({ n: 1 });
    const ev = (await t.request('/api/reporting/students/s1/outcome-evidence', 'GET', undefined, 'admin')).data.outcomes.find((x: any) => x.code === 'M.8.1.1');
    expect(ev.bySource.GAME).toEqual({ attempts: 3, correct: 2 });
    expect((await t.request('/api/student-standard/universe/map', 'GET', undefined, 'stuuser')).data.planet).toMatchObject({ total: 2, seeds: 1 });
    expect((await t.request(`/api/class-race/${r.data.race.id}`, 'GET', undefined, 'teacher')).data.race.report).toMatchObject({ rate: 67 });
  } finally { t.db.close(); }
});
