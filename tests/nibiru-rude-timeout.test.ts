import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { conversationKind } from '../worker/lib/nibiru-conversation';

/**
 * 23 Nov 2026: a short insult got a broken model answer ("Üzgünüm, sana kızdığın için geçmiş olsun…"), and a knowledge
 * question reached the model but never came back. Insults get a calm fixed reply; a slow model is skipped in time and
 * the question is still answered and recorded.
 */
async function setup(run: (model: string) => Promise<any>) {
  const t = await evaluatedExam('direct', { outcomes: true });
  await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST');
  await t.request(`/api/platform/exam-center/${t.examId}/publish`, 'POST');
  const models: string[] = [];
  (t.env as any).AI = { run: async (m: string) => { models.push(m); return run(m); } };
  (t.env as any).ENVIRONMENT = 'production';
  return { t, models, ask: async (message: string) => (await t.request('/api/nibiru/chat', 'POST', { message }, 'stuuser')).data };
}

describe('Nibiru: kaba mesaj ve yavaş model', () => {
  it('recognises short insults only', () => {
    for (const m of ['Salak', 'aptalsın', 'sen çok kötüsün', 'sus nibiru']) expect(conversationKind(m)).toBe('RUDE');
    for (const m of ['salak bir soru ama üslü sayı nedir', 'kötü not aldım']) expect(conversationKind(m)).not.toBe('RUDE');
  });

  it('answers an insult calmly without calling a model, and records it', async () => {
    const { t, models, ask } = await setup(async () => ({ response: 'x' }));
    const r = await ask('Salak');
    expect(r.answer).toMatch(/Sorun değil|istediğin cevabı|Kızgın görünüyorsun/);
    expect(models).toHaveLength(0);
    expect(t.db.prepare(`SELECT count(*) n FROM nibiru_audit_events`).get()).toEqual({ n: 1 });
  });

  it('skips a model that does not answer in time and uses the next one', async () => {
    const { t, models, ask } = await setup((m) => models.length === 1 ? new Promise(() => undefined) : Promise.resolve({ response: `Üslü ifadelerde taban aynıysa üsler toplanır. (${m})` }));
    const started = Date.now();
    const r = await ask('Üslü ifadeleri anlatır mısın?');
    expect(Date.now() - started).toBeLessThan(20_000);
    expect(models.length).toBe(2);
    expect(r.answer).toContain('üsler toplanır');
    expect(r.answer).toContain(models[1]);
    expect(t.db.prepare(`SELECT count(*) n FROM nibiru_audit_events`).get()).toEqual({ n: 1 });
  }, 30_000);
});
