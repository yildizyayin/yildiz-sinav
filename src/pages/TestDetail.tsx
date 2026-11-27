import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, MonitorPlay, Pencil, Printer, ScanLine, Send } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { StudioPreview } from '../components/StudioPreview';
import { StudioOpticalScan } from '../components/StudioOpticalScan';
import { StudioDownloads } from '../components/StudioDownloads';
import { StudioHomeworkAssign } from '../components/StudioHomeworkAssign';
import { TestCheckDialog } from '../components/TestCheckDialog';
import './test-detail.css';

/**
 * One test (owner, 27 Nov 2026: "sonuç odaklı"): what to do next in three big buttons — Ödev ver, Yazdır, Tahtada
 * aç — and how it went: who solved it, each class's average, which questions and outcomes were hard. The first time
 * a test goes out the teacher confirms the questions suit the class.
 */
const TYPE: Record<string, string> = { PRACTICE_EXAM: 'Deneme', WRITTEN_EXAM: 'Yazılı', WORKSHEET: 'Test', PERSONAL_BOOK: 'Kişisel kitap' };
const date = (s: string | null) => { if (!s) return ''; const d = new Date(String(s).includes('T') ? s : `${String(s).replace(' ', 'T')}Z`); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }); };
const tone = (p: number | null) => (p == null ? 'none' : p < 50 ? 'low' : p < 75 ? 'mid' : 'high');

