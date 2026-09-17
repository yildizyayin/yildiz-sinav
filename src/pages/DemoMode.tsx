import { useEffect, useState } from 'react';
import { FlaskConical, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../api';

export function DemoMode(){
  const [demos,setDemos]=useState<any[]>([]);
  const [name,setName]=useState('Anunex Demo Kurumu');
  const [username,setUsername]=useState('demo.kurum');
  const [password,setPassword]=useState('Demo2026!');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const load=async()=>{
    setError('');
    try{const r=await api<any>('/api/v2/demo');setDemos(r.demos||[])}catch(e:any){setError(e.message)}
  };

  useEffect(()=>{void load()},[]);

  const create=async()=>{
    setBusy(true);setError('');setNotice('');
    try{
      const r=await api<any>('/api/v2/demo/seed',{method:'POST',body:JSON.stringify({name,managerUsername:username,managerPassword:password})});
      setNotice(`${r.institution.name} hazır: ${r.students} öğrenci, ${r.classes} sınıf, ${r.sampleExam?.results||0} örnek sınav sonucu, ${r.outcomeSignals||0} kazanım kanıtı ve ${r.worksheetAssignments||0} föy ataması.`);
      await load();
    }catch(e:any){setError(e.message)}finally{setBusy(false)}
  };

  return <>
    <div className="page-head">
      <div>
        <span className="eyebrow">Anunex · Demo Modu</span>
        <h1>Gerçek ekranları dolduran güvenli demo</h1>
        <p>Gerçek kurum verisi kullanmadan 8 sınıf, 160 sentetik öğrenci, örnek sınav sonuçları ve kazanım kanıtlarıyla Anunex deneyimini gösterin.</p>
      </div>
      <button className="ghost" onClick={()=>void load()}><RefreshCw size={16}/> Yenile</button>
    </div>

    {error&&<div className="alert error">{error}</div>}
    {notice&&<div className="alert success">{notice}</div>}

    <div className="panel">
      <div className="panel-head">
        <div><h2>Yeni demo kurumu</h2><p>Demo verileri <strong>demo_mode</strong> ile gerçek kurumlardan ayrılır ve yalnız sentetik öğrenci kimlikleri üretir.</p></div>
        <FlaskConical/>
      </div>
      <div className="form-grid">
        <label>Kurum adı<input value={name} onChange={e=>setName(e.target.value)}/></label>
        <label>Yönetici kullanıcı adı<input value={username} onChange={e=>setUsername(e.target.value)}/></label>
        <label>Yönetici şifresi<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
      </div>
      <button className="primary" disabled={busy||!username||password.length<8||!name.trim()} onClick={()=>void create()}>{busy?'Demo hazırlanıyor…':'Tam Demo Kurumu Oluştur'}</button>
    </div>

    <div className="panel" style={{marginTop:16}}>
      <div className="panel-head">
        <div><h2>Demo güvenliği</h2><p>Demo kurumu gerçek kurumlardan veri kopyalamaz; yalnız ortak yayınlanmış eğitim içeriğini varsa föy eşlemesi için kullanır.</p></div>
        <ShieldCheck/>
      </div>
      <p>Oluşturulan örnek sınav ve sonuçlar sentetiktir. Bu veriler satış demosu, kullanıcı eğitimi ve kabul testi için kullanılabilir; gerçek akademik raporlarla karışmaz.</p>
    </div>

    <div className="table-card" style={{marginTop:16}}>
      <table>
        <thead><tr><th>Kurum</th><th>Kod</th><th>Sınıf</th><th>Öğrenci</th><th>Sınav</th><th>Sonuç</th><th>Föy Ataması</th><th>Durum</th></tr></thead>
        <tbody>{demos.map(d=><tr key={d.id}>
          <td><strong>{d.name}</strong></td>
          <td>{d.code}</td>
          <td>{d.class_count}</td>
          <td>{d.student_count}</td>
          <td>{d.exam_count||0}</td>
          <td>{d.result_count||0}</td>
          <td>{d.worksheet_assignment_count||0}</td>
          <td><span className={`status ${d.status==='ACTIVE'?'ok':'off'}`}>{d.status}</span></td>
        </tr>)}</tbody>
      </table>
      {!demos.length&&<div className="empty">Henüz demo kurumu bulunmuyor.</div>}
    </div>
  </>;
}
