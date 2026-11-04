import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { setup } from './helpers/sonuc-setup';
import { generatedSheets } from './helpers/evaluation-snapshot';
import { autoOpenDueExams } from '../worker/lib/exam-release';

process.env.TZ = 'UTC';

/**
 * Owner (4 Nov): "sınavı eklediğim anda yayınlansın" — a normal exam opens by itself in the app and on sonuc as soon as
 * it is evaluated; a Türkiye geneli exam (national schedule) or a planned future time waits; correction keeps it closed.
 * Synthetic data only.
 */
async function evaluated() {
  const s = await setup();
  const up = await s.upload('dealerI', generatedSheets(5, 7)); expect(up.status, up.text).toBe(200);
  expect((await s.call('dealerI', `/api/admin/result-network/operations/scan-batches/${up.data.batchId}/evaluate`, { method: 'POST' })).status).toBe(200);
  const q = (sql: string) => s.t.db.prepare(sql).get() as any;
  const app = () => q(`SELECT result_freeze_status s FROM exam_delivery_profiles WHERE exam_id='${s.t.examId}'`)?.s ?? 'OPEN';
  const net = () => q(`SELECT status FROM exam_administrations WHERE exam_id='${s.t.examId}' AND channel='RESULT_NETWORK'`).status;
  return { ...s, batchId: up.data.batchId as string, app, net };
}

describe('results open by themselves for a normal exam', () => {
  it('opens the app and sonuc after evaluation when the screen asks, and the schedule does the same', async () => {
    const s = await evaluated();
    expect(s.t.db.prepare(`SELECT results_auto_open f FROM exams WHERE id=?`).get(s.t.examId)).toEqual({ f: 1 }); // made from the exam form
    expect((await s.t.request(`/api/exam-definitions/${s.t.examId}/release`)).data).toMatchObject({ open: false, auto: true });
    const r = await s.call('dealerI', `/api/admin/result-network/operations/scan-batches/${s.batchId}/auto-open`, { method: 'POST' });
    expect(r.status, r.text).toBe(200);
    expect(r.data.steps).toEqual(['APP', 'NETWORK']);
    expect([s.app(), s.net()]).toEqual(['PUBLISHED', 'PUBLISHED']);
    expect(Number((s.t.db.prepare(`SELECT count(*) n FROM audit_logs WHERE action='EXAM_RESULTS_AUTO_OPENED'`).get() as any).n)).toBe(1);
    // asking again changes nothing
    expect((await s.call('dealerI', `/api/admin/result-network/operations/scan-batches/${s.batchId}/auto-open`, { method: 'POST' })).data.steps).toEqual([]);
  }, 120000);

  it('the scheduled run opens an evaluated normal exam', async () => {
    const s = await evaluated();
    expect(await autoOpenDueExams(s.t.env as any)).toBe(1);
    expect([s.app(), s.net()]).toEqual(['PUBLISHED', 'PUBLISHED']);
  }, 120000);

  it('a Türkiye geneli exam, a planned future time, an exam without the flag and an exam in correction wait', async () => {
    const national = await evaluated();
    national.t.db.prepare(`UPDATE exam_administrations SET result_release_at=? WHERE exam_id=?`).run(new Date(Date.now() + 86400000).toISOString(), national.t.examId);
    expect(await autoOpenDueExams(national.t.env as any)).toBe(0);
    expect((await national.t.request(`/api/exam-definitions/${national.t.examId}/release`)).data).toMatchObject({ auto: false, national: true });
    expect(national.app()).toBe('OPEN');
    expect(national.net()).not.toBe('PUBLISHED');

    const planned = await evaluated();
    planned.t.db.prepare(`INSERT INTO exam_delivery_profiles(exam_id,scope,result_publish_at) VALUES(?, 'CENTRAL', ?) ON CONFLICT(exam_id) DO UPDATE SET result_publish_at=excluded.result_publish_at`).run(planned.t.examId, new Date(Date.now() + 86400000).toISOString());
    expect(await autoOpenDueExams(planned.t.env as any)).toBe(0);

    const unflagged = await evaluated();
    unflagged.t.db.prepare(`UPDATE exams SET results_auto_open=0 WHERE id=?`).run(unflagged.t.examId);
    expect(await autoOpenDueExams(unflagged.t.env as any)).toBe(0);
    expect(unflagged.app()).toBe('OPEN');
  }, 240000);

  it('refuses a result time in the past when it is saved', async () => {
    const s = await evaluated();
    const r = await s.t.request(`/api/platform/exam-center/${s.t.examId}/schedule`, 'PUT', { resultPublishAt: new Date(Date.now() - 3600000).toISOString() });
    expect(r.response.status, r.text).toBe(400);
    expect(r.data.error.code).toBe('RESULT_TIME_IN_PAST');
    const ok = await s.t.request(`/api/platform/exam-center/${s.t.examId}/schedule`, 'PUT', { resultPublishAt: new Date(Date.now() + 3600000).toISOString() });
    expect(ok.response.status, ok.text).toBe(200);
  }, 120000);
});

describe('0158 backfill', () => {
  it('flags existing normal exams, not national, synthetic or archived ones', () => {
    const dir = new URL('../migrations/', import.meta.url), FIX = '0158_exam_results_auto_open.sql';
    const db = new DatabaseSync(':memory:');
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql') && f < FIX).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
    db.exec(`INSERT INTO exams(id,owner_type,academic_year,title,exam_type,status) VALUES
      ('n','CENTRAL','2026-2027','Normal','LGS','ACTIVE'),('t','CENTRAL','2026-2027','Ulusal','LGS','ACTIVE'),
      ('s','INSTITUTION','2026-2027','Sentetik','SYNTHETIC_BASELINE','CLOSED'),('a','CENTRAL','2026-2027','Arşiv','LGS','ARCHIVED');
      INSERT INTO exam_administrations(id,exam_id,academic_year,channel,status,result_release_at) VALUES('adm','t','2026-2027','RESULT_NETWORK','UPLOADING','2026-11-13T14:00:00Z');`);
    db.exec(readFileSync(new URL(FIX, dir), 'utf8'));
    expect(db.prepare("SELECT id,results_auto_open f FROM exams WHERE id IN ('a','n','s','t') ORDER BY id").all()).toEqual([{ id: 'a', f: 0 }, { id: 'n', f: 1 }, { id: 's', f: 0 }, { id: 't', f: 0 }]);
    db.close();
  });
});
