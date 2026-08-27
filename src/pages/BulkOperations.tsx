import { useEffect,useMemo,useState } from 'react';
import { AlertTriangle,BarChart3,CheckCircle2,ClipboardCheck,FileUp,Layers3,Printer,RefreshCw,ShieldCheck,Sparkles,UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api,qs } from '../api';
import { useAuth } from '../auth';

type BulkOperation='ASSIGN_WORKSHEET'|'CREATE_EXAM_PARTICIPANTS'|'ASSIGN_RECOVERY_RECOMMENDATIONS';
type ImportSource='GENERIC'|'EDESIS'|'OKULIZYON';
type ImportPreview={importJobId:string;summary:{total:number;matched:number;new:number;review:number};sourceSystem:string;note?:string};
type RecoveryRecommendation={
 classId:string;className:string;gradeLevel:number;section:string;studentCount:number;
 state:'READY'|'NO_ACTION'|'INSUFFICIENT_EVIDENCE'|'NO_WORKSHEET'|'ALREADY_ASSIGNED';
 reason:string;evidenceCount:number;
 weakOutcomes:Array<{outcomeId:string;outcomeCode?:string|null;outcomeTitle:string;subjectName:string;successRate:number;evidenceCount:number;measuredStudents:number}>;
 worksheet:null|{id:string;title:string;matchedOutcomeCount:number;alreadyAssigned:boolean};
};
type RecoveryPreview={
 policy:{source:string;humanApprovalRequired:boolean;autoAssignment:boolean;minEvidencePerOutcome:number;weaknessThresholdPercent:number;fabricatedIdsAllowed:boolean};
 summary:{classes:number;ready:number;noAction:number;insufficientEvidence:number;noWorksheet:number;alreadyAssigned:number};
 recommendations:RecoveryRecommendation[];
};

function recoveryStateLabel(state:RecoveryRecommendation['state']){
 if(state==='READY')return 'Onay bekliyor';
 if(state==='NO_ACTION')return 'Atama gerekmiyor';
 if(state==='INSUFFICIENT_EVIDENCE')return 'Ölçüm gerekli';
 if(state==='NO_WORKSHEET')return 'Föy eşleşmesi yok';
 return 'Zaten atanmış';
}

