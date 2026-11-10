import { useEffect,useState } from 'react';
import { BookOpenCheck,CheckCircle2,Download,PenLine,RefreshCcw,Sparkles,Target } from 'lucide-react';
import { api } from '../api';
import './student-standard.css';

/** A059: solve the similar questions of a zero-error booklet; every answer is recorded as a new attempt. */
function ZeroErrorPractice({id,onChange}:{id:string;onChange:()=>void}){
 const[d,setD]=useState<any>(null);const[res,setRes]=useState<Record<string,boolean>>({});const[err,setErr]=useState('');
 const load=async()=>{try{setD(await api<any>(`/api/student-books/zero-error/${encodeURIComponent(id)}`))}catch(e:any){setErr(e.message)}};
 useEffect(()=>{void load()},[id]);
 const answer=async(itemId:string,a:string)=>{try{const r=await api<any>(`/api/student-books/zero-error/items/${encodeURIComponent(itemId)}/attempt`,{method:'POST',body:JSON.stringify({answer:a})});setRes({...res,[itemId]:r.correct});await load();onChange()}catch(e:any){setErr(e.message)}};
 if(!d)return err?<div className="alert error">{err}</div>:null;
 return <div style={{marginTop:8}}>{err&&<div className="alert error">{err}</div>}{d.items.map((it:any,k:number)=><div key={it.id} className="panel" style={{marginTop:6}}>
  <small>{it.subject_name||''} · {it.outcome_title||it.payload?.outcomeTitle||''} · sınavda {it.original_status==='WRONG'?'yanlış':'boş'}</small>
  {it.bank_question_id?<><p style={{whiteSpace:'pre-wrap'}}><strong>{k+1}.</strong> {it.stem_text}</p>
   <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{(it.options||[]).map((o:any,j:number)=>{const label=typeof o==='string'?'ABCDE'[j]:(o.label||'ABCDE'[j]);return <button key={label} className="ghost" onClick={()=>void answer(it.id,label)}>{label}) {typeof o==='string'?o:o.text}</button>})}</div>
   <p>{it.item_status==='MASTERED'?'✓ Doğru çözüldü':it.item_status==='NEEDS_REPEAT'?'Tekrar dene':'Henüz çözülmedi'}{res[it.id]!==undefined?(res[it.id]?' · son cevap doğru':' · son cevap yanlış'):''}</p></>:<p>{it.payload?.note||'Benzer soru henüz yok; bu kazanımı öğretmeninle tekrar et.'}</p>}
 </div>)}</div>;
}

/**
 * Dejavu (owner, 10 Nov 2026): the student enters the answers they marked in the printed book. The server grades
 * them and writes them to the karne; an answered question is final (the key is at the back of the book).
 */
