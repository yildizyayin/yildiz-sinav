import type { Env } from '../types';

export function normalizeWhatsAppPhone(value: string) {
  const digits = String(value || '').replace(/\D/g,'');
  return digits ? `+${digits}` : '';
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i=0;i<a.length;i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyWhatsAppSignature(secret: string, rawBody: ArrayBuffer, signatureHeader: string | null) {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = signatureHeader.slice(7).toLowerCase();
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature = await crypto.subtle.sign('HMAC',key,rawBody);
  return constantTimeEqual(bytesToHex(new Uint8Array(signature)),expected);
}

export function whatsappReady(env: Env) {
  return Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_VERIFY_TOKEN);
}

function graphUrl(env: Env) {
  const version = env.WHATSAPP_GRAPH_API_VERSION || 'v25.0';
  return `https://graph.facebook.com/${version}/${encodeURIComponent(env.WHATSAPP_PHONE_NUMBER_ID || '')}/messages`;
}

export async function sendWhatsAppText(env: Env, to: string, text: string) {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return { ok:false, reason:'NOT_CONFIGURED' as const };
  const response = await fetch(graphUrl(env),{
    method:'POST',
    headers:{'Authorization':`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,'Content-Type':'application/json'},
    body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:normalizeWhatsAppPhone(to).slice(1),type:'text',text:{preview_url:false,body:text.slice(0,3900)}}),
  });
  const payload:any = await response.json().catch(()=>null);
  if (!response.ok) return { ok:false, reason:'PROVIDER_ERROR' as const, status:response.status, payload };
  return { ok:true as const, messageId:payload?.messages?.[0]?.id || null };
}

export async function sendWhatsAppTemplate(env: Env, to: string, templateName: string, bodyParams: string[] = [], languageCode = 'tr') {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return { ok:false, reason:'NOT_CONFIGURED' as const };
  if (!templateName.trim()) return { ok:false, reason:'TEMPLATE_REQUIRED' as const };
  const components = bodyParams.length ? [{type:'body',parameters:bodyParams.map(text=>({type:'text',text:String(text).slice(0,1024)}))}] : undefined;
  const response = await fetch(graphUrl(env),{
    method:'POST',
    headers:{'Authorization':`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,'Content-Type':'application/json'},
    body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:normalizeWhatsAppPhone(to).slice(1),type:'template',template:{name:templateName.trim(),language:{code:languageCode},...(components?{components}:{})}}),
  });
  const payload:any = await response.json().catch(()=>null);
  if (!response.ok) return { ok:false, reason:'PROVIDER_ERROR' as const, status:response.status, payload };
  return { ok:true as const, messageId:payload?.messages?.[0]?.id || null };
}

export type WhatsAppInboundMessage = {
  from: string;
  id: string;
  timestamp?: string;
  type: string;
  text: string | null;
};

export function extractWhatsAppMessages(payload: any): WhatsAppInboundMessage[] {
  const out: WhatsAppInboundMessage[]=[];
  for(const entry of payload?.entry||[]) for(const change of entry?.changes||[]) {
    const messages=change?.value?.messages||[];
    for(const message of messages) out.push({
      from:normalizeWhatsAppPhone(message?.from||''),
      id:String(message?.id||''),
      timestamp:message?.timestamp ? String(message.timestamp) : undefined,
      type:String(message?.type||'unknown'),
      text:message?.type==='text' ? String(message?.text?.body||'').trim() : null,
    });
  }
  return out.filter(x=>x.from&&x.id);
}
