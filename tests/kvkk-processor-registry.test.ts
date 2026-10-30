import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { externalPersonalDataGate } from '../worker/lib/privacy-external-gate';
import { fiveBusinessDaysAfter } from '../worker/lib/privacy-processor-admin';

/**
 * KVKK veri işleyen kayıtları (30 Oct): the Super Admin records evidence and approves; the system never approves by
 * itself. A record approved here is exactly what the Nibiru AI gate requires. Synthetic data only.
 */
describe('KVKK processor registry editing', () => {
  it('needs evidence and explicit approval, keeps the gate closed until every condition holds, and audits', async () => {
    const t = await evaluatedExam('direct');
    const gate = () => externalPersonalDataGate({ ...t.env, ENVIRONMENT: 'production' }, 'NIBIRU_AI');
    const before = await gate();
    expect(before.ok).toBe(false);

    const list = await t.request('/api/admin/privacy/processor-registry');
    expect(list.response.status, list.text).toBe(200);
    const nibiru = list.data.items.find((x: any) => x.processor.service_code === 'NIBIRU_AI');
    expect(nibiru.ready).toBe(false);
    expect(nibiru.blockers.join(' ')).toMatch(/DPA/);
    const pid = nibiru.processor.id;
    const edit = (body: any, as = 'admin') => t.request(`/api/admin/privacy/processors/${pid}`, 'POST', body, as);

    expect((await edit({ dpaStatus: 'SIGNED', evidence: 'x' })).data.error.code).toBe('EVIDENCE_REQUIRED');
    expect((await edit({ dpaStatus: 'SIGNED', evidence: 'Cloudflare DPA, hesap kabulü 2026-10-30' }, 'teacher')).response.status).toBe(403);
    // approval refused while the training position is unknown, and without the explicit tick
    expect((await edit({ dpaStatus: 'SIGNED', legalReviewStatus: 'APPROVED', confirmApproval: true, evidence: 'Cloudflare DPA, hesap kabulü 2026-10-30' })).data.error.code).toBe('TRAINING_UNKNOWN');
    expect((await edit({ dpaStatus: 'SIGNED', trainingOnCustomerData: 'DISABLED', legalReviewStatus: 'APPROVED', evidence: 'Cloudflare DPA ve Workers AI gizlilik belgesi' })).data.error.code).toBe('APPROVAL_CONFIRMATION_REQUIRED');
    const ok = await edit({ dpaStatus: 'SIGNED', trainingOnCustomerData: 'DISABLED', legalReviewStatus: 'APPROVED', confirmApproval: true, evidence: 'Cloudflare DPA ve Workers AI gizlilik belgesi' });
    expect(ok.response.status, ok.text).toBe(200);
    expect(ok.data.processor).toMatchObject({ dpa_status: 'SIGNED', training_on_customer_data: 'DISABLED', legal_review_status: 'APPROVED', approved_by: 'admin' });
    // still closed: no transfer record
    expect(await gate()).toMatchObject({ ok: false, code: 'TRANSFER_REGISTRY_MISSING' });

    const xfer = (body: any, id = '') => t.request(`/api/admin/privacy/transfers${id ? `/${id}` : ''}`, 'POST', body);
    const created = await xfer({ processorId: pid, destination: 'Cloudflare küresel ağı', dataCategories: ['Akademik sonuç', 'Soru metni'], subjectCategories: 'Öğrenci, Veli', mechanism: 'STANDARD_CONTRACT', evidence: 'Standart sözleşme taslağı hazırlandı' });
    expect(created.response.status, created.text).toBe(201);
    const tid = created.data.transferId;
    expect(await gate()).toMatchObject({ ok: false, code: 'TRANSFER_NOT_APPROVED' });
    const activate = { status: 'ACTIVE', confirmApproval: true, evidence: 'Standart sözleşme imzalandı, KVKK bildirimi yapıldı' };
    expect((await xfer({ ...activate, agreementReference: 'SS-2026-01' }, tid)).data.error.code).toBe('AUTHORITY_NOTIFICATION_REQUIRED');
    const done = await xfer({ ...activate, agreementReference: 'SS-2026-01', signedAt: '2026-10-30', authorityNotifiedAt: '2026-11-03' }, tid);
    expect(done.response.status, done.text).toBe(200);
    expect(done.data.ready).toBe(true);
    const row = t.db.prepare(`SELECT status,authority_notification_required,authority_notification_due_at,approved_by FROM international_transfer_registry WHERE id=?`).get(tid) as any;
    expect(row).toMatchObject({ status: 'ACTIVE', authority_notification_required: 1, authority_notification_due_at: '2026-11-06', approved_by: 'admin' });
    expect(await gate()).toMatchObject({ ok: true, enforcement: 'APPROVED' });

    const audits = t.db.prepare(`SELECT action,details_json FROM audit_logs WHERE action LIKE 'PRIVACY_%' ORDER BY created_at`).all() as any[];
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(['PRIVACY_PROCESSOR_UPDATED', 'PRIVACY_TRANSFER_CREATED', 'PRIVACY_TRANSFER_UPDATED']));
    expect(audits.find((a) => a.action === 'PRIVACY_PROCESSOR_UPDATED').details_json).toMatch(/Workers AI gizlilik/);
  });

  it('counts five business days from the signing date', () => {
    expect(fiveBusinessDaysAfter('2026-10-30')).toBe('2026-11-06');
    expect(fiveBusinessDaysAfter('2026-11-02')).toBe('2026-11-09');
  });
});
