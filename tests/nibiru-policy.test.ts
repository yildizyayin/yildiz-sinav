import { describe, expect, it } from 'vitest';
import { detectNibiruIntent } from '../worker/lib/nibiru';
import { extractWhatsAppStatuses, normalizeWhatsAppPhone, verifyWhatsAppSignature, verifyWhatsAppWebhookToken, whatsappReady } from '../worker/lib/whatsapp';
import type { Env } from '../worker/types';

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

  it('requires all four Meta secrets before activation is ready', () => {
    const partial={WHATSAPP_VERIFY_TOKEN:'verify',WHATSAPP_ACCESS_TOKEN:'access',WHATSAPP_PHONE_NUMBER_ID:'phone'} as Env;
    expect(whatsappReady(partial)).toBe(false);
    expect(whatsappReady({...partial,WHATSAPP_APP_SECRET:'secret'})).toBe(true);
  });

  it('verifies the callback token and signed webhook payload', async () => {
    expect(await verifyWhatsAppWebhookToken('verify-123','verify-123')).toBe(true);
    expect(await verifyWhatsAppWebhookToken('verify-123','verify-124')).toBe(false);
    const body=new TextEncoder().encode('{"object":"whatsapp_business_account"}');
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('app-secret'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signed=await crypto.subtle.sign('HMAC',key,body);
    const hex=[...new Uint8Array(signed)].map(x=>x.toString(16).padStart(2,'0')).join('');
    expect(await verifyWhatsAppSignature('app-secret',body.buffer,`sha256=${hex}`)).toBe(true);
    expect(await verifyWhatsAppSignature('wrong-secret',body.buffer,`sha256=${hex}`)).toBe(false);
    expect(await verifyWhatsAppSignature('app-secret',body.buffer,'sha256=not-hex')).toBe(false);
  });

  it('extracts Meta delivery and failure status events without message content', () => {
    const statuses=extractWhatsAppStatuses({entry:[{changes:[{value:{statuses:[
      {id:'wamid.sent',recipient_id:'905441790940',status:'delivered',timestamp:'1787800000'},
      {id:'wamid.failed',recipient_id:'905441790940',status:'failed',timestamp:'1787800010',errors:[{code:131026}]},
    ]}}]}]});
    expect(statuses).toEqual([
      {messageId:'wamid.sent',recipient:'+905441790940',status:'delivered',timestamp:'1787800000',errorCode:null},
      {messageId:'wamid.failed',recipient:'+905441790940',status:'failed',timestamp:'1787800010',errorCode:'131026'},
    ]);
  });
});
