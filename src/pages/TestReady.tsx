import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Download, KeyRound, MonitorPlay, Plus, Printer, RefreshCw, Scissors, Send, ShieldCheck, X } from 'lucide-react';
import { api } from '../api';
import { TestCheckDialog } from '../components/TestCheckDialog';
import { LogoUpload, PaperPreview, useBrand, type Brand } from '../components/InstitutionLogo';
import './test-prepare.css';
import '../components/test-check-dialog.css';

/**
 * "Testin hazır" (owner, 27 Nov 2026). The questions as the students will see them; a question the teacher does not
 * like is replaced with one tap ("Başka soru") or taken out. Three ways on: the board, print, homework — the first
 * time any of them is used the teacher confirms once that the questions suit the class (their responsibility).
 */
type Item = { position: number; id: string; stem: string; options: Array<{ label: string; text: string }>; band: string; outcomes: string | null; passage?: { title: string | null; text: string } };
type Sheet = '' | 'PRINT' | 'HOMEWORK';
const BAND: Record<string, string> = { EASY: 'Kolay', MEDIUM: 'Orta', HARD: 'Zor' };
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const longDate = (s: string) => { const d = new Date(`${s}T12:00:00`); return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }); };
const booklets = (doc: any): string[] => { try { const c = JSON.parse(doc?.config_json || '{}').bookletCodes; return Array.isArray(c) && c.length ? c : ['A']; } catch { return ['A']; } };
const printChoices = (doc: any) => { try { const b = JSON.parse(doc?.config_json || '{}').branding || {}; return { useInstitution: b.useInstitution !== false, showAnunex: b.showAnunex !== false }; } catch { return { useInstitution: true, showAnunex: true }; } };

async function fetchPdf(url: string) {
  const r = await fetch(url, { credentials: 'same-origin' });
  if (!r.ok) { const body: any = await r.json().catch(() => null); throw new Error(body?.error?.message || 'PDF hazırlanamadı.'); }
  return r.blob();
}
function save(blob: Blob, name: string) { const href = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = href; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(href), 1000); }

