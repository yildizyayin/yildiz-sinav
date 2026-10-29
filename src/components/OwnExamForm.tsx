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

export function OwnExamForm({ mode, onCreated, onCancel }: { mode: 'INSTITUTION' | 'DEALER'; onCreated: (exam: { id: string; title: string }) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [preset, setPreset] = useState('');
  const [examDate, setExamDate] = useState('');
  const [booklets, setBooklets] = useState<string[]>(['A']);
  const [tab, setTab] = useState('A');
  const [keys, setKeys] = useState<Record<string, Record<string, string>>>({});
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [problems, setProblems] = useState<string[]>([]);

  const sections = useMemo(() => {
    const p = PRESETS.find((x) => x.key === preset);
    return p ? EXAM_TEMPLATES.find((t) => t.key === p.template)?.sections || [] : [];
  }, [preset]);
  const total = sections.reduce((n, s) => n + s.questionCount, 0);
  const letters = (s: { optionCount: number }) => (s.optionCount === 4 ? 'ABCD' : 'ABCDE');
  const value = (b: string, code: string) => keys[b]?.[code] || '';
  const setValue = (b: string, code: string, v: string) => setKeys((k) => ({ ...k, [b]: { ...(k[b] || {}), [code]: v } }));
  const bookletDone = (b: string) => sections.length > 0 && sections.every((s) => value(b, s.subjectCode).length === s.questionCount);
  const allDone = booklets.every(bookletDone);
  const toggleBooklet = (b: string) => setBooklets((list) => {
    const next = list.includes(b) ? list.filter((x) => x !== b) : [...list, b].sort();
    if (!next.length) return list;
    if (!next.includes(tab)) setTab(next[0]);
    return next;
  });
  const splitPaste = () => {
    const all = clean(paste, 'ABCDE');
    let at = 0; const next: Record<string, string> = {};
    for (const s of sections) { next[s.subjectCode] = all.slice(at, at + s.questionCount); at += s.questionCount; }
    setKeys((k) => ({ ...k, [tab]: next })); setPaste('');
  };
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
    {sections.length > 0 && <div className="own-exam-keys">
      <div className="own-exam-tabs" role="tablist">{booklets.map((b) => <button type="button" role="tab" aria-selected={tab === b} key={b} className={tab === b ? 'active' : ''} onClick={() => setTab(b)}>{b} kitapçığı {bookletDone(b) ? '✓' : ''}</button>)}</div>
      <label className="own-exam-paste">{tab} kitapçığının bütün cevaplarını tek seferde yapıştırın (isteğe bağlı)
        <span className="own-exam-paste-row"><input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={`${total} harf, sırayla: ${sections.map((s) => s.label).join(', ')}`} /><button type="button" className="secondary" disabled={!paste.trim()} onClick={splitPaste}>Derslere böl</button></span></label>
      {sections.map((s) => {
        const v = value(tab, s.subjectCode); const ok = v.length === s.questionCount;
        return <label key={s.subjectCode} className={`own-exam-key ${ok ? 'ok' : v ? 'short' : ''}`}><span>{s.label}<small>{v.length}/{s.questionCount}</small></span>
          <input value={v} onChange={(e) => setValue(tab, s.subjectCode, clean(e.target.value, letters(s)).slice(0, s.questionCount))} spellCheck={false} autoCapitalize="characters" inputMode="text" placeholder={`${s.questionCount} cevap · ${letters(s).split('').join(' ')} · iptal soru X`} aria-label={`${tab} kitapçığı ${s.label} cevapları`} /></label>;
      })}
    </div>}
    <div className="ba-buttons"><button type="button" className="primary" disabled={busy || title.trim().length < 3 || !preset || !allDone} onClick={() => void submit()}>{busy ? 'Sınav kaydediliyor…' : 'Sınavı kaydet ve seç'}</button><button type="button" className="ghost" onClick={onCancel}>Vazgeç</button>
      {!allDone && preset && <small className="field-help">Kaydetmek için seçili her kitapçığın bütün cevaplarını girin.</small>}</div>
  </div>;
}

/** D-S041: for its own exam, the owner sees how many students are evaluated and opens the results to them. */
export function OwnExamPublishBar({ examId, refreshKey = 0 }: { examId: string; refreshKey?: number }) {
  const [state, setState] = useState<any>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [confirm, setConfirm] = useState(false);
  const load = () => api<any>(`/api/admin/result-network/operations/own-exams/${encodeURIComponent(examId)}`).then(setState).catch(() => setState(null));
  useEffect(() => { setConfirm(false); setError(''); void load(); }, [examId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!state) return null;
  const published = state.administration?.status === 'PUBLISHED';
  const open = async () => { setBusy(true); setError(''); try { await api(`/api/admin/result-network/operations/own-exams/${encodeURIComponent(examId)}/publish`, { method: 'POST' }); setConfirm(false); await load(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  return <div className={`own-exam-publish ${published ? 'is-open' : ''}`} role="status">
    <div><strong>{published ? 'Sonuçlar öğrencilere açık' : 'Sonuçlar henüz öğrencilere kapalı'}</strong>
      <span>{state.participants} öğrenci değerlendirildi.{published ? ' Sonradan yüklediğiniz dosyalar sıralamalara kendiliğinden eklenir.' : ''}</span></div>
    {!published && !confirm && <button type="button" className="primary" disabled={!state.participants} onClick={() => setConfirm(true)}>Sonuçları öğrencilere aç</button>}
    {!published && confirm && <div className="own-exam-publish-confirm"><span>Öğrenciler sonuçlarını sonuc.anunex.com'dan görebilecek. Emin misiniz?</span><button type="button" className="primary" disabled={busy} onClick={() => void open()}>{busy ? 'Açılıyor…' : 'Evet, aç'}</button><button type="button" className="ghost" onClick={() => setConfirm(false)}>Vazgeç</button></div>}
    {error && <div className="alert error" role="alert">{error}</div>}
  </div>;
}
