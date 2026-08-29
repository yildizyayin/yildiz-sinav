import type { Env } from '../types';
import { minimizeWhatsAppOutboundText } from './privacy-minimization';

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

export function whatsappConfiguration(env: Env) {
  const required = [
    ['WHATSAPP_VERIFY_TOKEN',Boolean(env.WHATSAPP_VERIFY_TOKEN)],
    ['WHATSAPP_APP_SECRET',Boolean(env.WHATSAPP_APP_SECRET)],
    ['WHATSAPP_ACCESS_TOKEN',Boolean(env.WHATSAPP_ACCESS_TOKEN)],
    ['WHATSAPP_PHONE_NUMBER_ID',Boolean(env.WHATSAPP_PHONE_NUMBER_ID)],
  ] as const;
  const missing = required.filter(([,ready])=>!ready).map(([name])=>name);
  return {
    ready: missing.length===0,
    missing,
    verifyToken:Boolean(env.WHATSAPP_VERIFY_TOKEN),
    appSecret:Boolean(env.WHATSAPP_APP_SECRET),
    accessToken:Boolean(env.WHATSAPP_ACCESS_TOKEN),
    phoneNumberId:Boolean(env.WHATSAPP_PHONE_NUMBER_ID),
    graphVersion:env.WHATSAPP_GRAPH_API_VERSION||'v25.0',
    environment:env.ENVIRONMENT||'unknown',
  };
}

export function whatsappReady(env: Env) {
  return whatsappConfiguration(env).ready;
}

function graphBase(env: Env) {
  const version = env.WHATSAPP_GRAPH_API_VERSION || 'v25.0';
  return `https://graph.facebook.com/${version}`;
}

function graphUrl(env: Env) {
  return `${graphBase(env)}/${encodeURIComponent(env.WHATSAPP_PHONE_NUMBER_ID || '')}/messages`;
}

export async function probeWhatsAppProvider(env: Env) {
  const config = whatsappConfiguration(env);
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return {ok:false as const,reason:'NOT_CONFIGURED' as const,config};
  const fields='display_phone_number,verified_name,quality_rating,code_verification_status,platform_type';
  const url=`${graphBase(env)}/${encodeURIComponent(env.WHATSAPP_PHONE_NUMBER_ID)}?fields=${encodeURIComponent(fields)}`;
  const response=await fetch(url,{headers:{Authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`}});
  const payload:any=await response.json().catch(()=>null);
  if(!response.ok)return {ok:false as const,reason:'PROVIDER_ERROR' as const,status:response.status,payload,config};
  return {ok:true as const,config,phone:{id:String(payload?.id||env.WHATSAPP_PHONE_NUMBER_ID),displayPhoneNumber:payload?.display_phone_number||null,verifiedName:payload?.verified_name||null,qualityRating:payload?.quality_rating||null,codeVerificationStatus:payload?.code_verification_status||null,platformType:payload?.platform_type||null}};
}

export async function sendWhatsAppText(env: Env, to: string, text: string) {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return { ok:false, reason:'NOT_CONFIGURED' as const };
  const minimized=minimizeWhatsAppOutboundText(text);
  const response = await fetch(graphUrl(env),{
    method:'POST',
    headers:{'Authorization':`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,'Content-Type':'application/json'},
    body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:normalizeWhatsAppPhone(to).slice(1),type:'text',text:{preview_url:false,body:minimized.text.slice(0,3900)}}),
  });
  const payload:any = await response.json().catch(()=>null);
  if (!response.ok) return { ok:false, reason:'PROVIDER_ERROR' as const, status:response.status, payload };
  return { ok:true as const, messageId:payload?.messages?.[0]?.id || null, privacyMinimized:minimized.minimized };
}

export async function sendWhatsAppTemplate(env: Env, to: string, templateName: string, bodyParams: string[] = [], languageCode = 'tr') {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return { ok:false, reason:'NOT_CONFIGURED' as const };
  if (!templateName.trim()) return { ok:false, reason:'TEMPLATE_REQUIRED' as const };
  const minimizedParams=bodyParams.map(value=>minimizeWhatsAppOutboundText(String(value)));
  const components = minimizedParams.length ? [{type:'body',parameters:minimizedParams.map(value=>({type:'text',text:value.text.slice(0,1024)}))}] : undefined;
  const response = await fetch(graphUrl(env),{
    method:'POST',
    headers:{'Authorization':`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,'Content-Type':'application/json'},
    body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:normalizeWhatsAppPhone(to).slice(1),type:'template',template:{name:templateName.trim(),language:{code:languageCode},...(components?{components}:{})}}),
  });
  const payload:any = await response.json().catch(()=>null);
  if (!response.ok) return { ok:false, reason:'PROVIDER_ERROR' as const, status:response.status, payload };
  return { ok:true as const, messageId:payload?.messages?.[0]?.id || null, privacyMinimized:minimizedParams.some(x=>x.minimized) };
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
