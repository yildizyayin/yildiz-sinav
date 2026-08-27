import { describe,expect,it } from 'vitest';
import { whatsappWebhook } from '../worker/nibiru-license-entry';
import type { Env } from '../worker/types';

const ctx={waitUntil(_promise:Promise<unknown>){}} as ExecutionContext;

async function signature(secret:string,body:string){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const value=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body));
  return `sha256=${[...new Uint8Array(value)].map(x=>x.toString(16).padStart(2,'0')).join('')}`;
}

describe('Nibiru Meta WhatsApp webhook',()=>{
  it('returns the challenge only for the correct verify token',async()=>{
    const env={WHATSAPP_VERIFY_TOKEN:'verify-me'} as Env;
    const ok=await whatsappWebhook(new Request('https://example.test/api/nibiru/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=abc123'),env,ctx);
    expect(ok.status).toBe(200);expect(await ok.text()).toBe('abc123');
    const denied=await whatsappWebhook(new Request('https://example.test/api/nibiru/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123'),env,ctx);
    expect(denied.status).toBe(403);
  });

  it('accepts a valid signed event and rejects an invalid signature',async()=>{
    const body=JSON.stringify({object:'whatsapp_business_account',entry:[]});
    const env={ENVIRONMENT:'production',WHATSAPP_APP_SECRET:'app-secret'} as Env;
    const ok=await whatsappWebhook(new Request('https://example.test/api/nibiru/whatsapp/webhook',{method:'POST',headers:{'x-hub-signature-256':await signature('app-secret',body)},body}),env,ctx);
    expect(ok.status).toBe(200);expect(await ok.text()).toBe('EVENT_RECEIVED');
    const denied=await whatsappWebhook(new Request('https://example.test/api/nibiru/whatsapp/webhook',{method:'POST',headers:{'x-hub-signature-256':await signature('wrong-secret',body)},body}),env,ctx);
    expect(denied.status).toBe(401);
  });

  it('rejects oversized bodies before reading them',async()=>{
    const env={ENVIRONMENT:'production',WHATSAPP_APP_SECRET:'app-secret'} as Env;
    const response=await whatsappWebhook(new Request('https://example.test/api/nibiru/whatsapp/webhook',{method:'POST',headers:{'content-length':String(1024*1024+1)},body:'{}'}),env,ctx);
    expect(response.status).toBe(413);
  });
});
