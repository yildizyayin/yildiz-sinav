import { useEffect,useRef,useState } from 'react';
import { Mic,Send,Square,Volume2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PasskeyAccess } from '../components/PasskeyAccess';
import '../nibiru-direct.css';
import { api } from '../api';
import { useAuth } from '../auth';
import { AnunexBrand } from '../components/AnunexBrand';
import { NibiruMark,type NibiruVisualState } from '../components/NibiruMark';
import { chooseVoice, createDeviceSpeech, readVoicePreference, saveVoicePreference, turkishVoiceOptions, withoutPersonalWords, type DeviceVoiceOption, type DeviceVoicePreference } from '../lib/device-speech';
import { NibiruVoiceSettings } from '../components/NibiruVoiceSettings';
import { CoachPlanCard } from '../components/CoachPlanCard';
import { clipEmbed } from '../lib/physicalLink';
import './nibiru-chat.css';

type Action={type:string;label:string;to?:string;url?:string;title?:string;start?:number;end?:number|null};
type Message={role:'user'|'assistant';text:string;specialist?:string;coachPlan?:any;suggestions?:string[];actions?:Action[];fresh?:boolean};

const suggestions:Record<string,string[]>={
 PARENT:['Öğrencim nasıl?','Son sınav ne oldu?','Hangi konuda zorlanıyor?','Bugün ne çalışalım?'],
 TEACHER:['Sınıfım nasıl?','Hangi kazanımlarda zorlanılıyor?','Bugün neye öncelik verelim?','Son sınavı özetle'],
 GUIDANCE_TEACHER:['Öğrencilerim nasıl?','Hangi kazanımlarda zorlanılıyor?','Bugün neye öncelik verelim?','Sınıf gelişimini özetle'],
 INSTITUTION_MANAGER:['Kurumum nasıl?','Bugün ne oldu?','Bekleyen optikler var mı?','Son sınavları özetle'],
 STUDENT:['Bugün ne çalışayım?','Zorlandığım kazanımlar hangileri?','Bu soruyu neden yanlış yaptım?','Gelişimim nasıl?'],
 SUPER_ADMIN:['Platformun durumu nasıl?','Bugün ne oldu?','Aktif kurumları özetle','Nibiru neler yapabilir?'],
};

async function responseError(response:Response,fallback:string){
 try{const payload:any=await response.json();return payload?.error?.message||fallback}catch{return fallback}
}

