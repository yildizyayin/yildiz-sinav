import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api';
import { EXAM_TEMPLATES } from '../lib/guidedDefinitions';

/**
 * S042 (D-S039, D-S041): a school or a dealer adds its own practice exam on sonuc. Written for someone who has never
 * defined an exam: pick the type, the booklets, and type or paste each booklet's key. Each test shows how many answers
 * it still needs; a whole booklet can be pasted as one line and is split into its tests.
 */
const PRESETS: Array<{ key: string; label: string; template: string }> = [
  { key: 'LGS', label: '8. Sınıf · LGS', template: 'LGS' },
  { key: 'TYT', label: 'TYT', template: 'TYT' },
  { key: 'AYT', label: 'AYT', template: 'AYT' },
  { key: 'SCHOOL_5', label: '5. Sınıf', template: 'SCHOOL_5' },
  { key: 'SCHOOL_6', label: '6. Sınıf', template: 'SCHOOL_6' },
  { key: 'SCHOOL_7', label: '7. Sınıf', template: 'SCHOOL_7' },
];
const BOOKLETS = ['A', 'B', 'C', 'D'];
const clean = (v: string, letters: string) => v.toLocaleUpperCase('tr-TR').replace(/İ/g, 'I').replace(/\s+/g, '').split('').filter((c) => letters.includes(c) || c === 'X').join('');

type Section = { subjectCode: string; label: string; questionCount: number; optionCount: number };
type Keys = Record<string, Record<string, string>>;
const lettersOf = (s: { optionCount: number }) => (s.optionCount === 4 ? 'ABCD' : 'ABCDE');
const keysComplete = (sections: Section[], booklets: string[], keys: Keys) => sections.length > 0 && booklets.every((b) => sections.every((s) => (keys[b]?.[s.subjectCode] || '').length === s.questionCount));

/** One booklet at a time: each test's answers with a counter; a whole booklet pasted as one line is split into its tests. */
function KeyEditor({ sections, booklets, keys, setKeys }: { sections: Section[]; booklets: string[]; keys: Keys; setKeys: (f: (k: Keys) => Keys) => void }) {
  const [tab, setTab] = useState(booklets[0] || 'A');
  const [paste, setPaste] = useState('');
  const current = booklets.includes(tab) ? tab : booklets[0];
  const total = sections.reduce((n, s) => n + s.questionCount, 0);
  const value = (b: string, code: string) => keys[b]?.[code] || '';
  const done = (b: string) => sections.every((s) => value(b, s.subjectCode).length === s.questionCount);
  const setValue = (b: string, code: string, v: string) => setKeys((k) => ({ ...k, [b]: { ...(k[b] || {}), [code]: v } }));
  const splitPaste = () => {
    const all = clean(paste, 'ABCDE'); let at = 0; const next: Record<string, string> = {};
    for (const s of sections) { next[s.subjectCode] = all.slice(at, at + s.questionCount); at += s.questionCount; }
    setKeys((k) => ({ ...k, [current]: next })); setPaste('');
  };
  return <div className="own-exam-keys">
    <div className="own-exam-tabs" role="tablist">{booklets.map((b) => <button type="button" role="tab" aria-selected={current === b} key={b} className={current === b ? 'active' : ''} onClick={() => setTab(b)}>{b} kitapçığı {done(b) ? '✓' : ''}</button>)}</div>
    <label className="own-exam-paste">{current} kitapçığının bütün cevaplarını tek seferde yapıştırın (isteğe bağlı)
      <span className="own-exam-paste-row"><input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={`${total} harf, sırayla: ${sections.map((s) => s.label).join(', ')}`} /><button type="button" className="secondary" disabled={!paste.trim()} onClick={splitPaste}>Derslere böl</button></span></label>
    {sections.map((s) => {
      const v = value(current, s.subjectCode); const ok = v.length === s.questionCount;
      return <label key={s.subjectCode} className={`own-exam-key ${ok ? 'ok' : v ? 'short' : ''}`}><span>{s.label}<small>{v.length}/{s.questionCount}</small></span>
        <input value={v} onChange={(e) => setValue(current, s.subjectCode, clean(e.target.value, lettersOf(s)).slice(0, s.questionCount))} spellCheck={false} autoCapitalize="characters" inputMode="text" placeholder={`${s.questionCount} cevap · ${lettersOf(s).split('').join(' ')} · iptal soru X`} aria-label={`${current} kitapçığı ${s.label} cevapları`} /></label>;
    })}
  </div>;
}

