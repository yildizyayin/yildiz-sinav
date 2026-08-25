import { useEffect,useState } from 'react';
import { Check,RotateCcw,Sparkles,Volume2 } from 'lucide-react';
import { api } from '../api';
import './student-standard.css';

const themes=[
 {key:'MIDDLE_FUN',name:'Enerjik',grades:'5–6',text:'Canlı ve eğlenceli çalışma görünümü.'},
 {key:'MIDDLE_FOCUS',name:'Odak',grades:'7–8',text:'Modern, hedef ve gelişim odaklı.'},
 {key:'HIGH_MODERN',name:'Modern',grades:'9–10',text:'Daha sade ve olgun lise görünümü.'},
 {key:'HIGH_GROWTH',name:'Gelişim',grades:'11',text:'Akademik gelişim ve hazırlık odağı.'},
 {key:'EXAM_FOCUS',name:'Sınav Modu',grades:'12 / Mezun',text:'YKS hedefi ve konsantrasyon odaklı.'},
];

export function StudentExperienceSettings(){
 const [data,setData]=useState<any>(null);const[form,setForm]=useState<any>(null);const[busy,setBusy]=useState(false);const[message,setMessage]=useState('');const[error,setError]=useState('');
 const load=async()=>{try{const r=await api<any>('/api/student-standard/preferences');setData(r);setForm(r.preferences)}catch(e:any){setError(e.message)}};
 useEffect(()=>{void load()},[]);
 const save=async(next=form)=>{if(!next)return;setBusy(true);setError('');setMessage('');try{const r=await api<any>('/api/student-standard/preferences',{method:'PATCH',body:JSON.stringify(next)});setData(r);setForm(r.preferences);setMessage('Görünümün kaydedildi.')}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 const reset=()=>{const grade=Number(data?.enrollment?.grade_level||0);const theme=grade<=6?'MIDDLE_FUN':grade<=8?'MIDDLE_FOCUS':grade<=10?'HIGH_MODERN':grade===11?'HIGH_GROWTH':'EXAM_FOCUS';const next={theme_key:theme,appearance:'AUTO',font_key:'SYSTEM',font_scale:1,animation_level:'NORMAL',countdown_enabled:1,countdown_flip_clock:1,motivation_enabled:1,voice_motivation_enabled:0,countdown_label:null,countdown_target_date:null,motivation_identity:null};setForm(next);void save(next)};
 if(!form)return error?<div className="alert error">{error}</div>:<div className="empty">Görünüm ayarları yükleniyor…</div>;
 return <>
  <div className="page-head"><div><span className="eyebrow">Benim alanım</span><h1>✨ Görünümümü Kişiselleştir</h1><p>Telefonundaki gibi sana uygun bir görünüm seç; istersen tek tuşla sınıf düzeyinin varsayılan tasarımına dön.</p></div></div>
  {error&&<div className="alert error">{error}</div>}{message&&<div className="alert success">{message}</div>}
  <div className="panel"><div className="panel-head"><div><h2>Tema</h2><p>Sınıfına uygun tema önerilir; diğer güvenli temaları da deneyebilirsin.</p></div></div><div className="theme-choice-grid">{themes.map(t=><button key={t.key} className={`theme-choice ${form.theme_key===t.key?'selected':''}`} onClick={()=>setForm({...form,theme_key:t.key})}><span>{t.grades}</span><strong>{t.name}</strong><small>{t.text}</small>{form.theme_key===t.key&&<Check/>}</button>)}</div></div>
  <div className="panel"><div className="panel-head"><div><h2>Okuma ve hareket</h2><p>Rahat okuyabildiğin görünümü ayarla.</p></div></div><div className="settings-grid"><label><span>Görünüm</span><select value={form.appearance} onChange={e=>setForm({...form,appearance:e.target.value})}><option value="AUTO">Cihaza göre</option><option value="LIGHT">Açık</option><option value="DARK">Koyu</option></select></label><label><span>Yazı boyutu · %{Math.round(Number(form.font_scale)*100)}</span><input type="range" min="0.85" max="1.30" step="0.05" value={form.font_scale} onChange={e=>setForm({...form,font_scale:Number(e.target.value)})}/></label><label><span>Animasyon</span><select value={form.animation_level} onChange={e=>setForm({...form,animation_level:e.target.value})}><option value="NORMAL">Normal</option><option value="REDUCED">Azaltılmış</option><option value="OFF">Kapalı</option></select></label></div></div>
  <div className="panel"><div className="panel-head"><div><h2>Hedef ve motivasyon</h2><p>Geri sayım ve motivasyon dilini sen kontrol edersin.</p></div><Sparkles/></div><div className="settings-grid"><label className="toggle-row"><input type="checkbox" checked={Boolean(form.countdown_enabled)} onChange={e=>setForm({...form,countdown_enabled:e.target.checked?1:0})}/><span>Hedef sınav geri sayımını göster</span></label><label className="toggle-row"><input type="checkbox" checked={Boolean(form.countdown_flip_clock)} onChange={e=>setForm({...form,countdown_flip_clock:e.target.checked?1:0})}/><span>Karta dokununca saati göster</span></label><label className="toggle-row"><input type="checkbox" checked={Boolean(form.motivation_enabled)} onChange={e=>setForm({...form,motivation_enabled:e.target.checked?1:0})}/><span>Hedefe göre motive edici hitapları kullan</span></label><label className="toggle-row"><input type="checkbox" checked={Boolean(form.voice_motivation_enabled)} onChange={e=>setForm({...form,voice_motivation_enabled:e.target.checked?1:0})}/><Volume2 size={17}/><span>Sesli motivasyonlara izin ver</span></label></div></div>
  <div className="settings-actions"><button className="ghost" disabled={busy} onClick={reset}><RotateCcw size={16}/> Varsayılan temaya dön</button><button className="primary" disabled={busy} onClick={()=>void save()}><Check size={16}/> Kaydet</button></div>
 </>;
}
