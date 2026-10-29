import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, Camera, CheckCircle2, Copy, Download, FileText, Globe2, ListChecks, Printer, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import { api } from '../api';
import { QuickCropper, type CropResult } from '../components/QuickCropper';
import { imageFileToImageData, parseRuntimeTemplate, readOmrImage } from '../lib/omrEngine';
import './quick-tests.css';

/**
 * S044 Hızlı Test editor: 1 Sorular (crop + one-tap answers), 2 Kâğıt (PDF, key, phone scan), 3 Online sınav (code,
 * timer), Sonuçlar (table, per-question success, CSV). Each step says what to do next.
 */
type Tab = 'QUESTIONS' | 'PAPER' | 'ONLINE' | 'RESULTS';
const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const fmt = (s?: string | null) => s ? new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z')).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '–';
const examLink = (code: string) => `${window.location.origin}/sinav/${code}`;

async function download(path: string, name: string) {
  const r = await fetch(path, { credentials: 'include' });
  if (!r.ok) { const d = await r.json().catch(() => null); throw new Error(d?.error?.message || 'Dosya hazırlanamadı.'); }
  const url = URL.createObjectURL(await r.blob()); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function QuickTestEditor() {
  const { id = '' } = useParams();
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('QUESTIONS');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const base = `/api/quick-tests/${encodeURIComponent(id)}`;
  const load = useCallback(async () => { try { setData(await api<any>(base)); } catch (e: any) { setError(e.message); } }, [base]);
  useEffect(() => { void load(); }, [load]);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(''); setNotice(''); try { await fn(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };

  if (!data) return <div className="qt-page">{error ? <div className="alert error">{error}</div> : <p>Yükleniyor…</p>}</div>;
  const t = data.test, qs: any[] = data.questions;
  const unanswered = qs.filter((q) => !q.correctAnswer).length;
  const ready = qs.length > 0 && unanswered === 0;
  const open = (data.sessions || []).find((s: any) => s.status === 'OPEN' && new Date(String(s.closes_at).replace(' ', 'T') + 'Z').getTime() > Date.now());
  const steps: Array<[Tab, string, any, string]> = [
    ['QUESTIONS', '1 · Sorular', ListChecks, `${qs.length} soru${unanswered ? ` · ${unanswered} cevapsız` : ''}`],
    ['PAPER', '2 · Kâğıt', Printer, ready ? 'PDF + optik hazır' : 'Önce cevaplar'],
    ['ONLINE', '3 · Online sınav', Globe2, open ? `Açık · kod ${open.code}` : ready ? 'Kodla başlat' : 'Önce cevaplar'],
    ['RESULTS', 'Sonuçlar', CheckCircle2, ''],
  ];

  return <div className="qt-page">
    <div className="qt-head">
      <Link to="/quick-tests" className="qt-back"><ArrowLeft size={16} /> Hızlı Testler</Link>
      <div><span className="eyebrow">STUDIO · HIZLI TEST{t.source_kind === 'POOL' ? ' · SORU HAVUZUNDAN' : ''}</span>
        <h1>{t.title}</h1><p>{[t.grade_level ? `${t.grade_level}. sınıf` : '', t.subject_label, `${t.option_count} şık`].filter(Boolean).join(' · ')}</p></div>
    </div>
    <nav className="qt-steps" aria-label="Adımlar">{steps.map(([key, label, Icon, hint]) => <button type="button" key={key} className={tab === key ? 'active' : ''} aria-current={tab === key ? 'step' : undefined} onClick={() => setTab(key)}><Icon size={18} /><span><b>{label}</b>{hint && <small>{hint}</small>}</span></button>)}</nav>
    {error && <div className="alert error" role="alert">{error}</div>}
    {notice && <div className="alert success" role="status">{notice}</div>}
    {tab === 'QUESTIONS' && <QuestionsStep t={t} qs={qs} base={base} busy={busy} run={run} reload={load} next={() => setTab('PAPER')} setNotice={setNotice} />}
    {tab === 'PAPER' && <PaperStep t={t} qs={qs} base={base} ready={ready} run={run} setNotice={setNotice} reload={load} />}
    {tab === 'ONLINE' && <OnlineStep t={t} base={base} ready={ready} sessions={data.sessions || []} run={run} reload={load} openResults={() => setTab('RESULTS')} />}
    {tab === 'RESULTS' && <ResultsStep t={t} base={base} sessions={data.sessions || []} run={run} />}
  </div>;
}

function QuestionsStep({ t, qs, base, busy, run, reload, next, setNotice }: any) {
  const letters = LETTERS.slice(0, t.option_count);
  const [bulk, setBulk] = useState('');
  const setAnswer = (q: any, a: string | null) => run(async () => { await api(`${base}/questions/${q.id}`, { method: 'PATCH', body: JSON.stringify({ correctAnswer: a }) }); await reload(); });
  const move = (i: number, d: number) => run(async () => { const ids = qs.map((q: any) => q.id); const j = i + d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; await api(`${base}/order`, { method: 'PUT', body: JSON.stringify({ ids }) }); await reload(); });
  const remove = (q: any) => run(async () => { await api(`${base}/questions/${q.id}`, { method: 'DELETE' }); await reload(); });
  const onCrop = async (c: CropResult) => {
    const f = new FormData(); f.set('image', new File([c.blob], 'soru.png', { type: 'image/png' })); f.set('width', String(c.width)); f.set('height', String(c.height)); if (c.answer) f.set('correctAnswer', c.answer);
    await run(async () => { await api(`${base}/questions`, { method: 'POST', body: f }); await reload(); });
  };
  // "BDCA…": the whole key at once, in order — the fastest way when the publisher's key is at hand.
  const applyBulk = () => run(async () => {
    const seq = bulk.toLocaleUpperCase('tr-TR').replace(/[^A-EX]/g, '').split('');
    const n = Math.min(seq.length, qs.length);
    for (let i = 0; i < n; i++) if (qs[i].correctAnswer !== seq[i] && (letters.includes(seq[i]) || seq[i] === 'X')) await api(`${base}/questions/${qs[i].id}`, { method: 'PATCH', body: JSON.stringify({ correctAnswer: seq[i] }) });
    setBulk(''); await reload(); setNotice(`${n} sorunun cevabı yazıldı.`);
  });
  return <div className={`qt-questions ${t.source_kind === 'POOL' ? 'pool' : ''}`}>
    {t.source_kind !== 'POOL' && <section className="qt-crop panel"><QuickCropper optionCount={t.option_count} onCrop={onCrop} busy={busy} /></section>}
    <aside className="qt-tray panel" aria-label="Testteki sorular">
      <div className="qt-tray-head"><h2>Testteki sorular <span>{qs.length}</span></h2>{qs.length > 0 && <button type="button" className="primary" disabled={qs.some((q: any) => !q.correctAnswer)} onClick={next}>Devam: Kâğıt / Online →</button>}</div>
      {qs.length > 1 && <label className="qt-bulk">Cevap anahtarını tek satırda yazın<span><input value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={`Örn. ${'BADC'.repeat(3).slice(0, Math.min(12, qs.length))}…`} spellCheck={false} /><button type="button" className="secondary" disabled={!bulk.trim() || busy} onClick={() => void applyBulk()}>Uygula</button></span></label>}
      {!qs.length && <p className="qt-muted">Henüz soru yok. Soldan dosyanızı açıp ilk soruyu kırpın.</p>}
      <ol className="qt-list">{qs.map((q: any, i: number) => <li key={q.id} className={q.correctAnswer ? '' : 'missing'}>
        <div className="qt-q-top"><b>{i + 1}.</b>
          <div className="qt-answers" role="group" aria-label={`${i + 1}. sorunun cevabı`}>{[...letters, 'X'].map((l) => <button type="button" key={l} className={q.correctAnswer === l ? 'on' : ''} aria-pressed={q.correctAnswer === l} disabled={busy} onClick={() => void setAnswer(q, l)} title={l === 'X' ? 'İptal edilen soru' : `Doğru cevap ${l}`}>{l}</button>)}</div>
          <span className="qt-q-tools"><button type="button" aria-label="Yukarı" disabled={busy || i === 0} onClick={() => void move(i, -1)}><ArrowUp size={14} /></button><button type="button" aria-label="Aşağı" disabled={busy || i === qs.length - 1} onClick={() => void move(i, 1)}><ArrowDown size={14} /></button><button type="button" aria-label="Sil" disabled={busy} onClick={() => void remove(q)}><Trash2 size={14} /></button></span></div>
        {q.kind === 'IMAGE' ? <img src={`${base}/questions/${q.id}/image`} alt={`${i + 1}. soru`} loading="lazy" style={{ aspectRatio: `${q.width} / ${q.height}` }} /> : <div className="qt-text-q"><p>{q.stem}</p><ol type="A">{(q.options || []).map((o: string, j: number) => <li key={j}>{o}</li>)}</ol></div>}
        {!q.correctAnswer && <small className="qt-warn">Doğru cevabı seçin</small>}
      </li>)}</ol>
    </aside>
  </div>;
}

function PaperStep({ t, qs, base, ready, run, setNotice, reload }: any) {
  const [columns, setColumns] = useState<number>(t.settings?.columns ?? 0);
  const [divisor, setDivisor] = useState<number>(t.settings?.wrongDivisor || 0);
  const [scan, setScan] = useState(false);
  const save = (patch: any) => run(async () => { await api(base, { method: 'PATCH', body: JSON.stringify(patch) }); await reload(); });
  const fileName = (s: string) => `${t.title}${s}.pdf`;
  if (!ready) return <NotReady qs={qs} />;
  return <div className="qt-grid2">
    <section className="panel qt-card"><h2><FileText size={18} /> Test kâğıdı</h2>
      <p>Sorular, kurum adınız ve logonuzla; son sayfada telefonla okutulabilen optik form{qs.length > 44 ? ' (44 sorudan uzun testte optik form eklenmez)' : ''}.</p>
      <fieldset className="qt-seg"><legend>Düzen</legend>{[0, 2, 1].map((c) => <label key={c} className={columns === c ? 'on' : ''}><input type="radio" checked={columns === c} onChange={() => { setColumns(c); void save({ columns: c }); }} /> {c === 0 ? 'Otomatik (soruların genişliğine göre)' : c === 2 ? 'İki sütun' : 'Tek sütun'}</label>)}</fieldset>
      <div className="qt-actions"><button type="button" className="primary" onClick={() => void run(async () => { await download(`${base}/pdf?columns=${columns}`, fileName('')); setNotice('Test kâğıdı indirildi.'); })}><Download size={16} /> Test kâğıdını indir (PDF)</button>
        <button type="button" className="secondary" onClick={() => void run(async () => { await download(`${base}/answer-key`, fileName(' - Cevap Anahtarı')); })}><Download size={16} /> Cevap anahtarı</button></div>
    </section>
    <section className="panel qt-card"><h2><Camera size={18} /> Kâğıtları telefonla okut</h2>
      <p>Öğrencinin doldurduğu optik formun fotoğrafını çekin; cevaplar okunur, puan hemen hesaplanır ve Sonuçlar'a eklenir.</p>
      <label>Yanlış doğruyu götürsün mü?<select value={divisor} onChange={(e) => { const v = Number(e.target.value); setDivisor(v); void save({ wrongDivisor: v }); }}><option value={0}>Hayır (yalnız doğrular sayılır)</option><option value={4}>4 yanlış 1 doğruyu götürür</option><option value={3}>3 yanlış 1 doğruyu götürür</option></select></label>
      {!scan ? <button type="button" className="primary" onClick={() => setScan(true)}><Camera size={16} /> Okutmaya başla</button> : <PaperScan t={t} base={base} total={qs.length} onSaved={(m: string) => setNotice(m)} />}
    </section>
  </div>;
}

function PaperScan({ t, base, total, onSaved }: any) {
  const [template, setTemplate] = useState<any>(null); const [read, setRead] = useState<string>(''); const [info, setInfo] = useState('');
  const [name, setName] = useState(''); const [number, setNumber] = useState(''); const [cls, setCls] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { api<any>(`${base}/optical-template`).then((r) => r.template ? setTemplate(parseRuntimeTemplate({ ...r.template.optical, id: `quick-${t.id}`, name: t.title })) : setError('Bu test 44 sorudan uzun; optik form yok. Cevapları elle yazabilirsiniz.')).catch((e) => setError(e.message)); }, [base, t.id, t.title]);
  const photo = async (f?: File) => { if (!f || !template) return; setBusy(true); setError(''); setInfo(''); try { const r = readOmrImage(await imageFileToImageData(f), template); const seq = String(r.answers_by_subject?.GENEL ?? ''); setRead(seq.replace(/_/g, ' ')); setInfo(`Okundu · güven %${Math.round(r.confidence * 100)} · boş/kararsız ${[...seq].filter((c) => c === '_').length}`); } catch { setError('Fotoğraf okunamadı. Formun tamamını, düz ve iyi ışıkta çekin; dört köşedeki siyah kare görünsün.'); } finally { setBusy(false); } };
  const save = async () => { setBusy(true); setError(''); try { const r = await api<any>(`${base}/paper`, { method: 'POST', body: JSON.stringify({ name, number, className: cls, answers: read.replace(/ /g, '_') }) }); onSaved(`${name}: ${r.result.correct} doğru, ${r.result.wrong} yanlış, ${r.result.blank} boş · net ${r.result.net}`); setRead(''); setName(''); setNumber(''); setInfo(''); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  return <div className="qt-scan">
    {template && <label className="qt-upload-btn"><Camera size={18} /> {read ? 'Başka formu çek' : 'Optik formun fotoğrafını çek'}<input type="file" accept="image/*" capture="environment" onChange={(e) => { void photo(e.target.files?.[0]); e.target.value = ''; }} /></label>}
    {busy && <div className="alert info" role="status">Okunuyor…</div>}
    {info && <small className="qt-muted">{info}</small>}
    <label>Cevaplar ({total} soru; boş için boşluk){' '}<input value={read} onChange={(e) => setRead(e.target.value.toUpperCase().replace(/[^A-E ]/g, '').slice(0, total))} className="qt-mono" placeholder="Fotoğraf yoksa elle yazın: ABCD…" /></label>
    <div className="qt-row3"><label>Ad soyad<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>Numara<input value={number} onChange={(e) => setNumber(e.target.value)} inputMode="numeric" /></label><label>Sınıf<input value={cls} onChange={(e) => setCls(e.target.value)} placeholder="6A" /></label></div>
    {error && <div className="alert error" role="alert">{error}</div>}
    <button type="button" className="primary" disabled={busy || !read.trim() || name.trim().length < 2} onClick={() => void save()}>Sonucu kaydet</button>
  </div>;
}

function OnlineStep({ t, base, ready, sessions, run, reload, openResults }: any) {
  const [duration, setDuration] = useState(40); const [when, setWhen] = useState<'NOW' | 'LATER'>('NOW');
  const [opensAt, setOpensAt] = useState(''); const [closesAt, setClosesAt] = useState('');
  const [shuffle, setShuffle] = useState(true); const [resultMode, setResultMode] = useState('AFTER_SUBMIT');
  const [copied, setCopied] = useState('');
  const live = sessions.filter((s: any) => s.status === 'OPEN' && new Date(String(s.closes_at).replace(' ', 'T') + 'Z').getTime() > Date.now());
  useEffect(() => { if (!live.length) return; const h = setInterval(() => void reload(), 15000); return () => clearInterval(h); }, [live.length, reload]);
  if (!ready) return <NotReady qs={[]} />;
  const create = () => run(async () => {
    const iso = (v: string) => v ? new Date(v).toISOString() : undefined;
    await api(`${base}/sessions`, { method: 'POST', body: JSON.stringify({ durationMinutes: duration, shuffle, resultMode, opensAt: when === 'LATER' ? iso(opensAt) : undefined, closesAt: when === 'LATER' ? iso(closesAt) : undefined }) });
    await reload();
  });
  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1500); } catch { /* clipboard may be blocked */ } };
  return <div className="qt-grid2">
    <section className="panel qt-card"><h2><Globe2 size={18} /> Süreli online sınav başlat</h2>
      <p>Öğrenciler hesap açmadan, size verdiğiniz kodla ve ad-soyad + numarayla girer. Süre sunucuda işler; süre bitince cevaplar kendiliğinden teslim edilir.</p>
      <div className="qt-row3"><label>Süre (dakika)<input type="number" min={1} max={300} value={duration} onChange={(e) => setDuration(Math.max(1, Math.min(300, Number(e.target.value) || 1)))} /></label>
        <label>Ne zaman?<select value={when} onChange={(e) => setWhen(e.target.value as any)}><option value="NOW">Hemen (24 saat açık)</option><option value="LATER">Belirli saatler arasında</option></select></label>
        <label>Sonuç<select value={resultMode} onChange={(e) => setResultMode(e.target.value)}><option value="AFTER_SUBMIT">Teslim edince görsün</option><option value="AFTER_CLOSE">Sınav kapanınca görsün</option><option value="HIDDEN">Göstermeyin</option></select></label></div>
      {when === 'LATER' && <div className="qt-row3"><label>Başlangıç<input type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} /></label><label>Bitiş<input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} /></label></div>}
      <label className="qt-check"><input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} /> Soru sırasını her öğrenci için karıştır (kopya çekmeyi zorlaştırır)</label>
      <button type="button" className="primary" disabled={when === 'LATER' && (!opensAt || !closesAt)} onClick={() => void create()}>Sınavı başlat ve kodu al</button>
    </section>
    <section className="panel qt-card"><h2>Kodlar</h2>
      {!sessions.length && <p className="qt-muted">Henüz online sınav başlatılmadı.</p>}
      {sessions.map((s: any) => { const isLive = live.some((x: any) => x.id === s.id); return <div key={s.id} className={`qt-session ${isLive ? 'live' : ''}`}>
        <div className="qt-code" aria-label={`Sınav kodu ${s.code}`}>{s.code}</div>
        <div className="qt-session-info"><b>{isLive ? 'Açık' : 'Kapandı'}</b><span>{s.duration_minutes} dk · {fmt(s.opens_at)} → {fmt(s.closes_at)}</span><span>{s.started} başladı · {s.submitted} teslim etti</span></div>
        {isLive && <div className="qt-session-actions">
          <button type="button" className="secondary" onClick={() => void copy(examLink(s.code), s.id)}><Copy size={14} /> {copied === s.id ? 'Kopyalandı' : 'Bağlantıyı kopyala'}</button>
          <button type="button" className="ghost" onClick={openResults}>Canlı sonuçlar</button>
          <button type="button" className="danger" onClick={() => void run(async () => { await api(`${base}/sessions/${s.id}/close`, { method: 'POST' }); await reload(); })}>Sınavı bitir</button>
        </div>}
        {isLive && <small className="qt-muted">Öğrencilere söyleyin: <b>{window.location.host}/sinav</b> adresine girip <b>{s.code}</b> kodunu yazsınlar.</small>}
      </div>; })}
    </section>
  </div>;
}

