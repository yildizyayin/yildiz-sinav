import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Building2, CheckCircle2, ChevronRight, FileUp, Globe2, LockKeyhole, Network, Play, RefreshCw, Save, Search, Send, Settings2, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, ApiError, qs } from '../api';
import { useAuth } from '../auth';

type ExamRow = {
  id:string; title:string; exam_type:string; grade_level:number|null; academic_year:string; exam_date:string|null; status:string;
  scope:'INSTITUTION'|'NETWORK'|'CENTRAL'; catalog_code:string|null; verified_catalog:number; result_freeze_status:string|null;
  snapshot_version:number|null; published_at:string|null; publisher_name:string|null; network_name:string|null; publisher_id?:string|null; network_id?:string|null; participant_count:number; booklet_codes:string|null;
};

export function ExamCenter(){
  const {user}=useAuth();
  const [rows,setRows]=useState<ExamRow[]>([]); const [q,setQ]=useState(''); const [scope,setScope]=useState(''); const [selected,setSelected]=useState<ExamRow|null>(null);
  const [files,setFiles]=useState<File[]>([]); const [fileIndex,setFileIndex]=useState(0); const file=files[fileIndex]||null; const [preview,setPreview]=useState<any>(null); const [batch,setBatch]=useState<any>(null); const [templates,setTemplates]=useState<any[]>([]); const [templateId,setTemplateId]=useState('');
  const [loading,setLoading]=useState(false); const [error,setError]=useState(''); const [notice,setNotice]=useState(''); const [stats,setStats]=useState<any>(null);
  const isSuper=user?.role==='SUPER_ADMIN';

  const load=async()=>{const r=await api<any>(`/api/platform/exam-center/catalog${qs({q:q||null,scope:scope||null})}`);setRows(r.exams||[]);if(selected){const fresh=(r.exams||[]).find((x:ExamRow)=>x.id===selected.id);if(fresh)setSelected(fresh)}};
  useEffect(()=>{void load().catch(e=>setError(e.message))},[]);
  useEffect(()=>{const t=setTimeout(()=>void load().catch(e=>setError(e.message)),250);return()=>clearTimeout(t)},[q,scope]);
  const readyRows=useMemo(()=>rows.filter(r=>r.status==='ACTIVE'||r.status==='CLOSED'),[rows]);

  const loadBatch=async(id:string)=>{const r=await api<any>(`/api/scan-batches/${id}`);setBatch(r)};
  const upload=async()=>{
    if(!selected||!file)return;setLoading(true);setError('');setNotice('');setTemplates([]);
    const fd=new FormData();fd.append('file',file);if(templateId)fd.append('templateVersionId',templateId);
    try{const r=await api<any>(`/api/exams/${selected.id}/preview-file`,{method:'POST',body:fd});setPreview(r);await loadBatch(r.batchId);setNotice(`${file.name}: ${r.total||0} kayıt okundu. Sistem yalnız kontrol gereken kayıtları ayrıca gösterecek.`)}
    catch(e){if(e instanceof ApiError){setError(e.message);const d:any=e.details;if(d?.templates)setTemplates(d.templates)}else setError('Dosya okunamadı.')}
    finally{setLoading(false)}
  };
  const evaluate=async()=>{if(!preview?.batchId)return;setLoading(true);setError('');try{const r=await api<any>(`/api/scan-batches/${preview.batchId}/evaluate`,{method:'POST'});const processed=r.processed||preview.total||0;await loadBatch(preview.batchId);await load();if(fileIndex<files.length-1){setNotice(`${file?.name}: ${processed} sonuç işlendi. Sıradaki dosya hazır.`);setFileIndex(x=>x+1);setPreview(null);setBatch(null);setTemplates([]);setTemplateId('')}else setNotice(`${processed} sonuç işlendi. Seçili tüm dosyalar tamamlandı.`)}catch(e:any){setError(e.message)}finally{setLoading(false)}};
  const acceptGuest=async(recordId:string)=>{if(!preview?.batchId)return;await api(`/api/scan-batches/${preview.batchId}/records/${recordId}/resolve`,{method:'POST',body:JSON.stringify({asNewGuest:true})});await loadBatch(preview.batchId)};
  const freeze=async()=>{if(!selected)return;setLoading(true);setError('');try{const r=await api<any>(`/api/platform/exam-center/${selected.id}/freeze`,{method:'POST'});setNotice(`Sıralama snapshotı hazır · v${r.version} · ${r.stats?.participant_count||0} katılımcı`);await load()}catch(e:any){setError(e.message)}finally{setLoading(false)}};
  const publish=async()=>{if(!selected)return;setLoading(true);setError('');try{await api(`/api/platform/exam-center/${selected.id}/publish`,{method:'POST'});setNotice('Sonuçlar yayınlandı. Öğrenciler hazır snapshot üzerinden sonuç görecek.');await load()}catch(e:any){setError(e.message)}finally{setLoading(false)}};
  const loadStats=async()=>{if(!selected)return;setLoading(true);try{setStats(await api<any>(`/api/platform/exam-center/${selected.id}/stats`))}catch(e:any){setError(e.message)}finally{setLoading(false)}};
  const resetUpload=()=>{setPreview(null);setBatch(null);setFiles([]);setFileIndex(0);setTemplates([]);setTemplateId('');setError('');setNotice('')};
  const reviewRows=(batch?.records||[]).filter((r:any)=>['AMBIGUOUS','INVALID'].includes(r.match_status)||(r.issues||[]).length>0);

  return <>
    <div className="page-head"><div><span className="eyebrow">Sınav Merkezi</span><h1>Sınavı seç, veriyi bırak, sonucu al</h1><p>Merkezi yayınevi sınavlarında cevap anahtarı, kitapçık ve puanlama merkezden gelir. Kurum yalnız sınavı ve veriyi seçer.</p></div><button className="ghost" onClick={()=>void load()}><RefreshCw size={16}/> Yenile</button></div>
    {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}

    <div className="panel" style={{marginBottom:18}}>
      <div className="exam-search-row"><div className="exam-search"><Search size={18}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="3D TG4, Özdebir LGS, sınav kodu…"/></div><select value={scope} onChange={e=>setScope(e.target.value)}><option value="">Tüm sınavlar</option><option value="CENTRAL">Merkezi / Türkiye Geneli</option><option value="NETWORK">Zincir / Ağ</option><option value="INSTITUTION">Kurum Sınavı</option></select></div>
      <div className="scope-tabs"><button className={!scope?'active':''} onClick={()=>setScope('')}>Tümü</button><button className={scope==='CENTRAL'?'active':''} onClick={()=>setScope('CENTRAL')}><Globe2 size={15}/> Merkezi</button><button className={scope==='NETWORK'?'active':''} onClick={()=>setScope('NETWORK')}><Network size={15}/> Zincir</button><button className={scope==='INSTITUTION'?'active':''} onClick={()=>setScope('INSTITUTION')}><Building2 size={15}/> Kurum</button></div>
    </div>

    <div className="table-card exam-center-table" style={{marginBottom:18}}><table><thead><tr><th>Sınav</th><th>Kapsam</th><th>Katılım</th><th>Kitapçık</th><th>Durum</th><th></th></tr></thead><tbody>{readyRows.map(e=><tr key={e.id} className={selected?.id===e.id?'selected-row':''}><td><strong>{e.title}</strong><small>{[e.publisher_name,e.catalog_code,e.exam_type].filter(Boolean).join(' · ')}</small></td><td><ScopeBadge exam={e}/></td><td><strong>{Number(e.participant_count||0).toLocaleString('tr-TR')}</strong></td><td>{e.booklet_codes||'otomatik'}</td><td><span className={`status ${e.result_freeze_status==='PUBLISHED'?'ok':e.result_freeze_status==='FROZEN'?'warn':'neutral'}`}>{statusLabel(e.result_freeze_status)}</span></td><td><button className="secondary subtle" onClick={()=>{setSelected(e);setStats(null);resetUpload()}}>Aç <ChevronRight size={15}/></button></td></tr>)}{!readyRows.length&&<tr><td colSpan={6}><div className="empty">Aramaya uygun aktif sınav bulunamadı.</div></td></tr>}</tbody></table></div>

    {selected&&<div className="panel" style={{marginBottom:18}}>
      <div className="panel-head"><div><ScopeBadge exam={selected}/><h2 style={{marginTop:8}}>{selected.title}</h2><p>{selected.scope==='CENTRAL'?'Türkiye geneli katılımcılar arasında; il, ilçe, kurum, sınıf ve şube sıralaması.':selected.scope==='NETWORK'?'Zincir kurum ağı içinde Türkiye, il, ilçe, kampüs ve sınıf karşılaştırmaları.':'Kurum, sınıf ve şube sonuçları.'}</p></div><span className={`status ${selected.result_freeze_status==='PUBLISHED'?'ok':selected.result_freeze_status==='FROZEN'?'warn':'neutral'}`}>{statusLabel(selected.result_freeze_status)}</span></div>

      {!preview&&user?.role==='INSTITUTION_MANAGER'&&<div className="source-grid">
        <label className="source-card"><FileUp size={36}/><h2>Optik veri dosyaları</h2><p>8A, 8B, 8C gibi birden fazla TXT / DAT / CSV dosyasını aynı anda seçebilirsiniz.</p><input type="file" multiple accept=".txt,.dat,.csv,text/plain,text/csv" onChange={e=>{setFiles(Array.from(e.target.files||[]));setFileIndex(0);setPreview(null);setBatch(null)}}/>{files.length>0&&<div className="multi-upload-list">{files.map((f,i)=><div className={`multi-upload-item ${i===fileIndex?'active':''}`} key={`${f.name}-${i}`}><div><strong>{i<fileIndex?'✓ ':i===fileIndex?'▶ ':''}{f.name}</strong><span>{Math.max(1,Math.round(f.size/1024))} KB</span></div><span>{i<fileIndex?'İşlendi':i===fileIndex?'Sırada':'Bekliyor'}</span></div>)}</div>}{templates.length>0&&<select value={templateId} onChange={e=>setTemplateId(e.target.value)}><option value="">Optik seçin</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>}<button className="primary huge" onClick={upload} disabled={!file||loading}>{loading?'Analiz ediliyor…':files.length>1?`DOSYAYI ANALİZ ET (${fileIndex+1}/${files.length})`:'DOSYAYI ANALİZ ET'}</button></label>
        <div className="source-card"><Play size={36}/><h2>Kamera / gelişmiş okuma</h2><p>Telefon kamerası, kalibrasyon ve satır bazlı ayrıntılı kontrol için gelişmiş optik okuyucuyu kullanın.</p><Link className="primary full" to={`/exams/${selected.id}/evaluate`}>Kamera / Gelişmiş Okuma</Link></div>
      </div>}

      {preview&&<>
        <div className="summary-strip"><Summary label="Toplam" value={preview.total||0}/><Summary label="Aktif" value={preview.counts?.active||0}/><Summary label="Misafir" value={(preview.counts?.guest||0)+(preview.counts?.newGuest||0)}/><Summary label="Kontrol" value={reviewRows.length} warn/></div>
        {reviewRows.length>0&&<div className="panel warning-panel"><TriangleAlert/><div style={{width:'100%'}}><h3>{reviewRows.length} kayıt kontrol istiyor</h3><p>Düzgün kayıtlar kaybolmaz. Yalnız sorunlu satırları düzeltin veya misafir olarak devam ettirin.</p>{reviewRows.slice(0,30).map((r:any)=><div className="issue-row" key={r.id}><div><strong>{r.canonical?.name||r.canonical?.student_number||`Satır ${r.row_no}`}</strong><span>{(r.issues||[]).join(' · ')||r.match_status}</span></div>{['AMBIGUOUS','INVALID'].includes(r.match_status)&&<button className="secondary" onClick={()=>void acceptGuest(r.id)}>Misafir Olarak Devam</button>}</div>)}</div></div>}
        <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:12}}><button className="ghost" onClick={()=>{setPreview(null);setBatch(null)}}>Dosyayı Yeniden Seç</button><button className="primary huge" onClick={evaluate} disabled={loading||reviewRows.some((r:any)=>['AMBIGUOUS','INVALID'].includes(r.match_status))}><Send size={18}/> {fileIndex<files.length-1?'SONUÇLANDIR VE SIRADAKİ DOSYAYA GEÇ':'SINAVI SONUÇLANDIR'}</button></div>
      </>}

      <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:16}}><Link className="secondary" to={`/reports?examId=${selected.id}`}><BarChart3 size={16}/> Raporlar</Link>{isSuper&&<button className="secondary" onClick={()=>void loadStats()}><BarChart3 size={16}/> Katılım / İstatistik</button>}{isSuper&&selected.scope!=='INSTITUTION'&&<><button className="secondary" onClick={freeze} disabled={loading||selected.result_freeze_status==='PUBLISHED'}><LockKeyhole size={16}/> Sıralama Snapshotı Hazırla</button><button className="primary" onClick={publish} disabled={loading||selected.result_freeze_status!=='FROZEN'}><Send size={16}/> Sonuçları Yayınla</button></>}</div>

      {stats&&<div className="central-stats"><div className="summary-strip"><Summary label="Katılımcı" value={stats.stats?.participant_count||0}/><Summary label="Kurum" value={stats.stats?.institution_count||0}/><Summary label="İl" value={stats.stats?.city_count||0}/></div><div className="table-card"><table><thead><tr><th>İl</th><th>Katılımcı</th><th>Ort. Net</th><th>Ort. Puan</th></tr></thead><tbody>{(stats.cities||[]).slice(0,30).map((x:any)=><tr key={x.city}><td>{x.city}</td><td>{x.participant_count}</td><td>{fmt(x.avg_net)}</td><td>{fmt(x.avg_score)}</td></tr>)}</tbody></table></div></div>}

      {isSuper&&<CatalogEditor exam={selected} onSaved={async()=>{await load();setSelected(null)}} onError={setError} onNotice={setNotice}/>} 
    </div>}

    {isSuper&&<div className="panel"><div className="panel-head"><div><h2>Merkez yönetim araçları</h2><p>Yayınevi sınavı, cevap anahtarı, kazanım ve optik tanımları kurum ekranından ayrıdır.</p></div></div><div style={{display:'flex',gap:10,flexWrap:'wrap'}}><Link className="secondary" to="/exam-definitions">Gelişmiş Sınav Tanımı</Link><Link className="secondary" to="/opticals">Optik Şablon Merkezi</Link><Link className="secondary" to="/enterprise">Zincir / Yayınevi Yönetimi</Link></div></div>}
  </>;
}

