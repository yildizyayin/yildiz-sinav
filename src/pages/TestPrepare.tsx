import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Crosshair, Layers, Library } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import './test-prepare.css';

/**
 * Test Hazırla (owner, 27 Nov 2026: "basit, hızlı, sonuç odaklı"). One screen: what kind of test, which unit, go.
 * Everything else (how many questions, difficulty, A/B booklets) waits folded under "Diğer ayarlar" with sensible
 * defaults. Only approved questions are drawn — the server applies every gate again when the test is made.
 */
type Subject = { id: string; name: string; approved: number };
type Outcome = { code: string; title: string; unit: string; topic: string; academicYear: string; approved: number };
type Kind = 'UNIT' | 'OUTCOME' | 'EXAM';
const KINDS: Array<{ id: Kind; name: string; hint: string; icon: any }> = [
  { id: 'OUTCOME', name: 'Kazanım Testi', hint: 'Tek bir kazanımı ölç', icon: Crosshair },
  { id: 'UNIT', name: 'Ünite Testi', hint: 'Bir ünitenin tamamı', icon: Layers },
  { id: 'EXAM', name: 'Deneme', hint: 'Bütün üniteler, A/B kitapçık', icon: Library },
];
const LEVELS: Array<{ id: string; name: string; mix: Record<string, number> | null }> = [
  { id: 'ANY', name: 'Karışık', mix: null },
  { id: 'EASY', name: 'Kolay ağırlıklı', mix: { EASY: 50, MEDIUM: 40, HARD: 10 } },
  { id: 'HARD', name: 'Zor ağırlıklı', mix: { EASY: 15, MEDIUM: 45, HARD: 40 } },
];
const COUNTS = [5, 10, 15, 20, 25];
const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
/** "2. Ünite: Kuvveti Tanıyalım" → { no: '2', name: 'Kuvveti Tanıyalım' } */
export function unitParts(unit: string) { const m = /^\s*(\d+)\s*\.\s*(?:Ünite|Tema)\s*:?\s*(.*)$/i.exec(unit); return m ? { no: m[1], name: m[2].trim() || unit } : { no: '', name: unit }; }
const remembered = () => { try { const v = JSON.parse(localStorage.getItem('anunex.testPrepare') || '{}'); return { grade: Number(v.grade) || 5, subjectId: typeof v.subjectId === 'string' ? v.subjectId : '' }; } catch { return { grade: 5, subjectId: '' }; } };
const remember = (grade: number, subjectId: string) => { try { localStorage.setItem('anunex.testPrepare', JSON.stringify({ grade, subjectId })); } catch { /* not kept */ } };