export function TestDetail() {
  const { testId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [panel, setPanel] = useState<'' | 'homework' | 'print'>('');
  const [ask, setAsk] = useState<'' | 'homework' | 'print' | 'board'>('');
  const [preview, setPreview] = useState(false);
  const [scan, setScan] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const load = () => api<any>(`/api/teacher-tests/${encodeURIComponent(testId)}`).then(setD).catch((e) => setError(e.message || 'Test açılamadı.'));
  useEffect(() => { void load(); }, [testId]);

  const go = (what: 'homework' | 'print' | 'board') => {
    if (!d?.checked) { setAsk(what); return; }
    if (what === 'board') navigate(`/board/${encodeURIComponent(testId)}`); else setPanel(panel === what ? '' : what);
  };
  if (error) return <div className="td"><Link className="td-back" to="/soru-havuzu/testlerim"><ArrowLeft size={18} aria-hidden="true" /> Testlerim</Link><div className="alert error" role="alert">{error}</div></div>;
  if (!d) return <div className="td"><p className="td-muted">Test yükleniyor…</p></div>;
  const t = d.test, sent = d.deliveries.length > 0;
  const manager = user?.role !== 'TEACHER';
  const answered = d.questions.some((q: any) => q.correctRate != null);

  return <div className="td">
    <Link className="td-back" to="/soru-havuzu/testlerim"><ArrowLeft size={18} aria-hidden="true" /> Testlerim</Link>
    <header className="td-head">
      <span className={`td-badge ${t.locked ? 'sent' : 'draft'}`}>{t.locked ? (sent ? 'Ödev verildi' : 'Kullanıldı') : 'Yarım kaldı'}</span>
      <h1>{t.title}</h1>
      <p className="td-meta">{[manager ? t.teacher : null, TYPE[t.type] || t.type, t.gradeLevel ? `${t.gradeLevel}. sınıf` : null, t.subject, `${t.questionCount} soru`].filter(Boolean).join(' · ')}</p>
      <p className={`td-check${d.checked ? ' ok' : ''}`}>{d.checked ? <><CheckCircle2 size={16} aria-hidden="true" /> Kontrol edildi · {d.checked.by} · {date(d.checked.at)}</> : 'İlk gönderimden önce bir kez “sorular uygun” onayı istenir.'}</p>
    </header>
    {notice && <div className="alert success" role="status">{notice}</div>}

    <div className="td-actions">
      {t.canAssign && <button type="button" className={`td-act primary${panel === 'homework' ? ' on' : ''}`} aria-expanded={panel === 'homework'} onClick={() => go('homework')}><Send size={22} aria-hidden="true" />{sent ? 'Başka sınıfa ödev ver' : 'Ödev ver'}</button>}
      <button type="button" className={`td-act${panel === 'print' ? ' on' : ''}`} aria-expanded={panel === 'print'} onClick={() => go('print')}><Printer size={22} aria-hidden="true" />Yazdır</button>
      <button type="button" className="td-act" onClick={() => go('board')}><MonitorPlay size={22} aria-hidden="true" />Tahtada aç</button>
      {!t.locked && <button type="button" className="td-act ghost" onClick={() => setPreview(true)}><Pencil size={20} aria-hidden="true" />Soruları düzenle</button>}
    </div>
    {!t.canAssign && <p className="td-muted">Bu tür test ödev olarak verilmez; yazdırabilir ya da tahtada açabilirsin.</p>}
    {panel === 'homework' && <section className="td-panel" aria-label="Ödev ver"><StudioHomeworkAssign documentId={t.id} round={sent ? 'NEXT' : undefined} onError={setError} onDone={(m) => { setNotice(m); setPanel(''); void load(); }} /></section>}
    {panel === 'print' && <section className="td-panel" aria-label="Yazdır"><StudioDownloads document={t.doc} onError={setError} /><button type="button" className="td-mini" onClick={() => setScan(true)}><ScanLine size={16} aria-hidden="true" /> Optik okut</button></section>}

    <section className="td-results" aria-labelledby="td-r">
      <h2 id="td-r">Sonuçlar</h2>
      {!sent && !d.optical.count && <p className="td-empty">Henüz sonuç yok. Ödev verdiğinde ya da optik okuttuğunda sonuçlar burada görünür.</p>}
      {d.deliveries.length > 0 && <div className="td-rounds">{d.deliveries.map((r: any, n: number) => {
        const pct = r.total ? Math.round((100 * r.done) / r.total) : 0;
        return <article key={r.round} className="td-round">
          <div className="td-round-top">
            <div><strong>{r.classes.join(', ') || `${n + 1}. gönderim`}</strong><span>{date(r.sentAt)}{r.dueAt ? ` · son gün ${date(r.dueAt)}` : ''}</span></div>
            <svg className="td-ring" viewBox="0 0 36 36" role="img" aria-label={`${r.total} öğrenciden ${r.done} çözdü`}><circle cx="18" cy="18" r="15.5" className="track" /><circle cx="18" cy="18" r="15.5" className="fill" pathLength={100} strokeDasharray={`${pct} 100`} /><text x="18" y="21">{r.done}/{r.total}</text></svg>
          </div>
          <p className="td-avg">{r.average != null ? <>Sınıf ortalaması <b className={tone(r.average)}>%{r.average}</b></> : 'Henüz çözen yok'}</p>
          <button type="button" className="td-mini" aria-expanded={open === r.round} onClick={() => setOpen(open === r.round ? null : r.round)}>{open === r.round ? 'Öğrencileri gizle' : 'Öğrencileri göster'}</button>
          {open === r.round && <ul className="td-students">{r.students.map((s: any, k: number) => <li key={k}><span>{s.name}{s.className ? <small> · {s.className}</small> : null}</span><b className={s.done ? tone(s.percent) : 'none'}>{s.done ? (s.percent != null ? `%${s.percent}` : 'Çözdü') : 'Çözmedi'}</b></li>)}</ul>}
        </article>;
      })}</div>}
      {d.optical.count > 0 && <p className="td-optical">Optik okuma: <b>{d.optical.count}</b> öğrenci{d.optical.average != null ? <> · ortalama <b className={tone(d.optical.average)}>%{d.optical.average}</b></> : null}</p>}
      {answered && <div className="td-split">
        <div className="td-card">
          <h3>Soru soru</h3>
          <ol className="td-bars">{d.questions.map((q: any) => <li key={q.no}>
            <span className="td-no">{q.no}</span>
            <span className="td-bar" title={q.stem}><span className={tone(q.correctRate)} style={{ width: `${q.correctRate ?? 0}%` }} /></span>
            <b>{q.correctRate != null ? `%${q.correctRate}` : '—'}</b>
          </li>)}</ol>
        </div>
        <div className="td-card">
          <h3>Kazanımlar <small>en çok zorlanılan üstte</small></h3>
          <ul className="td-outcomes">{d.outcomes.map((o: any) => <li key={o.title}><span>{o.title}</span><b className={tone(o.correctRate)}>{o.correctRate != null ? `%${o.correctRate}` : '—'}</b></li>)}</ul>
        </div>
      </div>}
    </section>

    {ask && <TestCheckDialog testId={t.id} onCancel={() => setAsk('')} onReview={() => { setAsk(''); setPreview(true); }} onConfirmed={() => { const w = ask; setAsk(''); void load().then(() => { if (w === 'board') navigate(`/board/${encodeURIComponent(testId)}`); else setPanel(w); }); }} />}
    {preview && <StudioPreview document={t.doc} onClose={() => { setPreview(false); void load(); }} onChanged={() => void load()} />}
    {scan && <StudioOpticalScan document={t.doc} onClose={() => setScan(false)} />}
  </div>;
}
