import { useEffect,useState } from 'react';
import { BookOpenCheck,RefreshCcw,Sparkles,Target } from 'lucide-react';
import { api } from '../api';
import './student-standard.css';

export function StudentBooks(){
 const[personal,setPersonal]=useState<any[]>([]);const[zero,setZero]=useState<any[]>([]);const[exams,setExams]=useState<any[]>([]);const[selectedExam,setSelectedExam]=useState('');const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[msg,setMsg]=useState('');
 const load=async()=>{try{const[p,z,e]=await Promise.all([api<any>('/api/student-books/personal'),api<any>('/api/student-books/zero-error'),api<any>('/api/my-results')]);setPersonal(p.books||[]);setZero(z.booklets||[]);setExams(e.exams||[])}catch(e:any){setError(e.message)}};
 useEffect(()=>{void load()},[]);
 const createPersonal=async()=>{setBusy(true);setError('');setMsg('');try{const r=await api<any>('/api/student-books/personal',{method:'POST',body:JSON.stringify({outcomeLimit:8,questionsPerOutcome:4})});setMsg(`Kişiye Özel Kitap hazırlandı: ${r.outcomeCount} kazanım, ${r.questionCount} çalışma sorusu.`);await load()}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 const createZero=async()=>{if(!selectedExam)return;setBusy(true);setError('');setMsg('');try{const r=await api<any>('/api/student-books/zero-error',{method:'POST',body:JSON.stringify({examId:selectedExam,practicePerSource:2})});setMsg(`Sıfır Hata Kitapçığı hazırlandı: ${r.wrongCount} yanlış, ${r.blankCount} boş, ${r.practiceCount} benzer çalışma sorusu.`);await load()}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 return <>
  <div className="page-head"><div><span className="eyebrow">Kişisel çalışma ürünleri</span><h1>📚 Benim Kitaplarım</h1><p>Sınav ve kazanım verilerinden sana özel çalışma çıktıları oluştur.</p></div><BookOpenCheck/></div>
  {error&&<div className="alert error">{error}</div>}{msg&&<div className="alert success">{msg}</div>}
  <div className="student-top-grid">
   <div className="goal-story-card"><div className="goal-story-icon"><Sparkles/></div><span>Kişiye Özel Kitap</span><h2>Gelişim alanlarından kişisel kitap</h2><p>Birden fazla ölçme kanıtına göre gelişime açık kazanımlar seçilir; yalnız onaylı ve telif durumu uygun soru havuzundan yeni çalışma soruları eklenir.</p><button className="primary" disabled={busy} onClick={()=>void createPersonal()}><Sparkles size={16}/> Kitabımı Oluştur</button></div>
   <div className="goal-story-card"><div className="goal-story-icon"><Target/></div><span>Sıfır Hata Kitapçığı</span><h2>Yanlış ve boşları kapat</h2><p>Merkezi veya kurum içi fark etmeksizin sonuçlanmış sınavındaki yanlış/boş soruların kazanımları üzerinden benzer sorularla tekrar döngüsü oluşturur.</p><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><select value={selectedExam} onChange={e=>setSelectedExam(e.target.value)} style={{flex:1,minWidth:220}}><option value="">Sınav seç</option>{exams.map((e:any)=><option key={e.exam_id} value={e.exam_id}>{e.title}{e.exam_date?` · ${e.exam_date}`:''}</option>)}</select><button className="primary" disabled={busy||!selectedExam} onClick={()=>void createZero()}><RefreshCcw size={16}/> Kitapçığı Oluştur</button></div></div>
  </div>
  <div className="panel"><div className="panel-head"><div><h2>Kişiye Özel Kitaplarım</h2><p>Hazır kişisel çalışma setlerin.</p></div></div><div className="cards-list">{personal.map((b:any)=><div className="list-card" key={b.id}><div className="quick-icon"><Sparkles size={18}/></div><div><strong>{b.title}</strong><span>{b.outcome_count} kazanım · {b.question_count} soru · {b.status}</span></div></div>)}{!personal.length&&<div className="empty">Henüz kişiye özel kitabın yok.</div>}</div></div>
  <div className="panel"><div className="panel-head"><div><h2>Sıfır Hata Kitapçıklarım</h2><p>Yanlış/boşlardan tekrar öğrenme döngüsü.</p></div></div><div className="cards-list">{zero.map((b:any)=><div className="list-card" key={b.id}><div className="quick-icon"><Target size={18}/></div><div><strong>{b.title}</strong><span>{b.source_exam_title||'Sınav'} · {b.wrong_count} yanlış · {b.blank_count} boş · {b.unresolved_count} açık madde</span></div></div>)}{!zero.length&&<div className="empty">Henüz Sıfır Hata Kitapçığın yok.</div>}</div></div>
 </>;
}
