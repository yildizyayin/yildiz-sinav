import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** A061: attendance — authorised entry and correction with reason, history kept, students and parents see their own. Synthetic data only. */
describe('A061 attendance', () => {
  it('keeps the previous value of every correction and shows the own record to the student and parent', async () => {
    const t = await evaluatedExam('direct');
    t.db.exec(`INSERT INTO classes(id,institution_id,season_id,grade_level,section,name) VALUES('c8a','school','season',8,'A','8-A');
      UPDATE student_enrollments SET class_id='c8a' WHERE id='enr1';
      INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,class_id,subject_id,assignment_type,active) VALUES('ta1','teacher','school','season','c8a','sub_tur','SUBJECT',1);`);
    const save = (status: string, extra: any = {}, note?: string) => t.request('/api/school/attendance', 'POST', { classId: 'c8a', date: '2026-10-20', records: [{ studentId: 's1', status, note }], ...extra }, 'teacher');
    expect((await save('ABSENT')).response.status).toBe(200);
    expect(t.db.prepare(`SELECT status FROM attendance_notification_outbox WHERE student_id='s1'`).get()).toMatchObject({ status: 'PENDING' });

    const noReason = await save('PRESENT');
    expect(noReason.response.status).toBe(400); expect(noReason.data.error.code).toBe('CORRECTION_REASON_REQUIRED');
    const fixed = await save('PRESENT', { correctionReason: 'Öğrenci ilk derse geç geldi, okulda.' });
    expect(fixed.response.status, fixed.text).toBe(200); expect(fixed.data.corrected).toBe(1);
    const hist = t.db.prepare('SELECT previous_status,new_status,changed_by,change_reason FROM attendance_record_history').all() as any[];
    expect(hist).toEqual([{ previous_status: 'ABSENT', new_status: 'PRESENT', changed_by: 'teacher', change_reason: 'Öğrenci ilk derse geç geldi, okulda.' }]);
    expect(t.db.prepare(`SELECT status FROM attendance_notification_outbox WHERE student_id='s1'`).get()).toMatchObject({ status: 'SKIPPED' });

    // saving the same values again is not a correction and writes no history
    expect((await save('PRESENT')).response.status).toBe(200);
    expect((await t.request('/api/school/attendance', 'POST', { classId: 'c8a', date: '2026-10-20', records: [{ studentId: 's1', status: 'PRESENT' }] })).response.status).toBe(200);
    expect(t.db.prepare(`SELECT recorded_by,change_reason FROM attendance_period_records WHERE student_id='s1'`).get()).toMatchObject({ recorded_by: 'teacher', change_reason: 'Öğrenci ilk derse geç geldi, okulda.' }); // unchanged rows keep who recorded them
    expect((t.db.prepare('SELECT count(*) c FROM attendance_record_history').get() as any).c).toBe(1);
    expect(() => t.db.exec(`UPDATE attendance_record_history SET new_status='ABSENT'`)).toThrow(/ATTENDANCE_HISTORY_IMMUTABLE/);
    expect(() => t.db.exec(`DELETE FROM attendance_record_history`)).toThrow(/ATTENDANCE_HISTORY_IMMUTABLE/);

    const staff = await t.request('/api/school/attendance?classId=c8a&date=2026-10-20', 'GET', undefined, 'teacher');
    expect(staff.data.history).toHaveLength(1);

    await save('LATE', { correctionReason: 'Kapı kaydına göre 10 dakika geç.' }, 'servis gecikti');
    const mine = await t.request('/api/school/attendance/my', 'GET', undefined, 'stuuser');
    expect(mine.response.status, mine.text).toBe(200);
    expect(mine.data.children[0].records[0]).toMatchObject({ date: '2026-10-20', status: 'LATE', corrected: true });
    expect(mine.text).not.toContain('servis gecikti');
    const parent = await t.request('/api/school/attendance/my', 'GET', undefined, 'parent');
    expect(parent.data.children.map((c: any) => c.student.id)).toEqual(['s1']);
    expect((await t.request('/api/school/attendance/my', 'GET', undefined, 'teacher')).response.status).toBe(403);
  });
});
