import {useState} from 'react';
import {api} from '../api';

type Option={label:string;text:string};
export function QuestionContentEditor({question,onSaved}:{question:any;onSaved:()=>Promise<void>}){
 const [editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [history,setHistory]=useState<any[]|null>(null);
 const [verification,setVerification]=useState<any>(null);
 const [stemText,setStem]=useState(question.stem_text??''),[solutionText,setSolution]=useState(question.solution_text??'');
 const [correctAnswer,setAnswer]=useState(question.correct_answer??'A'),[editNote,setNote]=useState('');
 const [options,setOptions]=useState<Option[]>((question.options??[]).map((o:any,i:number)=>({label:String.fromCharCode(65+i),text:typeof o==='string'?o:String(o.text??'')})));
 const editable=!question.editorial_packet_json&&question.question_type==='MULTIPLE_CHOICE'&&question.content_mode==='TEXT'&&!question.assets?.length&&!question.contentBlocks?.length&&!['APPROVED','ARCHIVED'].includes(question.review_status);
 async function save(){
  setBusy(true);setError('');
  try{await api(`/api/question-bank-standard/${encodeURIComponent(question.id)}/content`,{method:'PATCH',body:JSON.stringify({expectedRevision:question.review_revision,stemText,solutionText,correctAnswer,options,editNote})});setEditing(false);await onSaved();}
  catch(e:any){setError(e.message||'Değişiklik kaydedilemedi.');}finally{setBusy(false);}
 }
 async function verify(){setBusy(true);setError('');try{const r=await api<any>(`/api/question-bank-standard/${encodeURIComponent(question.id)}/content/verify`,{method:'POST',body:JSON.stringify({expectedRevision:question.review_revision})});setVerification(r.verification);}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 async function showHistory(){try{const r=await api<any>(`/api/question-bank-standard/${encodeURIComponent(question.id)}/content`);setHistory(r.revisions);}catch(e:any){setError(e.message);}}
 return <section className="question-content-editor" aria-label="Soru içeriğini düzenle">
  <div className="preview-actions"><button type="button" className="secondary" onClick={()=>{setEditing(!editing);setError('');}} disabled={!editable||busy}>{editing?'Düzenlemeyi kapat':'Metin ve çözümü düzenle'}</button><button type="button" className="ghost" onClick={()=>void showHistory()} disabled={busy}>Sürüm geçmişi</button><button type="button" className="ghost" disabled={busy||question.review_status!=='REVIEW'||!question.stem_text||!question.solution_text} onClick={()=>void verify()}>Bağımsız kontrol</button></div>
  {!editable&&<small>Onaylı, medya içeren veya arşiv sorular bu metin düzenleyicisinde değiştirilmez.</small>}
  {verification&&<div className={verification.ok?'alert success':'alert warning'}><strong>{verification.ok?'Otomatik kontrol geçti':'Otomatik kontrol tamamlanmadı veya sorun buldu'}</strong>{verification.reviews?.flatMap((r:any)=>r.issues??[]).map((issue:string,i:number)=><p key={i}>{issue}</p>)}{verification.reviews?.filter((r:any)=>r.editorial).map((r:any)=><div key={r.index}><strong>Bağımsız editoryal puanlar · 0–4</strong>{Object.entries(r.editorial).filter(([k])=>k!=='rationale').map(([k,v])=><p key={k}>{({outcomeAlignment:'Kazanım uyumu',reasoningDemand:'Akıl yürütme',distractorQuality:'Çeldirici kalitesi',languageAndFairness:'Dil ve adalet',visualConsistency:'Görsel/veri tutarlılığı',originalityDesign:'Tasarımın özgünlüğü'} as Record<string,string>)[k]||k}: {String(v)} / 4</p>)}<p>{r.editorial.rationale}</p></div>)}<p>Bu sonuç insan incelemesi, özgünlük belgesi veya telif onayı değildir.</p></div>}{error&&<div role="alert" className="alert error">{error}</div>}
  {editing&&<fieldset disabled={busy}><legend>Taslak sürümü · {question.review_revision}</legend><p>Önceki içerik saklanır. Kaydetmek soruyu onaylamaz; inceleme kontrolleri yeniden tamamlanır. Kullanılmış sorular korunur.</p>
   <label>Soru metni<textarea value={stemText} onChange={e=>setStem(e.target.value)} rows={5} maxLength={3000}/></label>
   {options.map((o,i)=><label key={o.label}>{o.label} seçeneği<input value={o.text} onChange={e=>setOptions(options.map((v,j)=>j===i?{...v,text:e.target.value}:v))} maxLength={1200}/></label>)}
   <label>Doğru cevap<select value={correctAnswer} onChange={e=>setAnswer(e.target.value)}>{options.map(o=><option key={o.label}>{o.label}</option>)}</select></label>
   <label>Çözüm<textarea value={solutionText} onChange={e=>setSolution(e.target.value)} rows={6} maxLength={5000}/></label>
   <label>Değişiklik gerekçesi<textarea value={editNote} onChange={e=>setNote(e.target.value)} minLength={10} maxLength={1000} placeholder="Neyi, neden düzelttiniz?"/></label>
   <button type="button" className="primary" disabled={!stemText.trim()||!solutionText.trim()||editNote.trim().length<10||options.some(o=>!o.text.trim())} onClick={()=>void save()}>{busy?'Kaydediliyor…':'Kaydet ve yeniden incelemeye gönder'}</button>
  </fieldset>}
  {history&&<details open><summary>Önceki içerikler · {history.length}</summary>{history.length===0?<p>Kaydedilmiş içerik değişikliği yok.</p>:history.map(r=><article key={r.review_revision}><strong>Sürüm {r.review_revision} · {r.edited_at}</strong><p>{r.edit_note}</p><details><summary>Önceki içeriği göster</summary><p>{r.snapshot.stemText}</p>{r.snapshot.options?.map((o:any,i:number)=><p key={i}>{typeof o==='string'?o:`${o.label}) ${o.text}`}</p>)}<p>Doğru cevap: {r.snapshot.correctAnswer}</p><p>{r.snapshot.solutionText}</p></details></article>)}</details>}
 </section>;
}
