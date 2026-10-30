import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** Hotfix 30 Oct: opening a dealer on Sonuç Ağı failed with a server error (13 columns, 12 values). Synthetic data. */
describe('Sonuç Ağı dealer creation', () => {
  it('creates a dealer with a new account and its contact details', async () => {
    const t = await evaluatedExam('direct');
    const r = await t.request('/api/admin/result-network/dealers', 'POST', { displayName: 'Deneme Bayi', username: 'denemebayi', email: 'bayi@example.com', password: 'Sifre123!', contactName: 'Ali Deneme', contactPhone: '5551112233', contactEmail: 'bayi@example.com', address: 'Sentetik adres', neighborhood: 'Merkez', city: 'İstanbul', district: 'Kartal' });
    expect(r.response.status, r.text).toBe(201);
    const row = t.db.prepare(`SELECT status,display_name,contact_name,contact_phone,city,district,approved_by FROM result_network_dealers WHERE id=?`).get(r.data.dealerId) as any;
    expect(row).toMatchObject({ status: 'APPROVED', display_name: 'Deneme Bayi', contact_name: 'Ali Deneme', contact_phone: '5551112233', city: 'İstanbul', district: 'Kartal', approved_by: 'admin' });
    expect((await t.request('/api/admin/result-network/dealers', 'POST', { displayName: 'Deneme Bayi', username: 'denemebayi', password: 'Sifre123!' })).response.status).toBe(409);
    expect((await t.request('/api/admin/result-network/dealers', 'POST', { displayName: 'X', username: 'baska', password: 'Sifre123!' }, 'teacher')).response.status).toBe(403);
  });
});
