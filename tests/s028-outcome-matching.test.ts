import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { catalogSubjectsFor, examOutcomeScope, scopedOutcomeCatalog, suggestOutcomes } from '../worker/lib/exam-outcome-matching';

/** S028: publisher outcome keys get MEB suggestions; a person approves once and the same label maps by itself later. Synthetic data only. */
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,verified,program_code,authority) VALUES('cv9','2027-2028',9,'TYMM-TEST',1,'SCHOOL','MEB'),('cv11','2027-2028',11,'TYMM-TEST',1,'SCHOOL','MEB');
    INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,topic,title,official,active) VALUES
      ('o_mat9a','cv9','sub_mat',9,'MAT.9.2.3','Nicelikler ve Değişimler','Doğrusal fonksiyonlarla ifade edilebilen denklem ve eşitsizlikler içeren problem çözebilme',1,1),
      ('o_mat9b','cv9','sub_mat',9,'MAT.9.1.1','Sayılar','Gerçek sayılarla işlem yapabilme',1,1),
      ('o_kim9','cv9','sub_kim',9,'KIM.9.1.1','Etkileşim','Asitlerin ve bazların tepkimelerini açıklayabilme',1,1),
      ('o_mat11','cv11','sub_mat',11,'MAT.11.3.6','Nicelikler','Üstel ve logaritmik eşitsizlikler içeren problem çözebilme',1,1);`);
  const tytExam = async (title: string) => {
    const created = await t.request('/api/exam-definitions', 'POST', { ownerType: 'CENTRAL', academicYear: '2026-2027', title, examType: 'TYT', gradeLevel: 12, publisherName: 'Sentetik', sessionLabel: 'Tek', scoringRuleVersionId: 'srv_osym_tyt_2627', outcomeMode: 'OPTIONAL' });
    expect(created.response.status, created.text).toBe(201);
    const base = `/api/exam-definitions/${created.data.id}`;
    expect((await t.request(`${base}/structure`, 'PUT', { booklets: ['A'], subjects: [{ subjectId: 'sub_tyt_mat', questionCount: 2, questionStart: 1, questionEnd: 2, optionCount: 5, wrongDivisor: 4, sortOrder: 1 }, { subjectId: 'sub_tyt_fen', questionCount: 1, questionStart: 3, questionEnd: 3, optionCount: 5, wrongDivisor: 4, sortOrder: 2 }] })).response.status).toBe(200);
    const key = await t.request(`${base}/answer-key`, 'PUT', { entries: [
      { subjectId: 'sub_tyt_mat', bookletCode: 'A', answers: 'AB', optionCount: 5, outcomeRefs: [{ publisherTitle: 'Aralık Kavramı ve Basit Eşitsizlikler', officialCode: '21.4.5' }, { publisherTitle: 'MAT.9.1.1', officialCode: 'MAT.9.1.1' }] },
      { subjectId: 'sub_tyt_fen', bookletCode: 'A', answers: 'C', optionCount: 5, outcomeRefs: [{ publisherTitle: 'Asitlerin ve Bazların Tepkimeleri', officialCode: '10.3.2' }] }] });
    expect(key.response.status, key.text).toBe(200);
    return { id: created.data.id as string, base };
  };
  return { t, tytExam };
}

describe('S028 outcome matching', () => {
  it('uses grades 9–10 for TYT, 11–12 for AYT, the nearest verified year, and the high-school subjects', async () => {
    const { t } = await setup();
    const tyt = await scopedOutcomeCatalog(t.env, examOutcomeScope({ academic_year: '2026-2027', exam_type: 'TYT', grade_level: 12 }));
    expect(tyt.map((o) => o.id).sort()).toEqual(['o_kim9', 'o_mat9a', 'o_mat9b']);
    expect(tyt[0].catalog_fallback).toBe('2027-2028');
    expect((await scopedOutcomeCatalog(t.env, examOutcomeScope({ academic_year: '2026-2027', exam_type: 'AYT', grade_level: 12 }))).map((o) => o.id)).toEqual(['o_mat11']);
    // the exam's own year wins when it has a verified catalogue (helper: 2026-2027 grade 8)
    expect((await scopedOutcomeCatalog(t.env, examOutcomeScope({ academic_year: '2026-2027', exam_type: 'LGS', grade_level: 8 }))).every((o) => o.academic_year === '2026-2027')).toBe(true);
    expect(catalogSubjectsFor(examOutcomeScope({ exam_type: 'TYT' }), 'sub_tyt_fen')).toEqual(['sub_fiz', 'sub_kim', 'sub_biy']);
    expect(suggestOutcomes('Aralık Kavramı ve Basit Eşitsizlikler', tyt)[0].id).toBe('o_mat9a');
  });

  it('maps MEB codes at once, suggests the rest, and remembers an approval for the next exam of the publisher', async () => {
    const { t, tytExam } = await setup();
    const first = await tytExam('TYT 1');
    const mapped = (id: string) => t.db.prepare(`SELECT q.question_no n,qo.outcome_id o FROM question_outcomes qo JOIN exam_questions q ON q.id=qo.exam_question_id WHERE q.exam_id=? ORDER BY 1`).all(id);
    expect(mapped(first.id)).toEqual([{ n: 2, o: 'o_mat9b' }]); // MEB code in the key
    const preview = await t.request(`${first.base}/outcome-match-preview`, 'POST', { entries: [
      { subjectId: 'sub_tyt_mat', questionNo: 1, reference: { publisherTitle: 'Aralık Kavramı ve Basit Eşitsizlikler', officialCode: '21.4.5' } },
      { subjectId: 'sub_tyt_fen', questionNo: 3, reference: { publisherTitle: 'Asitlerin ve Bazların Tepkimeleri', officialCode: '10.3.2' } }] });
    expect(preview.response.status, preview.text).toBe(200);
    expect(preview.data.matches.map((m: any) => [m.reason, m.suggestions[0]?.id])).toEqual([['AMBIGUOUS', 'o_mat9a'], ['AMBIGUOUS', 'o_kim9']]);
    // the person approves both suggestions
    const editor = await t.request(`${first.base}/outcome-mappings`);
    expect(editor.data.questions.find((q: any) => q.subject_id === 'sub_tyt_fen').catalog_subject_ids).toEqual(['sub_fiz', 'sub_kim', 'sub_biy']);
    const ids = Object.fromEntries(editor.data.questions.map((q: any) => [q.question_no, q.id]));
    const saved = await t.request(`${first.base}/outcome-mappings`, 'PUT', { expectedRevision: editor.data.revision, mappings: [{ questionId: ids[1], outcomeIds: ['o_mat9a'] }, { questionId: ids[2], outcomeIds: ['o_mat9b'] }, { questionId: ids[3], outcomeIds: ['o_kim9'] }] });
    expect(saved.response.status, saved.text).toBe(200);
    // the same publisher labels in a later exam map by themselves
    const second = await tytExam('TYT 2');
    expect(mapped(second.id)).toEqual([{ n: 1, o: 'o_mat9a' }, { n: 2, o: 'o_mat9b' }, { n: 3, o: 'o_kim9' }]);
    // an outcome outside the question's high-school subjects is refused
    const wrong = await t.request(`${second.base}/outcome-mappings`, 'PUT', { expectedRevision: (await t.request(`${second.base}/outcome-mappings`)).data.revision, mappings: [{ questionId: (await t.request(`${second.base}/outcome-mappings`)).data.questions[2].id, outcomeIds: ['o_mat9a'] }] });
    expect(wrong.response.status).toBe(400);
  });
});
