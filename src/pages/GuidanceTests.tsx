import { useEffect,useMemo,useState } from 'react';
import { CheckCircle2,ClipboardCheck,Clock3,RefreshCw,ShieldCheck,XCircle } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';

const STATUS:Record<string,string>={PROPOSED:'Rehber öğretmen onayı bekliyor',APPROVED:'Uygulamaya hazır',IN_PROGRESS:'Devam ediyor',SUBMITTED:'Rehber öğretmen incelemesi bekliyor',REVIEWED:'İncelendi ve gelişim profiline eklendi',REJECTED:'Onaylanmadı',CANCELLED:'İptal edildi'};

function StudentGuidance(){
 const [instruments,setInstruments]=useState<any[]>([]);const [sessions,setSessions]=useState<any[]>([]);const [answers,setAnswers]=useState<Record<string,number>>({});const [busy,setBusy]=useState('');const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const load=async()=>{setError('');const [a,b]=await Promise.all([api<any>('/api/nibiru/guidance/instruments'),api<any>('/api/nibiru/guidance/assessments/my')]);setInstruments(a.instruments||[]);setSessions(b.sessions||[])};
 useEffect(()=>{void load().catch(e=>setError(e.message))},[]);
 const openByCode=useMemo(()=>new Map(sessions.filter(x=>['PROPOSED','APPROVED','IN_PROGRESS','SUBMITTED'].includes(x.status)).map(x=>[x.code,x])),[sessions]);
 const propose=async(code:string)=>{try{setBusy(code);setError('');const r=await api<any>('/api/nibiru/guidance/assessments/propose',{method:'POST',body:JSON.stringify({instrumentCode:code})});setNotice(r.message||'Onay isteği rehber öğretmene gönderildi.');await load()}catch(e:any){setError(e.message)}finally{setBusy('')}};
 const submit=async(session:any)=>{const items=session.question_schema?.items||[];const responses=Object.fromEntries(items.map((q:any)=>[q.id,answers[`${session.id}:${q.id}`]??3]));try{setBusy(session.id);setError('');const r=await api<any>(`/api/nibiru/guidance/assessments/${encodeURIComponent(session.id)}/submit`,{method:'POST',body:JSON.stringify({responses})});setNotice(r.message||'Yanıtların kaydedildi.');await load()}catch(e:any){setError(e.message)}finally{setBusy('')}};
 return <>
  <div className="alert warning"><ShieldCheck size={18}/><div><strong>Gerçek rehber öğretmen onayı zorunludur.</strong><div>Nibiru bir değerlendirme önerebilir; test ancak kurumundaki rehber öğretmen onayladıktan sonra açılır. Sonuç da rehber öğretmen incelemeden gelişim profiline eklenmez.</div></div></div>
  {notice&&<div className="alert success">{notice}</div>}{error&&<div className="alert error">{error}</div>}
  <div className="exam-grid" style={{marginBottom:20}}>{instruments.map(r=>{const active=openByCode.get(r.code);return <div key={r.id} className="exam-card" style={{textAlign:'left'}}><ClipboardCheck size={26}/><h3>{r.title}</h3><p>{r.description}</p>{active?<div className="pill"><Clock3 size={14}/> {STATUS[active.status]||active.status}</div>:<button className="primary" disabled={busy===r.code} onClick={()=>void propose(r.code)}>Rehber Öğretmen Onayı İste</button>}</div>})}</div>
  {sessions.map(s=><div className="panel" key={s.id} style={{marginBottom:16}}><div className="page-head" style={{marginBottom:8}}><div><span className="eyebrow">{s.category}</span><h2>{s.title}</h2><p>{STATUS[s.status]||s.status}</p></div>{s.status==='REVIEWED'?<CheckCircle2 size={30}/>:<Clock3 size={30}/>}</div>
   {s.status==='PROPOSED'&&<div className="alert">Bu değerlendirme henüz açılmadı. Kurum rehber öğretmeninin onayı bekleniyor.</div>}
   {['APPROVED','IN_PROGRESS'].includes(s.status)&&<><div className="alert warning">Bu bir eğitimsel öz-değerlendirmedir; psikolojik/tıbbi tanı üretmez.</div>{(s.question_schema?.items||[]).map((q:any)=><label key={q.id} style={{display:'block',margin:'14px 0'}}>{q.text}<div style={{display:'flex',gap:12,alignItems:'center'}}><input style={{flex:1}} type="range" min={s.question_schema?.scale?.min||1} max={s.question_schema?.scale?.max||5} value={answers[`${s.id}:${q.id}`]??3} onChange={e=>setAnswers({...answers,[`${s.id}:${q.id}`]:Number(e.target.value)})}/><strong>{answers[`${s.id}:${q.id}`]??3}/5</strong></div></label>)}<button className="primary" disabled={busy===s.id} onClick={()=>void submit(s)}>Rehber Öğretmene Gönder</button></>}
   {s.status==='SUBMITTED'&&<div className="alert">Yanıtların gönderildi. Sonuçlar Nibiru tarafından gelişiminde kullanılmadan önce gerçek rehber öğretmenin incelemesini bekliyor.</div>}
   {s.status==='REVIEWED'&&<div className="success-box"><CheckCircle2/><div><strong>Rehber öğretmen tarafından incelendi.</strong><span>{s.counselor_note||'Onaylanmış eğitimsel gelişim sinyalleri artık Nibiru rehberlik rotasında kullanılabilir.'}</span></div></div>}
  </div>)}
 </>;
}

