import { useEffect,useState } from 'react';
import { openTopluListe, ResultTopluListe } from '../components/ResultTopluListe';
import { CheckCircle2,FileUp,Printer,RefreshCw,ScanLine,ShieldCheck,TriangleAlert } from 'lucide-react';
import { api,ApiError } from '../api';
import { EvalTimer,seconds,useStopwatch } from '../components/EvalTimer';
import { BatchActions } from '../components/BatchActions';
import { OwnExamForm, OwnExamPublishBar } from '../components/OwnExamForm';
import './result-network-admin.css';

type Props={mode:'INSTITUTION'|'DEALER';access:any};

export function ResultOperatorWorkspace({mode,access}:Props){
 const[catalog,setCatalog]=useState<any>({institutions:[],exams:[],opticals:[]});
 const[institutionId,setInstitutionId]=useState('');
 const searchable=!!access?.canManageNetwork||mode==='DEALER';
 const[setAside,setSetAside]=useState<any[]>([]);
 const[addOptical,setAddOptical]=useState(false);
 const[addExam,setAddExam]=useState(false);
 const[opticalName,setOpticalName]=useState('');
 const[fmtFile,setFmtFile]=useState<File|null>(null);
 const[picked,setPicked]=useState<any>(null);
 const[instQuery,setInstQuery]=useState('');
 const[instOptions,setInstOptions]=useState<any[]>([]);
 const[history,setHistory]=useState<any[]>([]);
 const loadHistory=async()=>{try{const r=await api<any>(`/api/admin/result-network/operations/history?mode=${mode}`);setHistory(r.batches||[])}catch{/* history is optional */}};
 useEffect(()=>{if(!searchable)return;const q=instQuery.trim();if(q.length<2||(picked&&instQuery===pickedLabel(picked))){setInstOptions([]);return}const h=setTimeout(()=>{void api<any>(`/api/admin/result-network/operations/institutions?mode=${mode}&q=${encodeURIComponent(q)}`).then(r=>setInstOptions(r.institutions||[])).catch((e:any)=>setError(e.message))},250);return()=>clearTimeout(h)},[instQuery]);// eslint-disable-line react-hooks/exhaustive-deps
 const[examId,setExamId]=useState('');
 const[templateVersionId,setTemplateVersionId]=useState('');
 const[file,setFile]=useState<File|null>(null);
 const[preview,setPreview]=useState<any>(null);
 const[batch,setBatch]=useState<any>(null);
 const[candidateQueries,setCandidateQueries]=useState<Record<string,string>>({});
 const[candidates,setCandidates]=useState<Record<string,any[]>>({});
 const[resolving,setResolving]=useState('');
 const[reviewTab,setReviewTab]=useState<'UNMATCHED'|'ALL'>('UNMATCHED');
 const[busy,setBusy]=useState(false);
 const[error,setError]=useState('');
 const[notice,setNotice]=useState('');

 const loadCatalog=async()=>{
  const data=await api<any>(`/api/admin/result-network/operations/catalog?mode=${mode}`);
  setCatalog(data);
  if(!searchable)setInstitutionId(current=>current||data.institutions?.[0]?.id||'');
  setExamId(current=>current||data.exams?.[0]?.id||'');
  setTemplateVersionId(current=>current||data.opticals?.[0]?.id||'');
 };
 const loadBatch=async(id:string)=>setBatch(await api<any>(`/api/admin/result-network/operations/scan-batches/${id}`));
 useEffect(()=>{void loadCatalog().catch((e:any)=>setError(e.message));void loadHistory()},[]);

 const upload=async()=>{
  const target=searchable?picked:{id:institutionId};
  if(!file||!(target?.id||target?.code)||!examId||!templateVersionId)return;
  setBusy(true);setError('');setNotice('');
  const form=new FormData();
  form.append('file',file);if(target.id)form.append('institutionId',target.id);else form.append('mebCode',target.code);form.append('templateVersionId',templateVersionId);
  try{
   const result=await api<any>(`/api/admin/result-network/operations/exams/${examId}/preview-file`,{method:'POST',body:form});
   setPreview(result);setSchoolOk(false);setSkipBooklet(false);await loadBatch(result.batchId);void loadHistory();
  }catch(e){
   if(e instanceof ApiError){setError(e.message);const details=e.details as any;if(details?.templates&&!templateVersionId)setCatalog((x:any)=>({...x,opticals:details.templates}))}
   else setError('Dosya okunamadı.');
  }finally{setBusy(false)}
 };
 const resolveRecord=async(recordId:string,action:'MATCH'|'GUEST'|'CANCEL',studentId?:string)=>{
  if(!preview?.batchId)return;
  setBusy(true);setResolving(recordId);setError('');setNotice('');
  try{
   await api(`/api/admin/result-network/operations/scan-batches/${preview.batchId}/records/${recordId}/resolve`,{method:'POST',body:JSON.stringify({action,studentId})});
   await loadBatch(preview.batchId);setCandidates(current=>({...current,[recordId]:[]}));
   setNotice(action==='MATCH'?'Öğrenci eşleştirildi.':action==='GUEST'?'Öğrenci değerlendirmeye alındı.':'Kayıt iptal edildi; değerlendirmeye alınmayacak.');
  }catch(e:any){setError(e.message)}finally{setBusy(false);setResolving('')}
 };
 const searchCandidates=async(recordId:string)=>{
  if(!preview?.batchId)return;
  const query=(candidateQueries[recordId]||'').trim();
  if(query.length<2){setError('Eşleştirme araması için en az 2 karakter girin.');return}
  setBusy(true);setError('');
  try{const result=await api<any>(`/api/admin/result-network/operations/scan-batches/${preview.batchId}/records/${recordId}/candidates?q=${encodeURIComponent(query)}`);setCandidates(current=>({...current,[recordId]:result.candidates||[]}))}
  catch(e:any){setError(e.message)}finally{setBusy(false)}
 };
 const[progress,setProgress]=useState<{done:number;total:number}|null>(null);const[schoolOk,setSchoolOk]=useState(false);const[skipBooklet,setSkipBooklet]=useState(false);const watch=useStopwatch();const[lastCount,setLastCount]=useState<{done:number;total:number}|null>(null);
 const evaluate=async()=>{
  if(!preview?.batchId)return;
  setBusy(true);setError('');setNotice('');watch.start();setLastCount(null);
  try{
   // S035: the server works in time-limited steps; keep calling until it says done and show how far it is.
   let result:any=null,aside:any[]=[];
   for(let step=0;step<500;step++){
    result=await api<any>(`/api/admin/result-network/operations/scan-batches/${preview.batchId}/evaluate`,{method:'POST'});
    if(step===0)aside=result.setAside||[];
    setProgress({done:Number(result.processed||0),total:Number(result.total||preview.total||0)});
    if(result.done!==false)break;
   }
   const ms=watch.stop();setLastCount({done:Number(result?.processed||0),total:Number(result?.total||result?.processed||preview.total||0)});
   setPreview((current:any)=>({...current,evaluated:result?.processed}));
   setSetAside(aside);
   await loadBatch(preview.batchId);void loadHistory();setNotice(`${result?.processed||preview.total||0} öğrencinin sonucu ${seconds(ms)} içinde değerlendirildi.${aside.length?` ${aside.length} satır değerlendirmeye alınmadı; nedenleri aşağıda.`:''}`);
  }catch(e:any){watch.reset();setError(`${e.message} Kaydedilen öğrenciler korunur; "Değerlendir"e yeniden basarak kalan öğrencilerle devam edebilirsiniz.`)}finally{setBusy(false);setProgress(null)}
 };
 const downloadCsv=(name:string,headers:string[],rows:any[][],preface:any[][]=[])=>{const cell=(value:any)=>`"${String(value??'').replace(/"/g,'""')}"`;const blob=new Blob(['\uFEFF'+[...preface,headers,...rows].map(row=>row.map(cell).join(';')).join('\n')],{type:'text/csv;charset=utf-8'});const href=URL.createObjectURL(blob);const a=document.createElement('a');a.href=href;a.download=name;a.click();URL.revokeObjectURL(href)};
 const saveOptical=async()=>{
  if(!opticalName.trim()||!fmtFile||!file){setError('Optik adı, FMT dosyası ve değerlendireceğiniz TXT/DAT dosyası gerekli.');return}
  setBusy(true);setError('');setNotice('');
  try{const form=new FormData();form.append('name',opticalName.trim());form.append('fmt',fmtFile);form.append('sample',file);
   const r=await api<any>(`/api/admin/result-network/operations/opticals?mode=${mode}`,{method:'POST',body:form});
   await loadCatalog();setTemplateVersionId(r.optical.id);setAddOptical(false);setFmtFile(null);setOpticalName('');
   setNotice(`"${r.optical.name}" optiği eklendi ve seçildi: dosyanızdaki ${r.recordCount} satır bu optikle okundu.`);
  }catch(e:any){setError(e.message)}finally{setBusy(false)}
 };
 const openBatch=async(row:any)=>{setBusy(true);setError('');setNotice('');setSetAside([]);setCandidates({});try{const b=await api<any>(`/api/admin/result-network/operations/scan-batches/${row.id}`);setBatch(b);setPreview({batchId:row.id,total:Number(row.total||b.records?.length||0),counts:b.counts,detection:{templateName:`${row.institution_name} · ${row.title}`,confidence:b.batch?.detection_confidence||0},checks:{school:{name:row.institution_name,code:row.institution_code,city:row.city,district:row.district}}});setSchoolOk(false);document.getElementById('result-evaluation')?.scrollIntoView({behavior:'smooth',block:'start'})}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 // D-S039 (a): a sheet with no booklet mark in a multi-booklet exam waits for the school to choose the booklet.
 const chooseBooklet=async(row:any,code:string)=>{setBusy(true);setError('');try{await api(`/api/admin/result-network/operations/scan-batches/${preview.batchId}/records/${row.id}/resolve`,{method:'POST',body:JSON.stringify({action:'BOOKLET',bookletCode:code})});await loadBatch(preview.batchId)}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 const reset=()=>{setSetAside([]);setFile(null);setPreview(null);setBatch(null);setCandidates({});setCandidateQueries({});setError('');setNotice('')};
 const pendingRows=(batch?.records||[]).filter((row:any)=>row.resolution_status!=='CANCELLED'&&row.resolution_status!=='RESOLVED'&&(['NEW_GUEST','AMBIGUOUS','INVALID'].includes(row.match_status)||(row.issues||[]).length>0));
 const bookletRows=pendingRows.filter((row:any)=>(row.bookletOptions||[]).length>0);
 const reviewRows=reviewTab==='UNMATCHED'?pendingRows.filter((row:any)=>['NEW_GUEST','AMBIGUOUS','INVALID'].includes(row.match_status)):pendingRows;
 const ready=batch?.batch?.status==='READY'||batch?.batch?.status==='COMMITTED';

 return <section className="panel result-operator-workspace" style={{marginTop:18}}>
  <div className="panel-head"><div><span className="eyebrow">{mode==='DEALER'?'Bayi kapsamlı işlem':'Kurum işlemi'}</span><h2>Sınav değerlendirme merkezi</h2><p>Sınav, optik ve kurumu seçin; DAT/TXT/CSV dosyasını kontrol ederek güvenli biçimde değerlendirin.</p></div><ScanLine/></div>
  {access?.dealer&&<div className="alert info"><ShieldCheck/> {access.dealer.displayName||'Bayi'} · {access.dealer.scopeCount} aktif yetki kapsamı</div>}
  {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}
  {!preview?<div>
   <div className="form-grid">
    <label>1 · Sınav<select value={examId} onChange={e=>setExamId(e.target.value)}><option value="">Sınav seçin</option>{catalog.exams.map((exam:any)=><option key={exam.id} value={exam.id}>{exam.academic_year} · {exam.publisher_name?`${exam.publisher_name} · `:''}{exam.title}{exam.own_kind?' · kendi sınavı':''}</option>)}</select>{!access?.canManageNetwork&&<button type="button" className="link-button result-add-optical" onClick={()=>setAddExam(v=>!v)}>{addExam?'Vazgeç':'Sınav listede yok mu? Kendi sınavını ekle'}</button>}</label>
    <label>2 · Optik / FMT<select value={templateVersionId} onChange={e=>setTemplateVersionId(e.target.value)}><option value="">Optik seçin</option>{catalog.opticals.map((optical:any)=><option key={optical.id} value={optical.id}>{optical.name} · {optical.version}</option>)}</select><button type="button" className="link-button result-add-optical" onClick={()=>setAddOptical(v=>!v)}>{addOptical?'Vazgeç':'Optik listede yok mu? Optik ekle'}</button></label>
    {searchable?<label className="result-institution-picker">3 · Kurum<input value={instQuery} placeholder="Kurum adı veya MEB kodu yazın" onChange={e=>{setInstQuery(e.target.value);setPicked(null)}}/>{picked&&<small className="field-help">Seçildi: {pickedLabel(picked)}</small>}{!picked&&instOptions.length>0&&<div className="institution-options">{instOptions.map((x:any)=><button type="button" key={x.code} onClick={()=>{setPicked(x);setInstQuery(pickedLabel(x));setInstOptions([])}}><strong>{x.name}</strong><span>{x.city} · {x.district} · {x.code}</span></button>)}</div>}{!picked&&instQuery.trim().length>=2&&!instOptions.length&&<small className="field-help">Yetkiniz içinde eşleşen kurum yok.</small>}</label>
    :<label>3 · Kurum<select value={institutionId} onChange={e=>setInstitutionId(e.target.value)}><option value="">Kurum seçin</option>{catalog.institutions.map((institution:any)=><option key={institution.id} value={institution.id}>{institution.name} · {institution.code} · {institution.city}/{institution.district}</option>)}</select></label>}
    <label>4 · Veri dosyası<input type="file" accept=".dat,.txt,.csv,text/plain,text/csv" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
   </div>
   {(()=>{const sel=catalog.exams.find((e:any)=>e.id===examId);return sel?.own_kind?<OwnExamPublishBar examId={examId} refreshKey={history.length}/>:null})()}
   {addExam&&<OwnExamForm mode={mode} onCancel={()=>setAddExam(false)} onCreated={async(exam)=>{setAddExam(false);await loadCatalog();setExamId(exam.id);setNotice(`"${exam.title}" sınavı eklendi ve seçildi. Şimdi optiği, kurumu ve veri dosyasını seçin.`)}}/>}
   {addOptical&&<div className="panel result-optical-add"><h3>Optik ekle</h3><p>Optiğin adını ve FMT dosyasını verin. Sistem FMT'yi, 4. adımda seçtiğiniz TXT/DAT dosyasıyla dener; okuyabiliyorsa optiği kaydedip seçer.{access?.canManageNetwork?'':mode==='DEALER'?' Optik yalnız sizin ve size kayıtlı kurumların listesinde görünür.':' Optik yalnız kurumunuzun listesinde görünür.'}</p><div className="form-grid"><label>Optik adı<input value={opticalName} onChange={e=>setOpticalName(e.target.value)} placeholder="ör. 4K Yayınları TYT optiği"/></label><label>FMT dosyası<input type="file" accept=".fmt,.FMT,.txt" onChange={e=>setFmtFile(e.target.files?.[0]||null)}/></label></div>{!file&&<small className="field-help">Önce 4. adımda değerlendireceğiniz TXT/DAT dosyasını seçin.</small>}<button className="primary" type="button" disabled={busy||!opticalName.trim()||!fmtFile||!file||!access?.canManageNetwork} onClick={()=>void saveOptical()}>{busy?'Deneniyor…':'Optiği dene ve kaydet'}</button></div>}
   {!catalog.exams.length&&<div className="alert warning"><TriangleAlert/> Değerlendirmeye açık sınav yok. Merkezi sınavlar hazır olunca burada kendiliğinden görünür; kendi sınavınızı "Kendi sınavını ekle" ile ekleyebilirsiniz.</div>}
   {!catalog.opticals.length&&<div className="alert warning"><TriangleAlert/> Kayıtlı optik yok. "Optik ekle" ile FMT dosyasını yükleyin.</div>}
   <button className="primary huge" disabled={busy||!file||!(searchable?picked:institutionId)||!examId||!templateVersionId} onClick={()=>void upload()}><FileUp/> {busy?'Dosya okunuyor…':'Dosyayı yükle ve kontrol et'}</button>
  </div>:<>
   {(()=>{const out=pendingRows.length+(batch?.records||[]).filter((r:any)=>r.resolution_status==='CANCELLED').length;const committed=batch?.batch?.status==='COMMITTED';return <div className="summary-strip"><Summary label="Okunan satır" value={preview.total}/><Summary label={committed?'Değerlendirilen':'Değerlendirilecek'} value={Math.max(0,Number(preview.total||0)-out)}/><Summary label="Değerlendirme dışı" value={out} warn/></div>})()}
   <div className="panel-head"><div><h3>5 · Kontrol</h3><p>{preview.detection?.templateName} · optik tanıma %{Math.round(Number(preview.detection?.confidence||0)*100)}</p></div><button className="ghost" onClick={reset}><RefreshCw/> Yeni dosya</button></div>
   {batch?.batch?.status!=='COMMITTED'&&(pendingRows.length?<div className="alert warning"><TriangleAlert/><div><strong>{pendingRows.length} satır değerlendirmeye alınmayacak.</strong> Diğer {Math.max(0,Number(preview.total||0)-pendingRows.length)} öğrenci değerlendirilir. Bu satırları düzeltmek için TXT dosyasını düzeltip ayrıca yükleyin.<ul className="result-setaside-list">{pendingRows.map((row:any)=><li key={row.id}><strong>Satır {row.row_no}{row.canonical?.name?` · ${row.canonical.name}`:''}</strong>: {(row.issues||[]).join(' · ')||(row.match_status==='AMBIGUOUS'?'Aynı ada sahip birden fazla kayıtlı öğrenci var.':'Ad soyad okunamadı.')}</li>)}</ul></div></div>:<div className="alert success"><CheckCircle2/> Bütün satırlar okundu; değerlendirmeye hazır.</div>)}
   {batch?.batch?.status!=='COMMITTED'&&bookletRows.length>0&&<div className="booklet-pick" role="group" aria-labelledby="bp-t"><h4 id="bp-t">Kitapçığı işaretlenmemiş {bookletRows.length} öğrenci</h4><p>Bu sınavda birden çok kitapçık var. Öğrencinin kitapçığını seçin; her seçenekte o kitapçıkla çıkacak net yazıyor. Genelde neti belirgin yüksek olan doğrudur, emin değilseniz öğrencinin kitapçığına bakın.</p>
    <ul>{bookletRows.map((row:any)=><li key={row.id}><span className="bp-who"><b>{row.canonical?.name||'Ad okunamadı'}</b><small>No {row.canonical?.student_number||'—'} · Satır {row.row_no}</small></span><span className="bp-opts">{(row.bookletOptions||[]).map((o:any)=><button key={o.code} type="button" className="secondary" disabled={busy||!o.available} onClick={()=>void chooseBooklet(row,o.code)}>Kitapçık {o.code}<small>{o.net==null?'—':`net ${Number(o.net).toLocaleString('tr-TR',{maximumFractionDigits:2})}`}</small></button>)}</span></li>)}</ul>
    <label className="uc-confirm"><input type="checkbox" checked={skipBooklet} onChange={e=>setSkipBooklet(e.target.checked)}/> Seçmeden devam et; bu öğrenciler değerlendirmeye alınmasın.</label></div>}
   {batch?.batch?.status!=='COMMITTED'&&preview?.checks?.school&&(()=>{const c=preview.checks;const live=(batch?.records||[]).filter((r:any)=>r.resolution_status!=='CANCELLED');const classes=Object.entries(live.reduce((m:any,r:any)=>{const k=String(r.canonical?.class_name||(r.canonical?.grade_level?`${r.canonical.grade_level}. sınıf`:'Sınıfı yok'));m[k]=(m[k]||0)+1;return m},{})).sort((a:any,b:any)=>String(a[0]).localeCompare(String(b[0]),'tr-TR',{numeric:true}));
    return <div className="upload-check" role="group" aria-labelledby="uc-t"><h4 id="uc-t">Değerlendirmeden önce kontrol edin</h4>
     <div className="uc-school"><span>Okul</span><b>{c.school.name}</b><small>MEB {c.school.code}{c.school.district?` · ${c.school.district} / ${c.school.city}`:''}</small></div>
     <div className="uc-classes"><span>Dosyadaki öğrenciler: <b>{live.length}</b></span>{classes.slice(0,12).map(([k,v]:any)=><span key={k} className="uc-chip">{k} · {v}</span>)}</div>
     {c.sheetInstitutionCode&&!c.sheetInstitutionCode.matches&&<div className="alert warning"><TriangleAlert/><div>Formlardaki <b>kurum kodu {c.sheetInstitutionCode.code}</b> ({c.sheetInstitutionCode.sheets} form), seçtiğiniz okulun kodu <b>{c.school?.code}</b> ile aynı değil. Dosya başka bir okula ait olabilir; okulu kontrol edin.</div></div>}
     {Number(c.sameSchoolNumbers||0)>0&&<div className="alert warning"><TriangleAlert/><div>Bu okulda bu sınavda zaten değerlendirilmiş <b>{c.sameSchoolNumbers}</b> öğrenci numarası bu dosyada da var. İki oturumlu sınavın (ör. LGS sözel ve sayısal) ikinci optiğiyse sorun yok. Değilse aynı öğrencileri ikinci kez yüklüyor olabilirsiniz; o zaman bu yüklemeyi aşağıdan silin.</div></div>}
     {!!c.otherSchools?.length&&<div className="alert info"><div>Bu dosyadaki bazı öğrenci numaraları bu sınavda başka okullarda da var: {c.otherSchools.map((o:any)=>`${o.name} (${o.numbers})`).join(', ')}. Öğrenci hem okulda hem kursta olabilir; okul doğruysa devam edin.</div></div>}
     {!!c.sameFileElsewhere?.length&&<div className="alert info"><div>Aynı dosya bu sınavda şu okul(lar)a da yüklendi: {c.sameFileElsewhere.map((o:any)=>`${o.name} (${o.code})`).join(', ')}. Bilerek yapıyorsanız sorun yok.</div></div>}
     <label className="uc-confirm"><input type="checkbox" checked={schoolOk} onChange={e=>setSchoolOk(e.target.checked)}/> Evet, bu dosya <b>{c.school.name}</b> öğrencilerine ait.</label>
    </div>})()}
   <EvalTimer watch={watch} done={progress?.done??lastCount?.done} total={progress?.total||lastCount?.total||undefined}/>
   {batch?.batch?.status!=='COMMITTED'&&<button className="primary huge" disabled={busy||Number(preview.total||0)-pendingRows.length<=0||(!!preview?.checks?.school&&!schoolOk)||(bookletRows.length>0&&!skipBooklet)} title={bookletRows.length>0&&!skipBooklet?'Önce kitapçığı işaretlenmemiş öğrencilerin kitapçığını seçin.':preview?.checks?.school&&!schoolOk?'Önce okulun doğru olduğunu onaylayın.':''} onClick={()=>void evaluate()}><ScanLine/> {busy?(progress&&progress.total?`Değerlendiriliyor… ${progress.done} / ${progress.total} öğrenci`:'Değerlendiriliyor…'):'6 · Değerlendir'}</button>}
   {setAside.length>0&&<div className="alert warning"><TriangleAlert/><div><strong>Değerlendirmeye alınmayan {setAside.length} satır:</strong><ul className="result-setaside-list">{setAside.map((x:any)=><li key={x.row}><strong>Satır {x.row}{x.name?` · ${x.name}`:''}</strong>: {x.reason}</li>)}</ul></div></div>}
   {batch?.batch?.status==='COMMITTED'&&<><div className="success-box"><CheckCircle2/><div><strong>Değerlendirme tamamlandı</strong><span>{preview.evaluated||preview.total} öğrencinin sonucu işlendi. Sonuçlar yayınlandığında öğrenciler sonuc.anunex.com'da il, ilçe, kurum, sınıf, numara ve adlarının ilk 3 harfiyle görür; kart ya da kod gerekmez.</span></div></div><div className="result-completion-actions"><button className="primary" onClick={()=>openTopluListe(examId||batch?.batch?.exam_id,batch?.batch?.institution_id)}><Printer/> Raporlara git (Toplu Liste)</button></div></>}
  </>}
  <div id="result-evaluation-history" className="result-history"><div className="panel-head"><div><h3>Değerlendirme geçmişi</h3><p>Önceki değerlendirmeyi açarak kontrole, değerlendirmeye ve raporlara dönebilirsiniz.</p></div><button className="ghost" type="button" onClick={()=>void loadHistory()}><RefreshCw/> Yenile</button></div>
   {!history.length?<p className="empty">Henüz değerlendirme yok.</p>:<div className="table-card"><table><thead><tr><th>Tarih</th><th>Sınav</th><th>Kurum</th><th>Kayıt</th><th>Durum</th><th></th></tr></thead><tbody>{history.map((x:any)=><tr key={x.id}><td>{new Date(String(x.created_at).replace(' ','T')+'Z').toLocaleString('tr-TR')}</td><td>{x.academic_year} · {x.title}</td><td>{x.institution_name}<small> {x.institution_code} · {x.city}/{x.district}</small></td><td>{Number(x.total||0).toLocaleString('tr-TR')}</td><td>{x.deleted_at?'Silindi':(BATCH_STATUS[x.status]||x.status)}</td><td className="result-history-actions">{!x.deleted_at&&<button className="secondary" type="button" disabled={busy} onClick={()=>x.status==='COMMITTED'?openTopluListe(x.exam_id,x.institution_id):void openBatch(x)}>{x.status==='COMMITTED'?'Raporlar':'Devam et'}</button>}<BatchActions row={x} mode={mode} canMove={!!access?.canManageNetwork||mode==='DEALER'} onChanged={(m)=>{setNotice(m);if(preview?.batchId===x.id)reset();void loadHistory()}}/></td></tr>)}</tbody></table></div>}
  </div>
 </section>;
}
const BATCH_STATUS:Record<string,string>={PREVIEW:'Önizleme',NEEDS_REVIEW:'Kontrol bekliyor',READY:'Değerlendirmeye hazır',COMMITTED:'Değerlendirildi',FAILED:'Hatalı'};
function pickedLabel(x:any){return `${x.name} · ${x.code} · ${x.city}/${x.district}`}

function Summary({label,value,warn}:{label:string;value:number;warn?:boolean}){return <div className={warn&&value?'summary warn':'summary'}><span>{label}</span><strong>{value||0}</strong></div>}

/** S033: Raporlar = Toplu Liste (reports only from saved results; nothing is evaluated again). */
export function ResultReportsPanel({mode}:{mode:'INSTITUTION'|'DEALER'}){return <ResultTopluListe mode={mode}/>}
