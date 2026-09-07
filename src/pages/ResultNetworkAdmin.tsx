import { useEffect,useState } from 'react';
import { Building2,ExternalLink,FileUp,Globe2,RefreshCw,Save,Send,Settings2,ShieldCheck,UserCheck } from 'lucide-react';
import { api } from '../api';

function parseDirectory(text:string){
 const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);
 const delimiter=lines[0]?.includes(';')?';':',';
 return lines.slice(1).map(line=>{
  const [mebCode,name,city,district,institutionType,ownership,educationLevel,officialUrl]=line.split(delimiter).map(x=>x.trim().replace(/^"|"$/g,''));
  return{mebCode,name,city,district,institutionType,ownership:String(ownership||'').toUpperCase(),educationLevel,officialUrl};
 });
}

const emptyCopy={badge:'',title_line:'',title_emphasis:'',subtitle:'',license_title:'',license_text:'',cta_label:'',cta_url:'',support_phone:''};
const emptyInstitution={mebCode:'',name:'',city:'',district:''};
const emptyScope={scopeType:'INSTITUTION',mebCode:'',city:'',district:''};
const lifecycleLabels:Record<string,string>={ACTIVE:'Etkinleştir',PASSIVE:'Pasife al',FROZEN:'Dondur',ARCHIVED:'Sil / arşivle'};

