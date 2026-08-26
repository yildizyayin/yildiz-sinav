import { useEffect,useMemo,useState } from 'react';
import { AlertTriangle,BarChart3,CheckCircle2,ClipboardCheck,FileUp,Layers3,Printer,RefreshCw,UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api,qs } from '../api';
import { useAuth } from '../auth';

type BulkOperation='ASSIGN_WORKSHEET'|'CREATE_EXAM_PARTICIPANTS';
type ImportSource='GENERIC'|'EDESIS'|'OKULIZYON';
type ImportPreview={importJobId:string;summary:{total:number;matched:number;new:number;review:number};sourceSystem:string;note?:string};

export function BulkOperations(){
 const{user}=useAuth();
 const[institutions,setInstitutions]=useState<any[]>([]);const[institutionId,setInstitutionId]=useState('');
 const[data,setData]=useState<any>({classes:[],worksheets:[],exams:[]});const[selected,setSelected]=useState<string[]>([]);
 const[operation,setOperation]=useState<BulkOperation>('ASSIGN_WORKSHEET');const[worksheetId,setWorksheetId]=useState('');const[examId,setExamId]=useState('');const[dueDate,setDueDate]=useState('');
 const[importFile,setImportFile]=useState<File|null>(null);const[importSource,setImportSource]=useState<ImportSource>('GENERIC');const[importPreview,setImportPreview]=useState<ImportPreview|null>(null);const[importBusy,setImportBusy]=useState(false);
 const[notice,setNotice]=useState('');const[error,setError]=useState('');const[busy,setBusy]=useState(false);

 useEffect(()=>{if(user?.role==='SUPER_ADMIN')void api<any>('/api/institutions').then(r=>{const list=r.institutions||[];setInstitutions(list);if(list[0])setInstitutionId(list[0].id)}).catch((e:any)=>setError(e.message));},[user?.role]);
 const load=async()=>{setError('');try{const r=await api<any>(`/api/v2/bulk/options${qs({institutionId:user?.role==='SUPER_ADMIN'?institutionId:null})}`);setData(r);setSelected([]);if(r.worksheets?.[0])setWorksheetId(r.worksheets[0].id);if(r.exams?.[0])setExamId(r.exams[0].id);}catch(e:any){setError(e.message)}};
 useEffect(()=>{setImportPreview(null);if(user?.role!=='SUPER_ADMIN'||institutionId)void load()},[institutionId,user?.role]);
 const toggle=(id:string,on:boolean)=>setSelected(cur=>on?[...new Set([...cur,id])]:cur.filter(x=>x!==id));
 const selectedStudentCount=useMemo(()=>data.classes.filter((c:any)=>selected.includes(c.id)).reduce((sum:number,c:any)=>sum+Number(c.student_count||0),0),[data.classes,selected]);

 const run=async()=>{if(!selected.length)return;const verb=operation==='ASSIGN_WORKSHEET'?'föy ataması':'sınav katılımcısı oluşturma';if(!confirm(`${selected.length} sınıf ve yaklaşık ${selectedStudentCount} öğrenci için ${verb} çalıştırılsın mı?`))return;setBusy(true);setError('');setNotice('');try{const r=await api<any>('/api/v2/bulk/execute',{method:'POST',body:JSON.stringify({institutionId:user?.role==='SUPER_ADMIN'?institutionId:undefined,operation,classIds:selected,worksheetId:operation==='ASSIGN_WORKSHEET'?worksheetId:undefined,examId:operation==='CREATE_EXAM_PARTICIPANTS'?examId:undefined,dueDate:dueDate||null})});setNotice(`İşlem tamamlandı. ${r.summary.created||0} kayıt oluşturuldu, ${r.summary.skipped||0} mevcut kayıt atlandı.`);await load();}catch(e:any){setError(e.message)}finally{setBusy(false)}};

 const previewImport=async()=>{if(!importFile)return;setImportBusy(true);setError('');setNotice('');setImportPreview(null);try{const fd=new FormData();fd.append('file',importFile);fd.append('sourceSystem',importSource);if(user?.role==='SUPER_ADMIN')fd.append('institutionId',institutionId);const r=await api<ImportPreview>('/api/imports/preview',{method:'POST',body:fd});setImportPreview(r);setNotice('Öğrenci dosyası ön izlendi. Kontrol özetini doğruladıktan sonra aktarımı tamamlayın.')}catch(e:any){setError(e.message)}finally{setImportBusy(false)}};
 const commitImport=async()=>{if(!importPreview||importPreview.summary.review>0)return;if(!confirm(`${importPreview.summary.total} satırlık öğrenci aktarımı kalıcı olarak işlensin mi?`))return;setImportBusy(true);setError('');try{const r=await api<any>(`/api/imports/${encodeURIComponent(importPreview.importJobId)}/commit`,{method:'POST'});setNotice(`Öğrenci aktarımı tamamlandı. ${r.created||0} yeni öğrenci oluşturuldu, ${r.reused||0} mevcut öğrenci yeniden kullanıldı.`);setImportPreview(null);setImportFile(null);await load();}catch(e:any){setError(e.message)}finally{setImportBusy(false)}};

 return <>
  <div className="page-head"><div><span className="eyebrow">ANUNEX · Toplu İşlemler</span><h1>Kurum operasyon merkezi</h1><p>Öğrenci aktarımı, sınıf bazlı sınav/föy atamaları, optik hazırlama ve sonuç işlemlerini kurum sınırı içinde tek merkezden yönetin.</p></div><button className="ghost" onClick={()=>void load()}><RefreshCw size={16}/> Yenile</button></div>
  {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}

  <div className="action-grid">
   <a className="quick-card" href="#student-import"><div className="quick-icon"><FileUp/></div><div><h3>Öğrenci İçe Aktar</h3><p>CSV dosyasını önce ön izleyin; eşleşme ve yeni kayıt sayılarını görmeden veri yazmayın.</p></div></a>
   <a className="quick-card" href="#class-operations"><div className="quick-icon"><Layers3/></div><div><h3>Sınıf Bazlı İşlem</h3><p>Birden fazla sınıfa föy atayın veya sınav katılımcılarını topluca oluşturun.</p></div></a>
   <Link className="quick-card" to="/optical-prepare"><div className="quick-icon"><Printer/></div><div><h3>Optik Hazırla / Bas</h3><p>Kişiselleştirilmiş optikleri sınıf, sınav ve kitapçık yapısına göre hazırlayıp basın.</p></div></Link>
   <Link className="quick-card" to="/exams"><div className="quick-icon"><ClipboardCheck/></div><div><h3>Toplu Sonuç Akışı</h3><p>Kamera, TXT/DAT ve kayıtlı optiklerden gelen sınavları değerlendirme merkezine aktarın.</p></div></Link>
   <Link className="quick-card" to="/reports"><div className="quick-icon"><BarChart3/></div><div><h3>Rapor & Çıktı</h3><p>Öğrenci, sınıf ve kurum raporlarını inceleyin; yazdırma ve dışa aktarma akışına geçin.</p></div></Link>
  </div>

  <div className="panel" id="student-import" style={{marginTop:20}}><div className="panel-head"><div><h2>1. Toplu öğrenci içe aktarımı</h2><p>Aktarım iki aşamalıdır: önce ön izleme ve kimlik eşleştirme, sonra kalıcı kayıt. Excel dosyasını CSV olarak dışa aktarın.</p></div><UsersRound/></div>
   <div className="form-grid">{user?.role==='SUPER_ADMIN'&&<label>Kurum<select value={institutionId} onChange={e=>setInstitutionId(e.target.value)}>{institutions.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label>}<label>Kaynak sistem<select value={importSource} onChange={e=>{setImportSource(e.target.value as ImportSource);setImportPreview(null)}}><option value="GENERIC">Genel CSV</option><option value="EDESIS">Edesis export</option><option value="OKULIZYON">Okulizyon export</option></select></label><label>Öğrenci CSV<input type="file" accept=".csv,text/csv,text/plain" onChange={e=>{setImportFile(e.target.files?.[0]||null);setImportPreview(null)}}/></label></div>
   {(importSource==='EDESIS'||importSource==='OKULIZYON')&&<div className="alert warning"><AlertTriangle size={16}/> Gerçek Edesis/Okulizyon export şeması henüz kurumdan alınmış örnek dosyayla doğrulanmadı. Sistem bu aşamada güvenli genel öğrenci CSV alanlarını kullanır; uydurma kolon eşleştirmesi yapmaz.</div>}
   <button className="secondary" disabled={!importFile||importBusy||(user?.role==='SUPER_ADMIN'&&!institutionId)} onClick={()=>void previewImport()}><FileUp size={16}/> {importBusy?'Kontrol ediliyor…':'Dosyayı Ön İzle'}</button>
   {importPreview&&<div className="panel" style={{marginTop:14}}><div className="summary-strip"><Summary label="Toplam satır" value={importPreview.summary.total}/><Summary label="Eşleşen" value={importPreview.summary.matched}/><Summary label="Yeni" value={importPreview.summary.new}/><Summary label="Kontrol gerekli" value={importPreview.summary.review}/></div>{importPreview.note&&<p className="muted">{importPreview.note}</p>}{importPreview.summary.review>0?<div className="alert warning"><AlertTriangle size={16}/> {importPreview.summary.review} satır insan kontrolü gerektiriyor. Bu satırlar çözülmeden kalıcı aktarım engellenir.</div>:<div className="alert success"><CheckCircle2 size={16}/> Ön izleme temiz. Kalıcı aktarım için hazır.</div>}<button className="primary" disabled={importBusy||importPreview.summary.review>0} onClick={()=>void commitImport()}><CheckCircle2 size={16}/> Aktarımı Tamamla</button></div>}
  </div>

  <div className="panel" id="class-operations" style={{marginTop:20}}><div className="panel-head"><div><h2>2. Sınıf bazlı toplu operasyon</h2><p>İşlemler yalnız seçilen kurumun aktif sınıflarında çalışır; tekrar kayıtlar güvenli biçimde atlanır ve audit kaydı oluşturulur.</p></div><Layers3/></div><div className="form-grid">{user?.role==='SUPER_ADMIN'&&<label>Kurum<select value={institutionId} onChange={e=>setInstitutionId(e.target.value)}>{institutions.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label>}<label>İşlem<select value={operation} onChange={e=>setOperation(e.target.value as BulkOperation)}><option value="ASSIGN_WORKSHEET">Föy Ata</option><option value="CREATE_EXAM_PARTICIPANTS">Sınav Katılımcılarını Oluştur</option></select></label>{operation==='ASSIGN_WORKSHEET'?<><label>Föy<select value={worksheetId} onChange={e=>setWorksheetId(e.target.value)}>{data.worksheets.map((w:any)=><option key={w.id} value={w.id}>{w.title}</option>)}</select></label><label>Son tarih<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label></>:<label>Sınav<select value={examId} onChange={e=>setExamId(e.target.value)}>{data.exams.map((x:any)=><option key={x.id} value={x.id}>{x.title}</option>)}</select></label>}</div>
   <div className="summary-strip"><Summary label="Seçili sınıf" value={selected.length}/><Summary label="Tahmini öğrenci" value={selectedStudentCount}/><Summary label="Aktif sınıf" value={data.classes.length}/></div>
  </div>
  <div className="table-card"><table><thead><tr><th><input type="checkbox" checked={data.classes.length>0&&selected.length===data.classes.length} onChange={e=>setSelected(e.target.checked?data.classes.map((c:any)=>c.id):[])}/></th><th>Sınıf</th><th>Düzey</th><th>Öğrenci</th></tr></thead><tbody>{data.classes.map((c:any)=><tr key={c.id}><td><input type="checkbox" checked={selected.includes(c.id)} onChange={e=>toggle(c.id,e.target.checked)}/></td><td><strong>{c.name}</strong></td><td>{c.grade_level}. sınıf / {c.section}</td><td>{c.student_count}</td></tr>)}</tbody></table>{!data.classes.length&&<div className="empty">Aktif sınıf bulunmuyor.</div>}</div>
  <div style={{marginTop:16}}><button className="primary" disabled={!selected.length||busy||(operation==='ASSIGN_WORKSHEET'&&!worksheetId)||(operation==='CREATE_EXAM_PARTICIPANTS'&&!examId)} onClick={()=>void run()}>{busy?'İşleniyor…':`${selected.length} sınıfa uygula`}</button></div>
 </>;
}

function Summary({label,value}:{label:string;value:number|string}){return <div><span>{label}</span><strong>{value}</strong></div>}
