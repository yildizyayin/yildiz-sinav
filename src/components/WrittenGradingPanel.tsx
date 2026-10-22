import { useEffect, useState } from 'react';
import { api } from '../api';

/** A041: teacher grading of a final written paper. AI only suggests; the teacher enters and finalises. */
export function WrittenGradingPanel({ paperId }: { paperId: string }) {
  const [ov, setOv] = useState<any>(null);
  const [student, setStudent] = useState<string>('');
  const [d, setD] = useState<any>(null);
  const [pick, setPick] = useState<Record<string, number[]>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [answer, setAnswer] = useState<Record<string, string>>({});
  const [suggestion, setSuggestion] = useState<Record<string, any>>({});
  const [finalReason, setFinalReason] = useState('');
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const base = `/api/written-papers/${paperId}/grading`;
  const load = async () => { try { setOv(await api<any>(base)); } catch (e: any) { setError(e.message); } };
  const open = async (id: string) => { setStudent(id); try { const r = await api<any>(`${base}/${id}`); setD(r); setPick(Object.fromEntries(r.items.map((i: any) => [i.id, i.versions.length ? i.versions[i.versions.length - 1].criterion_points : i.criteria.map(() => 0)]))); } catch (e: any) { setError(e.message); } };
  useEffect(() => { void load(); }, [paperId]);
  const act = async (fn: () => Promise<any>, ok: string) => { setBusy(true); setError(''); setNotice(''); try { const r = await fn(); setNotice(ok); await load(); if (student) await open(student); return r; } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  const current = ov?.students.find((s: any) => s.id === student);
  return <div className="panel" style={{ marginTop: 16 }}>
    <h3>Öğretmen puanlaması</h3>
    <p>Her ölçüt için rubrikteki puan düzeylerinden birini seçin. Her kayıt yeni bir sürümdür; değişiklikler gerekçe ister. AI yalnız öneri verir; not sizin girdiğiniz puanlardan ve sizin kesinleştirmenizle oluşur.</p>
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert success">{notice}</div>}
    <table><thead><tr><th>No</th><th>Öğrenci</th><th>Puanlanan</th><th>Ara toplam</th><th>Kesin not</th><th></th></tr></thead><tbody>
      {(ov?.students || []).map((s: any) => <tr key={s.id}><td>{s.student_number}</td><td>{s.first_name} {s.last_name}</td><td>{s.scored}/{s.items}</td><td>{s.runningTotal}</td><td>{s.final ? `${s.final.total_points} (v${s.final.version})${s.changedSinceFinal ? ' · değişti, yeniden kesinleştirin' : ''}` : '—'}</td><td><button className="ghost" onClick={() => void open(s.id)}>Puanla</button></td></tr>)}
    </tbody></table>
    {d && current && <div style={{ marginTop: 12 }}>
      <h4>{current.first_name} {current.last_name} · {current.student_number}</h4>
      {d.items.map((i: any) => { const last = i.versions[i.versions.length - 1]; const sel = pick[i.id] || []; return <div key={i.id} className="panel" style={{ marginTop: 8 }}>
        <strong>{i.no}. soru ({i.points} puan){i.source === 'ZUMRE' ? ' · zümre' : ''}</strong><p style={{ whiteSpace: 'pre-wrap' }}>{i.stem}</p><small>Model cevap: {i.modelAnswer}</small>
        {i.criteria.map((c: any, k: number) => <label key={k} style={{ display: 'block' }}>{c.criterion}: <select value={sel[k] ?? 0} onChange={(e) => setPick({ ...pick, [i.id]: sel.map((x: number, j: number) => (j === k ? Number(e.target.value) : x)) })}>{c.levels.map((pts: number, j: number) => <option key={pts} value={pts}>{pts} — {c.descriptors[j]}</option>)}</select></label>)}
        {last && <input placeholder="Düzeltme gerekçesi (zorunlu)" value={reason[i.id] || ''} onChange={(e) => setReason({ ...reason, [i.id]: e.target.value })} />}
        <button className="primary" disabled={busy} onClick={() => void act(() => api(`${base}/${student}/items/${i.id}`, { method: 'POST', body: JSON.stringify({ criterionPoints: sel, reason: reason[i.id] || undefined, aiSuggestionId: suggestion[i.id]?.id }) }), 'Puan kaydedildi.')}>Puanı kaydet ({sel.reduce((t: number, v: number) => t + v, 0)})</button>
        {i.versions.length > 0 && <details><summary>Geçmiş ({i.versions.length} sürüm)</summary><ol>{i.versions.map((v: any) => <li key={v.id}>v{v.version}: {v.item_points} puan · {v.entered_name || v.entered_by} · {v.entered_at}{v.reason ? ` · ${v.reason}` : ''}{v.ai_suggestion_id ? ' · AI önerisine bakılarak' : ''}</li>)}</ol></details>}
        <details><summary>AI önerisi al (kesin not değildir)</summary><textarea placeholder="Öğrencinin cevabını yazın" value={answer[i.id] || ''} onChange={(e) => setAnswer({ ...answer, [i.id]: e.target.value })} />
          <button className="ghost" disabled={busy || !answer[i.id]} onClick={async () => { const r = await act(() => api<any>(`${base}/${student}/items/${i.id}/suggest`, { method: 'POST', body: JSON.stringify({ answerText: answer[i.id] }) }), 'AI önerisi geldi; kontrol edip kendi puanınızı kaydedin.'); if (r?.suggestion) { setSuggestion({ ...suggestion, [i.id]: r.suggestion }); setPick({ ...pick, [i.id]: r.suggestion.criterionPoints }); } }}>Öneri iste</button>
          {suggestion[i.id] && <p>Öneri: {suggestion[i.id].itemPoints} puan. {suggestion[i.id].rationale}</p>}</details>
      </div>; })}
      {current.final && <input placeholder="Kesin notu değiştirme gerekçesi" value={finalReason} onChange={(e) => setFinalReason(e.target.value)} />}
      <button className="primary" style={{ marginTop: 8 }} disabled={busy} onClick={() => { if (confirm('Bütün soruların puanını kontrol ettiniz mi? Not kesinleşecek.')) void act(() => api(`${base}/${student}/finalize`, { method: 'POST', body: JSON.stringify({ confirm: true, reason: finalReason || undefined }) }), 'Not kesinleşti.'); }}>Notu kesinleştir</button>
    </div>}
  </div>;
}
