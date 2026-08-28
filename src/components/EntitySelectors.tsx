import { useEffect,useState } from 'react';
import { api,qs } from '../api';

export function InstitutionSelect({value,onChange,label='Kurum',required=true}:{value:string;onChange:(id:string)=>void;label?:string;required?:boolean}){
 const[rows,setRows]=useState<any[]>([]),[error,setError]=useState('');
 useEffect(()=>{let active=true;void api<any>('/api/institutions').then(r=>{if(!active)return;const list=r.institutions||[];setRows(list);if(!list.some((x:any)=>x.id===value))onChange(list[0]?.id||'')}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[]);
 return <label>{label}<select value={value} onChange={e=>onChange(e.target.value)} aria-invalid={Boolean(error)}>{!required&&<option value="">Tümü / seçilmedi</option>}{required&&rows.length===0&&<option value="">Kurum bulunamadı</option>}{rows.map(row=><option key={row.id} value={row.id}>{row.name} · {row.code}</option>)}</select>{error&&<small className="field-error">Kurumlar yüklenemedi.</small>}</label>;
}

export function ClassSelect({value,onChange,institutionId,label='Sınıf / Şube',required=false}:{value:string;onChange:(id:string)=>void;institutionId?:string;label?:string;required?:boolean}){
 const[rows,setRows]=useState<any[]>([]),[error,setError]=useState('');
 useEffect(()=>{let active=true;setError('');void api<any>(`/api/classes${qs({institutionId:institutionId||null})}`).then(r=>{if(!active)return;const list=r.classes||[];setRows(list);if(value&&!list.some((x:any)=>x.id===value))onChange('')}).catch(e=>{if(active){setRows([]);setError(e.message)}});return()=>{active=false}},[institutionId]);
 return <label>{label}<select value={value} onChange={e=>onChange(e.target.value)} aria-invalid={Boolean(error)}>{!required&&<option value="">Sınıf seçmeden devam et</option>}{required&&<option value="">Sınıf seçin</option>}{rows.map(row=><option key={row.id} value={row.id}>{row.name}{row.grade_level?` · ${row.grade_level}. sınıf`:''}</option>)}</select>{error&&<small className="field-error">Sınıflar yüklenemedi.</small>}</label>;
}
