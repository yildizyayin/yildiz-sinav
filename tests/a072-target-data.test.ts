import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** A072: target ("tercih robotu") data — official-source rows only (existing guard), filters work, comparisons use published results. Synthetic data only. */
const row = (code: string, extra: any = {}) => ({ externalCode: code, name: `Sentetik Lise ${code}`, city: 'İstanbul', district: 'Kadıköy', baseScore: 450, percentile: 2.5, sourceUrl: 'https://rotamaarif.meb.gov.tr/okul/' + code, netProfile: { 'Türkçe': 18 }, sourceVerifiedAt: '2026-08-22T10:00:00Z', ...extra });

describe('A072 target data', () => {
  it('accepts only official-source rows, filters them, and compares with published results only', async () => {
    const t = await evaluatedExam('direct', { outcomes: true });
    expect((t.db.prepare("SELECT count(*) c FROM outcome_results WHERE student_id='s1'").get() as any).c).toBeGreaterThan(0);
    const bad = await t.request('/api/academic-targets/import', 'POST', { sourceKind: 'MEB_ROTA_MAARIF', year: 2026, rows: [row('A1'), row('A2', { sourceUrl: 'https://meb-gov-tr.example.com/x' })] });
    expect(bad.response.status).toBe(400); expect(bad.data.error.code).toBe('OFFICIAL_TARGET_BATCH_INVALID'); // existing official-source guard
    expect((await t.request('/api/academic-targets/import', 'POST', { sourceKind: 'MEB_ROTA_MAARIF', year: 2026, rows: [row('A1'), row('B2', { city: 'Ankara', district: 'Çankaya', sourceUrl: 'http://rotamaarif.meb.gov.tr/x' })] })).response.status).toBe(400); // https only
    const ok = await t.request('/api/academic-targets/import', 'POST', { sourceKind: 'MEB_ROTA_MAARIF', year: 2026, rows: [row('A1'), row('B2', { city: 'Ankara', district: 'Çankaya' })] });
    expect(ok.response.status, ok.text).toBe(200);
    const ist = await t.request('/api/academic-targets/search?type=LGS_SCHOOL&year=2026&city=İstanbul', 'GET', undefined, 'stuuser');
    expect(ist.data.targets.map((x: any) => x.external_code)).toEqual(['A1']);
    const target = ist.data.targets[0].id;
    expect((await t.request('/api/academic-targets/me', 'POST', { targetType: 'LGS_SCHOOL', targetId: target }, 'stuuser')).response.status).toBe(201);

    const before = await t.request('/api/academic-targets/analysis', 'GET', undefined, 'stuuser');
    expect(before.data.analysis.examCount).toBe(0);
    expect(before.data.analysis.weakOutcomes).toEqual([]);
    const par = (await t.request('/api/academic-targets/analysis?studentId=s1', 'GET', undefined, 'parent')).data.analysis;
    expect(par.examCount).toBe(0); expect(par.weakOutcomes).toEqual([]);
    expect((await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST')).response.status).toBe(200);
    expect((await t.request(`/api/platform/exam-center/${t.examId}/publish`, 'POST')).response.status).toBe(200);
    const after = await t.request('/api/academic-targets/analysis', 'GET', undefined, 'stuuser');
    expect(after.data.analysis.examCount).toBe(1);
    expect(after.data.analysis.source).toMatchObject({ kind: 'MEB_ROTA_MAARIF', year: 2026 });
  });
});
