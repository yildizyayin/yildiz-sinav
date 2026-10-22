import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';

/** A058: personal book — gaps from published evidence only, questions linked to the gap outcome, usable PDF. Synthetic data only. */
const opts = `json('[{"label":"A","text":"birinci"},{"label":"B","text":"ikinci"},{"label":"C","text":"üçüncü"},{"label":"D","text":"dördüncü"}]')`;
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`DELETE FROM outcome_results WHERE student_id='s1';
    INSERT INTO outcome_results(id,student_id,exam_id,outcome_id,evidence_count,correct_count,success_rate,mastery_status) VALUES('or1','s1','${t.examId}','o_tur1',4,1,0.25,'DEVELOPING'),('or2','s1','${t.examId}','o_mat1',4,4,1,'STRONG');
    INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,option_count,copyright_status,review_status,topic) VALUES
      ('pq1','PLATFORM','2026-2027',8,'sub_tur','MULTIPLE_CHOICE','Paragrafın ana düşüncesi hangisidir?',${opts},'B',4,'OWNED','APPROVED',''),
      ('pq2','PLATFORM','2026-2027',8,'sub_tur','MULTIPLE_CHOICE','Metnin konusu nedir? Çğüşıö',${opts},'C',4,'OWNED','APPROVED',''),
      ('unlinked','PLATFORM','2026-2027',8,'sub_tur','MULTIPLE_CHOICE','Bağlantısız soru',${opts},'A',4,'OWNED','APPROVED',''),
      ('norights','PLATFORM','2026-2027',8,'sub_tur','MULTIPLE_CHOICE','Hakkı belirsiz soru',${opts},'A',4,'RESTRICTED','APPROVED','');
    INSERT INTO question_learning_links(question_id,node_id) VALUES('pq1','ln_o_tur1'),('pq2','ln_o_tur1'),('norights','ln_o_tur1');`);
  return t;
}

describe('A058 personal book', () => {
  it('uses only published results to find gaps and only questions linked to the gap outcome', async () => {
    const t = await setup();
    const before = await t.request('/api/student-books/personal', 'POST', {}, 'stuuser');
    expect(before.response.status, before.text).toBe(400); expect(before.data.error.code).toBe('INSUFFICIENT_EVIDENCE'); // results not published yet
    expect((await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST')).response.status).toBe(200);
    expect((await t.request(`/api/platform/exam-center/${t.examId}/publish`, 'POST')).response.status).toBe(200);
    const made = await t.request('/api/student-books/personal', 'POST', {}, 'stuuser');
    expect(made.response.status, made.text).toBe(201);
    expect(made.data).toMatchObject({ outcomeCount: 1, questionCount: 2 });
    const qids = (t.db.prepare(`SELECT bank_question_id q FROM student_personal_book_items WHERE book_id=? AND item_type='PRACTICE_QUESTION' ORDER BY bank_question_id`).all(made.data.id) as any[]).map((r) => r.q);
    expect(qids).toEqual(['pq1', 'pq2']);

    const pdf = await t.request(`/api/student-books/personal/${made.data.id}/pdf`, 'GET', undefined, 'stuuser');
    expect(pdf.response.status, pdf.text.slice(0, 300)).toBe(200);
    expect(pdf.response.headers.get('Content-Type')).toBe('application/pdf');
    expect(pdf.text.startsWith('%PDF')).toBe(true);
    // the same renderer, read back: question pages plus the answer-key page
    const { renderQuestionBookPdf } = await import('../worker/lib/studio-pdf');
    const out = await renderQuestionBookPdf(t.env as any, 'Kişiye Özel Kitabım', [{ heading: 'Türkçe · Ana fikir', questionIds: ['pq1', 'pq2'] }]);
    expect(out.questionCount).toBe(2);
    expect((await PDFDocument.load(out.bytes)).getPageCount()).toBe(2);
    // someone else's book is not reachable; a changed right blocks printing
    expect((await t.request(`/api/student-books/personal/${made.data.id}/pdf`, 'GET', undefined, 'parent')).response.status).toBe(403);
    t.db.exec(`INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES('s2','AYSE','KAYA','AYSE KAYA','ACTIVE');
      INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id,student_id) VALUES('stu2','STUDENT','Ayşe','unused','unused',1,'school','s2');`);
    const cookie = (await createSession(t.env, 'stu2', new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
    const app = (await import('../worker/preview-policy-production-entry')).default as any;
    const other = await app.fetch(new Request(`https://app.anunex.com/api/student-books/personal/${made.data.id}/pdf`, { headers: { Cookie: cookie } }), t.env, { waitUntil() {} });
    expect(other.status).toBe(404);
    t.db.exec(`UPDATE question_bank SET copyright_status='RESTRICTED' WHERE id='pq2'`);
    const blocked = await t.request(`/api/student-books/personal/${made.data.id}/pdf`, 'GET', undefined, 'stuuser');
    expect(blocked.response.status).toBe(409); expect(blocked.data.error.code).toBe('BOOK_CONTENT_CHANGED');
  });
});
