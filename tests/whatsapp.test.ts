import { describe,expect,it } from 'vitest';
import { extractWhatsAppMessages,normalizeWhatsAppPhone,verifyWhatsAppSignature,whatsappConfiguration } from '../worker/lib/whatsapp';

describe('WhatsApp integration helpers',()=>{
  it('normalizes Meta phone values to E.164',()=>{
    expect(normalizeWhatsAppPhone('90 555 123 45 67')).toBe('+905551234567');
    expect(normalizeWhatsAppPhone('+90 (555) 123-45-67')).toBe('+905551234567');
  });

  it('extracts inbound text messages and ignores empty provider records',()=>{
    const rows=extractWhatsAppMessages({entry:[{changes:[{value:{messages:[
      {from:'905551234567',id:'wamid.1',timestamp:'123',type:'text',text:{body:'  Öğrencim nasıl?  '}},
      {from:'',id:'wamid.2',type:'text',text:{body:'ignored'}},
    ]}}]}]});
    expect(rows).toEqual([{from:'+905551234567',id:'wamid.1',timestamp:'123',type:'text',text:'Öğrencim nasıl?'}]);
  });

  it('requires all four provider secrets for production readiness',()=>{
    const partial=whatsappConfiguration({ENVIRONMENT:'production',WHATSAPP_VERIFY_TOKEN:'v',WHATSAPP_ACCESS_TOKEN:'a',WHATSAPP_PHONE_NUMBER_ID:'p'} as any);
    expect(partial.ready).toBe(false);
    expect(partial.missing).toContain('WHATSAPP_APP_SECRET');
    const complete=whatsappConfiguration({ENVIRONMENT:'production',WHATSAPP_VERIFY_TOKEN:'v',WHATSAPP_APP_SECRET:'s',WHATSAPP_ACCESS_TOKEN:'a',WHATSAPP_PHONE_NUMBER_ID:'p'} as any);
    expect(complete.ready).toBe(true);
  });

  it('validates Meta X-Hub-Signature-256 using the raw request body',async()=>{
    const secret='app-secret';
    const body=new TextEncoder().encode('{"object":"whatsapp_business_account"}');
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signature=new Uint8Array(await crypto.subtle.sign('HMAC',key,body));
    const hex=[...signature].map(x=>x.toString(16).padStart(2,'0')).join('');
    expect(await verifyWhatsAppSignature(secret,body.buffer,`sha256=${hex}`)).toBe(true);
    expect(await verifyWhatsAppSignature(secret,body.buffer,'sha256=deadbeef')).toBe(false);
  });
});
