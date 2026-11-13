import type { Env } from '../types';

export type NibiruVoiceMode='STANDARD'|'PREMIUM';
export type NibiruVoiceProvider='GOOGLE_WAVENET'|'OPENAI_GPT4O_MINI_TTS'|'OPENAI_UNIFIED_TTS'|'OPENAI_UNIFIED_TTS_HD';
export type VoiceProviderPlan={mode:NibiruVoiceMode;providers:NibiruVoiceProvider[];reason:string};
type VoiceHealthProvider=NibiruVoiceProvider|'CLOUDFLARE_WORKERS_AI_STT';
export type VoiceAudio={bytes:Uint8Array;contentType:string;provider:NibiruVoiceProvider;model:string};

let googleTokenCache:{token:string;expiresAt:number}|null=null;

function base64Url(data:string|ArrayBuffer){
 const bytes=typeof data==='string'?new TextEncoder().encode(data):new Uint8Array(data);
 let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+0x8000)));
 return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function base64FromBytes(bytes:Uint8Array){let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+0x8000)));return btoa(binary)}
function bytesFromBase64(value:string){const binary=atob(value);const out=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out}
function strictArrayBuffer(bytes:Uint8Array):ArrayBuffer{const copy=new Uint8Array(bytes.byteLength);copy.set(bytes);return copy.buffer}
function pemToArrayBuffer(pem:string):ArrayBuffer{const clean=pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');return strictArrayBuffer(bytesFromBase64(clean))}

export function prepareNibiruSpeechText(value:string){
 return String(value||'')
  .replace(/^\s*(?:\u{1F916}\s*)?Nibiru\s*:\s*/iu,'')
  .replace(/```[\s\S]*?```/g,' ')
  // 13 Nov 2026 (owner: "ses çok kötü"): written marks are turned into what a listener expects
  .replace(/\[([^\]]+)\]\((?:https?:)?[^)]*\)/g,'$1')
  .replace(/^\s*(?:[-•–]|\d+[.)])\s+/gm,'')
  .replace(/%\s?(\d+(?:[.,]\d+)?)/g,'yüzde $1')
  .replace(/\s*·\s*/g,', ')
  .replace(/\s*[—–]\s*/g,', ')
  .replace(/([^.!?:;,\s])[ \t]*\n+/g,'$1.\n')
  .replace(/\p{Extended_Pictographic}\uFE0F?/gu,'')
  .replace(/[*_#>`~]/g,'')
  .replace(/https?:\/\/\S+/g,'bağlantı')
  .replace(/[📋🎯✅○🔊🎙️]/g,'')
  .replace(/\s+/g,' ')
  .trim()
  .slice(0,3600);
}

/**
 * Free Google voice (owner, 13 Nov 2026: "daha önce doğal bir ses vardı … onayladım"): with NIBIRU_GOOGLE_FREE_VOICE=ON
 * only Google WaveNet is used — no paid provider — and the whole platform stays under a monthly character ceiling below
 * Google's free WaveNet allowance (4 million characters a month). At the ceiling Nibiru uses the device voice until
 * the next month, so no charge can arise.
 */
export const GOOGLE_FREE_MONTHLY_CHARS=3_500_000;
export function googleFreeVoice(env:Env){return env.NIBIRU_GOOGLE_FREE_VOICE==='ON'&&Boolean(env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON)}
const freeVoiceName=(env:Env)=>/wavenet|standard/i.test(String(env.NIBIRU_GOOGLE_TTS_VOICE||''))?String(env.NIBIRU_GOOGLE_TTS_VOICE):'tr-TR-Wavenet-E';
const freeCap=(env:Env)=>{const n=Number(env.NIBIRU_GOOGLE_FREE_MONTHLY_CHARS);return Number.isFinite(n)&&n>0?Math.min(n,GOOGLE_FREE_MONTHLY_CHARS):GOOGLE_FREE_MONTHLY_CHARS};
const thisMonth=()=>new Date().toISOString().slice(0,7);
/** Reserves characters of this month's free allowance; false when the ceiling would be passed. */
export async function reserveGoogleFreeChars(env:Env,chars:number){
 const cap=freeCap(env);if(chars>cap)return false;
 const row=await env.DB.prepare(`INSERT INTO nibiru_voice_monthly_chars(month,chars) VALUES(?,?) ON CONFLICT(month) DO UPDATE SET chars=chars+excluded.chars,updated_at=CURRENT_TIMESTAMP WHERE nibiru_voice_monthly_chars.chars+excluded.chars<=? RETURNING chars`).bind(thisMonth(),chars,cap).first<{chars:number}>();
 return Boolean(row);
}
export async function googleFreeUsage(env:Env){
 const row=await env.DB.prepare(`SELECT chars FROM nibiru_voice_monthly_chars WHERE month=?`).bind(thisMonth()).first<{chars:number}>().catch(()=>null);
 return{month:thisMonth(),chars:Number(row?.chars||0),cap:freeCap(env)};
}

export function voiceProviderStatus(env:Env){
 const googleConfigured=Boolean(env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON);
 const directOpenAi=Boolean(env.OPENAI_TTS_API_KEY);
 const unified=Boolean(env.AI);
 const paidProvidersAllowed=env.NIBIRU_PAID_VOICE_ENABLED==='ON';
 return {
  stt:{ready:false,liveVerified:false,configured:Boolean(env.AI),provider:'CLOUDFLARE_WORKERS_AI',model:env.NIBIRU_STT_MODEL||'@cf/openai/whisper-large-v3-turbo',detail:env.AI?'Workers AI binding var; canlı probe gerekli.':'Workers AI binding eksik.'},
  google:{ready:false,configured:googleConfigured,provider:'GOOGLE_WAVENET',voice:env.NIBIRU_GOOGLE_TTS_VOICE||'tr-TR-Wavenet-E',detail:googleConfigured?'Google Cloud servis hesabı tanımlı; canlı probe gerekli.':'GOOGLE_TTS_SERVICE_ACCOUNT_JSON secret bekleniyor.'},
  openaiDirect:{ready:false,configured:directOpenAi,provider:'OPENAI_GPT4O_MINI_TTS',model:env.NIBIRU_OPENAI_DIRECT_TTS_MODEL||'gpt-4o-mini-tts',detail:directOpenAi?'OpenAI TTS secret tanımlı; canlı probe gerekli.':'OPENAI_TTS_API_KEY opsiyonel; Unified Billing fallback kullanılabilir.'},
  openaiUnified:{ready:false,configured:unified,provider:'CLOUDFLARE_AI_GATEWAY_UNIFIED',standardModel:env.NIBIRU_OPENAI_TTS_MODEL||'openai/tts-1',premiumModel:env.NIBIRU_OPENAI_TTS_HD_MODEL||'openai/tts-1-hd',detail:unified?'Workers AI binding var; Unified Billing canlı probe gerekli.':'Workers AI binding eksik.'},
  paidProvidersAllowed,
  standardConfigured:paidProvidersAllowed&&(googleConfigured||unified||directOpenAi),
  premiumConfigured:paidProvidersAllowed&&(directOpenAi||unified||googleConfigured),
  standardReady:false,
  premiumReady:false,
  liveVerified:false,
 };
}

export function buildVoiceProviderPlan(env:Env,mode:NibiruVoiceMode):VoiceProviderPlan{
 const s=voiceProviderStatus(env);
 const rows:NibiruVoiceProvider[]=[];
 if(!s.paidProvidersAllowed&&googleFreeVoice(env))return{mode,providers:['GOOGLE_WAVENET'],reason:'Ücretsiz Google WaveNet sesi; aylık ücretsiz kotanın altında kalınır, dolunca cihaz sesi kullanılır.'};
 if(!s.paidProvidersAllowed)return{mode,providers:rows,reason:'Ücretli Türkçe ses sağlayıcıları kapalı. NIBIRU_PAID_VOICE_ENABLED=ON ile açıkça etkinleştirilmelidir.'};
 if(mode==='PREMIUM'){
  if(s.openaiDirect.configured)rows.push('OPENAI_GPT4O_MINI_TTS');
  if(s.openaiUnified.configured)rows.push('OPENAI_UNIFIED_TTS_HD');
  if(s.google.configured)rows.push('GOOGLE_WAVENET');
  return{mode,providers:rows,reason:'Premium seste doğal ifade öncelikli; sağlayıcı yoksa kurumsal WaveNet yedeği kullanılır.'};
 }
 if(s.google.configured)rows.push('GOOGLE_WAVENET');
 if(s.openaiUnified.configured)rows.push('OPENAI_UNIFIED_TTS');
 if(s.openaiDirect.configured)rows.push('OPENAI_GPT4O_MINI_TTS');
 return{mode,providers:rows,reason:'Standart seste düşük maliyetli Türkçe WaveNet öncelikli; Unified Billing kesintisiz yedektir.'};
}

export async function transcribeNibiruAudio(env:Env,bytes:Uint8Array){
 if(!env.AI)throw new Error('VOICE_STT_NOT_CONFIGURED');
 if(!bytes.length)throw new Error('VOICE_AUDIO_EMPTY');
 if(bytes.length>8*1024*1024)throw new Error('VOICE_AUDIO_TOO_LARGE');
 const model=env.NIBIRU_STT_MODEL||'@cf/openai/whisper-large-v3-turbo';
 const response:any=await env.AI.run(model as any,{
  audio:base64FromBytes(bytes),task:'transcribe',language:'tr',vad_filter:true,
  initial_prompt:'Türkçe eğitim konuşması. Ders, kazanım, matematik, fen, Türkçe, LGS ve YKS terimlerini doğru yaz.',
 } as any,['off','none','disabled','direct'].includes(String(env.NIBIRU_AI_GATEWAY_ID||'default').toLowerCase())?undefined:{gateway:{id:env.NIBIRU_AI_GATEWAY_ID||'default',skipCache:true,collectLog:true,metadata:{app:'nibiru',modality:'stt',language:'tr'}}} as any);
 const text=String(response?.text||response?.transcription_info?.text||'').trim();
 if(!text)throw new Error('VOICE_TRANSCRIPTION_EMPTY');
 return{text,model};
}

async function googleAccessToken(env:Env){
 if(googleTokenCache&&googleTokenCache.expiresAt>Date.now()+60_000)return googleTokenCache.token;
 if(!env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON)throw new Error('GOOGLE_TTS_NOT_CONFIGURED');
 let account:any;try{account=JSON.parse(env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON)}catch{throw new Error('GOOGLE_TTS_CREDENTIAL_INVALID')}
 if(!account.client_email||!account.private_key)throw new Error('GOOGLE_TTS_CREDENTIAL_INVALID');
 const now=Math.floor(Date.now()/1000),header=base64Url(JSON.stringify({alg:'RS256',typ:'JWT'})),claims=base64Url(JSON.stringify({iss:account.client_email,scope:'https://www.googleapis.com/auth/cloud-platform',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3500}));
 const signingInput=`${header}.${claims}`;
 const key=await crypto.subtle.importKey('pkcs8',pemToArrayBuffer(String(account.private_key).replace(/\\n/g,'\n')),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(signingInput));
 const assertion=`${signingInput}.${base64Url(signature)}`;
 const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
 if(!tokenResponse.ok)throw new Error('GOOGLE_TTS_AUTH_FAILED');
 const payload:any=await tokenResponse.json();if(!payload.access_token)throw new Error('GOOGLE_TTS_AUTH_FAILED');
 googleTokenCache={token:payload.access_token,expiresAt:Date.now()+Math.max(300,Number(payload.expires_in||3600)-120)*1000};return googleTokenCache.token;
}

async function googleSpeak(env:Env,text:string,speed:number,voiceName?:string):Promise<VoiceAudio>{
 const raw=env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON;if(!raw)throw new Error('GOOGLE_TTS_NOT_CONFIGURED');let account:any;try{account=JSON.parse(raw)}catch{throw new Error('GOOGLE_TTS_CREDENTIAL_INVALID')}
 const token=await googleAccessToken(env);const voice=voiceName||env.NIBIRU_GOOGLE_TTS_VOICE||'tr-TR-Wavenet-E';
 const response=await fetch('https://texttospeech.googleapis.com/v1/text:synthesize',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','x-goog-user-project':String(account.project_id||'')},body:JSON.stringify({input:{text},voice:{languageCode:'tr-TR',name:voice},audioConfig:{audioEncoding:'MP3',speakingRate:speed,pitch:0}})});
 if(!response.ok)throw new Error(`GOOGLE_TTS_FAILED_${response.status}`);const payload:any=await response.json();if(!payload.audioContent)throw new Error('GOOGLE_TTS_EMPTY');
 return{bytes:bytesFromBase64(payload.audioContent),contentType:'audio/mpeg',provider:'GOOGLE_WAVENET',model:voice};
}

async function directOpenAiSpeak(env:Env,text:string,speed:number):Promise<VoiceAudio>{
 if(!env.OPENAI_TTS_API_KEY)throw new Error('OPENAI_TTS_NOT_CONFIGURED');const model=env.NIBIRU_OPENAI_DIRECT_TTS_MODEL||'gpt-4o-mini-tts';const voice=env.NIBIRU_OPENAI_TTS_VOICE||'coral';
 const response=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{authorization:`Bearer ${env.OPENAI_TTS_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model,voice,input:text,response_format:'mp3',speed,instructions:'Doğal İstanbul Türkçesiyle konuş. Sesin sıcak, güven veren, sakin ve zeki bir kadın rehber öğretmen gibi olsun. Cümleleri anlamına göre yumuşak duraklarla oku; isimlere nazikçe hitap et. Robotik ritimden, yapay coşkudan, reklam sesinden, yargılayıcı veya çocuklaştıran tondan kesinlikle kaçın. Olumsuz sonuçları gelişim odaklı ve MEB okul iletişimine uygun bir dille anlat.'})});
 if(!response.ok)throw new Error(`OPENAI_TTS_FAILED_${response.status}`);return{bytes:new Uint8Array(await response.arrayBuffer()),contentType:response.headers.get('content-type')||'audio/mpeg',provider:'OPENAI_GPT4O_MINI_TTS',model};
}

async function unifiedOpenAiSpeak(env:Env,text:string,speed:number,hd:boolean):Promise<VoiceAudio>{
 if(!env.AI)throw new Error('OPENAI_UNIFIED_NOT_CONFIGURED');const model=hd?(env.NIBIRU_OPENAI_TTS_HD_MODEL||'openai/tts-1-hd'):(env.NIBIRU_OPENAI_TTS_MODEL||'openai/tts-1');const voice=env.NIBIRU_OPENAI_TTS_VOICE||'coral';
 try{
  const response:any=await env.AI.run(model as any,{response_format:'mp3',speed,text,voice} as any,{gateway:{id:env.NIBIRU_AI_GATEWAY_ID||'default',skipCache:true,collectLog:true,metadata:{app:'nibiru',modality:'tts',language:'tr',quality:hd?'premium':'standard'}}} as any);
  if(response instanceof Response){
   const contentType=response.headers.get('content-type')||'';
   const bytes=new Uint8Array(await response.arrayBuffer());
   if(!response.ok||!contentType.toLowerCase().startsWith('audio/')||bytes.length<=100)throw new Error('OPENAI_UNIFIED_TTS_NOT_AUDIO');
   return{bytes,contentType,provider:hd?'OPENAI_UNIFIED_TTS_HD':'OPENAI_UNIFIED_TTS',model};
  }
  const audioUrl=String(response?.audio||response?.result?.audio||'');if(!audioUrl)throw new Error('OPENAI_UNIFIED_TTS_EMPTY');const audio=await fetch(audioUrl);if(!audio.ok)throw new Error('OPENAI_UNIFIED_TTS_FETCH_FAILED');
  return{bytes:new Uint8Array(await audio.arrayBuffer()),contentType:audio.headers.get('content-type')||'audio/mpeg',provider:hd?'OPENAI_UNIFIED_TTS_HD':'OPENAI_UNIFIED_TTS',model};
 }catch(primaryError){
  // Never disguise another model as OpenAI or silently read Turkish in English.
  throw new Error(`OPENAI_UNIFIED_TTS_FAILED:${primaryError instanceof Error?primaryError.message:'PRIMARY_TTS_FAILED'}`);
 }
}

export async function speakNibiru(env:Env,value:string,mode:NibiruVoiceMode='STANDARD'){
 const free=env.NIBIRU_PAID_VOICE_ENABLED!=='ON'&&googleFreeVoice(env);
 if(env.NIBIRU_PAID_VOICE_ENABLED!=='ON'&&!free)throw new Error('VOICE_PAID_PROVIDERS_DISABLED');
 const text=prepareNibiruSpeechText(value);if(!text)throw new Error('VOICE_TEXT_EMPTY');const speed=mode==='PREMIUM'?0.93:0.96,plan=buildVoiceProviderPlan(env,mode);const attempts:string[]=[];
 for(const provider of plan.providers){try{
  let audio:VoiceAudio;
  if(provider==='GOOGLE_WAVENET'&&free){if(!await reserveGoogleFreeChars(env,text.length))throw new Error('GOOGLE_FREE_MONTHLY_LIMIT');audio=await googleSpeak(env,text,speed,freeVoiceName(env));}
  else if(provider==='GOOGLE_WAVENET')audio=await googleSpeak(env,text,speed);
  else if(provider==='OPENAI_GPT4O_MINI_TTS')audio=await directOpenAiSpeak(env,text,speed);
  else audio=await unifiedOpenAiSpeak(env,text,speed,provider==='OPENAI_UNIFIED_TTS_HD');
  if(!audio.contentType.toLowerCase().startsWith('audio/')||audio.bytes.length<=100)throw new Error('VOICE_PROVIDER_NOT_AUDIO');
  const prefix=new TextDecoder().decode(audio.bytes.subarray(0,64)).trimStart();
  if(prefix.startsWith('{')||prefix.startsWith('['))throw new Error('VOICE_PROVIDER_NOT_AUDIO');
  return{audio,plan,attempts};
 }catch(error){attempts.push(`${provider}:${error instanceof Error?error.message:'FAILED'}`)}}
 throw new Error(attempts.length?`VOICE_PROVIDER_FAILED:${attempts.join('|')}`:'VOICE_NOT_CONFIGURED');
}


type VoiceHealthRow={provider:string;mode:NibiruVoiceMode;model:string;last_success_at:string};

function recentlyVerified(rows:VoiceHealthRow[],provider:VoiceHealthProvider,configured:boolean){
 if(!configured)return false;
 const cutoff=Date.now()-24*60*60*1000;
 return rows.some(row=>row.provider===provider&&Date.parse(row.last_success_at)>=cutoff);
}

export async function voiceProviderStatusWithHealth(env:Env){
 const base=voiceProviderStatus(env);
 let rows:VoiceHealthRow[]=[];
 try{
  const result=await env.DB.prepare('SELECT provider,mode,model,last_success_at FROM nibiru_voice_provider_health').all<VoiceHealthRow>();
  rows=result.results||[];
 }catch{
  // A deployment that has not applied the health migration still reports safe configuration state.
 }
 const sttLive=recentlyVerified(rows.filter(row=>row.model===base.stt.model),'CLOUDFLARE_WORKERS_AI_STT',base.stt.configured);
 const googleLive=recentlyVerified(rows.filter(row=>row.model===base.google.voice),'GOOGLE_WAVENET',base.google.configured);
 const directLive=recentlyVerified(rows.filter(row=>row.model===base.openaiDirect.model),'OPENAI_GPT4O_MINI_TTS',base.openaiDirect.configured);
 const unifiedLive=recentlyVerified(rows.filter(row=>row.model===base.openaiUnified.standardModel),'OPENAI_UNIFIED_TTS',base.openaiUnified.configured);
 const unifiedHdLive=recentlyVerified(rows.filter(row=>row.model===base.openaiUnified.premiumModel),'OPENAI_UNIFIED_TTS_HD',base.openaiUnified.configured);
 const free=!base.paidProvidersAllowed&&googleFreeVoice(env)&&(await googleFreeUsage(env)).chars<freeCap(env)-200;
 const standardLive=(base.paidProvidersAllowed&&(googleLive||directLive||unifiedLive))||free;
 const premiumLive=base.paidProvidersAllowed&&(googleLive||directLive||unifiedHdLive);
 return {
  ...base,
  stt:{...base.stt,ready:sttLive,liveVerified:sttLive},
  google:{...base.google,ready:(base.paidProvidersAllowed&&googleLive)||free},
  openaiDirect:{...base.openaiDirect,ready:base.paidProvidersAllowed&&directLive},
  openaiUnified:{...base.openaiUnified,ready:base.paidProvidersAllowed&&(unifiedLive||unifiedHdLive)},
  standardReady:standardLive,
  premiumReady:premiumLive,
  liveVerified:standardLive||premiumLive,
 };
}

export async function recordVoiceProviderProbe(env:Env,mode:NibiruVoiceMode,provider:VoiceHealthProvider,model:string){
 try{
  await env.DB.prepare(`
   INSERT INTO nibiru_voice_provider_health(provider,mode,model,last_success_at,updated_at)
   VALUES(?,?,?,?,CURRENT_TIMESTAMP)
   ON CONFLICT(provider) DO UPDATE SET
     mode=excluded.mode,
     model=excluded.model,
     last_success_at=excluded.last_success_at,
     updated_at=CURRENT_TIMESTAMP
  `).bind(provider,mode,model,new Date().toISOString()).run();
 }catch(error){
  console.warn(JSON.stringify({event:'nibiru_voice_health_persist_failed',provider,mode,error:error instanceof Error?error.message:'FAILED'}));
 }
}
