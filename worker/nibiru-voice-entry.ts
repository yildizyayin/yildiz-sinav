import app from './standard-readiness-entry';
import type { Env } from './types';
import { getAuthUser } from './lib/auth';
import { json } from './lib/db';
import { buildVoiceProviderPlan,speakNibiru,transcribeNibiruAudio,voiceProviderStatus } from './lib/nibiru-voice';
import { classifyVoiceActivationFailure,sanitizedVoiceProviderError } from './lib/nibiru-voice-diagnostics';


const PUBLIC_VOICE_SCENARIOS:Record<string,string>={
 'student-plan':'Merhaba Efe. Bugünkü rotanı hazırladım. Biyoloji için on sekiz dakika konu tekrarı, fonksiyonlardan on iki hedef soru ve paragraftan yirmi soru hız çalışması yapacağız. Hazırsan başlayalım, geleceğin doktoru.',
 'wrong-question':'Bu soruda işlem hatası değil, kavram karışıklığı görüyorum. Önce g fonksiyonunun sonucunu, sonra f fonksiyonunu uygulayacağız. Hata bir etiket değil, bir sonraki doğru adımın işaretidir.',
 'teacher':'Sekiz A sınıfında iki kazanım sınıf müdahalesi istiyor. On iki dakikalık tekrar, altı öğrencilik destek grubu ve akşam mini kontrol testi öneriyorum.',
 'parent':'Efe bu hafta düzenli ilerledi. Görev tamamlama oranı yükseldi. Matematikte küçük bir tekrar ihtiyacı var. Bu hafta çabanı gördüm demeniz en doğru destek olur.',
 'institution':'Bugün üç sınıf için erken müdahale öneriyorum. Devamsızlık, sınav eğilimi ve görev tamamlama verilerini birlikte değerlendirdim. Rehberlik ve öğretmen görevlerini onayınıza hazırladım.',
 'goal':'Evet Zeynep, yönün doğru. Fen ivmen güçlü. Türkçe hızın için paragraf, kimyada iki kazanım tekrarı ve cumartesi denemesi planladım. Bugünün küçük adımları geleceğin doktorunu inşa ediyor.'
};

async function publicVoiceDemo(request:Request,env:Env){
 const key=new URL(request.url).searchParams.get('scenario')||'';
 const text=PUBLIC_VOICE_SCENARIOS[key];
 if(!text)return fail(404,'VOICE_SCENARIO_NOT_FOUND','Tanımlı ses senaryosu bulunamadı.');
 try{
  const result=await speakNibiru(env,text,'PREMIUM');
  return new Response(strictArrayBuffer(result.audio.bytes),{status:200,headers:{'content-type':result.audio.contentType,'cache-control':'public, max-age=86400, s-maxage=604800, immutable','x-nibiru-voice-provider':result.audio.provider,'x-content-type-options':'nosniff'}});
 }catch(error){return voiceError(error)}
}

function fail(status:number,code:string,message:string,details?:unknown){return json({ok:false,error:{code,message,details}},status)}
function strictArrayBuffer(bytes:Uint8Array):ArrayBuffer{const copy=new Uint8Array(bytes.byteLength);copy.set(bytes);return copy.buffer}
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
 return json({ok:true,environment:env.ENVIRONMENT||'unknown',providers,plans:{standard:buildVoiceProviderPlan(env,'STANDARD'),premium:buildVoiceProviderPlan(env,'PREMIUM')},policy:{language:'tr-TR',interaction:'PUSH_TO_TALK',alwaysListening:false,teacherTone:'Sakin, açık, geliştirici ve kurumsal; MEB ürünü/temsilcisi iddiası yok.',maxAudioBytes:8*1024*1024,maxSpeechChars:3600},activation:{configured:providers.standardReady,liveVerified:false,liveProbeRequired:true}});
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
 try{const result=await speakNibiru(env,text,mode);return new Response(strictArrayBuffer(result.audio.bytes),{status:200,headers:{'content-type':result.audio.contentType,'cache-control':'private, no-store','x-nibiru-voice-provider':result.audio.provider,'x-nibiru-voice-model':result.audio.model,'x-content-type-options':'nosniff'}});}catch(error){return voiceError(error)}
}

async function probe(request:Request,env:Env){
 const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(user.role!=='SUPER_ADMIN')return fail(403,'SUPER_ADMIN_ONLY','Ses sağlayıcı testini yalnız Süper Admin çalıştırabilir.');
 const url=new URL(request.url),mode=url.searchParams.get('mode')==='premium'?'PREMIUM':'STANDARD';
 try{const result=await speakNibiru(env,'Nibiru ses testi. Öğrenmeye birlikte devam edebiliriz.',mode);return json({ok:true,mode,provider:result.audio.provider,model:result.audio.model,bytes:result.audio.bytes.byteLength,contentType:result.audio.contentType,attempts:result.attempts,activation:{liveVerified:true}});}catch(error){
  const diagnostic=classifyVoiceActivationFailure(error),safe=sanitizedVoiceProviderError(error);
  console.error(JSON.stringify({event:'nibiru_voice_probe_failed',mode,activationCode:diagnostic.activationCode,error:safe}));
  return fail(502,'VOICE_PROVIDER_FAILED','Nibiru ses sağlayıcısı canlı testi tamamlayamadı.',{...diagnostic,mode,attemptedPlan:buildVoiceProviderPlan(env,mode).providers});
 }
}

export default {
 async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
  const url=new URL(request.url),p=url.pathname;
  if(p==='/api/public/nibiru/voice-demo'&&request.method==='GET')return publicVoiceDemo(request,env);
  if(p==='/api/nibiru/voice/status'&&request.method==='GET')return status(request,env);
  if(p==='/api/nibiru/voice/transcribe'&&request.method==='POST')return transcribe(request,env);
  if(p==='/api/nibiru/voice/speak'&&request.method==='POST')return speak(request,env);
  if(p==='/api/nibiru/voice/probe'&&request.method==='POST')return probe(request,env);
  return app.fetch(request,env,ctx);
 },
 async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){if('scheduled' in app&&typeof app.scheduled==='function')return app.scheduled(event,env,ctx);},
} satisfies ExportedHandler<Env>;
