import {CohortRubricSummary} from './CohortRubricSummary';
import {CohortLearningSummary} from './CohortLearningSummary';
import {useRef,useState} from 'react';
import {api,qs} from '../api';

export function InstitutionFrozenReport({institutionId,classScope}:{institutionId:string;classScope?:{id:string;academicYear:string;name:string}}){
 const [year,setYear]=useState(classScope?.academicYear||''),[data,setData]=useState<any>(null),[busyKey,setBusyKey]=useState(''),[error,setError]=useState<{key:string;message:string}|null>(null);
 const [list,setList]=useState<{scope:string;rows:any[];cursor:string|null}>({scope:'',rows:[],cursor:null});
 const [selection,setSelection]=useState<{scope:string;ids:string[]}>({scope:'',ids:[]});
 const [listBusy,setListBusy]=useState(false),[listError,setListError]=useState('');
 const prefix=classScope?'/api/reporting/guidance':'/api/reporting/institution';
 const scope=JSON.stringify([institutionId,year,classScope?.id]),scopeRef=useRef(scope),listGeneration=useRef(0);scopeRef.current=scope;
 const chosenYear=year,exams=list.scope===scope?list.rows:[],ids=selection.scope===scope?selection.ids:[];
 const loadExams=async(more=false)=>{const requested=scope,attempt=++listGeneration.current;setListBusy(true);setListError('');
  try{const result=await api<any>(prefix+'/frozen-exams'+qs({institutionId,classId:classScope?.id||null,academicYear:year||null,cursor:more&&list.scope===scope?list.cursor:null}));if(scopeRef.current!==requested||listGeneration.current!==attempt)return;
   const nextScope=JSON.stringify([institutionId,result.academicYear,classScope?.id]);setYear(result.academicYear);
   setList({scope:nextScope,rows:more?[...new Map([...exams,...(result.exams||[])].map(row=>[row.examId,row])).values()]:result.exams||[],cursor:result.nextCursor||null});
   if(!more)setSelection({scope:nextScope,ids:[]});
  }catch(e:any){if(scopeRef.current===requested&&listGeneration.current===attempt)setListError(e.message||'Sınav listesi alınamadı.');}
  finally{if(listGeneration.current===attempt)setListBusy(false);}
 };
 const toggle=(id:string)=>setSelection({scope,ids:ids.includes(id)?ids.filter(value=>value!==id):ids.length<20?[...ids,id]:ids});
 const key=JSON.stringify([institutionId,chosenYear,classScope?.id,ids]),currentKey=useRef(key),generation=useRef(0);currentKey.current=key;
 const result=data?.key===key?data.result:null,busy=busyKey===key;
 const valid=/^\d{4}-\d{4}$/.test(chosenYear)&&Number(chosenYear.slice(5))===Number(chosenYear.slice(0,4))+1;
 const load=async()=>{const requestKey=key,attempt=++generation.current;setBusyKey(requestKey);setError(null);setData(null);
  try{const result=await api<any>(prefix+'/frozen-summary'+qs({institutionId,classId:classScope?.id||null,academicYear:chosenYear,examIds:ids.join(',')}));if(currentKey.current===requestKey&&generation.current===attempt)setData({key:requestKey,result});}
  catch(e:any){if(currentKey.current===requestKey&&generation.current===attempt)setError({key:requestKey,message:e.message||'Kurum özeti hazırlanamadı.'});}
  finally{if(currentKey.current===requestKey&&generation.current===attempt)setBusyKey('');}
 };
 return <section className="panel" style={{marginBottom:20}} aria-label="Kurum sınıf özeti"><div className="panel-head"><div><h2>{classScope?'Rehberlik sınıf özeti · '+classScope.name:'Seçili sınavların kurum ve sınıf özeti'}</h2><p>Kurumunuzun yayınlanmış sınavlarını öğrenciden bağımsız seçerek sınıf özetlerini inceleyin. Bu bölüm öğrenci karnesinden ayrı hesaplanır.</p></div></div>
  <label>Eğitim yılı<input readOnly={Boolean(classScope)} value={year} onChange={event=>{setYear(event.target.value);setListError('')}} placeholder="İlk yüklemede aktif dönem seçilir"/></label>
  <button className="secondary" disabled={listBusy||!institutionId} onClick={()=>void loadExams()}>{listBusy?'Yükleniyor…':classScope?'Sınıfımın Sınavlarını Yükle':'Kurum Sınavlarını Yükle'}</button>
  {listError&&<div className="alert error" role="alert">{listError}</div>}
  <div className="cards-list">{exams.map(exam=><label className="list-card" key={exam.examId}><input type="checkbox" checked={ids.includes(exam.examId)} disabled={!ids.includes(exam.examId)&&ids.length>=20} onChange={()=>toggle(exam.examId)}/><div><strong>{exam.title||'Sınav'}</strong><span>{exam.examDate||'Tarih belirtilmedi'}</span></div></label>)}</div>
  {list.scope===scope&&!exams.length&&<div className="empty">Bu kurum ve yıl için yayınlanmış sınav bulunmuyor.</div>}
  {list.scope===scope&&list.cursor&&<button className="ghost" disabled={listBusy} onClick={()=>void loadExams(true)}>Diğer sınavları yükle</button>}
  <p>{ids.length} sınav seçili · Yalnız yayınlanmış, bu eğitim yılına ait sonuçlar kullanılır.</p>
  <button className="secondary" disabled={busy||!institutionId||!valid||!ids.length||ids.length>20} onClick={()=>void load()}>{busy?'Hazırlanıyor…':classScope?'Sınıf Özetini Hazırla':'Kurum Özetini Hazırla'}</button>
  {error?.key===key&&<div className="alert error" role="alert">{error.message}</div>}
  {result&&<><p>{result.message}</p><div style={{overflowX:'auto'}}><table><thead><tr><th>Sınav</th><th>Sınıf</th><th>Katılım</th><th>Kullanılan / eksik kanıt</th><th>Ortalama net</th><th>Doğruluk</th></tr></thead><tbody>{(result.groups||[]).map((group:any)=><tr key={JSON.stringify([group.examId,group.snapshotVersion,group.gradeLevel,group.className])}><td>{exams.find(exam=>exam.examId===group.examId)?.title||'Sınav'}<br/><small>Yayın sürümü {group.snapshotVersion}</small></td><td>{group.className||'Sınıf bilgisi yok'}</td><td>{group.participantCount}</td><td>{group.usableCount} / {group.unusableCount}</td><td>{group.averageNet==null?'—':Number(group.averageNet).toFixed(2)}</td><td>{group.accuracyPercent==null?'—':`%${Number(group.accuracyPercent).toFixed(1)}`}</td></tr>)}</tbody></table></div>{!result.groups?.length&&<div className="empty">Seçili sınavlarda bu kurum ve yıl için yayınlanmış rapor kanıtı bulunmuyor.</div>}</>}
  <CohortLearningSummary institutionId={institutionId} academicYear={year} examIds={ids} classId={classScope?.id}/>
  <CohortRubricSummary institutionId={institutionId} academicYear={year} classId={classScope?.id}/>
 </section>;
}
