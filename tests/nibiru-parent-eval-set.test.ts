import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/**
 * Nibiru veli deneme seti (owner, 24 Nov 2026: "kalite ölçülebilir olsun"): typical parent questions run through the
 * whole chat path, as in production (KVKK gate closed, Workers AI for knowledge). Every answer must be real Turkish
 * text without leaked placeholders, and the model must never receive the child's name, the exam or the nets.
 */
const QUESTIONS = [
  'merhaba', 'nasılsın', 'teşekkürler', 'sen kimsin', 'neler yapabilirsin',
  'çocuğum nasıl gidiyor', 'son sınav ne oldu', 'netleri nasıl', 'netleri düşmüş mü', 'hangi derste zorlanıyor',
  'en zayıf konusu ne', 'matematikte durumu nasıl', 'türkçede nasıl', 'gelişimi nasıl', 'bu hafta ne çalışmalı',
  'evde nasıl destek olabilirim', 'sınav kaygısı yaşıyor ne yapmalıyım', 'telefona çok bakıyor', 'geç yatıyor uykusunu alamıyor', 'ders çalışmak istemiyor',
  'motivasyonu düşük', 'üslü ifadeleri nasıl anlatabilirim', 'LGS ne zaman', 'kaç soru yanlış yaptı', 'ödevleri var mı',
  'öğretmeniyle nasıl görüşebilirim', 'arkadaşlarıyla sorun yaşıyor', 'saçma', 'tamam', 'görüşürüz',
];
const BAD = /\b(undefined|null|NaN)\b|\[object |Nibiru:\s*Nibiru:|\{\{|\}\}/;

describe('Nibiru veli deneme seti', () => {
  it('answers every typical parent question safely', async () => {
    const t = await evaluatedExam('direct', { outcomes: true });
    await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST');
    await t.request(`/api/platform/exam-center/${t.examId}/publish`, 'POST');
    t.db.exec(`UPDATE student_entities SET first_name='ALİ' WHERE id='s1'`);
    const sent: string[] = [];
    (t.env as any).AI = { run: async (_m: string, input: any) => { sent.push(JSON.stringify(input.messages)); return { response: 'Kısa ve sakin bir çalışma düzeni iyi gelir. Her gün aynı saatte 20 dakika yeterli.' }; } };
    (t.env as any).ENVIRONMENT = 'production';
    const failures: string[] = [];
    for (const q of QUESTIONS) {
      const r = await t.request('/api/nibiru/chat', 'POST', { message: q, studentId: 's1' }, 'parent');
      const a = String(r.data?.answer || '');
      if (r.response.status !== 200 || a.trim().length < 8 || BAD.test(a)) failures.push(`${q} → [${r.response.status}] ${a.slice(0, 120)}`);
    }
    expect(failures).toEqual([]);
    expect(sent.join('\n')).not.toMatch(/Ali|ALİ|4,67|4\.67|GIZLI DENEME/);
    const h = await t.request('/api/nibiru/history?studentId=s1', 'GET', undefined, 'parent');
    expect(h.data.messages).toHaveLength(QUESTIONS.length * 2);
  }, 120_000);
});
