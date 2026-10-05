import {useRef,useState} from 'react';
import {api,qs} from '../api';

export function CohortRubricSummary({institutionId,academicYear,classId}:{institutionId:string;academicYear:string;classId?:string}){
 const [policy,setPolicy]=useState('LATEST'),[fromDate,setFromDate]=useState(''),[toDate,setToDate]=useState('');
 const [data,setData]=useState<any>(null),[error,setError]=useState<any>(null),[busy,setBusy]=useState('');
 const scope=JSON.stringify([institutionId,academicYear,classId,policy,fromDate,toDate]),current=useRef(scope),generation=useRef(0);current.current=scope;
 const result=data?.scope===scope?data.result:null;
 const load=async()=>{const requested=scope,attempt=++generation.current;setBusy(requested);setData(null);setError(null);try{const result=await api<any>((classId?'/api/reporting/guidance':'/api/reporting/institution')+'/frozen-rubric-summary'+qs({institutionId,classId,academicYear,observationPolicy:policy,fromDate:fromDate||null,toDate:toDate||null}));if(current.current===requested&&generation.current===attempt)setData({scope:requested,result})}catch(e:any){if(current.current===requested&&generation.current===attempt)setError({scope:requested,message:e.message})}finally{if(generation.current===attempt)setBusy('')}};
 return <section className="panel" style={{marginTop:20}}><h3>Rubrik ölçütlerinin gözlenen düzey dağılımı</h3><p>Öğretmen gözlemleri, rubrik sürümü ve ölçüt bazında ayrı gösterilir. Sınav doğruluğuyla birleştirilmez. Geri çekilmiş gözlemler kullanılmaz.</p>
  <div className="form-grid"><label>Gözlem politikası<select value={policy} onChange={e=>setPolicy(e.target.value)}><option value="LATEST">Her dönem kaydı ve rubrik sürümünün son geçerli gözlemi</option><option value="ALL">Tüm geçerli gözlemler</option></select></label><label>Başlangıç<input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/></label><label>Bitiş<input type="date" value={toDate} onChange={e=>setToDate(e.target.value)}/></label></div>
  <button className="secondary" disabled={busy===scope||!institutionId||!/^\d{4}-\d{4}$/.test(academicYear)||Boolean(fromDate)!==Boolean(toDate)} onClick={()=>void load()}>{busy===scope?'Hazırlanıyor…':'Rubrik dağılımını hazırla'}</button>
  {error?.scope===scope&&<div className="alert error">{error.message}</div>}
  {result&&<><p>{result.message}</p><p>{result.coverage.usedObservations} kullanılan gözlem · {result.coverage.excludedObservations} geçersiz kayıt · {result.coverage.repeatedObservations} önceki gözlem</p>
   {result.groups.map((g:any)=><article className="panel" key={JSON.stringify([g.classId,g.rubricId,g.curriculumVersionId,g.criterionId])}><h4>{g.className||'Sınıf belirtilmedi'} · {g.rubricTitle} · {g.versionLabel}</h4><p>{g.sourceKind==='OFFICIAL'?'Resmî doküman rubriği':'Öğretmen tasarımı rubrik'} · {g.outcomeCode} · {g.componentCode}</p><strong>{g.criterionTitle}</strong><p>{g.criterionDescription}</p><p>{g.participatingEnrollmentCount} katılan dönem kaydı · {g.observationCount} ölçüt gözlemi</p><div style={{overflowX:'auto'}}><table><thead><tr><th>Gözlenen düzey</th><th>Davranış tanımı</th><th>Gözlem</th><th>Dağılım</th></tr></thead><tbody>{g.levels.map((l:any)=><tr key={l.id}><td>{l.label}</td><td>{l.description}</td><td>{l.count}</td><td>{l.percent==null?'—':`%${l.percent.toFixed(1)}`}</td></tr>)}</tbody></table></div></article>)}
   {!result.groups.length&&<p>Bu kapsamda yayımlanmış geçerli rubrik gözlemi yok.</p>}
  </>}
 </section>;
}
