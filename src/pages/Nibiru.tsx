import { useEffect,useRef,useState } from 'react';
import { Mic,Send,Square,Volume2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { NibiruMark,type NibiruVisualState } from '../components/NibiruMark';
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
 const[messages,setMessages]=useState<Message[]>([{role:'assistant',text:'Ben Nibiru. Anunex’in yapay zekâ akademik zekâ katmanıyım. Sorunuza göre etkin uzmanlığa yönlenir, yalnızca yetkiniz kapsamındaki doğrulanmış akademik verileri kullanırım.',specialist:'Nibiru Core'}]);
 const[text,setText]=useState('');const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[recording,setRecording]=useState(false);const[voiceBusy,setVoiceBusy]=useState(false);const[playing,setPlaying]=useState<number|null>(null);const[voiceStatus,setVoiceStatus]=useState<any>(null);const endRef=useRef<HTMLDivElement|null>(null);
 const recorderRef=useRef<MediaRecorder|null>(null);const chunksRef=useRef<BlobPart[]>([]);const streamRef=useRef<MediaStream|null>(null);const timerRef=useRef<number|null>(null);const audioRef=useRef<HTMLAudioElement|null>(null);
 useEffect(()=>{endRef.current?.scrollIntoView({behavior:'smooth'})},[messages,busy]);
 useEffect(()=>{api<any>('/api/nibiru/voice/status').then(setVoiceStatus).catch(()=>setVoiceStatus(null));return()=>{if(timerRef.current)window.clearTimeout(timerRef.current);streamRef.current?.getTracks().forEach(t=>t.stop());audioRef.current?.pause()}},[]);
 const ask=async(value?:string)=>{const q=(value??text).trim();if(!q||busy)return;setMessages(x=>[...x,{role:'user',text:q}]);setText('');setBusy(true);setError('');try{const r=await api<any>('/api/nibiru/chat',{method:'POST',body:JSON.stringify({message:q})});setMessages(x=>[...x,{role:'assistant',text:r.answer,specialist:r.orchestration?.label,coachPlan:r.coachPlan?.available?r.coachPlan:undefined}])}catch(e:any){setError(e.message||'Nibiru şu anda yanıt veremedi.')}finally{setBusy(false)}};
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
 const speakMessage=async(message:string,index:number)=>{
  if(voiceBusy)return;setError('');setVoiceBusy(true);audioRef.current?.pause();setPlaying(index);
  try{const response=await fetch('/api/nibiru/voice/speak',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({text:message,mode:'STANDARD'})});if(!response.ok)throw new Error(await responseError(response,'Nibiru sesi oluşturulamadı.'));const blob=await response.blob(),url=URL.createObjectURL(blob),audio=new Audio(url);audioRef.current=audio;audio.onended=()=>{URL.revokeObjectURL(url);setPlaying(null)};audio.onerror=()=>{URL.revokeObjectURL(url);setPlaying(null);setError('Ses oynatılamadı.')};await audio.play()}catch(e:any){setPlaying(null);setError(e.message||'Nibiru sesi oluşturulamadı.')}finally{setVoiceBusy(false)}
 };
 const items=suggestions[user?.role||'PARENT']||suggestions.PARENT,sttReady=Boolean(voiceStatus?.providers?.stt?.ready),ttsReady=Boolean(voiceStatus?.providers?.standardReady);
 const visualState:NibiruVisualState=recording?'listening':busy?'thinking':playing!==null?'speaking':voiceBusy?'active':'idle';
 const renderAssistant=(m:Message,i:number)=><div className="nibiru-assistant-message"><NibiruMark size={28} state={playing===i?'speaking':busy&&i===messages.length-1?'thinking':'idle'} title="Nibiru"/><div className="nibiru-message-body" style={{padding:'12px 14px',borderRadius:14,background:'var(--surface-2,#f5f7fb)',whiteSpace:'pre-wrap',lineHeight:1.5}}>{m.specialist&&<div style={{fontSize:12,fontWeight:700,opacity:.68,marginBottom:6}}>Aktif uzman · {m.specialist}</div>}{m.text}<div style={{marginTop:8}}><button className="ghost" disabled={!ttsReady||voiceBusy} onClick={()=>void speakMessage(m.text,i)}><Volume2 size={14}/> {playing===i?'Dinleniyor…':'Dinle'}</button></div>{m.coachPlan?.available&&<CoachPlanCard plan={m.coachPlan}/>}</div></div>;
 return <>
  <div className="page-head nibiru-hero-head"><div className="nibiru-hero-title"><NibiruMark size={72} state={visualState} showWordmark/><div><span className="eyebrow">TEK AKADEMİK ZEKÂ KAPISI</span><h1>Nibiru</h1><p>Doğrulanmış akademik veri, rol bazlı yetki ve uzman yapay zekâları tek bir kurumsal kimlik altında birleştirir.</p></div></div><div className="status ok nibiru-orchestration-status"><NibiruMark size={18} state="active" title="Nibiru aktif"/> Uzman orkestrasyonu aktif</div></div>
  {error&&<div className="alert error">{error}</div>}
  <div className="panel nibiru-chat-panel">
   <div className="nibiru-identity-strip"><NibiruMark size={34} state={visualState}/><div><strong>Nibiru konuşma standardı</strong><span>Geliştirici, süreç odaklı ve yargısız akademik dil kullanır. Sesli kullanım da aynı yetki ve doğrulanmış veri sınırlarından geçer; mikrofon yalnız siz başlattığınızda kayıt yapar.</span></div></div>
   <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'12px 0 16px'}}>{items.map(s=><button className="secondary" key={s} onClick={()=>void ask(s)} disabled={busy}>{s}</button>)}</div>
   <div style={{minHeight:360,maxHeight:'58vh',overflowY:'auto',padding:'8px 2px',display:'flex',flexDirection:'column',gap:12}}>
    {messages.map((m,i)=>m.role==='assistant'?<div key={i} style={{alignSelf:'flex-start',maxWidth:'86%'}}>{renderAssistant(m,i)}</div>:<div key={i} style={{alignSelf:'flex-end',maxWidth:'86%',padding:'12px 14px',borderRadius:14,background:'var(--primary,#1d4ed8)',color:'white',whiteSpace:'pre-wrap',lineHeight:1.5}}>{m.text}</div>)}
    {busy&&<div className="nibiru-thinking-line"><NibiruMark size={24} state="thinking" title="Nibiru düşünüyor"/><span>Nibiru doğru uzmanı seçiyor ve doğrulanmış verileri inceliyor…</span></div>}<div ref={endRef}/>
   </div>
   <div style={{display:'flex',gap:10,marginTop:14,alignItems:'stretch'}}><button className={recording?'primary':'secondary'} onClick={()=>void startRecording()} disabled={busy||voiceBusy||(!sttReady&&Boolean(voiceStatus))} title="Bas-konuş; kayıt en fazla 45 saniye sürer">{recording?<><Square size={17}/> Bitir</>:<><Mic size={17}/> Konuş</>}</button><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void ask()}}} placeholder={voiceBusy?'Ses işleniyor…':'Nibiru’ya sorun…'} maxLength={1200} style={{flex:1}}/><button className="primary" onClick={()=>void ask()} disabled={busy||voiceBusy||!text.trim()}><Send size={17}/> Gönder</button></div>
   <p className="muted" style={{marginTop:10}}>{recording?'Nibiru dinliyor. Bitir’e basın veya 45 saniye sonunda kayıt otomatik kapanır. ':''}Nibiru, MEB/Türkiye Yüzyılı Maarif Modeli’nin geliştirici ölçme-değerlendirme diline uygun konuşmak üzere yapılandırılmıştır; MEB’in ürünü veya temsilcisi değildir.</p>
  </div>
 </>;
}
