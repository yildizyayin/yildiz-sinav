import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** Hotfix 30 Oct: "Sonuçları yayınla" on app's Sonuç Ağı page must reach the finalize handler, not "API yolu bulunamadı". */
describe('app routes Sonuç Ağı governance actions', () => {
  it('reaches finalize on app for the Super Admin only', async () => {
    const t = await evaluatedExam('direct');
    const r = await t.request('/api/admin/result-network/administrations/eadm_missing/finalize', 'POST', {});
    expect(r.response.status).toBe(404);
    expect(r.data.error.code).toBe('ADMINISTRATION_NOT_FOUND');
    const teacher = await t.request('/api/admin/result-network/administrations/eadm_missing/finalize', 'POST', {}, 'teacher');
    expect(teacher.response.status).toBe(403);
  });
});
