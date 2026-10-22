import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

const optionLabel = (o: any, j: number) => (typeof o === 'string' ? 'ABCDE'[j] : o?.label || 'ABCDE'[j]);
const optionText = (o: any) => (typeof o === 'string' ? o : o?.text ?? '');
const RESULT: Record<string, string> = { CORRECT: 'Doğru', WRONG: 'Yanlış', BLANK: 'Boş' };

/** A060: the student solves the homework online; answers are saved as a draft until submission. */
export function HomeworkSolve({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [d, setD] = useState<any>(null); const [answers, setAnswers] = useState<Record<string, string>>({}); const [error, setError] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const timer = useRef<any>(null);
  const load = async () => { try { const r = await api<any>(`/api/homework/${encodeURIComponent(id)}`); setD(r); setAnswers(r.draft?.answers || Object.fromEntries(r.questions.filter((q: any) => q.yourAnswer).map((q: any) => [q.questionId, q.yourAnswer]))); } catch (e: any) { setError(e.message); } };
  useEffect(() => { void load(); return () => clearTimeout(timer.current); }, [id]);
  const pick = (qid: string, l: string) => {
    const next = { ...answers, [qid]: answers[qid] === l ? '' : l }; setAnswers(next);
    clearTimeout(timer.current); timer.current = setTimeout(() => { api(`/api/homework/${encodeURIComponent(id)}/draft`, { method: 'PUT', body: JSON.stringify({ answers: next }) }).then(() => setNote('Taslak kaydedildi.')).catch((e: any) => setError(e.message)); }, 600);
  };
  const submit = async () => {
    const empty = d.questions.filter((q: any) => !answers[q.questionId]).length;
    if (!confirm(empty ? `${empty} soru boş. Yine de gönderilsin mi? Gönderdikten sonra değiştiremezsiniz.` : 'Ödev gönderilsin mi? Gönderdikten sonra değiştiremezsiniz.')) return;
    setBusy(true); clearTimeout(timer.current);
    try { await api(`/api/homework/${encodeURIComponent(id)}/submit`, { method: 'POST', body: JSON.stringify({ answers }) }); setNote('Ödev gönderildi.'); await load(); onChanged(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  if (!d) return error ? <div className="alert error">{error}</div> : <p>Yükleniyor…</p>;
  const a = d.assignment;
  return <div className="panel" style={{ marginTop: 8 }}>
    {error && <div className="alert error">{error}</div>}{note && <div className="alert success">{note}</div>}
    {a.overdue && <div className="alert warning">Son teslim tarihi geçti; yine de gönderebilirsiniz, geç teslim olarak görünür.</div>}
    {a.submitted && <p><strong>Gönderildi</strong>{a.revealed ? ` · ${d.questions.filter((q: any) => q.result === 'CORRECT').length}/${d.questions.length} doğru` : ''}</p>}
    {a.revealNote && <div className="alert info">{a.revealNote}</div>}
    {d.questions.map((q: any) => <div key={q.questionId} className="panel" style={{ marginTop: 6 }}>
      <p style={{ whiteSpace: 'pre-wrap' }}><strong>{q.no}.</strong> {q.stem}</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{q.options.map((o: any, j: number) => { const l = optionLabel(o, j); const mine = (a.submitted ? q.yourAnswer : answers[q.questionId]) === l;
        return <button key={l} className={mine ? 'primary' : 'ghost'} disabled={a.submitted} onClick={() => pick(q.questionId, l)}>{l}) {optionText(o)}{q.correctAnswer === l ? ' ✓' : ''}</button>; })}</div>
      {a.revealed && <div><p>Senin cevabın: {q.yourAnswer || '—'} · Doğru cevap: {q.correctAnswer} · {RESULT[q.result]}</p>
        {q.outcomes?.length > 0 && <p><small>Kazanım: {q.outcomes.map((o: any) => `${o.code} ${o.title}`).join('; ')}</small></p>}
        {q.solution && <details><summary>Çözüm</summary><p style={{ whiteSpace: 'pre-wrap' }}>{q.solution}</p></details>}
        {q.solutionVideos?.map((v: any) => <p key={v.url}><a href={v.url} target="_blank" rel="noreferrer">{v.title || 'Video çözüm'}</a></p>)}</div>}
    </div>)}
    {!a.submitted && <button className="primary" disabled={busy} onClick={() => void submit()}>Ödevi gönder</button>}
  </div>;
}

/** A060: wrong and blank answers of homework whose answers are open. */
export function HomeworkMistakes() {
  const [rows, setRows] = useState<any[] | null>(null); const [error, setError] = useState('');
  useEffect(() => { api<any>('/api/homework/mistakes').then((r) => setRows(r.mistakes)).catch((e) => setError(e.message)); }, []);
  if (error) return <div className="alert error">{error}</div>;
  if (!rows) return null;
  return <section className="panel"><h2>Yanlışlarım</h2><p>Cevapları açılmış ödevlerdeki yanlış ve boş soruların.</p>
    {!rows.length && <div className="empty">Şimdilik yanlış ya da boş sorun yok.</div>}
    {rows.map((r) => <details key={`${r.assignmentId}:${r.questionId}`}><summary>{r.assignmentTitle} · {r.subject || ''} · {RESULT[r.result]}</summary><p style={{ whiteSpace: 'pre-wrap' }}>{r.stem}</p><p>Senin cevabın: {r.yourAnswer || '—'} · Doğru cevap: {r.correctAnswer}</p>{r.solution && <p style={{ whiteSpace: 'pre-wrap' }}>{r.solution}</p>}</details>)}
  </section>;
}

/** A060: the teacher's class result per question and outcome. */
export function HomeworkResults({ id }: { id: string }) {
  const [d, setD] = useState<any>(null); const [error, setError] = useState('');
  const load = () => api<any>(`/api/homework/${encodeURIComponent(id)}/results`).then(setD).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, [id]);
  if (error) return <div className="alert error">{error}</div>;
  if (!d) return <p>Yükleniyor…</p>;
  const setReveal = async (v: string) => { try { await api(`/api/homework/${encodeURIComponent(id)}/reveal`, { method: 'PATCH', body: JSON.stringify({ answerReveal: v }) }); await load(); } catch (e: any) { setError(e.message); } };
  return <div className="panel" style={{ marginTop: 8 }}>
    <p>{d.submitted} gönderdi · {d.pending} bekliyor</p>
    <label>Cevaplar ne zaman açılsın?<select value={d.assignment.answerReveal} onChange={(e) => void setReveal(e.target.value)}><option value="AFTER_DUE">Son teslim tarihinden sonra</option><option value="AFTER_SUBMIT">Öğrenci gönderir göndermez</option></select></label>
    {d.questions.length > 0 && <table><thead><tr><th>Soru</th><th>Cevap</th><th>Doğru</th><th>Yanlış</th><th>Boş</th><th>Başarı</th></tr></thead><tbody>{d.questions.map((q: any) => <tr key={q.questionId}><td>{q.no}</td><td>{q.correctAnswer}</td><td>{q.correct}</td><td>{q.wrong}</td><td>{q.blank}</td><td>{q.percent == null ? '—' : `%${q.percent}`}</td></tr>)}</tbody></table>}
    {d.outcomes.length > 0 && <table><thead><tr><th>Kazanım</th><th>Doğru / cevap</th><th>Başarı</th></tr></thead><tbody>{d.outcomes.map((o: any) => <tr key={o.code}><td>{o.code} {o.title}</td><td>{o.correct}/{o.total}</td><td>{o.percent == null ? '—' : `%${o.percent}`}</td></tr>)}</tbody></table>}
    <table><thead><tr><th>Öğrenci</th><th>Durum</th><th>Puan</th></tr></thead><tbody>{d.students.map((s: any) => <tr key={s.id}><td>{s.name}</td><td>{s.score == null ? (s.status === 'STARTED' ? 'Başladı' : 'Göndermedi') : 'Gönderdi'}</td><td>{s.score == null ? '—' : `%${Math.round(s.score * 100)}`}</td></tr>)}</tbody></table>
  </div>;
}
