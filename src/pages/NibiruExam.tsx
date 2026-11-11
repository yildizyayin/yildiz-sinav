import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ClipboardCheck, XCircle } from 'lucide-react';
import { api } from '../api';
import { NibiruMark } from '../components/NibiruMark';
import { QuestionDataVisual } from '../components/QuestionDataVisual';
import '../components/universe/universe.css';

/**
 * Nibiru denemesi (owner, 11 Nov 2026): 10 or 20 new questions from the student's own grade, weaker outcomes first.
 * When there are not enough approved questions the page says how many exist; it never fills the gap.
 */
const pct = (n: number | null | undefined) => (n == null ? '—' : `%${Math.round(n)}`);

export function NibiruExam() {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [past, setPast] = useState<any[]>([]);
  const [exam, setExam] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [error, setError] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef('');

  const loadPast = () => api<any>('/api/student-standard/universe/exams').then((r) => setPast(r.exams || [])).catch(() => setPast([]));
  useEffect(() => {
    api<any>('/api/student-standard/universe/map').then((r) => setSubjects((r.subjects || []).map((s: any) => ({ id: s.id, name: s.name })))).catch(() => setSubjects([]));
    void loadPast();
  }, []);

  const start = async (questionCount: number) => {
    setBusy(true); setError(null);
    key.current = `nx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const r = await api<any>('/api/student-standard/universe/exams', { method: 'POST', body: JSON.stringify({ questionCount, subjectId: subjectId || null, clientKey: key.current }) });
      setAnswers({}); setExam(r);
    } catch (e: any) { setError({ message: e.message, details: e.details || null }); } finally { setBusy(false); }
  };
  const open = async (id: string) => { setError(null); try { setAnswers({}); setExam(await api<any>(`/api/student-standard/universe/exams/${encodeURIComponent(id)}`)); } catch (e: any) { setError({ message: e.message }); } };
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api<any>(`/api/student-standard/universe/exams/${encodeURIComponent(exam.exam.id)}/submit`, { method: 'POST', body: JSON.stringify({ answers: exam.items.map((i: any) => ({ seq: i.seq, answer: answers[i.seq] || '' })) }) });
      setExam(r); void loadPast(); window.scrollTo?.(0, 0);
    } catch (e: any) { setError({ message: e.message }); } finally { setBusy(false); }
  };

  if (exam?.exam?.status === 'READY') {
    const answered = exam.items.filter((i: any) => answers[i.seq]).length;
    return <div className="uv-player">
      <div className="uv-top"><strong>Nibiru denemesi · {exam.exam.questionCount} soru{exam.exam.subjectName ? ` · ${exam.exam.subjectName}` : ''}</strong><span>{answered}/{exam.items.length} cevaplandı</span></div>
      {error && <div className="alert error">{error.message}</div>}
      {exam.items.map((q: any) => <fieldset key={q.seq} className="uv-card" style={{ margin: 0 }}>
        <legend className="uv-note">{q.seq}. soru · {q.outcome.subjectName} · {q.outcome.code}</legend>
        {q.stem && <p className="uv-stem">{q.stem}</p>}
        {q.assets.filter((a: any) => a.placement === 'STEM' || !a.placement).map((a: any, k: number) => a.url && <img key={k} className="uv-img" src={a.url} alt={a.alt || 'Soru görseli'} />)}
        <QuestionDataVisual blocks={q.blocks} />
        <div className="uv-options" role="radiogroup" aria-label={`${q.seq}. soru seçenekleri`}>{q.options.map((o: any) => <button key={o.key} type="button" role="radio" aria-checked={answers[q.seq] === o.key}
          className={`uv-opt${answers[q.seq] === o.key ? ' on' : ''}`} onClick={() => setAnswers({ ...answers, [q.seq]: answers[q.seq] === o.key ? '' : o.key })}><b>{o.key}</b><span>{o.text}</span></button>)}</div>
      </fieldset>)}
      <div className="uv-actions"><span className="uv-hint">Boş bıraktığın sorular boş sayılır.</span><button className="primary" disabled={busy} onClick={() => void submit()}>Denemeyi bitir</button></div>
    </div>;
  }

  if (exam?.exam?.status === 'SUBMITTED') return <div className="uv-player">
    <div className="uv-card uv-summary"><ClipboardCheck size={28} aria-hidden="true" /><strong>{exam.exam.correct}/{exam.exam.questionCount} doğru</strong><span>{pct(exam.exam.scorePercent)}{exam.exam.blank ? ` · ${exam.exam.blank} boş` : ''}</span></div>
    <section className="uv-card"><h2 style={{ margin: 0, fontSize: 17 }}>Kazanımlara göre</h2>
      <ul className="uv-key" style={{ paddingLeft: 18 }}>{exam.outcomes.map((o: any) => <li key={o.id}>{o.subjectName} · {o.code} {o.title}: <b>{o.correct}/{o.total}</b></li>)}</ul>
      <p className="uv-hint">Bu cevaplar karnene soru çözme olarak işlendi.</p></section>
    {exam.items.map((q: any) => <div key={q.seq} className={`uv-card uv-result ${q.correct ? 'ok' : 'no'}`}>
      <div className="uv-result-head">{q.correct ? <CheckCircle2 size={18} color="#16a34a" aria-hidden="true" /> : <XCircle size={18} color="#dc2626" aria-hidden="true" />}{q.seq}. soru · {q.outcome.code}</div>
      {q.stem && <p className="uv-stem">{q.stem}</p>}
      <p className="uv-key">Senin cevabın: {q.answer || 'boş'} · Doğru cevap: {q.key}</p>
      {q.solution && <p className="uv-key">{q.solution}</p>}
    </div>)}
    <div className="uv-actions"><button className="secondary" onClick={() => setExam(null)}>Yeni deneme</button><Link className="ghost" to="/evren">Öğrenme haritası</Link></div>
  </div>;

  return <div className="uv-player">
    <div className="uv-card" style={{ gridTemplateColumns: 'auto 1fr', alignItems: 'center' }}>
      <NibiruMark size={48} state="active" title="" />
      <div><h1 style={{ margin: 0, fontSize: 22 }}>Nibiru denemesi</h1><p className="uv-note" style={{ marginTop: 4 }}>Sınıfının kazanımlarından daha önce görmediğin sorular; önce çalışman gereken kazanımlar gelir.</p></div>
    </div>
    {error && <div className="alert info">{error.message}{error.details?.available != null ? ` Şu an ${error.details.available} uygun soru var.` : ''}</div>}
    <div className="uv-card">
      <label>Ders<select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">Bütün dersler</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <div className="uv-actions" style={{ justifyContent: 'flex-start' }}>
        <button className="primary" disabled={busy} onClick={() => void start(10)}>10 soruluk deneme</button>
        <button className="secondary" disabled={busy} onClick={() => void start(20)}>20 soruluk deneme</button>
      </div>
    </div>
    {past.length > 0 && <div className="uv-card"><h2 style={{ margin: 0, fontSize: 17 }}>Önceki denemelerin</h2>
      <ul className="uv-key" style={{ paddingLeft: 18 }}>{past.map((p) => <li key={p.id}><button type="button" className="link-button" onClick={() => void open(p.id)}>
        {new Date(String(p.created_at).replace(' ', 'T') + 'Z').toLocaleDateString('tr-TR')} · {p.question_count} soru{p.subject_name ? ` · ${p.subject_name}` : ''} · {p.status === 'SUBMITTED' ? `${p.correct_count}/${p.question_count} doğru` : 'devam ediyor'}</button></li>)}</ul></div>}
  </div>;
}
