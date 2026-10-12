import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, LogOut, Send } from 'lucide-react';
import { useAuth } from '../auth';
import { post } from '../api';
import { AnunexBrand } from '../components/AnunexBrand';
import { NibiruMark } from '../components/NibiruMark';
import { NibiruIdentityForm } from '../components/PasskeyAccess';
import { Nibiru } from './Nibiru';
import '../nibiru-direct.css';

export function NibiruDirect(){
 const {user,logout}=useAuth();const[text,setText]=useState('');const[answer,setAnswer]=useState('Nibiru; öğrenme, ölçme, içerik ve plan takibinde yanınızda. Misafir modunda kullanım bilgilerini inceleyebilir, kişisel işlemler için hesabınızı doğrulayabilirsiniz.');const[error,setError]=useState('');const[busy,setBusy]=useState(false);
 const ask=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{const r=await post('/api/nibiru/public-chat',{message:text});setAnswer(r.answer);setText('')}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 return <div className="nibiru-direct"><header className="nibiru-direct-nav"><AnunexBrand compact tagline={false}/><nav>{user&&<><Link to="/">Panelim</Link><Link to="/calendar"><CalendarDays size={16}/> Takvimim</Link><button className="ghost" onClick={()=>void logout().catch((e:any)=>setError(e.message))}><LogOut size={16}/> Çıkış</button></>}</nav></header>{error&&<div className="alert error">{error}</div>}{user?<Nibiru/>:<div className="nibiru-direct-grid"><section className="panel"><NibiruMark size={76} showWordmark/><h1>Bilginin yörüngesinde, sizinle.</h1><p>NİBİRU · ÖĞRENME VE GÖREV ASİSTANI</p><div className="nibiru-capabilities"><span>Konu ve soru desteği</span><span>Kazanım odaklı mini test</span><span>Gelişim ve karne</span><span>Kişiye özel içerik</span><span>Takvim ve görevler</span></div><div className="nibiru-guest-answer" aria-live="polite">{answer}</div><form onSubmit={ask}><label>Nibiru hakkında ne öğrenmek istersiniz?<input value={text} onChange={e=>setText(e.target.value)} maxLength={1200} required placeholder="Nasıl çalışma planı oluşturabilirim?"/></label><button className="secondary" disabled={busy}><Send size={16}/> {busy?'Yanıt hazırlanıyor…':'Sor'}</button></form><small>Misafir modu kullanım rehberidir. Kişisel veri ve yapay zekâ destekli akademik işlemler doğrulanmış hesabınızla açılır.</small></section><NibiruIdentityForm/></div>}</div>;
}
