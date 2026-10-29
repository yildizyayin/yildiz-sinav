import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, Globe2, Plus, Printer, Scissors, Timer } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import './quick-tests.css';

/** S044 Hızlı Test list: new test in one form; each card shows what is left and whether an online exam is open. */
export function QuickTests() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tests, setTests] = useState<any[] | null>(null);
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [form, setForm] = useState({ title: '', gradeLevel: '', subjectLabel: '', optionCount: 4, institutionId: '', rights: false });
  const [creating, setCreating] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const isSA = user?.role === 'SUPER_ADMIN';
  const load = () => api<any>(`/api/quick-tests${isSA && form.institutionId ? `?institutionId=${encodeURIComponent(form.institutionId)}` : ''}`).then((r) => setTests(r.tests || [])).catch((e) => { setTests([]); setError(e.message); });
  useEffect(() => { void load(); }, [form.institutionId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (isSA) void api<any>('/api/institutions').then((r) => setInstitutions(r.institutions || [])).catch(() => undefined); }, [isSA]);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const create = async () => {
    setBusy(true); setError('');
    try { const r = await api<any>('/api/quick-tests', { method: 'POST', body: JSON.stringify({ title: form.title, gradeLevel: form.gradeLevel || null, subjectLabel: form.subjectLabel, optionCount: form.optionCount, institutionId: form.institutionId || undefined, rightsDeclared: form.rights }) }); navigate(`/quick-tests/${r.id}`); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return <div className="qt-page">
    <div className="qt-hero">
      <div><span className="eyebrow">STUDIO · HIZLI TEST</span><h1>Elinizdeki sorulardan dakikalar içinde test</h1>
        <p>PDF'ten ya da fotoğraftan soruyu kırpın, cevabına dokunun; test kâğıdı, optik form ve cevap anahtarı hazır. İsterseniz süreli online sınav olarak kodla başlatın.</p></div>
      <ol className="qt-how"><li><Scissors size={18} /><span><b>Kırp</b>PDF ya da fotoğraftan</span></li><li><Printer size={18} /><span><b>Yazdır</b>Optik + cevap anahtarı</span></li><li><Camera size={18} /><span><b>Okut</b>Telefon kamerasıyla</span></li><li><Timer size={18} /><span><b>Online</b>Süreli, kodla katılım</span></li></ol>
    </div>
    {error && <div className="alert error" role="alert">{error}</div>}
    {!creating ? <button type="button" className="primary huge qt-new" onClick={() => setCreating(true)}><Plus size={20} /> Yeni hızlı test</button>
      : <section className="panel qt-card qt-create"><h2>Yeni hızlı test</h2>
        <div className="qt-row3">
          <label className="span2">Testin adı<input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Örn. 6A Kesirler tarama testi" autoFocus maxLength={140} /></label>
          <label>Şık sayısı<select value={form.optionCount} onChange={(e) => set('optionCount', Number(e.target.value))}><option value={4}>4 şık (A–D)</option><option value={5}>5 şık (A–E)</option></select></label>
          <label>Sınıf (isteğe bağlı)<select value={form.gradeLevel} onChange={(e) => set('gradeLevel', e.target.value)}><option value="">Seçmeyin</option>{Array.from({ length: 12 }, (_, i) => i + 1).map((g) => <option key={g} value={g}>{g}. sınıf</option>)}</select></label>
          <label>Ders (isteğe bağlı)<input value={form.subjectLabel} onChange={(e) => set('subjectLabel', e.target.value)} placeholder="Matematik" maxLength={60} /></label>
          {isSA && <label>Kurum<select value={form.institutionId} onChange={(e) => set('institutionId', e.target.value)}><option value="">Kurum seçin</option>{institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>}
        </div>
        <label className="qt-check"><input type="checkbox" checked={form.rights} onChange={(e) => set('rights', e.target.checked)} /> Bu testte kullanacağım soruları kendi öğrencilerimle kullanma hakkım var (kendi hazırladığım, kurumumun ya da kullanım izni olan yayınların soruları). Sorular yalnız kurumumda kalır.</label>
        <div className="qt-actions"><button type="button" className="primary" disabled={busy || form.title.trim().length < 3 || !form.rights || (isSA && !form.institutionId)} onClick={() => void create()}>Oluştur ve soruları ekle</button><button type="button" className="ghost" onClick={() => setCreating(false)}>Vazgeç</button></div>
      </section>}
    {isSA && !creating && <label className="qt-filter">Kurum<select value={form.institutionId} onChange={(e) => set('institutionId', e.target.value)}><option value="">Tüm kurumlar</option>{institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>}
    {tests === null ? <p>Yükleniyor…</p> : !tests.length ? <p className="qt-muted">Henüz hızlı test yok. “Yeni hızlı test” ile başlayın.</p>
      : <div className="qt-cards">{tests.map((t) => <Link key={t.id} to={`/quick-tests/${t.id}`} className="qt-test-card">
        <div className="qt-test-top"><b>{t.title}</b>{t.open_code && <span className="qt-pill live"><Globe2 size={12} /> Açık · {t.open_code}</span>}</div>
        <span className="qt-muted">{[t.grade_level ? `${t.grade_level}. sınıf` : '', t.subject_label, isSA ? t.institution_name : '', t.source_kind === 'POOL' ? 'soru havuzundan' : ''].filter(Boolean).join(' · ')}</span>
        <div className="qt-test-meta"><span>{t.questions} soru</span>{t.unanswered > 0 ? <span className="warn">{t.unanswered} cevapsız</span> : t.questions > 0 ? <span className="ok">Hazır</span> : <span>Boş</span>}<span>{t.results} sonuç</span></div>
      </Link>)}</div>}
  </div>;
}
