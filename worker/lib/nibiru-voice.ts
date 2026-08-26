import type { Env } from '../types';

export type NibiruVoiceMode='STANDARD'|'PREMIUM';
export type NibiruVoiceProvider='GOOGLE_WAVENET'|'OPENAI_GPT4O_MINI_TTS'|'OPENAI_UNIFIED_TTS'|'OPENAI_UNIFIED_TTS_HD';
export type VoiceProviderPlan={mode:NibiruVoiceMode;providers:NibiruVoiceProvider[];reason:string};
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
  .replace(/^\s*🤖\s*Nibiru\s*:\s*/i,'')
  .replace(/```[\s\S]*?```/g,' ')
  .replace(/[*_#>`~]/g,'')
  .replace(/https?:\/\/\S+/g,'bağlantı')
  .replace(/[📋🎯✅○🔊🎙️]/g,'')
  .replace(/\s+/g,' ')
  .trim()
  .slice(0,3600);
}

export function voiceProviderStatus(env:Env){
 const googleConfigured=Boolean(env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON);
 const directOpenAi=Boolean(env.OPENAI_TTS_API_KEY);
 const unified=Boolean(env.AI);
 return {
  stt:{ready:Boolean(env.AI),provider:'CLOUDFLARE_WORKERS_AI',model:env.NIBIRU_STT_MODEL||'@cf/openai/whisper-large-v3-turbo'},
  google:{ready:googleConfigured,provider:'GOOGLE_WAVENET',voice:env.NIBIRU_GOOGLE_TTS_VOICE||'tr-TR-Wavenet-E',detail:googleConfigured?'Google Cloud servis hesabı tanımlı.':'GOOGLE_TTS_SERVICE_ACCOUNT_JSON secret bekleniyor.'},
  openaiDirect:{ready:directOpenAi,provider:'OPENAI_GPT4O_MINI_TTS',model:env.NIBIRU_OPENAI_DIRECT_TTS_MODEL||'gpt-4o-mini-tts',detail:directOpenAi?'OpenAI TTS secret tanımlı.':'OPENAI_TTS_API_KEY opsiyonel; Unified Billing fallback kullanılabilir.'},
  openaiUnified:{ready:unified,provider:'CLOUDFLARE_AI_GATEWAY_UNIFIED',standardModel:env.NIBIRU_OPENAI_TTS_MODEL||'openai/tts-1',premiumModel:env.NIBIRU_OPENAI_TTS_HD_MODEL||'openai/tts-1-hd',detail:unified?'Workers AI binding üzerinden Unified Billing çağrısına hazır.':'Workers AI binding eksik.'},
  standardReady:googleConfigured||unified,
  premiumReady:directOpenAi||unified||googleConfigured,
 };
}

export function buildVoiceProviderPlan(env:Env,mode:NibiruVoiceMode):VoiceProviderPlan{
 const s=voiceProviderStatus(env);
 const rows:NibiruVoiceProvider[]=[];
 if(mode==='PREMIUM'){
  if(s.openaiDirect.ready)rows.push('OPENAI_GPT4O_MINI_TTS');
  if(s.openaiUnified.ready)rows.push('OPENAI_UNIFIED_TTS_HD');
  if(s.google.ready)rows.push('GOOGLE_WAVENET');
  return{mode,providers:rows,reason:'Premium seste doğal ifade öncelikli; sağlayıcı yoksa kurumsal WaveNet yedeği kullanılır.'};
 }
 if(s.google.ready)rows.push('GOOGLE_WAVENET');
 if(s.openaiUnified.ready)rows.push('OPENAI_UNIFIED_TTS');
 if(s.openaiDirect.ready)rows.push('OPENAI_GPT4O_MINI_TTS');
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
 } as any,{gateway:{id:env.NIBIRU_AI_GATEWAY_ID||'default',skipCache:true,collectLog:true,metadata:{app:'nibiru',modality:'stt',language:'tr'}}} as any);
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

