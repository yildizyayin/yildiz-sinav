import { useEffect, useState } from 'react';
import { api } from '../api';

/** 2 Nov: change an active exam's scoring profile while its publication is open for correction. */
export function ExamScoringCorrection({ examId, onSaved }: { examId: string; onSaved: () => void }) {
  const [data, setData] = useState<any>(null);
  const [choice, setChoice] = useState(''); const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState('');
  const load = () => api<any>(`/api/exam-definitions/${encodeURIComponent(examId)}/scoring-profile`).then((r) => { setData(r); setChoice(r.current || ''); }).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, [examId]);
  if (!data) return error ? <div className="alert error">{error}</div> : null;
  const name = (id: string) => { const o = data.options.find((x: any) => x.id === id); return o ? `${o.rule_name} · ${o.academic_year} ${o.version}` : 'Seçilmemiş'; };
  const save = async () => {
    setBusy(true); setError(''); setDone('');
    try { const r = await api<any>(`/api/exam-definitions/${encodeURIComponent(examId)}/scoring-profile`, { method: 'PUT', body: JSON.stringify({ scoringRuleVersionId: choice, reason }) }); setDone(r.next); setReason(''); await load(); onSaved(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return <section className="panel" style={{ marginBottom: 20 }}>
    <div className="panel-head"><div><h2>Puanlama profili</h2><p>Şu an: <strong>{name(data.current)}</strong></p></div></div>
    {error && <div className="alert error" role="alert">{error}</div>}{done && <div className="alert success" role="status">Profil değişti. {done}</div>}
    {!data.correctionOpen ? <p className="field-help">Aktif sınavın puanlama profili kilitlidir. Değiştirmek için önce Sonuç Ağı'nda bu sınavı <strong>"Düzeltmeye aç"</strong> ile açın; o zaman bu bölümde profil seçebilirsiniz.</p> : <>
      <div className="form-grid">
        <label>Yeni profil<select value={choice} onChange={(e) => setChoice(e.target.value)}>{data.options.map((o: any) => <option key={o.id} value={o.id}>{o.rule_name} · {o.academic_year} {o.version}</option>)}</select></label>
        <label>Gerekçe<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ör. Puan üretmeyen profil seçilmişti" /></label>
      </div>
      <p className="field-help">Kaydettikten sonra Sonuç Ağı'nda bu sınavın yüklemelerini yeniden "Değerlendir"in ve "Sonuçları yayınla"ya basın; puanlar yeni profille hesaplanır.</p>
      <button className="primary" disabled={busy || !choice || choice === data.current || reason.trim().length < 10} onClick={() => void save()}>{busy ? 'Kaydediliyor…' : 'Profili değiştir'}</button>
    </>}
  </section>;
}
