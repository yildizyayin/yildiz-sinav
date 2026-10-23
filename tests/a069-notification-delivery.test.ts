import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import { processScheduledAnnouncements } from '../worker/lib/academic-growth';

/** A069: notification delivery — each announcement goes out once, can be cancelled before sending, and failures stay visible. Synthetic data only. */
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('mgr','INSTITUTION_MANAGER','Müdür','unused','unused',1,'school');
    INSERT INTO nibiru_whatsapp_identities(id,user_id,phone_e164,status,verification_method,verified_at) VALUES('wi1','parent','+905550000003','VERIFIED','PAIRING_CODE',CURRENT_TIMESTAMP);`);
  const cookie = (await createSession(t.env, 'mgr', new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const app = (await import('../worker/preview-policy-production-entry')).default as any;
  const mgr = async (path: string, method = 'GET', body?: any) => { const r = await app.fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookie, Origin: 'https://app.anunex.com', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {} }); const text = await r.text(); return { status: r.status, data: JSON.parse(text) }; };
  const create = async (extra: any = {}) => { const r = await mgr('/api/announcements', 'POST', { title: 'Veli toplantısı', body: 'Cuma 17:00', audienceType: 'ALL', channels: ['PANEL', 'WHATSAPP'], whatsappTemplateName: 'genel_duyuru', ...extra }); expect(r.status, JSON.stringify(r.data)).toBe(201); return r.data.id as string; };
  return { ...t, mgr, create };
}

describe('A069 notification delivery', () => {
  it('sends an announcement once and shows skipped or failed channels', async () => {
    const t = await setup();
    const id = await t.create();
    expect((await t.mgr(`/api/announcements/${id}/send`, 'POST')).status).toBe(200);
    const notes = () => (t.db.prepare(`SELECT count(*) c FROM notifications WHERE entity_id=?`).get(id) as any).c;
    const before = notes();
    expect(before).toBeGreaterThan(0);
    const again = await t.mgr(`/api/announcements/${id}/send`, 'POST');
    expect(again.status).toBe(409); expect(again.data.error.code).toBe('ANNOUNCEMENT_NOT_SENDABLE');
    expect(notes()).toBe(before);
    const d = await t.mgr(`/api/announcements/${id}/deliveries`);
    expect(d.data.deliveries).toEqual(expect.arrayContaining([expect.objectContaining({ channel: 'WHATSAPP', status: 'SKIPPED', failure_code: 'PROVIDER_NOT_CONFIGURED' })]));
    const list = (await t.mgr('/api/announcements')).data.announcements.find((a: any) => a.id === id);
    expect(list.skipped_count).toBeGreaterThan(0);
  });

  it('cancels a scheduled announcement before it goes out and never re-sends a delivered WhatsApp message', async () => {
    const t = await setup();
    const id = await t.create({ scheduledAt: '2020-01-01T00:00:00Z' });
    expect((await t.request(`/api/announcements/${id}/cancel`, 'POST', {}, 'teacher')).response.status).toBe(403);
    expect((await t.mgr(`/api/announcements/${id}/cancel`, 'POST')).status).toBe(200);
    await processScheduledAnnouncements(t.env as any);
    expect((t.db.prepare(`SELECT count(*) c FROM announcement_deliveries WHERE announcement_id=?`).get(id) as any).c).toBe(0);
    expect((await t.mgr(`/api/announcements/${id}/send`, 'POST')).status).toBe(409);
    expect((await t.mgr(`/api/announcements/${id}/cancel`, 'POST')).status).toBe(409);

    // a run interrupted after the WhatsApp message went out: the retry must not send it again
    const id2 = await t.create({ scheduledAt: '2020-01-01T00:00:00Z' });
    t.db.prepare(`INSERT INTO announcement_deliveries(id,announcement_id,recipient_user_id,channel,status,provider_message_id,attempted_at) VALUES('d1',?,'parent','WHATSAPP','SENT','wamid.sent','2020-01-01 00:00:01')`).run(id2);
    await processScheduledAnnouncements(t.env as any);
    expect(t.db.prepare(`SELECT status,attempted_at FROM announcement_deliveries WHERE id='d1'`).get()).toMatchObject({ status: 'SENT', attempted_at: '2020-01-01 00:00:01' });
    expect(t.db.prepare('SELECT status FROM announcements WHERE id=?').get(id2)).toMatchObject({ status: 'SENT' });
  });
});
