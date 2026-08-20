import { useEffect,useState } from 'react';
import { ArrowRight, CheckCircle2, CircleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api';
import { useAuth } from '../auth';

export function Exams(){
 const {user}=useAuth(); const [rows,setRows]=useState<any[]>([]); const [institutionId,setInstitutionId]=useState('inst_demo');
 useEffect(()=>{void api<any>(`/api/exams${qs({institutionId:user?.role==='SUPER_ADMIN'?institutionId:null})}`).then(r=>setRows(r.exams))},[institutionId,user?.role]);
 const canEvaluate=user?.role==='SUPER_ADMIN'||user?.role==='INSTITUTION_MANAGER';
 return <><div className="page-head"><div><span className="eyebrow">Sınav merkezi</span><h1>Sınavlar</h1><p>{canEvaluate?'Sınavı seçin; cevap anahtarı, kitapçık ve puanlama otomatik bağlanır.':'Yetkili olduğunuz akademik kapsamda sınavları görüntüleyin.'}</p></div>{user?.role==='SUPER_ADMIN'&&<label className="compact-field">Kurum<input value={institutionId} onChange={e=>setInstitutionId(e.target.value)}/></label>}</div><div className="exam-grid">{rows.map(e=><div className="exam-card" key={e.id}><div className="exam-top"><span className="pill">{e.exam_type}</span>{e.scoring_verified?<span className="verified"><CheckCircle2 size={15}/> Puanlama hazır</span>:<span className="warning"><CircleAlert size={15}/> Kural gerekli</span>}</div><h3>{e.title}</h3><p>{e.grade_level?`${e.grade_level}. Sınıf · `:''}{e.exam_date||'Tarih yok'}</p><div className="exam-meta"><span>Kitapçık <strong>{e.booklet_codes||'—'}</strong></span><span>Katılımcı <strong>{e.participant_count||0}</strong></span></div>{canEvaluate&&<Link className="primary full" to={`/exams/${e.id}/evaluate${user?.role==='SUPER_ADMIN'?`?institutionId=${institutionId}`:''}`}>Sınavı Değerlendir <ArrowRight size={17}/></Link>}</div>)}</div></>
}
