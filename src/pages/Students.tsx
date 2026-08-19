import { useEffect,useState } from 'react';
import { CheckCircle2, UserRoundPlus } from 'lucide-react';
import { api, post, qs } from '../api';
import { useAuth } from '../auth';

export function Students(){
 const {user}=useAuth(); const [tab,setTab]=useState<'ACTIVE'|'GUEST'>('ACTIVE'); const [rows,setRows]=useState<any[]>([]); const [institutionId,setInstitutionId]=useState('inst_demo'); const [busy,setBusy]=useState(''); const [notice,setNotice]=useState('');
 const load=()=>api<any>(`/api/students${qs({status:tab,institutionId:user?.role==='SUPER_ADMIN'?institutionId:null})}`).then(r=>setRows(r.students));
 useEffect(()=>{void load()},[tab,institutionId]);
 const activate=async(id:string)=>{if(!confirm('Ödeme/onay tamamlandı ve bu misafir öğrenci aktif öğrenciye dönüştürülsün mü?'))return;setBusy(id);try{const r=await post<any>(`/api/students/${id}/activate`,{paymentConfirmed:true});setNotice(`Öğrenci aktif edildi. Geçmiş ${r.priorExamCount} sınav otomatik bağlandı.`);await load()}finally{setBusy('')}};
 return <><div className="page-head"><div><span className="eyebrow">Öğrenci yaşam döngüsü</span><h1>Öğrenciler</h1><p>Aktif öğrenciler tam sisteme erişir; misafirler yalnız sınav sonucu için tutulur.</p></div>{user?.role==='SUPER_ADMIN'&&<label className="compact-field">Kurum<input value={institutionId} onChange={e=>setInstitutionId(e.target.value)}/></label>}</div>
 <div className="tabs"><button className={tab==='ACTIVE'?'active':''} onClick={()=>setTab('ACTIVE')}>Aktif Öğrenciler</button><button className={tab==='GUEST'?'active':''} onClick={()=>setTab('GUEST')}>Misafir Katılımcılar</button></div>{notice&&<div className="alert success">{notice}</div>}
 <div className="table-card"><table><thead><tr><th>Öğrenci</th><th>No</th><th>Sınıf</th><th>Sınav</th><th>Durum</th>{tab==='GUEST'&&user?.role==='SUPER_ADMIN'&&<th></th>}</tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><strong>{r.first_name} {r.last_name}</strong></td><td>{r.student_number||'—'}</td><td>{r.grade_level?`${r.grade_level}/${r.section||'—'}`:'—'}</td><td>{r.exam_count}</td><td><span className={`status ${r.status==='ACTIVE'?'ok':'neutral'}`}>{r.status==='ACTIVE'?<><CheckCircle2 size={14}/> Aktif</>:'Misafir'}</span></td>{tab==='GUEST'&&user?.role==='SUPER_ADMIN'&&<td><button className="primary subtle" disabled={busy===r.id} onClick={()=>activate(r.id)}><UserRoundPlus size={16}/> Aktif Öğrenci Yap</button></td>}</tr>)}</tbody></table>{!rows.length&&<div className="empty">Bu filtrede öğrenci bulunamadı.</div>}</div></>
}
