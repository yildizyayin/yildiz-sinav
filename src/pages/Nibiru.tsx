import { useEffect,useRef,useState } from 'react';
import { Mic,Send,Square,Volume2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PasskeyAccess } from '../components/PasskeyAccess';
import '../nibiru-direct.css';
import { api } from '../api';
import { useAuth } from '../auth';
import { AnunexBrand } from '../components/AnunexBrand';
import { NibiruMark,type NibiruVisualState } from '../components/NibiruMark';
import { chooseVoice, createDeviceSpeech, readVoicePreference, saveVoicePreference, turkishVoiceOptions, type DeviceVoiceOption, type DeviceVoicePreference } from '../lib/device-speech';
import { NibiruVoiceSettings } from '../components/NibiruVoiceSettings';
import { CoachPlanCard } from '../components/CoachPlanCard';

type Message={role:'user'|'assistant';text:string;specialist?:string;coachPlan?:any};

const suggestions:Record<string,string[]>={
 PARENT:['Öğrencim nasıl?','Son sınav ne oldu?','Hangi konuda zorlanıyor?','Bugün ne çalışalım?'],
 TEACHER:['Sınıfım nasıl?','Hangi kazanımlarda zorlanılıyor?','Bugün neye öncelik verelim?','Son sınavı özetle'],
 GUIDANCE_TEACHER:['Öğrencilerim nasıl?','Hangi kazanımlarda zorlanılıyor?','Bugün neye öncelik verelim?','Sınıf gelişimini özetle'],
 INSTITUTION_MANAGER:['Kurumum nasıl?','Bugün ne oldu?','Bekleyen optikler var mı?','Son sınavları özetle'],
 STUDENT:['Bugün ne çalışayım?','YKS/LGS hedefime ne kadar kaldı?','Bu matematik sorusunu neden yanlış yaptım?','Gelişimim nasıl?'],
 SUPER_ADMIN:['Platformun durumu nasıl?','Bugün ne oldu?','Aktif kurumları özetle','Nibiru neler yapabilir?'],
};

async function responseError(response:Response,fallback:string){
 try{const payload:any=await response.json();return payload?.error?.message||fallback}catch{return fallback}
}

