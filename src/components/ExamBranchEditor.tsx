import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * Alt ders aralıkları (2 Nov): which questions of a TYT test belong to Tarih, Coğrafya, Fizik… The numbers are the
 * question's position inside its test. The ÖSYM order fills Sosyal and Fen as a suggestion to check against the
 * booklet; Temel Matematik has no fixed order, so Matematik/Geometri are entered by hand.
 */
const SUGGESTED: Record<string, Record<string, [number, number]>> = {
  TYT_SOS: { TYT_TAR: [1, 5], TYT_COG: [6, 10], TYT_FEL: [11, 15], TYT_DIN: [16, 20] },
  TYT_FEN: { TYT_FIZ: [1, 7], TYT_KIM: [8, 14], TYT_BIY: [15, 20] },
};

export function ExamBranchEditor({ examId }: { examId: string }) {
  const [data, setData] = useState<any>(null);
  const [ranges, setRanges] = useState<Record<string, { start: string; end: string }>>({});
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const apply = (r: any) => { setData(r); setRanges(Object.fromEntries((r.branches || []).map((b: any) => [b.branch_code, { start: String(b.question_start), end: String(b.question_end) }]))); };
  useEffect(() => { void api<any>(`/api/exam-definitions/${encodeURIComponent(examId)}/branches`).then(apply).catch((e) => setError(e.message)); }, [examId]);
  if (!data) return error ? <div className="alert error">{error}</div> : null;
  if (!data.supported || !data.subjects.length) return <section className="panel"><h2>Alt dersler</h2><p>Alt ders aralıkları şimdilik yalnız TYT sınavlarında tanımlanır.</p></section>;
  const set = (code: string, k: 'start' | 'end', v: string) => setRanges((r) => ({ ...r, [code]: { start: r[code]?.start || '', end: r[code]?.end || '', [k]: v.replace(/\D/g, '').slice(0, 3) } }));
  const suggest = () => { const next = { ...ranges }; for (const s of data.subjects) for (const [code, [a, b]] of Object.entries(SUGGESTED[String(s.code).toUpperCase()] || {})) if (b <= s.questionCount) next[code] = { start: String(a), end: String(b) }; setRanges(next); setNotice('ÖSYM sırası dolduruldu. Kitapçıkla karşılaştırıp kaydedin.'); };
  const save = async () => {
    setBusy(true); setError(''); setNotice('');
    const branches = data.subjects.flatMap((s: any) => s.options.filter((o: any) => ranges[o.code]?.start && ranges[o.code]?.end).map((o: any) => ({ subjectId: s.subjectId, code: o.code, start: Number(ranges[o.code].start), end: Number(ranges[o.code].end) })));
    try { apply(await api<any>(`/api/exam-definitions/${encodeURIComponent(examId)}/branches`, { method: 'PUT', body: JSON.stringify({ branches }) })); setNotice('Alt ders aralıkları kaydedildi. Sonuçlar bir sonraki dondurma / yayında alt derslerle görünür.'); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return <section className="panel exam-branches"><div className="panel-head"><div><h2>Alt dersler</h2><p>Her testin içinde hangi soruların hangi alt derse ait olduğunu yazın (testin kendi soru numarasıyla, ör. Sosyal 1–5 Tarih). Öğrenci sonucunda ana testin altında alt ders satırları çıkar; ana toplamlar, puan ve sıralamalar değişmez.</p></div></div>
    {error && <div className="alert error" role="alert">{error}</div>}{notice && <div className="alert success" role="status">{notice}</div>}
    <button type="button" className="secondary" onClick={suggest}>Sosyal ve Fen için ÖSYM sırasını doldur</button>
    {data.subjects.map((s: any) => <fieldset key={s.subjectId} className="exam-branch-subject"><legend>{s.name} · {s.questionCount} soru</legend>
      {String(s.code).toUpperCase() === 'TYT_MAT' && <p className="field-help">Matematik ve geometri soruları yayınevine göre sıralanır; kitapçığa bakarak girin. Geometri soruları tek bir ardışık blokta değilse bu sınavda ayrım yapmayın, alanları boş bırakın.</p>}
      <div className="exam-branch-rows">{s.options.map((o: any) => <div key={o.code} className="exam-branch-row"><span>{o.name}</span>
        <label>İlk soru<input inputMode="numeric" value={ranges[o.code]?.start || ''} onChange={(e) => set(o.code, 'start', e.target.value)} aria-label={`${o.name} ilk soru`} /></label>
        <label>Son soru<input inputMode="numeric" value={ranges[o.code]?.end || ''} onChange={(e) => set(o.code, 'end', e.target.value)} aria-label={`${o.name} son soru`} /></label></div>)}</div>
    </fieldset>)}
    <button type="button" className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Kaydediliyor…' : 'Alt dersleri kaydet'}</button>
  </section>;
}
