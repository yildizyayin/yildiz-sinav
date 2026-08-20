import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, CopyPlus, FileUp, FlaskConical, Plus, Save, ScanLine, Send } from 'lucide-react';
import { api } from '../api';

type Section = 'parser' | 'camera' | 'print' | 'fiducials';

const EXAMPLES: Record<Section, string> = {
  parser: JSON.stringify({
    type: 'fixed-width',
    recordLength: 120,
    signature: '',
    fields: {
      student_number: { start: 0, end: 8 },
      name: { start: 8, end: 38 },
      class: { start: 38, end: 42 },
      booklet: { start: 42, end: 43 },
    },
    answers: { MAT: { start: 43, end: 63 }, TUR: { start: 63, end: 83 } },
  }, null, 2),
  camera: JSON.stringify({
    regions: [
      { id: 'student-number', type: 'bubble-grid', xMm: 0, yMm: 0, widthMm: 10, heightMm: 10 },
      { id: 'answers-main', type: 'answers', xMm: 0, yMm: 0, widthMm: 10, heightMm: 10 },
    ],
  }, null, 2),
  print: JSON.stringify({
    fields: [
      { key: 'studentName', xMm: 0, yMm: 0 },
      { key: 'studentNumber', xMm: 0, yMm: 0 },
      { key: 'class', xMm: 0, yMm: 0 },
    ],
  }, null, 2),
  fiducials: JSON.stringify({ targets: [[0, 0], [10, 0], [0, 10], [10, 10]] }, null, 2),
};

