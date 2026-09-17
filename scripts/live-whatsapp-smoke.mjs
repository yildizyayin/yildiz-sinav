const base=(process.env.SMOKE_BASE_URL||'').replace(/\/$/,'');
const verifyToken=process.env.WHATSAPP_VERIFY_TOKEN||'';
if(!base)throw new Error('SMOKE_BASE_URL is required');

async function expectStatus(url,status){
  const response=await fetch(url,{redirect:'manual'});
  const body=await response.text();
  if(response.status!==status)throw new Error(`Expected ${status}, got ${response.status}: ${body.slice(0,300)}`);
  return body;
}

const endpoint=`${base}/api/nibiru/whatsapp/webhook`;
const invalid=new URL(endpoint);
invalid.searchParams.set('hub.mode','subscribe');
invalid.searchParams.set('hub.verify_token','__anunex_invalid__');
invalid.searchParams.set('hub.challenge','invalid-probe');
await expectStatus(invalid.toString(),403);
console.log('✓ WhatsApp webhook rejects an invalid verify token');

if(!verifyToken){
  console.log('↷ WHATSAPP_VERIFY_TOKEN not configured; valid-token webhook handshake skipped');
  process.exit(0);
}

const challenge=`anunex-${Date.now()}`;
const valid=new URL(endpoint);
valid.searchParams.set('hub.mode','subscribe');
valid.searchParams.set('hub.verify_token',verifyToken);
valid.searchParams.set('hub.challenge',challenge);
const body=await expectStatus(valid.toString(),200);
if(body!==challenge)throw new Error(`Webhook challenge mismatch: expected ${challenge}, got ${body}`);
console.log('✓ WhatsApp webhook Meta verification handshake succeeded');
