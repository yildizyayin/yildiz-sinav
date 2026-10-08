import type {CapacityJobMessage,Env} from './types';
import {extractWhatsAppStatuses,verifyWhatsAppSignature,verifyWhatsAppWebhookToken,type WhatsAppDeliveryStatus} from './lib/whatsapp';

type WrappedApp={fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>;queue?(batch:MessageBatch<CapacityJobMessage>,env:Env,ctx:ExecutionContext):Promise<void>|void;scheduled?(event:ScheduledController,env:Env,ctx:ExecutionContext):Promise<void>|void};
const MAX_WHATSAPP_WEBHOOK_BYTES=1024*1024;
function providerTimestamp(value?:string){const seconds=Number(value||0);return Number.isFinite(seconds)&&seconds>0?new Date(seconds*1000).toISOString():new Date().toISOString()}
async function persistStatus(env:Env,event:WhatsAppDeliveryStatus){
 const occurredAt=providerTimestamp(event.timestamp),failureCode=event.status==='failed'?`META_${event.errorCode||'DELIVERY_FAILED'}`:null;
 await env.DB.prepare(`INSERT OR IGNORE INTO nibiru_whatsapp_status_events(provider_message_id,status,recipient_phone_e164,error_code,occurred_at) VALUES(?,?,?,?,?)`).bind(event.messageId,event.status.toUpperCase(),event.recipient||null,failureCode,occurredAt).run();
 if(event.status==='delivered'||event.status==='read')await env.DB.prepare(`UPDATE announcement_deliveries SET status='DELIVERED',delivered_at=COALESCE(delivered_at,?),failure_code=NULL WHERE provider_message_id=? AND channel='WHATSAPP' AND status<>'FAILED'`).bind(occurredAt,event.messageId).run();
 else if(event.status==='failed')await env.DB.prepare(`UPDATE announcement_deliveries SET status='FAILED',failure_code=?,attempted_at=COALESCE(attempted_at,?) WHERE provider_message_id=? AND channel='WHATSAPP'`).bind(failureCode,occurredAt,event.messageId).run();
}
export function createWhatsAppWebhookPolicyEntry(app:WrappedApp){return{
 async fetch(request:Request,env:Env,ctx:ExecutionContext){
  const url=new URL(request.url);if(url.pathname!=='/api/nibiru/whatsapp/webhook')return app.fetch(request,env,ctx);
  if(request.method==='GET'){
   const mode=url.searchParams.get('hub.mode'),token=url.searchParams.get('hub.verify_token'),challenge=url.searchParams.get('hub.challenge')||'';
   if(mode==='subscribe'&&env.WHATSAPP_VERIFY_TOKEN&&await verifyWhatsAppWebhookToken(env.WHATSAPP_VERIFY_TOKEN,token))return new Response(challenge,{status:200,headers:{'Content-Type':'text/plain'}});
   return new Response('Forbidden',{status:403});
  }
  if(request.method!=='POST')return new Response('Method Not Allowed',{status:405});
  const declared=Number(request.headers.get('content-length')||0);if(Number.isFinite(declared)&&declared>MAX_WHATSAPP_WEBHOOK_BYTES)return new Response('Payload Too Large',{status:413});
  const raw=await request.clone().arrayBuffer();if(raw.byteLength>MAX_WHATSAPP_WEBHOOK_BYTES)return new Response('Payload Too Large',{status:413});
  if(env.WHATSAPP_APP_SECRET){if(!await verifyWhatsAppSignature(env.WHATSAPP_APP_SECRET,raw,request.headers.get('X-Hub-Signature-256')))return new Response('Invalid signature',{status:401});}
  else if(env.ENVIRONMENT==='production')return new Response('WhatsApp app secret not configured',{status:503});
  let payload:any;try{payload=JSON.parse(new TextDecoder().decode(raw))}catch{return new Response('Bad Request',{status:400})}
  const statuses=extractWhatsAppStatuses(payload);if(statuses.length)ctx.waitUntil(Promise.all(statuses.map(status=>persistStatus(env,status))).then(()=>undefined));
  // Delegate message handling to the existing Nibiru route after this outer
  // security/status policy. request.clone() above keeps the original body intact.
  return app.fetch(request,env,ctx);
 },
 async queue(batch:MessageBatch<CapacityJobMessage>,env:Env,ctx:ExecutionContext){if(app.queue)return app.queue(batch,env,ctx);for(const message of batch.messages)message.retry({delaySeconds:30});},
 async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){if(app.scheduled)return app.scheduled(event,env,ctx);}
}}
