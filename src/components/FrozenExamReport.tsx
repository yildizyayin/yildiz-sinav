import { useEffect, useMemo, useRef, useState } from 'react';
import { api, qs } from '../api';

export function FrozenExamReport({studentId,exams,selectedExamIds}:{studentId:string;exams:any[];selectedExamIds:string[]}){
 const years=useMemo(()=>[...new Set(exams.map(exam=>exam.academic_year).filter(year=>typeof year==='string'&&/^\d{4}-\d{4}$/.test(year)))].sort().reverse() as string[],[exams]);
 const [year,setYear]=useState(''),[data,setData]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const chosenYear=year||years[0]||'';
 const ids=useMemo(()=>selectedExamIds.filter(id=>exams.some(exam=>exam.exam_id===id&&(!exam.academic_year||exam.academic_year===chosenYear))).sort(),[selectedExamIds,exams,chosenYear]);
 const key=JSON.stringify([studentId,chosenYear,ids]);
 const current=useRef(key);current.current=key;
 const generation=useRef(0);
 useEffect(()=>{generation.current++;setData(null);setError('');setBusy(false)},[key]);
 const load=async()=>{
  const requestKey=key,attempt=++generation.current;setBusy(true);setError('');setData(null);
  try{const result=await api<any>(`/api/reporting/students/${encodeURIComponent(studentId)}/frozen-exams${qs({academicYear:chosenYear,examIds:ids.join(',')})}`);if(current.current===requestKey&&generation.current===attempt)setData({key:requestKey,result})}
  catch(e:any){if(current.current===requestKey&&generation.current===attempt)setError(e.message||'Karne hazırlanamadı.')}
  finally{if(current.current===requestKey&&generation.current===attempt)setBusy(false)}
 };
 const result=data?.key===key?data.result:null;
 return <section className="panel" style={{marginBottom:20}} aria-label="Seçili sınav karnesi">
  <div className="panel-head"><div><h2>Seçili sınav karnesi</h2><p>Yayınlanmış sonuçların soru kanıtlarından doğruluk özeti. Föy, soru havuzu ve oyun sonuçları bu görünümde henüz yok.</p></div></div>
  <div className="form-grid"><label>Eğitim yılı{years.length?<select value={chosenYear} onChange={e=>setYear(e.target.value)}>{years.map(value=><option key={value}>{value}</option>)}</select>:<input value={year} onChange={e=>setYear(e.target.value)} placeholder="2026-2027"/>}</label>
   <div><p>{ids.length} sınav seçili · En fazla 20 sınav</p><button className="secondary" onClick={()=>void load()} disabled={busy||!studentId||!/^\d{4}-\d{4}$/.test(chosenYear)||!ids.length||ids.length>20}>{busy?'Hazırlanıyor…':'Sınav Karnesini Hazırla'}</button></div></div>
  <p className="muted">Yukarıdaki sınav seçimleri kullanılır. Doğruluk yüzdesi resmî puan veya beceri düzeyi değildir.</p>
  {error&&<div className="alert error" role="alert">{error}</div>}
  {result&&<>
   {result.restrictedToSubjects&&<div className="alert info">Yalnız yetkili branşınız gösteriliyor.</div>}
   {result.coverage&&(result.coverage.legacySnapshots>0||result.coverage.excludedEvidence>0)&&<div className="alert info">{result.coverage.legacySnapshots} sınavda ayrıntılı soru kanıtı eksik. {result.coverage.excludedEvidence} kayıt doğrulanamadığı için hesaba katılmadı. Bu özetin kapsamı sınırlıdır.</div>}
   {result.unavailableExamIds?.length>0&&<div className="alert info">Seçilen sınavların {result.unavailableExamIds.length} tanesi için bu kapsamda yayınlanmış sonuç bulunamadı.</div>}
   <div style={{overflowX:'auto'}}><table><thead><tr><th>Ders</th><th>Sınıf</th><th>Sınav</th><th>Doğru / Yanlış / Boş</th><th>Kanıt</th><th>Doğruluk</th></tr></thead><tbody>{(result.groups||[]).map((group:any)=><tr key={JSON.stringify([group.subjectId,group.curriculumVersionId,group.gradeLevel])}><td>{group.subjectName||'Ders adı mevcut değil'}{group.programVersion&&<><br/><small>{group.programVersion}</small></>}</td><td>{group.gradeLevel}</td><td>{group.examCount}</td><td>{group.correct} / {group.wrong} / {group.blank}</td><td>{group.evidenceCount}{group.invalid>0&&<><br/><small>{group.invalid} iptal soru hariç</small></>}</td><td>{group.accuracyPercent===null?'—':`%${Number(group.accuracyPercent).toFixed(1)}`}</td></tr>)}</tbody></table></div>
   {!result.groups?.length&&<div className="empty">Seçili kapsamda doğrulanmış soru kanıtı bulunmuyor.</div>}
  </>}
 </section>;
}