export function TestReady() {
  const { testId = '' } = useParams();
  const navigate = useNavigate();
  const id = encodeURIComponent(testId);
  const [test, setTest] = useState<any>(null);
  const [checked, setChecked] = useState<any>(undefined);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [flash, setFlash] = useState('');
  const [ask, setAsk] = useState<Sheet | 'BOARD' | ''>('');
  const [sheet, setSheet] = useState<Sheet>('');
  const [addOpen, setAddOpen] = useState(false);
  const { brand, reload: reloadBrand } = useBrand();

  const loadTest = () => api<any>(`/api/teacher-tests/${id}`).then((r) => { setTest(r.test); setChecked(r.checked); setDeliveries(r.deliveries || []); }).catch((e) => setError(e?.message || 'Test açılamadı.'));
  const loadItems = () => api<any>(`/api/platform/studio/${id}/items?booklet=A`).then((r) => setItems(r.items || [])).catch((e) => setError(e?.message || 'Sorular açılamadı.'));
  useEffect(() => { void loadTest(); void loadItems(); }, [testId]);

  const swap = async (q: Item) => {
    setBusy(q.id); setError('');
    try { const r = await api<any>(`/api/platform/studio/${id}/swap`, { method: 'POST', body: JSON.stringify({ questionId: q.id, sameDifficulty: true }) }); await Promise.all([loadItems(), loadTest()]); setFlash(r.to); setTimeout(() => setFlash(''), 1600); }
    catch (e: any) { setError(e?.message || 'Başka soru bulunamadı.'); }
    setBusy('');
  };
  const remove = async (q: Item) => {
    setBusy(q.id); setError('');
    try { await api(`/api/teacher-tests/${id}/remove-question`, { method: 'POST', body: JSON.stringify({ questionId: q.id }) }); await Promise.all([loadItems(), loadTest()]); }
    catch (e: any) { setError(e?.message || 'Soru çıkarılamadı.'); }
    setBusy('');
  };
  const go = (what: Sheet | 'BOARD') => {
    if (!checked) { setAsk(what); return; }
    if (what === 'BOARD') navigate(`/board/${id}`); else setSheet(what);
  };

  if (error && !test) return <div className="tr"><Link className="tp-back" to="/soru-havuzu/testlerim"><ArrowLeft size={18} aria-hidden="true" /> Testlerim</Link><div className="alert error" role="alert">{error}</div></div>;
  const locked = !!test?.locked;
  const canHomework = test?.type === 'WORKSHEET';
  return <div className="tr">
    <div className="tp-top"><Link className="tp-back" to="/soru-havuzu/testlerim"><ArrowLeft size={18} aria-hidden="true" /> Testlerim</Link><span className="tp-saved"><Check size={16} aria-hidden="true" /> Kaydedildi · Testlerim’de duruyor</span></div>
    <div className="tr-head">
      <span className="tr-badge"><Check size={16} aria-hidden="true" /> {locked ? 'Öğrencilere gönderildi' : 'Testin hazır'}</span>
      <h1>{test?.title || 'Test'}</h1>
      <p>{items ? `${items.length} soru` : '…'}{test?.subject ? ` · ${test.gradeLevel}. sınıf ${test.subject}` : ''} · {locked ? 'Sorular artık değişmez; değiştirmek için Testlerim’den “Kopyala ve düzenle”.' : 'Beğenmediğin soru olursa “Başka soru” de, yenisi gelsin.'}</p>
    </div>
    {error && <div className="alert error" role="alert">{error}</div>}
    {!items ? <p className="tp-muted">Sorular yükleniyor…</p> : <ol className="tr-list">{items.map((q) => <li key={`${q.position}-${q.id}`} className={flash === q.id ? 'flash' : ''}>
      <span className="tr-no">{q.position}</span>
      <div className="tr-q">
        {q.passage && <p className="tr-passage">{q.passage.title ? <b>{q.passage.title} </b> : null}{q.passage.text}</p>}
        <p className="tr-stem">{q.stem}</p>
        <div className="tr-opts">{q.options.map((o) => <span key={o.label}><b>{o.label})</b> {o.text}</span>)}</div>
        <span className="tr-meta">{[q.outcomes, BAND[q.band]].filter(Boolean).join(' · ')}</span>
      </div>
      {!locked && <div className="tr-q-actions">
        <button type="button" className="tr-swap" disabled={!!busy} onClick={() => void swap(q)}><RefreshCw size={16} aria-hidden="true" /> {busy === q.id ? 'Bakılıyor…' : 'Başka soru'}</button>
        {items.length > 1 && <button type="button" className="tr-remove" disabled={!!busy} aria-label={`${q.position}. soruyu çıkar`} onClick={() => void remove(q)}>Çıkar</button>}
      </div>}
    </li>)}</ol>}
    {items && !locked && <button type="button" className="tr-add" onClick={() => setAddOpen(true)}><Plus size={20} aria-hidden="true" /> Soru ekle (PDF ya da fotoğraftan)</button>}

    <div className="tp-bar"><div className="tp-bar-in tr-bar">
      <span className={`tr-checkline${checked ? ' ok' : ''}`}>{checked ? <><ShieldCheck size={16} aria-hidden="true" /> Sorular uygun bulundu · {checked.by}</> : 'Göndermeden önce bir kez “sorular uygun” onayı istenir.'}</span>
      <button type="button" className="tr-act" onClick={() => go('BOARD')}><MonitorPlay size={18} aria-hidden="true" /> Tahtada aç</button>
      <button type="button" className="tr-act dark" onClick={() => go('PRINT')}><Printer size={18} aria-hidden="true" /> Yazdır</button>
      {canHomework && <button type="button" className="tr-act blue" onClick={() => go('HOMEWORK')}><Send size={18} aria-hidden="true" /> {deliveries.length ? 'Başka sınıfa ödev ver' : 'Ödev ver'}</button>}
    </div></div>

    {ask && <TestCheckDialog testId={testId} onCancel={() => setAsk('')} onReview={() => setAsk('')} onConfirmed={() => { const what = ask; setAsk(''); void loadTest(); setChecked({ by: 'Sen', at: '' }); if (what === 'BOARD') navigate(`/board/${id}`); else setSheet(what as Sheet); }} />}
    {addOpen && test && <AddFromFile test={test} count={items?.length || 0} onClose={() => setAddOpen(false)} onMoved={(qid) => navigate(`/quick-tests/${encodeURIComponent(qid)}`)} />}
    {sheet === 'PRINT' && test && <PrintSheet test={test} brand={brand} onBrand={reloadBrand} onClose={() => setSheet('')} onChanged={() => void loadTest()} />}
    {sheet === 'HOMEWORK' && test && <HomeworkSheet test={test} again={deliveries.length > 0} onClose={() => setSheet('')} onSent={() => void loadTest()} />}
  </div>;
}

function SheetFrame({ title, onClose, children }: { title: string; onClose: () => void; children: any }) {
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [onClose]);
  return <div className="tr-layer" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="tr-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <div className="tr-sheet-head"><h2>{title}</h2><button type="button" className="tr-x" aria-label="Kapat" onClick={onClose}><X size={20} /></button></div>
      {children}
    </div>
  </div>;
}

/**
 * "+ Soru ekle (PDF ya da fotoğraftan)" (owner, 27 Nov 2026: "Testi Hızlı Test'e taşı"). The test moves to Hızlı
 * Test with its questions, where the teacher crops more from a PDF or a photo. Cropped questions stay in the
 * institution; the teacher declares the right to use them (a declaration is not an editorial approval).
 */
