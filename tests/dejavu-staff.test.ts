import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import app from '../worker/preview-policy-production-entry';
import { createSession } from '../worker/lib/auth';

/** Dejavu staff side (owner, 10 Nov 2026): prepare, preview and print only for permitted students. Synthetic data only. */
async function asUser(t: any, userId: string, path: string, method = 'GET', body?: any) {
  const cookie = (await createSession(t.env, userId, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const res = await (app as any).fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookie, Origin: 'https://app.anunex.com', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) }), t.env, { waitUntil() {}, passThroughOnException() {} });
  const type = res.headers.get('Content-Type') || '';
  return { response: res, data: type.includes('json') ? await res.json() : null as any };
}

it('lets permitted staff prepare and print books, a subject teacher only for their subject, a whole class in one PDF', async () => {
  const t = await evaluatedExam('direct', { outcomes: true });
  try {
    expect((await t.request(`${t.base}/release`, 'POST', {})).response.status).toBe(200);
    const m = t.db.prepare(`SELECT id,subject_id FROM outcomes WHERE code='M.8.1.1'`).get() as any;
    t.db.prepare(`INSERT OR IGNORE INTO learning_nodes(id,academic_year,node_type,subject_id,grade_level,code,title) VALUES(?,'2026-2027','OUTCOME',?,8,'M.8.1.1','Sentetik')`).run(`ln_${m.id}`, m.subject_id);
    const add = t.db.prepare(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,option_count,copyright_status,review_status) VALUES(?,'PLATFORM','2026-2027',8,?,'MULTIPLE_CHOICE',?,'["-32","32","-16","16"]','A',4,'OWNED','APPROVED')`);
    for (let i = 1; i <= 8; i++) { add.run(`ds${i}`, m.subject_id, `Sentetik soru ${i}`); t.db.prepare('INSERT INTO question_learning_links(question_id,node_id) VALUES(?,?)').run(`ds${i}`, `ln_${m.id}`); }
    t.db.exec(`INSERT INTO classes(id,institution_id,season_id,grade_level,section,name) VALUES('c8a','school','season',8,'A','8/A'),('c8b','school','season',8,'B','8/B');
      UPDATE student_enrollments SET class_id='c8a' WHERE student_id='s1';
      INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('turkce','TEACHER','Türkçe','x','x',1,'school'),('other','TEACHER','Başka','x','x',1,'school'),('mgr','INSTITUTION_MANAGER','Müdür','x','x',1,'school');
      INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,class_id,subject_id,assignment_type) VALUES
        ('ta1','teacher','school','season','c8a','${m.subject_id}','SUBJECT'),('ta2','turkce','school','season','c8a','sub_tur','SUBJECT'),('ta3','other','school','season','c8b','${m.subject_id}','SUBJECT');`);

    // the math teacher's book holds only math outcomes
    const made = await t.request('/api/reporting/students/s1/dejavu', 'POST', {}, 'teacher');
    expect(made.response.status, made.text).toBe(201);
    const subjects = (t.db.prepare(`SELECT DISTINCT subject_id s FROM student_personal_book_items WHERE book_id=?`).all(made.data.id) as any[]).map((r) => r.s);
    expect(subjects).toEqual([m.subject_id]);
    expect(made.data.questionCount).toBeGreaterThan(0);
    // the Turkish teacher sees only Turkish gaps; a teacher of another class and a student are refused
    const tur = await asUser(t, 'turkce', '/api/reporting/students/s1/dejavu', 'POST', {});
    if (tur.response.status === 201) expect((t.db.prepare(`SELECT DISTINCT subject_id s FROM student_personal_book_items WHERE book_id=?`).all(tur.data.id) as any[]).map((r) => r.s)).toEqual(['sub_tur']);
    else expect(tur.data.error.code).toBe('INSUFFICIENT_EVIDENCE');
    expect((await asUser(t, 'other', '/api/reporting/students/s1/dejavu', 'POST', {})).response.status).toBe(403);
    expect((await t.request('/api/reporting/students/s1/dejavu', 'POST', {}, 'stuuser')).response.status).toBe(403);
    expect((await asUser(t, 'other', `/api/reporting/dejavu/${made.data.id}/pdf`)).response.status).toBe(404);

    // preview: the book with or without its key, and the key alone
    const pdf = await t.request(`/api/reporting/dejavu/${made.data.id}/pdf?answerKey=0`, 'GET', undefined, 'teacher');
    expect(pdf.response.headers.get('Content-Type')).toBe('application/pdf');
    expect((await t.request(`/api/reporting/dejavu/${made.data.id}/answer-key`, 'GET', undefined, 'teacher')).response.headers.get('Content-Type')).toBe('application/pdf');

    // the class: listing, preparing for everyone, one merged PDF
    const list = await asUser(t, 'mgr', '/api/reporting/classes/c8a/dejavu');
    expect(list.data).toMatchObject({ className: '8/A', students: [{ studentId: 's1', latest: { id: expect.any(String) } }] });
    const bulk = await asUser(t, 'mgr', '/api/reporting/classes/c8a/dejavu', 'POST', {});
    expect(bulk.response.status).toBe(201);
    expect(bulk.data.results).toHaveLength(1);
    const merged = await asUser(t, 'mgr', '/api/reporting/classes/c8a/dejavu/pdf');
    expect(merged.response.status).toBe(200);
    expect(merged.response.headers.get('X-Dejavu-Books')).toBe('1');
    expect((await asUser(t, 'other', '/api/reporting/classes/c8a/dejavu')).response.status).toBe(403);
    // every new book avoids the questions of the earlier ones
    const all = (t.db.prepare(`SELECT i.bank_question_id q FROM student_personal_book_items i JOIN student_personal_books b ON b.id=i.book_id WHERE b.student_id='s1' AND i.item_type='PRACTICE_QUESTION'`).all() as any[]).map((r) => r.q);
    expect(new Set(all).size).toBe(all.length);
  } finally { t.db.close(); }
}, 90000);
