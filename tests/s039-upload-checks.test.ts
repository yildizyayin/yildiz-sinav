import { describe, expect, it } from 'vitest';
import { setup } from './helpers/sonuc-setup';
import { generatedSheets } from './helpers/evaluation-snapshot';

process.env.TZ = 'UTC';

/** D-S039: checks before evaluating an upload on sonuc. Synthetic data only. */
const line = (s: any, cls = '8A') => '7108'.padEnd(10) + s.no.padStart(5) + s.name.padEnd(20) + cls + ' '.repeat(13) + 'A' + s.TUR.replace(/_/g, ' ').padEnd(20) + ' '.repeat(60) + s.MAT.replace(/_/g, ' ').padEnd(20) + ' '.repeat(20);
describe('S039 upload checks', () => {
  it('stops the same file into the same school and exam, allows it for another school and tells the bayi', async () => {
    const { t, call } = await setup();
    t.db.exec(`INSERT INTO national_institution_directory(meb_code,name,normalized_name,city,district,source_url) VALUES('740002','Kartal Deneme Lisesi','KARTAL DENEME LISESI','İstanbul','Kartal','https://www.meb.gov.tr/y')`);
    const text = generatedSheets(5, 3).map((s) => line(s)).join('\r\n');
    const send = (meb: string) => { const f = new FormData(); f.set('mebCode', meb); f.set('templateVersionId', 'optik-7108-sekonic-v1'); f.set('file', new File([text], 'sinif.txt', { type: 'text/plain' })); return call('dealerI', `/api/admin/result-network/operations/exams/${t.examId}/preview-file`, { method: 'POST', body: f }); };
    const first = await send('740001');
    expect(first.status, first.text).toBe(200);
    expect(first.data.checks.school).toMatchObject({ name: 'Pendik Deneme Lisesi', code: '740001' });
    const again = await send('740001');
    expect(again.status).toBe(409);
    expect(again.data.error.code).toBe('DUPLICATE_UPLOAD');
    const other = await send('740002');
    expect(other.status, other.text).toBe(200);
    expect(other.data.checks.sameFileElsewhere).toEqual([expect.objectContaining({ code: '740001' })]);
  });

  it('keeps a student of another school level out, with the reason, and evaluates the rest', async () => {
    const { t, call } = await setup();
    const sheets = generatedSheets(4, 3);
    const text = sheets.map((s, i) => line(s, i === 0 ? '4A' : '8A')).join('\r\n');
    const f = new FormData(); f.set('mebCode', '740001'); f.set('templateVersionId', 'optik-7108-sekonic-v1'); f.set('file', new File([text], 'karisik.txt', { type: 'text/plain' }));
    const up = await call('dealerI', `/api/admin/result-network/operations/exams/${t.examId}/preview-file`, { method: 'POST', body: f });
    expect(up.status, up.text).toBe(200);
    const grade = (t.db.prepare(`SELECT grade_level g FROM exams WHERE id='${t.examId}'`).get() as any).g;
    const ev = await call('dealerI', `/api/admin/result-network/operations/scan-batches/${up.data.batchId}/evaluate`, { method: 'POST' });
    expect(ev.status, ev.text).toBe(200);
    if (Number(grade) >= 5 && Number(grade) <= 8) {
      expect(ev.data.setAside).toHaveLength(1);
      expect(ev.data.setAside[0].reason).toContain('Sınıf düzeyi bu sınava uymuyor');
      expect(ev.data.processed).toBe(3);
    } else expect(ev.data.processed).toBe(4);
  });

  it('tells the school when the same student numbers were already evaluated here (second session or a repeat)', async () => {
    const { t, call, upload } = await setup();
    const sheets = generatedSheets(4, 3);
    const a = await upload('dealerI', sheets);
    await call('dealerI', `/api/admin/result-network/operations/scan-batches/${a.data.batchId}/evaluate`, { method: 'POST' });
    const b = await upload('dealerI', sheets.map((s) => ({ ...s, TUR: s.MAT, MAT: s.TUR })));
    expect(b.status, b.text).toBe(200);
    expect(b.data.checks.sameSchoolNumbers).toBe(4);
    void t;
  });
});