function AddFromFile({ test, count, onClose, onMoved }: { test: any; count: number; onClose: () => void; onMoved: (id: string) => void }) {
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const move = async () => {
    setBusy(true); setError('');
    try { const r = await api<any>(`/api/quick-tests/from-studio/${encodeURIComponent(test.id)}`, { method: 'POST', body: JSON.stringify({ addCrops: true, rightsDeclared: true }) }); onMoved(r.id); }
    catch (e: any) { setError(e?.message || 'Test taşınamadı.'); setBusy(false); }
  };
  return <SheetFrame title="PDF ya da fotoğraftan soru ekle" onClose={onClose}>
    <div className="add">
      <ol className="add-steps">
        <li><span><Scissors size={18} aria-hidden="true" /></span><div><b>Kırp</b>PDF’ini ya da sorunun fotoğrafını aç, soruyu çerçevele.</div></li>
        <li><span><Check size={18} aria-hidden="true" /></span><div><b>Cevabına dokun</b>Doğru şıkkı işaretle; soru testin sonuna eklenir.</div></li>
        <li><span><Printer size={18} aria-hidden="true" /></span><div><b>Yazdır ya da online ver</b>Optik form, cevap anahtarı, kurum adı ve logosu yine hazır.</div></li>
      </ol>
      <p className="add-note">Test, şimdiki {count} sorusuyla birlikte <b>Hızlı Test</b>’e taşınır ve Testlerim’de durur. Eklediğin sorular yalnız kurumunda kalır; ortak havuza girmez.</p>
      <label className="tcd-check"><input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />Ekleyeceğim soruları kullanma hakkım var (kendi yazdığım ya da kurumumuzun materyali).</label>
      <p className="tp-muted small">Bir yayınevinin kitabından ya da başka bir yerden alınan sorular telif hakkıyla korunur; izni olmadan çoğaltılamaz. Beyan senin sorumluluğundadır.</p>
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="tcd-actions"><button type="button" className="tcd-ghost" onClick={onClose}>Vazgeç</button><button type="button" className="tcd-go" disabled={!rights || busy} onClick={() => void move()}>{busy ? 'Taşınıyor…' : 'Devam et ve kırpmaya başla'}</button></div>
    </div>
  </SheetFrame>;
}

/** Yazdır: the paper as it will come out (institution name and logo top-left), then one tap per PDF. */
export function PrintSheet({ test, brand, onBrand, onClose, onChanged }: { test: any; brand: Brand | null; onBrand: () => void; onClose: () => void; onChanged: () => void }) {
  const [choice, setChoice] = useState(printChoices(test.doc));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const codes = booklets(test.doc);
  const name = String(test.title || 'test');
  const setPref = async (next: typeof choice) => {
    setChoice(next); setError('');
    try { await api(`/api/teacher-tests/${encodeURIComponent(test.id)}/print`, { method: 'PUT', body: JSON.stringify(next) }); onChanged(); }
    catch (e: any) { setError(e?.message || 'Seçim kaydedilemedi.'); }
  };
  const get = async (key: string, url: string, file: string) => {
    setBusy(key); setError('');
    try { save(await fetchPdf(url), file); onChanged(); } catch (e: any) { setError(e?.message || 'PDF hazırlanamadı.'); }
    setBusy('');
  };
  const id = encodeURIComponent(test.id);
  return <SheetFrame title="Yazdır" onClose={onClose}>
    <div className="pr">
      <PaperPreview brand={brand} title={test.title} useInstitution={choice.useInstitution} showAnunex={choice.showAnunex} />
      <div className="pr-side">
        <label className="tp-check"><input type="checkbox" checked={choice.useInstitution} onChange={(e) => void setPref({ ...choice, useInstitution: e.target.checked })} /> Kurum adı ve logosu{brand?.institutionName ? ` (${brand.institutionName})` : ''}</label>
        <label className="tp-check"><input type="checkbox" checked={choice.showAnunex} onChange={(e) => void setPref({ ...choice, showAnunex: e.target.checked })} /> ANUNEX işareti sağ üstte</label>
        {choice.useInstitution && brand && !brand.hasLogo && <div className="pr-logo-note">
          {brand.canUpload ? <><span>Kurum logonuz henüz yüklenmemiş. Yüklerseniz bütün testlerde çıkar.</span><LogoUpload brand={brand} onDone={onBrand} /></>
            : <span>Kurum logonuz henüz yüklenmemiş; kâğıtta yalnız kurum adı çıkar. Logoyu kurum yöneticiniz Soru Havuzu’ndan yükleyebilir.</span>}
        </div>}
        <div className="pr-buttons">
          {codes.map((c) => <button key={c} type="button" className="pr-btn main" disabled={!!busy} onClick={() => void get(c, `/api/platform/studio/${id}/pdf?booklet=${c}`, `${name}-${c}.pdf`)}><Download size={18} aria-hidden="true" /> {busy === c ? 'Hazırlanıyor…' : codes.length > 1 ? `Kitapçık ${c} (PDF)` : 'Test kâğıdı (PDF)'}</button>)}
          <button type="button" className="pr-btn" disabled={!!busy} onClick={() => void get('KEY', `/api/platform/studio/${id}/answer-key`, `${name}-cevap-anahtari.pdf`)}><KeyRound size={18} aria-hidden="true" /> {busy === 'KEY' ? 'Hazırlanıyor…' : 'Cevap anahtarı (öğretmene)'}</button>
        </div>
        <p className="tp-muted small">Kâğıdın sonunda telefonla okutulan optik form var; sonuçlar karneye kendiliğinden işlenir.</p>
        {error && <div className="alert error" role="alert">{error}</div>}
      </div>
    </div>
  </SheetFrame>;
}