export function ResultNetworkAdmin(){
 const[exams,setExams]=useState<any[]>([]);
 const[data,setData]=useState<any>({administrations:[],directoryCount:0});
 const[governance,setGovernance]=useState<any>({institutions:[],dealers:[],events:[],candidates:[]});
 const[copy,setCopy]=useState<any>(emptyCopy);
 const[examId,setExamId]=useState('');
 const[sourceUrl,setSourceUrl]=useState('https://www.meb.gov.tr/baglantilar/okullar/index.php');
 const[rows,setRows]=useState<any[]>([]);
 const[institutionForm,setInstitutionForm]=useState(emptyInstitution);
 const[dealerUserId,setDealerUserId]=useState('');
 const[dealerName,setDealerName]=useState('');
 const[selectedDealerId,setSelectedDealerId]=useState('');
 const[scopeForm,setScopeForm]=useState(emptyScope);
 const[busy,setBusy]=useState(false);
 const[error,setError]=useState('');
 const[notice,setNotice]=useState('');

 const load=async()=>{
  const[e,a,p,g]=await Promise.all([
   api<any>('/api/exam-definitions'),
   api<any>('/api/admin/result-network/administrations'),
   api<any>('/api/admin/result-network/portal-settings'),
   api<any>('/api/admin/result-network/governance'),
  ]);
  setExams(e.exams||[]);setData(a);setGovernance(g);setCopy(p.copy||emptyCopy);
  if(!examId&&e.exams?.[0])setExamId(e.exams[0].id);
  if(!dealerUserId&&g.candidates?.[0])setDealerUserId(g.candidates[0].id);
  if(!selectedDealerId&&g.dealers?.[0])setSelectedDealerId(g.dealers[0].id);
 };
 useEffect(()=>{void load().catch(e=>setError(e.message))},[]);

 const action=async(work:()=>Promise<unknown>,success:string)=>{
  setBusy(true);setError('');setNotice('');
  try{await work();setNotice(success);await load()}catch(e:any){setError(e.message)}finally{setBusy(false)}
 };
 const importRows=()=>action(async()=>{
  let total=0;
  for(let i=0;i<rows.length;i+=5000){
   const r=await api<any>('/api/admin/institution-directory/import',{method:'POST',body:JSON.stringify({sourceType:'MEB_OFFICIAL_EXPORT',sourceUrl,rows:rows.slice(i,i+5000)})});
   total+=r.rowsUpserted;
  }
  setNotice(`${total.toLocaleString('tr-TR')} kurum referans dizinine işlendi.`);
 },'Kurum dizini güncellendi.');
 const createAdministration=()=>action(()=>api('/api/admin/result-network/administrations',{method:'POST',body:JSON.stringify({examId})}),'Sınav sonuç ağına taslak olarak eklendi.');
 const publish=async(id:string)=>{if(window.confirm('Bu sınav sonuç ağında yayınlansın mı? Saklama süresi bu anda başlayacak.'))await action(()=>api(`/api/admin/result-network/administrations/${id}/publish`,{method:'POST'}),'Sınav tüm ANUNEX kanallarında yayınlandı.')};
 const savePortal=()=>action(async()=>{const r=await api<any>('/api/admin/result-network/portal-settings',{method:'PATCH',body:JSON.stringify(copy)});setCopy(r.copy)},'sonuc.anunex.com marka ve iletişim içeriği yayınlandı.');
 const createInstitution=()=>action(()=>api('/api/admin/result-network/institutions',{method:'POST',body:JSON.stringify(institutionForm)}),'Kurum etkin olarak açıldı.').then(()=>setInstitutionForm(emptyInstitution));
 const changeInstitutionStatus=async(row:any,status:string)=>{
  const reason=window.prompt(`${row.name} için “${lifecycleLabels[status]}” işleminin gerekçesi:`);
  if(reason===null)return;
  await action(()=>api(`/api/admin/result-network/institutions/${row.id}/status`,{method:'POST',body:JSON.stringify({status,reason})}),`Kurum durumu ${status} olarak güncellendi.`);
 };
 const approveDealer=()=>action(()=>api('/api/admin/result-network/dealers',{method:'POST',body:JSON.stringify({userId:dealerUserId,displayName:dealerName})}),'Bayi hesabı onaylandı.');
 const changeDealerStatus=async(dealer:any,status:string)=>{
  const reason=status==='APPROVED'?'Süper Admin onayı':window.prompt('Bayi durum değişikliği gerekçesi:');
  if(reason===null)return;
  await action(()=>api(`/api/admin/result-network/dealers/${dealer.id}/status`,{method:'POST',body:JSON.stringify({status,reason})}),`Bayi durumu ${status} olarak güncellendi.`);
 };
 const addScope=()=>action(()=>api(`/api/admin/result-network/dealers/${selectedDealerId}/scopes`,{method:'POST',body:JSON.stringify(scopeForm)}),'Bayi kapsamı tanımlandı.').then(()=>setScopeForm(emptyScope));
 const removeScope=(dealerId:string,scopeId:string)=>action(()=>api(`/api/admin/result-network/dealers/${dealerId}/scopes/${scopeId}`,{method:'DELETE'}),'Bayi kapsamı kaldırıldı.');
 const field=(key:string,label:string,wide=false)=><label className={wide?'portal-copy-wide':''}>{label}{key.endsWith('_text')||key==='subtitle'?<textarea rows={3} value={copy[key]||''} onChange={e=>setCopy({...copy,[key]:e.target.value})}/>:<input value={copy[key]||''} onChange={e=>setCopy({...copy,[key]:e.target.value})}/>}</label>;

 return <>
  <div className="page-head"><div><span className="eyebrow">Lisanssız ölçme değerlendirme</span><h1>Sonuç Ağı Yönetimi</h1><p>Sınav yayınlarını, resmî kurum dizinini ve sonuc.anunex.com marka deneyimini tek merkezden yönetin.</p></div><Globe2/></div>
  {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}
  <div className="kpi-grid">
   <div className="kpi-card"><span>MEB referans kurumu</span><strong>{Number(data.directoryCount||0).toLocaleString('tr-TR')}</strong></div>
   <div className="kpi-card"><span>Sonuç ağı sınavı</span><strong>{(data.administrations||[]).length}</strong></div>
   <div className="kpi-card"><span>Canlı portal</span><strong>Aktif</strong><a href="https://sonuc.anunex.com" target="_blank" rel="noreferrer">Görüntüle <ExternalLink size={14}/></a></div>
  </div>

  <section className="panel" style={{marginTop:18}}>
   <div className="panel-head"><div><h2>Kurum açma ve yaşam döngüsü</h2><p>MEB koduyla açılan kurumun adı ve konumu doğrulanmış dizinden alınır. Dondurma, pasife alma ve arşivleme aktif oturumları kapatır.</p></div><Building2/></div>
   <div className="form-grid">
    <label>MEB kurum kodu<input value={institutionForm.mebCode} onChange={e=>setInstitutionForm({...institutionForm,mebCode:e.target.value.replace(/\D/g,'')})} placeholder="Doğrulanmış kurum için"/></label>
    <label>Manuel kurum adı<input value={institutionForm.name} onChange={e=>setInstitutionForm({...institutionForm,name:e.target.value})} placeholder="Yalnız MEB kodu yoksa"/></label>
    <label>İl<input value={institutionForm.city} onChange={e=>setInstitutionForm({...institutionForm,city:e.target.value})}/></label>
    <label>İlçe<input value={institutionForm.district} onChange={e=>setInstitutionForm({...institutionForm,district:e.target.value})}/></label>
   </div>
   <button className="primary" disabled={busy||(!institutionForm.mebCode&&(!institutionForm.name||!institutionForm.city||!institutionForm.district))} onClick={()=>void createInstitution()}><Building2/> Kurumu aç</button>
   <div className="cards-list" style={{marginTop:16}}>{(governance.institutions||[]).slice(0,50).map((x:any)=><div className="list-card" key={x.id}><div><strong>{x.name}</strong><span>{x.code} · {x.city}/{x.district}</span><small>Durum: {x.lifecycle_status}</small></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{['ACTIVE','PASSIVE','FROZEN','ARCHIVED'].map(status=>status!==x.lifecycle_status&&<button className="ghost" key={status} disabled={busy} onClick={()=>void changeInstitutionStatus(x,status)}>{lifecycleLabels[status]}</button>)}</div></div>)}</div>
  </section>

  <section className="panel" style={{marginTop:18}}>
   <div className="panel-head"><div><h2>Bayi onayı ve işlem kapsamı</h2><p>Bayi yetkisi kullanıcı rolünden bağımsızdır; yalnız Süper Admin onayı ve aktif kurum/ilçe/il/ulusal kapsamla çalışır.</p></div><UserCheck/></div>
   <div className="form-grid">
    <label>Kullanıcı<select value={dealerUserId} onChange={e=>setDealerUserId(e.target.value)}><option value="">Kullanıcı seçin</option>{(governance.candidates||[]).map((x:any)=><option key={x.id} value={x.id}>{x.display_name} · {x.email||x.username||x.role}</option>)}</select></label>
    <label>Bayi görünen adı<input value={dealerName} onChange={e=>setDealerName(e.target.value)} placeholder="Örn. İstanbul Anadolu Bayisi"/></label>
   </div>
   <button className="primary" disabled={busy||!dealerUserId} onClick={()=>void approveDealer()}><UserCheck/> Bayiyi onayla</button>
   {!!governance.dealers?.length&&<div className="form-grid" style={{marginTop:18}}>
    <label>Kapsam verilecek bayi<select value={selectedDealerId} onChange={e=>setSelectedDealerId(e.target.value)}>{governance.dealers.map((x:any)=><option key={x.id} value={x.id}>{x.display_name||x.user_name} · {x.status}</option>)}</select></label>
    <label>Kapsam türü<select value={scopeForm.scopeType} onChange={e=>setScopeForm({...scopeForm,scopeType:e.target.value})}><option value="INSTITUTION">Kurum</option><option value="DISTRICT">İlçe</option><option value="CITY">İl</option><option value="NATIONAL">Türkiye geneli</option></select></label>
    {scopeForm.scopeType==='INSTITUTION'&&<label>MEB kodu<input value={scopeForm.mebCode} onChange={e=>setScopeForm({...scopeForm,mebCode:e.target.value.replace(/\D/g,'')})}/></label>}
    {(scopeForm.scopeType==='CITY'||scopeForm.scopeType==='DISTRICT')&&<label>İl<input value={scopeForm.city} onChange={e=>setScopeForm({...scopeForm,city:e.target.value})}/></label>}
    {scopeForm.scopeType==='DISTRICT'&&<label>İlçe<input value={scopeForm.district} onChange={e=>setScopeForm({...scopeForm,district:e.target.value})}/></label>}
   </div>}
   {!!governance.dealers?.length&&<button className="secondary" disabled={busy||!selectedDealerId} onClick={()=>void addScope()}><ShieldCheck/> Kapsamı tanımla</button>}
   <div className="cards-list" style={{marginTop:16}}>{(governance.dealers||[]).map((dealer:any)=><div className="list-card" key={dealer.id}><div><strong>{dealer.display_name||dealer.user_name}</strong><span>{dealer.email||dealer.username} · {dealer.status}</span><small>{(dealer.scopes||[]).filter((x:any)=>x.active).map((scope:any)=>`${scope.scope_type}: ${scope.meb_code||[scope.city,scope.district].filter(Boolean).join('/')||'Türkiye'}`).join(' · ')||'Aktif kapsam yok'}</small></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{dealer.status!=='APPROVED'&&<button className="ghost" onClick={()=>void changeDealerStatus(dealer,'APPROVED')}>Onayla</button>}{dealer.status==='APPROVED'&&<button className="ghost" onClick={()=>void changeDealerStatus(dealer,'SUSPENDED')}>Askıya al</button>}{dealer.status!=='REVOKED'&&<button className="ghost" onClick={()=>void changeDealerStatus(dealer,'REVOKED')}>Yetkiyi kaldır</button>}{(dealer.scopes||[]).filter((x:any)=>x.active).map((scope:any)=><button className="ghost" key={scope.id} onClick={()=>void removeScope(dealer.id,scope.id)}>Kapsamı kaldır</button>)}</div></div>)}</div>
  </section>

  <section className="panel" style={{marginTop:18}}><div className="panel-head"><div><h2>sonuc.anunex.com görünüm ve iletişim yönetimi</h2><p>Portal mesajını ve lisanslı ürüne yönlendiren çağrıyı yönetin. Sabit ANUNEX ve Nibiru logoları marka kilididir; değiştirilemez.</p></div><Settings2/></div><div className="grid-2">{field('badge','Üst marka mesajı')}{field('support_phone','Destek telefonu')}{field('title_line','Ana başlık')}{field('title_emphasis','Vurgulu başlık')}{field('subtitle','Açıklama',true)}{field('license_title','Lisans çağrısı başlığı')}{field('license_text','Lisans çağrısı açıklaması',true)}{field('cta_label','Buton metni')}{field('cta_url','Buton bağlantısı')}</div><div style={{display:'flex',gap:10,marginTop:16}}><button className="primary" disabled={busy} onClick={()=>void savePortal()}><Save/> Canlı portalı güncelle</button><a className="ghost" href="https://sonuc.anunex.com" target="_blank" rel="noreferrer"><ExternalLink/> Önizlemeyi aç</a></div></section>

  <div className="grid-2" style={{marginTop:18}}>
   <section className="panel"><div className="panel-head"><div><h2>MEB kurum referans dizini</h2><p>Resmî CSV dışa aktarımını içeri alın. Bu kayıtlar lisans veya aktif tenant oluşturmaz.</p></div><Building2/></div><label>Resmî kaynak URL<input value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)}/></label><label>CSV dosyası<input type="file" accept=".csv,text/csv" onChange={e=>{const file=e.target.files?.[0];if(file)void file.text().then(x=>setRows(parseDirectory(x)))}}/></label><p className="muted">Sütunlar: MEB kodu, kurum adı, il, ilçe, tür, PUBLIC/PRIVATE, kademe, resmî URL.</p><button className="primary" disabled={busy||!rows.length||!sourceUrl.startsWith('https://')} onClick={()=>void importRows()}><FileUp/> {rows.length?`${rows.length.toLocaleString('tr-TR')} kurumu aktar`:'CSV seçin'}</button></section>
   <section className="panel"><div className="panel-head"><div><h2>Tanımlı sınavı sonuç ağına aç</h2><p>Sınav tanımı, cevap anahtarı, kazanımlar ve videolar kalıcı katalogda kalır.</p></div><Send/></div><label>Sınav<select value={examId} onChange={e=>setExamId(e.target.value)}>{exams.map(x=><option key={x.id} value={x.id}>{x.academic_year} · {x.title}</option>)}</select></label><button className="primary" disabled={busy||!examId} onClick={()=>void createAdministration()}>Taslak sonuç ağı oluştur</button></section>
  </div>
  <section className="panel" style={{marginTop:18}}><div className="panel-head"><div><h2>Yıl → sınav arşivi ve yayınlar</h2><p>Her yeni uygulama ayrı katılımcı kümesi ve ayrı silinme tarihi taşır.</p></div><button className="ghost" onClick={()=>void load()}><RefreshCw/> Yenile</button></div><div className="cards-list">{(data.administrations||[]).map((x:any)=><div className="list-card" key={x.id}><div><strong>{x.academic_year} · {x.publisher_name?`${x.publisher_name} · `:''}{x.title}</strong><span>{x.exam_type} · {x.linked_institutions} kurum · {x.access_count} öğrenci erişimi</span><small>Durum: {x.status}{x.retention_due_at?` · Kişisel veri silinme: ${new Date(x.retention_due_at).toLocaleDateString('tr-TR')}`:''}</small></div>{x.status==='DRAFT'&&<button className="primary" disabled={busy} onClick={()=>void publish(x.id)}>Yayınla</button>}</div>)}{!data.administrations?.length&&<div className="empty">Henüz sonuç ağına açılmış sınav yok.</div>}</div></section>
 </>;
}