function CatalogEditor({exam,onSaved,onError,onNotice}:{exam:ExamRow;onSaved:()=>Promise<void>;onError:(x:string)=>void;onNotice:(x:string)=>void}){
  const [publishers,setPublishers]=useState<any[]>([]);const [networks,setNetworks]=useState<any[]>([]);const [saving,setSaving]=useState(false);
  const [form,setForm]=useState({scope:exam.scope||'INSTITUTION',publisherId:exam.publisher_id||'',networkId:exam.network_id||'',catalogCode:exam.catalog_code||'',verifiedCatalog:!!exam.verified_catalog});
  useEffect(()=>{void Promise.all([api<any>('/api/platform/publishers').catch(()=>({publishers:[]})),api<any>('/api/platform/networks').catch(()=>({networks:[]}))]).then(([p,n])=>{setPublishers(p.publishers||[]);setNetworks(n.networks||[])})},[exam.id]);
  const save=async()=>{setSaving(true);onError('');try{if(form.scope==='CENTRAL'&&!form.verifiedCatalog)throw new Error('Merkezi / Türkiye Geneli sınavı doğrulanmış katalog sınavı olmalıdır.');if(form.scope==='NETWORK'&&!form.networkId)throw new Error('Zincir sınavı için kurum ağı seçin.');await api(`/api/platform/exam-center/${exam.id}/profile`,{method:'PUT',body:JSON.stringify({...form,publisherId:form.publisherId||null,networkId:form.scope==='NETWORK'?form.networkId:null})});onNotice('Sınav kapsamı ve katalog bilgileri kaydedildi.');await onSaved()}catch(e:any){onError(e.message)}finally{setSaving(false)}};
  return <div className="catalog-editor"><div className="panel-head"><div><h3>Merkezi katalog ayarları</h3><p>Bu alan yalnız Süper Admin içindir; kurum teknik ayrıntıları görmez.</p></div><Settings2 size={18}/></div><div className="form-grid"><label>Kapsam<select value={form.scope} onChange={e=>setForm(f=>({...f,scope:e.target.value as any}))}><option value="INSTITUTION">Kurum</option><option value="NETWORK">Zincir / Ağ</option><option value="CENTRAL">Merkezi / Türkiye Geneli</option></select></label><label>Yayınevi<select value={form.publisherId} onChange={e=>setForm(f=>({...f,publisherId:e.target.value}))}><option value="">Yayınevi seçilmedi</option>{publishers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{form.scope==='NETWORK'&&<label>Kurum ağı<select value={form.networkId} onChange={e=>setForm(f=>({...f,networkId:e.target.value}))}><option value="">Ağ seçin</option>{networks.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label>}<label>Sınav kodu<input value={form.catalogCode} onChange={e=>setForm(f=>({...f,catalogCode:e.target.value.toUpperCase()}))} placeholder="3D-TYT-TG4-2026"/></label></div><label className="catalog-check"><input type="checkbox" checked={form.verifiedCatalog} onChange={e=>setForm(f=>({...f,verifiedCatalog:e.target.checked}))}/><span>Doğrulanmış merkezi katalog sınavı</span></label><button className="secondary full" onClick={()=>void save()} disabled={saving}><Save size={16}/> {saving?'Kaydediliyor…':'Katalog Ayarlarını Kaydet'}</button></div>;
}
function ScopeBadge({exam}:{exam:ExamRow}){return <span className={`scope-badge ${exam.scope.toLowerCase()}`}>{exam.scope==='CENTRAL'?<><Globe2 size={13}/> Merkezi</>:exam.scope==='NETWORK'?<><Network size={13}/> Zincir</>:<><Building2 size={13}/> Kurum</>}{exam.verified_catalog?<CheckCircle2 size={13}/>:null}</span>}
function Summary({label,value,warn}:{label:string;value:number;warn?:boolean}){return <div className={warn&&value?'summary warn':'summary'}><span>{label}</span><strong>{Number(value||0).toLocaleString('tr-TR')}</strong></div>}
function statusLabel(v:string|null){return v==='PUBLISHED'?'Yayınlandı':v==='FROZEN'?'Yayına hazır':'Veri alınıyor'}
function fmt(v:any){return v==null?'—':Number(v).toFixed(2)}