/** Ödev ver: which classes, until when — one tap. The test is prepared for students first if it was never printed. */
function HomeworkSheet({ test, again, onClose, onSent }: { test: any; again: boolean; onClose: () => void; onSent: () => void }) {
  const [classes, setClasses] = useState<any[] | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [due, setDue] = useState(plusDays(7));
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { Promise.all([api<any>('/api/classes'), api<any>('/api/students?status=ACTIVE')]).then(([c, s]) => { setClasses(c.classes || []); setStudents(s.students || []); }).catch((e) => { setClasses([]); setError(e?.message || 'Sınıflar yüklenemedi.'); }); }, []);
  const count = (cid: string) => students.filter((s) => s.class_id === cid).length;
  const ids = useMemo(() => students.filter((s) => chosen.includes(s.class_id)).map((s) => s.id), [students, chosen]);
  const send = async () => {
    setBusy(true); setError('');
    try {
      const id = encodeURIComponent(test.id);
      if (test.status === 'DRAFT') await fetchPdf(`/api/platform/studio/${id}/pdf?booklet=A`);   // the same print check that every delivery passes
      await api(`/api/platform/studio/${id}/publish-homework`, { method: 'POST', body: JSON.stringify({ studentIds: ids, dueAt: due || null, answerReveal: reveal ? 'AFTER_SUBMIT' : 'AFTER_DUE', ...(again ? { round: 'NEXT' } : {}) }) });
      setDone(classes!.filter((c) => chosen.includes(c.id)).map((c) => c.name).join(', ')); onSent();
    } catch (e: any) { setError(e?.message || 'Ödev gönderilemedi.'); }
    setBusy(false);
  };
  if (done) return <SheetFrame title="Ödev ver" onClose={onClose}><div className="hw-done"><span className="hw-done-icon"><Check size={34} aria-hidden="true" /></span><h3>Gönderildi!</h3><p>{done} öğrencileri panelinde görüyor. Sonuçları Testlerim’den izleyebilirsin.</p><Link className="pr-btn main" to={`/soru-havuzu/testlerim/${encodeURIComponent(test.id)}`}>Sonuçları gör</Link></div></SheetFrame>;
  return <SheetFrame title={again ? 'Başka sınıfa ödev ver' : 'Ödev ver'} onClose={onClose}>
    <div className="hw">
      <strong>Hangi sınıfa?</strong>
      {!classes ? <p className="tp-muted">Sınıflar yükleniyor…</p> : !classes.length ? <p className="tp-muted">Sana bağlı sınıf bulunamadı.</p>
        : <div className="tp-pills" role="group" aria-label="Sınıflar">{classes.map((c) => { const on = chosen.includes(c.id); return <button key={c.id} type="button" aria-pressed={on} className={on ? 'on' : ''} onClick={() => setChosen((x) => (on ? x.filter((y) => y !== c.id) : [...x, c.id]))}>{c.name}<small>{count(c.id)} öğrenci</small></button>; })}</div>}
      <label className="hw-due">Son gün<input type="date" value={due} min={plusDays(0)} onChange={(e) => setDue(e.target.value)} /><span>{due ? longDate(due) : 'Son gün yok'}</span></label>
      <label className="tp-check"><input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} /> Cevaplar ve çözümler öğrenci gönderir göndermez açılsın (seçmezsen son günden sonra açılır)</label>
      {error && <div className="alert error" role="alert">{error}</div>}
      <button type="button" className="pr-btn main big" disabled={busy || !ids.length} onClick={() => void send()}><Send size={18} aria-hidden="true" /> {busy ? 'Gönderiliyor…' : ids.length ? `${ids.length} öğrenciye gönder` : 'Sınıf seç'}</button>
    </div>
  </SheetFrame>;
}
