import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** S022: a Result Network school moves into the app without copying data; planned schools are protected from clean-up. Synthetic data only. */
describe('S022 app conversion', () => {
  it('plans, protects, converts guests within the licence limit, and only the Super Admin does it', async () => {
    const t = await evaluatedExam('direct');
    t.db.exec(`INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES('g1','MISAFIR','BIR','MISAFIR BIR','GUEST'),('g2','MISAFIR','IKI','MISAFIR IKI','GUEST');
      INSERT INTO student_enrollments(id,student_id,institution_id,season_id,student_number,grade_level,section,status) VALUES('eg1','g1','school','season','201',8,'A','ACTIVE'),('eg2','g2','school','season','202',8,'A','ACTIVE');
      INSERT INTO guest_profiles(student_id,first_seen_exam_id) VALUES('g1','${t.examId}'),('g2','${t.examId}');
      INSERT INTO institution_license_state(id,institution_id,season_id,licensed_student_limit,licensed_student_count) VALUES('lic','school','season',2,1);`);
    const guests = (t.db.prepare(`SELECT count(DISTINCT s.id) n FROM student_entities s JOIN student_enrollments e ON e.student_id=s.id WHERE e.institution_id='school' AND s.status='GUEST'`).get() as any).n;
    expect(guests).toBeGreaterThanOrEqual(2);
    const path = '/api/admin/result-network/institutions/school/app-conversion';
    for (const who of ['teacher', 'stuuser', 'parent']) expect((await t.request(path, 'GET', undefined, who)).response.status).toBe(403);
    expect((await t.request(path)).data).toMatchObject({ status: 'NONE', guestStudents: guests, activeStudents: 1 });
    expect((await t.request(path, 'POST', { action: 'CONVERT', paymentConfirmed: true })).response.status).toBe(409);
    expect((await t.request(path, 'POST', { action: 'PLAN' })).data.status).toBe('PLANNED');
    expect((await t.request(path, 'POST', { action: 'CANCEL' })).data.status).toBe('NONE');
    await t.request(path, 'POST', { action: 'PLAN' });
    expect((await t.request(path, 'POST', { action: 'CONVERT' })).response.status).toBe(400);
    const done = await t.request(path, 'POST', { action: 'CONVERT', paymentConfirmed: true });
    expect(done.response.status, done.text).toBe(200);
    expect(done.data).toMatchObject({ status: 'CONVERTED', activated: 1, skippedForLimit: guests - 1 });
    expect((t.db.prepare(`SELECT count(DISTINCT s.id) n FROM student_entities s JOIN student_enrollments e ON e.student_id=s.id WHERE e.institution_id='school' AND s.status='GUEST'`).get() as any).n).toBe(guests - 1);
    expect((t.db.prepare(`SELECT licensed_student_count c FROM institution_license_state WHERE id='lic'`).get() as any).c).toBe(2);
    // a converted school cannot be "cancelled" back into clean-up
    expect((await t.request(path, 'POST', { action: 'CANCEL' })).response.status).toBe(409);
    // raising the limit lets the rest through on a second run
    t.db.exec(`UPDATE institution_license_state SET licensed_student_limit=10 WHERE id='lic'`);
    expect((await t.request(path, 'POST', { action: 'CONVERT', paymentConfirmed: true })).data).toMatchObject({ activated: guests - 1, skippedForLimit: 0, guestStudents: 0 });
  });
});
