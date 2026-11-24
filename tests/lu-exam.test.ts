import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** Nibiru denemesi (owner, 11 Nov 2026): 10/20 new questions of the own grade, graded here, into the karne. Synthetic data only. */
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

function moreQuestions(t: any, o: any) {
  const tur = t.db.prepare(`SELECT id,subject_id FROM outcomes WHERE code='T.8.1.1'`).get() as any;
  t.db.prepare(`INSERT OR IGNORE INTO learning_nodes(id,academic_year,node_type,subject_id,grade_level,code,title) VALUES(?,?,'OUTCOME',?,8,'T.8.1.1','Sentetik')`).run(`ln_${tur.id}`, o.y, tur.subject_id);
  const q = t.db.prepare(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,option_count,copyright_status,review_status) VALUES(?,'PLATFORM',?,8,?,'MULTIPLE_CHOICE',?,'["Bir","İki","Üç","Dört"]','B',4,?,?)`);
  for (let i = 1; i <= 8; i++) { q.run(`tq${i}`, o.y, tur.subject_id, `Türkçe sentetik ${i}`, 'OWNED', 'APPROVED'); t.db.prepare('INSERT INTO question_learning_links(question_id,node_id) VALUES(?,?)').run(`tq${i}`, `ln_${tur.id}`); }
  q.run('tq_draft', o.y, tur.subject_id, 'Taslak', 'OWNED', 'DRAFT'); t.db.prepare('INSERT INTO question_learning_links(question_id,node_id) VALUES(?,?)').run('tq_draft', `ln_${tur.id}`);
  q.run('tq_rights', o.y, tur.subject_id, 'Hakları kısıtlı', 'RESTRICTED', 'APPROVED'); t.db.prepare('INSERT INTO question_learning_links(question_id,node_id) VALUES(?,?)').run('tq_rights', `ln_${tur.id}`);
  return tur;
}

it('builds a 10-question exam from new approved questions across outcomes, hides keys, grades once and feeds the karne', async () => {
  const { t, o } = await setup();
  try {
    const tur = moreQuestions(t, o);
    const ask = (body: any, user = 'stuuser') => t.request('/api/student-standard/universe/exams', 'POST', body, user);
    expect((await ask({ questionCount: 15 })).data.error.code).toBe('INVALID_SIZE');
    expect((await ask({ questionCount: 20 })).data.error).toMatchObject({ code: 'NOT_ENOUGH_QUESTIONS', details: { available: 14, needed: 20 } });
    expect((await ask({ questionCount: 10, subjectId: tur.subject_id })).data.error.details.available).toBe(8);
    expect((await ask({ questionCount: 10 }, 'teacher')).response.status).toBe(403);

    const made = await ask({ questionCount: 10, clientKey: 'exam-key-0001' });
    expect(made.response.status, made.text).toBe(201);
    expect((await ask({ questionCount: 10, clientKey: 'exam-key-0001' })).data.exam.id).toBe(made.data.exam.id);   // a resend is the same exam
    const items = made.data.items;
    expect(items).toHaveLength(10);
    const ids = t.db.prepare(`SELECT question_id FROM nibiru_practice_exam_items WHERE exam_id=? ORDER BY seq`).all(made.data.exam.id).map((r: any) => r.question_id);
    expect(new Set(ids).size).toBe(10);
    expect(ids.some((id: string) => id.startsWith('lq'))).toBe(true);
    expect(ids.some((id: string) => id.startsWith('tq'))).toBe(true);                       // spread across outcomes
    expect(ids).not.toContain('tq_draft');
    expect(ids).not.toContain('tq_rights');
    expect(JSON.stringify(made.data)).not.toMatch(/"key":"[A-E]","solution"|correct_answer|"solution"|"answer":/);
    expect(items.every((i: any) => !("key" in i) && !("correct" in i))).toBe(true);

    // shown questions are not used again
    expect((await ask({ questionCount: 10 })).data.error.details.available).toBe(4);

    const exam = made.data.exam.id;
    expect((await t.request(`/api/student-standard/universe/exams/${exam}/submit`, 'POST', { answers: items.slice(1).map((i: any) => ({ seq: i.seq, answer: 'A' })) }, 'stuuser')).data.error.code).toBe('ALL_QUESTIONS_REQUIRED');
    const answers = items.map((i: any, k: number) => ({ seq: i.seq, answer: k === 0 ? '' : i.outcome.code === 'M.8.1.1' ? 'A' : 'B' }));
    const done = await t.request(`/api/student-standard/universe/exams/${exam}/submit`, 'POST', { answers }, 'stuuser');
    expect(done.response.status, done.text).toBe(200);
    expect(done.data.exam).toMatchObject({ status: 'SUBMITTED', correct: 9, blank: 1, scorePercent: 90 });
    expect(done.data.items[0]).toMatchObject({ answer: null, correct: false, key: expect.stringMatching(/^[AB]$/) });
    expect(done.data.outcomes.reduce((n: number, x: any) => n + x.total, 0)).toBe(10);
    expect((t.db.prepare(`SELECT count(*) n FROM question_practice_attempts WHERE student_id='s1'`).get() as any).n).toBe(9);   // a blank is not an answer
    await t.request(`/api/student-standard/universe/exams/${exam}/submit`, 'POST', { answers: answers.map((a: any) => ({ ...a, answer: 'C' })) }, 'stuuser');
    expect((await t.request(`/api/student-standard/universe/exams/${exam}`, 'GET', undefined, 'stuuser')).data.exam.correct).toBe(9);
    expect((t.db.prepare(`SELECT count(*) n FROM question_practice_attempts WHERE student_id='s1'`).get() as any).n).toBe(9);

    const ev = (await t.request('/api/reporting/students/s1/outcome-evidence', 'GET', undefined, 'admin')).data.outcomes.find((x: any) => x.outcomeId === tur.id);
    expect(ev.bySource.QUESTION_BANK.attempts).toBeGreaterThan(0);
    expect((await t.request('/api/student-standard/universe/exams', 'GET', undefined, 'stuuser')).data.exams[0]).toMatchObject({ id: exam, status: 'SUBMITTED', correct_count: 9 });
    t.db.exec(`UPDATE platform_features SET enabled_default=0 WHERE feature_key='LEARNING_UNIVERSE'`);
    expect((await ask({ questionCount: 10 })).response.status).toBe(403);
  } finally { t.db.close(); }
}, 90000);
