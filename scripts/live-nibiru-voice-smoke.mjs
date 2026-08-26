const BASE=(process.env.SMOKE_BASE_URL||'https://yildiz-sinav-v1.rtsgida.workers.dev').replace(/\/$/,'');
const PASSWORD=process.env.SMOKE_DEMO_PASSWORD||'Demo123!';const TOKEN='XXXX.DUMMY.TOKEN.XXXX';
function assert(v,m,d){if(!v)throw new Error(`${m}${d===undefined?'':`\n${JSON.stringify(d,null,2)}`}`)}
async function login(identifier){const r=await fetch(`${BASE}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier,password:PASSWORD,remember:false,turnstileToken:TOKEN}),redirect:'manual'});const p=await r.json();assert(r.ok&&p?.ok===true,`${identifier} login failed`,p);const cookie=(r.headers.get('set-cookie')||'').match(/(yildiz_session=[^;]+)/)?.[1];assert(cookie,'session cookie missing');return cookie}
async function jsonReq(path,{method='GET',cookie,body}={}){const r=await fetch(`${BASE}${path}`,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const text=await r.text();let p;try{p=text?JSON.parse(text):null}catch{p={raw:text}}if(!r.ok){const code=p?.error?.details?.activationCode;if(code)console.error(`✗ Nibiru Voice activation blocker — ${code}: ${p?.error?.details?.detail||''}`);throw new Error(`${method} ${path} → ${r.status}\n${JSON.stringify(p,null,2)}`)}return p}

try{
 const admin=await login('super');
 const status=await jsonReq('/api/nibiru/voice/status',{cookie:admin});
 assert(status?.providers?.stt?.ready===true,'Turkish STT is not ready',status);
 assert(status?.providers?.standardReady===true,'Standard TTS route is not configured',status);
 assert(Array.isArray(status?.plans?.standard?.providers)&&status.plans.standard.providers.length>0,'Standard voice provider plan is empty',status);
 console.log(`✓ Nibiru Voice route configured — STT ${status.providers.stt.model} · Standard ${status.plans.standard.providers.join(' → ')}`);

 const probe=await jsonReq('/api/nibiru/voice/probe?mode=standard',{method:'POST',cookie:admin});
 assert(probe?.ok===true&&probe?.activation?.liveVerified===true&&Number(probe?.bytes||0)>100,'Standard TTS live probe returned no audio',probe);
 console.log(`✓ Standard TTS live provider — ${probe.provider} · ${probe.model} · ${probe.bytes} bytes`);

 const speech=await fetch(`${BASE}/api/nibiru/voice/speak`,{method:'POST',headers:{cookie:admin,'content-type':'application/json'},body:JSON.stringify({text:'🤖 Nibiru: Bu bir Türkçe ses testidir. Bugün matematik çalışabiliriz.',mode:'STANDARD'})});
 if(!speech.ok)throw new Error(`voice speak failed ${speech.status}: ${await speech.text()}`);
 const audio=new Uint8Array(await speech.arrayBuffer());assert(audio.byteLength>100,'TTS audio body is empty');
 const provider=speech.headers.get('x-nibiru-voice-provider')||'unknown';
 const transcription=await fetch(`${BASE}/api/nibiru/voice/transcribe`,{method:'POST',headers:{cookie:admin,'content-type':speech.headers.get('content-type')||'audio/mpeg'},body:audio});
 const transcript=await transcription.json();assert(transcription.ok&&transcript?.ok===true&&String(transcript?.text||'').length>5,'TTS → STT round trip failed',transcript);
 const normalized=String(transcript.text).toLocaleLowerCase('tr-TR');assert(normalized.includes('matematik')||normalized.includes('ses')||normalized.includes('türkçe'),'Turkish round-trip transcript lost expected meaning',transcript);
 console.log(`✓ Nibiru Turkish voice round trip — ${provider} → Whisper · “${String(transcript.text).slice(0,100)}”`);
 console.log('\n3 Nibiru Voice live activation checks passed.');
}catch(error){console.error(error);process.exitCode=1}
