import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/**
 * Nibiru "kişisel veri göndermeyen mod" (owner, 13 Nov 2026): in production the full AI path is closed by the KVKK
 * gate, so Nibiru answers own-data questions from ANUNEX's verified data and sends only knowledge questions to
 * Workers AI — with no name, exam, net or score in what the model receives.
 */
async function setup() {
  const t = await evaluatedExam('direct', { outcomes: true });
  await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST');
  await t.request(`/api/platform/exam-center/${t.examId}/publish`, 'POST');
  t.db.exec(`UPDATE student_entities SET first_name='ALİ' WHERE id='s1'`);
  const sent: any[] = [];
  (t.env as any).AI = { run: async (_m: string, input: any) => { sent.push(input.messages); return { response: 'Üslü ifadelerde taban aynıysa üsler toplanır.\nÖNERİ: Bir örnek daha ver' }; } };
  (t.env as any).ENVIRONMENT = 'production';
  const ask = async (who: string, message: string) => (await t.request('/api/nibiru/chat', 'POST', { message }, who)).data;
  return { t, sent, ask };
}

describe('Nibiru kişisel veri göndermeyen mod', () => {
  it('answers own-data questions from verified data with actions, and never sends them to the model', async () => {
    const { sent, ask } = await setup();
    const exam = await ask('stuuser', 'netlerim nasıl');
    expect(exam.engine).toBe('LOCAL');
    expect(exam.answer).toContain('4,67 net');
    expect(exam.actions.map((a: any) => a.type)).toContain('PLAN');
    const weak = await ask('stuuser', 'matematikte en zayıf konum ne');
    expect(weak.answer).toContain('**Matematik**');
    expect(weak.answer).not.toContain('Türkçe');
    expect(weak.answer).toMatch(/%(50|100|0)\)/);
    const parent = await ask('parent', 'çocuğum nasıl gidiyor');
    expect(parent.answer).toMatch(/^Ali /);
    expect(sent).toHaveLength(0);
  });

  it('sends knowledge questions to Workers AI with only the persona, grade and cleaned conversation', async () => {
    const { sent, ask } = await setup();
    await ask('stuuser', 'netlerim nasıl');
    const r = await ask('stuuser', 'üslü ifadeleri anlatır mısın');
    expect(r.engine).toBe('LOCAL');
    expect(r.answer).toContain('üsler toplanır');
    expect(r.answer).not.toContain('ÖNERİ');
    expect(r.suggestions).toEqual(['Bir örnek daha ver']);
    await ask('stuuser', 'bir örnek daha ver');
    expect(sent).toHaveLength(2);
    const all = JSON.stringify(sent);
    expect(all).toContain('8. sınıf');
    expect(all).not.toMatch(/Ali|ALİ|4,67|333|GIZLI DENEME/);
    expect(sent[1].some((m: any) => m.role === 'assistant' && m.content.includes('üsler toplanır'))).toBe(true);
  });

  it('uses the right specialist: counsellor for a low mood, family guide for parents', async () => {
    const { sent, ask } = await setup();
    const mood = await ask('stuuser', 'canım sıkkın hiç ders çalışmak istemiyorum');
    expect(mood.actions.map((a: any) => a.type)).toContain('WRITE_COUNSELOR');
    expect(sent[0][0].content).toContain('Rehber öğretmen');
    await ask('parent', 'evde nasıl destek olabilirim');
    expect(sent[1][0].content).toContain('Veli akademik rehberisin');
    expect(sent[1][0].content).toContain('"siz"');
  });

  it('falls back to the rule-based answer when Workers AI is missing', async () => {
    const { t, ask } = await setup();
    delete (t.env as any).AI;
    const r = await ask('stuuser', 'üslü ifadeleri anlatır mısın');
    expect(r.answer).toBeTruthy();
    expect(r.engine).not.toBe('LOCAL');
  });
});
