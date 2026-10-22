import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { combineFrozenReports } from '../worker/lib/combined-frozen-report';
import { combineExpandedFrozenReports } from '../worker/lib/expanded-frozen-report';

/** A054: selectable combined report — trusted evidence only, measures kept apart, repeat policy stated. Synthetic data only. */
const group = (correct: number, wrong: number) => ({ subjectId: 'math', curriculumVersionId: 'cv', academicYear: '2026-2027', gradeLevel: 7, programVersion: 'v1', correct, wrong, blank: 0, evidenceCount: correct + wrong });

describe('A054 combined report', () => {
  it('states the repeat policy and measure of every selected source', () => {
    const base = combineFrozenReports([{ sourceType: 'EXAM', report: { groups: [group(1, 0)] } }, { sourceType: 'QUESTION_BANK', report: { groups: [group(1, 1)], repeatPolicy: 'FIRST' } }, { sourceType: 'MINI_TEST', report: { groups: [group(2, 0)] } }]);
    expect(base.repeatPolicies.map((r: any) => [r.sourceType, r.repeatPolicy])).toEqual([['EXAM', 'PUBLISHED_SNAPSHOT_ONCE'], ['QUESTION_BANK', 'FIRST_ATTEMPT'], ['MINI_TEST', 'NEW_QUESTIONS_ONLY']]);
    const latest = combineFrozenReports([{ sourceType: 'QUESTION_BANK', report: { groups: [], repeatPolicy: 'LATEST' } }]);
    expect(latest.repeatPolicies[0].repeatPolicy).toBe('LATEST_ATTEMPT');
    const game = { policy: 'FROZEN_MINI_GAME_CONTEXT_V1', groups: [{ subjectId: 'math', sessionCount: 3, averageScore: 90 }] };
    const all = combineExpandedFrozenReports([{ sourceType: 'COMBINED_BASE', report: base }, { sourceType: 'FOY', report: { groups: [group(1, 1)] } }], game);
    expect(all.repeatPolicies.map((r: any) => `${r.sourceType}:${r.measure}:${r.repeatPolicy}`)).toEqual([
      'EXAM:ACCURACY:PUBLISHED_SNAPSHOT_ONCE', 'QUESTION_BANK:ACCURACY:FIRST_ATTEMPT', 'MINI_TEST:ACCURACY:NEW_QUESTIONS_ONLY', 'FOY:ACCURACY:FIRST_SUBMISSION', 'MINI_GAME:GAME_ACTIVITY:EVERY_SESSION_SEPARATE']);
    // the game score never enters accuracy
    expect(all.groups[0]).toMatchObject({ correct: 5, wrong: 2, evidenceCount: 7 });
    expect(all.repeatPolicies.every((r: any) => r.description.length > 10)).toBe(true);
  });

  it('keeps the first foy submission as evidence: a resubmission is refused and the frozen evidence is unchanged', async () => {
    const t = await evaluatedExam('direct');
    t.db.exec(`UPDATE platform_features SET enabled_default=1 WHERE feature_key='LEARNING_GRAPH';
      INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,option_count,copyright_status,review_status) VALUES
        ('fq1','PLATFORM','2026-2027',8,'sub_tur','MULTIPLE_CHOICE','Föy sorusu 1',json('[{"label":"A","text":"a"},{"label":"B","text":"b"},{"label":"C","text":"c"},{"label":"D","text":"d"}]'),'A',4,'OWNED','APPROVED'),
        ('fq2','PLATFORM','2026-2027',8,'sub_tur','MULTIPLE_CHOICE','Föy sorusu 2',json('[{"label":"A","text":"a"},{"label":"B","text":"b"},{"label":"C","text":"c"},{"label":"D","text":"d"}]'),'B',4,'OWNED','APPROVED');
      INSERT INTO question_learning_links(question_id,node_id) VALUES('fq1','ln_o_tur1'),('fq2','ln_o_tur1');
      INSERT INTO assignments(id,institution_id,season_id,created_by,title,status) VALUES('asg1','school','season','teacher','Föy 1','ASSIGNED');
      INSERT INTO assignment_items(id,assignment_id,item_type,reference_id,sort_order) VALUES('ai1','asg1','QUESTION','fq1',1),('ai2','asg1','QUESTION','fq2',2);
      INSERT INTO assignment_recipients(assignment_id,student_id) VALUES('asg1','s1');`);
    const first = await t.request('/api/platform/foy/attempts', 'POST', { assignmentId: 'asg1', answers: { fq1: 'A', fq2: 'A' } }, 'stuuser');
    expect(first.response.status, first.text).toBe(200); expect(first.data.correct).toBe(1);
    const evidence = () => t.db.prepare(`SELECT response_id,result_status FROM frozen_foy_response_evidence WHERE student_id='s1' ORDER BY response_id`).all();
    const before = evidence();
    expect(before.map((r: any) => r.result_status).sort()).toEqual(['CORRECT', 'WRONG']);
    const again = await t.request('/api/platform/foy/attempts', 'POST', { assignmentId: 'asg1', answers: { fq1: 'A', fq2: 'B' } }, 'stuuser');
    expect(again.response.status, again.text).toBe(409); expect(again.data.error.code).toBe('FOY_ALREADY_SUBMITTED');
    expect(evidence()).toEqual(before);
    expect((t.db.prepare(`SELECT count(*) c FROM assignment_attempts WHERE assignment_id='asg1'`).get() as any).c).toBe(2);
  });
});