export function OwnExamForm({ mode, onCreated, onCancel }: { mode: 'INSTITUTION' | 'DEALER'; onCreated: (exam: { id: string; title: string }) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [preset, setPreset] = useState('');
  const [examDate, setExamDate] = useState('');
  const [booklets, setBooklets] = useState<string[]>(['A']);
  const [keys, setKeys] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [problems, setProblems] = useState<string[]>([]);

  const sections = useMemo(() => {
    const p = PRESETS.find((x) => x.key === preset);
    return p ? EXAM_TEMPLATES.find((t) => t.key === p.template)?.sections || [] : [];
  }, [preset]);
  const total = sections.reduce((n, s) => n + s.questionCount, 0);
  const allDone = keysComplete(sections, booklets, keys);
  const toggleBooklet = (b: string) => setBooklets((list) => {
    const next = list.includes(b) ? list.filter((x) => x !== b) : [...list, b].sort();
    return next.length ? next : list;
  });
  const submit = async () => {
    setBusy(true); setError(''); setProblems([]);
    try {
      const r = await api<any>('/api/admin/result-network/operations/own-exams', { method: 'POST', body: JSON.stringify({ mode, title, preset, examDate: examDate || null, booklets, keys: Object.fromEntries(booklets.map((b) => [b, keys[b] || {}])) }) });
      onCreated(r.exam);
    } catch (e) {
      const details: any = e instanceof ApiError ? e.details : null;
      setError(e instanceof Error ? e.message : 'Sınav eklenemedi.');
      if (Array.isArray(details?.problems)) setProblems(details.problems);
    } finally { setBusy(false); }
  };

  return <div className="panel own-exam-form" role="group" aria-labelledby="own-exam-title">
    <div className="panel-head"><div><span className="eyebrow">{mode === 'DEALER' ? 'Bayi sınavı' : 'Kurum sınavı'}</span><h3 id="own-exam-title">Kendi sınavını ekle</h3>
      <p>{mode === 'DEALER' ? 'Bu sınavı yalnız siz ve size kayıtlı kurumlar görür.' : 'Bu sınavı yalnız kurumunuz görür.'} Kendi sınavlarında Türkiye sıralaması yoktur; okul, sınıf, il ve ilçe sıraları hesaplanır.</p></div></div>
    {error && <div className="alert error" role="alert">{error}{problems.length > 0 && <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>}</div>}
    <div className="form-grid">
      <label>Sınavın adı<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Örn. Kasım LGS Denemesi 1" /></label>
      <label>Sınav tarihi (isteğe bağlı)<input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} /></label>
    </div>
    <fieldset className="own-exam-choice"><legend>Sınav türü</legend>
      <div className="own-exam-chips">{PRESETS.map((p) => <button type="button" key={p.key} className={preset === p.key ? 'chip active' : 'chip'} aria-pressed={preset === p.key} onClick={() => setPreset(p.key)}>{p.label}</button>)}</div>
      {sections.length > 0 && <small className="field-help">{sections.map((s) => `${s.label} ${s.questionCount}`).join(' · ')} · toplam {total} soru</small>}
    </fieldset>
    <fieldset className="own-exam-choice"><legend>Kitapçıklar</legend>
      <div className="own-exam-chips">{BOOKLETS.map((b) => <label key={b} className={booklets.includes(b) ? 'chip active' : 'chip'}><input type="checkbox" checked={booklets.includes(b)} onChange={() => toggleBooklet(b)} />{booklets.includes(b) ? '✓ ' : ''}{b} kitapçığı</label>)}</div>
      <small className="field-help">Tek kitapçık kullandıysanız yalnız A'yı bırakın. Öğrenci kitapçık işaretlemediyse kontrol ekranında siz seçersiniz.</small>
    </fieldset>
    {sections.length > 0 && <KeyEditor sections={sections} booklets={booklets} keys={keys} setKeys={setKeys} />}
    <div className="ba-buttons"><button type="button" className="primary" disabled={busy || title.trim().length < 3 || !preset || !allDone} onClick={() => void submit()}>{busy ? 'Sınav kaydediliyor…' : 'Sınavı kaydet ve seç'}</button><button type="button" className="ghost" onClick={onCancel}>Vazgeç</button>
      {!allDone && preset && <small className="field-help">Kaydetmek için seçili her kitapçığın bütün cevaplarını girin.</small>}</div>
  </div>;
}