function ResultsStep({ t, base, sessions, run }: any) {
  const [sessionId, setSessionId] = useState(''); const [res, setRes] = useState<any>(null);
  const load = useCallback(() => api<any>(`${base}/results${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`).then(setRes).catch(() => setRes(null)), [base, sessionId]);
  useEffect(() => { void load(); const h = setInterval(() => void load(), 15000); return () => clearInterval(h); }, [load]);
  const rows = res?.attempts || [];
  const csv = () => {
    const head = ['Sıra', 'Ad Soyad', 'Numara', 'Sınıf', 'Kanal', 'Doğru', 'Yanlış', 'Boş', 'Net', 'Puan', 'Teslim'];
    const lines = rows.map((a: any, i: number) => [i + 1, a.taker_name, a.taker_number, a.taker_class || '', a.channel === 'PAPER' ? 'Kâğıt' : 'Online', a.correct_count ?? '', a.wrong_count ?? '', a.blank_count ?? '', a.net ?? '', a.score ?? '', a.submitted_at ? fmt(a.submitted_at) : 'devam ediyor']);
    const cell = (v: any) => `"${String(v).replace(/"/g, '""')}"`;
    const blob = new Blob(['﻿' + [head, ...lines].map((r) => r.map(cell).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${t.title} - Sonuçlar.csv`; a.click();
  };
  return <section className="panel qt-card">
    <div className="qt-results-head"><h2>Sonuçlar</h2>
      <label>Oturum<select value={sessionId} onChange={(e) => setSessionId(e.target.value)}><option value="">Hepsi (online + kâğıt)</option>{sessions.map((s: any) => <option key={s.id} value={s.id}>{s.code} · {fmt(s.opens_at)}</option>)}</select></label>
      <button type="button" className="ghost" onClick={() => void load()}><RefreshCw size={14} /> Yenile</button>
      <button type="button" className="secondary" disabled={!rows.length} onClick={csv}><Download size={14} /> Excel (CSV)</button></div>
    {res?.average != null && <p className="qt-muted">{rows.filter((a: any) => !a.inProgress).length} öğrenci · ortalama net <b>{res.average}</b></p>}
    {res?.stats?.length > 0 && rows.length > 0 && <div className="qt-stats" aria-label="Soru bazında başarı">{res.stats.map((s: any) => <span key={s.id} className={s.correctAnswer === 'X' ? 'x' : s.rate == null ? '' : s.rate >= 70 ? 'good' : s.rate >= 40 ? 'mid' : 'low'} title={`${s.no}. soru · doğru cevap ${s.correctAnswer} · ${s.correct} doğru, ${s.wrong} yanlış, ${s.blank} boş`}><b>{s.no}</b>{s.correctAnswer === 'X' ? 'iptal' : s.rate == null ? '–' : `%${s.rate}`}</span>)}</div>}
    {!rows.length ? <p className="qt-muted">Henüz sonuç yok.</p> : <div className="qt-table-wrap"><table className="qt-table"><thead><tr><th>#</th><th>Ad Soyad</th><th>No</th><th>Sınıf</th><th>D</th><th>Y</th><th>B</th><th>Net</th><th>Puan</th><th>Durum</th><th /></tr></thead>
      <tbody>{rows.map((a: any, i: number) => <tr key={a.id}><td>{i + 1}</td><td>{a.taker_name}</td><td>{a.taker_number}</td><td>{a.taker_class || ''}</td><td>{a.correct_count ?? ''}</td><td>{a.wrong_count ?? ''}</td><td>{a.blank_count ?? ''}</td><td><b>{a.net ?? ''}</b></td><td>{a.score ?? ''}</td><td>{a.inProgress ? <span className="qt-pill live">Çözüyor</span> : <span className="qt-pill">{a.channel === 'PAPER' ? 'Kâğıt' : 'Teslim'}</span>}</td>
        <td><button type="button" className="ghost qt-reset" title="Öğrenci yeniden girebilsin" onClick={() => { if (window.confirm(`${a.taker_name} kaydı silinsin mi? Öğrenci sınava yeniden girebilir.`)) void run(async () => { await api(`${base}/attempts/${a.id}`, { method: 'DELETE' }); await load(); }); }}>Sıfırla</button></td></tr>)}</tbody></table></div>}
  </section>;
}

function NotReady({ qs }: { qs: any[] }) {
  return <div className="panel qt-card qt-notready"><TriangleAlert size={20} /><div><b>Önce soruların doğru cevaplarını işaretleyin.</b><p>{qs.length ? `${qs.filter((q) => !q.correctAnswer).length} sorunun cevabı eksik.` : '1 · Sorular adımında her sorunun doğru cevabını seçin; sonra kâğıdı indirebilir ya da online sınav başlatabilirsiniz.'}</p></div></div>;
}