function CounselorGuidance(){
 const [rows,setRows]=useState<any[]>([]);const [notes,setNotes]=useState<Record<string,string>>({});const [busy,setBusy]=useState('');const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const load=async()=>{setError('');const r=await api<any>('/api/nibiru/guidance/assessments/counselor-queue');setRows(r.sessions||[])};useEffect(()=>{void load().catch(e=>setError(e.message))},[]);
 const act=async(row:any,op:'approve'|'reject'|'review')=>{try{setBusy(row.id+op);setError('');const r=await api<any>(`/api/nibiru/guidance/assessments/${encodeURIComponent(row.id)}/${op}`,{method:'PATCH',body:JSON.stringify({note:notes[row.id]||''})});setNotice(op==='approve'?'Test öğrenciye açıldı.':op==='reject'?'Öneri reddedildi.':r.summary||'Sonuç gelişim profiline kabul edildi.');await load()}catch(e:any){setError(e.message)}finally{setBusy('')}};
 return <>{notice&&<div className="alert success">{notice}</div>}{error&&<div className="alert error">{error}</div>}<div className="alert warning"><ShieldCheck size={18}/><div><strong>İnsan onayı kapısı</strong><div>Nibiru yalnız önerir. Öğrenciye testi açma ve gönderilen sonucu gelişim profiline kabul etme kararı atandığı gerçek rehber öğretmendedir.</div></div></div>
  {rows.length===0&&<div className="panel"><h2>Onay kuyruğu boş</h2><p>Bekleyen rehberlik değerlendirmesi bulunmuyor.</p></div>}
  {rows.map(r=><div className="panel" key={r.id} style={{marginBottom:16}}><div className="page-head" style={{marginBottom:10}}><div><span className="eyebrow">{r.class_name||'Sınıf'} · {r.category}</span><h2>{r.first_name} {r.last_name}</h2><p>{r.title} · {STATUS[r.status]||r.status}</p></div><ClipboardCheck size={28}/></div><p>{r.proposal_reason}</p>
   {r.status==='SUBMITTED'&&r.scored_result?.dimensions&&<div className="stat-grid" style={{margin:'12px 0'}}>{Object.entries(r.scored_result.dimensions).map(([key,value])=><div className="stat-card" key={key}><span>{key.replaceAll('_',' ')}</span><strong>{Math.round(Number(value))}/100</strong></div>)}</div>}
   <label>Rehber öğretmen notu<textarea value={notes[r.id]||''} onChange={e=>setNotes({...notes,[r.id]:e.target.value})} placeholder="İsteğe bağlı kısa değerlendirme notu"/></label>
   <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:12}}>{r.status==='PROPOSED'&&<><button className="primary" disabled={busy!==''} onClick={()=>void act(r,'approve')}><CheckCircle2 size={16}/> Onayla ve Öğrenciye Aç</button><button className="ghost" disabled={busy!==''} onClick={()=>void act(r,'reject')}><XCircle size={16}/> Reddet</button></>}{r.status==='SUBMITTED'&&<button className="primary" disabled={busy!==''} onClick={()=>void act(r,'review')}><ShieldCheck size={16}/> İncele ve Gelişim Profiline Kabul Et</button>}</div>
  </div>)}</>;
}

export function GuidanceTests(){
 const {user}=useAuth();
 return <><div className="page-head"><div><span className="eyebrow">Eğitsel Rehberlik</span><h1>RBA & Rehberlik Değerlendirmeleri</h1><p>Öğrenci gelişiminde yalnız kurumun gerçek rehber öğretmeni tarafından onaylanmış ve incelenmiş eğitimsel veriler kullanılır.</p></div><button className="ghost" onClick={()=>location.reload()}><RefreshCw size={16}/> Yenile</button></div>
  {user?.role==='STUDENT'?<StudentGuidance/>:user?.role==='GUIDANCE_TEACHER'?<CounselorGuidance/>:<div className="panel"><h2>Rehber öğretmen kontrollü alan</h2><p>Bu işlem öğrenci ve kurumda atanmış gerçek rehber öğretmen rolleri arasında yürütülür. Yönetici ve diğer öğretmen rolleri test yanıtlarını uygulayamaz veya inceleme onayı veremez.</p></div>}
 </>;
}