function DejavuAnswerSheet({id,onChange}:{id:string;onChange:()=>void}){
 const[d,setD]=useState<any>(null);const[pick,setPick]=useState<Record<string,string>>({});const[err,setErr]=useState('');const[busy,setBusy]=useState(false);const[note,setNote]=useState('');
 const load=async()=>{try{setD(await api<any>(`/api/student-books/personal/${encodeURIComponent(id)}`))}catch(e:any){setErr(e.message)}};
 useEffect(()=>{void load()},[id]);
 const send=async()=>{setBusy(true);setErr('');setNote('');try{const r=await api<any>(`/api/student-books/personal/${encodeURIComponent(id)}/answers`,{method:'POST',body:JSON.stringify({answers:Object.entries(pick).map(([itemId,answer])=>({itemId,answer}))})});setNote(`${r.newlyAnswered} cevap kaydedildi · toplam ${r.answered}/${r.total}, ${r.correct} doğru. Sonuçların karnene işlendi.`);setPick({});await load();onChange()}catch(e:any){setErr(e.message)}finally{setBusy(false)}};
 if(!d)return err?<div className="alert error">{err}</div>:<p className="muted">Yükleniyor…</p>;
 let no=0;
 return <div className="dejavu-sheet">{err&&<div className="alert error" role="alert">{err}</div>}{note&&<div className="alert success">{note}</div>}
  {d.items.map((it:any)=>{
   if(it.item_type==='OUTCOME_HEADER'){const p=it.payload||{};return <div key={it.id} className="dejavu-sheet-head"><strong>{p.subject?`${p.subject} · `:''}{p.title||it.outcome_title}</strong>{Number(p.found)<Number(p.wanted)&&<small className="muted"> · bu kazanımda yeterli yeni onaylı soru yok ({p.found}/{p.wanted})</small>}</div>}
   if(it.item_type!=='PRACTICE_QUESTION')return null;
   no++;const labels=Array.isArray(it.options)&&it.options.length?it.options.map((o:any,j:number)=>typeof o==='string'?'ABCDE'[j]:String(o.label||'ABCDE'[j])):['A','B','C','D'];
   return <div key={it.id} className="dejavu-sheet-row"><span className="dejavu-no">{no}</span>
    {it.student_answer?<span className={`dejavu-done ${it.correct?'ok':'no'}`}>{it.student_answer}{it.correct?<> <CheckCircle2 size={14}/> doğru</>:<> · doğrusu {it.correct_answer}</>}</span>
     :<span className="dejavu-choices" role="radiogroup" aria-label={`${no}. soru`}>{labels.map((l:string)=><button key={l} type="button" role="radio" aria-checked={pick[it.id]===l} className={pick[it.id]===l?'primary':'ghost'} onClick={()=>setPick({...pick,[it.id]:l})}>{l}</button>)}</span>}
   </div>})}
  <div style={{display:'flex',gap:8,marginTop:10}}><button className="primary" disabled={busy||!Object.keys(pick).length} onClick={()=>void send()}><PenLine size={16}/> Cevaplarımı kaydet</button></div>
 </div>;
}

