import { describe, expect, it } from 'vitest';
import { importInPackages, type ImportProgress } from '../src/lib/directoryImport';
import { evaluatedExam } from './helpers/exam-flow';

/** Directory import: visible progress, retries, a clear stop reason, resume without duplicates, and a FAILED run instead of a stuck RUNNING one. */
describe('directory import feedback', () => {
  const rows = Array.from({ length: 1000 }, (_, i) => i);
  const noWait = async () => {};

  it('reports progress per package and the totals at the end', async () => {
    const seen: ImportProgress[] = [];
    const r = await importInPackages(rows, async (c) => ({ rowsUpserted: c.length - 1, invalid: 1 }), (p) => seen.push(p), { wait: noWait });
    expect(r).toMatchObject({ finished: true, done: 1000, total: 1000, upserted: 996, invalid: 4 });
    expect(seen.map((p) => p.done)).toEqual([0, 250, 500, 750, 1000, 1000]);
  });

  it('retries a failing package and continues', async () => {
    let calls = 0;
    const r = await importInPackages(rows, async (c) => { calls++; if (calls === 2) throw Object.assign(new Error('Sunucu yanıt veremedi (503).'), { status: 503 }); return { rowsUpserted: c.length }; }, () => {}, { wait: noWait });
    expect(r.finished).toBe(true); expect(r.upserted).toBe(1000); expect(calls).toBe(5);
  });

  it('stops with the reason after the retries and resumes from the same row', async () => {
    let fail = true;
    const send = async (c: number[]) => { if (c[0] === 500 && fail) throw Object.assign(new Error('Bu kurum paketi kaydedilemedi.'), { status: 503 }); return { rowsUpserted: c.length }; };
    const stopped = await importInPackages(rows, send, () => {}, { wait: noWait });
    expect(stopped).toMatchObject({ failedAt: 500, done: 500, upserted: 500, error: 'Bu kurum paketi kaydedilemedi.' });
    expect(stopped.finished).toBeUndefined();
    fail = false;
    const resumed = await importInPackages(rows, send, () => {}, { wait: noWait, start: stopped.failedAt, base: stopped });
    expect(resumed).toMatchObject({ finished: true, done: 1000, upserted: 1000 });
  });

  it('does not retry a request the server refused (4xx)', async () => {
    let calls = 0;
    const r = await importInPackages(rows, async () => { calls++; throw Object.assign(new Error('Kaynak adresi https:// ile başlamalı.'), { status: 400 }); }, () => {}, { wait: noWait });
    expect(calls).toBe(1); expect(r.error).toContain('https://');
  });

  it('marks the run FAILED with a clear message when a package cannot be written, and a resend does not duplicate', async () => {
    const t = await evaluatedExam('direct');
    const body = (n: number) => ({ sourceType: 'MEB_OFFICIAL_EXPORT', sourceUrl: 'https://www.meb.gov.tr/baglantilar/okullar/index.php', rows: Array.from({ length: n }, (_, i) => ({ mebCode: String(800000 + i), name: `Okul ${i}`, city: 'Ankara', district: 'Çankaya', ownership: 'PUBLIC' })) });
    expect((await t.request('/api/admin/institution-directory/import', 'POST', { ...body(3), sourceUrl: 'http://x' })).data.error.code).toBe('DIRECTORY_SOURCE_URL_REQUIRED');
    const batch = t.env.DB.batch; let n = 0;
    t.env.DB.batch = async (st: any[]) => { n++; if (n === 3) throw new Error('D1_ERROR: storage operation exceeded timeout'); return batch(st); };
    const r = await t.request('/api/admin/institution-directory/import', 'POST', body(200));
    expect(r.response.status).toBe(503);
    expect(r.data.error).toMatchObject({ code: 'DIRECTORY_IMPORT_FAILED' });
    expect((t.db.prepare(`SELECT status FROM institution_directory_sync_runs ORDER BY rowid DESC LIMIT 1`).get() as any).status).toBe('FAILED');
    t.env.DB.batch = batch;
    const again = await t.request('/api/admin/institution-directory/import', 'POST', body(200));
    expect(again.response.status, again.text).toBe(201);
    expect((t.db.prepare('SELECT count(*) n FROM national_institution_directory').get() as any).n).toBe(200);
  });
});
