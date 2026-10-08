import {useRef,useState} from 'react';
import {api,qs} from '../api';
import {RubricObservationReport} from './RubricObservationReport';

export function RubricArchiveDirectory({institutionId,userId,superAdmin}:{institutionId:string;userId:string;superAdmin:boolean}){
 const scope=JSON.stringify([institutionId,userId]),current=useRef(scope),generation=useRef(0);current.current=scope;
 const [data,setData]=useState<any>(null),[chosen,setChosen]=useState<any>(null),[error,setError]=useState<any>(null),[busy,setBusy]=useState(false);
 const directory=data?.scope===scope?data.result:null,selected=chosen?.scope===scope?chosen.student:null;
 const load=async(more=false)=>{const requested=scope,attempt=++generation.current;setBusy(true);setError(null);try{const result=await api<any>('/api/learning-observations/archive-students'+qs({institutionId:superAdmin?institutionId:null,cursor:more?directory?.nextCursor:null}));if(current.current===requested&&generation.current===attempt){setData({scope:requested,result:{...result,students:more?[...new Map([...(directory?.students||[]),...result.students].map((s:any)=>[s.id,s])).values()]:result.students}});if(!more)setChosen(null)}}catch(e:any){if(current.current===requested&&generation.current===attempt)setError({scope:requested,message:e.message})}finally{if(generation.current===attempt)setBusy(false)}};
 return <section className="panel" style={{marginBottom:20}}><h2>Geçmiş rubrik arşivi</h2><p>Yetkiniz kapsamındaki gözlem kayıtları bulunan öğrencileri, ayrılmış veya arşivlenmiş dönemleriyle birlikte inceleyin.</p><button className="secondary" disabled={busy||superAdmin&&!institutionId} onClick={()=>void load()}>{busy?'Yükleniyor…':'Arşivdeki öğrencileri yükle'}</button>
  {error?.scope===scope&&<div className="alert error">{error.message}</div>}
  {directory&&<><label>Öğrenci<select value={selected?.id||''} onChange={e=>setChosen({scope,student:directory.students.find((s:any)=>s.id===e.target.value)||null})}><option value="">Seçin</option>{directory.students.map((s:any)=><option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}</select></label>{!directory.students.length&&<p>Yetkili kapsamda yayımlanmış rubrik gözlemi bulunmuyor.</p>}{directory.nextCursor&&<button disabled={busy} onClick={()=>void load(true)}>Diğer öğrencileri yükle</button>}</>}
  {selected&&<><h3>{selected.first_name} {selected.last_name}</h3><RubricObservationReport key={JSON.stringify([scope,selected.id])} studentId={selected.id} userId={userId} allowHistory initialHistory institutionScope={superAdmin?institutionId:undefined}/></>}
 </section>;
}
