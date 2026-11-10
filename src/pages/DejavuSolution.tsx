import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Eye, PlayCircle } from 'lucide-react';
import { api } from '../api';
import { embeddableVideo } from '../lib/physicalLink';

/**
 * Dejavu (owner, 10 Nov 2026): the page a printed QR opens. First the question and, if there is one, an approved
 * topic video; the answer and the written solution only when the student asks. Seeing the key before answering means
 * that question no longer counts in the karne, and the page says so before it reveals anything.
 */
export function DejavuSolution() {
  const { code = '' } = useParams();
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<any>(`/api/student-books/solutions/${encodeURIComponent(code)}`).then(setD).catch((e) => setError(e.message)); }, [code]);
  const reveal = async () => { setBusy(true); try { setD(await api<any>(`/api/student-books/solutions/${encodeURIComponent(code)}/reveal`, { method: 'POST', body: '{}' })); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  if (error) return <div className="panel"><div className="alert error">{error}</div><Link className="ghost" to="/my-books">Kitaplarıma dön</Link></div>;
  if (!d) return <div className="panel">Yükleniyor…</div>;
  const embed = d.video ? embeddableVideo(d.video.url) : null;
  const options: any[] = Array.isArray(d.question?.options) ? d.question.options : [];
  return <div style={{ maxWidth: 760, margin: '0 auto', display: 'grid', gap: 14 }}>
    <div className="page-head"><div><span className="eyebrow">Dejavu · {d.bookTitle}</span><h1>{d.number}. soru</h1><p>{d.outcome?.subjectName ? `${d.outcome.subjectName} · ` : ''}{d.outcome?.code ? `${d.outcome.code} ` : ''}{d.outcome?.title}</p></div></div>
    <section className="panel" style={{ display: 'grid', gap: 8 }}>
      <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{d.question?.stem_text}</p>
      {options.length > 0 && <ol type="A" style={{ margin: 0, paddingLeft: 22 }}>{options.map((o, i) => <li key={i}>{typeof o === 'string' ? o : (o.text ?? o.label)}</li>)}</ol>}
      {d.answered && <p style={{ margin: 0 }}><strong>Senin cevabın: {d.answered.answer}</strong> · {d.answered.correct ? 'doğru' : 'yanlış'}</p>}
    </section>
    <section className="panel" style={{ display: 'grid', gap: 8 }}>
      <h2 style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><PlayCircle size={20} aria-hidden="true" /> Konu videosu</h2>
      {d.video ? <>{embed && <div style={{ position: 'relative', aspectRatio: '16/9', borderRadius: 14, overflow: 'hidden', background: '#000' }}><iframe title={d.video.title} src={embed} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" /></div>}
        <a className="ghost" href={d.video.url} target="_blank" rel="noreferrer">{d.video.title} · videoyu aç</a></>
        : <p className="muted" style={{ margin: 0 }}>Bu kazanım için henüz öğretmen onaylı bir video yok.</p>}
    </section>
    <section className="panel" style={{ display: 'grid', gap: 8 }}>
      <h2 style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><Eye size={20} aria-hidden="true" /> Cevap ve çözüm</h2>
      {d.solution ? <>
        <p style={{ margin: 0 }}><strong>Doğru cevap: {d.solution.correctAnswer}</strong></p>
        {d.solution.text ? <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{d.solution.text}</p> : <p className="muted" style={{ margin: 0 }}>Bu soru için yazılı çözüm henüz eklenmedi.</p>}
        {!d.countsAsEvidence && <p className="muted" style={{ margin: 0 }}>Cevabı görmeden önce işaretlemediğin için bu soru karnende ölçüm sayılmayacak.</p>}
      </> : <>
        <p style={{ margin: 0 }}>Önce kendin dene. Cevabı açarsan, bu soruyu sonradan girdiğinde karnende ölçüm sayılmaz.</p>
        <div><button className="primary" disabled={busy} onClick={() => void reveal()}>Cevabı ve çözümü göster</button></div>
      </>}
    </section>
    <div><Link className="ghost" to="/my-books">Kitaplarıma dön</Link></div>
  </div>;
}
