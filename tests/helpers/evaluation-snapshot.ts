import type { DatabaseSync } from 'node:sqlite';

/** S035: synthetic sheets (no real people) and an id-free snapshot of every table an evaluation writes. */
export function generatedSheets(count: number, seed = 11) {
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const pick = () => 'ABCD_'[Math.floor(rnd() * 5)];
  const letters = 'ABCDEFGHIJKLMNOPRSTUVYZ';
  return Array.from({ length: count }, (_, i) => ({
    no: String(1000 + i),
    name: `OGRENCI ${letters[i % letters.length]}${letters[Math.floor(i / letters.length) % letters.length]} ${letters[(i * 7) % letters.length]}`,
    TUR: Array.from({ length: 4 }, pick).join(''),
    MAT: Array.from({ length: 4 }, pick).join(''),
  }));
}

export function evaluationSnapshot(db: DatabaseSync, examId: string) {
  const q = (sql: string) => db.prepare(sql).all(examId) as any[];
  return {
    participants: q(`SELECT ep.name_snapshot n,ep.student_number_snapshot no,ep.class_snapshot c,ep.booklet_code b,ep.participant_status st,ep.institution_id i FROM exam_participants ep WHERE ep.exam_id=? ORDER BY ep.institution_id,ep.name_snapshot,ep.student_number_snapshot`),
    results: q(`SELECT ep.name_snapshot n,er.correct_count d,er.wrong_count y,er.blank_count b,round(er.net,4) net,round(er.score,4) score,round(er.success_percent,4) sp,er.institution_rank r,er.scoring_rule_version_id srv FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id WHERE ep.exam_id=? ORDER BY ep.institution_id,ep.name_snapshot,ep.student_number_snapshot`),
    subjects: q(`SELECT ep.name_snapshot n,sr.subject_id s,sr.correct_count d,sr.wrong_count y,sr.blank_count b,round(sr.net,4) net,round(sr.success_percent,4) sp FROM subject_results sr JOIN exam_participants ep ON ep.id=sr.participant_id WHERE ep.exam_id=? ORDER BY ep.institution_id,ep.name_snapshot,ep.student_number_snapshot,sr.subject_id`),
    answers: q(`SELECT ep.name_snapshot n,q.subject_id s,q.question_no qn,sa.answer a,sa.status st,sa.confidence cf FROM student_answers sa JOIN exam_participants ep ON ep.id=sa.participant_id JOIN exam_questions q ON q.id=sa.exam_question_id WHERE ep.exam_id=? ORDER BY ep.institution_id,ep.name_snapshot,ep.student_number_snapshot,q.subject_id,q.question_no`),
    outcomes: q(`SELECT se.normalized_name n,o.outcome_id oid,o.evidence_count e,o.correct_count c,round(o.success_rate,4) r,o.mastery_status m FROM outcome_results o JOIN student_entities se ON se.id=o.student_id WHERE o.exam_id=? ORDER BY se.normalized_name,o.outcome_id`),
    runs: (q(`SELECT ep.name_snapshot n,r.source_type t,r.delivery_mode d,r.status st,round(r.score,4) sc,r.booklet_code b,r.metadata_json m,r.institution_id i FROM assessment_runs r JOIN exam_participants ep ON ep.id=r.source_id WHERE ep.exam_id=? ORDER BY ep.institution_id,ep.name_snapshot,ep.student_number_snapshot`))
      .map((r) => { const m = JSON.parse(r.m || '{}'); return { ...r, m: { title: m.title, subjectIds: [...(m.subjectIds || [])].sort(), batch: !!m.batchId } }; }),
    responses: q(`SELECT ep.name_snapshot n,q.subject_id s,q.question_no qn,ar.selected_answer a,ar.is_correct c,ar.source_channel ch FROM assessment_responses ar JOIN assessment_runs r ON r.id=ar.run_id JOIN exam_participants ep ON ep.id=r.source_id JOIN exam_questions q ON q.id=ar.exam_question_id WHERE ep.exam_id=? ORDER BY ep.institution_id,ep.name_snapshot,ep.student_number_snapshot,q.subject_id,q.question_no`),
    guests: (db.prepare(`SELECT count(*) c FROM student_entities WHERE status='GUEST'`).get() as any).c,
    enrollments: (db.prepare(`SELECT count(*) c FROM student_enrollments`).get() as any).c,
  };
}
