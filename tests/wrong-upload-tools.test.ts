import { describe, expect, it } from 'vitest';
import { setup } from './helpers/sonuc-setup';
import { evaluatedExam } from './helpers/exam-flow';
import { generatedSheets } from './helpers/evaluation-snapshot';

process.env.TZ = 'UTC';

/** Wrong uploads (owner, 3 Nov): move to the right exam, delete a school's uploads in one exam, app delete/restore. Synthetic data only. */
async function secondExam(t: any, examType = 'LGS') {
  const created = await t.request('/api/exam-definitions', 'POST', { ownerType: 'CENTRAL', academicYear: '2026-2027', title: `Doğru Deneme ${examType}`, examType, gradeLevel: 8, publisherName: 'Sentetik', sessionLabel: 'Tek', scoringRuleVersionId: examType === 'LGS' ? 'srv_meb_lgs_2627' : undefined, outcomeMode: 'OPTIONAL' });
  if (created.response.status !== 201) return { id: null as string | null, text: created.text };
  const id = created.data.id as string, base = `/api/exam-definitions/${id}`;
  await t.request(`${base}/structure`, 'PUT', { booklets: ['A'], subjects: [
    { subjectId: 'sub_tur', questionCount: 4, questionStart: 1, questionEnd: 4, optionCount: 4, wrongDivisor: 3, sortOrder: 1 },
    { subjectId: 'sub_mat', questionCount: 4, questionStart: 5, questionEnd: 8, optionCount: 4, wrongDivisor: 3, sortOrder: 2 }] });
  await t.request(`${base}/answer-key`, 'PUT', { entries: [{ subjectId: 'sub_tur', bookletCode: 'A', answers: 'ABCD', optionCount: 4 }, { subjectId: 'sub_mat', bookletCode: 'A', answers: 'ABCD', optionCount: 4 }] });
  await t.request(`${base}/institutions`, 'PUT', { institutionIds: ['school'] });
  const st = await t.request(`${base}/status`, 'PATCH', { status: 'ACTIVE' });
  t.db.exec(`DELETE FROM exam_institutions WHERE exam_id='${id}'; INSERT OR IGNORE INTO exam_channel_publications(id,exam_id,channel,status) VALUES('pub_${id}','${id}','RESULT_NETWORK','ACTIVE');`);
  return { id, text: st.text };
}

