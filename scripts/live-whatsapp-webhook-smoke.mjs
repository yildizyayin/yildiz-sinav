import { createHmac } from 'node:crypto';

const base=(process.env.SMOKE_BASE_URL||'').replace(/\/$/,'');
const verifyToken=process.env.WHATSAPP_VERIFY_TOKEN||'';
const appSecret=process.env.WHATSAPP_APP_SECRET||'';
if(!base||!verifyToken||!appSecret)throw new Error('SMOKE_BASE_URL, WHATSAPP_VERIFY_TOKEN and WHATSAPP_APP_SECRET are required.');

const path='/api/nibiru/whatsapp/webhook';
const challenge=`nibiru-${Date.now()}`;
const verified=await fetch(`${base}${path}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=${encodeURIComponent(challenge)}`);
if(verified.status!==200||await verified.text()!==challenge)throw new Error(`Webhook verify failed: HTTP ${verified.status}`);
console.log('✓ Meta webhook callback verification');

const rejected=await fetch(`${base}${path}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(`${verifyToken}-wrong`)}&hub.challenge=x`);
if(rejected.status!==403)throw new Error(`Wrong verify token was not rejected: HTTP ${rejected.status}`);
console.log('✓ Wrong verify token rejection');

const payload=JSON.stringify({object:'whatsapp_business_account',entry:[]});
const signature=createHmac('sha256',appSecret).update(payload).digest('hex');
const accepted=await fetch(`${base}${path}`,{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':`sha256=${signature}`},body:payload});
if(accepted.status!==200||await accepted.text()!=='EVENT_RECEIVED')throw new Error(`Signed webhook failed: HTTP ${accepted.status}`);
console.log('✓ Signed Meta webhook acceptance');

const invalid=await fetch(`${base}${path}`,{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':'sha256=0000000000000000000000000000000000000000000000000000000000000000'},body:payload});
if(invalid.status!==401)throw new Error(`Invalid signature was not rejected: HTTP ${invalid.status}`);
console.log('✓ Invalid Meta signature rejection');

console.log('\n4 WhatsApp webhook live checks passed.');
