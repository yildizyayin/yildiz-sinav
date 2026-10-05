import {useEffect,useRef,useState} from 'react';
import {api,qs} from '../api';
import {InstitutionFrozenReport} from './InstitutionFrozenReport';
type AssignedClass={id:string;name:string;academicYear:string};
export function GuidanceFrozenReport({institutionId}:{institutionId:string}){
 const [rows,setRows]=useState<AssignedClass[]>([]),[selected,setSelected]=useState(''),[cursor,setCursor]=useState<string|null>(null),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const generation=useRef(0);useEffect(()=>()=>{generation.current++},[]);
 const load=async(more=false)=>{const attempt=++generation.current;setBusy(true);setError('');
  try{const result=await api<any>('/api/reporting/guidance/classes'+qs({cursor:more?cursor:null}));if(generation.current!==attempt)return;setRows(previous=>more?[...new Map([...previous,...(result.classes||[])].map(row=>[row.id,row])).values()]:result.classes||[]);setCursor(result.nextCursor||null);setLoaded(true);if(!more)setSelected('');}
  catch(e:any){if(generation.current===attempt)setError(e.message||'Sınıflar alınamadı.');}finally{if(generation.current===attempt)setBusy(false);}
 };
 const cls=rows.find(row=>row.id===selected);
 return <section className="panel" style={{marginBottom:20}} aria-label="Rehberlik sınıf seçimi"><h2>Rehberlik sınıf raporu</h2><p>Yalnız aktif dönemde rehberlik göreviyle atandığınız sınıfların mevcut öğrencileri için yayınlanmış sınav özetleri hazırlanır.</p>
  <button className="secondary" disabled={busy} onClick={()=>void load()}>{busy?'Yükleniyor…':'Yetkili Sınıflarımı Yükle'}</button>
  {error&&<div className="alert error" role="alert">{error}</div>}
  {loaded&&<label>Sınıf<select value={selected} onChange={event=>setSelected(event.target.value)}><option value="">Sınıf seçin</option>{rows.map(row=><option key={row.id} value={row.id}>{row.name} · {row.academicYear}</option>)}</select></label>}
  {loaded&&!rows.length&&<div className="empty">Aktif dönemde atanmış rehberlik sınıfı bulunmuyor.</div>}
  {cursor&&<button className="ghost" disabled={busy} onClick={()=>void load(true)}>Diğer sınıfları yükle</button>}
  {cls&&<InstitutionFrozenReport key={cls.id} institutionId={institutionId} classScope={cls}/>}
 </section>;
}
