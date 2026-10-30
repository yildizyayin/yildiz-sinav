import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** S047: KVKK aydınlatma metni — draft → legal review → active, acknowledged once per version; parent consent. */
const BODY = 'TASLAK — sentetik aydınlatma metni. Veri sorumlusu: Örnek A.Ş. Amaçlar: ölçme ve değerlendirme. Haklar: KVKK m.11.';

describe('S047 KVKK aydınlatma ve rıza akışı', () => {
  it('shows nothing until a Super Admin publishes; then each person acknowledges once', async () => {
    const t = await evaluatedExam('direct');
    let cur = await t.request('/api/privacy/notices/current', 'GET', undefined, 'stuuser');
    expect(cur.data.notice).toBeNull();

    expect((await t.request('/api/admin/privacy/notices', 'POST', { audience: 'STUDENT', version: '1.0', title: 'Aydınlatma', body: BODY }, 'teacher')).response.status).toBe(403);
    const draft = await t.request('/api/admin/privacy/notices', 'POST', { audience: 'STUDENT', version: '1.0', title: 'Aydınlatma', body: BODY });
    expect(draft.response.status).toBe(201);
    const id = draft.data.id;
    expect((await t.request('/api/admin/privacy/notices', 'POST', { audience: 'STUDENT', version: '1.0', title: 'x', body: BODY })).response.status).toBe(409);
    // A draft is never shown, and it cannot jump straight to publication.
    expect((await t.request('/api/privacy/notices/current', 'GET', undefined, 'stuuser')).data.notice).toBeNull();
    expect((await t.request(`/api/admin/privacy/notices/${id}/status`, 'POST', { status: 'ACTIVE' })).response.status).toBe(409);
    expect((await t.request(`/api/admin/privacy/notices/${id}/status`, 'POST', { status: 'LEGAL_REVIEW' })).response.status).toBe(200);
    expect((await t.request(`/api/admin/privacy/notices/${id}/status`, 'POST', { status: 'ACTIVE' })).response.status).toBe(200);

    cur = await t.request('/api/privacy/notices/current', 'GET', undefined, 'stuuser');
    expect(cur.data.notice.body).toBe(BODY);
    expect(cur.data.acknowledged).toBe(false);
    expect((await t.request('/api/privacy/notices/current', 'GET', undefined, 'parent')).data.notice).toBeNull();
    expect((await t.request('/api/privacy/notices/acknowledge', 'POST', { noticeVersionId: id, channel: 'WEB' }, 'stuuser')).response.status).toBe(201);
    expect((await t.request('/api/privacy/notices/current', 'GET', undefined, 'stuuser')).data.acknowledged).toBe(true);

    // A new version replaces the old one and is asked again.
    const v2 = await t.request('/api/admin/privacy/notices', 'POST', { audience: 'STUDENT', version: '1.1', title: 'Aydınlatma', body: BODY + ' Ek.' });
    await t.request(`/api/admin/privacy/notices/${v2.data.id}/status`, 'POST', { status: 'LEGAL_REVIEW' });
    await t.request(`/api/admin/privacy/notices/${v2.data.id}/status`, 'POST', { status: 'ACTIVE' });
    expect((t.db.prepare(`SELECT status FROM privacy_notice_versions WHERE id=?`).get(id) as any).status).toBe('RETIRED');
    cur = await t.request('/api/privacy/notices/current', 'GET', undefined, 'stuuser');
    expect(cur.data.notice.id).toBe(v2.data.id);
    expect(cur.data.acknowledged).toBe(false);
    const list = await t.request('/api/admin/privacy/notices');
    expect(list.data.items.find((r: any) => r.id === id).receipt_count).toBe(1);
  });

  it('asks a parent for consent only on purposes the Super Admin approved', async () => {
    const t = await evaluatedExam('direct');
    expect((await t.request('/api/privacy/consents/pending', 'GET', undefined, 'parent')).data.pending).toEqual([]);
    t.db.exec(`INSERT INTO processing_activity_registry(id,code,title,purpose,subject_categories_json,data_categories_json,lawful_basis_code,status)
      VALUES('pa1','AI_SESSIONS','YZ seansları','Nibiru ile kişiye özel çalışma','["STUDENT"]','["EDUCATION"]','EXPLICIT_CONSENT','APPROVED'),
            ('pa2','DRAFT_PURPOSE','Taslak','Taslak','["STUDENT"]','["EDUCATION"]','EXPLICIT_CONSENT','DRAFT');`);
    const pending = await t.request('/api/privacy/consents/pending', 'GET', undefined, 'parent');
    expect(pending.data.pending).toEqual([{ purposeCode: 'AI_SESSIONS', title: 'YZ seansları', purpose: 'Nibiru ile kişiye özel çalışma', studentId: 's1', studentName: 'ALI YILMAZ' }]);
    expect((await t.request('/api/privacy/consents/pending', 'GET', undefined, 'stuuser')).data.pending).toEqual([]);
    expect((await t.request('/api/privacy/consents', 'POST', { purposeCode: 'AI_SESSIONS', studentId: 's1', channel: 'WEB' }, 'parent')).response.status).toBe(201);
    expect((await t.request('/api/privacy/consents/pending', 'GET', undefined, 'parent')).data.pending).toEqual([]);
  });
});