export function Nibiru(){
 const{user}=useAuth();
 const[students,setStudents]=useState<any[]>([]);const[selectedStudentId,setSelectedStudentId]=useState('');
 useEffect(()=>{api<any>('/api/nibiru/identity').then(r=>{setStudents(r.students||[]);if(r.students?.length===1)setSelectedStudentId(r.students[0].id)}).catch(()=>setStudents([]))},[user?.id]);
 const[messages,setMessages]=useState<Message[]>([{role:'assistant',text:'Ben Nibiru. Anunex’in yapay zekâ akademik zekâ katmanıyım. Sorunuza göre etkin uzmanlığa yönlenir, yalnızca yetkiniz kapsamındaki doğrulanmış akademik verileri kullanırım.',specialist:'Nibiru Core'}]);
 const[text,setText]=useState('');const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[recording,setRecording]=useState(false);const[voiceBusy,setVoiceBusy]=useState(false);const[playing,setPlaying]=useState<number|null>(null);const[voiceStatus,setVoiceStatus]=useState<any>(null);const[capabilityLab,setCapabilityLab]=useState<any>(null);const[labStudentId,setLabStudentId]=useState('');const endRef=useRef<HTMLDivElement|null>(null);
 const[deviceVoiceReady,setDeviceVoiceReady]=useState(false);const[deviceVoices,setDeviceVoices]=useState<DeviceVoiceOption[]>([]);const[voicePref,setVoicePref]=useState<DeviceVoicePreference>(()=>readVoicePreference());const voicePrefRef=useRef(voicePref);voicePrefRef.current=voicePref;const[voiceSettingsOpen,setVoiceSettingsOpen]=useState(false);const[voiceStatusLoaded,setVoiceStatusLoaded]=useState(false);const deviceSpeechRef=useRef<ReturnType<typeof createDeviceSpeech>|null>(null);const audioUrlRef=useRef<string|null>(null);const mountedRef=useRef(true);
 const recorderRef=useRef<MediaRecorder|null>(null);const chunksRef=useRef<BlobPart[]>([]);const streamRef=useRef<MediaStream|null>(null);const timerRef=useRef<number|null>(null);const audioRef=useRef<HTMLAudioElement|null>(null);
 useEffect(()=>{endRef.current?.scrollIntoView({behavior:'smooth'})},[messages,busy]);
 useEffect(()=>{mountedRef.current=true;api<any>('/api/nibiru/voice/status').then(setVoiceStatus).catch(()=>setVoiceStatus(null)).finally(()=>setVoiceStatusLoaded(true));return()=>{mountedRef.current=false;deviceSpeechRef.current?.cancel();if(audioUrlRef.current)URL.revokeObjectURL(audioUrlRef.current);if(timerRef.current)window.clearTimeout(timerRef.current);if(recorderRef.current){recorderRef.current.onstop=null;recorderRef.current.ondataavailable=null;if(recorderRef.current.state==='recording')recorderRef.current.stop();}streamRef.current?.getTracks().forEach(t=>t.stop());if(audioRef.current){audioRef.current.onended=null;audioRef.current.onerror=null;audioRef.current.pause();}}},[]);
 useEffect(()=>{if(!window.speechSynthesis||typeof SpeechSynthesisUtterance==='undefined')return;const synth=window.speechSynthesis;const update=()=>{const all=synth.getVoices();setDeviceVoices(turkishVoiceOptions(all));setDeviceVoiceReady(Boolean(chooseVoice(all,voicePrefRef.current)))};deviceSpeechRef.current=createDeviceSpeech(synth,SpeechSynthesisUtterance);update();synth.addEventListener('voiceschanged',update);return()=>{synth.removeEventListener('voiceschanged',update);deviceSpeechRef.current?.cancel();deviceSpeechRef.current=null}},[]);
 useEffect(()=>{if(user?.role!=='SUPER_ADMIN')return;api<any>('/api/nibiru/lab').then(result=>{setCapabilityLab(result);if(result?.students?.[0]?.id)setLabStudentId((current:string)=>current||result.students[0].id)}).catch(()=>setCapabilityLab(null))},[user?.role]);
 const ask=async(value?:string)=>{const q=(value??text).trim();if(!q||busy)return;if(user?.role==='PARENT'&&students.length>1&&!selectedStudentId){setError('Önce hakkında konuşacağınız öğrenciyi seçin.');return;}setMessages(x=>[...x,{role:'user',text:q}]);setText('');setBusy(true);setError('');try{const r=await api<any>('/api/nibiru/chat',{method:'POST',body:JSON.stringify({message:q,studentId:selectedStudentId||undefined,labStudentId:user?.role==='SUPER_ADMIN'?labStudentId||undefined:undefined})});setMessages(x=>[...x,{role:'assistant',text:r.answer,specialist:r.orchestration?.label,coachPlan:r.coachPlan?.available?r.coachPlan:undefined}])}catch(e:any){setError(e.message||'Nibiru şu anda yanıt veremedi.')}finally{setBusy(false)}};
 const stopRecording=()=>{if(timerRef.current){window.clearTimeout(timerRef.current);timerRef.current=null}if(recorderRef.current?.state==='recording')recorderRef.current.stop()};
 const startRecording=async()=>{
  if(recording){stopRecording();return}setError('');
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setError('Bu tarayıcı mikrofonla konuşmayı desteklemiyor.');return}
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});streamRef.current=stream;chunksRef.current=[];
   const recorder=new MediaRecorder(stream);recorderRef.current=recorder;
   recorder.ondataavailable=e=>{if(e.data.size)chunksRef.current.push(e.data)};
   recorder.onstop=async()=>{setRecording(false);stream.getTracks().forEach(t=>t.stop());streamRef.current=null;const blob=new Blob(chunksRef.current,{type:recorder.mimeType||'audio/webm'});chunksRef.current=[];if(!blob.size)return;setVoiceBusy(true);try{const response=await fetch('/api/nibiru/voice/transcribe',{method:'POST',credentials:'include',headers:{'content-type':blob.type||'application/octet-stream'},body:blob});if(!response.ok)throw new Error(await responseError(response,'Sesiniz yazıya dönüştürülemedi.'));const payload:any=await response.json();setText(payload.text||'')}catch(e:any){setError(e.message||'Sesiniz yazıya dönüştürülemedi.')}finally{setVoiceBusy(false)}};
   recorder.start(250);setRecording(true);timerRef.current=window.setTimeout(()=>stopRecording(),45_000);
  }catch{setError('Mikrofon erişimi açılamadı. Tarayıcı mikrofon iznini kontrol edin.')}
 };
 // D-S049: words an online voice must not receive (the user's and the students' names)
 const personalWords=[...String(user?.display_name||'').split(/\s+/),...students.flatMap((s:any)=>String(s.name||'').split(/\s+/))].filter(Boolean);
 const saveVoice=(p:DeviceVoicePreference)=>{saveVoicePreference(p);setVoicePref(p);if(window.speechSynthesis)setDeviceVoiceReady(Boolean(chooseVoice(window.speechSynthesis.getVoices(),p)));setVoiceSettingsOpen(false)};
 const previewVoice=(p:DeviceVoicePreference,sample:string)=>{setError('');deviceSpeechRef.current?.cancel();setPlaying(null);const ok=deviceSpeechRef.current?.speak(sample,()=>undefined,msg=>setError(msg),{...p,personalWords});if(!ok)setError('Bu ses bu cihazda çalınamadı.')};
 const speakMessage=async(message:string,index:number)=>{
  if(voiceBusy)return;setError('');if(audioRef.current){audioRef.current.onended=null;audioRef.current.onerror=null;audioRef.current.pause();}if(audioUrlRef.current){URL.revokeObjectURL(audioUrlRef.current);audioUrlRef.current=null}deviceSpeechRef.current?.cancel();if(playing===index){setPlaying(null);return;}setPlaying(index);
  if(!voiceStatus?.providers?.standardReady){const started=deviceSpeechRef.current?.speak(message,()=>setPlaying(null),msg=>{setPlaying(null);setError(msg)},{...voicePref,personalWords});if(!started){setPlaying(null);setError('Bu cihazda yerel Türkçe ses bulunamadı. Cihazın Türkçe ses paketini yükleyebilir veya yazılı yanıtı kullanabilirsiniz.');}return;}
  setVoiceBusy(true);
  try{const response=await fetch('/api/nibiru/voice/speak',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({text:message,mode:'STANDARD'})});if(!response.ok)throw new Error(await responseError(response,'Nibiru sesi oluşturulamadı.'));const blob=await response.blob();if(!mountedRef.current)return;const url=URL.createObjectURL(blob),audio=new Audio(url);audioRef.current=audio;audioUrlRef.current=url;audio.onended=()=>{URL.revokeObjectURL(url);audioUrlRef.current=null;setPlaying(null)};audio.onerror=()=>{URL.revokeObjectURL(url);audioUrlRef.current=null;setPlaying(null);setError('Ses oynatılamadı.')};await audio.play()}catch(e:any){if(audioUrlRef.current){URL.revokeObjectURL(audioUrlRef.current);audioUrlRef.current=null;}if(mountedRef.current){setPlaying(null);setError(e.message||'Nibiru sesi oluşturulamadı.')}}finally{if(mountedRef.current)setVoiceBusy(false)}
 };
 const items: string[]=user?.role==='SUPER_ADMIN'&&capabilityLab?.enabled?(capabilityLab.prompts||suggestions.SUPER_ADMIN):(suggestions[user?.role||'PARENT']||suggestions.PARENT),sttConfigured=Boolean(voiceStatus?.providers?.stt?.configured),ttsReady=Boolean(voiceStatus?.providers?.standardReady);
 const visualState:NibiruVisualState=recording?'listening':busy?'thinking':playing!==null?'speaking':voiceBusy?'active':'idle';
 const renderAssistant=(m:Message,i:number)=><div className="nibiru-assistant-message"><NibiruMark size={28} state={playing===i?'speaking':busy&&i===messages.length-1?'thinking':'idle'} title="Nibiru"/><div className="nibiru-message-body" style={{padding:'12px 14px',borderRadius:14,background:'var(--surface-2,#f5f7fb)',whiteSpace:'pre-wrap',lineHeight:1.5}}>{m.specialist&&<div style={{fontSize:12,fontWeight:700,opacity:.68,marginBottom:6}}>Aktif uzman · {m.specialist}</div>}{m.text}<div style={{marginTop:8}}><button className="ghost" disabled={(!ttsReady&&!deviceVoiceReady)||voiceBusy} onClick={()=>void speakMessage(m.text,i)}><Volume2 size={14}/> {playing===i?'Durdur':ttsReady?'Dinle':'Dinle · cihaz sesi'}</button></div>{m.coachPlan?.available&&<CoachPlanCard plan={m.coachPlan}/>}</div></div>;
 return <>
  <div className="page-head nibiru-hero-head"><div className="nibiru-hero-title"><div className="nibiru-canonical-lockup"><AnunexBrand compact tagline={false}/><span className="nibiru-canonical-divider" aria-hidden="true"/><NibiruMark size={52} state={visualState} showWordmark/></div><div><span className="eyebrow">TEK AKADEMİK ZEKÂ KAPISI</span><h1>Nibiru</h1><p>Doğrulanmış akademik veri, rol bazlı yetki ve uzman yapay zekâları tek bir kurumsal kimlik altında birleştirir.</p></div></div><div className="status ok nibiru-orchestration-status"><NibiruMark size={18} state="active" title="Nibiru aktif"/> Uzman orkestrasyonu aktif</div></div>
  <div className="nibiru-voice-line"><p className="muted" role="status">{ttsReady?'Sesli yanıt hazır.':deviceVoiceReady?(voicePref.allowOnline?'Dinle düğmesi seçtiğiniz doğal çevrim içi sesi kullanır; adınız okunacak metinden çıkarılır.':'Dinle düğmesi cihazınızın yerel Türkçe sesini kullanır. Yanıt metni seslendirme için başka bir servise gönderilmez.'):voiceStatusLoaded?'Sesli yanıt şu anda kullanılamıyor. Bu cihazda yerel Türkçe ses bulunamadı; yazılı sohbeti kullanabilirsiniz.':'Ses seçenekleri kontrol ediliyor…'}</p>{!ttsReady&&deviceVoices.length>0&&<button type="button" className="ghost" aria-expanded={voiceSettingsOpen} onClick={()=>setVoiceSettingsOpen(v=>!v)}><Volume2 size={14}/> Ses ayarları</button>}</div>
  {voiceSettingsOpen&&<NibiruVoiceSettings voices={deviceVoices} pref={voicePref} onSave={saveVoice} onPreview={previewVoice} onClose={()=>setVoiceSettingsOpen(false)}/>}
  {error&&<div className="alert error">{error}</div>}
  <PasskeyAccess/><p className="muted" style={{fontSize:12}}>Başlangıç dönemi: hesap başına günde 30 sohbet isteği. Sağlayıcı kotası ayrıca geçerlidir; takvim ve diğer modüller bu sohbet sınırından etkilenmez.</p>
  {user?.role==='PARENT'&&students.length>0&&<label className="nibiru-student-select">Hangi öğrencimiz hakkında konuşalım?<select value={selectedStudentId} disabled={busy} onChange={e=>{deviceSpeechRef.current?.cancel();audioRef.current?.pause();setPlaying(null);setSelectedStudentId(e.target.value);setMessages([{role:'assistant',text:'Öğrenci seçiminiz değişti. Yeni sorunuzda seçili öğrencinin yetkili verilerini kullanacağım.'}])}}><option value="">Öğrenci seçin</option>{students.map(s=><option key={s.id} value={s.id}>{s.name} · {s.grade_level}. sınıf</option>)}</select></label>}
  <div className="nibiru-task-links"><Link to="/calendar">Takvim ve planlarım</Link>{user?.role==='STUDENT'&&<><Link to="/question-practice">Soru çöz</Link><Link to="/my-books">Kitaplarım</Link><Link to="/student-report">Gelişimim</Link></>}{user?.role==='PARENT'&&<><Link to="/children">Çocuklarım</Link><Link to="/weekly-summary">Haftalık gelişim</Link></>}</div>
  {user?.role==='STUDENT'&&<div className="panel"><CoachPlanCard plan={null} showCatalog/></div>}
  <div className="panel nibiru-chat-panel">
   {user?.role==='SUPER_ADMIN'&&capabilityLab?.enabled&&<div style={{border:'1px solid #9cc5ff',borderRadius:16,padding:16,marginBottom:16,background:'linear-gradient(135deg,#eff6ff,#f8fbff)'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',flexWrap:'wrap'}}><div><div className="eyebrow" style={{color:'#1d4ed8'}}>SÜPER ADMİN TEST ALANI</div><strong style={{fontSize:17}}>Nibiru Yetenek Laboratuvarı</strong><div className="muted" style={{marginTop:4}}>{capabilityLab.notice}</div></div><span className="status ok">SENTETİK VERİ</span></div>
    <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginTop:12}}><label style={{fontWeight:700}}>Test öğrencisi</label><select value={labStudentId} onChange={e=>setLabStudentId(e.target.value)} style={{minWidth:260}}>{(capabilityLab.students||[]).map((student:any)=><option key={student.id} value={student.id}>{student.first_name} {student.last_name} · {student.class_name||'Sınıf yok'}</option>)}</select><span className="muted">{capabilityLab.metrics?.outcomes||0} kazanım · {capabilityLab.metrics?.approvedQuestions||0} onaylı özgün soru</span></div>
   </div>}
   <div className="nibiru-identity-strip"><NibiruMark size={34} state={visualState}/><div><strong>Nibiru konuşma standardı</strong><span>Geliştirici, süreç odaklı ve yargısız akademik dil kullanır. Sesli kullanım da aynı yetki ve doğrulanmış veri sınırlarından geçer; mikrofon yalnız siz başlattığınızda kayıt yapar.</span></div></div>
   <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'12px 0 16px'}}>{items.map(s=><button className="secondary" key={s} onClick={()=>void ask(s)} disabled={busy}>{s}</button>)}</div>
   <div style={{minHeight:360,maxHeight:'58vh',overflowY:'auto',padding:'8px 2px',display:'flex',flexDirection:'column',gap:12}}>
    {messages.map((m,i)=>m.role==='assistant'?<div key={i} style={{alignSelf:'flex-start',maxWidth:'86%'}}>{renderAssistant(m,i)}</div>:<div key={i} style={{alignSelf:'flex-end',maxWidth:'86%',padding:'12px 14px',borderRadius:14,background:'var(--primary,#1d4ed8)',color:'white',whiteSpace:'pre-wrap',lineHeight:1.5}}>{m.text}</div>)}
    {busy&&<div className="nibiru-thinking-line"><NibiruMark size={24} state="thinking" title="Nibiru düşünüyor"/><span>Nibiru doğru uzmanı seçiyor ve doğrulanmış verileri inceliyor…</span></div>}<div ref={endRef}/>
   </div>
   <div style={{display:'flex',gap:10,marginTop:14,alignItems:'stretch'}}><button className={recording?'primary':'secondary'} onClick={()=>void startRecording()} disabled={busy||voiceBusy||(!sttConfigured&&Boolean(voiceStatus))} title="Bas-konuş; kayıt en fazla 45 saniye sürer">{recording?<><Square size={17}/> Bitir</>:<><Mic size={17}/> Konuş</>}</button><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void ask()}}} placeholder={voiceBusy?'Ses işleniyor…':'Nibiru’ya sorun…'} maxLength={1200} style={{flex:1}}/><button className="primary" onClick={()=>void ask()} disabled={busy||voiceBusy||!text.trim()}><Send size={17}/> Gönder</button></div>
   <p className="muted" style={{marginTop:10}}>{recording?'Nibiru dinliyor. Bitir’e basın veya 45 saniye sonunda kayıt otomatik kapanır. ':''}Nibiru, MEB/Türkiye Yüzyılı Maarif Modeli’nin geliştirici ölçme-değerlendirme diline uygun konuşmak üzere yapılandırılmıştır; MEB’in ürünü veya temsilcisi değildir.</p>
  </div>
 </>;
}
