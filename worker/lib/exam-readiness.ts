import type { Env } from '../types';
import { one } from './db';

/** One readiness decision shared by the detail screen and the activation guard. */
export async function examReadiness(env: Env, examId: string): Promise<any> {
  const row = await one<any>(env.DB.prepare(`
    SELECT
      (SELECT count(*) FROM exam_subjects WHERE exam_id=?) subject_count,
      (SELECT coalesce(sum(question_count),0) FROM exam_subjects WHERE exam_id=?) expected_questions,
      (SELECT count(*) FROM exam_questions WHERE exam_id=?) actual_questions,
      (SELECT count(*) FROM exam_questions WHERE exam_id=? AND question_status='ACTIVE') active_expected_questions,
      (SELECT count(*) FROM exam_booklets WHERE exam_id=? AND active=1) booklet_count,
      (SELECT count(*) FROM answer_keys ak JOIN exam_questions q ON q.id=ak.exam_question_id
        JOIN exam_booklets eb ON eb.exam_id=q.exam_id AND eb.code=ak.booklet_code AND eb.active=1 WHERE q.exam_id=?) actual_answers,
      (SELECT count(*) FROM exam_questions q JOIN exam_booklets eb ON eb.exam_id=q.exam_id AND eb.active=1
        WHERE q.exam_id=? AND NOT EXISTS (SELECT 1 FROM answer_keys ak WHERE ak.exam_question_id=q.id AND ak.booklet_code=eb.code)) missing_answer_count,
      (SELECT e.outcome_mode FROM exams e WHERE e.id=?) outcome_mode,
      (SELECT count(DISTINCT qo.exam_question_id) FROM question_outcomes qo JOIN exam_questions q ON q.id=qo.exam_question_id WHERE q.exam_id=?) outcome_mapped_questions,
      (SELECT coalesce(srv.verified,0) FROM exams e LEFT JOIN scoring_rule_versions srv ON srv.id=e.scoring_rule_version_id WHERE e.id=?) scoring_verified,
      (SELECT owner_type FROM exams WHERE id=?) owner_type,
      (SELECT count(*) FROM exam_institutions WHERE exam_id=? AND enabled=1) institution_count
  `).bind(...Array(12).fill(examId)));
  const count = (key: string) => Number(row?.[key] || 0);
  const expectedAnswers = count('expected_questions') * count('booklet_count');
  const blockers: Array<{code: string; message: string}> = [];
  const add = (code: string, message: string) => blockers.push({code, message});
  if (!count('subject_count') || !count('expected_questions')) add('SUBJECTS_REQUIRED', 'Dersleri ve soru sayılarını tamamlayın.');
  if (!count('booklet_count')) add('BOOKLETS_REQUIRED', 'En az bir kitapçık seçin.');
  if (count('actual_questions') !== count('expected_questions')) add('QUESTION_STRUCTURE_INCOMPLETE', 'Soru yapısını kaydedin; oluşturulan soru sayısı ders toplamıyla eşleşmelidir.');
  if (count('missing_answer_count') || count('actual_answers') !== expectedAnswers) add('ANSWER_KEYS_INCOMPLETE', `Bütün kitapçıkların cevap anahtarını tamamlayın (${count('actual_answers')}/${expectedAnswers} cevap kayıtlı).`);
  if (count('scoring_verified') !== 1) add('SCORING_VERIFICATION_REQUIRED', 'Doğrulanmış bir puanlama profili seçip sınav kartını kaydedin.');
  if (row?.outcome_mode === 'OFFICIAL_REQUIRED' && count('outcome_mapped_questions') < count('expected_questions')) add('OUTCOMES_REQUIRED', 'Kazanım zorunlu seçili; her soruyu kazanıma bağlayın.');
  if (row?.owner_type === 'CENTRAL' && !count('institution_count')) add('INSTITUTION_ASSIGNMENT_REQUIRED', 'Kurum Dağıtımı bölümünden en az bir kurum seçip dağıtımı kaydedin.');
  return {...row, expected_answers: expectedAnswers, ready_to_publish: blockers.length === 0, blockers};
}