/**
 * D-S041: for its own exam the owner sees how many students are evaluated, opens the results to them, corrects the key
 * (results are taken back, every upload is evaluated again here, and results that were open are opened again) and
 * removes the exam (30-day trash, as "Kaldır" in the app).
 */
export function OwnExamPublishBar({ examId, refreshKey = 0, onRemoved, onChanged }: { examId: string; refreshKey?: number; onRemoved?: () => void; onChanged?: () => void }) {
  const [state, setState] = useState<any>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [problems, setProblems] = useState<string[]>([]); const [notice, setNotice] = useState('');
  const [panel, setPanel] = useState<'' | 'OPEN' | 'FIX' | 'REMOVE'>('');
  const [keys, setKeys] = useState<Keys>({}); const [reason, setReason] = useState(''); const [progress, setProgress] = useState('');
  const base = `/api/admin/result-network/operations/own-exams/${encodeURIComponent(examId)}`;
  const load = () => api<any>(base).then((r) => { setState(r); return r; }).catch(() => { setState(null); return null; });
  useEffect(() => { setPanel(''); setError(''); setNotice(''); void load(); }, [examId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!state) return null;
  const published = state.administration?.status === 'PUBLISHED';
  const fail = (e: any) => { setError(e?.message || 'İşlem tamamlanamadı.'); const d: any = e instanceof ApiError ? e.details : null; setProblems(Array.isArray(d?.problems) ? d.problems : []); };
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(''); setProblems([]); setNotice(''); try { await fn(); } catch (e) { fail(e); } finally { setBusy(false); setProgress(''); } };
  const open = () => run(async () => { await api(`${base}/publish`, { method: 'POST' }); setPanel(''); await load(); setNotice('Sonuçlar öğrencilere açıldı.'); onChanged?.(); });
  const startFix = () => { setKeys(JSON.parse(JSON.stringify(state.keys || {}))); setReason(''); setPanel('FIX'); };
  const saveFix = () => run(async () => {
    const r = await api<any>(`${base}/answer-key`, { method: 'POST', body: JSON.stringify({ keys, reason }) });
    const ids: string[] = r.reevaluateBatchIds || [];
    for (const [i, id] of ids.entries()) {
      for (let step = 0; step < 200; step++) {
        setProgress(`Yeni anahtarla değerlendiriliyor: yükleme ${i + 1}/${ids.length}…`);
        const ev = await api<any>(`/api/admin/result-network/operations/scan-batches/${encodeURIComponent(id)}/evaluate`, { method: 'POST' });
        if (ev.done !== false) break;
      }
    }
    if (r.wasPublished) await api(`${base}/publish`, { method: 'POST' });
    setPanel(''); await load(); onChanged?.();
    setNotice(`Cevap anahtarı düzeltildi${ids.length ? ` ve ${ids.length} yükleme yeni anahtarla yeniden değerlendirildi` : ''}.${r.wasPublished ? ' Sonuçlar öğrencilere yeniden açıldı.' : ''}`);
  });
  const remove = () => run(async () => { await api(`${base}/remove`, { method: 'POST', body: JSON.stringify({ reason }) }); onRemoved?.(); });
  const complete = keysComplete(state.sections || [], state.booklets || [], keys);

  return <div className={`own-exam-publish ${published ? 'is-open' : ''}`}>
    <div className="own-exam-publish-head">
      <div role="status"><strong>{state.exam?.title} · {published ? 'Sonuçlar öğrencilere açık' : 'Sonuçlar henüz öğrencilere kapalı'}</strong>
        <span>{state.participants} öğrenci değerlendirildi.{published ? ' Sonradan yüklediğiniz dosyalar sıralamalara kendiliğinden eklenir.' : ''}</span></div>
      {!panel && <div className="own-exam-publish-actions">
        {!published && <button type="button" className="primary" disabled={!state.participants} onClick={() => setPanel('OPEN')}>Sonuçları öğrencilere aç</button>}
        <button type="button" className="secondary" onClick={startFix}>Cevap anahtarını düzelt</button>
        <button type="button" className="ghost" onClick={() => { setReason(''); setPanel('REMOVE'); }}>Sınavı kaldır</button>
      </div>}
    </div>
    {notice && <div className="alert success" role="status">{notice}</div>}
    {error && <div className="alert error" role="alert">{error}{problems.length > 0 && <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>}</div>}
    {panel === 'OPEN' && <div className="own-exam-publish-confirm"><span>Öğrenciler sonuçlarını sonuc.anunex.com'dan görebilecek. Emin misiniz?</span><button type="button" className="primary" disabled={busy} onClick={() => void open()}>{busy ? 'Açılıyor…' : 'Evet, aç'}</button><button type="button" className="ghost" onClick={() => setPanel('')}>Vazgeç</button></div>}
    {panel === 'FIX' && <div className="own-exam-fix">
      <p>Yanlış girilen cevapları düzeltin.{state.participants ? ` ${state.participants} öğrencinin sonucu yeni anahtarla yeniden hesaplanır${published ? '; bu sırada sonuçlar öğrencilere kısa süre kapanır ve bitince yeniden açılır' : ''}.` : ''}</p>
      <KeyEditor sections={state.sections || []} booklets={state.booklets || []} keys={keys} setKeys={setKeys} />
      {!!state.participants && <label>Neden düzeltiyorsunuz?<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Örn. Matematik 12. sorunun cevabı yanlış girilmişti" /></label>}
      {progress && <div className="alert info" role="status">{progress}</div>}
      <div className="own-exam-publish-confirm"><button type="button" className="primary" disabled={busy || !complete || (!!state.participants && reason.trim().length < 5)} onClick={() => void saveFix()}>{busy ? 'Kaydediliyor…' : 'Düzeltmeyi kaydet'}</button><button type="button" className="ghost" disabled={busy} onClick={() => setPanel('')}>Vazgeç</button></div>
    </div>}
    {panel === 'REMOVE' && <div className="own-exam-fix">
      <p><b>{state.exam?.title}</b> her yerden kaldırılacak: yükleme listesinden ve öğrenci ekranından hemen çıkar. 30 gün çöp kutusunda kalır, sonra kalıcı silinir.</p>
      {!!state.participants && <label>Neden kaldırıyorsunuz?<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Örn. Yanlış sınav eklendi" /></label>}
      <div className="own-exam-publish-confirm"><button type="button" className="danger" disabled={busy || (!!state.participants && reason.trim().length < 5)} onClick={() => void remove()}>{busy ? 'Kaldırılıyor…' : 'Evet, kaldır'}</button><button type="button" className="ghost" onClick={() => setPanel('')}>Vazgeç</button></div>
    </div>}
  </div>;
}
