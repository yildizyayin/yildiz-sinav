import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** KVKK taslak metinleri (owner, 12 Nov 2026): loaded as drafts; editable while draft; never published with [ ] fields. */
describe('KVKK notice drafts', () => {
  it('ships six drafts that cannot be published until their [ ] fields are filled', async () => {
    const t = await evaluatedExam('direct');
    const rows = t.db.prepare(`SELECT id,audience,status FROM privacy_notice_versions WHERE version='2026.11-taslak' ORDER BY audience`).all() as any[];
    expect(rows.map((r) => r.audience)).toEqual(['GUIDANCE_TEACHER', 'INSTITUTION_MANAGER', 'OTHER', 'PARENT', 'STUDENT', 'TEACHER']);
    expect(rows.every((r) => r.status === 'DRAFT')).toBe(true);
    const id = 'pnv_2026_11_student';
    const read = await t.request(`/api/admin/privacy/notices/${id}`);
    expect(read.response.status, read.text).toBe(200);
    expect(read.data.notice.body).toContain('[ANUNEX işleten şirketin unvanı]');
    expect(read.data.notice.body).toContain('Kısaca:');
    expect((await t.request(`/api/admin/privacy/notices/${id}/status`, 'POST', { status: 'LEGAL_REVIEW' })).response.status).toBe(200);
    const blocked = await t.request(`/api/admin/privacy/notices/${id}/status`, 'POST', { status: 'ACTIVE' });
    expect(blocked.response.status).toBe(409);
    expect(blocked.data.error.code).toBe('NOTICE_PLACEHOLDERS');
    // back to draft, fill the fields, then it can go live
    expect((await t.request(`/api/admin/privacy/notices/${id}/status`, 'POST', { status: 'DRAFT' })).response.status).toBe(200);
    const filled = String(read.data.notice.body).replace(/\[[^\]\n]{2,}\]/g, 'Örnek Bilgi');
    expect((await t.request(`/api/admin/privacy/notices/${id}/body`, 'POST', { body: filled }, 'teacher')).response.status).toBe(403);
    expect((await t.request(`/api/admin/privacy/notices/${id}/body`, 'POST', { body: filled })).response.status).toBe(200);
    await t.request(`/api/admin/privacy/notices/${id}/status`, 'POST', { status: 'LEGAL_REVIEW' });
    expect((await t.request(`/api/admin/privacy/notices/${id}/body`, 'POST', { body: filled })).response.status).toBe(409);
    expect((await t.request(`/api/admin/privacy/notices/${id}/status`, 'POST', { status: 'ACTIVE' })).response.status).toBe(200);
    const cur = await t.request('/api/privacy/notices/current', 'GET', undefined, 'stuuser');
    expect(cur.data.notice.body).toBe(filled);
  });
});