describe('wrong upload tools on sonuc', () => {
  it('moves an evaluated upload to the right exam of the same type and year, and it is evaluated there', async () => {
    const { t, call, upload } = await setup();
    const sql = (q: string) => t.db.prepare(q).get() as any;
    const up = await upload('dealerI', generatedSheets(5, 3)); expect(up.status, up.text).toBe(200);
    const ev = await call('dealerI', `/api/admin/result-network/operations/scan-batches/${up.data.batchId}/evaluate`, { method: 'POST' }); expect(ev.status, ev.text).toBe(200);
    const right = await secondExam(t); expect(right.id, right.text).toBeTruthy();
    const other = await secondExam(t, 'AYT');
    const path = `/api/admin/result-network/operations/scan-batches/${up.data.batchId}/move-exam`;
    expect((await call('dealerI', path, { method: 'POST', body: { examId: right.id, reason: 'x' } })).status).toBe(400); // reason
    expect((await call('dealerI', path, { method: 'POST', body: { examId: t.examId, reason: 'Yanlış sınav' } })).status).toBe(400); // same exam
    if (other.id) expect([400, 404]).toContain((await call('dealerI', path, { method: 'POST', body: { examId: other.id, reason: 'Yanlış sınav' } })).status); // other type (or not usable)
    const before = sql(`SELECT count(*) n FROM exam_participants WHERE exam_id='${t.examId}' AND institution_id=(SELECT institution_id FROM scan_batches WHERE id='${up.data.batchId}')`).n;
    expect(before).toBe(5);
    const moved = await call('dealerI', path, { method: 'POST', body: { examId: right.id, reason: 'Yanlış sınava yüklendi' } });
    expect(moved.status, moved.text).toBe(200);
    expect(moved.data).toMatchObject({ removed: 5, exam: { id: right.id } });
    expect(sql(`SELECT exam_id,status FROM scan_batches WHERE id='${up.data.batchId}'`)).toEqual({ exam_id: right.id, status: 'READY' });
    expect(sql(`SELECT count(*) n FROM exam_participants WHERE exam_id='${t.examId}' AND institution_id=(SELECT institution_id FROM scan_batches WHERE id='${up.data.batchId}')`).n).toBe(0);
    expect(sql(`SELECT count(*) n FROM audit_logs WHERE action='SCAN_BATCH_MOVED_EXAM'`).n).toBe(1);
    const again = await call('dealerI', `/api/admin/result-network/operations/scan-batches/${up.data.batchId}/evaluate`, { method: 'POST' });
    expect(again.status, again.text).toBe(200);
    expect(sql(`SELECT count(*) n FROM exam_participants WHERE exam_id='${right.id}'`).n).toBe(5);
  });

  it('deletes all uploads of one school in one exam after a reason and SİL, restorable one by one', async () => {
    const { t, call, upload } = await setup();
    const sql = (q: string) => t.db.prepare(q).get() as any;
    const a = await upload('dealerI', generatedSheets(4, 3)); await call('dealerI', `/api/admin/result-network/operations/scan-batches/${a.data.batchId}/evaluate`, { method: 'POST' });
    const b = await upload('dealerI', generatedSheets(3, 9).map((s, i) => ({ ...s, no: String(2000 + i) })));
    const inst = sql(`SELECT institution_id i FROM scan_batches WHERE id='${a.data.batchId}'`).i;
    const q = `/api/admin/result-network/operations/institution-exam-uploads`;
    const info = await call('dealerI', `${q}?institutionId=${inst}&examId=${t.examId}`);
    expect(info.status, info.text).toBe(200);
    expect(info.data).toMatchObject({ uploads: 2, evaluated: 1, rows: 7, students: 4 });
    expect((await call('dealerI', q, { method: 'DELETE', body: { institutionId: inst, examId: t.examId, reason: 'Yanlış veri', confirm: 'evet' } })).status).toBe(400);
    expect((await call('dealerI', q, { method: 'DELETE', body: { institutionId: inst, examId: t.examId, reason: 'x', confirm: 'SİL' } })).status).toBe(400);
    const del = await call('dealerI', q, { method: 'DELETE', body: { institutionId: inst, examId: t.examId, reason: 'Kuruma yanlış veri yüklendi', confirm: 'SİL' } });
    expect(del.status, del.text).toBe(200);
    expect(del.data).toMatchObject({ deleted: 2, removed: 4 });
    expect(sql(`SELECT count(*) n FROM scan_batch_deletions WHERE batch_id IN ('${a.data.batchId}','${b.data.batchId}')`).n).toBe(2);
    expect(sql(`SELECT count(*) n FROM exam_participants WHERE exam_id='${t.examId}' AND institution_id='${inst}'`).n).toBe(0);
    expect((await call('dealerI', `${q}?institutionId=${inst}&examId=${t.examId}`)).data.uploads).toBe(0);
    expect((await call('dealerI', `/api/admin/result-network/operations/scan-batches/${a.data.batchId}/restore`, { method: 'POST' })).status).toBe(200);
    // another dealer's school is out of scope
    t.db.exec(`INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('dealerX','INSTITUTION_MANAGER','Bayi X','u','u',1,NULL);INSERT INTO result_network_dealers(id,user_id,status) VALUES('dX','dealerX','APPROVED');INSERT INTO result_network_dealer_scopes(id,dealer_id,scope_type,city) VALUES('sX','dX','CITY','Ankara');`);
    expect((await call('dealerX', q, { method: 'DELETE', body: { institutionId: inst, examId: t.examId, reason: 'Kuruma yanlış veri', confirm: 'SİL' } })).status).toBe(403);
  });
});

describe('wrong upload tools in the app', () => {
  it('lists, deletes with a reason and restores an upload from the evaluation screen', async () => {
    const t = await evaluatedExam('direct');
    const list = await t.request(`/api/exams/${t.examId}/uploads?institutionId=school`);
    expect(list.response.status, list.text).toBe(200);
    expect(list.data.uploads).toHaveLength(1);
    const id = list.data.uploads[0].id;
    expect(list.data.uploads[0].status).toBe('COMMITTED');
    const count = () => (t.db.prepare(`SELECT count(*) n FROM exam_participants WHERE exam_id='${t.examId}'`).get() as any).n;
    expect(count()).toBeGreaterThan(0);
    expect((await t.request(`/api/scan-batches/${id}`, 'DELETE', { reason: '' })).response.status).toBe(400);
    expect((await t.request(`/api/scan-batches/${id}`, 'DELETE', { reason: 'Yanlış dosya' }, 'teacher')).response.status).toBe(403);
    const del = await t.request(`/api/scan-batches/${id}`, 'DELETE', { reason: 'Yanlış dosya yüklendi' });
    expect(del.response.status, del.text).toBe(200);
    expect(del.data.removed).toBeGreaterThan(0);
    expect(count()).toBe(0);
    expect((await t.request(`/api/exams/${t.examId}/uploads?institutionId=school`)).data.uploads[0].deleted_at).toBeTruthy();
    expect((await t.request(`/api/scan-batches/${id}`, 'DELETE', { reason: 'Yanlış dosya yüklendi' })).response.status).toBe(409);
    const back = await t.request(`/api/scan-batches/${id}/restore`, 'POST');
    expect(back.response.status, back.text).toBe(200);
    expect((await t.request(`/api/exams/${t.examId}/uploads?institutionId=school`)).data.uploads[0].deleted_at).toBeNull();
    const ev = await t.request(`/api/scan-batches/${id}/evaluate`, 'POST');
    expect(ev.response.status, ev.text).toBe(200);
    expect(count()).toBeGreaterThan(0);
  });
});
