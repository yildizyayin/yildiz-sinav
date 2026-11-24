import { useEffect,useMemo,useState } from 'react';
import { Check,Palette,RotateCcw,Sparkles,Volume2,VolumeX } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { readPanelTheme, writePanelTheme } from '../lib/panelTheme';
import { LEARNER_THEMES } from '../lib/learnerThemes';
import { playGlass, readSoundSettings, writeSoundSettings } from '../lib/glassSounds';

const themeClass:Record<string,string>={
  ANUNEX_STANDARD:'theme-card-standard',
  ANUNEX_COSMIC:'theme-card-corporate',
  ANUNEX_NEON:'theme-card-academy',
  ANUNEX_FOCUS:'theme-card-eclipse',
};

export function AppearanceSettings(){
  const [themes,setThemes]=useState<any[]>([]);
  const [selected,setSelected]=useState('ANUNEX_STANDARD');
  const { user } = useAuth();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [sound,setSound]=useState(readSoundSettings());const changeSound=(next:{enabled:boolean;volume:number})=>{setSound(next);writeSoundSettings(next)};

  useEffect(()=>{
    void api<any>('/api/panel-experience').then((data)=>{
      const allowed=data.allowedThemes||[];
      // parents see the same friendly names as students (Cam, Kozmik, Neon, Odak)
      setThemes(user?.role==='PARENT'?allowed.map((t:any)=>LEARNER_THEMES[t.theme_key]?{...t,name:LEARNER_THEMES[t.theme_key].name,description:LEARNER_THEMES[t.theme_key].text}:t):allowed);
      const saved=readPanelTheme(user?.id);
      const fallback=data.defaultTheme||'ANUNEX_STANDARD';
      setSelected(allowed.some((theme:any)=>theme.theme_key===saved)?saved||fallback:fallback);
    }).catch((e:any)=>setError(e.message));
  },[user?.id]);

  const current=useMemo(()=>themes.find(theme=>theme.theme_key===selected),[themes,selected]);
  const save=()=>{
    setBusy(true);setMessage('');setError('');
    if(user)writePanelTheme(user.id,selected);
    window.dispatchEvent(new Event('anunex-theme-change'));
    setMessage('Tema seçimin bu cihaz için kaydedildi.');
    window.setTimeout(()=>setBusy(false),250);
  };
  const reset=()=>{
    setSelected('ANUNEX_STANDARD');
    if(user)writePanelTheme(user.id,null);
    window.dispatchEvent(new Event('anunex-theme-change'));
    setMessage('ANUNEX Standard görünümüne dönüldü.');
  };

  return <div className="appearance-settings-page">
    <div className="page-head">
      <div><span className="eyebrow">Ayarlar · Görünüm</span><h1>Panel temasını seç</h1><p>{current?.name||'ANUNEX'} görünümü, menü ve çalışma ekranlarında senin için kullanılacak.</p></div>
      <div className="appearance-heading-icon"><Palette size={26}/></div>
    </div>
    {error&&<div className="alert error">{error}</div>}
    {message&&<div className="alert success">{message}</div>}
    <section className="panel appearance-panel">
      <div className="panel-head"><div><h2>ANUNEX tema galerisi</h2><p>Süper Admin’in açtığı temalar burada görünür. Her tema yalnızca renk değiştirmez; yoğunluk, yüzey ve vurgu dilini de değiştirir.</p></div><Sparkles/></div>
      <div className="appearance-theme-grid">
        {themes.map(theme=><button type="button" key={theme.theme_key} className={`appearance-theme-card ${themeClass[theme.theme_key]||'theme-card-standard'} ${selected===theme.theme_key?'selected':''}`} onClick={()=>setSelected(theme.theme_key)}>
          <span className="appearance-theme-preview" style={user?.role==='PARENT'&&LEARNER_THEMES[theme.theme_key]?{background:`linear-gradient(135deg,${LEARNER_THEMES[theme.theme_key].colors[0]} 45%,${LEARNER_THEMES[theme.theme_key].colors[1]} 80%,${LEARNER_THEMES[theme.theme_key].colors[2]})`}:undefined}><i/><i/><i/></span>
          <span className="appearance-theme-copy"><strong>{theme.name}</strong><small>{theme.description}</small></span>
          {selected===theme.theme_key&&<span className="appearance-selected"><Check size={15}/></span>}
        </button>)}
      </div>
      {!themes.length&&<div className="empty">Kullanılabilir tema bulunamadı.</div>}
    </section>
    {user?.role==='PARENT'&&<section className="panel appearance-panel">
      <div className="panel-head"><div><h2>Sesler</h2><p>Dokunuşlarda cam hissi veren kısa sesler. Bu cihazda saklanır.</p></div>{sound.enabled?<Volume2/>:<VolumeX/>}</div>
      <div style={{display:'grid',gap:12}}>
        <label style={{display:'flex',alignItems:'center',gap:10,fontWeight:600}}><input type="checkbox" style={{width:20,height:20}} checked={sound.enabled} onChange={e=>{const next={...sound,enabled:e.target.checked};changeSound(next);if(next.enabled)playGlass('tap')}}/> Sesleri aç</label>
        <label style={{display:'grid',gap:6}}><span>Ses düzeyi</span><input type="range" min={0.05} max={1} step={0.05} value={sound.volume} disabled={!sound.enabled} onChange={e=>changeSound({...sound,volume:Number(e.target.value)})} onPointerUp={()=>playGlass('tap')}/></label>
      </div>
    </section>}
    <div className="settings-actions appearance-actions"><button className="ghost" onClick={reset}><RotateCcw size={16}/> Standard’a dön</button><button className="primary" disabled={busy||!themes.length} onClick={save}><Check size={16}/> Temayı kullan</button></div>
  </div>;
}
