import { expect, it } from 'vitest';
import { difficultyCentre, questionsForGap } from '../worker/lib/dejavu';
import { evaluatedExam } from './helpers/exam-flow';

/** Dejavu (owner, 10 Nov 2026): the book follows the unified karne, never repeats a met question, and its answers return to the karne. Synthetic data only. */
it('sizes and pitches each outcome by its gap', () => {
  expect([null, 0.2, 0.5, 0.65, 0.75].map(questionsForGap)).toEqual([4, 8, 6, 5, 3]);
  expect([null, 0.2, 0.5, 0.75].map(difficultyCentre)).toEqual([3, 2, 3, 4]);
});

it('builds from the karne, skips met / foreign / restricted / other-grade questions, and grades answers back into the karne', async () => {
  const t = await evaluatedExam('direct', { outcomes: true });
  try {
    expect((await t.request(`${t.base}/release`, 'POST', {})).response.status).toBe(200);
    const o = t.db.prepare(`SELECT id,subject_id FROM outcomes WHERE code='M.8.1.1'`).get() as any;
    t.db.prepare(`INSERT OR IGNORE INTO learning_nodes(id,academic_year,node_type,subject_id,grade_level,code,title) VALUES(?,'2026-2027','OUTCOME',?,8,'M.8.1.1','Sentetik')`).run(`ln_${o.id}`, o.subject_id);
    t.db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('other_school','Başka','OTHER','ACTIVE')`);
    const add = t.db.prepare(`INSERT INTO question_bank(id,owner_type,owner_id,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,option_count,copyright_status,review_status,difficulty_level) VALUES(?,?,?,'2026-2027',?,?,'MULTIPLE_CHOICE',?,'["A","B","C","D"]','A',4,?,'APPROVED',?)`);
    const link = t.db.prepare('INSERT INTO question_learning_links(question_id,node_id) VALUES(?,?)');
    for (let i = 1; i <= 12; i++) { add.run(`dj${i}`, 'PLATFORM', null, 8, o.subject_id, `Dejavu sentetik ${i}`, 'OWNED', 1 + (i % 5)); link.run(`dj${i}`, `ln_${o.id}`); }
    for (const [id, owner, ownerId, grade, rights] of [['dj_foreign', 'INSTITUTION', 'other_school', 8, 'OWNED'], ['dj_restricted', 'PLATFORM', null, 8, 'RESTRICTED'], ['dj_g7', 'PLATFORM', null, 7, 'OWNED']] as const) {
      add.run(id, owner, ownerId, grade, o.subject_id, `Dışarıda kalmalı ${id}`, rights, 3); link.run(id, `ln_${o.id}`);
    }
    t.db.exec(`INSERT INTO question_practice_attempts(id,student_id,question_id,selected_answer,is_correct) VALUES('pa1','s1','dj1','B',0)`);

    const first = await t.request('/api/student-books/personal', 'POST', {}, 'stuuser');
    expect(first.response.status, first.text).toBe(201);
    const items = (id: string) => (t.db.prepare(`SELECT id,bank_question_id q,solution_code c FROM student_personal_book_items WHERE book_id=? AND item_type='PRACTICE_QUESTION' ORDER BY sort_order`).all(id) as any[]);
    const a = items(first.data.id);
    // M.8.1.1: 2 right of 4 in the published deneme + 1 wrong practice answer → 40% → 6 questions around medium difficulty
    expect(a).toHaveLength(6);
    expect(a.every((x) => /^dj\d+$/.test(x.q) && x.q !== 'dj1')).toBe(true);
    expect(a.every((x) => /^[a-z2-9]{9}$/.test(x.c))).toBe(true);
    const header = JSON.parse((t.db.prepare(`SELECT payload_json p FROM student_personal_book_items WHERE book_id=? AND item_type='OUTCOME_HEADER' AND outcome_id=?`).get(first.data.id, o.id) as any).p);
    expect(header).toMatchObject({ gapSource: 'KARNE', wanted: 6, found: 6, successRate: 0.4 });

    // the next book never repeats: 11 eligible − 6 used = 5, so it says the outcome is one short
    const second = await t.request('/api/student-books/personal', 'POST', {}, 'stuuser');
    const b = items(second.data.id);
    expect(b).toHaveLength(5);
    expect(b.some((x) => a.some((y) => y.q === x.q))).toBe(false);
    expect(second.data.shortages).toContainEqual({ outcomeId: o.id, title: expect.any(String), wanted: 6, found: 5 });

    // answers: unanswered items hide the key; answered ones are final and become DEJAVU evidence
    const detail = (await t.request(`/api/student-books/personal/${first.data.id}`, 'GET', undefined, 'stuuser')).data;
    expect(detail.items.find((x: any) => x.item_type === 'PRACTICE_QUESTION').correct_answer).toBeUndefined();
    const sent = await t.request(`/api/student-books/personal/${first.data.id}/answers`, 'POST', { answers: [
      { itemId: a[0].id, answer: 'a' }, { itemId: a[1].id, answer: 'A' }, { itemId: a[2].id, answer: 'A' }, { itemId: a[3].id, answer: 'C' }, { itemId: a[4].id, answer: 'Z' }, { itemId: b[0].id, answer: 'A' },
    ] }, 'stuuser');
    expect(sent.response.status, sent.text).toBe(200);
    expect(sent.data).toMatchObject({ newlyAnswered: 4, total: 6, answered: 4, correct: 3 });
    const again = await t.request(`/api/student-books/personal/${first.data.id}/answers`, 'POST', { answers: [{ itemId: a[3].id, answer: 'A' }] }, 'stuuser');
    expect(again.data).toMatchObject({ newlyAnswered: 0, answered: 4, correct: 3 });
    const ev = (await t.request('/api/reporting/students/s1/outcome-evidence', 'GET', undefined, 'admin')).data.outcomes.find((x: any) => x.code === 'M.8.1.1');
    expect(ev.bySource.DEJAVU).toEqual({ attempts: 4, correct: 3 });
    const listed = (await t.request('/api/student-books/personal', 'GET', undefined, 'stuuser')).data.books.find((x: any) => x.id === first.data.id);
    expect(listed).toMatchObject({ answered_count: 4, correct_count: 3 });
    expect((await t.request(`/api/student-books/personal/${first.data.id}/answers`, 'POST', { answers: [] }, 'parent')).response.status).toBe(403);
  } finally { t.db.close(); }
}, 60000);

it('prints a cover, QR solution links and the answer key; the QR page reveals only on request and then stops counting that answer', async () => {
  const { PDFDocument } = await import('pdf-lib');
  const { renderDejavuBookPdf, renderDejavuAnswerKeyPdf } = await import('../worker/lib/studio-pdf');
  const t = await evaluatedExam('direct', { outcomes: true });
  try {
    expect((await t.request(`${t.base}/release`, 'POST', {})).response.status).toBe(200);
    const o = t.db.prepare(`SELECT id,subject_id FROM outcomes WHERE code='M.8.1.1'`).get() as any;
    t.db.prepare(`INSERT OR IGNORE INTO learning_nodes(id,academic_year,node_type,subject_id,grade_level,code,title) VALUES(?,'2026-2027','OUTCOME',?,8,'M.8.1.1','Sentetik')`).run(`ln_${o.id}`, o.subject_id);
    const add = t.db.prepare(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,option_count,copyright_status,review_status,solution_text) VALUES(?,'PLATFORM','2026-2027',8,?,'MULTIPLE_CHOICE',?,'["-32","32","-16","16"]','A',4,'OWNED','APPROVED','Üsler çarpılırken tabanlar korunur.')`);
    for (let i = 1; i <= 6; i++) { add.run(`dp${i}`, o.subject_id, `Sentetik üslü soru ${i}`); t.db.prepare('INSERT INTO question_learning_links(question_id,node_id) VALUES(?,?)').run(`dp${i}`, `ln_${o.id}`); }
    t.db.prepare(`INSERT INTO video_links(id,outcome_id,link_type,url,approved,title) VALUES('vl1',?,'TOPIC','https://www.youtube.com/watch?v=abcdefghijk',1,'Üslü ifadeler')`).run(o.id);
    const made = await t.request('/api/student-books/personal', 'POST', {}, 'stuuser');
    expect(made.data.questionCount).toBe(6);

    const pdf = await t.request(`/api/student-books/personal/${made.data.id}/pdf`, 'GET', undefined, 'stuuser');
    expect(pdf.response.status, pdf.text.slice(0, 200)).toBe(200);
    expect(pdf.response.headers.get('Content-Disposition')).toContain('dejavu-kitabim.pdf');
    const ids = ['dp1', 'dp2', 'dp3', 'dp4', 'dp5', 'dp6'];
    const sections = [{ heading: 'Matematik · Üslü ifadeler', note: null, items: ids.map((questionId, i) => ({ questionId, solutionUrl: `https://app.anunex.com/dejavu/cozum/kod${i}abcdef` })) }];
    const base = { title: 'Dejavu · Kişiye Özel Kitabım', studentName: 'Ali Yılmaz', classLine: '8/A · 2026-2027', institutionName: 'Sentetik Okul', dateLabel: '10 Kasım 2026', bookUrl: 'https://app.anunex.com/my-books', sections };
    const withKey = await renderDejavuBookPdf(t.env as any, { ...base, answerKey: 'APPEND' });
    const withoutKey = await renderDejavuBookPdf(t.env as any, { ...base, answerKey: 'NONE' });
    expect(withKey.questionCount).toBe(6);
    expect(withKey.pageCount).toBe(withoutKey.pageCount + 1);   // the key is its own last page
    expect(withoutKey.pageCount).toBeGreaterThanOrEqual(2);     // cover + questions
    expect((await PDFDocument.load(await renderDejavuAnswerKeyPdf(t.env as any, 'Dejavu', ids))).getPageCount()).toBe(1);

    const item = t.db.prepare(`SELECT id,solution_code c FROM student_personal_book_items WHERE book_id=? AND item_type='PRACTICE_QUESTION' ORDER BY sort_order LIMIT 2`).all(made.data.id) as any[];
    const look = await t.request(`/api/student-books/solutions/${item[0].c}`, 'GET', undefined, 'stuuser');
    expect(look.response.status, look.text).toBe(200);
    expect(look.data).toMatchObject({ number: 1, video: { url: 'https://www.youtube.com/watch?v=abcdefghijk' }, countsAsEvidence: true });
    expect(look.data.solution).toBeUndefined();
    const shown = await t.request(`/api/student-books/solutions/${item[0].c}/reveal`, 'POST', {}, 'stuuser');
    expect(shown.data).toMatchObject({ solution: { correctAnswer: 'A', text: 'Üsler çarpılırken tabanlar korunur.' }, countsAsEvidence: false });
    // the revealed one is answered afterwards (not evidence); the other one before any reveal (evidence)
    await t.request(`/api/student-books/personal/${made.data.id}/answers`, 'POST', { answers: [{ itemId: item[0].id, answer: 'A' }, { itemId: item[1].id, answer: 'B' }] }, 'stuuser');
    const ev = (await t.request('/api/reporting/students/s1/outcome-evidence', 'GET', undefined, 'admin')).data.outcomes.find((x: any) => x.code === 'M.8.1.1');
    expect(ev.bySource.DEJAVU).toEqual({ attempts: 1, correct: 0 });
    expect((await t.request('/api/student-books/solutions/zzzzzzzzz', 'GET', undefined, 'stuuser')).response.status).toBe(404);
    expect((await t.request(`/api/student-books/solutions/${item[0].c}`, 'GET', undefined, 'parent')).response.status).toBe(403);
  } finally { t.db.close(); }
}, 60000);
