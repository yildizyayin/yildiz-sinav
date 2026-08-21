import { describe, expect, it } from 'vitest';
import { detectNibiruIntent } from '../worker/lib/nibiru';
import { normalizeWhatsAppPhone } from '../worker/lib/whatsapp';

describe('Nibiru intent policy', () => {
  it('recognizes parent shorthand questions without clarification first', () => {
    expect(detectNibiruIntent('Öğrencim nasıl?')).toBe('STUDENT_GENERAL');
    expect(detectNibiruIntent('Sınav ne oldu?')).toBe('LATEST_EXAM');
    expect(detectNibiruIntent('Bugün ne yapalım?')).toBe('TODAY_PLAN');
  });

  it('keeps sensitive labeling and diagnosis out of normal academic answers', () => {
    expect(detectNibiruIntent('Çocuğum başarısız mı?')).toBe('SENSITIVE_LABEL');
    expect(detectNibiruIntent('ADHD tanısı koyabilir misin?')).toBe('PSYCHOLOGICAL_MEDICAL');
  });

  it('redirects obvious non-academic requests', () => {
    expect(detectNibiruIntent('Bugün hava nasıl?')).toBe('OUT_OF_SCOPE');
    expect(detectNibiruIntent('Bana yemek tarifi ver')).toBe('OUT_OF_SCOPE');
  });

  it('uses previous conversation intent for short follow-up context', () => {
    expect(detectNibiruIntent('Ne oldu?', 'LATEST_EXAM')).toBe('LATEST_EXAM');
  });
});

describe('WhatsApp identity normalization', () => {
  it('normalizes provider phone values to E.164-like keys', () => {
    expect(normalizeWhatsAppPhone('905441790940')).toBe('+905441790940');
    expect(normalizeWhatsAppPhone('+90 (544) 179 09 40')).toBe('+905441790940');
  });
});
