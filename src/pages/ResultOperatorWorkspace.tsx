import { useEffect,useState } from 'react';
import { CheckCircle2,FileUp,RefreshCw,ScanLine,ShieldCheck,TriangleAlert } from 'lucide-react';
import { api,ApiError } from '../api';

type Props={mode:'INSTITUTION'|'DEALER';access:any};

export function ResultOperatorWorkspace({mode,access}:Props){
 const[catalog,setCatalog]=useState<any>({institutions:[],exams:[],opticals:[]});
 const[institutionId,setInstitutionId]=useState('');
 const[examId,setExamId]=useState('');
 const[templateVersionId,setTemplateVersionId]=useState('');
 const[file,setFile]=useState<File|null>(null);
 const[preview,setPreview]=useState<any>(null);
 const[batch,setBatch]=useState<any>(null);
 const[busy,setBusy]=useState(false);
 const[error,setError]=useState('');
 const[notice,setNotice]=useState('');

 const loadCatalog=async()=>{
  const data=await api<any>(`/api/admin/result-network/operations/catalog?mode=${mode}`);
  setCatalog(data);
  setInstitutionId(current=>current||data.institutions?.[0]?.id||'');
  setExamId(current=>current||data.exams?.[0]?.id||'');
  setTemplateVersionId(current=>current||data.opticals?.[0]?.id||'');
 };
 const loadBatch=async(id:string)=>setBatch(await api<any>(`/api/admin/result-network/operations/scan-batches/${id}`));
 useEffect(()=>{void loadCatalog().catch((e:any)=>setError(e.message))},[]);

 const upload=async()=>{
  if(!file||!institutionId||!examId||!templateVersionId)return;
  setBusy(true);setError('');setNotice('');
  const form=new FormData();
  form.append('file',file);form.append('institutionId',institutionId);form.append('templateVersionId',templateVersionId);
  try{
   const result=await api<any>(`/api/admin/result-network/operations/exams/${examId}/preview-file`,{method:'POST',body:form});
   setPreview(result);await loadBatch(result.batchId);
  }catch(e){
   if(e instanceof ApiError){setError(e.message);const details=e.details as any;if(details?.templates&&!templateVersionId)setCatalog((x:any)=>({...x,opticals:details.templates}))}
   else setError('Dosya okunamadı.');
  }finally{setBusy(false)}
 };
 const resolveGuest=async(recordId:string)=>{
  if(!preview?.batchId)return;
  setBusy(true);setError('');
  try{await api(`/api/admin/result-network/operations/scan-batches/${preview.batchId}/records/${recordId}/resolve`,{method:'POST',body:JSON.stringify({asNewGuest:true})});await loadBatch(preview.batchId)}
  catch(e:any){setError(e.message)}finally{setBusy(false)}
 };
 const evaluate=async()=>{
  if(!preview?.batchId)return;
  setBusy(true);setError('');
  try{
   const result=await api<any>(`/api/admin/result-network/operations/scan-batches/${preview.batchId}/evaluate`,{method:'POST'});
   setPreview((current:any)=>({...current,evaluated:result.processed}));
   await loadBatch(preview.batchId);setNotice(`${result.processed||preview.total||0} öğrenci sonucu değerlendirildi.`);
  }catch(e:any){setError(e.message)}finally{setBusy(false)}
 };
 const reset=()=>{setFile(null);setPreview(null);setBatch(null);setError('');setNotice('')};
 const reviewRows=(batch?.records||[]).filter((row:any)=>['AMBIGUOUS','INVALID'].includes(row.match_status)||(row.issues||[]).length>0);
 const ready=batch?.batch?.status==='READY'||batch?.batch?.status==='COMMITTED';

 return <section className="panel result-operator-workspace" style={{marginTop:18}}>
  <div className="panel-head"><div><span className="eyebrow">{mode==='DEALER'?'Bayi kapsamlı işlem':'Kurum işlemi'}</span><h2>Sınav değerlendirme merkezi</h2><p>Sınav, optik ve kurumu seçin; DAT/TXT/CSV dosyasını kontrol ederek güvenli biçimde değerlendirin.</p></div><ScanLine/></div>
  {access?.dealer&&<div className="alert info"><ShieldCheck/> {access.dealer.displayName||'Bayi'} · {access.dealer.scopeCount} aktif yetki kapsamı</div>}
  {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}
  {!preview?<div>
   <div className="form-grid">
    <label>1 · Sınav<select value={examId} onChange={e=>setExamId(e.target.value)}><option value="">Sınav seçin</option>{catalog.exams.map((exam:any)=><option key={exam.id} value={exam.id}>{exam.academic_year} · {exam.publisher_name?`${exam.publisher_name} · `:''}{exam.title}</option>)}</select></label>
    <label>2 · Optik / FMT<select value={templateVersionId} onChange={e=>setTemplateVersionId(e.target.value)}><option value="">Optik seçin</option>{catalog.opticals.map((optical:any)=><option key={optical.id} value={optical.id}>{optical.name} · {optical.version}</option>)}</select></label>
    <label>3 · Kurum<select value={institutionId} onChange={e=>setInstitutionId(e.target.value)}><option value="">Kurum seçin</option>{catalog.institutions.map((institution:any)=><option key={institution.id} value={institution.id}>{institution.name} · {institution.code} · {institution.city}/{institution.district}</option>)}</select></label>
    <label>4 · Veri dosyası<input type="file" accept=".dat,.txt,.csv,text/plain,text/csv" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
   </div>
   {!catalog.exams.length&&<div className="alert warning"><TriangleAlert/> Sonuç Ağına yayınlanmış sınav bulunmuyor. Önce Süper Admin sınavı yayınlamalıdır.</div>}
   {!catalog.opticals.length&&<div className="alert warning"><TriangleAlert/> Aktif FMT/parser tanımlı optik bulunmuyor.</div>}
   <button className="primary huge" disabled={busy||!file||!institutionId||!examId||!templateVersionId} onClick={()=>void upload()}><FileUp/> {busy?'Dosya okunuyor…':'Dosyayı yükle ve kontrol et'}</button>
  </div>:<>
   <div className="summary-strip"><Summary label="Toplam" value={preview.total}/><Summary label="Aktif eşleşti" value={preview.counts?.active}/><Summary label="Bilinen misafir" value={preview.counts?.guest}/><Summary label="Yeni misafir" value={preview.counts?.newGuest}/><Summary label="Kontrol" value={reviewRows.length} warn/></div>
   <div className="panel-head"><div><h3>5 · Eşleşme kontrolü</h3><p>{preview.detection?.templateName} · algılama güveni %{Math.round(Number(preview.detection?.confidence||0)*100)}</p></div><button className="ghost" onClick={reset}><RefreshCw/> Yeni dosya</button></div>
   {reviewRows.map((row:any)=><div className="issue-row" key={row.id}><div><strong>{row.canonical?.name||`Satır ${row.row_no}`}</strong><span>{(row.issues||[]).join(' · ')||row.match_status}</span></div>{['AMBIGUOUS','INVALID'].includes(row.match_status)&&<button className="secondary" disabled={busy} onClick={()=>void resolveGuest(row.id)}>Misafir öğrenci olarak kabul et</button>}</div>)}
   {batch?.batch?.status==='NEEDS_REVIEW'&&<div className="alert warning"><TriangleAlert/> Sorunlu satırlar çözülmeden değerlendirme başlatılmaz.</div>}
   {batch?.batch?.status!=='COMMITTED'&&<button className="primary huge" disabled={busy||!ready} onClick={()=>void evaluate()}><ScanLine/> {busy?'Değerlendiriliyor…':'6 · Sınavı değerlendir'}</button>}
   {batch?.batch?.status==='COMMITTED'&&<div className="success-box"><CheckCircle2/><div><strong>Değerlendirme tamamlandı</strong><span>{preview.evaluated||preview.total} katılımcının sonucu işlendi. Sonuç erişimi ve rapor yayınlama bir sonraki kontrollü adımdır.</span></div></div>}
  </>}
 </section>;
}

function Summary({label,value,warn}:{label:string;value:number;warn?:boolean}){return <div className={warn&&value?'summary warn':'summary'}><span>{label}</span><strong>{value||0}</strong></div>}
