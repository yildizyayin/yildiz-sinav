import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, FileUp, LockKeyhole, Play, RefreshCw, Search, Send, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, ApiError, qs } from '../api';
import { useAuth } from '../auth';

type ExamRow = {
  id:string; title:string; exam_type:string; grade_level:number|null; academic_year:string; exam_date:string|null; status:string;
  scope:'INSTITUTION'|'NETWORK'|'CENTRAL'; catalog_code:string|null; verified_catalog:number; result_freeze_status:string|null;
  snapshot_version:number|null; published_at:string|null; publisher_name:string|null; network_name:string|null; participant_count:number; booklet_codes:string|null;
};

export function ExamCenter(){
  const {user}=useAuth();
  const [rows,setRows]=useState<ExamRow[]>([]); const [q,setQ]=useState(''); const [scope,setScope]=useState(''); const [selected,setSelected]=useState<ExamRow|null>(null);
  const [file,setFile]=useState<File|null>(null); const [preview,setPreview]=useState<any>(null); const [batch,setBatch]=useState<any>(null); const [templates,setTemplates]=useState<any[]>([]); const [templateId,setTemplateId]=useState('');
  const [loading,setLoading]=useState(false); const [error,setError]=useState(''); const [notice,setNotice]=useState('');

  const load=async()=>{const r=await api<any>(`/api/platform/exam-center/catalog${qs({q:q||null,scope:scope||null})}`);setRows(r.exams||[]);if(selected){const fresh=(r.exams||[]).find((x:ExamRow)=>x.id===selected.id);if(fresh)setSelected(fresh)}};
  useEffect(()=>{void load().catch(e=>setError(e.message))},[]);
  useEffect(()=>{const t=setTimeout(()=>void load().catch(e=>setError(e.message)),250);return()=>clearTimeout(t)},[q,scope]);
  const readyRows=useMemo(()=>rows.filter(r=>r.status==='ACTIVE'||r.status==='CLOSED'),[rows]);

  const loadBatch=async(id:string)=>{const r=await api<any>(`/api/scan-batches/${id}`);setBatch(r)};
  const upload=async()=>{
    if(!selected||!file)return;setLoading(true);setError('');setNotice('');setTemplates([]);
    const fd=new FormData();fd.append('file',file);if(templateId)fd.append('templateVersionId',templateId);
    try{const r=await api<any>(`/api/exams/${selected.id}/preview-file`,{method:'POST',body:fd});setPreview(r);await loadBatch(r.batchId);setNotice(`${r.total||0} kayıt okundu. Sistem yalnız kontrol gereken kayıtları ayrıca gösterecek.`)}
    catch(e){if(e instanceof ApiError){setError(e.message);const d:any=e.details;if(d?.templates)setTemplates(d.templates)}else setError('Dosya okunamadı.')}
    finally{setLoading(false)}
  };
  const evaluate=async()=>{if(!preview?.batchId)return;setLoading(true);setError('');try{const r=await api<any>(`/api/scan-batches/${preview.batchId}/evaluate`,{method:'POST'});setNotice(`${r.processed||preview.total||0} sonuç işlendi.`);await loadBatch(preview.batchId);await load()}catch(e:any){setError(e.message)}finally{setLoading(false)}};
  const acceptGuest=async(recordId:string)=>{if(!preview?.batchId)return;await api(`/api/scan-batches/${preview.batchId}/records/${recordId}/resolve`,{method:'POST',body:JSON.stringify({asNewGuest:true})});await loadBatch(preview.batchId)};
  const freeze=async()=>{if(!selected)return;setLoading(true);setError('');try{const r=await api<any>(`/api/platform/exam-center/${selected.id}/freeze`,{method:'POST'});setNotice(`Sıralama donduruldu · v${r.version} · ${r.stats?.participant_count||0} katılımcı`);await load()}catch(e:any){setError(e.message)}finally{setLoading(false)}};
  const publish=async()=>{if(!selected)return;setLoading(true);setError('');try{await api(`/api/platform/exam-center/${selected.id}/publish`,{method:'POST'});setNotice('Sonuçlar yayınlandı.');await load()}catch(e:any){setError(e.message)}finally{setLoading(false)}};
  const resetUpload=()=>{setPreview(null);setBatch(null);setFile(null);setTemplates([]);setTemplateId('');setError('');setNotice('')};
  const reviewRows=(batch?.records||[]).filter((r:any)=>['AMBIGUOUS','INVALID'].includes(r.match_status)||(r.issues||[]).length>0);

  return <>
    <div className="page-head"><div><span className="eyebrow">Sınav Merkezi</span><h1>Sınavı seç, veriyi bırak, sonucu al</h1><p>Merkezi yayınevi sınavlarında cevap anahtarı, kitapçık, puanlama ve optik bilgileri merkezden gelir. Kurum yalnız sınavı ve veriyi seçer.</p></div><button className="ghost" onClick={()=>void load()}><RefreshCw size={16}/> Yenile</button></div>
    {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}

    <div className="panel" style={{marginBottom:18}}>
      <div className="form-grid"><label><Search size={15}/> Sınav ara<input value={q} onChange={e=>setQ(e.target.value)} placeholder="3D TG4, LGS, sınav kodu…"/></label><label>Kapsam<select value={scope} onChange={e=>setScope(e.target.value)}><option value="">Tümü</option><option value="CENTRAL">Merkezi / Türkiye Geneli</option><option value="NETWORK">Kurum Ağı</option><option value="INSTITUTION">Kurum Sınavı</option></select></label></div>
      <div className="exam-grid" style={{marginTop:14}}>{readyRows.map(e=><button key={e.id} type="button" className={selected?.id===e.id?'exam-card selected':'exam-card'} style={{textAlign:'left'}} onClick={()=>{setSelected(e);resetUpload()}}><div className="exam-top"><span className="pill">{e.scope==='CENTRAL'?'MERKEZİ':e.scope==='NETWORK'?'AĞ':'KURUM'}</span>{e.verified_catalog?<span className="verified"><CheckCircle2 size={14}/> Doğrulanmış</span>:null}</div><h3>{e.title}</h3><p>{e.publisher_name?`${e.publisher_name} · `:''}{e.exam_type}{e.catalog_code?` · ${e.catalog_code}`:''}</p><div className="exam-meta"><span>Katılımcı <strong>{e.participant_count||0}</strong></span><span>Kitapçık <strong>{e.booklet_codes||'otomatik'}</strong></span></div></button>)}</div>
      {!readyRows.length&&<div className="empty-state">Aramaya uygun aktif sınav bulunamadı.</div>}
    </div>

    {selected&&<div className="panel" style={{marginBottom:18}}>
      <div className="panel-head"><div><h2>{selected.title}</h2><p>{selected.scope==='CENTRAL'?'Türkiye geneli katılımcılar arasında sıralama üretir.':selected.scope==='NETWORK'?'Ağ içindeki kurumları Türkiye → il → ilçe → kurum düzeyinde karşılaştırır.':'Kurum → sınıf → şube sonuçları.'}</p></div><span className={`status ${selected.result_freeze_status==='PUBLISHED'?'ok':selected.result_freeze_status==='FROZEN'?'warn':'neutral'}`}>{selected.result_freeze_status||'OPEN'}</span></div>
      {!preview&&<div className="source-grid">
        <label className="source-card"><FileUp size={36}/><h2>TXT / DAT / CSV</h2><p>Dosyayı seçin. Optik format mümkünse otomatik algılanır.</p><input type="file" accept=".txt,.dat,.csv,text/plain,text/csv" onChange={e=>setFile(e.target.files?.[0]||null)}/>{file&&<strong>{file.name}</strong>}{templates.length>0&&<select value={templateId} onChange={e=>setTemplateId(e.target.value)}><option value="">Optik seçin</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>}<button className="primary huge" onClick={upload} disabled={!file||loading}>{loading?'Analiz ediliyor…':'DOSYAYI ANALİZ ET'}</button></label>
        <div className="source-card"><Play size={36}/><h2>Kamera / Ayrıntılı Okuma</h2><p>Telefon kamerası, kalibrasyon ve satır bazlı ayrıntılı kontrol için mevcut gelişmiş okuyucuyu kullanın.</p><Link className="primary full" to={`/exams/${selected.id}/evaluate`}>Kamera / Gelişmiş Okuma</Link></div>
      </div>}
      {preview&&<>
        <div className="summary-strip"><Summary label="Toplam" value={preview.total||0}/><Summary label="Aktif" value={preview.counts?.active||0}/><Summary label="Misafir" value={(preview.counts?.guest||0)+(preview.counts?.newGuest||0)}/><Summary label="Kontrol" value={reviewRows.length} warn/></div>
        {reviewRows.length>0&&<div className="panel warning-panel"><TriangleAlert/><div style={{width:'100%'}}><h3>{reviewRows.length} kayıt kontrol istiyor</h3><p>Düzgün kayıtlar kaybolmaz. Yalnız sorunlu satırları düzeltin veya misafir olarak devam ettirin.</p>{reviewRows.slice(0,30).map((r:any)=><div className="issue-row" key={r.id}><div><strong>{r.canonical?.name||r.canonical?.student_number||`Satır ${r.row_no}`}</strong><span>{(r.issues||[]).join(' · ')||r.match_status}</span></div>{['AMBIGUOUS','INVALID'].includes(r.match_status)&&<button className="secondary" onClick={()=>void acceptGuest(r.id)}>Misafir Olarak Devam</button>}</div>)}</div></div>}
        <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:12}}><button className="ghost" onClick={resetUpload}>Başka Dosya</button><button className="primary huge" onClick={evaluate} disabled={loading||reviewRows.some((r:any)=>['AMBIGUOUS','INVALID'].includes(r.match_status))}><Send size={18}/> SINAVI SONUÇLANDIR</button></div>
      </>}
      <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:16}}><Link className="secondary" to={`/reports?examId=${selected.id}`}><BarChart3 size={16}/> Raporlar</Link>{user?.role==='SUPER_ADMIN'&&selected.scope!=='INSTITUTION'&&<><button className="secondary" onClick={freeze} disabled={loading}><LockKeyhole size={16}/> Sıralamayı Dondur</button><button className="primary" onClick={publish} disabled={loading||selected.result_freeze_status!=='FROZEN'}><Send size={16}/> Sonuçları Yayınla</button></>}</div>
    </div>}

    {user?.role==='SUPER_ADMIN'&&<div className="panel"><div className="panel-head"><div><h2>Merkez yönetim araçları</h2><p>Yeni yayınevi/merkezi sınav tanımı, cevap anahtarı, kazanım ve optik eşleştirmesi gelişmiş tanım ekranında kalır; kurum kullanıcıları bu teknik adımları görmez.</p></div></div><div style={{display:'flex',gap:10,flexWrap:'wrap'}}><Link className="secondary" to="/exam-definitions">Gelişmiş Sınav Tanımı</Link><Link className="secondary" to="/opticals">Optik Şablon Merkezi</Link><Link className="secondary" to="/enterprise">Zincir / Merkezi Sınav Yönetimi</Link></div></div>}
  </>;
}
function Summary({label,value,warn}:{label:string;value:number;warn?:boolean}){return <div className={warn&&value?'summary warn':'summary'}><span>{label}</span><strong>{value}</strong></div>}