export function Nibiru(){
 const{user}=useAuth();
 const[students,setStudents]=useState<any[]>([]);const[selectedStudentId,setSelectedStudentId]=useState('');
 // owner (10 Nov 2026): a student's quick questions follow their grade and their own weakest outcome
 const[studentPrompts,setStudentPrompts]=useState<string[]|null>(null);
 useEffect(()=>{if(user?.role!=='STUDENT')return;api<any>('/api/student-standard/profile').then(r=>setStudentPrompts(Array.isArray(r.nibiruPrompts)&&r.nibiruPrompts.length?r.nibiruPrompts:null)).catch(()=>setStudentPrompts(null))},[user?.id,user?.role]);
 useEffect(()=>{api<any>('/api/nibiru/identity').then(r=>{setStudents(r.students||[]);if(r.students?.length===1)setSelectedStudentId(r.students[0].id)}).catch(()=>setStudents([]))},[user?.id]);
 const[messages,setMessages]=useState<Message[]>([{role:'assistant',text:'Merhaba, ben Nibiru. Sınavların, zorlandığın konular, çalışma planın ya da merak ettiğin bir konu… Ne sormak istersen buradayım.',specialist:'Nibiru Core'}]);
 const[text,setText]=useState('');const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[recording,setRecording]=useState(false);const[voiceBusy,setVoiceBusy]=useState(false);const[playing,setPlaying]=useState<number|null>(null);const[voiceStatus,setVoiceStatus]=useState<any>(null);const[capabilityLab,setCapabilityLab]=useState<any>(null);const[labStudentId,setLabStudentId]=useState('');const endRef=useRef<HTMLDivElement|null>(null);
 const[deviceVoiceReady,setDeviceVoiceReady]=useState(false);const[deviceVoices,setDeviceVoices]=useState<DeviceVoiceOption[]>([]);const[voicePref,setVoicePref]=useState<DeviceVoicePreference>(()=>readVoicePreference());const voicePrefRef=useRef(voicePref);voicePrefRef.current=voicePref;const[voiceSettingsOpen,setVoiceSettingsOpen]=useState(false);const[voiceStatusLoaded,setVoiceStatusLoaded]=useState(false);const deviceSpeechRef=useRef<ReturnType<typeof createDeviceSpeech>|null>(null);const audioUrlRef=useRef<string|null>(null);const mountedRef=useRef(true);
 const recorderRef=useRef<MediaRecorder|null>(null);const chunksRef=useRef<BlobPart[]>([]);const streamRef=useRef<MediaStream|null>(null);const timerRef=useRef<number|null>(null);const audioRef=useRef<HTMLAudioElement|null>(null);
 useEffect(()=>{if(messages.length>1||busy)endRef.current?.scrollIntoView({behavior:'smooth',block:'end'})},[messages,busy]);
 useEffect(()=>{mountedRef.current=true;api<any>('/api/nibiru/voice/status').then(setVoiceStatus).catch(()=>setVoiceStatus(null)).finally(()=>setVoiceStatusLoaded(true));return()=>{mountedRef.current=false;deviceSpeechRef.current?.cancel();if(audioUrlRef.current)URL.revokeObjectURL(audioUrlRef.current);if(timerRef.current)window.clearTimeout(timerRef.current);if(recorderRef.current){recorderRef.current.onstop=null;recorderRef.current.ondataavailable=null;if(recorderRef.current.state==='recording')recorderRef.current.stop();}streamRef.current?.getTracks().forEach(t=>t.stop());if(audioRef.current){audioRef.current.onended=null;audioRef.current.onerror=null;audioRef.current.pause();}}},[]);
 useEffect(()=>{if(!window.speechSynthesis||typeof SpeechSynthesisUtterance==='undefined')return;const synth=window.speechSynthesis;const update=()=>{const all=synth.getVoices();setDeviceVoices(turkishVoiceOptions(all));setDeviceVoiceReady(Boolean(chooseVoice(all,voicePrefRef.current)))};deviceSpeechRef.current=createDeviceSpeech(synth,SpeechSynthesisUtterance);update();synth.addEventListener('voiceschanged',update);return()=>{synth.removeEventListener('voiceschanged',update);deviceSpeechRef.current?.cancel();deviceSpeechRef.current=null}},[]);
 useEffect(()=>{if(user?.role!=='SUPER_ADMIN')return;api<any>('/api/nibiru/lab').then(result=>{setCapabilityLab(result);if(result?.students?.[0]?.id)setLabStudentId((current:string)=>current||result.students[0].id)}).catch(()=>setCapabilityLab(null))},[user?.role]);
 const ask=async(value?:string)=>{const q=(value??text).trim();if(!q||busy)return;if(user?.role==='PARENT'&&students.length>1&&!selectedStudentId){setError('Önce hakkında konuşacağınız öğrenciyi seçin.');return;}setMessages(x=>[...x,{role:'user',text:q}]);setText('');setBusy(true);setError('');try{const r=await api<any>('/api/nibiru/chat',{method:'POST',body:JSON.stringify({message:q,studentId:selectedStudentId||undefined,labStudentId:user?.role==='SUPER_ADMIN'?labStudentId||undefined:undefined})});setMessages(x=>[...x,{role:'assistant',text:r.answer,specialist:r.orchestration?.label,coachPlan:r.coachPlan?.available&&r.intent==='TODAY_PLAN'?r.coachPlan:undefined,suggestions:Array.isArray(r.suggestions)?r.suggestions:undefined,actions:Array.isArray(r.actions)?r.actions:undefined,fresh:true}])}catch(e:any){setError(e.message||'Nibiru şu anda yanıt veremedi.')}finally{setBusy(false)}};
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
  const deviceSpeak=()=>{const started=deviceSpeechRef.current?.speak(message,()=>setPlaying(null),msg=>{setPlaying(null);setError(msg)},{...voicePref,personalWords});if(!started){setPlaying(null);setError('Bu cihazda yerel Türkçe ses bulunamadı. Cihazın Türkçe ses paketini yükleyebilir veya yazılı yanıtı kullanabilirsiniz.');}};
  if(!voiceStatus?.providers?.standardReady){deviceSpeak();return;}
  setVoiceBusy(true);
  try{const response=await fetch('/api/nibiru/voice/speak',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({text:withoutPersonalWords(message,personalWords),mode:'STANDARD'})});if(!response.ok){if(response.status!==401&&mountedRef.current){setVoiceBusy(false);deviceSpeak();return;}throw new Error(await responseError(response,'Nibiru sesi oluşturulamadı.'));}const blob=await response.blob();if(!mountedRef.current)return;const url=URL.createObjectURL(blob),audio=new Audio(url);audioRef.current=audio;audioUrlRef.current=url;audio.onended=()=>{URL.revokeObjectURL(url);audioUrlRef.current=null;setPlaying(null)};audio.onerror=()=>{URL.revokeObjectURL(url);audioUrlRef.current=null;setPlaying(null);setError('Ses oynatılamadı.')};await audio.play()}catch(e:any){if(audioUrlRef.current){URL.revokeObjectURL(audioUrlRef.current);audioUrlRef.current=null;}if(mountedRef.current){setPlaying(null);setError(e.message||'Nibiru sesi oluşturulamadı.')}}finally{if(mountedRef.current)setVoiceBusy(false)}
 };
 const items: string[]=user?.role==='SUPER_ADMIN'&&capabilityLab?.enabled?(capabilityLab.prompts||suggestions.SUPER_ADMIN):(user?.role==='STUDENT'&&studentPrompts?studentPrompts:(suggestions[user?.role||'PARENT']||suggestions.PARENT)),sttConfigured=Boolean(voiceStatus?.providers?.stt?.configured),ttsReady=Boolean(voiceStatus?.providers?.standardReady);
 const visualState:NibiruVisualState=recording?'listening':busy?'thinking':playing!==null?'speaking':voiceBusy?'active':'idle';
 // 13 Nov 2026 (owner: "ChatGPT/Claude hissi"): a clean conversation — the newest answer types itself out, light
 // formatting (bold, lists), follow-up chips, and real actions (video segment plays right here, links open the page).
 const[typed,setTyped]=useState<{index:number;len:number}|null>(null);const[video,setVideo]=useState<Action|null>(null);
 useEffect(()=>{const i=messages.length-1;const m=messages[i];if(!m||m.role!=='assistant'||!m.fresh){setTyped(null);return}let len=0;setTyped({index:i,len:0});const step=Math.max(2,Math.round(m.text.length/90));const id=window.setInterval(()=>{len+=step;if(len>=m.text.length){window.clearInterval(id);setTyped(null)}else setTyped({index:i,len})},16);return()=>window.clearInterval(id)},[messages]);
 const rich=(t:string)=>{const inline=(x:string)=>x.split(/(\*\*[^*]+\*\*)/g).map((part,pi)=>/^\*\*[^*]+\*\*$/.test(part)?<strong key={pi}>{part.slice(2,-2)}</strong>:<span key={pi}>{part}</span>);const out:any[]=[];let list:string[]=[],para:string[]=[];const flush=()=>{if(para.length){const lines=para;out.push(<p key={out.length}>{lines.map((l,li)=><span key={li}>{li>0&&<br/>}{inline(l)}</span>)}</p>);para=[]}if(list.length){const items=list;out.push(<ul key={out.length}>{items.map((l,li)=><li key={li}>{inline(l)}</li>)}</ul>);list=[]}};for(const line of t.split('\n')){if(!line.trim()){flush();continue}const m=line.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/);if(m){if(para.length){const keep=list;list=[];flush();list=keep}list.push(m[1])}else{if(list.length)flush();para.push(line)}}flush();return out};
 const renderAssistant=(m:Message,i:number)=>{const typing=typed?.index===i;const shown=typing?m.text.slice(0,typed!.len):m.text;const last=i===messages.length-1;return <div className="nbc-assistant">
  <NibiruMark size={30} state={playing===i?'speaking':(busy&&last)||typing?'thinking':'idle'} title="Nibiru"/>
  <div className="nbc-body">{m.specialist&&<div className="nbc-specialist">{m.specialist}</div>}<div className="nbc-text">{rich(shown)}{typing&&<span className="nbc-caret" aria-hidden="true"/>}</div>
   {!typing&&<>
    {m.actions?.length?<div className="nbc-actions">{m.actions.map((a,ai)=>a.type==='VIDEO'?<button key={ai} type="button" className="nbc-action video" onClick={()=>setVideo(a)}>▶ {a.label}{a.end!=null?` · ${Math.max(1,Math.round(((a.end||0)-(a.start||0))/60))} dk`:''}</button>:<Link key={ai} className="nbc-action" to={a.to||'/'}>{a.label} →</Link>)}</div>:null}
    {m.coachPlan?.available&&<CoachPlanCard plan={m.coachPlan}/>}
    <div className="nbc-tools"><button className="ghost" disabled={(!ttsReady&&!deviceVoiceReady)||voiceBusy} onClick={()=>void speakMessage(m.text,i)}><Volume2 size={14}/> {playing===i?'Durdur':ttsReady?'Dinle':'Dinle · cihaz sesi'}</button></div>
    {m.suggestions?.length&&last?<div className="nbc-chips">{m.suggestions.map(q=><button key={q} type="button" disabled={busy} onClick={()=>void ask(q)}>{q}</button>)}</div>:null}
   </>}
  </div></div>};
 const firstName=String(user?.display_name||'').trim().split(/\s+/)[0];
 return <div className="nbc">
  <header className="nbc-head"><NibiruMark size={40} state={visualState}/><div><h1>Nibiru</h1><p>{user?.role==='STUDENT'?'Akademik asistanın':'Akademik asistanınız'}</p></div>
   <div className="nbc-head-tools">{!ttsReady&&deviceVoices.length>0&&<button type="button" className="ghost" aria-expanded={voiceSettingsOpen} onClick={()=>setVoiceSettingsOpen(v=>!v)}><Volume2 size={14}/> Ses</button>}</div></header>
  <p className="nbc-voice muted" role="status">{ttsReady?'Sesli yanıt hazır.':deviceVoiceReady?(voicePref.allowOnline?'Dinle düğmesi seçtiğiniz doğal çevrim içi sesi kullanır; adınız okunacak metinden çıkarılır.':'Dinle düğmesi cihazınızın yerel Türkçe sesini kullanır.'):voiceStatusLoaded?'Bu cihazda yerel Türkçe ses bulunamadı; yazılı sohbeti kullanabilirsiniz.':''}</p>
  {voiceSettingsOpen&&<NibiruVoiceSettings voices={deviceVoices} pref={voicePref} onSave={saveVoice} onPreview={previewVoice} onClose={()=>setVoiceSettingsOpen(false)}/>}
  {error&&<div className="alert error">{error}</div>}
  {user?.role==='PARENT'&&students.length>0&&<label className="nibiru-student-select nbc-select">Hangi öğrencimiz hakkında konuşalım?<select value={selectedStudentId} disabled={busy} onChange={e=>{deviceSpeechRef.current?.cancel();audioRef.current?.pause();setPlaying(null);setSelectedStudentId(e.target.value);setMessages([{role:'assistant',text:'Öğrenci seçiminiz değişti. Yeni sorunuzda seçili öğrencinin yetkili verilerini kullanacağım.'}])}}><option value="">Öğrenci seçin</option>{students.map(s=><option key={s.id} value={s.id}>{s.name} · {s.grade_level}. sınıf</option>)}</select></label>}
  {user?.role==='SUPER_ADMIN'&&capabilityLab?.enabled&&<div className="nbc-lab"><div><span className="eyebrow">SÜPER ADMİN TEST ALANI</span><strong>Nibiru Yetenek Laboratuvarı</strong><span className="muted">{capabilityLab.notice}</span></div>
   <label>Test öğrencisi<select value={labStudentId} onChange={e=>setLabStudentId(e.target.value)}>{(capabilityLab.students||[]).map((student:any)=><option key={student.id} value={student.id}>{student.first_name} {student.last_name} · {student.class_name||'Sınıf yok'}</option>)}</select></label></div>}
  <section className="nbc-thread" aria-live="polite">
   {messages.length===1&&<div className="nbc-empty"><NibiruMark size={84} state={visualState}/><h2>{firstName&&user?.role!=='STUDENT'?`Merhaba ${firstName},`:'Merhaba,'} bugün neye bakalım?</h2>
    <div className="nbc-starters">{items.slice(0,4).map(q=><button key={q} type="button" disabled={busy} onClick={()=>void ask(q)}>{q}</button>)}</div></div>}
   {messages.map((m,i)=>m.role==='assistant'?<div key={i} className="nbc-row">{renderAssistant(m,i)}</div>:<div key={i} className="nbc-row user"><div className="nbc-user">{m.text}</div></div>)}
   {busy&&<div className="nbc-row"><div className="nbc-assistant"><NibiruMark size={30} state="thinking" title="Nibiru düşünüyor"/><div className="nbc-dots" aria-label="Nibiru yazıyor"><i/><i/><i/></div></div></div>}<div ref={endRef}/>
  </section>
  {video&&<div className="nbc-video" role="dialog" aria-label={video.title||'Konu videosu'}><div className="nbc-video-box"><div className="nbc-video-head"><strong>{video.title||'Konu videosu'}</strong><button type="button" className="ghost" onClick={()=>setVideo(null)}>Kapat</button></div>{clipEmbed(video.url,video.start,video.end)?<div className="nbc-frame"><iframe title={video.title||'Konu videosu'} src={clipEmbed(video.url,video.start,video.end)!} allow="encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/></div>:<a href={video.url} target="_blank" rel="noreferrer">Videoyu aç</a>}</div></div>}
  <div className="nbc-composer">
   <button type="button" className={`nbc-icon ${recording?'rec':''}`} onClick={()=>void startRecording()} disabled={busy||voiceBusy||(!sttConfigured&&Boolean(voiceStatus))} title="Bas-konuş; en fazla 45 saniye" aria-label={recording?'Kaydı bitir':'Konuş'}>{recording?<Square size={18}/>:<Mic size={18}/>}</button>
   <textarea rows={1} value={text} onChange={e=>{setText(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(160,e.target.scrollHeight)+'px'}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void ask()}}} placeholder={voiceBusy?'Ses işleniyor…':recording?'Nibiru dinliyor…':'Nibiru’ya yaz…'} maxLength={1200} aria-label="Mesaj"/>
   <button type="button" className="nbc-icon send" onClick={()=>void ask()} disabled={busy||voiceBusy||!text.trim()} aria-label="Gönder"><Send size={18}/></button>
  </div>
  <PasskeyAccess/>
  <p className="nbc-foot muted">Nibiru yanılabilir; önemli kararları öğretmeninle ve rehber öğretmeninle birlikte ver. MEB’in ürünü ya da temsilcisi değildir.</p>
  {user?.role==='STUDENT'&&<details className="nbc-more"><summary>Kısa yollar</summary><div className="nibiru-task-links"><Link to="/calendar">Takvim ve planlarım</Link><Link to="/question-practice">Soru çöz</Link><Link to="/my-books">Kitaplarım</Link><Link to="/student-report">Gelişimim</Link></div><CoachPlanCard plan={null} showCatalog/></details>}
  {user?.role==='PARENT'&&<div className="nibiru-task-links nbc-links"><Link to="/children">Çocuklarım</Link><Link to="/weekly-summary">Haftalık gelişim</Link></div>}
 </div>;
}
