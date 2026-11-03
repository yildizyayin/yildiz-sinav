import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, PlayCircle, Send } from 'lucide-react';
import { api, ApiError } from '../api';
import './foy-online-optic.css';

/**
 * Föy online optik (owner, 2 Nov): the student marks the föy's answers here and submits once. The answer key is not
 * sent to the browser before the submission; the result then shows every question with the correct answer.
 */
type Subject = { subjectId: string; code: string; name: string; questionCount: number };
type Result = { channel: 'ONLINE' | 'PAPER'; correct: number; wrong: number; blank: number; total: number; successPercent: number;
  subjects: Array<{ subjectId: string; code: string; name: string; correct: number; wrong: number; blank: number; questions: Array<{ no: number; selected: string | null; correct: string | null; status: string; outcome: string | null; solutionUrl: string | null; topicUrl: string | null }> }> };

export function FoyOnlineOptic({ worksheetId }: { worksheetId: string }) {
  const [form, setForm] = useState<{ ready: boolean; optionCount: number; subjects: Subject[]; result: Result | null } | null>(null);
  const [marks, setMarks] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    setForm(null); setMarks({}); setError(''); setConfirm(false);
    void api<any>(`/api/worksheets/${encodeURIComponent(worksheetId)}/online-optic`).then(setForm).catch((e) => setError(e.message || 'Föy optiği açılamadı.'));
  }, [worksheetId]);
  const options = useMemo(() => 'ABCDE'.slice(0, form?.optionCount || 4).split(''), [form?.optionCount]);
  const marked = Object.values(marks).reduce((n, a) => n + a.filter(Boolean).length, 0);
  const total = (form?.subjects || []).reduce((n, s) => n + s.questionCount, 0);
  const pick = (code: string, i: number, o: string) => setMarks((m) => { const a = [...(m[code] || [])]; a[i] = a[i] === o ? '' : o; return { ...m, [code]: a }; });
  const submit = async () => {
    if (!form) return; setBusy(true); setError('');
    const answers = Object.fromEntries(form.subjects.map((s) => [s.code, Array.from({ length: s.questionCount }, (_, i) => marks[s.code]?.[i] || ' ').join('')]));
    try { const r = await api<any>(`/api/worksheets/${encodeURIComponent(worksheetId)}/online-optic`, { method: 'POST', body: JSON.stringify({ answers }) }); setForm({ ...form, result: r.result }); }
    catch (e: any) {
      setError(e.message || 'Gönderilemedi. Tekrar deneyin.');
      // already sent (another tab or device): show the first, counted submission
      if (e instanceof ApiError && e.code === 'FOY_ALREADY_SUBMITTED') void api<any>(`/api/worksheets/${encodeURIComponent(worksheetId)}/online-optic`).then(setForm).catch(() => undefined);
    }
    finally { setBusy(false); setConfirm(false); }
  };

  if (!form) return <section className="foy-optic" aria-labelledby="fo-title"><h3 id="fo-title">Online optik</h3>{error ? <p className="alert error">{error}</p> : <p className="muted" role="status">Yükleniyor…</p>}</section>;
  if (form.result) { const r = form.result; return <section className="foy-optic" aria-labelledby="fo-title">
    <div className="fo-head"><div><span className="eyebrow">Föy sonucun</span><h3 id="fo-title">{r.channel === 'ONLINE' ? 'Online optik gönderildi' : 'Kâğıt optiğin değerlendirildi'}</h3></div><CheckCircle2 aria-hidden="true" /></div>
    <div className="fo-kpis"><div><b>{r.correct}</b><small>doğru</small></div><div><b>{r.wrong}</b><small>yanlış</small></div><div><b>{r.blank}</b><small>boş</small></div><div><b>%{r.successPercent.toLocaleString('tr-TR')}</b><small>başarı</small></div></div>
    {r.subjects.map((s) => <div key={s.subjectId} className="fo-subject"><h4>{s.name}<small>{s.correct} D · {s.wrong} Y · {s.blank} B</small></h4>
      <ol className="fo-review">{s.questions.map((q) => <li key={q.no} className={`fo-q fo-${q.status.toLowerCase()}`}><span className="fo-no">{q.no}</span><span className="fo-ans" aria-label={`Senin cevabın ${q.selected || 'boş'}, doğru cevap ${q.correct || '-'}`}>{q.selected || '–'} <small>→ {q.correct || '-'}</small></span>
        <span className="fo-out">{q.outcome || ''}</span>{(q.solutionUrl || q.topicUrl) && q.status !== 'CORRECT' && <a href={q.solutionUrl || q.topicUrl || '#'} target="_blank" rel="noreferrer" className="fo-video"><PlayCircle size={14} aria-hidden="true" /> Video</a>}</li>)}</ol></div>)}
    {error && <p className="alert error">{error}</p>}
  </section>; }
  if (!form.ready) return <section className="foy-optic" aria-labelledby="fo-title"><h3 id="fo-title">Online optik</h3><p className="muted">Bu föyün cevap anahtarı henüz girilmedi. Anahtar girildiğinde cevaplarını buradan işaretleyebileceksin.</p></section>;
  return <section className="foy-optic" aria-labelledby="fo-title">
    <div className="fo-head"><div><span className="eyebrow">Online optik</span><h3 id="fo-title">Cevaplarını işaretle</h3><p className="muted">Föyü çözdükten sonra her sorunun cevabını işaretle. Gönderdikten sonra değiştiremezsin; ilk gönderimin geçerli olur.</p></div></div>
    {form.subjects.map((s) => <fieldset key={s.subjectId} className="fo-subject"><legend>{s.name} <small>{s.questionCount} soru</small></legend>
      <div className="fo-grid">{Array.from({ length: s.questionCount }, (_, i) => <div key={i} className="fo-row" role="radiogroup" aria-label={`${s.name} ${i + 1}. soru`}>
        <span className="fo-no">{i + 1}</span>{options.map((o) => { const on = marks[s.code]?.[i] === o; return <button key={o} type="button" role="radio" aria-checked={on} className={`fo-bubble ${on ? 'on' : ''}`} onClick={() => pick(s.code, i, o)}>{o}</button>; })}</div>)}</div></fieldset>)}
    {error && <p className="alert error">{error}</p>}
    <div className="fo-actions"><span className="muted">{marked}/{total} soru işaretli</span>
      {!confirm ? <button type="button" className="primary" disabled={!marked || busy} onClick={() => setConfirm(true)}><Send size={16} aria-hidden="true" /> Gönder</button>
        : <><span className="fo-confirm">{total - marked ? `${total - marked} soru boş kalacak. ` : ''}Gönderilsin mi?</span><button type="button" className="ghost" onClick={() => setConfirm(false)}>Vazgeç</button><button type="button" className="primary" disabled={busy} onClick={() => void submit()}>{busy ? 'Gönderiliyor…' : 'Evet, gönder'}</button></>}
    </div>
  </section>;
}
