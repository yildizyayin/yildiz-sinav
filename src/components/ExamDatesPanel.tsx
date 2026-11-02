import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { api } from '../api';

/** LGS/YKS sayacı (30 Oct): the Super Admin records the official exam dates with their source. */
export function ExamDatesPanel() {
  const [items, setItems] = useState<any[]>([]);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [msg, setMsg] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState('');
  const load = () => api<any>('/api/admin/result-network/exam-dates').then((r) => { setItems(r.items || []); setDraft(Object.fromEntries((r.items || []).map((x: any) => [x.code, { title: x.title, date: x.exam_date || '', time: x.exam_time || '', sourceLabel: x.source_label || '', sourceUrl: x.source_url || '' }]))); }).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, []);
  const save = async (code: string) => { setBusy(code); setError(''); setMsg(''); try { const d = draft[code]; await api('/api/admin/result-network/exam-dates', { method: 'PUT', body: JSON.stringify({ code, title: d.title, date: d.date || null, time: d.time || null, sourceLabel: d.sourceLabel, sourceUrl: d.sourceUrl }) }); await load(); setMsg(`${code} tarihi kaydedildi.`); } catch (e: any) { setError(e.message); } finally { setBusy(''); } };
  const set = (code: string, patch: any) => setDraft((d) => ({ ...d, [code]: { ...d[code], ...patch } }));
  return <section className="panel" style={{ marginBottom: 20 }}>
    <div className="panel-head"><div><span className="eyebrow">ÖĞRENCİ PANELİ</span><h2>LGS / YKS geri sayımı</h2><p>8. sınıf öğrencileri LGS'ye, 12. sınıf öğrencileri YKS'ye kalan süreyi görür. Yalnız kaynağı olan resmî tarih gösterilir; tarih boşsa öğrenciye "henüz açıklanmadı" yazar.</p></div><CalendarClock /></div>
    {error && <div className="alert error" role="alert">{error}</div>}{msg && <div className="alert success" role="status">{msg}</div>}
    {items.map((x) => { const d = draft[x.code] || {}; return <div key={x.code} className="form-grid" style={{ borderTop: '1px solid #e2e7ed', paddingTop: 14, marginTop: 14 }}>
      <label>Başlık ({x.grade_level}. sınıf)<input value={d.title || ''} onChange={(e) => set(x.code, { title: e.target.value })} /></label>
      <label>Sınav tarihi<input type="date" value={d.date || ''} onChange={(e) => set(x.code, { date: e.target.value })} /></label>
      <label>Oturum saati (isteğe bağlı)<input type="time" value={d.time || ''} onChange={(e) => set(x.code, { time: e.target.value })} /></label>
      <label>Kaynak *<input value={d.sourceLabel || ''} onChange={(e) => set(x.code, { sourceLabel: e.target.value })} placeholder={x.code === 'LGS' ? 'Ör. MEB 2027 LGS duyurusu' : 'Ör. ÖSYM 2027 sınav takvimi'} /></label>
      <label>Kaynak bağlantısı<input value={d.sourceUrl || ''} onChange={(e) => set(x.code, { sourceUrl: e.target.value })} placeholder="https://" /></label>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}><button className="primary" disabled={busy === x.code || (Boolean(d.date) && !String(d.sourceLabel || '').trim())} onClick={() => void save(x.code)}>{busy === x.code ? 'Kaydediliyor…' : 'Kaydet'}</button><small className="field-help">{x.status === 'OFFICIAL' ? 'Öğrenciye sayaç gösteriliyor.' : 'Tarih yok: "henüz açıklanmadı" gösteriliyor.'}</small></div>
    </div>; })}
  </section>;
}
