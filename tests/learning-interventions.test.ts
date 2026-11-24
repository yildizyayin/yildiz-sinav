import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** Birleşik Karne: teacher interventions per outcome — staff only, within the teacher's subjects. Synthetic data. */
it('records, lists and withdraws interventions within the teacher\'s scope', async () => {
  const t = await evaluatedExam('direct', { outcomes: true });
  try {
    t.db.exec(`INSERT INTO classes(id,institution_id,season_id,grade_level,section,name,active) VALUES('c8a','school','season',8,'A','8/A',1);
      UPDATE student_enrollments SET class_id='c8a' WHERE id='enr1';
      INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,class_id,subject_id,assignment_type,active) VALUES('ta1','teacher','school','season','c8a','sub_mat','SUBJECT',1);`);
    const outcome = (code: string) => (t.db.prepare('SELECT id FROM outcomes WHERE code=?').get(code) as any).id;
    const path = '/api/reporting/students/s1/interventions';
    const add = (who: string, body: any) => t.request(path, 'POST', body, who);

    expect((await add('teacher', { outcomeId: outcome('M.8.1.1'), kind: 'ONE_TO_ONE', note: 'Üslü ifadelerde birebir tekrar yapıldı.' })).response.status).toBe(201);
    // a Turkish outcome is outside this mathematics teacher's subject; bad input is refused
    expect((await add('teacher', { outcomeId: outcome('T.8.1.1'), kind: 'ONE_TO_ONE' })).response.status).toBe(403);
    expect((await add('teacher', { outcomeId: outcome('M.8.1.1'), kind: 'SOMETHING' })).response.status).toBe(400);
    expect((await add('teacher', { outcomeId: outcome('M.8.1.1'), kind: 'OTHER', note: 'x'.repeat(501) })).response.status).toBe(400);
    // the manager may record for any subject of the institution
    expect((await add('admin', { outcomeId: outcome('T.8.1.1'), kind: 'PARENT_CONTACT' })).response.status).toBe(201);

    const teacherView = (await t.request(path, 'GET', undefined, 'teacher')).data.interventions;
    expect(teacherView.map((i: any) => i.kind)).toEqual(['ONE_TO_ONE']); // the Turkish record is outside the teacher's subject
    expect(teacherView[0]).toMatchObject({ mine: true, note: 'Üslü ifadelerde birebir tekrar yapıldı.' });
    expect((await t.request(path, 'GET', undefined, 'admin')).data.interventions).toHaveLength(2);

    // students and parents never see them
    for (const who of ['stuuser', 'parent']) expect((await t.request(path, 'GET', undefined, who)).response.status).toBe(403);

    // withdrawn, not deleted
    const id = teacherView[0].id;
    expect((await t.request(`${path}/${id}/withdraw`, 'POST', {}, 'teacher')).response.status).toBe(200);
    expect((await t.request(path, 'GET', undefined, 'teacher')).data.interventions).toEqual([]);
    expect((t.db.prepare('SELECT withdrawn_by FROM learning_interventions WHERE id=?').get(id) as any).withdrawn_by).toBe('teacher');
    expect((t.db.prepare(`SELECT count(*) n FROM audit_logs WHERE action='LEARNING_INTERVENTION_ADDED'`).get() as any).n).toBe(2);
  } finally { t.db.close(); }
}, 60000);
