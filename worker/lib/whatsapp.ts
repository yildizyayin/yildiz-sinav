import type { Env } from '../types';

export function normalizeWhatsAppPhone(value: string) {
  const digits = String(value || '').replace(/\D/g,'');
  return digits ? `+${digits}` : '';
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
}

function hexToFixedBytes(value: string, size: number) {
  const normalized=String(value||'').toLowerCase();
  const valid=normalized.length===size*2&&/^[0-9a-f]+$/.test(normalized);
  const bytes=new Uint8Array(size);
  if(valid)for(let i=0;i<size;i++)bytes[i]=Number.parseInt(normalized.slice(i*2,i*2+2),16);
  return {bytes,valid};
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  const size=Math.max(a.length,b.length);
  let diff = 0;
  for (let i=0;i<size;i++) diff |= (a[i]||0) ^ (b[i]||0);
  return diff === 0 && a.length === b.length;
}

async function sha256(value:string){
  return new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
}

export async function verifyWhatsAppWebhookToken(expected:string,provided:string|null){
  const [expectedHash,providedHash]=await Promise.all([sha256(expected),sha256(provided||'')]);
  return Boolean(expected)&&Boolean(provided)&&constantTimeEqual(expectedHash,providedHash);
}

export async function verifyWhatsAppSignature(secret: string, rawBody: ArrayBuffer, signatureHeader: string | null) {
  const supplied=hexToFixedBytes(signatureHeader?.startsWith('sha256=')?signatureHeader.slice(7):'',32);
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature = await crypto.subtle.sign('HMAC',key,rawBody);
  const expected=hexToFixedBytes(bytesToHex(new Uint8Array(signature)),32);
  return supplied.valid&&constantTimeEqual(expected.bytes,supplied.bytes);
}

export function whatsappReady(env: Env) {
  return Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_VERIFY_TOKEN && env.WHATSAPP_APP_SECRET);
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

export type WhatsAppDeliveryStatus = {
  messageId: string;
  recipient: string;
  status: 'sent'|'delivered'|'read'|'failed'|'unknown';
  timestamp?: string;
  errorCode: string | null;
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

export function extractWhatsAppStatuses(payload:any):WhatsAppDeliveryStatus[]{
  const out:WhatsAppDeliveryStatus[]=[];
  for(const entry of payload?.entry||[])for(const change of entry?.changes||[])for(const item of change?.value?.statuses||[]){
    const raw=String(item?.status||'').toLowerCase();
    const status:WhatsAppDeliveryStatus['status']=['sent','delivered','read','failed'].includes(raw)?raw as WhatsAppDeliveryStatus['status']:'unknown';
    out.push({
      messageId:String(item?.id||''),
      recipient:normalizeWhatsAppPhone(item?.recipient_id||''),
      status,
      timestamp:item?.timestamp?String(item.timestamp):undefined,
      errorCode:item?.errors?.[0]?.code!=null?String(item.errors[0].code):null,
    });
  }
  return out.filter(x=>x.messageId);
}
