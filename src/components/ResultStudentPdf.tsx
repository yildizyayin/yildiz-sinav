import {useEffect,useRef,useState} from 'react';
import {Download} from 'lucide-react';
import {api} from '../api';
import {downloadPagesAsPdf,pdfFileName} from '../lib/downloadPdf';
import {AnunexBrand} from './AnunexBrand';
import {NibiruMark} from './NibiruMark';
import {resultGroups,resultValue,outcomeNumber} from './result-student-model';
import '../pages/result-student-pdf.css';

type Report={student:any;exam:any;detail:any};
const chunks=<T,>(items:T[],size:number)=>Array.from({length:Math.ceil(items.length/size)},(_,i)=>items.slice(i*size,(i+1)*size));
/** Conservative layout-only pagination; long labels continue on a new row, never silently disappear. */
export function outcomePages(outcomes:any[]){
 const pages:any[][]=[];let page:any[]=[],height=0;
 for(const o of outcomes){const title=String(o.outcome||o.title||''),pieces=title.match(/[\s\S]{1,700}/g)||[''];
  for(const [part,text] of pieces.entries()){
   const cost=70+Math.ceil(text.length/42)*18;
   if(page.length&&height+cost>660){pages.push(page);page=[];height=0;}
   page.push({...o,reportTitle:text,continued:part>0});height+=cost;
  }
 }
 if(page.length)pages.push(page);return pages;
}
export function StudentReportPages({report}:{report:Report}){
 const {student,exam,detail}=report;
 const groups=resultGroups(detail.subjects||[],exam.exam_type);
 const rows=groups.flatMap(g=>[{title:g.title,row:g.parent,child:false},...g.children.map(c=>({title:c.title,row:c.row,child:true}))]);
 for(const row of detail.optionalPhilosophy||[])rows.push({title:`Felsefe (alternatif) · ${row.booklet_code||'—'} kitapçığı`,row,child:true});
 const subjectPages=chunks(rows,18);if(!subjectPages.length)subjectPages.push([]);
 const outcomes=outcomePages(detail.outcomes||[]),count=subjectPages.length+outcomes.length;
 const heading=(index:number)=><><header className="rsp-pdf-head"><AnunexBrand/><strong>ÖĞRENCİ SONUÇ KARNESİ</strong></header><div className="rsp-pdf-identity"><div><h1>{student.name}</h1><p>{student.institution} · {student.gradeLevel}. sınıf</p></div><div><h2>{exam.title}</h2><p>{exam.academic_year} · {exam.exam_type} · {exam.exam_date||'Tarih yok'}</p></div></div><footer className="rsp-pdf-footer"><span>{exam.title}</span><span>{index+1} / {count}</span></footer></>;
 return <>{subjectPages.map((part,index)=><article className="rx-page rsp-pdf-page" key={`subjects-${index}`}><div className="rsp-pdf-sheet">
  {heading(index)}
  {index===0&&<div className="rsp-pdf-metrics">{[[exam.score,'Puan'],[exam.net,'Toplam net'],[exam.correct_count,'Doğru'],[exam.wrong_count,'Yanlış'],[exam.blank_count,'Boş']].map(([v,label])=><div key={String(label)}><strong>{resultValue(v)}</strong><span>{label}</span></div>)}</div>}
  {index===0&&exam.score==null&&<p className="rsp-pdf-note">Puan henüz yayımlanmadı.</p>}
  <h3>Ders ve alt ders sonuçları{index?' · devam':''}</h3><table className="rsp-pdf-table"><thead><tr><th>Ders / Alt ders</th><th>Doğru</th><th>Yanlış</th><th>Boş</th><th>Net</th></tr></thead><tbody>{part.map((r,i)=><tr className={r.child?'rsp-pdf-child':'rsp-pdf-parent'} key={i}><td>{r.title}</td><td>{resultValue(r.row?.correct_count)}</td><td>{resultValue(r.row?.wrong_count)}</td><td>{resultValue(r.row?.blank_count)}</td><td>{resultValue(r.row?.net)}</td></tr>)}</tbody></table>
  {index===subjectPages.length-1&&<><p className="rsp-pdf-note">Ana test toplamları ile alt dersler yeniden toplanmaz. Eksik veri — olarak gösterilir.</p>{!outcomes.length&&<section><h3>Konu / kazanım özeti</h3><p>{detail.outcomesStatus==='NOT_VERIFIED'?'Kazanım eşleştirmesi doğrulanmış müfredata bağlı olmadığı için gösterilmiyor.':'Bu sınav için yayımlanmış kazanım verisi yok.'}</p></section>}<div className="rsp-pdf-nibiru"><NibiruMark size={40}/><div><strong>Nibiru ile bir sonraki adım</strong><p>Yanlış ve boşlarını ders bazında inceleyebilirsin.</p></div></div></>}
 </div></article>)}
 {outcomes.map((part,j)=><article className="rx-page rsp-pdf-page" key={`outcomes-${j}`}><div className="rsp-pdf-sheet">{heading(subjectPages.length+j)}<h3>Konu ve kazanım analizi{j?' · devam':''}</h3>{part.map((o,i)=><section className="rsp-pdf-outcome" key={i}><small>{o.subject_name}{o.code?` · ${o.code}`:''}{o.continued?' · devam':''}</small><h4>{o.reportTitle}</h4><p>Doğru: {resultValue(outcomeNumber(o,'correct_count'))} · Yanlış: {resultValue(outcomeNumber(o,'wrong_count'))} · Boş: {resultValue(outcomeNumber(o,'blank_count'))} · Kanıt: {resultValue(outcomeNumber(o,'evidence_count'))}</p></section>)}{j===outcomes.length-1&&detail.outcomesTruncated&&<p className="rsp-pdf-note">Sunucu bu kaydın kazanım listesini sınırladı. Tam liste için kurumunuzla iletişime geçin.</p>}</div></article>)}
 </>;
}
export function ResultStudentPdf({result,detail,disabled=false}:{result:any;detail:any;disabled?:boolean}){
 const [report,setReport]=useState<Report|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const ref=useRef<HTMLDivElement>(null),active=useRef(true),locked=useRef(false);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const download=async()=>{
  if(locked.current)return;locked.current=true;setBusy(true);setError('');
  try{
   const selected=detail?.exam||result.exams?.[0];if(!selected)throw Error('Önce yayımlanmış bir sınav seçin.');
   const id=selected.exam_id||selected.id;
   const data=detail||await api<any>(`/api/public/results/exams/${encodeURIComponent(id)}`);
   if(!active.current)return;
   // Never pull live institutional scores into this published student report.
   const summary=result.exams.find((x:any)=>x.exam_id===id)||{};
   setReport({student:result.student,exam:{...summary,...data.exam},detail:data});
   await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
   if(!active.current||!ref.current)return;
   await document.fonts.ready;
   const pages=await downloadPagesAsPdf(ref.current,pdfFileName(`anunex-${data.exam?.title||selected.title}-ogrenci-karnesi`));
   if(!pages)throw Error('Karne sayfaları hazırlanamadı.');
  }catch(e){if(active.current)setError(e instanceof Error?e.message:'Karne indirilemedi. Lütfen tekrar deneyin.');}
  finally{locked.current=false;if(active.current)setBusy(false);}
 };
 return <><button type="button" disabled={disabled||busy||!result.exams?.length} aria-busy={busy} data-busy={busy} onClick={()=>void download()}><Download aria-hidden="true"/> {busy?'Karne hazırlanıyor…':'Sonuç karnesi'}</button>{error&&<p className="alert error rsp-pdf-error" role="alert">{error}</p>}<div className="rsp-pdf-source" aria-hidden="true" ref={ref}>{report&&<StudentReportPages report={report}/>}</div></>;
}
