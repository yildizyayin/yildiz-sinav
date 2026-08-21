import { useEffect,useRef,useState } from 'react';
import { Bot,Send,Sparkles } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';

type Message={role:'user'|'assistant';text:string};

const suggestions:Record<string,string[]>={
 PARENT:['Öğrencim nasıl?','Son sınav ne oldu?','Hangi konuda zorlanıyor?','Bugün ne çalışalım?'],
 TEACHER:['Sınıfım nasıl?','Hangi kazanımlarda zorlanılıyor?','Bugün neye öncelik verelim?','Son sınavı özetle'],
 GUIDANCE_TEACHER:['Öğrencilerim nasıl?','Hangi kazanımlarda zorlanılıyor?','Bugün neye öncelik verelim?','Sınıf gelişimini özetle'],
 INSTITUTION_MANAGER:['Kurumum nasıl?','Bugün ne oldu?','Bekleyen optikler var mı?','Son sınavları özetle'],
 STUDENT:['Son sınavım ne oldu?','Hangi konuda zorlanıyorum?','Bugün ne çalışayım?','Gelişimim nasıl?'],
 SUPER_ADMIN:['Platformun durumu nasıl?','Bugün ne oldu?','Aktif kurumları özetle','Nibiru neler yapabilir?'],
};

export function Nibiru(){
 const{user}=useAuth();
 const[messages,setMessages]=useState<Message[]>([{role:'assistant',text:'🤖 Nibiru: Ben Ölçme Platformu’nun yapay zekâ akademik asistanıyım. Yalnızca yetkiniz kapsamındaki doğrulanmış akademik verileri kullanırım.'}]);
 const[text,setText]=useState('');const[busy,setBusy]=useState(false);const[error,setError]=useState('');const endRef=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{endRef.current?.scrollIntoView({behavior:'smooth'})},[messages,busy]);
 const ask=async(value?:string)=>{const q=(value??text).trim();if(!q||busy)return;setMessages(x=>[...x,{role:'user',text:q}]);setText('');setBusy(true);setError('');try{const r=await api<any>('/api/nibiru/chat',{method:'POST',body:JSON.stringify({message:q})});setMessages(x=>[...x,{role:'assistant',text:r.answer}])}catch(e:any){setError(e.message||'Nibiru şu anda yanıt veremedi.')}finally{setBusy(false)}};
 const items=suggestions[user?.role||'PARENT']||suggestions.PARENT;
 return <>
  <div className="page-head"><div><span className="eyebrow">Nibiru AI</span><h1>🤖 Nibiru · Yapay Zekâ Akademik Asistanı</h1><p>Nibiru bir insan değildir. Yanıtları yapay zekâ tarafından oluşturulur; yalnızca sistemdeki yetkiniz ve doğrulanmış ölçme-değerlendirme verileri kullanılır.</p></div><div className="status ok"><Sparkles size={15}/> AI Şeffaf Mod</div></div>
  {error&&<div className="alert error">{error}</div>}
  <div className="panel" style={{maxWidth:920,margin:'0 auto'}}>
   <div className="alert info"><Bot size={17}/><div><strong>Nibiru konuşma standardı</strong><span>Geliştirici, süreç odaklı ve yargısız akademik dil kullanır. Başka öğrenci/kurum verisini paylaşmaz; veri yoksa tahmin üretmez.</span></div></div>
   <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'12px 0 16px'}}>{items.map(s=><button className="secondary" key={s} onClick={()=>void ask(s)} disabled={busy}>{s}</button>)}</div>
   <div style={{minHeight:360,maxHeight:'58vh',overflowY:'auto',padding:'8px 2px',display:'flex',flexDirection:'column',gap:12}}>
    {messages.map((m,i)=><div key={i} style={{alignSelf:m.role==='user'?'flex-end':'flex-start',maxWidth:'82%',padding:'12px 14px',borderRadius:14,background:m.role==='user'?'var(--primary,#1d4ed8)':'var(--surface-2,#f5f7fb)',color:m.role==='user'?'white':'inherit',whiteSpace:'pre-wrap',lineHeight:1.5}}>{m.text}</div>)}
    {busy&&<div className="muted" style={{padding:10}}>🤖 Nibiru doğrulanmış verileri inceliyor…</div>}<div ref={endRef}/>
   </div>
   <div style={{display:'flex',gap:10,marginTop:14}}><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void ask()}}} placeholder="Nibiru’ya sorun…" maxLength={1200} style={{flex:1}}/><button className="primary" onClick={()=>void ask()} disabled={busy||!text.trim()}><Send size={17}/> Gönder</button></div>
   <p className="muted" style={{marginTop:10}}>Nibiru, MEB/Türkiye Yüzyılı Maarif Modeli’nin geliştirici ölçme-değerlendirme diline uygun konuşmak üzere yapılandırılmıştır; MEB’in ürünü veya temsilcisi değildir.</p>
  </div>
 </>;
}
