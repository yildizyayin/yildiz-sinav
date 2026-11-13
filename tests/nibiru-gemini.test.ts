import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { trGenitive, trNum } from '../worker/lib/nibiru';

/** Nibiru 2.0 (owner, 13 Nov 2026): free Gemini, warm tone, no personal data to the model, KVKK gate. Synthetic data. */
afterEach(() => vi.unstubAllGlobals());

function stub(reply: any) {
  const bodies: any[] = [];
  vi.stubGlobal('fetch', vi.fn(async (u: any, init?: any) => {
    if (String(u).includes('generativelanguage')) { bodies.push(JSON.parse(init.body)); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] })); }
    return new Response('{}', { status: 404 });
  }));
  return bodies;
}
async function ready() {
  const t = await evaluatedExam('direct', { outcomes: true });
  await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST'); await t.request(`/api/platform/exam-center/${t.examId}/publish`, 'POST');
  Object.assign(t.env, { GEMINI_API_KEY: 'synthetic' });
  return t;
}

describe('Nibiru 2.0 with Gemini', () => {
  it('writes numbers and names the Turkish way on the rule-based path', () => {
    expect(trNum(4.6667)).toBe('4,67'); expect(trNum(333.34)).toBe('333,34');
    expect(trGenitive('ALİ')).toBe('Ali’nin'); expect(trGenitive('Aras')).toBe('Aras’ın'); expect(trGenitive('Duru')).toBe('Duru’nun'); expect(trGenitive('Efe')).toBe('Efe’nin');
  });

  it('answers through Gemini without sending any name, fills {ad} back in, keeps the conversation and backs actions', async () => {
    const t = await ready();
    t.db.exec(`UPDATE student_entities SET first_name='ALİ' WHERE id='s1'`); // Turkish capitals as e-Okul writes them
    const o = t.db.prepare(`SELECT o.id,o.code FROM outcome_results r JOIN outcomes o ON o.id=r.outcome_id WHERE r.student_id='s1' ORDER BY r.success_rate LIMIT 1`).get() as any;
    t.db.prepare(`INSERT INTO outcome_auto_videos(id,outcome_id,youtube_video_id,title,duration_seconds,start_seconds,end_seconds,method) VALUES('ng1',?,'AAAAAAAAAAA','Konu',600,60,240,'GEMINI')`).run(o.id);
    const bodies = stub({ answer: 'Selam {ad}! Üslü ifadelerde biraz zorlanmışsın, birlikte bakalım.', suggestions: ['Bana 3 soru sor', 'Konuyu anlat'], actions: [{ type: 'VIDEO', outcome: o.code }, { type: 'VIDEO', outcome: 'UYDURMA' }, { type: 'WRITE_COUNSELOR' }, { type: 'PLAN' }] });
    const r = await t.request('/api/nibiru/chat', 'POST', { message: 'hangi konuda zorlanıyorum' }, 'stuuser');
    expect(r.response.status, r.text).toBe(200);
    expect(r.data.answer).toBe('Selam Ali! Üslü ifadelerde biraz zorlanmışsın, birlikte bakalım.');
    expect(r.data.suggestions).toEqual(['Bana 3 soru sor', 'Konuyu anlat']);
    expect(r.data.actions.map((a: any) => a.type)).toEqual(['VIDEO', 'WRITE_COUNSELOR', 'PLAN']);
    expect(r.data.actions[0]).toMatchObject({ url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA&t=60s', start: 60, end: 240 });
    const sent = JSON.stringify(bodies[0]);
    expect(sent).not.toMatch(/ALİ|Ali|YILMAZ|Yılmaz|stuuser|"s1"|101/);
    expect(sent).toContain(o.code);
    await t.request('/api/nibiru/chat', 'POST', { message: 'peki ne yapayım' }, 'stuuser');
    expect(JSON.stringify(bodies[1].contents)).toContain('hangi konuda zorlanıyorum');
    expect(t.db.prepare(`SELECT sum(calls) n FROM nibiru_gemini_usage`).get()).toEqual({ n: 2 });
  });

  it('keeps quick greetings and the safety answer off the model, and stays off in production until KVKK approval', async () => {
    const t = await ready();
    const bodies = stub({ answer: 'x', suggestions: [], actions: [] });
    await t.request('/api/nibiru/chat', 'POST', { message: 'merhaba' }, 'stuuser');
    const safe = await t.request('/api/nibiru/chat', 'POST', { message: 'okulda biri beni dövüyor' }, 'stuuser');
    expect(bodies).toHaveLength(0);
    expect(JSON.stringify(safe.data)).toContain('rehber öğretmenine');
    Object.assign(t.env, { ENVIRONMENT: 'production' });
    const r = await t.request('/api/nibiru/chat', 'POST', { message: 'son sınavım nasıl geçti' }, 'stuuser');
    expect(r.response.status, r.text).toBe(200);
    expect(bodies).toHaveLength(0); // proc_google_gemini is PENDING → rule-based answer
    expect(r.data.answer).toContain('4,67 net');
  });
});
