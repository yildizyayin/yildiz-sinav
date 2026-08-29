import { useEffect, useMemo, useState } from 'react';
import { Maximize2, MessageCircle, Send, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { nibiruUiContext } from '../lib/nibiru-context';
import { NibiruMark } from './NibiruMark';

export function NibiruContextDock(){
 const{user}=useAuth();const location=useLocation();const[open,setOpen]=useState(false);const[text,setText]=useState('');const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[answer,setAnswer]=useState<any>(null);const context=useMemo(()=>user?nibiruUiContext(location.pathname,user.role):null,[location.pathname,user]);
 useEffect(()=>{setOpen(false);setAnswer(null);setError('')},[location.pathname]);if(!user||!context||location.pathname==='/nibiru')return null;
 const ask=async(value?:string)=>{const message=(value??text).trim();if(!message||busy)return;setBusy(true);setError('');try{const r=await api<any>('/api/nibiru/chat',{method:'POST',body:JSON.stringify({message,context:{pathname:context.pathname}})});setAnswer(r);setText('')}catch(e:any){setError(e.message||'Nibiru şu anda yanıt veremedi.')}finally{setBusy(false)}};
 return <aside className={`nibiru-context-dock ${open?'open':''}`} aria-label="Sayfa bağlamlı Nibiru">
  {!open?<button className="nibiru-context-launch" onClick={()=>setOpen(true)} title={`${context.label} için Nibiru'ya sor`}><NibiruMark size={34} state="active"/><span><strong>Nibiru</strong><small>{context.label}</small></span><MessageCircle size={18}/></button>:<div className="nibiru-context-panel">
   <div className="nibiru-context-head"><NibiruMark size={38} state={busy?'thinking':'active'}/><div><strong>Nibiru · {context.label}</strong><span>Bu sayfanın işini anlar; yetkinizi genişletmez.</span></div><button onClick={()=>setOpen(false)} aria-label="Nibiru panelini kapat"><X size={18}/></button></div>
   {!answer&&<div className="nibiru-context-prompts">{context.prompts.slice(0,3).map(p=><button key={p} onClick={()=>void ask(p)} disabled={busy}>{p}</button>)}</div>}
   {answer&&<div className="nibiru-context-answer"><small>Aktif uzman · {answer.orchestration?.label||'Nibiru Core'}</small><p>{answer.answer}</p></div>}{error&&<div className="nibiru-context-error">{error}</div>}
   <div className="nibiru-context-input"><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void ask()}} placeholder={busy?'Nibiru inceliyor…':'Bu sayfa hakkında sor…'} maxLength={1200}/><button onClick={()=>void ask()} disabled={busy||!text.trim()} aria-label="Nibiru'ya gönder"><Send size={17}/></button></div>
   <Link className="nibiru-context-full" to={`/nibiru?from=${encodeURIComponent(context.pathname)}`}><Maximize2 size={15}/> Sesli ve tam ekran aç</Link>
  </div>}
 </aside>;
}