export function TestPrepare() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const start = useMemo(remembered, []);
  const [grade, setGrade] = useState(start.grade);
  const [subjectId, setSubjectId] = useState(start.subjectId);
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('UNIT');
  const [unit, setUnit] = useState('');
  const [outcome, setOutcome] = useState('');
  const [count, setCount] = useState(10);
  const [level, setLevel] = useState('ANY');
  const [twoBooklets, setTwoBooklets] = useState(false);
  const [stock, setStock] = useState<{ available: number | null; message: string | null; loading: boolean }>({ available: null, message: null, loading: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // subjects of the grade (a teacher sees only their own branches; the server decides)
  useEffect(() => {
    setSubjects(null); setError('');
    api<any>(`/api/platform/studio/catalog?gradeLevel=${grade}`).then((r) => {
      const list: Subject[] = (r.subjects || []).map((s: any) => ({ id: s.id, name: s.name, approved: Number(s.approved || 0) }));
      setSubjects(list);
      setSubjectId((cur: string) => (list.some((s) => s.id === cur) ? cur : (list.find((s) => s.approved > 0) || list[0])?.id || ''));
    }).catch((e) => { setSubjects([]); setError(e?.message || 'Dersler yüklenemedi.'); });
  }, [grade]);
  // units and outcomes of the subject (newest program first)
  useEffect(() => {
    if (!subjectId) { setOutcomes([]); return; }
    setOutcomes(null); remember(grade, subjectId);
    api<any>(`/api/platform/studio/catalog?gradeLevel=${grade}&subjectId=${encodeURIComponent(subjectId)}`).then((r) => {
      const all: Outcome[] = (r.outcomes || []).map((o: any) => ({ ...o, approved: Number(o.approved || 0) }));
      const year = all.map((o) => o.academicYear).sort().reverse()[0];
      setOutcomes(all.filter((o) => o.academicYear === year));
    }).catch((e) => { setOutcomes([]); setError(e?.message || 'Üniteler yüklenemedi.'); });
  }, [grade, subjectId]);

  const units = useMemo(() => {
    const map = new Map<string, { unit: string; approved: number; outcomes: Outcome[] }>();
    for (const o of outcomes || []) { const u = map.get(o.unit) || { unit: o.unit, approved: 0, outcomes: [] }; u.approved += o.approved; u.outcomes.push(o); map.set(o.unit, u); }
    return [...map.values()].sort((a, b) => (Number(unitParts(a.unit).no) || 99) - (Number(unitParts(b.unit).no) || 99));
  }, [outcomes]);
  useEffect(() => { if (units.length && !units.some((u) => u.unit === unit)) setUnit((units.find((u) => u.approved > 0) || units[0]).unit); }, [units]);
  const unitRow = units.find((u) => u.unit === unit);
  useEffect(() => { if (unitRow && !unitRow.outcomes.some((o) => o.code === outcome)) setOutcome((unitRow.outcomes.find((o) => o.approved > 0) || unitRow.outcomes[0])?.code || ''); }, [unitRow?.unit]);
  useEffect(() => { if (kind === 'EXAM') { setCount(20); setTwoBooklets(true); } else { setCount(10); setTwoBooklets(false); } }, [kind]);

  const codes = kind === 'EXAM' ? [] : kind === 'OUTCOME' ? (outcome ? [outcome] : []) : (unitRow?.outcomes.map((o) => o.code) || []).slice(0, 30);
  const subject = subjects?.find((s) => s.id === subjectId);
  const outcomeRow = unitRow?.outcomes.find((o) => o.code === outcome);
  const title = kind === 'EXAM' ? `${grade}. sınıf ${subject?.name || ''} · Deneme`.trim()
    : kind === 'OUTCOME' ? `${outcomeRow?.code || ''} ${outcomeRow ? `· ${outcomeRow.title}` : ''} · Kazanım testi`.trim()
      : `${unitParts(unit).name} · Ünite testi`;

  // how many approved questions this choice really has (the server's own count)
  useEffect(() => {
    if (!subjectId || (kind !== 'EXAM' && !codes.length)) { setStock({ available: null, message: null, loading: false }); return; }
    let live = true; setStock((s) => ({ ...s, loading: true }));
    const q = new URLSearchParams({ gradeLevel: String(grade), subjectId, questionCount: String(count) });
    if (codes.length) q.set('outcomeCodes', codes.join(','));
    const t = setTimeout(() => api<any>(`/api/platform/studio/catalog?${q}`).then((r) => { if (live) setStock({ available: Number(r.available ?? 0), message: r.message || null, loading: false }); }).catch(() => { if (live) setStock({ available: null, message: null, loading: false }); }), 250);
    return () => { live = false; clearTimeout(t); };
  }, [grade, subjectId, kind, codes.join(','), count]);

  const short = stock.available !== null && !stock.loading && stock.available < count;
  const blocker = !subjectId ? 'Önce ders seç.' : kind !== 'EXAM' && !codes.length ? 'Önce ünite seç.' : short ? (stock.available ? `Bu seçimde ${stock.available} onaylı soru var. Soru sayısını azalt ya da başka ünite seç.` : 'Bu seçim için henüz onaylı soru yok. Başka bir ünite seç.') : '';
  const levelName = LEVELS.find((l) => l.id === level)!.name;

  const make = async () => {
    if (blocker || busy) return;
    setBusy(true); setError('');
    try {
      const r = await api<any>('/api/platform/studio', { method: 'POST', body: JSON.stringify({
        title: title.slice(0, 200), documentType: 'WORKSHEET', gradeLevel: grade, subjectId, questionCount: count, optionMode: 'MIXED',
        bookletCodes: twoBooklets ? ['A', 'B'] : ['A'], deliveryMode: 'PDF_OPTICAL', outcomeCodes: codes,
        difficultyMix: LEVELS.find((l) => l.id === level)!.mix || undefined, branding: { showAnunex: true, showNibiru: true, useInstitution: true },
      }) });
      navigate(`/soru-havuzu/hazirla/${encodeURIComponent(r.id)}`);
    } catch (e: any) { setError(e?.message || 'Test hazırlanamadı.'); setBusy(false); }
  };

  return <div className="tp">
    <div className="tp-top"><Link className="tp-back" to="/soru-havuzu"><ArrowLeft size={18} aria-hidden="true" /> Soru Havuzu</Link></div>
    <div className="tp-head">
      <h1>Ne hazırlıyorsun?</h1>
      <button type="button" className="tp-scope" aria-expanded={scopeOpen} onClick={() => setScopeOpen((v) => !v)}>{grade}. sınıf · {subject?.name || 'Ders seç'} <span>değiştir</span></button>
    </div>
    {scopeOpen && <div className="tp-scope-panel">
      <div><strong>Sınıf</strong><div className="tp-pills" role="radiogroup" aria-label="Sınıf">{GRADES.map((g) => <button key={g} type="button" role="radio" aria-checked={g === grade} className={g === grade ? 'on' : ''} onClick={() => setGrade(g)}>{g}</button>)}</div></div>
      <div><strong>Ders</strong><div className="tp-pills" role="radiogroup" aria-label="Ders">{!subjects ? <span className="tp-muted">Yükleniyor…</span> : subjects.length ? subjects.map((s) => <button key={s.id} type="button" role="radio" aria-checked={s.id === subjectId} className={s.id === subjectId ? 'on' : ''} onClick={() => { setSubjectId(s.id); setScopeOpen(false); }}>{s.name}<small>{s.approved} soru</small></button>) : <span className="tp-muted">Bu sınıf için ders bulunamadı.</span>}</div></div>
    </div>}
    {error && <div className="alert error" role="alert">{error}{user?.role === 'SUPER_ADMIN' ? ' Süper Admin olarak kurum adına test hazırlamak için İçerik Merkezi’ni kullan.' : ''}</div>}

    <div className="tp-kinds" role="radiogroup" aria-label="Test türü">{KINDS.map(({ id, name, hint, icon: Icon }) => <button key={id} type="button" role="radio" aria-checked={kind === id} className={`tp-kind${kind === id ? ' on' : ''}`} onClick={() => setKind(id)}>
      <span className="tp-kind-icon"><Icon size={28} aria-hidden="true" /></span><strong>{name}</strong><span>{hint}</span></button>)}</div>

    {kind !== 'EXAM' && <section className="tp-section" aria-labelledby="tp-unit">
      <h2 id="tp-unit">Hangi ünite?</h2>
      {!outcomes ? <p className="tp-muted">Üniteler yükleniyor…</p> : !units.length ? <p className="tp-empty">Bu ders için doğrulanmış ünite bulunamadı.</p>
        : <div className="tp-units">{units.map((u) => { const p = unitParts(u.unit); return <button key={u.unit} type="button" aria-pressed={u.unit === unit} className={`tp-unit${u.unit === unit ? ' on' : ''}${u.approved ? '' : ' none'}`} onClick={() => setUnit(u.unit)}>
          <span className="tp-unit-no">{p.no || '•'}</span><span className="tp-unit-name">{p.name}<small>{u.approved ? `${u.approved} soru` : 'henüz soru yok'}</small></span></button>; })}</div>}
    </section>}

    {kind === 'OUTCOME' && unitRow && <section className="tp-section" aria-labelledby="tp-outcome">
      <h2 id="tp-outcome">Hangi kazanım?</h2>
      <div className="tp-outcomes" role="radiogroup" aria-label="Kazanım">{unitRow.outcomes.map((o) => <button key={o.code} type="button" role="radio" aria-checked={o.code === outcome} className={`tp-outcome${o.code === outcome ? ' on' : ''}`} onClick={() => setOutcome(o.code)}>
        <b>{o.code}</b><span>{o.title}</span><small>{o.approved ? `${o.approved} soru` : 'soru yok'}</small></button>)}</div>
    </section>}

    <details className="tp-more">
      <summary>Diğer ayarlar <span>{count} soru · {levelName.toLowerCase()}{twoBooklets ? ' · A/B kitapçık' : ''}</span></summary>
      <div className="tp-more-body">
        <div><strong>Soru sayısı</strong><div className="tp-pills" role="radiogroup" aria-label="Soru sayısı">{COUNTS.map((c) => <button key={c} type="button" role="radio" aria-checked={c === count} className={c === count ? 'on' : ''} onClick={() => setCount(c)}>{c} soru</button>)}</div></div>
        <div><strong>Zorluk</strong><div className="tp-pills" role="radiogroup" aria-label="Zorluk">{LEVELS.map((l) => <button key={l.id} type="button" role="radio" aria-checked={l.id === level} className={l.id === level ? 'on' : ''} onClick={() => setLevel(l.id)}>{l.name}</button>)}</div></div>
        <label className="tp-check"><input type="checkbox" checked={twoBooklets} onChange={(e) => setTwoBooklets(e.target.checked)} /> A ve B kitapçığı (aynı sorular, farklı sıra — kopya çekmeyi zorlaştırır)</label>
      </div>
    </details>

    <div className="tp-bar"><div className="tp-bar-in">
      <p><strong>{kind === 'EXAM' ? `${subject?.name || ''} deneme` : kind === 'OUTCOME' ? (outcomeRow?.code || 'Kazanım seç') : unitParts(unit).name || 'Ünite seç'} · {count} soru</strong>
        <span className={blocker ? 'warn' : ''}>{stock.loading ? 'Sorular sayılıyor…' : blocker || (stock.available !== null ? `${stock.available} onaylı soru içinden seçilecek` : '')}</span></p>
      <button type="button" className="tp-go" disabled={!!blocker || busy || stock.loading} onClick={() => void make()}>{busy ? 'Hazırlanıyor…' : 'Testi hazırla'} <ArrowRight size={20} aria-hidden="true" /></button>
    </div></div>
  </div>;
}
