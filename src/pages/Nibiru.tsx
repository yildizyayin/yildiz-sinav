import { useEffect,useRef,useState } from 'react';
import { Bot,CheckCircle2,Mic,Send,Sparkles,Square,Volume2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';

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
 const[messages,setMessages]=useState<Message[]>([{role:'assistant',text:'🤖 Nibiru: Ben Ölçme Platformu’nun yapay zekâ akademik asistanıyım. Sorunuza göre Eğitim Koçu, Rehber Öğretmen veya Branş Öğretmeni uzmanlığına yönlenirim; yalnızca yetkiniz kapsamındaki doğrulanmış akademik verileri kullanırım.',specialist:'Nibiru Core'}]);
 const[text,setText]=useState('');const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[recording,setRecording]=useState(false);const[voiceBusy,setVoiceBusy]=useState(false);const[playing,setPlaying]=useState<number|null>(null);const[voiceStatus,setVoiceStatus]=useState<any>(null);const endRef=useRef<HTMLDivElement|null>(null);
 const recorderRef=useRef<MediaRecorder|null>(null);const chunksRef=useRef<BlobPart[]>([]);const streamRef=useRef<MediaStream|null>(null);const timerRef=useRef<number|null>(null);const audioRef=useRef<HTMLAudioElement|null>(null);
 useEffect(()=>{endRef.current?.scrollIntoView({behavior:'smooth'})},[messages,busy]);
 useEffect(()=>{api<any>('/api/nibiru/voice/status').then(setVoiceStatus).catch(()=>setVoiceStatus(null));return()=>{if(timerRef.current)window.clearTimeout(timerRef.current);streamRef.current?.getTracks().forEach(t=>t.stop());audioRef.current?.pause()}},[]);
 const ask=async(value?:string)=>{const q=(value??text).trim();if(!q||busy)return;setMessages(x=>[...x,{role:'user',text:q}]);setText('');setBusy(true);setError('');try{const r=await api<any>('/api/nibiru/chat',{method:'POST',body:JSON.stringify({message:q})});setMessages(x=>[...x,{role:'assistant',text:r.answer,specialist:r.orchestration?.label,coachPlan:r.coachPlan?.available?r.coachPlan:undefined}])}catch(e:any){setError(e.message||'Nibiru şu anda yanıt veremedi.')}finally{setBusy(false)}};
 const complete=async(itemId:string)=>{setBusy(true);setError('');try{await api(`/api/nibiru/coach/items/${encodeURIComponent(itemId)}/complete`,{method:'PATCH',body:JSON.stringify({completed:true})});const fresh=await api<any>('/api/nibiru/coach/daily-plan');setMessages(ms=>ms.map(m=>m.coachPlan?.available?{...m,coachPlan:fresh.available?fresh:m.coachPlan}:m))}catch(e:any){setError(e.message||'Görev güncellenemedi.')}finally{setBusy(false)}};
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
 return <>
  <div className="page-head"><div><span className="eyebrow">Nibiru AI</span><h1>🤖 Nibiru · Yapay Zekâ Akademik Asistanı</h1><p>Nibiru tek yapay zekâ kapısıdır; sorunuza göre Eğitim Koçu, Rehber Öğretmen AI veya Branş Öğretmeni AI devreye girer. Yetki ve veri sınırları tüm uzmanlarda aynıdır.</p></div><div className="status ok"><Sparkles size={15}/> Uzman Orkestrasyonu Aktif</div></div>
  {error&&<div className="alert error">{error}</div>}
  <div className="panel" style={{maxWidth:920,margin:'0 auto'}}>
   <div className="alert info"><Bot size={17}/><div><strong>Nibiru konuşma standardı</strong><span>Geliştirici, süreç odaklı ve yargısız akademik dil kullanır. Sesli kullanım da aynı yetki ve doğrulanmış veri sınırlarından geçer; mikrofon yalnız siz başlattığınızda kayıt yapar.</span></div></div>
   <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'12px 0 16px'}}>{items.map(s=><button className="secondary" key={s} onClick={()=>void ask(s)} disabled={busy}>{s}</button>)}</div>
   <div style={{minHeight:360,maxHeight:'58vh',overflowY:'auto',padding:'8px 2px',display:'flex',flexDirection:'column',gap:12}}>
    {messages.map((m,i)=><div key={i} style={{alignSelf:m.role==='user'?'flex-end':'flex-start',maxWidth:'86%',padding:'12px 14px',borderRadius:14,background:m.role==='user'?'var(--primary,#1d4ed8)':'var(--surface-2,#f5f7fb)',color:m.role==='user'?'white':'inherit',whiteSpace:'pre-wrap',lineHeight:1.5}}>{m.role==='assistant'&&m.specialist&&<div style={{fontSize:12,fontWeight:700,opacity:.68,marginBottom:6}}>Aktif uzman · {m.specialist}</div>}{m.text}{m.role==='assistant'&&<div style={{marginTop:8}}><button className="ghost" disabled={!ttsReady||voiceBusy} onClick={()=>void speakMessage(m.text,i)}><Volume2 size={14}/> {playing===i?'Dinleniyor…':'Dinle'}</button></div>}{m.coachPlan?.available&&<div style={{marginTop:12,paddingTop:10,borderTop:'1px solid var(--border,#dbe2ea)',display:'grid',gap:8}}><strong>📋 Bugünkü kayıtlı plan · %{Math.round(Number(m.coachPlan.plan?.progress||0))}</strong>{(m.coachPlan.items||[]).map((item:any)=><div key={item.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,padding:'8px 0'}}><span style={{whiteSpace:'normal'}}>{item.completed?'✅':'○'} {item.payload?.label||'Çalışma görevi'}{item.payload?.questionTarget?` · ${item.payload.questionTarget} soru`:''}</span><button className="ghost" disabled={busy||item.completed} onClick={()=>void complete(item.id)}>{item.completed?<><CheckCircle2 size={14}/> Tamamlandı</>:<>Tamamladım</>}</button></div>)}</div>}</div>)}
    {busy&&<div className="muted" style={{padding:10}}>🤖 Nibiru doğru uzmanı seçiyor ve doğrulanmış verileri inceliyor…</div>}<div ref={endRef}/>
   </div>
   <div style={{display:'flex',gap:10,marginTop:14,alignItems:'stretch'}}><button className={recording?'primary':'secondary'} onClick={()=>void startRecording()} disabled={busy||voiceBusy||(!sttReady&&Boolean(voiceStatus))} title="Bas-konuş; kayıt en fazla 45 saniye sürer">{recording?<><Square size={17}/> Bitir</>:<><Mic size={17}/> Konuş</>}</button><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void ask()}}} placeholder={voiceBusy?'Ses işleniyor…':'Nibiru’ya sorun…'} maxLength={1200} style={{flex:1}}/><button className="primary" onClick={()=>void ask()} disabled={busy||voiceBusy||!text.trim()}><Send size={17}/> Gönder</button></div>
   <p className="muted" style={{marginTop:10}}>{recording?'🎙️ Dinliyorum… Bitir’e basın veya 45 saniye sonunda kayıt otomatik kapanır. ':''}Nibiru, MEB/Türkiye Yüzyılı Maarif Modeli’nin geliştirici ölçme-değerlendirme diline uygun konuşmak üzere yapılandırılmıştır; MEB’in ürünü veya temsilcisi değildir.</p>
  </div>
 </>;
}
