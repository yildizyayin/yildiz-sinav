import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { pushUser, runNibiruProactive, vapidKeys } from '../worker/lib/nibiru-companion';

/**
 * Nibiru veli uygulaması 2 (owner, 24 Nov 2026): the conversation is kept, answers carry cards and can be rated,
 * Nibiru writes first when a result is published, phones are woken without any text, the guidance teacher's
 * approved notes come as cards.
 */
afterEach(() => vi.unstubAllGlobals());
async function setup() {
  const t = await evaluatedExam('direct', { outcomes: true });
  await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST');
  await t.request(`/api/platform/exam-center/${t.examId}/publish`, 'POST');
  t.db.exec(`UPDATE student_entities SET first_name='ALİ' WHERE id='s1'`);
  (t.env as any).ENVIRONMENT = 'production';
  return t;
}

describe('Nibiru sohbet geçmişi, kartlar ve değerlendirme', () => {
  it('keeps the conversation per child and adds result and topic cards', async () => {
    const t = await setup();
    const a = await t.request('/api/nibiru/chat', 'POST', { message: 'netleri nasıl', studentId: 's1' }, 'parent');
    expect(a.response.status).toBe(200);
    expect(a.data.messageId).toMatch(/^nbm/);
    expect(a.data.cards?.[0]).toMatchObject({ type: 'RESULT', net: 4.67 });
    const b = await t.request('/api/nibiru/chat', 'POST', { message: 'hangi konuda zorlanıyor', studentId: 's1' }, 'parent');
    expect(b.data.cards?.find((c: any) => c.type === 'TOPICS')?.items.length).toBeGreaterThan(0);
    const h = await t.request('/api/nibiru/history?studentId=s1', 'GET', undefined, 'parent');
    expect(h.data.messages.map((m: any) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(h.data.messages[1].cards[0].type).toBe('RESULT');
    expect(h.data.messages[1].text.startsWith('Nibiru:')).toBe(false);
    // another person never sees it
    expect((await t.request('/api/nibiru/history', 'GET', undefined, 'teacher')).data.messages).toEqual([]);
  });

  it('records 👍/👎 on Nibiru answers only and shows the 👎 ones to the super admin', async () => {
    const t = await setup();
    const a = await t.request('/api/nibiru/chat', 'POST', { message: 'netlerim nasıl' }, 'stuuser');
    expect((await t.request('/api/nibiru/feedback', 'POST', { messageId: a.data.messageId, value: -1 }, 'parent')).response.status).toBe(404);
    expect((await t.request('/api/nibiru/feedback', 'POST', { messageId: a.data.messageId, value: -1 }, 'stuuser')).response.status).toBe(200);
    expect((await t.request('/api/nibiru/feedback/summary', 'GET', undefined, 'stuuser')).response.status).toBe(403);
    const s = await t.request('/api/nibiru/feedback/summary', 'GET', undefined, 'admin');
    expect(s.data.totals).toMatchObject({ down: 1 });
    expect(s.data.down[0]).toMatchObject({ question: 'netlerim nasıl', role: 'STUDENT' });
  });

  it('brings the guidance teacher’s approved note when a parent asks how to help at home', async () => {
    const t = await setup();
    t.db.exec(`INSERT INTO guidance_resources(id,title,audience,topic,body,review_status,active) VALUES('gr1','Evde çalışma düzeni','PARENT','STUDY','Her gün aynı saatte kısa bir çalışma.','APPROVED',1),('gr2','Onaysız not','PARENT','STUDY','x','REVIEW',1);
      INSERT INTO guidance_resource_shares(id,resource_id,institution_id,shared_by) VALUES('sh1','gr1','school','admin'),('sh2','gr2','school','admin');`);
    const r = await t.request('/api/nibiru/chat', 'POST', { message: 'evde nasıl destek olabilirim', studentId: 's1' }, 'parent');
    const guide = r.data.cards?.find((c: any) => c.type === 'GUIDE');
    expect(guide.items.map((g: any) => g.id)).toEqual(['gr1']);
  });
});

describe('Nibiru önce yazar ve telefona haber verir', () => {
  it('writes once to the parent and the student when a result is published, and counts it as unread', async () => {
    const t = await setup();
    const r1 = await runNibiruProactive(t.env);
    expect(r1.people).toBe(2);
    expect(await runNibiruProactive(t.env)).toMatchObject({ people: 0 });
    expect((await t.request('/api/nibiru/unread', 'GET', undefined, 'parent')).data.unread).toBe(1);
    const h = await t.request('/api/nibiru/history?studentId=s1', 'GET', undefined, 'parent');
    expect(h.data.messages[0]).toMatchObject({ origin: 'PROACTIVE', role: 'assistant' });
    expect(h.data.messages[0].text).toMatch(/ALİ’nin \*\*.+\*\* sonucu açıklandı: \*\*4,67 net\*\*/);
    expect(h.data.messages[0].cards[0].type).toBe('RESULT');
    expect((await t.request('/api/nibiru/unread', 'GET', undefined, 'parent')).data.unread).toBe(0);
  });

  it('keeps one notification key, accepts only real push services and wakes phones without text', async () => {
    const t = await setup();
    const k1 = await vapidKeys(t.env), k2 = await vapidKeys(t.env);
    expect(k1.publicKey).toBe(k2.publicKey);
    expect((await t.request('/api/nibiru/push/subscription', 'POST', { endpoint: 'https://evil.example.com/x' }, 'parent')).response.status).toBe(400);
    expect((await t.request('/api/nibiru/push/subscription', 'POST', { endpoint: 'https://web.push.apple.com/abc' }, 'parent')).response.status).toBe(200);
    expect((await t.request('/api/nibiru/push/subscription', 'POST', { endpoint: 'https://fcm.googleapis.com/fcm/send/gone' }, 'parent')).response.status).toBe(200);
    const calls: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => { calls.push({ url, init }); return new Response(null, { status: url.includes('gone') ? 410 : 201 }); }));
    expect(await pushUser(t.env, 'parent')).toBe(1);
    expect(calls).toHaveLength(2);
    for (const c of calls) { expect(c.init.body).toBeUndefined(); expect(c.init.headers.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/); }
    expect(t.db.prepare(`SELECT endpoint FROM nibiru_push_subscriptions`).all()).toEqual([{ endpoint: 'https://web.push.apple.com/abc' }]);
  });
});
