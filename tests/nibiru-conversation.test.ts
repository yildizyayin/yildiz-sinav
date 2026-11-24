import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { clarifyAnswer, conversationAnswer, conversationKind } from '../worker/lib/nibiru-conversation';

/** Nibiru sohbet katmanı (owner, 11 Nov 2026): "merhaba" and "nasılsın" get their own, varied answers. Synthetic data only. */
it('recognises everyday conversation and leaves real questions alone', () => {
  const cases: Array<[string, string | null]> = [
    ['Merhaba', 'GREETING'], ['merhaba nibiru!', 'GREETING'], ['Günaydın', 'GREETING'], ['selam', 'GREETING'],
    ['Nasılsın?', 'HOW_ARE_YOU'], ['naber', 'HOW_ARE_YOU'], ['merhaba nasılsın', 'HOW_ARE_YOU'], ['ne yapıyorsun?', 'HOW_ARE_YOU'],
    ['Teşekkürler', 'THANKS'], ['sağ ol', 'THANKS'], ['Görüşürüz', 'BYE'], ['Sen kimsin?', 'WHO'], ['Neler yapabilirsin?', 'CAPABILITIES'],
    ['sıkıldım', 'LOW_MOOD'], ['çok yoruldum', 'LOW_MOOD'],
    ['Son sınavım nasıl geçti?', null], ['Bugün ne çalışayım?', null], ['Öğrencim nasıl?', null], ['merhaba son sınavım ne oldu, netlerim neden düştü acaba', null],
  ];
  for (const [m, k] of cases) expect(conversationKind(m), m).toBe(k);
});

it('answers in the role and age group, with varied phrasing and next questions', () => {
  const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };
  const kid = { role: 'STUDENT', firstName: 'Ece', gradeLevel: 5, hour: 9 };
  const a = conversationAnswer('GREETING', kid, seq(0, 0)), b = conversationAnswer('GREETING', kid, seq(0.5, 0.5));
  expect(a.answer).not.toBe(b.answer);
  expect(a.answer).toMatch(/^Nibiru: Günaydın Ece!/);
  expect(a.suggestions).toEqual(['Bugün ne çalışayım?', 'Son sınavım nasıl geçti?', 'Hangi kazanımlarda zorlanıyorum?']);
  const how = conversationAnswer('HOW_ARE_YOU', kid, seq(0));
  expect(how.answer).toContain('İyiyim');
  expect(how.answer).toContain('Sen nasılsın?');
  expect(how.answer).not.toBe(a.answer);
  const parent = conversationAnswer('HOW_ARE_YOU', { role: 'PARENT', firstName: 'Ayşe' }, seq(0));
  expect(parent.answer).toContain('sorduğunuz için');
  expect(parent.suggestions[0]).toBe('Çocuğum nasıl?');
  expect(conversationAnswer('WHO', { role: 'TEACHER' }).answer).toContain('uydurmam');
  expect(conversationAnswer('LOW_MOOD', kid, seq(0)).answer).toContain('rehber öğretmeninle');
  expect(clarifyAnswer({ role: 'STUDENT' }, true).answer).toContain('alanımın dışında');
});

it('in the chat, a greeting and "how are you" differ and never show exam data; unclear questions are asked back', async () => {
  const t = await evaluatedExam('direct', { outcomes: true });
  try {
    expect((await t.request(`${t.base}/release`, 'POST', {})).response.status).toBe(200);
    const chat = (message: string, user = 'stuuser') => t.request('/api/nibiru/chat', 'POST', { message }, user);
    const hi = await chat('Merhaba');
    expect(hi.response.status, hi.text).toBe(200);
    const how = await chat('Nasılsın?');
    expect(hi.data.intent).toBe('GREETING');
    expect(how.data.intent).toBe('GREETING');
    expect(how.data.answer).not.toBe(hi.data.answer);
    for (const r of [hi, how]) {
      expect(r.data.answer).not.toMatch(/net|doğru,|yanlış|puan/);
      expect(r.data.suggestions).toContain('Bugün ne çalışayım?');
    }
    const off = await chat('Bu akşam hangi film var?');
    expect(off.data).toMatchObject({ intent: 'OUT_OF_SCOPE', outcome: 'REDIRECTED' });
    expect(off.data.answer).toContain('alanımın dışında');
    const unclear = await chat('qwerty asdf');
    expect(unclear.data.intent).toBe('UNKNOWN');
    expect(unclear.data.suggestions.length).toBeGreaterThan(0);
    const teacher = await chat('Selam', 'teacher');
    expect(teacher.data.suggestions).toContain('Sınıfım nasıl?');
    // a real question still goes to the verified data path
    const exam = await chat('Son sınav ne oldu?');
    expect(exam.data.intent).toBe('LATEST_EXAM');
    expect(exam.data.suggestions).toBeUndefined();
  } finally { t.db.close(); }
}, 90000);
