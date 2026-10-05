import { useEffect, useState } from 'react';
import { api } from '../api';

type Level={id:string;label:string;description:string};
type Criterion={id:string;title:string;description:string;levels:Level[]};
const criterion=():Criterion=>({id:crypto.randomUUID(),title:'',description:'',levels:[{id:crypto.randomUUID(),label:'',description:''},{id:crypto.randomUUID(),label:'',description:''}]});
const emptySource={sourceUrl:'',sourceTitle:'',sourceLocator:'',reviewNote:''};

export function CurriculumRubricAdmin({versionId,outcomes}:{versionId:string;outcomes:any[]}) {
 const [data,setData]=useState<{components:any[];rubrics:any[]}>({components:[],rubrics:[]});
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [component,setComponent]=useState({outcomeId:'',code:'',title:'',...emptySource});
 const [rubric,setRubric]=useState({componentId:'',versionLabel:'',title:'',taskInstructions:'',sourceKind:'TEACHER_DESIGNED',...emptySource});
 const [criteria,setCriteria]=useState<Criterion[]>(()=>[criterion()]);
 const [confirmed,setConfirmed]=useState(false);
 useEffect(()=>{setConfirmed(false)},[component,rubric,criteria]);
 const load=async()=>setData(await api<any>(`/api/curriculum-admin/versions/${encodeURIComponent(versionId)}/learning-rubrics`));
 useEffect(()=>{let active=true;api<any>(`/api/curriculum-admin/versions/${encodeURIComponent(versionId)}/learning-rubrics`).then(r=>{if(active)setData(r)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[versionId]);
 const save=async(kind:'component'|'rubric')=>{
  if(!confirmed)return;setBusy(true);setError('');setNotice('');
  try{
   await api(`/api/curriculum-admin/${kind==='component'?'process-components':'learning-rubrics'}`,{method:'POST',body:JSON.stringify({... (kind==='component'?component:{...rubric,criteria}),confirmedSource:true})});
   setConfirmed(false);setNotice('Kaynak ve inceleme kaydıyla yayımlandı. Düzeltme yeni sürüm gerektirir.');await load();
  }catch(e:any){setError(e.message)}finally{setBusy(false)}
 };
 const sourceFields=(value:typeof emptySource,change:(key:string,value:string)=>void,official:boolean)=><>
  {official&&<><label>Resmî doküman adresi<input value={value.sourceUrl} onChange={e=>change('sourceUrl',e.target.value)} maxLength={2000}/></label><label>Doküman adı<input value={value.sourceTitle} onChange={e=>change('sourceTitle',e.target.value)} maxLength={500}/></label><label>Sayfa / bölüm / madde<input value={value.sourceLocator} onChange={e=>change('sourceLocator',e.target.value)} maxLength={500}/></label></>}
  <label>İnceleme gerekçesi<textarea value={value.reviewNote} onChange={e=>change('reviewNote',e.target.value)} minLength={20} maxLength={1000}/></label>
 </>;
 return <section className="panel" style={{marginTop:20}}>
  <h2>Süreç bileşenleri ve rubrik sürümleri</h2>
  <p>Resmî süreç tanımları dokümandan doğrulanır. Öğretmen tasarımı rubrikler ayrı etiketlenir. Bu kayıtlar sınav netinden otomatik beceri puanı üretmez.</p>
  {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}
  <fieldset disabled={busy} onChange={()=>setConfirmed(false)}><legend>Resmî süreç bileşeni</legend><div className="form-grid">
   <label>Öğrenme çıktısı<select value={component.outcomeId} onChange={e=>setComponent({...component,outcomeId:e.target.value})}><option value="">Seçin</option>{outcomes.filter(o=>o.active&&o.official&&['OUTCOME','SUB_OUTCOME'].includes(o.node_type||'OUTCOME')).map(o=><option key={o.id} value={o.id}>{o.subject_name} · {o.code} · {o.title}</option>)}</select></label>
   <label>Dokümandaki süreç kodu<input value={component.code} onChange={e=>setComponent({...component,code:e.target.value})} maxLength={100}/></label>
   <label>Dokümandaki süreç tanımı<textarea value={component.title} onChange={e=>setComponent({...component,title:e.target.value})} maxLength={1000}/></label>
   {sourceFields(component,(key,value)=>setComponent({...component,[key]:value}),true)}
  </div></fieldset>
  <fieldset disabled={busy} onChange={()=>setConfirmed(false)}><legend>Yeni rubrik sürümü</legend><div className="form-grid">
   <label>Süreç bileşeni<select value={rubric.componentId} onChange={e=>setRubric({...rubric,componentId:e.target.value})}><option value="">Seçin</option>{data.components.map(c=><option key={c.id} value={c.id}>{c.outcome_code} · {c.code} · {c.title}</option>)}</select></label>
   <label>Sürüm adı<input value={rubric.versionLabel} onChange={e=>setRubric({...rubric,versionLabel:e.target.value})} maxLength={80}/></label>
   <label>Rubrik başlığı<input value={rubric.title} onChange={e=>setRubric({...rubric,title:e.target.value})} maxLength={200}/></label>
   <label>Görev ve gözlem yönergesi<textarea value={rubric.taskInstructions} onChange={e=>setRubric({...rubric,taskInstructions:e.target.value})} minLength={20} maxLength={4000}/></label>
   <label>Rubrik kaynağı<select value={rubric.sourceKind} onChange={e=>setRubric({...rubric,sourceKind:e.target.value})}><option value="TEACHER_DESIGNED">Öğretmen tasarımı</option><option value="OFFICIAL">Resmî dokümandan</option></select></label>
   {sourceFields(rubric,(key,value)=>setRubric({...rubric,[key]:value}),rubric.sourceKind==='OFFICIAL')}
  </div>
  {criteria.map((c,index)=><div key={c.id} className="panel"><label>Ölçüt {index+1}<input value={c.title} maxLength={200} onChange={e=>setCriteria(criteria.map(x=>x.id===c.id?{...x,title:e.target.value}:x))}/></label><label>Gözlenebilir davranış<textarea value={c.description} maxLength={1000} onChange={e=>setCriteria(criteria.map(x=>x.id===c.id?{...x,description:e.target.value}:x))}/></label>
   {c.levels.map((l,i)=><div className="form-grid" key={l.id}><label>Düzey {i+1} adı<input value={l.label} maxLength={120} onChange={e=>setCriteria(criteria.map(x=>x.id===c.id?{...x,levels:x.levels.map(y=>y.id===l.id?{...y,label:e.target.value}:y)}:x))}/></label><label>Düzeyde gözlenmesi gereken davranış<textarea value={l.description} maxLength={1000} onChange={e=>setCriteria(criteria.map(x=>x.id===c.id?{...x,levels:x.levels.map(y=>y.id===l.id?{...y,description:e.target.value}:y)}:x))}/></label>{c.levels.length>2&&<button type="button" onClick={()=>setCriteria(criteria.map(x=>x.id===c.id?{...x,levels:x.levels.filter(y=>y.id!==l.id)}:x))}>Düzeyi kaldır</button>}</div>)}
   <button type="button" disabled={c.levels.length>=5} onClick={()=>setCriteria(criteria.map(x=>x.id===c.id?{...x,levels:[...x.levels,{id:crypto.randomUUID(),label:'',description:''}]}:x))}>Düzey ekle</button>
   {criteria.length>1&&<button type="button" onClick={()=>setCriteria(criteria.filter(x=>x.id!==c.id))}>Ölçütü kaldır</button>}
  </div>)}
  <button type="button" disabled={criteria.length>=10} onClick={()=>setCriteria([...criteria,criterion()])}>Ölçüt ekle</button></fieldset>
  <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/> Kaynak içeriğini ve yayımlanacak tanımı inceledim. Resmî alan adı kontrolü içerik doğrulamasının yerine geçmez.</label>
  <div style={{display:'flex',gap:12}}><button className="primary" disabled={busy||!confirmed||!component.outcomeId} onClick={()=>void save('component')}>Süreç bileşenini yayımla</button><button className="primary" disabled={busy||!confirmed||!rubric.componentId} onClick={()=>void save('rubric')}>Rubrik sürümünü yayımla</button></div>
  <h3>Doğrulanmış süreç bileşenleri</h3>{data.components.map(c=><details key={c.id}><summary>{c.outcome_code} · {c.code} · {c.title}</summary><p>{c.source_title} · {c.source_locator}</p><p>{c.source_url}</p><p>{c.review_note} · {c.verified_at}</p></details>)}
  <h3>Yayımlanmış rubrikler</h3>{!data.rubrics.length&&<p>Henüz rubrik yayımlanmadı.</p>}{data.rubrics.map(r=><details key={r.id}><summary>{r.title} · {r.version_label} · {r.source_kind==='OFFICIAL'?'Resmî doküman':'Öğretmen tasarımı'}</summary><p>{r.task_instructions}</p>{r.source_kind==='OFFICIAL'&&<><p>{r.source_title} · {r.source_locator}</p><p>{r.source_url}</p></>}<p>{r.review_note} · {r.published_at}</p>{r.criteria.map((c:Criterion)=><div key={c.id}><strong>{c.title}</strong><p>{c.description}</p><ul>{c.levels.map(l=><li key={l.id}>{l.label}: {l.description}</li>)}</ul></div>)}</details>)}
 </section>;
}
