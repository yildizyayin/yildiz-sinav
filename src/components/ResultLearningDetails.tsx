import { useId, useState } from 'react';
import { resultGroups, resultValue, outcomeNumber, type ResultRow } from './result-student-model';

const publishedValue = (v: unknown) => v == null || v === '' ? 'Yayımlanmadı' : resultValue(v).replace('—','Yayımlanmadı');
function SubjectBar({row}:{row:ResultRow|null}) {
 if (!row) return null;
 const counts = [row.correct_count,row.wrong_count,row.blank_count];
 if (row.net == null || !Number.isFinite(row.net) || counts.some(v=>v==null||!Number.isFinite(v))) return null;
 const questions = counts.reduce<number>((total,v)=>total+Number(v),0);
 if (questions <= 0) return null;
 const ratio = row.net / questions;
 return <span className="sr-subject-meter" aria-label={`Net / soru: ${publishedValue(row.net)} / ${questions}`}>
   <span aria-hidden="true" style={{width:`${Math.min(100,Math.max(0,ratio*100))}%`}}/>
 </span>;
}
function success(outcome: Record<string,unknown>) {
 const correct=outcomeNumber(outcome,'correct_count'), evidence=outcomeNumber(outcome,'evidence_count');
 return correct!==null && evidence!==null && evidence>0 ? Math.round(100*correct/evidence) : null;
}
const values=(row:ResultRow|null)=><>{['correct_count','wrong_count','blank_count','net'].map(k=><td key={k}>{publishedValue(row?.[k as keyof ResultRow])}</td>)}</>;
export function ResultSubjectBreakdown({subjects,examType,optionalPhilosophy=[]}:{subjects:ResultRow[];examType:unknown;optionalPhilosophy?:any[]}){
 const id=useId();const groups=resultGroups(subjects,examType);
 return <section className="sr-panel sr-subjects"><h3>Ders performansın</h3><div className="sr-branch-head" aria-hidden="true"><span>Ders / alt ders</span><span>Doğru</span><span>Yanlış</span><span>Boş</span><span>Net</span></div>
 {groups.map((group,i)=><div className="sr-branch" key={i}>{group.children.length?<details open><summary><span>{group.title}<SubjectBar row={group.parent}/></span>{['correct_count','wrong_count','blank_count','net'].map((key,index)=><span className={index===3?'sr-branch-net':''} key={key} aria-label={`${['Doğru','Yanlış','Boş','Net'][index]} ${publishedValue(group.parent?.[key as keyof ResultRow])}`}>{publishedValue(group.parent?.[key as keyof ResultRow])}</span>)}</summary><div className="subject-grid sr-table-scroll" style={{display:'block'}} role="region" aria-label={`${group.title} alt dersleri`} tabIndex={0}><table className="sr-subject-table"><colgroup><col style={{width:'46%'}}/>{[0,1,2,3].map(i=><col key={i} style={{width:'13.5%'}}/>)}</colgroup><thead className="sr-visually-hidden"><tr><th>Ders</th><th>Doğru</th><th>Yanlış</th><th>Boş</th><th>Net</th></tr></thead><tbody>{group.children.map((child,j)=><tr className={child.row?'sr-child-row':'sr-child-row sr-missing'} key={j}><th scope="row">{child.title}<SubjectBar row={child.row}/>{!child.row&&<small>Alt ders verisi bulunmuyor</small>}</th>{values(child.row)}</tr>)}</tbody></table></div>{group.children.some(x=>!x.row)&&<p className="sr-data-note" id={`${id}-${i}`}>Alt ders değerleri tahmin edilmez. Ayrı veri yoksa “Yayımlanmadı” gösterilir.</p>}</details>:<div className="subject-grid sr-table-scroll" style={{display:'block'}} role="region" aria-label={group.title} tabIndex={0}><table className="sr-subject-table"><colgroup><col style={{width:'46%'}}/>{[0,1,2,3].map(i=><col key={i} style={{width:'13.5%'}}/>)}</colgroup><thead className="sr-visually-hidden"><tr><th>Ders</th><th>Doğru</th><th>Yanlış</th><th>Boş</th><th>Net</th></tr></thead><tbody><tr><th scope="row">{group.title}<SubjectBar row={group.parent}/></th>{values(group.parent)}</tr></tbody></table></div>}</div>)}
 {!groups.length&&<p className="result-empty sr-empty">Bu sınav için ders ayrıntısı bulunmuyor.</p>}
 {!!optionalPhilosophy.length&&<details className="sr-optional"><summary>Alternatif Felsefe alanı</summary><p className="sr-data-note">Ana test toplamına ayrıca eklenmez.</p>{optionalPhilosophy.map((r,i)=><p key={i}>{r.booklet_code||'Yayımlanmadı'} kitapçığı · {publishedValue(r.correct_count)} doğru · {publishedValue(r.wrong_count)} yanlış · {publishedValue(r.blank_count)} boş</p>)}</details>}
 </section>;
}
export function ResultOutcomes({outcomes,status,compact=false,truncated=false}:{outcomes:any[];status?:string;compact?:boolean;truncated?:boolean}){
 const id=useId(),[subject,setSubject]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState('ALL');
 const subjects=[...new Set(outcomes.map(o=>String(o.subject_name||o.subject_id||'')).filter(Boolean))];
 const hasWrong=outcomes.some(o=>outcomeNumber(o,'wrong_count')!=null),hasBlank=outcomes.some(o=>outcomeNumber(o,'blank_count')!=null);
 const visible=outcomes.filter(o=>(!subject||String(o.subject_name||o.subject_id||'')===subject)&&[o.outcome,o.title,o.code,o.topic,o.subtopic].join(' ').toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR'))&&(filter==='ALL'||(outcomeNumber(o,filter==='WRONG'?'wrong_count':'blank_count')||0)>0)).sort((a,b)=>(success(a)??Infinity)-(success(b)??Infinity));
 return <section className={`sr-panel sr-outcomes ${compact?'sr-outcomes-compact':''}`} aria-labelledby={`${id}-heading`}>
 <h3 id={`${id}-heading`}>Kazanım rotası</h3><p className="sr-section-caption">Konu / kazanım analizi · {outcomes.length} yayımlanmış eşleşme</p>
 {!!outcomes.length&&<><div className="sr-outcome-controls"><label htmlFor={`${id}-subject`}>Ders<select aria-label="Ders" id={`${id}-subject`} value={subject} onChange={e=>setSubject(e.target.value)}><option value="">Tüm dersler</option>{subjects.map(s=><option key={s}>{s}</option>)}</select></label><label htmlFor={`${id}-search`}>Kazanım ara<input id={`${id}-search`} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Konu veya kazanım"/></label></div><div className="sr-outcome-filters" role="group" aria-label="Kazanım durumu"><button type="button" aria-pressed={filter==='ALL'} onClick={()=>setFilter('ALL')}>Tümü</button><button type="button" aria-pressed={filter==='WRONG'} disabled={!hasWrong} title={hasWrong?'':'Bu kayıtta kazanım bazında yanlış ayrımı bulunmuyor.'} onClick={()=>setFilter('WRONG')}>Yanlışlar</button><button type="button" aria-pressed={filter==='BLANK'} disabled={!hasBlank} title={hasBlank?'':'Bu kayıtta kazanım bazında boş ayrımı bulunmuyor.'} onClick={()=>setFilter('BLANK')}>Boşlar</button></div></>}
 {!outcomes.length&&<p className="result-empty">{status==='NOT_VERIFIED'?'Bu sınavın kazanım eşleştirmesi doğrulanmış müfredata bağlı olmadığı için gösterilmiyor.':'Bu sınav için yayımlanmış kazanım verisi yok.'}</p>}
 {visible.map((o,i)=>{
 const percent=success(o);
 const band=percent===null?undefined:percent<50?'weak':percent<75?'medium':'strong';
 return <article data-band={band} className="outcome-row sr-outcome sr-outcome-card" key={`${o.outcome_id||o.code||o.outcome}-${i}`}><div><small>{o.subject_name||''}{o.code?` · ${o.code}`:''}</small><strong>{o.outcome||o.title}</strong>{(o.topic||o.subtopic)&&<span>{[o.topic,o.subtopic].filter(Boolean).join(' / ')}</span>}<dl><div><dt>Doğru</dt><dd>{publishedValue(outcomeNumber(o,'correct_count'))}</dd></div><div><dt>Yanlış</dt><dd>{publishedValue(outcomeNumber(o,'wrong_count'))}</dd></div><div><dt>Boş</dt><dd>{publishedValue(outcomeNumber(o,'blank_count'))}</dd></div><div><dt>Kanıt</dt><dd>{publishedValue(outcomeNumber(o,'evidence_count'))}</dd></div></dl></div><b className="sr-outcome-grade">{percent===null?'Yayımlanmadı':`%${percent} · ${band==='weak'?'Zayıf':band==='medium'?'Orta':'İyi'}`}</b></article>;})}
 {!!outcomes.length&&!visible.length&&<p className="result-empty">Seçimine uyan kazanım bulunamadı.</p>}{truncated&&<p className="sr-data-note">Bu sınavda çok sayıda kazanım var; ilk {outcomes.length} kazanım gösteriliyor. Tam liste için kurumunuzdan karneyi isteyin.</p>}
 {!!outcomes.length&&outcomes.some(o=>outcomeNumber(o,'wrong_count')==null||outcomeNumber(o,'blank_count')==null)&&<p className="sr-data-note">Bu kayıtta kazanım bazında yanlış / boş ayrımı eksik. Kanıt sayısı yanlış veya boş sayısı olarak yorumlanmaz.</p>}
 </section>;
}
