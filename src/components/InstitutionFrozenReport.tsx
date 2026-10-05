import {useRef,useState} from 'react';
import {api,qs} from '../api';

export function InstitutionFrozenReport({institutionId,exams,selectedExamIds}:{institutionId:string;exams:any[];selectedExamIds:string[]}){
 const [year,setYear]=useState(''),[data,setData]=useState<any>(null),[busyKey,setBusyKey]=useState(''),[error,setError]=useState<{key:string;message:string}|null>(null);
 const years=[...new Set(exams.map(exam=>exam.academic_year).filter(value=>typeof value==='string'))].sort().reverse() as string[];
 const chosenYear=year||years[0]||'';
 const ids=[...new Set(selectedExamIds.filter(id=>exams.some(exam=>exam.exam_id===id&&exam.academic_year===chosenYear)))].sort();
 const key=JSON.stringify([institutionId,chosenYear,ids]),currentKey=useRef(key),generation=useRef(0);currentKey.current=key;
 const result=data?.key===key?data.result:null,busy=busyKey===key;
 const valid=/^\d{4}-\d{4}$/.test(chosenYear)&&Number(chosenYear.slice(5))===Number(chosenYear.slice(0,4))+1;
 const load=async()=>{const requestKey=key,attempt=++generation.current;setBusyKey(requestKey);setError(null);setData(null);
  try{const result=await api<any>('/api/reporting/institution/frozen-summary'+qs({institutionId,academicYear:chosenYear,examIds:ids.join(',')}));if(currentKey.current===requestKey&&generation.current===attempt)setData({key:requestKey,result});}
  catch(e:any){if(currentKey.current===requestKey&&generation.current===attempt)setError({key:requestKey,message:e.message||'Kurum özeti hazırlanamadı.'});}
  finally{if(currentKey.current===requestKey&&generation.current===attempt)setBusyKey('');}
 };
 return <section className="panel" style={{marginBottom:20}} aria-label="Kurum sınıf özeti"><div className="panel-head"><div><h2>Seçili sınavların kurum ve sınıf özeti</h2><p>Üstte seçili sınavların kurumunuzdaki yayınlanmış sonuçlarını sınıflara göre inceleyin. Bu bölüm öğrenci karnesinden ayrı hesaplanır.</p></div></div>
  <label>Eğitim yılı<select value={chosenYear} onChange={event=>setYear(event.target.value)}><option value="">Yıl seçin</option>{years.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
  <p>{ids.length} sınav seçili · Yalnız yayınlanmış, bu eğitim yılına ait sonuçlar kullanılır.</p>
  <button className="secondary" disabled={busy||!institutionId||!valid||!ids.length||ids.length>20} onClick={()=>void load()}>{busy?'Hazırlanıyor…':'Kurum Özetini Hazırla'}</button>
  {error?.key===key&&<div className="alert error" role="alert">{error.message}</div>}
  {result&&<><p>{result.message}</p><div style={{overflowX:'auto'}}><table><thead><tr><th>Sınav</th><th>Sınıf</th><th>Katılım</th><th>Kullanılan / eksik kanıt</th><th>Ortalama net</th><th>Doğruluk</th></tr></thead><tbody>{(result.groups||[]).map((group:any)=><tr key={JSON.stringify([group.examId,group.snapshotVersion,group.gradeLevel,group.className])}><td>{exams.find(exam=>exam.exam_id===group.examId)?.title||'Sınav'}<br/><small>Yayın sürümü {group.snapshotVersion}</small></td><td>{group.className||'Sınıf bilgisi yok'}</td><td>{group.participantCount}</td><td>{group.usableCount} / {group.unusableCount}</td><td>{group.averageNet==null?'—':Number(group.averageNet).toFixed(2)}</td><td>{group.accuracyPercent==null?'—':`%${Number(group.accuracyPercent).toFixed(1)}`}</td></tr>)}</tbody></table></div>{!result.groups?.length&&<div className="empty">Seçili sınavlarda bu kurum ve yıl için yayınlanmış rapor kanıtı bulunmuyor.</div>}</>}
 </section>;
}