export function BulkOperations(){
 const{user}=useAuth();
 const[institutions,setInstitutions]=useState<any[]>([]);const[institutionId,setInstitutionId]=useState('');
 const[data,setData]=useState<any>({classes:[],worksheets:[],exams:[]});const[selected,setSelected]=useState<string[]>([]);
 const[operation,setOperation]=useState<BulkOperation>('ASSIGN_WORKSHEET');const[worksheetId,setWorksheetId]=useState('');const[examId,setExamId]=useState('');const[dueDate,setDueDate]=useState('');
 const[importFile,setImportFile]=useState<File|null>(null);const[importSource,setImportSource]=useState<ImportSource>('GENERIC');const[importPreview,setImportPreview]=useState<ImportPreview|null>(null);const[importBusy,setImportBusy]=useState(false);
 const[recovery,setRecovery]=useState<RecoveryPreview|null>(null);const[approvedRecovery,setApprovedRecovery]=useState<string[]>([]);
 const[notice,setNotice]=useState('');const[error,setError]=useState('');const[busy,setBusy]=useState(false);

 useEffect(()=>{if(user?.role==='SUPER_ADMIN')void api<any>('/api/institutions').then(r=>{const list=r.institutions||[];setInstitutions(list);if(list[0])setInstitutionId(list[0].id)}).catch((e:any)=>setError(e.message));},[user?.role]);
 const clearRecovery=()=>{setRecovery(null);setApprovedRecovery([])};
 const load=async()=>{setError('');try{const r=await api<any>(`/api/v2/bulk/options${qs({institutionId:user?.role==='SUPER_ADMIN'?institutionId:null})}`);setData(r);setSelected([]);clearRecovery();if(r.worksheets?.[0])setWorksheetId(r.worksheets[0].id);if(r.exams?.[0])setExamId(r.exams[0].id);}catch(e:any){setError(e.message)}};
 useEffect(()=>{setImportPreview(null);if(user?.role!=='SUPER_ADMIN'||institutionId)void load()},[institutionId,user?.role]);
 const toggle=(id:string,on:boolean)=>{clearRecovery();setSelected(cur=>on?[...new Set([...cur,id])]:cur.filter(x=>x!==id))};
 const toggleAll=(on:boolean)=>{clearRecovery();setSelected(on?data.classes.map((c:any)=>c.id):[])};
 const selectedStudentCount=useMemo(()=>data.classes.filter((c:any)=>selected.includes(c.id)).reduce((sum:number,c:any)=>sum+Number(c.student_count||0),0),[data.classes,selected]);

 const previewImport=async()=>{if(!importFile)return;setImportBusy(true);setError('');setNotice('');setImportPreview(null);try{const fd=new FormData();fd.append('file',importFile);fd.append('sourceSystem',importSource);if(user?.role==='SUPER_ADMIN')fd.append('institutionId',institutionId);const r=await api<ImportPreview>('/api/imports/preview',{method:'POST',body:fd});setImportPreview(r);setNotice('Öğrenci dosyası ön izlendi. Kontrol özetini doğruladıktan sonra aktarımı tamamlayın.')}catch(e:any){setError(e.message)}finally{setImportBusy(false)}};
 const commitImport=async()=>{if(!importPreview||importPreview.summary.review>0)return;if(!confirm(`${importPreview.summary.total} satırlık öğrenci aktarımı kalıcı olarak işlensin mi?`))return;setImportBusy(true);setError('');try{const r=await api<any>(`/api/imports/${encodeURIComponent(importPreview.importJobId)}/commit`,{method:'POST'});setNotice(`Öğrenci aktarımı tamamlandı. ${r.created||0} yeni öğrenci oluşturuldu, ${r.reused||0} mevcut öğrenci yeniden kullanıldı.`);setImportPreview(null);setImportFile(null);await load()}catch(e:any){setError(e.message)}finally{setImportBusy(false)}};

 const previewRecovery=async()=>{if(!selected.length)return;setBusy(true);setError('');setNotice('');try{const r=await api<RecoveryPreview>('/api/v2/bulk/recovery-preview',{method:'POST',body:JSON.stringify({institutionId:user?.role==='SUPER_ADMIN'?institutionId:undefined,classIds:selected})});setRecovery(r);setApprovedRecovery(r.recommendations.filter(x=>x.state==='READY').map(x=>x.classId))}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 const toggleRecovery=(classId:string,on:boolean)=>setApprovedRecovery(cur=>on?[...new Set([...cur,classId])]:cur.filter(x=>x!==classId));
 const changeOperation=(value:BulkOperation)=>{setOperation(value);clearRecovery();setNotice('');setError('')};

 const run=async()=>{
  const targetClassIds=operation==='ASSIGN_RECOVERY_RECOMMENDATIONS'?approvedRecovery:selected;if(!targetClassIds.length)return;
  const verb=operation==='ASSIGN_WORKSHEET'?'föy ataması':operation==='CREATE_EXAM_PARTICIPANTS'?'sınav katılımcısı oluşturma':'Nibiru Recovery föy ataması';
  if(!confirm(`${targetClassIds.length} sınıf için ${verb} çalıştırılsın mı?${operation==='ASSIGN_RECOVERY_RECOMMENDATIONS'?' Yalnız önizlemede onayladığınız doğrulanmış öneriler uygulanacaktır.':` Yaklaşık ${selectedStudentCount} öğrenci etkilenebilir.`}`))return;
  setBusy(true);setError('');setNotice('');
  try{const r=await api<any>('/api/v2/bulk/execute',{method:'POST',body:JSON.stringify({institutionId:user?.role==='SUPER_ADMIN'?institutionId:undefined,operation,classIds:targetClassIds,worksheetId:operation==='ASSIGN_WORKSHEET'?worksheetId:undefined,examId:operation==='CREATE_EXAM_PARTICIPANTS'?examId:undefined,dueDate:dueDate||null})});if(operation==='ASSIGN_RECOVERY_RECOMMENDATIONS')setNotice(`Nibiru Recovery tamamlandı. ${r.summary.created||0} föy atandı, ${r.summary.skipped||0} mevcut atama korundu.`);else setNotice(`İşlem tamamlandı. ${r.summary.created||0} kayıt oluşturuldu, ${r.summary.skipped||0} mevcut kayıt atlandı.`);await load()}catch(e:any){setError(e.message)}finally{setBusy(false)}
 };

 return <>
  <div className="page-head"><div><span className="eyebrow">ANUNEX · Toplu İşlemler</span><h1>Kurum operasyon merkezi</h1><p>Öğrenci aktarımı, sınıf bazlı sınav/föy atamaları, Nibiru Recovery, optik hazırlama ve sonuç işlemlerini kurum sınırı içinde tek merkezden yönetin.</p></div><button className="ghost" onClick={()=>void load()}><RefreshCw size={16}/> Yenile</button></div>
  {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}

  <div className="action-grid">
   <a className="quick-card" href="#student-import"><div className="quick-icon"><FileUp/></div><div><h3>Öğrenci İçe Aktar</h3><p>CSV dosyasını önce ön izleyin; eşleşme ve yeni kayıt sayılarını görmeden veri yazmayın.</p></div></a>
   <a className="quick-card" href="#class-operations"><div className="quick-icon"><Layers3/></div><div><h3>Sınıf Bazlı İşlem</h3><p>Birden fazla sınıfa föy, sınav katılımcısı veya doğrulanmış Recovery çalışması uygulayın.</p></div></a>
   <Link className="quick-card" to="/optical-prepare"><div className="quick-icon"><Printer/></div><div><h3>Optik Hazırla / Bas</h3><p>Kişiselleştirilmiş optikleri sınıf, sınav ve kitapçık yapısına göre hazırlayıp basın.</p></div></Link>
   <Link className="quick-card" to="/exams"><div className="quick-icon"><ClipboardCheck/></div><div><h3>Toplu Sonuç Akışı</h3><p>Kamera, TXT/DAT ve kayıtlı optiklerden gelen sınavları değerlendirme merkezine aktarın.</p></div></Link>
   <Link className="quick-card" to="/reports"><div className="quick-icon"><BarChart3/></div><div><h3>Rapor & Çıktı</h3><p>Öğrenci, sınıf ve kurum raporlarını inceleyin; yazdırma ve dışa aktarma akışına geçin.</p></div></Link>
  </div>

  <div className="panel" id="student-import" style={{marginTop:20}}><div className="panel-head"><div><h2>1. Toplu öğrenci içe aktarımı</h2><p>Aktarım iki aşamalıdır: önce ön izleme ve kimlik eşleştirme, sonra kalıcı kayıt. Excel dosyasını CSV olarak dışa aktarın.</p></div><UsersRound/></div>
   <div className="form-grid">{user?.role==='SUPER_ADMIN'&&<label>Kurum<select value={institutionId} onChange={e=>{setInstitutionId(e.target.value);clearRecovery()}}>{institutions.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label>}<label>Kaynak sistem<select value={importSource} onChange={e=>{setImportSource(e.target.value as ImportSource);setImportPreview(null)}}><option value="GENERIC">Genel CSV</option><option value="EDESIS">Edesis export</option><option value="OKULIZYON">Okulizyon export</option></select></label><label>Öğrenci CSV<input type="file" accept=".csv,text/csv,text/plain" onChange={e=>{setImportFile(e.target.files?.[0]||null);setImportPreview(null)}}/></label></div>
   {(importSource==='EDESIS'||importSource==='OKULIZYON')&&<div className="alert warning"><AlertTriangle size={16}/> Gerçek Edesis/Okulizyon export şeması henüz kurumdan alınmış örnek dosyayla doğrulanmadı. Sistem bu aşamada güvenli genel öğrenci CSV alanlarını kullanır; uydurma kolon eşleştirmesi yapmaz.</div>}
   <button className="secondary" disabled={!importFile||importBusy||(user?.role==='SUPER_ADMIN'&&!institutionId)} onClick={()=>void previewImport()}><FileUp size={16}/> {importBusy?'Kontrol ediliyor…':'Dosyayı Ön İzle'}</button>
   {importPreview&&<div className="panel" style={{marginTop:14}}><div className="summary-strip"><Summary label="Toplam satır" value={importPreview.summary.total}/><Summary label="Eşleşen" value={importPreview.summary.matched}/><Summary label="Yeni" value={importPreview.summary.new}/><Summary label="Kontrol gerekli" value={importPreview.summary.review}/></div>{importPreview.note&&<p className="muted">{importPreview.note}</p>}{importPreview.summary.review>0?<div className="alert warning"><AlertTriangle size={16}/> {importPreview.summary.review} satır insan kontrolü gerektiriyor. Bu satırlar çözülmeden kalıcı aktarım engellenir.</div>:<div className="alert success"><CheckCircle2 size={16}/> Ön izleme temiz. Kalıcı aktarım için hazır.</div>}<button className="primary" disabled={importBusy||importPreview.summary.review>0} onClick={()=>void commitImport()}><CheckCircle2 size={16}/> Aktarımı Tamamla</button></div>}
  </div>

  <div className="panel" id="class-operations" style={{marginTop:20}}><div className="panel-head"><div><h2>2. Sınıf bazlı toplu operasyon</h2><p>İşlemler yalnız seçilen kurumun aktif sınıflarında çalışır; tekrar kayıtlar güvenli biçimde atlanır ve audit kaydı oluşturulur.</p></div><Layers3/></div><div className="form-grid">{user?.role==='SUPER_ADMIN'&&<label>Kurum<select value={institutionId} onChange={e=>{setInstitutionId(e.target.value);clearRecovery()}}>{institutions.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label>}<label>İşlem<select value={operation} onChange={e=>changeOperation(e.target.value as BulkOperation)}><option value="ASSIGN_WORKSHEET">Föy Ata</option><option value="CREATE_EXAM_PARTICIPANTS">Sınav Katılımcılarını Oluştur</option><option value="ASSIGN_RECOVERY_RECOMMENDATIONS">Nibiru Recovery Önerisi</option></select></label>{operation==='ASSIGN_WORKSHEET'?<><label>Föy<select value={worksheetId} onChange={e=>setWorksheetId(e.target.value)}>{data.worksheets.map((w:any)=><option key={w.id} value={w.id}>{w.title}</option>)}</select></label><label>Son tarih<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label></>:operation==='CREATE_EXAM_PARTICIPANTS'?<label>Sınav<select value={examId} onChange={e=>setExamId(e.target.value)}>{data.exams.map((x:any)=><option key={x.id} value={x.id}>{x.title}</option>)}</select></label>:<label>Recovery son tarihi<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>}</div>
   <div className="summary-strip"><Summary label="Seçili sınıf" value={selected.length}/><Summary label="Tahmini öğrenci" value={selectedStudentCount}/><Summary label="Aktif sınıf" value={data.classes.length}/></div>
  </div>

  {operation==='ASSIGN_RECOVERY_RECOMMENDATIONS'&&<div className="panel" style={{marginTop:16}}><div className="panel-head"><div><h2>Nibiru Recovery güvenlik kuralı</h2><p>Öneri yalnız ölçülmüş kazanım verisinden çıkar. Nibiru kimlik, kazanım veya föy uydurmaz; otomatik atama yapmaz.</p></div><ShieldCheck/></div><p>Bir kazanımın Recovery adayı olması için en az 3 kanıt gerekir ve sınıf başarı oranı %60’ın altında olmalıdır. Eşleşen yayınlanmış föy yoksa sistem bunu açıkça bildirir.</p></div>}

  <div className="table-card"><table><thead><tr><th><input type="checkbox" checked={data.classes.length>0&&selected.length===data.classes.length} onChange={e=>toggleAll(e.target.checked)}/></th><th>Sınıf</th><th>Düzey</th><th>Öğrenci</th></tr></thead><tbody>{data.classes.map((c:any)=><tr key={c.id}><td><input type="checkbox" checked={selected.includes(c.id)} onChange={e=>toggle(c.id,e.target.checked)}/></td><td><strong>{c.name}</strong></td><td>{c.grade_level}. sınıf / {c.section}</td><td>{c.student_count}</td></tr>)}</tbody></table>{!data.classes.length&&<div className="empty">Aktif sınıf bulunmuyor.</div>}</div>

  {operation==='ASSIGN_RECOVERY_RECOMMENDATIONS'&&recovery&&<div className="panel" style={{marginTop:16}}><div className="panel-head"><div><h2>Nibiru Recovery önizlemesi</h2><p>{recovery.summary.ready} sınıf için doğrulanmış föy önerisi hazır. Atama için aşağıdaki seçimleri siz onaylayın.</p></div><Sparkles/></div><div className="summary-strip"><Summary label="Hazır" value={recovery.summary.ready}/><Summary label="Ölçüm gerekli" value={recovery.summary.insufficientEvidence}/><Summary label="Föy eşleşmesi yok" value={recovery.summary.noWorksheet}/><Summary label="Zaten atanmış" value={recovery.summary.alreadyAssigned}/></div><div className="table-card"><table><thead><tr><th>Onay</th><th>Sınıf</th><th>Durum</th><th>Zayıf kazanımlar</th><th>Önerilen föy</th><th>Gerekçe</th></tr></thead><tbody>{recovery.recommendations.map(rec=><tr key={rec.classId}><td><input type="checkbox" disabled={rec.state!=='READY'} checked={approvedRecovery.includes(rec.classId)} onChange={e=>toggleRecovery(rec.classId,e.target.checked)}/></td><td><strong>{rec.className}</strong><div>{rec.studentCount} öğrenci · {rec.evidenceCount} kanıt</div></td><td>{recoveryStateLabel(rec.state)}</td><td>{rec.weakOutcomes.length?rec.weakOutcomes.slice(0,3).map(x=><div key={x.outcomeId}><strong>{x.subjectName}</strong> · %{x.successRate} · {x.outcomeTitle}</div>):'—'}</td><td>{rec.worksheet?<><strong>{rec.worksheet.title}</strong><div>{rec.worksheet.matchedOutcomeCount} kazanım eşleşti</div></>:'—'}</td><td>{rec.reason}</td></tr>)}</tbody></table></div></div>}

  <div style={{marginTop:16,display:'flex',gap:10,flexWrap:'wrap'}}>{operation==='ASSIGN_RECOVERY_RECOMMENDATIONS'&&!recovery?<button className="primary" disabled={!selected.length||busy} onClick={()=>void previewRecovery()}>{busy?'Analiz ediliyor…':`Nibiru ile ${selected.length} sınıfı analiz et`}</button>:operation==='ASSIGN_RECOVERY_RECOMMENDATIONS'?<><button className="ghost" disabled={busy} onClick={()=>void previewRecovery()}><RefreshCw size={16}/> Önizlemeyi yenile</button><button className="primary" disabled={!approvedRecovery.length||busy} onClick={()=>void run()}>{busy?'İşleniyor…':`${approvedRecovery.length} Recovery önerisini onayla ve ata`}</button></>:<button className="primary" disabled={!selected.length||busy||(operation==='ASSIGN_WORKSHEET'&&!worksheetId)||(operation==='CREATE_EXAM_PARTICIPANTS'&&!examId)} onClick={()=>void run()}>{busy?'İşleniyor…':`${selected.length} sınıfa uygula`}</button>}</div>
 </>;
}

function Summary({label,value}:{label:string;value:number|string}){return <div><span>{label}</span><strong>{value}</strong></div>}
