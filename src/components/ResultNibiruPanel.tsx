import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, BookOpenCheck, Expand, Minimize2, X } from 'lucide-react';
import { NibiruMark } from './NibiruMark';
import { ResultOutcomes } from './ResultLearningDetails';
import { resultValue, rowTitle } from './result-student-model';

/** Local, read-only result workspace. Does not call the licensed AI or voice APIs. */
export function ResultNibiruPanel({result,detail}:{result:any;detail:any}){
 const [open,setOpen]=useState(false),[full,setFull]=useState(false),[view,setView]=useState<'SUMMARY'|'WRONG'|'OUTCOMES'>('SUMMARY');
 const trigger=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLDialogElement>(null),id=useId();
 const context=detail?.exam?.title||'Sınavlarım';
 useEffect(()=>{
  if(!open)return;const el=dialog.current;if(!el)return;
  const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';el.showModal();
  return()=>{if(el.open)el.close();document.body.style.overflow=previousOverflow;trigger.current?.focus({preventScroll:true});};
 },[open]);
 const close=()=>{setOpen(false);setFull(false);setView('SUMMARY');};
 const summary=detail?.exam;
 const wrong=(detail?.subjects||[]).filter((s:any)=>s.wrong_count!=null&&Number(s.wrong_count)>0);
 return <>
 <aside className="sr-nibiru result-tip result-tip-nibiru rn-launcher"><button type="button" ref={trigger} className="rn-trigger" aria-haspopup="dialog" aria-expanded={open} aria-label="Nibiru ile sonuçlarını incele" onClick={()=>setOpen(true)}><span className="result-tip-mark"><NibiruMark size={64} state={open?'active':'idle'} interactive/></span><span><strong>Nibiru’dan kısa rota</strong><span>Sonucunu Nibiru ile incele</span></span><BookOpenCheck aria-hidden="true"/></button></aside>
 <dialog ref={dialog} className={`rn-dialog ${full?'rn-full':''}`} aria-labelledby={`${id}-title`} onCancel={e=>{e.preventDefault();close();}} onClose={()=>{if(open)close();}}>
 <div className="rn-surface"><header className="rn-header"><NibiruMark size={56} state="active"/><div><h2 id={`${id}-title`}>Nibiru</h2><p>{context}</p></div><button type="button" aria-label={full?'Yan panele dön':'Tam odak görünümü'} onClick={()=>setFull(!full)}>{full?<Minimize2/>:<Expand/>}</button><button type="button" aria-label="Nibiru’yu kapat" autoFocus onClick={close}><X/></button></header>
 <div className="rn-body"><p className="rn-context-note">Yayımlanmış sonuçlarını birlikte incele. Bu panel yalnız bu oturumdaki verileri gösterir.</p>
 <nav className="rn-actions" aria-label="Sonuç inceleme"><button type="button" aria-pressed={view==='SUMMARY'} onClick={()=>setView('SUMMARY')}>Sonucumu açıkla</button><button type="button" aria-pressed={view==='WRONG'} disabled={!detail} onClick={()=>setView('WRONG')}>Yanlışlarımı incele</button><button type="button" aria-pressed={view==='OUTCOMES'} disabled={!detail} onClick={()=>setView('OUTCOMES')}>Kazanımlarımı göster</button></nav>
 {!detail&&<p className="result-empty">Bir denemeye girerek o sınavın derslerini ve kazanımlarını inceleyebilirsin.</p>}
 {view==='SUMMARY'&&<section className="rn-summary"><h3>{context}</h3>{detail&&<dl>{[['Net',summary?.net],['Puan',summary?.score],['Doğru',summary?.correct_count],['Yanlış',summary?.wrong_count],['Boş',summary?.blank_count]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{resultValue(value)}</dd></div>)}</dl>}{!detail&&(result.tips||[]).map((tip:string)=><p key={tip}>{tip}</p>)}<p className="sr-data-note">Görünen bilgiler yayımlanmış sonuç kaydından alınır; eksik değerler tahmin edilmez.</p></section>}
 {view==='WRONG'&&detail&&<section><h3>Yanlışların bulunduğu dersler</h3>{wrong.map((s:any,i:number)=><div className="rn-wrong-row" key={i}><strong>{rowTitle(s)}</strong><span>{resultValue(s.wrong_count)} yanlış · {resultValue(s.blank_count)} boş</span></div>)}{!wrong.length&&<p className="result-empty">Bu kayıtta yanlış yanıtı bulunan ders görünmüyor.</p>}<p className="sr-data-note">Yalnız yayımlanan ders değerleri gösterilir; eksik soru / alt ders ayrıntısı üretilmez.</p><button type="button" className="rn-inline-action" onClick={()=>setView('OUTCOMES')}>Kazanımları incele</button></section>}
 {view==='OUTCOMES'&&detail&&<ResultOutcomes outcomes={detail.outcomes||[]} status={detail.outcomesStatus} compact/>}
 </div><footer><span>Sonuç inceleme alanı · Ses ve mikrofon kendiliğinden açılmaz.</span><button type="button" onClick={close}><ArrowLeft aria-hidden="true"/> Sonucuma dön</button></footer></div>
 </dialog>
 </>;
}
