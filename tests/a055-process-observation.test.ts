import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { handleRubricObservations } from '../worker/lib/rubric-observations';
import { renderRubricCsv } from '../src/lib/rubricCsvExport';

/** A055: Maarif process observation — the observed level is presented as a teacher observation, never a final competency verdict. Synthetic data only. */
function fixture() {
  const db = new DatabaseSync(':memory:'); const dir = new URL('../migrations/', import.meta.url);
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(name, dir), 'utf8'));
  db.exec(`INSERT INTO institutions(id,name,code) VALUES('school','Synthetic','SYNTH');
    INSERT INTO institution_seasons(id,institution_id,academic_year) VALUES('season','school','2026-2027');
    INSERT INTO classes(id,institution_id,season_id,grade_level,section,name) VALUES('class','school','season',7,'A','7A');
    INSERT INTO subjects(id,code,name) VALUES('math','SYNTH_MATH','Synthetic math');
    INSERT INTO student_entities(id,first_name,last_name,normalized_name) VALUES('student','Synthetic','Student','synthetic');
    INSERT INTO student_enrollments(id,student_id,institution_id,season_id,class_id,grade_level) VALUES('enrollment','student','school','season','class',7);
    INSERT INTO users(id,institution_id,role,display_name,password_hash,password_salt) VALUES('teacher','school','TEACHER','T','hash','salt');
    INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,class_id,subject_id,assignment_type) VALUES('a','teacher','school','season','class','math','SUBJECT');
    INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,authority,verified,program_code) VALUES('cv','2026-2027',7,'SYNTHETIC','MEB',1,'SCHOOL');
    INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,title,node_type,official) VALUES('outcome','cv','math',7,'SYNTH.1','Synthetic outcome','OUTCOME',1);
    INSERT INTO curriculum_process_components(id,outcome_id,code,title,source_url,source_title,source_locator,review_note,verified_by) VALUES('component','outcome','P1','Synthetic process','https://tymm.meb.gov.tr/synthetic.pdf','Synthetic document','Synthetic section','Synthetic fixture declaration','teacher');`);
  const criteria = [{ id: 'c', title: 'Observable action', description: 'd', levels: [{ id: 'g', label: 'With support', description: 'guided' }, { id: 'i', label: 'Independent', description: 'independent' }] }];
  db.prepare(`INSERT INTO learning_rubric_versions(id,component_id,version_label,title,task_instructions,criteria_json,source_kind,source_url,source_title,source_locator,review_note,published_by) VALUES
    ('teacher_rubric','component','v1','Teacher rubric','Observe the synthetic task',?,'TEACHER_DESIGNED',NULL,NULL,NULL,'Synthetic review','teacher'),
    ('official_rubric','component','v2','Official rubric','Observe the synthetic task',?,'OFFICIAL','https://tymm.meb.gov.tr/synthetic.pdf','Synthetic document','Synthetic section','Synthetic review','teacher')`).run(JSON.stringify(criteria), JSON.stringify(criteria));
  const prepare = (sql: string, args: any[] = []): any => ({ bind: (...v: any[]) => prepare(sql, v), first: async () => db.prepare(sql).get(...args) || null, all: async () => ({ success: true, results: db.prepare(sql).all(...args) }), run: async () => { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; } });
  const env: any = { DB: { prepare } }; const teacher: any = { id: 'teacher', role: 'TEACHER', institution_id: 'school' };
  const write = (rubricId: string, requestId: string) => handleRubricObservations(new Request('https://test/api/learning-observations/students/student', { method: 'POST', body: JSON.stringify({ enrollmentId: 'enrollment', rubricId, requestId, confirmedObservation: true, observedAt: '2026-10-01T12:00:00.000Z', evidenceNote: 'Synthetic evidence recorded during the task.', feedback: 'Continue the observed action.', nextStep: 'Try a second synthetic task.', selections: [{ criterionId: 'c', levelId: 'i' }] }) }), env, teacher);
  const read = (actor: any) => handleRubricObservations(new Request('https://test/api/learning-observations/students/student'), env, actor);
  return { write, read };
}

describe('A055 process observation', () => {
  it('records observations tied to the rubric version and states that levels are teacher observations, not verdicts', async () => {
    const f = fixture();
    expect((await f.write('teacher_rubric', 'synthetic-request-1'))!.status).toBe(201);
    expect((await f.write('official_rubric', 'synthetic-request-2'))!.status).toBe(201);
    for (const actor of [{ id: 'teacher', role: 'TEACHER', institution_id: 'school' }, { id: 'su', role: 'STUDENT', student_id: 'student', institution_id: 'school' }] as any[]) {
      const data: any = await (await f.read(actor))!.json();
      expect(data.interpretation).toMatchObject({ kind: 'TEACHER_OBSERVATION', officialCompetencyVerdict: false });
      expect(data.interpretation.message).toContain('kesin yeterlik hükmü');
      const byRubric = Object.fromEntries(data.observations.map((o: any) => [o.rubric_id, o]));
      expect(byRubric.teacher_rubric.verifiedOfficialRubric).toBe(false);
      expect(byRubric.official_rubric.verifiedOfficialRubric).toBe(true);
      expect(byRubric.official_rubric.snapshot).toMatchObject({ versionLabel: 'v2', sourceKind: 'OFFICIAL', sourceUrl: 'https://tymm.meb.gov.tr/synthetic.pdf' });
      const csv = renderRubricCsv(data.observations);
      expect(csv.split('\r\n')[0]).toContain('"Niteliği"');
      expect(csv).toContain('resmî kaynakla doğrulanmamış rubrik. Kesin yeterlik hükmü değildir.');
      expect(csv).toContain('resmî doküman rubriği. Kesin yeterlik hükmü değildir.');
    }
  });
});