export function Opticals() {
  const [templates,setTemplates]=useState<any[]>([]);
  const [selectedTemplateId,setSelectedTemplateId]=useState('');
  const [templateDetail,setTemplateDetail]=useState<any>(null);
  const [selectedVersionId,setSelectedVersionId]=useState('');
  const [versionDetail,setVersionDetail]=useState<any>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [newTemplate,setNewTemplate]=useState({name:'',vendor:'',version:'v1',pageWidthMm:210,pageHeightMm:297});
  const [newVersion,setNewVersion]=useState('');
  const [editors,setEditors]=useState<Record<Section,string>>({parser:'',camera:'',print:'',fiducials:''});
  const [sample,setSample]=useState<File|null>(null);
  const [parserTest,setParserTest]=useState<any>(null);
  const [asset,setAsset]=useState<File|null>(null);
  const [assetType,setAssetType]=useState('BLANK_FORM');

  const loadTemplates=async()=>{const r=await api<any>('/api/optical-definitions');setTemplates(r.templates||[])};
  const loadTemplate=async(id:string)=>{if(!id){setTemplateDetail(null);return}const r=await api<any>(`/api/optical-definitions/${id}`);setTemplateDetail(r);if(!selectedVersionId||!(r.versions||[]).some((v:any)=>v.id===selectedVersionId)){const first=r.versions?.[0]?.id||'';setSelectedVersionId(first)}};
  const loadVersion=async(id:string)=>{if(!id){setVersionDetail(null);return}const r=await api<any>(`/api/optical-definition-versions/${id}`);setVersionDetail(r);setEditors({
    parser: pretty(r.version.parser_definition),
    camera: pretty(r.version.camera_geometry),
    print: pretty(r.version.print_fields),
    fiducials: pretty(r.version.fiducials),
  });setParserTest(null)};

  useEffect(()=>{void loadTemplates().catch(e=>setError(e.message))},[]);
  useEffect(()=>{if(selectedTemplateId)void loadTemplate(selectedTemplateId).catch(e=>setError(e.message))},[selectedTemplateId]);
  useEffect(()=>{if(selectedVersionId)void loadVersion(selectedVersionId).catch(e=>setError(e.message))},[selectedVersionId]);

  const selectedTemplate=useMemo(()=>templates.find(t=>t.id===selectedTemplateId),[templates,selectedTemplateId]);
  const selectedVersion=versionDetail?.version;
  const readiness=versionDetail?.readiness;

  const createTemplate=async()=>{
    setBusy(true);setError('');setNotice('');
    try{const r=await api<any>('/api/optical-definitions',{method:'POST',body:JSON.stringify(newTemplate)});setNotice('Optik taslağı oluşturuldu. Gerçek form/FMT verileriyle tanımı tamamlayın.');await loadTemplates();setSelectedTemplateId(r.templateId);setSelectedVersionId(r.versionId);setNewTemplate({name:'',vendor:'',version:'v1',pageWidthMm:210,pageHeightMm:297})}catch(e:any){setError(e.message)}finally{setBusy(false)}
  };

  const createVersion=async()=>{
    if(!selectedTemplateId||!newVersion.trim())return;setBusy(true);setError('');setNotice('');
    try{const r=await api<any>(`/api/optical-definitions/${selectedTemplateId}/versions`,{method:'POST',body:JSON.stringify({version:newVersion.trim(),cloneFromVersionId:selectedVersionId||null})});setNotice('Yeni taslak sürüm oluşturuldu. Parser testi yeni sürümde yeniden yapılmalıdır.');setNewVersion('');await loadTemplate(selectedTemplateId);setSelectedVersionId(r.versionId)}catch(e:any){setError(e.message)}finally{setBusy(false)}
  };

  const saveSection=async(section:Section)=>{
    if(!selectedVersionId)return;setBusy(true);setError('');setNotice('');
    try{const definition=JSON.parse(editors[section]);const r=await api<any>(`/api/optical-definition-versions/${selectedVersionId}/${section}`,{method:'PUT',body:JSON.stringify({definition})});setNotice(`${sectionLabel(section)} tanımı kaydedildi.`);setVersionDetail((d:any)=>({...d,readiness:r.readiness}));await loadVersion(selectedVersionId)}catch(e:any){setError(e.message)}finally{setBusy(false)}
  };

  const testParser=async()=>{
    if(!selectedVersionId||!sample)return;setBusy(true);setError('');setNotice('');
    try{const sampleText=await sample.text();const r=await api<any>(`/api/optical-definition-versions/${selectedVersionId}/test-parser`,{method:'POST',body:JSON.stringify({sampleText,fileName:sample.name})});setParserTest(r);setNotice(r.passed?`Parser testi geçti: ${r.recordCount} kayıt okundu.`:'Parser testi tamamlandı fakat yayın koşullarını geçmedi.');await loadVersion(selectedVersionId)}catch(e:any){setError(e.message)}finally{setBusy(false)}
  };

  const uploadAsset=async()=>{
    if(!selectedVersionId||!asset)return;setBusy(true);setError('');setNotice('');
    try{const fd=new FormData();fd.append('file',asset);fd.append('assetType',assetType);await api(`/api/optical-definition-versions/${selectedVersionId}/assets`,{method:'POST',body:fd});setNotice('Referans dosyası R2 alanına kaydedildi.');setAsset(null);await loadVersion(selectedVersionId)}catch(e:any){setError(e.message)}finally{setBusy(false)}
  };

  const publish=async()=>{
    if(!selectedVersionId||!confirm('Bu optik sürümü yayına alınsın mı? Önceki aktif sürüm pasife alınacaktır.'))return;setBusy(true);setError('');setNotice('');
    try{await api(`/api/optical-definition-versions/${selectedVersionId}/publish`,{method:'POST'});setNotice('Optik sürümü READY durumuna alındı. TXT/DAT, kamera ve baskı akışlarında aktif sürüm olarak kullanılacak.');await loadTemplates();await loadTemplate(selectedTemplateId);await loadVersion(selectedVersionId)}catch(e:any){setError(e.message)}finally{setBusy(false)}
  };

  return <>
    <div className="page-head"><div><span className="eyebrow">Optik Şablon Merkezi</span><h1>Tek optik tanımı, üç kullanım</h1><p>TXT/DAT parser, kamera geometrisi ve kişiye özel baskı koordinatlarını tek sürümlü şablonda yönetin. Gerçek piyasa değerleri verilmeden sistem tanım uydurmaz.</p></div></div>
    {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}

    <div className="table-card" style={{marginBottom:20}}><div style={{padding:20}}><h2>Yeni optik taslağı</h2><div className="form-grid"><label>Optik adı<input value={newTemplate.name} onChange={e=>setNewTemplate(f=>({...f,name:e.target.value}))} placeholder="Örn. Optik 129"/></label><label>Üretici / kaynak<input value={newTemplate.vendor} onChange={e=>setNewTemplate(f=>({...f,vendor:e.target.value}))} placeholder="Örn. Piyasa / Yayınevi"/></label><label>Sürüm<input value={newTemplate.version} onChange={e=>setNewTemplate(f=>({...f,version:e.target.value}))}/></label><label>Genişlik mm<input type="number" value={newTemplate.pageWidthMm} onChange={e=>setNewTemplate(f=>({...f,pageWidthMm:Number(e.target.value)}))}/></label><label>Yükseklik mm<input type="number" value={newTemplate.pageHeightMm} onChange={e=>setNewTemplate(f=>({...f,pageHeightMm:Number(e.target.value)}))}/></label></div><button className="primary" disabled={busy||!newTemplate.name.trim()} onClick={createTemplate}><Plus size={17}/> Taslak Oluştur</button></div></div>

    <div className="exam-grid" style={{marginBottom:20}}>{templates.map(t=><button type="button" className="exam-card" key={t.id} onClick={()=>setSelectedTemplateId(t.id)} style={{textAlign:'left',cursor:'pointer',outline:selectedTemplateId===t.id?'2px solid currentColor':'none'}}><div className="exam-top"><div className="quick-icon"><ScanLine/></div>{t.status==='READY'?<span className="verified"><CheckCircle2 size={15}/> Hazır</span>:<span className="warning"><CircleAlert size={15}/> Tanım gerekli</span>}</div><h3>{t.name}</h3><p>{t.vendor||'Genel'} · {t.version_count} sürüm</p><small>{t.active_version?`Aktif: ${t.active_version}`:'Henüz yayında sürüm yok'}</small></button>)}</div>

    {templateDetail&&<div className="panel" style={{marginBottom:20}}><div className="panel-head"><div><h2>{templateDetail.template.name}</h2><p>Sürüm seçin veya aktif sürümü kopyalayarak güvenli yeni taslak açın.</p></div></div><div className="form-grid"><label>Sürüm<select value={selectedVersionId} onChange={e=>setSelectedVersionId(e.target.value)}>{(templateDetail.versions||[]).map((v:any)=><option key={v.id} value={v.id}>{v.version}{v.active?' · AKTİF':''}</option>)}</select></label><label>Yeni sürüm<input value={newVersion} onChange={e=>setNewVersion(e.target.value)} placeholder="Örn. v2"/></label></div><button className="secondary" disabled={busy||!newVersion.trim()} onClick={createVersion}><CopyPlus size={17}/> Seçili Sürümden Yeni Taslak</button></div>}

    {versionDetail&&<>
      <div className="summary-strip" style={{marginBottom:20}}><Ready label="Parser" ok={readiness?.parser}/><Ready label="Parser Testi" ok={readiness?.parserTestPassed}/><Ready label="Kamera" ok={readiness?.camera}/><Ready label="Baskı" ok={readiness?.print}/><Ready label="Referans" ok={readiness?.fiducials}/></div>
      {selectedVersion?.active&&<div className="alert success">Bu sürüm yayında ve kilitli. Değişiklik için yeni sürüm oluşturun.</div>}
      {!selectedVersion?.active&&<div className="editor-grid" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(360px,1fr))',gap:16}}>{(['parser','camera','print','fiducials'] as Section[]).map(section=><div className="panel" key={section}><div className="panel-head"><div><h3>{sectionLabel(section)}</h3><p>{sectionHint(section)}</p></div></div><textarea rows={18} spellCheck={false} value={editors[section]||EXAMPLES[section]} onChange={e=>setEditors(x=>({...x,[section]:e.target.value}))} style={{width:'100%',fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',fontSize:12}}/><div style={{display:'flex',gap:8,marginTop:12}}><button className="primary" disabled={busy} onClick={()=>saveSection(section)}><Save size={16}/> Kaydet ve Doğrula</button>{!editors[section]&&<button className="ghost" onClick={()=>setEditors(x=>({...x,[section]:EXAMPLES[section]}))}>Örnek Yapı</button>}</div></div>)}</div>}

      <div className="panel" style={{marginTop:20}}><div className="panel-head"><div><h2>Örnek TXT/DAT ile parser testi</h2><p>Parser tanımı gerçek örnek kayıtları canonical öğrenci/cevap modeline çevirmeden READY olamaz.</p></div><FlaskConical/></div><input type="file" accept=".txt,.dat,.csv,text/plain,text/csv" onChange={e=>setSample(e.target.files?.[0]||null)}/><button className="primary" disabled={busy||!sample||selectedVersion?.active} onClick={testParser}><FlaskConical size={16}/> Parser'ı Test Et</button>{parserTest&&<div className={parserTest.passed?'alert success':'alert error'} style={{marginTop:12}}><strong>{parserTest.passed?'Test başarılı':'Test başarısız'}</strong> · {parserTest.recordCount} kayıt · güven %{Math.round((parserTest.confidence||0)*100)}{parserTest.sample?.length>0&&<pre style={{whiteSpace:'pre-wrap',fontSize:11}}>{JSON.stringify(parserTest.sample.slice(0,2),null,2)}</pre>}</div>}</div>

      <div className="panel" style={{marginTop:20}}><div className="panel-head"><div><h2>Referans dosyaları</h2><p>Boş optik görseli/PDF, örnek FMT ve baskı tabanı R2'de sürüme bağlı saklanır.</p></div><FileUp/></div><div className="form-grid"><label>Dosya türü<select value={assetType} onChange={e=>setAssetType(e.target.value)}><option value="BLANK_FORM">Boş Form / Referans</option><option value="FMT_SAMPLE">FMT / TXT / DAT Örneği</option><option value="PRINT_BASE">Baskı Tabanı</option></select></label><label>Dosya<input type="file" onChange={e=>setAsset(e.target.files?.[0]||null)}/></label></div><button className="secondary" disabled={busy||!asset} onClick={uploadAsset}><FileUp size={16}/> R2'ye Yükle</button><div className="cards-list" style={{marginTop:12}}>{(versionDetail.assets||[]).map((a:any)=><div className="list-card" key={a.id}><div><strong>{assetLabel(a.asset_type)}</strong><span>{a.file_name} · {new Date(a.created_at).toLocaleString('tr-TR')}</span></div></div>)}</div></div>

      <div className="panel" style={{marginTop:20}}><div className="panel-head"><div><h2>Yayın kontrolü</h2><p>{readiness?.ready?'Bütün teknik tanımlar ve örnek parser testi tamamlandı.':'Eksik alanlar tamamlanmadan optik kullanıcı akışlarına açılmaz.'}</p></div>{readiness?.ready?<CheckCircle2/>:<CircleAlert/>}</div>{!readiness?.ready&&<ul>{(readiness?.errors||[]).map((x:string)=><li key={x}>{x}</li>)}</ul>}<button className="primary" disabled={busy||!readiness?.ready||selectedVersion?.active} onClick={publish}><Send size={17}/> READY Olarak Yayınla</button></div>
    </>}
  </>;
}

function pretty(value:any){if(!value)return '';try{return JSON.stringify(typeof value==='string'?JSON.parse(value):value,null,2)}catch{return String(value)}}
function sectionLabel(section:Section){return ({parser:'TXT/DAT Parser',camera:'Kamera Geometrisi',print:'Kişisel Baskı Alanları',fiducials:'Referans İşaretleri'} as const)[section]}
function sectionHint(section:Section){return ({parser:'Sabit genişlik veya ayrılmış dosya alanları.',camera:'Gerçek form üzerindeki OMR/bölge koordinatları.',print:'Ad, no, sınıf ve kodlama baskı konumları.',fiducials:'Perspektif ve kalibrasyon için sayfa referans hedefleri.'} as const)[section]}
function assetLabel(type:string){return ({BLANK_FORM:'Boş Form',FMT_SAMPLE:'FMT Örneği',PRINT_BASE:'Baskı Tabanı'} as any)[type]||type}
function Ready({label,ok}:{label:string;ok:boolean}){return <div className={ok?'summary':'summary warn'}><span>{label}</span><strong>{ok?'✓':'—'}</strong></div>}
