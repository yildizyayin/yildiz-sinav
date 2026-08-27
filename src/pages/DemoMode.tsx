import { useEffect,useMemo,useState } from 'react';
import { BarChart3,BookOpenCheck,BrainCircuit,ClipboardCheck,Eye,EyeOff,FlaskConical,Printer,RefreshCw,ShieldCheck,Sparkles,UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';

function strongDemoPassword(){
 const bytes=new Uint32Array(3);crypto.getRandomValues(bytes);
 return `Anu!${bytes[0].toString(36)}${bytes[1].toString(36)}${bytes[2].toString(36)}#`;
}

export function DemoMode(){
 const[demos,setDemos]=useState<any[]>([]);const[name,setName]=useState('Anunex Demo Kurumu');const[username,setUsername]=useState(`demo.${Date.now().toString().slice(-6)}`);const[password,setPassword]=useState(()=>strongDemoPassword());const[showPassword,setShowPassword]=useState(false);const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[notice,setNotice]=useState('');
 const load=async()=>{setError('');try{const r=await api<any>('/api/v2/demo');setDemos(r.demos||[])}catch(e:any){setError(e.message)}};
 useEffect(()=>{void load()},[]);
 const totals=useMemo(()=>({institutions:demos.length,classes:demos.reduce((s,d)=>s+Number(d.class_count||0),0),students:demos.reduce((s,d)=>s+Number(d.student_count||0),0),exams:demos.reduce((s,d)=>s+Number(d.exam_count||0),0),results:demos.reduce((s,d)=>s+Number(d.result_count||0),0)}),[demos]);
 const renewCredentials=()=>{setUsername(`demo.${Date.now().toString().slice(-6)}`);setPassword(strongDemoPassword());setShowPassword(false)};
 const create=async()=>{if(!confirm('Yeni sentetik ANUNEX demo kurumu oluşturulsun mu? Bu işlem gerçek kurum veya öğrenci verisi kullanmaz.'))return;setBusy(true);setError('');setNotice('');try{const r=await api<any>('/api/v2/demo/seed',{method:'POST',body:JSON.stringify({name,managerUsername:username,managerPassword:password})});setNotice(`${r.institution.name} hazır: ${r.students} sentetik öğrenci, ${r.classes} sınıf, ${r.sampleExam?.results||0} örnek sınav sonucu, ${r.outcomeSignals||0} kazanım kanıtı ve ${r.worksheetAssignments||0} föy ataması. Demo yönetici: ${r.manager.username}`);await load();renewCredentials()}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 return <>
  <div className="page-head"><div><span className="eyebrow">Anunex · Demo Modu</span><h1>Sunuma hazır ölçme-değerlendirme demosu</h1><p>Bilginin yörüngesinde · Gerçek kurum verisine dokunmadan, ayrı <strong>demo_mode</strong> sınırında sınıf, öğrenci, sınav, sonuç, kazanım ve föy verisi üretin.</p></div><button className="ghost" onClick={()=>void load()}><RefreshCw size={16}/> Yenile</button></div>
  {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}

  <div className="summary-strip"><Summary label="Demo kurum" value={totals.institutions}/><Summary label="Demo sınıf" value={totals.classes}/><Summary label="Sentetik öğrenci" value={totals.students}/><Summary label="Örnek sınav" value={totals.exams}/><Summary label="Örnek sonuç" value={totals.results}/></div>

  <div className="panel" style={{marginTop:20}}><div className="panel-head"><div><h2>Yeni demo kurumu</h2><p>Demo yalnız ANUNEX ölçme, optik, akademik analiz, föy ve Nibiru akışlarını göstermek içindir; ERP/ticari veri üretmez.</p></div><FlaskConical/></div>
   <div className="alert success"><ShieldCheck size={17}/><div><strong>Gerçek veriden izole</strong><br/><span>Oluşturulan kurum <code>demo_mode=1</code> olarak işaretlenir. Sistem gerçek kurumlardan veri kopyalamaz; öğrenciler, sonuçlar ve akademik sinyaller sentetik olarak üretilir.</span></div></div>
   <div className="form-grid"><label>Kurum adı<input value={name} onChange={e=>setName(e.target.value)} maxLength={120}/></label><label>Yönetici kullanıcı adı<input value={username} onChange={e=>setUsername(e.target.value.trim().toLowerCase())} autoComplete="off"/></label><label>Yönetici şifresi<div style={{display:'flex',gap:8}}><input style={{flex:1}} type={showPassword?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/><button type="button" className="ghost" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?'Şifreyi gizle':'Şifreyi göster'}>{showPassword?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></label></div>
   <div style={{display:'flex',gap:10,flexWrap:'wrap'}}><button className="primary" disabled={busy||!name.trim()||!username||password.length<12} onClick={()=>void create()}><Sparkles size={16}/>{busy?'Oluşturuluyor…':'Demo Kurumu Oluştur'}</button><button className="secondary" disabled={busy} onClick={renewCredentials}><RefreshCw size={16}/> Yeni Güvenli Giriş Üret</button></div>
   <p className="muted" style={{marginTop:10}}>Şifre en az 12 karakter olmalıdır. Ekranda sabit/ortak demo şifresi tutulmaz; her yeni demo için ayrı güçlü giriş üretilir.</p>
  </div>

  <div className="section-head"><div><h2>Demo kapsamı</h2><p>Yeni demo kurumu oluşturulduğunda 8 sınıf, 160 sentetik öğrenci, başlangıç sınavı, sonuçlar ve mevcut resmî kazanım kataloğuna bağlı örnek akademik kanıtlar oluşturulur.</p></div></div>
  <div className="action-grid">
   <Link className="quick-card" to="/students"><div className="quick-icon"><UsersRound/></div><div><h3>Öğrenci & Sınıf</h3><p>Sentetik öğrenci yaşam döngüsü ve kurum kapsamını gösterin.</p></div></Link>
   <Link className="quick-card" to="/exam-center"><div className="quick-icon"><ClipboardCheck/></div><div><h3>Sınav Merkezi</h3><p>Sınav tanımı, katılımcı ve örnek sonuç akışını gösterin.</p></div></Link>
   <Link className="quick-card" to="/optical-prepare"><div className="quick-icon"><Printer/></div><div><h3>Optik Hazırla / Bas</h3><p>Kişiselleştirilmiş optik, kitapçık ve yazıcı kalibrasyon akışını gösterin.</p></div></Link>
   <Link className="quick-card" to="/worksheets"><div className="quick-icon"><BookOpenCheck/></div><div><h3>Föy Merkezi</h3><p>Haftalık föy, cevap anahtarı, kazanım ve video desteğini gösterin.</p></div></Link>
   <Link className="quick-card" to="/nibiru"><div className="quick-icon"><BrainCircuit/></div><div><h3>Nibiru AI</h3><p>Sentetik ölçme verisinden rehberlik ve akademik gelişim desteğini gösterin.</p></div></Link>
   <Link className="quick-card" to="/reports"><div className="quick-icon"><BarChart3/></div><div><h3>Analiz & Rapor</h3><p>Öğrenci, sınıf, kurum ve kazanım analiz ekranlarına geçin.</p></div></Link>
  </div>

  <div className="section-head"><div><h2>Oluşturulmuş demo kurumları</h2><p>Yalnız <code>demo_mode=1</code> kurumlar listelenir.</p></div></div>
  <div className="table-card"><table><thead><tr><th>Kurum</th><th>Kod</th><th>Sınıf</th><th>Öğrenci</th><th>Sınav</th><th>Sonuç</th><th>Föy Ataması</th><th>Durum</th></tr></thead><tbody>{demos.map(d=><tr key={d.id}><td><strong>{d.name}</strong></td><td>{d.code}</td><td>{d.class_count}</td><td>{d.student_count}</td><td>{d.exam_count||0}</td><td>{d.result_count||0}</td><td>{d.worksheet_assignment_count||0}</td><td><span className={`status ${d.status==='ACTIVE'?'ok':'off'}`}>{d.status}</span></td></tr>)}</tbody></table>{!demos.length&&<div className="empty">Henüz demo kurumu bulunmuyor.</div>}</div>
 </>;
}

function Summary({label,value}:{label:string;value:number|string}){return <div><span>{label}</span><strong>{value}</strong></div>}
