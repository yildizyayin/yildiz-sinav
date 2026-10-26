import { reportSource } from '../lib/resultReportSource';
import { collectAccessCodePages } from '../lib/access-code-pages';
import { useEffect,useState } from 'react';
import { Ban,CheckCircle2,Download,FileKey2,FileUp,Printer,RefreshCw,ScanLine,Search,ShieldCheck,TriangleAlert,UserCheck,UserX } from 'lucide-react';
import { api,ApiError } from '../api';
import './result-network-admin.css';

type Props={mode:'INSTITUTION'|'DEALER';access:any};

export function ResultOperatorWorkspace({mode,access}:Props){
 const[catalog,setCatalog]=useState<any>({institutions:[],exams:[],opticals:[]});
 const[institutionId,setInstitutionId]=useState('');
 const searchable=!!access?.canManageNetwork||mode==='DEALER';
 const[setAside,setSetAside]=useState<any[]>([]);
 const[karnes,setKarnes]=useState<any>(null);
 const[addOptical,setAddOptical]=useState(false);
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
 const[report,setReport]=useState<any>(null);
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
   setPreview(result);await loadBatch(result.batchId);void loadHistory();
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
   setNotice(action==='MATCH'?'Öğrenci eşleştirildi.':action==='GUEST'?'Kayıt misafir öğrenci olarak işaretlendi.':'Kayıt iptal edildi; değerlendirmeye alınmayacak.');
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
 const evaluate=async()=>{
  if(!preview?.batchId)return;
  setBusy(true);setError('');
  try{
   const result=await api<any>(`/api/admin/result-network/operations/scan-batches/${preview.batchId}/evaluate`,{method:'POST'});
   setPreview((current:any)=>({...current,evaluated:result.processed}));
   setSetAside(result.setAside||[]);
   await loadBatch(preview.batchId);void loadHistory();setNotice(`${result.processed||preview.total||0} öğrencinin sonucu değerlendirildi.${result.setAside?.length?` ${result.setAside.length} satır değerlendirmeye alınmadı; nedenleri aşağıda.`:''}`);
  }catch(e:any){setError(e.message)}finally{setBusy(false)}
 };
 const downloadCsv=(name:string,headers:string[],rows:any[][],preface:any[][]=[])=>{const cell=(value:any)=>`"${String(value??'').replace(/"/g,'""')}"`;const blob=new Blob(['\uFEFF'+[...preface,headers,...rows].map(row=>row.map(cell).join(';')).join('\n')],{type:'text/csv;charset=utf-8'});const href=URL.createObjectURL(blob);const a=document.createElement('a');a.href=href;a.download=name;a.click();URL.revokeObjectURL(href)};
 const generateAccessCodes=async()=>{
  if(!preview?.batchId)return;setBusy(true);setError('');setNotice('');
  try{
   const result=await collectAccessCodePages(cursor=>api<any>(`/api/admin/result-network/operations/scan-batches/${preview.batchId}/access-codes${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`,{method:'POST'}));
   if(result.codes.length){downloadCsv('anunex-ogrenci-erisim-kartlari.csv',['Öğrenci No','Ad Soyad','Sınıf','Erişim Kodu','Geçerlilik'],result.codes.map(x=>[x.studentNumber,x.fullName,x.gradeLevel,x.accessCode,x.expiresAt]));setNotice(result.error?`${result.codes.length} erişim kartı kaydedildi ve indirildi. Kalan öğrenciler için işlemi tekrar başlatın; bu dosyayı saklayın.`:`${result.codes.length} öğrenci erişim kartı üretildi. Kodlar güvenlik gereği yalnız bu indirmede gösterilir.`)}
   else if(!result.error)setNotice('Bu değerlendirmedeki erişim kartları daha önce oluşturulmuş. Mevcut kodlar güvenlik gereği tekrar gösterilmez.');
   if(result.error)setError(result.error.message);
  }catch(e:any){setError(e.message)}finally{setBusy(false)}
 };
 const loadReport=async()=>{if(!preview?.batchId)return;setBusy(true);setError('');try{setReport(await api(`/api/admin/result-network/operations/scan-batches/${preview.batchId}/report`))}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 const exportReport=()=>{const rows=report?.rows||[];const src=reportSource(report);downloadCsv(`anunex-kurum-sonuc-listesi${src.fileSuffix}.csv`,['Öğrenci No','Ad Soyad','Sınıf/Şube','Doğru','Yanlış','Boş','Net','Puan','Şube Sırası','Sınıf Düzeyi Sırası','Kurum Sırası','Kurum Ağı Sırası','İlçe Sırası','İl Sırası','Türkiye Sırası'],rows.map((x:any)=>[x.student_number_snapshot,x.name_snapshot,x.class_snapshot,x.correct_count,x.wrong_count,x.blank_count,x.net,x.score,rank(x.class_rank,x.class_count),rank(x.grade_rank,x.grade_count),rank(x.institution_rank,x.institution_count),rank(x.network_rank,x.network_count),rank(x.district_rank,x.district_count),rank(x.city_rank,x.city_count),rank(x.national_rank,x.national_count)]),[['Kaynak',src.label]])};
 const saveOptical=async()=>{
  if(!opticalName.trim()||!fmtFile||!file){setError('Optik adı, FMT dosyası ve değerlendireceğiniz TXT/DAT dosyası gerekli.');return}
  setBusy(true);setError('');setNotice('');
  try{const form=new FormData();form.append('name',opticalName.trim());form.append('fmt',fmtFile);form.append('sample',file);
   const r=await api<any>('/api/admin/result-network/operations/opticals',{method:'POST',body:form});
   await loadCatalog();setTemplateVersionId(r.optical.id);setAddOptical(false);setFmtFile(null);setOpticalName('');
   setNotice(`"${r.optical.name}" optiği eklendi ve seçildi: dosyanızdaki ${r.recordCount} satır bu optikle okundu.`);
  }catch(e:any){setError(e.message)}finally{setBusy(false)}
 };
 const loadKarnes=async()=>{if(!preview?.batchId)return;setBusy(true);setError('');try{setKarnes(await api<any>(`/api/admin/result-network/operations/scan-batches/${preview.batchId}/karnes`))}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 const openBatch=async(row:any)=>{setBusy(true);setError('');setNotice('');setReport(null);setKarnes(null);setSetAside([]);setCandidates({});try{const b=await api<any>(`/api/admin/result-network/operations/scan-batches/${row.id}`);setBatch(b);setPreview({batchId:row.id,total:Number(row.total||b.records?.length||0),counts:b.counts,detection:{templateName:`${row.institution_name} · ${row.title}`,confidence:b.batch?.detection_confidence||0}});document.getElementById('result-evaluation')?.scrollIntoView({behavior:'smooth',block:'start'})}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 const reset=()=>{setSetAside([]);setKarnes(null);setFile(null);setPreview(null);setBatch(null);setReport(null);setCandidates({});setCandidateQueries({});setError('');setNotice('')};
 const pendingRows=(batch?.records||[]).filter((row:any)=>row.resolution_status!=='CANCELLED'&&row.resolution_status!=='RESOLVED'&&(['NEW_GUEST','AMBIGUOUS','INVALID'].includes(row.match_status)||(row.issues||[]).length>0));
 const reviewRows=reviewTab==='UNMATCHED'?pendingRows.filter((row:any)=>['NEW_GUEST','AMBIGUOUS','INVALID'].includes(row.match_status)):pendingRows;
 const ready=batch?.batch?.status==='READY'||batch?.batch?.status==='COMMITTED';

 return <section className="panel result-operator-workspace" style={{marginTop:18}}>
  <div className="panel-head"><div><span className="eyebrow">{mode==='DEALER'?'Bayi kapsamlı işlem':'Kurum işlemi'}</span><h2>Sınav değerlendirme merkezi</h2><p>Sınav, optik ve kurumu seçin; DAT/TXT/CSV dosyasını kontrol ederek güvenli biçimde değerlendirin.</p></div><ScanLine/></div>
  {access?.dealer&&<div className="alert info"><ShieldCheck/> {access.dealer.displayName||'Bayi'} · {access.dealer.scopeCount} aktif yetki kapsamı</div>}
  {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}
  {!preview?<div>
   <div className="form-grid">
    <label>1 · Sınav<select value={examId} onChange={e=>setExamId(e.target.value)}><option value="">Sınav seçin</option>{catalog.exams.map((exam:any)=><option key={exam.id} value={exam.id}>{exam.academic_year} · {exam.publisher_name?`${exam.publisher_name} · `:''}{exam.title}</option>)}</select></label>
    <label>2 · Optik / FMT<select value={templateVersionId} onChange={e=>setTemplateVersionId(e.target.value)}><option value="">Optik seçin</option>{catalog.opticals.map((optical:any)=><option key={optical.id} value={optical.id}>{optical.name} · {optical.version}</option>)}</select><button type="button" className="link-button result-add-optical" onClick={()=>setAddOptical(v=>!v)}>{addOptical?'Vazgeç':'Optik listede yok mu? Optik ekle'}</button></label>
    {searchable?<label className="result-institution-picker">3 · Kurum<input value={instQuery} placeholder="Kurum adı veya MEB kodu yazın" onChange={e=>{setInstQuery(e.target.value);setPicked(null)}}/>{picked&&<small className="field-help">Seçildi: {pickedLabel(picked)}</small>}{!picked&&instOptions.length>0&&<div className="institution-options">{instOptions.map((x:any)=><button type="button" key={x.code} onClick={()=>{setPicked(x);setInstQuery(pickedLabel(x));setInstOptions([])}}><strong>{x.name}</strong><span>{x.city} · {x.district} · {x.code}</span></button>)}</div>}{!picked&&instQuery.trim().length>=2&&!instOptions.length&&<small className="field-help">Yetkiniz içinde eşleşen kurum yok.</small>}</label>
    :<label>3 · Kurum<select value={institutionId} onChange={e=>setInstitutionId(e.target.value)}><option value="">Kurum seçin</option>{catalog.institutions.map((institution:any)=><option key={institution.id} value={institution.id}>{institution.name} · {institution.code} · {institution.city}/{institution.district}</option>)}</select></label>}
    <label>4 · Veri dosyası<input type="file" accept=".dat,.txt,.csv,text/plain,text/csv" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
   </div>
   {addOptical&&<div className="panel result-optical-add"><h3>Optik ekle</h3><p>Optiğin adını ve FMT dosyasını verin. Sistem FMT'yi, 4. adımda seçtiğiniz TXT/DAT dosyasıyla dener; okuyabiliyorsa optiği kaydedip seçer.{access?.canManageNetwork?'':' Bu işlemi Süper Admin yapar; FMT dosyasını ANUNEX yönetimine iletin.'}</p><div className="form-grid"><label>Optik adı<input value={opticalName} onChange={e=>setOpticalName(e.target.value)} placeholder="ör. 4K Yayınları TYT optiği"/></label><label>FMT dosyası<input type="file" accept=".fmt,.FMT,.txt" onChange={e=>setFmtFile(e.target.files?.[0]||null)}/></label></div>{!file&&<small className="field-help">Önce 4. adımda değerlendireceğiniz TXT/DAT dosyasını seçin.</small>}<button className="primary" type="button" disabled={busy||!opticalName.trim()||!fmtFile||!file||!access?.canManageNetwork} onClick={()=>void saveOptical()}>{busy?'Deneniyor…':'Optiği dene ve kaydet'}</button></div>}
   {!catalog.exams.length&&<div className="alert warning"><TriangleAlert/> Değerlendirmeye açık sınav yok. Sınav kartı ve cevap anahtarı tamamlanan merkezi sınav burada kendiliğinden görünür.</div>}
   {!catalog.opticals.length&&<div className="alert warning"><TriangleAlert/> Kayıtlı optik yok. "Optik ekle" ile FMT dosyasını yükleyin.</div>}
   <button className="primary huge" disabled={busy||!file||!(searchable?picked:institutionId)||!examId||!templateVersionId} onClick={()=>void upload()}><FileUp/> {busy?'Dosya okunuyor…':'Dosyayı yükle ve kontrol et'}</button>
  </div>:<>
   {(()=>{const out=pendingRows.length+(batch?.records||[]).filter((r:any)=>r.resolution_status==='CANCELLED').length;const committed=batch?.batch?.status==='COMMITTED';return <div className="summary-strip"><Summary label="Okunan satır" value={preview.total}/><Summary label={committed?'Değerlendirilen':'Değerlendirilecek'} value={Math.max(0,Number(preview.total||0)-out)}/><Summary label="Değerlendirme dışı" value={out} warn/></div>})()}
   <div className="panel-head"><div><h3>5 · Kontrol</h3><p>{preview.detection?.templateName} · optik tanıma %{Math.round(Number(preview.detection?.confidence||0)*100)}</p></div><button className="ghost" onClick={reset}><RefreshCw/> Yeni dosya</button></div>
   {batch?.batch?.status!=='COMMITTED'&&(pendingRows.length?<div className="alert warning"><TriangleAlert/><div><strong>{pendingRows.length} satır değerlendirmeye alınmayacak.</strong> Diğer {Math.max(0,Number(preview.total||0)-pendingRows.length)} öğrenci değerlendirilir. Bu satırları düzeltmek için TXT dosyasını düzeltip ayrıca yükleyin.<ul className="result-setaside-list">{pendingRows.map((row:any)=><li key={row.id}><strong>Satır {row.row_no}{row.canonical?.name?` · ${row.canonical.name}`:''}</strong>: {(row.issues||[]).join(' · ')||(row.match_status==='AMBIGUOUS'?'Aynı ada sahip birden fazla kayıtlı öğrenci var.':'Ad soyad okunamadı.')}</li>)}</ul></div></div>:<div className="alert success"><CheckCircle2/> Bütün satırlar okundu; değerlendirmeye hazır.</div>)}
   {batch?.batch?.status!=='COMMITTED'&&<button className="primary huge" disabled={busy||Number(preview.total||0)-pendingRows.length<=0} onClick={()=>void evaluate()}><ScanLine/> {busy?'Değerlendiriliyor…':'6 · Değerlendir'}</button>}
   {setAside.length>0&&<div className="alert warning"><TriangleAlert/><div><strong>Değerlendirmeye alınmayan {setAside.length} satır:</strong><ul className="result-setaside-list">{setAside.map((x:any)=><li key={x.row}><strong>Satır {x.row}{x.name?` · ${x.name}`:''}</strong>: {x.reason}</li>)}</ul></div></div>}
   {batch?.batch?.status==='COMMITTED'&&<><div className="success-box"><CheckCircle2/><div><strong>Değerlendirme tamamlandı</strong><span>{preview.evaluated||preview.total} katılımcının sonucu işlendi. Erişim kartını bir kez indirip kurum yetkilisine güvenli kanaldan teslim edin.</span></div></div><div className="result-completion-actions"><button className="secondary" disabled={busy} onClick={()=>void generateAccessCodes()}><FileKey2/> Öğrenci erişim kartlarını üret</button><button className="secondary" disabled={busy} onClick={()=>void loadReport()}><Download/> Kurum sonuç listesini hazırla</button><button className="secondary" disabled={busy} onClick={()=>void loadKarnes()}><Printer/> Öğrenci karneleri</button></div>{karnes&&<KarneSheets data={karnes} onClose={()=>setKarnes(null)}/>}{report&&<section className="result-report-preview"><div className="panel-head"><div><h3>Yayın ve sıralama kontrolü</h3><p>{report.publication?.rankingFrozenAt?`Sıralama ${new Date(report.publication.rankingFrozenAt).toLocaleString('tr-TR')} tarihinde donduruldu.`:'Kurum ve şube sıraları hazır. İlçe, il ve Türkiye sıraları Süper Admin genel yayını tamamlayınca kesinleşir.'}</p></div><p className="report-source" role="note"><strong>{reportSource(report).label}</strong></p><div className="result-completion-actions"><button className="ghost" onClick={exportReport}><Download/> Excel / CSV</button><button className="ghost" onClick={()=>window.print()}><Printer/> PDF yazdır</button></div></div><div className="table-card"><table><thead><tr><th>Öğrenci</th><th>D/Y/B</th><th>Net</th><th>Şube</th><th>Kurum</th><th>İlçe</th><th>İl</th><th>Türkiye</th></tr></thead><tbody>{report.rows.slice(0,200).map((x:any)=><tr key={x.participant_id}><td><strong>{x.name_snapshot}</strong><small>{x.student_number_snapshot} · {x.class_snapshot||'—'}</small></td><td>{x.correct_count}/{x.wrong_count}/{x.blank_count}</td><td><strong>{Number(x.net).toLocaleString('tr-TR')}</strong></td><td>{rank(x.class_rank,x.class_count)}</td><td>{rank(x.institution_rank,x.institution_count)}</td><td>{rank(x.district_rank,x.district_count)}</td><td>{rank(x.city_rank,x.city_count)}</td><td>{rank(x.national_rank,x.national_count)}</td></tr>)}</tbody></table></div>{report.rows.length>200&&<p className="muted">Ekranda ilk 200 kayıt gösterilir; indirilen dosyada {report.rows.length.toLocaleString('tr-TR')} öğrencinin tamamı bulunur.</p>}</section>}</>}
  </>}
  <div id="result-evaluation-history" className="result-history"><div className="panel-head"><div><h3>Değerlendirme geçmişi</h3><p>Önceki değerlendirmeyi açarak eşleştirmeye, değerlendirmeye, rapora ve erişim kartlarına dönebilirsiniz.</p></div><button className="ghost" type="button" onClick={()=>void loadHistory()}><RefreshCw/> Yenile</button></div>
   {!history.length?<p className="empty">Henüz değerlendirme yok.</p>:<div className="table-card"><table><thead><tr><th>Tarih</th><th>Sınav</th><th>Kurum</th><th>Kayıt</th><th>Durum</th><th></th></tr></thead><tbody>{history.map((x:any)=><tr key={x.id}><td>{new Date(String(x.created_at).replace(' ','T')+'Z').toLocaleString('tr-TR')}</td><td>{x.academic_year} · {x.title}</td><td>{x.institution_name}<small> {x.institution_code} · {x.city}/{x.district}</small></td><td>{Number(x.total||0).toLocaleString('tr-TR')}</td><td>{BATCH_STATUS[x.status]||x.status}</td><td><button className="secondary" type="button" disabled={busy} onClick={()=>void openBatch(x)}>{x.status==='COMMITTED'?'Rapor ve kartlar':'Devam et'}</button></td></tr>)}</tbody></table></div>}
  </div>
 </section>;
}
const BATCH_STATUS:Record<string,string>={PREVIEW:'Önizleme',NEEDS_REVIEW:'Kontrol bekliyor',READY:'Değerlendirmeye hazır',COMMITTED:'Değerlendirildi',FAILED:'Hatalı'};
function pickedLabel(x:any){return `${x.name} · ${x.code} · ${x.city}/${x.district}`}

function Summary({label,value,warn}:{label:string;value:number;warn?:boolean}){return <div className={warn&&value?'summary warn':'summary'}><span>{label}</span><strong>{value||0}</strong></div>}
function rank(value:any,total:any){return value&&total?`${Number(value).toLocaleString('tr-TR')} / ${Number(total).toLocaleString('tr-TR')}`:'—'}

/** S030: one printable report card per student of the institution. */
function KarneSheets({data,onClose}:{data:any;onClose:()=>void}){
 const subjects=(k:any)=>k.subjects||[];
 return <section className="result-karnes"><div className="panel-head no-print"><div><h3>Öğrenci karneleri · {data.institution?.name}</h3><p>{data.exam?.academic_year} · {data.exam?.title} · {data.summary?.participants} öğrenci · ortalama net {Number(data.summary?.averageNet||0).toLocaleString('tr-TR')}</p></div><div className="result-completion-actions"><button className="secondary" onClick={()=>window.print()}><Printer/> Hepsini yazdır / PDF</button><button className="ghost" onClick={onClose}>Kapat</button></div></div>
  {(data.karnes||[]).map((k:any)=><article className="result-karne" key={k.participant_id}><header><div><strong>{k.name_snapshot}</strong><span>{k.student_number_snapshot?`No: ${k.student_number_snapshot} · `:''}{k.class_snapshot||''}</span></div><div><span>{data.exam?.title}</span><span>{data.institution?.name}</span></div></header>
   <div className="result-karne-totals"><div><span>Doğru</span><b>{k.correct_count}</b></div><div><span>Yanlış</span><b>{k.wrong_count}</b></div><div><span>Boş</span><b>{k.blank_count}</b></div><div><span>Net</span><b>{Number(k.net).toLocaleString('tr-TR')}</b></div><div><span>Puan</span><b>{k.score==null?'—':Number(k.score).toLocaleString('tr-TR')}</b></div></div>
   <table><thead><tr><th>Ders</th><th>D</th><th>Y</th><th>B</th><th>Net</th></tr></thead><tbody>{subjects(k).map((s:any)=><tr key={s.subject}><td>{s.subject}</td><td>{s.correct_count}</td><td>{s.wrong_count}</td><td>{s.blank_count}</td><td>{Number(s.net).toLocaleString('tr-TR')}</td></tr>)}</tbody></table>
   <footer>Şube {rank(k.class_rank,k.class_count)} · Kurum {rank(k.institution_rank,k.institution_count)} · İlçe {rank(k.district_rank,k.district_count)} · İl {rank(k.city_rank,k.city_count)} · Türkiye {rank(k.national_rank,k.national_count)}</footer></article>)}
 </section>;
}

/** S030: Raporlar — every evaluated exam of an institution: the institution list and every student's report card. */
export function ResultReportsPanel({mode}:{mode:'INSTITUTION'|'DEALER'}){
 const[rows,setRows]=useState<any[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[karnes,setKarnes]=useState<any>(null),[report,setReport]=useState<any>(null),[open,setOpen]=useState<any>(null);
 useEffect(()=>{void api<any>(`/api/admin/result-network/operations/history?mode=${mode}`).then(r=>setRows((r.batches||[]).filter((b:any)=>b.status==='COMMITTED'))).catch((e:any)=>setError(e.message))},[mode]);
 const load=async(row:any,kind:'REPORT'|'KARNES')=>{setBusy(true);setError('');setOpen(row);setKarnes(null);setReport(null);try{if(kind==='REPORT')setReport(await api<any>(`/api/admin/result-network/operations/scan-batches/${row.id}/report`));else setKarnes(await api<any>(`/api/admin/result-network/operations/scan-batches/${row.id}/karnes`))}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 return <section className="panel result-reports-panel"><div className="panel-head"><div><span className="eyebrow">RAPORLAR</span><h2>Kurum raporları ve öğrenci karneleri</h2><p>Değerlendirilmiş sınavlar. Kurum listesini ya da öğrenci karnelerini açın; yazdırarak PDF alabilirsiniz.</p></div></div>
  {error&&<div className="alert error">{error}</div>}
  {!rows.length?<p className="empty">Henüz değerlendirilmiş sınav yok.</p>:<div className="table-card"><table><thead><tr><th>Sınav</th><th>Kurum</th><th>Öğrenci</th><th></th></tr></thead><tbody>{rows.map((r:any)=><tr key={r.id}><td>{r.academic_year} · {r.title}<small> {new Date(String(r.created_at).replace(' ','T')+'Z').toLocaleDateString('tr-TR')}</small></td><td>{r.institution_name}<small> {r.city}/{r.district}</small></td><td>{Number(r.total||0).toLocaleString('tr-TR')}</td><td><div className="row-actions"><button className="secondary" disabled={busy} onClick={()=>void load(r,'REPORT')}>Kurum raporu</button><button className="secondary" disabled={busy} onClick={()=>void load(r,'KARNES')}>Karneler</button></div></td></tr>)}</tbody></table></div>}
  {report&&open&&<section className="result-report-preview"><div className="panel-head"><div><h3>{open.institution_name} · {open.title}</h3><p>{report.rows.length} öğrenci · ortalama net {report.rows.length?(report.rows.reduce((n:number,x:any)=>n+Number(x.net||0),0)/report.rows.length).toLocaleString('tr-TR',{maximumFractionDigits:2}):0}</p></div><button className="ghost" onClick={()=>window.print()}><Printer/> Yazdır / PDF</button></div><div className="table-card"><table><thead><tr><th>Sıra</th><th>Öğrenci</th><th>D/Y/B</th><th>Net</th><th>Puan</th><th>Şube</th><th>İlçe</th><th>İl</th><th>Türkiye</th></tr></thead><tbody>{report.rows.map((x:any,i:number)=><tr key={x.participant_id}><td>{i+1}</td><td><strong>{x.name_snapshot}</strong><small>{x.student_number_snapshot} · {x.class_snapshot||'—'}</small></td><td>{x.correct_count}/{x.wrong_count}/{x.blank_count}</td><td>{Number(x.net).toLocaleString('tr-TR')}</td><td>{x.score==null?'—':Number(x.score).toLocaleString('tr-TR')}</td><td>{rank(x.class_rank,x.class_count)}</td><td>{rank(x.district_rank,x.district_count)}</td><td>{rank(x.city_rank,x.city_count)}</td><td>{rank(x.national_rank,x.national_count)}</td></tr>)}</tbody></table></div></section>}
  {karnes&&<KarneSheets data={karnes} onClose={()=>setKarnes(null)}/>}
 </section>;
}