async function googleSpeak(env:Env,text:string,speed:number):Promise<VoiceAudio>{
 const raw=env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON;if(!raw)throw new Error('GOOGLE_TTS_NOT_CONFIGURED');let account:any;try{account=JSON.parse(raw)}catch{throw new Error('GOOGLE_TTS_CREDENTIAL_INVALID')}
 const token=await googleAccessToken(env);const voice=env.NIBIRU_GOOGLE_TTS_VOICE||'tr-TR-Wavenet-E';
 const response=await fetch('https://texttospeech.googleapis.com/v1/text:synthesize',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','x-goog-user-project':String(account.project_id||'')},body:JSON.stringify({input:{text},voice:{languageCode:'tr-TR',name:voice},audioConfig:{audioEncoding:'MP3',speakingRate:speed,pitch:0}})});
 if(!response.ok)throw new Error(`GOOGLE_TTS_FAILED_${response.status}`);const payload:any=await response.json();if(!payload.audioContent)throw new Error('GOOGLE_TTS_EMPTY');
 return{bytes:bytesFromBase64(payload.audioContent),contentType:'audio/mpeg',provider:'GOOGLE_WAVENET',model:voice};
}

async function directOpenAiSpeak(env:Env,text:string,speed:number):Promise<VoiceAudio>{
 if(!env.OPENAI_TTS_API_KEY)throw new Error('OPENAI_TTS_NOT_CONFIGURED');const model=env.NIBIRU_OPENAI_DIRECT_TTS_MODEL||'gpt-4o-mini-tts';const voice=env.NIBIRU_OPENAI_TTS_VOICE||'alloy';
 const response=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{authorization:`Bearer ${env.OPENAI_TTS_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model,voice,input:text,response_format:'mp3',speed,instructions:'Türkçe konuş. Sakin, açık, profesyonel bir öğretmen tonu kullan. Öğrenciyi küçümseme; abartılı duygu, argo ve yapay coşkudan kaçın.'})});
 if(!response.ok)throw new Error(`OPENAI_TTS_FAILED_${response.status}`);return{bytes:new Uint8Array(await response.arrayBuffer()),contentType:response.headers.get('content-type')||'audio/mpeg',provider:'OPENAI_GPT4O_MINI_TTS',model};
}

async function unifiedOpenAiSpeak(env:Env,text:string,speed:number,hd:boolean):Promise<VoiceAudio>{
 if(!env.AI)throw new Error('OPENAI_UNIFIED_NOT_CONFIGURED');const model=hd?(env.NIBIRU_OPENAI_TTS_HD_MODEL||'openai/tts-1-hd'):(env.NIBIRU_OPENAI_TTS_MODEL||'openai/tts-1');const voice=env.NIBIRU_OPENAI_TTS_VOICE||'alloy';
 const response:any=await env.AI.run(model as any,{response_format:'mp3',speed,text,voice} as any,{gateway:{id:env.NIBIRU_AI_GATEWAY_ID||'default',skipCache:true,collectLog:true,metadata:{app:'nibiru',modality:'tts',language:'tr',quality:hd?'premium':'standard'}}} as any);
 if(response instanceof Response)return{bytes:new Uint8Array(await response.arrayBuffer()),contentType:response.headers.get('content-type')||'audio/mpeg',provider:hd?'OPENAI_UNIFIED_TTS_HD':'OPENAI_UNIFIED_TTS',model};
 const audioUrl=String(response?.audio||response?.result?.audio||'');if(!audioUrl)throw new Error('OPENAI_UNIFIED_TTS_EMPTY');const audio=await fetch(audioUrl);if(!audio.ok)throw new Error('OPENAI_UNIFIED_TTS_FETCH_FAILED');
 return{bytes:new Uint8Array(await audio.arrayBuffer()),contentType:audio.headers.get('content-type')||'audio/mpeg',provider:hd?'OPENAI_UNIFIED_TTS_HD':'OPENAI_UNIFIED_TTS',model};
}

export async function speakNibiru(env:Env,value:string,mode:NibiruVoiceMode='STANDARD'){
 const text=prepareNibiruSpeechText(value);if(!text)throw new Error('VOICE_TEXT_EMPTY');const speed=mode==='PREMIUM'?0.98:0.96,plan=buildVoiceProviderPlan(env,mode);const attempts:string[]=[];
 for(const provider of plan.providers){try{
  if(provider==='GOOGLE_WAVENET')return{audio:await googleSpeak(env,text,speed),plan,attempts};
  if(provider==='OPENAI_GPT4O_MINI_TTS')return{audio:await directOpenAiSpeak(env,text,speed),plan,attempts};
  if(provider==='OPENAI_UNIFIED_TTS_HD')return{audio:await unifiedOpenAiSpeak(env,text,speed,true),plan,attempts};
  if(provider==='OPENAI_UNIFIED_TTS')return{audio:await unifiedOpenAiSpeak(env,text,speed,false),plan,attempts};
 }catch(error){attempts.push(`${provider}:${error instanceof Error?error.message:'FAILED'}`)}}
 throw new Error(attempts.length?`VOICE_PROVIDER_FAILED:${attempts.join('|')}`:'VOICE_NOT_CONFIGURED');
}
