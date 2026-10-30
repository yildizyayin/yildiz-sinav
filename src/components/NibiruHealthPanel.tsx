import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { api } from '../api';

/** Nibiru canlı kontrol (30 Oct): shows whether the text models, speech-to-text and Nibiru's voice really answer here. */
const STATE: Record<string, { text: string; cls: string }> = { OK: { text: 'Çalışıyor', cls: 'ok' }, FAIL: { text: 'Çalışmıyor', cls: 'fail' }, OFF: { text: 'Kapalı', cls: 'off' } };
const when = (s: string) => new Date(String(s).includes('T') ? s : String(s).replace(' ', 'T') + 'Z').toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function NibiruHealthPanel() {
  const [checks, setChecks] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = () => api<any>('/api/nibiru/health-check').then((r) => setChecks(r.checks || [])).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, []);
  const run = async () => { setBusy(true); setError(''); try { await api('/api/nibiru/health-check', { method: 'POST' }); await load(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  const last = checks[0];
  return <div className="panel nibiru-health" style={{ marginBottom: 20 }}>
    <div className="panel-head"><div><h2>Canlı kontrol</h2><p>Yazılı yapay zekâ modellerinin, sesli soru tanımanın ve Nibiru sesinin bu ortamda gerçekten çalışıp çalışmadığını dener. Öğrenci verisi gönderilmez; ücretli ses kapalıyken ücretli servise istek gitmez.</p></div><Activity /></div>
    {error && <div className="alert error" role="alert">{error}</div>}
    <button className="primary" disabled={busy} onClick={() => void run()}>{busy ? 'Kontrol ediliyor…' : 'Şimdi kontrol et'}</button>
    {last ? <>
      <p className="muted" style={{ marginTop: 12 }}>Son kontrol: {when(last.checkedAt)} · {last.environment} · {last.ok ? 'Sorun yok' : 'Sorun var'}</p>
      <ul className="nibiru-health-list">{(last.items || []).map((i: any) => <li key={i.key} className={`nh-${STATE[i.state]?.cls || 'off'}`}>
        <span className="nh-state">{STATE[i.state]?.text || i.state}</span>
        <span className="nh-main"><b>{i.label}</b>{i.model && <small>{i.model}</small>}<small>{i.detail}</small></span>
      </li>)}</ul>
    </> : <p className="muted" style={{ marginTop: 12 }}>Henüz kontrol yapılmadı.</p>}
  </div>;
}