export function StudentBooks(){
 const[personal,setPersonal]=useState<any[]>([]);const[zero,setZero]=useState<any[]>([]);const[exams,setExams]=useState<any[]>([]);const[selectedExam,setSelectedExam]=useState('');const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[msg,setMsg]=useState('');const[openZero,setOpenZero]=useState('');const[openBook,setOpenBook]=useState('');
 const load=async()=>{try{const[p,z,e]=await Promise.all([api<any>('/api/student-books/personal'),api<any>('/api/student-books/zero-error'),api<any>('/api/my-results')]);setPersonal(p.books||[]);setZero(z.booklets||[]);setExams(e.exams||[])}catch(e:any){setError(e.message)}};
 useEffect(()=>{void load()},[]);
 const createPersonal=async()=>{setBusy(true);setError('');setMsg('');try{const r=await api<any>('/api/student-books/personal',{method:'POST',body:JSON.stringify({outcomeLimit:8})});setMsg(`Dejavu kitabın hazır: ${r.outcomeCount} kazanım, ${r.questionCount} yeni soru.${r.shortages?.length?` ${r.shortages.length} kazanımda yeterli yeni onaylı soru yok; öğretmenin bunu görebilir.`:''}`);await load()}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 const createZero=async()=>{if(!selectedExam)return;setBusy(true);setError('');setMsg('');try{const r=await api<any>('/api/student-books/zero-error',{method:'POST',body:JSON.stringify({examId:selectedExam,practicePerSource:2})});setMsg(`Sıfır Hata Kitapçığı hazırlandı: ${r.wrongCount} yanlış, ${r.blankCount} boş, ${r.practiceCount} benzer çalışma sorusu.`);await load()}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 return <>
  <div className="page-head"><div><span className="eyebrow">Kişisel çalışma ürünleri</span><h1>📚 Benim Kitaplarım</h1><p>Dejavu kitabın ve Sıfır Hata kitapçıkların; hepsi karnendeki kazanımlara göre hazırlanır.</p></div><BookOpenCheck/></div>
  {error&&<div className="alert error">{error}</div>}{msg&&<div className="alert success">{msg}</div>}
  <div className="student-top-grid">
   <div className="goal-story-card"><div className="goal-story-icon"><Sparkles/></div><span>Dejavu</span><h2>Sana özel çalışma kitabı</h2><p>Karnende henüz öğrenilmemiş kazanımlar seçilir; daha önce hiç görmediğin, onaylı sorular senin düzeyine göre eklenir. Kitabı bas, çöz, cevaplarını buraya gir: sonuçlar karnene işlenir.</p><button className="primary" disabled={busy} onClick={()=>void createPersonal()}><Sparkles size={16}/> Yeni Dejavu kitabı hazırla</button></div>
   <div className="goal-story-card"><div className="goal-story-icon"><Target/></div><span>Sıfır Hata Kitapçığı</span><h2>Yanlış ve boşları kapat</h2><p>Merkezi veya kurum içi fark etmeksizin sonuçlanmış sınavındaki yanlış/boş soruların kazanımları üzerinden benzer sorularla tekrar döngüsü oluşturur.</p><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><select value={selectedExam} onChange={e=>setSelectedExam(e.target.value)} style={{flex:1,minWidth:220}}><option value="">Sınav seç</option>{exams.map((e:any)=><option key={e.exam_id} value={e.exam_id}>{e.title}{e.exam_date?` · ${e.exam_date}`:''}</option>)}</select><button className="primary" disabled={busy||!selectedExam} onClick={()=>void createZero()}><RefreshCcw size={16}/> Kitapçığı Oluştur</button></div></div>
  </div>
  <div className="panel"><div className="panel-head"><div><h2>Dejavu kitaplarım</h2><p>Her yeni kitap karnendeki son duruma göre hazırlanır.</p></div></div><div className="cards-list">{personal.map((b:any)=><div className="list-card" key={b.id}><div className="quick-icon"><Sparkles size={18}/></div><div style={{display:'grid',gap:6,minWidth:0,flex:1}}><strong>{b.title}</strong><span>{b.outcome_count} kazanım · {b.question_count} soru{b.question_count>0?` · ${Number(b.answered_count||0)} cevaplandı, ${Number(b.correct_count||0)} doğru`:''}</span>{b.question_count>0?<div style={{display:'flex',gap:8,flexWrap:'wrap'}}><a className="ghost" href={`/api/student-books/personal/${encodeURIComponent(b.id)}/pdf`}><Download size={15}/> PDF indir</a><button className="ghost" onClick={()=>setOpenBook(openBook===b.id?'':b.id)}><PenLine size={15}/> {openBook===b.id?'Kapat':'Cevaplarımı gir'}</button></div>:<small className="muted">Bu kazanımlar için henüz yeterli onaylı soru yok.</small>}{openBook===b.id&&<DejavuAnswerSheet id={b.id} onChange={()=>void load()}/>}</div></div>)}{!personal.length&&<div className="empty">Henüz Dejavu kitabın yok.</div>}</div></div>
  <div className="panel"><div className="panel-head"><div><h2>Sıfır Hata Kitapçıklarım</h2><p>Yanlış/boşlardan tekrar öğrenme döngüsü.</p></div></div><div className="cards-list">{zero.map((b:any)=><div className="list-card" key={b.id}><div className="quick-icon"><Target size={18}/></div><div><strong>{b.title}</strong><span>{b.source_exam_title||'Sınav'} · {b.wrong_count} yanlış · {b.blank_count} boş · {b.unresolved_count} açık madde</span><button className="ghost" onClick={()=>setOpenZero(openZero===b.id?'':b.id)}>{openZero===b.id?'Kapat':'Çöz'}</button>{openZero===b.id&&<ZeroErrorPractice id={b.id} onChange={()=>void load()}/>}</div></div>)}{!zero.length&&<div className="empty">Henüz Sıfır Hata Kitapçığın yok.</div>}</div></div>
 </>;
}
