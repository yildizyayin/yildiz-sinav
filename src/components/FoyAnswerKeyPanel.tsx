import { useEffect, useState } from 'react';
import { KeyRound, Save } from 'lucide-react';
import { api } from '../api';

/**
 * Föy cevap anahtarı (30 Oct): one key per föy, used by the paper optic on sonuc and the student's online optic.
 * It can be entered after publishing too; once any student's föy is scored the key is locked.
 */
export function FoyAnswerKeyPanel({ worksheetId }: { worksheetId: string }) {
  const [data, setData] = useState<any>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const apply = (r: any) => { setData(r); setDraft(Object.fromEntries((r.subjects || []).map((s: any) => [s.subjectId, s.answers.map((a: string | null) => a || ' ').join('').trimEnd()]))); };
  useEffect(() => { if (worksheetId) void api<any>(`/api/worksheet-admin/${worksheetId}/answer-key`).then(apply).catch((e) => setError(e.message)); }, [worksheetId]);
  if (!worksheetId || !data) return error ? <div className="alert error" style={{ marginTop: 20 }}>{error}</div> : null;
  const clean = (v: string) => v.toLocaleUpperCase('tr-TR').replace(/[^ABCDE ]/g, '');
  const save = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await api<any>(`/api/worksheet-admin/${worksheetId}/answer-key`, { method: 'PUT', body: JSON.stringify({ subjects: data.subjects.map((s: any) => ({ subjectId: s.subjectId, answers: Array.from(draft[s.subjectId] || '').map((c) => c.trim()) })) }) });
      apply(r); setNotice(r.complete ? 'Cevap anahtarı tamam. Föy sonuc.anunex.com\'da değerlendirilebilir.' : `Kaydedildi. ${r.missing} soru eksik.`);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return <div className="panel" style={{ marginTop: 20 }}>
    <div className="panel-head"><div><h2>4. Cevap anahtarı (optik ve online)</h2><p>Her ders için cevapları sırayla yazın (A–E; boş bırakmak için boşluk). Bu anahtar sonuc'taki kâğıt optiği ve öğrencinin online optiğini puanlar.</p></div><KeyRound /></div>
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert success">{notice}</div>}
    {data.locked && <div className="alert info">Bu föy değerlendirildi; anahtar kilitli.</div>}
    {!data.subjects.length ? <p className="empty">Önce dersleri ve soru sayılarını kaydedin.</p> : <div className="form-grid">
      {data.subjects.map((s: any) => { const v = draft[s.subjectId] || '', filled = Array.from(v).filter((c) => c !== ' ').length;
        return <label key={s.subjectId}>{s.name} · {s.questionCount} soru
          <input value={v} maxLength={s.questionCount} disabled={data.locked} spellCheck={false} autoCapitalize="characters" style={{ fontFamily: 'ui-monospace,Menlo,monospace', letterSpacing: '.18em' }} onChange={(e) => setDraft({ ...draft, [s.subjectId]: clean(e.target.value) })} aria-describedby={`k-${s.subjectId}`} />
          <small id={`k-${s.subjectId}`} className="field-help">{filled}/{s.questionCount} girildi</small></label>; })}
    </div>}
    {!data.locked && data.subjects.length > 0 && <button className="primary" disabled={busy} onClick={() => void save()}><Save /> {busy ? 'Kaydediliyor…' : 'Anahtarı kaydet'}</button>}
  </div>;
}
