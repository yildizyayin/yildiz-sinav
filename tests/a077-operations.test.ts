import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { LOAD_TEST_MAX_VUS } from '../worker/nibiru-license-entry';

/** A077: the Super Admin sees real running/waiting/failed counts; the load-test agent cannot run unbounded or by default. Synthetic data only. */
afterEach(() => vi.unstubAllGlobals());

describe('A077 operations and agents', () => {
  it('shows real counts to the Super Admin only', async () => {
    const t = await evaluatedExam('direct');
    t.db.exec(`INSERT INTO announcements(id,institution_id,created_by,announcement_type,title,body,audience_type,status,updated_at) VALUES('an1','school','admin','GENERAL','t','b','ALL','SENDING','2020-01-01 00:00:00');
      INSERT INTO announcement_deliveries(id,announcement_id,recipient_user_id,channel,status,failure_code) VALUES('d1','an1','parent','WHATSAPP','FAILED','PROVIDER_ERROR');`);
    const r = await t.request('/api/admin/operations-summary');
    expect(r.response.status, r.text).toBe(200);
    expect(r.data.failures).toMatchObject({ notificationDeliveries: 1, announcementsStuckSending: 1 });
    expect(r.data.status).toBe('ATTENTION');
    expect(r.data.problems.join(' ')).toContain('Gönderilemeyen bildirim');
    for (const who of ['teacher', 'stuuser', 'parent']) expect((await t.request('/api/admin/operations-summary', 'GET', undefined, who)).response.status).toBe(403);
  });

  it('refuses the load test unless explicitly enabled and bounds its size', async () => {
    const t = await evaluatedExam('direct');
    const calls: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => { calls.push({ url: String(url), body: init?.body }); return new Response(null, { status: 204 }); }));
    Object.assign(t.env, { GITHUB_AGENT_TOKEN: 'synthetic' });
    const go = (inputs: any = {}) => t.request('/api/ai-agents/dispatch', 'POST', { workflow: 'agent-yuk-testi.yml', inputs });
    const off = await go({ sanal_kullanici_sayisi: 10 });
    expect(off.response.status).toBe(409); expect(off.data.error.code).toBe('LOAD_TEST_DISABLED');
    Object.assign(t.env, { AGENT_LOAD_TEST_ENABLED: 'true' });
    expect((await go({ sanal_kullanici_sayisi: 999999 })).response.status).toBe(400);
    expect((await go({ sanal_kullanici_sayisi: LOAD_TEST_MAX_VUS + 1 })).response.status).toBe(400);
    expect(calls).toHaveLength(0);
    const ok = await go({});
    expect(ok.response.status, ok.text).toBe(200);
    expect(JSON.parse(calls[0].body).inputs.sanal_kullanici_sayisi).toBe('50');
    expect((await t.request('/api/ai-agents/dispatch', 'POST', { workflow: 'agent-yuk-testi.yml', inputs: {} }, 'teacher')).response.status).toBe(403);
  });
});
