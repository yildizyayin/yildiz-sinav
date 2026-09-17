import { useEffect,useMemo,useState } from 'react';
import { Check,Palette,RotateCcw,Sparkles } from 'lucide-react';
import { api } from '../api';

const themeClass:Record<string,string>={
  ANUNEX_STANDARD:'theme-card-standard',
  ANUNEX_COSMIC:'theme-card-corporate',
  ANUNEX_NEON:'theme-card-academy',
  ANUNEX_FOCUS:'theme-card-eclipse',
};

export function AppearanceSettings(){
  const [themes,setThemes]=useState<any[]>([]);
  const [selected,setSelected]=useState('ANUNEX_STANDARD');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  useEffect(()=>{
    void api<any>('/api/panel-experience').then((data)=>{
      const allowed=data.allowedThemes||[];
      setThemes(allowed);
      const saved=window.localStorage.getItem('anunex-panel-theme');
      const fallback=data.defaultTheme||'ANUNEX_STANDARD';
      setSelected(allowed.some((theme:any)=>theme.theme_key===saved)?saved||fallback:fallback);
    }).catch((e:any)=>setError(e.message));
  },[]);

  const current=useMemo(()=>themes.find(theme=>theme.theme_key===selected),[themes,selected]);
  const save=()=>{
    setBusy(true);setMessage('');setError('');
    window.localStorage.setItem('anunex-panel-theme',selected);
    window.dispatchEvent(new Event('anunex-theme-change'));
    setMessage('Tema seçimin bu cihaz için kaydedildi.');
    window.setTimeout(()=>setBusy(false),250);
  };
  const reset=()=>{
    setSelected('ANUNEX_STANDARD');
    window.localStorage.removeItem('anunex-panel-theme');
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
          <span className="appearance-theme-preview"><i/><i/><i/></span>
          <span className="appearance-theme-copy"><strong>{theme.name}</strong><small>{theme.description}</small></span>
          {selected===theme.theme_key&&<span className="appearance-selected"><Check size={15}/></span>}
        </button>)}
      </div>
      {!themes.length&&<div className="empty">Kullanılabilir tema bulunamadı.</div>}
    </section>
    <div className="settings-actions appearance-actions"><button className="ghost" onClick={reset}><RotateCcw size={16}/> Standard’a dön</button><button className="primary" disabled={busy||!themes.length} onClick={save}><Check size={16}/> Temayı kullan</button></div>
  </div>;
}
