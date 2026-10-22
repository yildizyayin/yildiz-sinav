import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** A059: zero-error booklet — published wrong/blank answers, outcome-linked permitted questions, frozen version, recorded progress. Synthetic data only. */
const opts = `json('[{"label":"A","text":"bir"},{"label":"B","text":"iki"},{"label":"C","text":"üç"},{"label":"D","text":"dört"}]')`;
describe('A059 zero-error booklet', () => {
  it('builds from published results only, freezes the question version and records each retry', async () => {
    const t = await evaluatedExam('direct', { outcomes: true });
    t.db.exec(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,option_count,copyright_status,review_status,topic) VALUES
      ('zt1','PLATFORM','2026-2027',8,'sub_tur','MULTIPLE_CHOICE','Türkçe benzer soru 1',${opts},'B',4,'OWNED','APPROVED',''),
      ('zt2','PLATFORM','2026-2027',8,'sub_tur','MULTIPLE_CHOICE','Türkçe benzer soru 2',${opts},'C',4,'OWNED','APPROVED',''),
      ('zm1','PLATFORM','2026-2027',8,'sub_mat','MULTIPLE_CHOICE','Matematik benzer soru',${opts},'A',4,'OWNED','APPROVED',''),
      ('zfree','PLATFORM','2026-2027',8,'sub_tur','MULTIPLE_CHOICE','Bağlantısız',${opts},'A',4,'OWNED','APPROVED',''),
      ('zrestr','PLATFORM','2026-2027',8,'sub_tur','MULTIPLE_CHOICE','Kısıtlı',${opts},'A',4,'RESTRICTED','APPROVED','');
      INSERT INTO question_learning_links(question_id,node_id) VALUES('zt1','ln_o_tur1'),('zt2','ln_o_tur1'),('zm1','ln_o_mat1'),('zrestr','ln_o_tur1');`);
    const missed = t.db.prepare(`SELECT count(DISTINCT sa.exam_question_id) c FROM student_answers sa JOIN exam_participants ep ON ep.id=sa.participant_id WHERE ep.student_id='s1' AND ep.exam_id=? AND sa.status IN ('WRONG','BLANK')`).get(t.examId) as any;
    expect(missed.c).toBeGreaterThan(0);
    // one missed question measures two outcomes: it still appears once
    const twoOutcome = (t.db.prepare(`SELECT sa.exam_question_id q FROM student_answers sa JOIN exam_participants ep ON ep.id=sa.participant_id WHERE ep.student_id='s1' AND ep.exam_id=? AND sa.status IN ('WRONG','BLANK') LIMIT 1`).get(t.examId) as any).q;
    t.db.prepare(`INSERT OR IGNORE INTO question_outcomes(exam_question_id,outcome_id) VALUES(?,'o_mat1'),(?,'o_tur1')`).run(twoOutcome, twoOutcome);
    const early = await t.request('/api/student-books/zero-error', 'POST', { examId: t.examId }, 'stuuser');
    expect(early.response.status, early.text).toBe(409); expect(early.data.error.code).toBe('RESULTS_NOT_PUBLISHED');
    expect((await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST')).response.status).toBe(200);
    expect((await t.request(`/api/platform/exam-center/${t.examId}/publish`, 'POST')).response.status).toBe(200);
    const made = await t.request('/api/student-books/zero-error', 'POST', { examId: t.examId, practicePerSource: 4 }, 'stuuser');
    expect(made.response.status, made.text).toBe(201);
    expect(made.data.unresolvedCount).toBe(missed.c);
    const items = t.db.prepare(`SELECT source_exam_question_id s,bank_question_id q FROM zero_error_booklet_items WHERE booklet_id=?`).all(made.data.id) as any[];
    expect(new Set(items.map((i) => i.s)).size).toBe(missed.c);
    const used = items.map((i) => i.q).filter(Boolean);
    expect(used.every((q: string) => ['zt1', 'zt2', 'zm1'].includes(q))).toBe(true);
    expect(new Set(used).size).toBe(used.length);
    expect(used.length).toBeGreaterThan(0);

    const d = (await t.request(`/api/student-books/zero-error/${made.data.id}`, 'GET', undefined, 'stuuser')).data;
    const it = d.items.find((x: any) => x.bank_question_id);
    const frozen = { stem: it.stem_text, key: it.correct_answer };
    // the question version is fixed: content of a question used in a booklet cannot change, even after reopening it
    t.db.prepare(`UPDATE question_bank SET review_status='REVIEW' WHERE id=?`).run(it.bank_question_id);
    expect(() => t.db.prepare(`UPDATE question_bank SET stem_text='Değiştirilmiş',content_edited_by='admin',content_edit_note='Sentetik düzeltme notu' WHERE id=?`).run(it.bank_question_id)).toThrow(/QUESTION_CONTENT_LOCKED/);
    expect((await t.request(`/api/student-books/zero-error/items/${it.id}/attempt`, 'POST', { answer: 'X' }, 'stuuser')).response.status).toBe(400);
    const wrongLetter = ['A', 'B', 'C', 'D'].find((l) => l !== frozen.key)!;
    expect((await t.request(`/api/student-books/zero-error/items/${it.id}/attempt`, 'POST', { answer: wrongLetter }, 'stuuser')).data.correct).toBe(false);
    const right = await t.request(`/api/student-books/zero-error/items/${it.id}/attempt`, 'POST', { answer: frozen.key }, 'stuuser');
    expect(right.data.correct).toBe(true);
    expect(t.db.prepare(`SELECT item_status FROM zero_error_booklet_items WHERE id=?`).get(it.id)).toMatchObject({ item_status: 'MASTERED' });
    expect((t.db.prepare(`SELECT group_concat(correct) c FROM (SELECT correct FROM zero_error_attempts WHERE booklet_item_id=? ORDER BY rowid)`).get(it.id) as any).c).toBe('0,1');
  });
});
