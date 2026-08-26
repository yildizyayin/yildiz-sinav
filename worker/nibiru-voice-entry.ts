import app from './standard-readiness-entry';
import type { Env } from './types';
import { getAuthUser } from './lib/auth';
import { json } from './lib/db';
import { buildVoiceProviderPlan,speakNibiru,transcribeNibiruAudio,voiceProviderStatus } from './lib/nibiru-voice';

function fail(status:number,code:string,message:string,details?:unknown){return json({ok:false,error:{code,message,details}},status)}
function voiceError(error:unknown){
 const value=error instanceof Error?error.message:String(error||'VOICE_FAILED');
 if(value.includes('TOO_LARGE'))return fail(413,'VOICE_AUDIO_TOO_LARGE','Ses kaydı en fazla 8 MB olabilir.');
 if(value.includes('EMPTY'))return fail(400,'VOICE_INPUT_EMPTY','Ses veya konuşma metni boş olamaz.');
 if(value.includes('NOT_CONFIGURED'))return fail(503,'VOICE_PROVIDER_NOT_CONFIGURED','Nibiru ses sağlayıcısı henüz etkin değil.');
 if(value.includes('TRANSCRIPTION'))return fail(422,'VOICE_TRANSCRIPTION_FAILED','Ses Türkçe metne dönüştürülemedi.');
 return fail(502,'VOICE_PROVIDER_FAILED','Nibiru ses sağlayıcısı isteği tamamlayamadı.');
}

async function status(request:Request,env:Env){
 const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');
 const providers=voiceProviderStatus(env);
 return json({ok:true,environment:env.ENVIRONMENT||'unknown',providers,plans:{standard:buildVoiceProviderPlan(env,'STANDARD'),premium:buildVoiceProviderPlan(env,'PREMIUM')},policy:{language:'tr-TR',interaction:'PUSH_TO_TALK',alwaysListening:false,teacherTone:'Sakin, açık, geliştirici ve kurumsal; MEB ürünü/temsilcisi iddiası yok.',maxAudioBytes:8*1024*1024,maxSpeechChars:3600}});
}

async function transcribe(request:Request,env:Env){
 const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');
 const length=Number(request.headers.get('content-length')||0);if(length>8*1024*1024)return fail(413,'VOICE_AUDIO_TOO_LARGE','Ses kaydı en fazla 8 MB olabilir.');
 try{const bytes=new Uint8Array(await request.arrayBuffer());const result=await transcribeNibiruAudio(env,bytes);return json({ok:true,text:result.text,model:result.model,language:'tr'});}catch(error){return voiceError(error)}
}

async function speak(request:Request,env:Env){
 const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');
 let body:{text?:string;mode?:'STANDARD'|'PREMIUM'};try{body=await request.json()}catch{return fail(400,'INVALID_JSON','Geçerli konuşma metni gönderilmelidir.')}
 const text=String(body.text||'').trim();if(!text)return fail(400,'VOICE_TEXT_EMPTY','Konuşma metni boş olamaz.');if(text.length>3600)return fail(413,'VOICE_TEXT_TOO_LONG','Seslendirme metni en fazla 3600 karakter olabilir.');
 const mode=body.mode==='PREMIUM'?'PREMIUM':'STANDARD';
 try{const result=await speakNibiru(env,text,mode);return new Response(result.audio.bytes,{status:200,headers:{'content-type':result.audio.contentType,'cache-control':'private, no-store','x-nibiru-voice-provider':result.audio.provider,'x-nibiru-voice-model':result.audio.model,'x-content-type-options':'nosniff'}});}catch(error){return voiceError(error)}
}

async function probe(request:Request,env:Env){
 const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(user.role!=='SUPER_ADMIN')return fail(403,'SUPER_ADMIN_ONLY','Ses sağlayıcı testini yalnız Süper Admin çalıştırabilir.');
 const url=new URL(request.url),mode=url.searchParams.get('mode')==='premium'?'PREMIUM':'STANDARD';
 try{const result=await speakNibiru(env,'Nibiru ses testi. Öğrenmeye birlikte devam edebiliriz.',mode);return json({ok:true,mode,provider:result.audio.provider,model:result.audio.model,bytes:result.audio.bytes.byteLength,contentType:result.audio.contentType,attempts:result.attempts});}catch(error){return voiceError(error)}
}

export default {
 async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
  const url=new URL(request.url),p=url.pathname;
  if(p==='/api/nibiru/voice/status'&&request.method==='GET')return status(request,env);
  if(p==='/api/nibiru/voice/transcribe'&&request.method==='POST')return transcribe(request,env);
  if(p==='/api/nibiru/voice/speak'&&request.method==='POST')return speak(request,env);
  if(p==='/api/nibiru/voice/probe'&&request.method==='POST')return probe(request,env);
  return app.fetch(request,env,ctx);
 },
 async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){if('scheduled' in app&&typeof app.scheduled==='function')return app.scheduled(event,env,ctx);},
} satisfies ExportedHandler<Env>;
