import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { acceptReadableSheets } from '../worker/lib/result-simple-flow';

/**
 * Owner (4 Nov): on sonuc a sheet without a marked booklet is not a decision for a person. Its answers are scored
 * against each booklet's key; the clearly better fit is used, otherwise the first booklet. Synthetic data only.
 */
async function withTwoBooklets() {
  const t = await evaluatedExam('direct');
  // booklet B: the same questions with a different key (TUR DCBA, MAT ABCD); 8 questions in all
  t.db.exec(`INSERT INTO exam_booklets(id,exam_id,code,active) VALUES('bk_b','${t.examId}','B',1)`);
  const qs = t.db.prepare(`SELECT q.id,s.code,q.question_no FROM exam_questions q JOIN subjects s ON s.id=q.subject_id WHERE q.exam_id=? ORDER BY s.code,q.question_no`).all(t.examId) as any[];
  const B: Record<string, string> = { TUR: 'DCBA', MAT: 'ABCD' };
  for (const q of qs) {
    const i = Number(q.question_no) - (q.code === 'MAT' ? 5 : 1);
    t.db.prepare(`INSERT INTO answer_keys(id,exam_question_id,booklet_code,correct_answer) VALUES(?,?,?,?)`).run('ak_b_' + q.id, q.id, 'B', B[q.code][i]);
  }
  t.db.exec(`INSERT INTO scan_batches(id,exam_id,institution_id,source_type,created_by,status) VALUES('bt','${t.examId}','school','TXT','admin','NEEDS_REVIEW')`);
  const row = (id: string, n: number, TUR: string, MAT: string) => t.db.prepare(`INSERT INTO scan_records(id,batch_id,row_no,canonical_json,match_status,issues_json,resolution_status) VALUES(?,?,?,?,?,?,?)`)
    .run(id, 'bt', n, JSON.stringify({ row_no: n, name: 'SENTETIK ' + id, student_number: String(900 + n), grade_level: 8, answers_by_subject: { TUR, MAT }, issues: ['Kitapçık: işaretlenmemiş; elle seçin.'] }), 'NEW_GUEST', JSON.stringify(['Kitapçık: işaretlenmemiş; elle seçin.', 'Kayıtlı öğrenciyle eşleşmedi; misafir katılımcı olarak oluşturulabilir.']), 'PENDING');
  return { t, row };
}
const canonical = (t: any, id: string) => JSON.parse((t.db.prepare('SELECT canonical_json c FROM scan_records WHERE id=?').get(id) as any).c);

describe('sonuc: a blank booklet is chosen from the answers', () => {
  it('uses the booklet whose key clearly fits, and the first booklet when the answers do not tell', async () => {
    const { t, row } = await withTwoBooklets();
    try {
      row('fitsB', 1, 'DCBA', 'ABCD'); // 8 correct on B, 0 on A
      row('fitsA', 2, 'ABCD', 'DCBA'); // 8 correct on A
      row('unclear', 3, '____', '____'); // nothing answered
      await acceptReadableSheets(t.env as any, 'bt', 'admin', 'school');
      expect(canonical(t, 'fitsB')).toMatchObject({ booklet: 'B', issues: [] });
      expect(canonical(t, 'fitsB').notes.join(' ')).toMatch(/cevaplara göre B kitapçığı seçildi/);
      expect(canonical(t, 'fitsA').booklet).toBe('A');
      expect(canonical(t, 'unclear').booklet).toBe('A');
      expect(canonical(t, 'unclear').notes.join(' ')).toMatch(/ayırt etmedi, A sayıldı/);
      const pending = (t.db.prepare(`SELECT count(*) n FROM scan_records WHERE batch_id='bt' AND resolution_status='PENDING'`).get() as any).n;
      expect(Number(pending)).toBe(0);
    } finally { t.db.close(); }
  }, 60000);
});
