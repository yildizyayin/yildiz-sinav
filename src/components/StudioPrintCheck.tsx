import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Ruler, ShieldAlert } from 'lucide-react';
import { api } from '../api';

/**
 * P03 (owner, 2 Nov): the print check and the page settings of a Studio document, before any PDF. Every blocker is
 * named with its question and what to fix; the server runs the same check again before printing (P02).
 */
type Issue = { code: string; message: string; questionId: string | null; booklet: string | null; target: string };
type Settings = { version: 1; pageSize: 'A4' | 'A5'; orientation: 'PORTRAIT' | 'LANDSCAPE'; columns: 1 | 2 | 'AUTO'; marginMm: number; fontSizePt: number; questionSpacingPt: number };
const TARGET: Record<string, string> = { ANSWER_KEY: 'Cevap anahtarı', APPROVAL: 'Onay', RIGHTS: 'Kullanım hakkı', MEDIA: 'Görsel', LAYOUT: 'Sayfa düzeni', CONTENT: 'İçerik', BOOKLET: 'Kitapçık' };

export function StudioPrintCheck({ documentId, locked, onSaved }: { documentId: string; locked?: boolean; onSaved?: () => void }) {
  const base = `/api/platform/studio/${encodeURIComponent(documentId)}`;
  return <PrintCheckPanel checkUrl={`${base}/check`} layoutUrl={`${base}/layout`} locked={locked} onSaved={onSaved} />;
}

/** Shared by Studio and Quick Test (both speak the P02 check/layout contract). */
export function PrintCheckPanel({ checkUrl, layoutUrl, locked, onSaved, allowAuto = false, showForm = true, title = 'Baskı kontrolü ve sayfa düzeni' }: { checkUrl: string; layoutUrl: string; locked?: boolean; onSaved?: () => void; allowAuto?: boolean; showForm?: boolean; title?: string }) {
  const [check, setCheck] = useState<any>(null); const [error, setError] = useState('');
  const [form, setForm] = useState<Settings | null>(null); const [saving, setSaving] = useState(false); const [note, setNote] = useState('');
  const load = () => api<any>(checkUrl).then((r) => { setCheck(r.check); if (r.check?.settings) setForm(r.check.settings); setError(''); }).catch((e) => setError(e?.message || 'Baskı kontrolü yapılamadı.'));
  useEffect(() => { setCheck(null); setNote(''); void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkUrl]);
  const save = async () => {
    if (!form) return; setSaving(true); setNote(''); setError('');
    try { const r = await api<any>(layoutUrl, { method: 'PUT', body: JSON.stringify({ settings: form }) });
      setNote(r.invalidatedPdfs ? 'Sayfa düzeni kaydedildi. Daha önce indirilen PDF\'ler geçersiz; yeniden indirin.' : 'Sayfa düzeni kaydedildi.'); await load(); onSaved?.(); }
    catch (e: any) { setError(e?.message || 'Sayfa düzeni kaydedilemedi.'); } finally { setSaving(false); }
  };
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const status = check?.status;
  const list = (items: Issue[], kind: 'block' | 'warn') => <ul className={`spc-list spc-${kind}`}>{items.map((x, i) => <li key={`${x.code}-${x.questionId}-${i}`}><span className="spc-target">{TARGET[x.target] || x.target}</span><span>{x.message}</span></li>)}</ul>;
  return <section className="studio-print-check" aria-labelledby="spc-title">
    <div className="spc-head"><h3 id="spc-title"><Ruler size={16} aria-hidden="true" /> {title}</h3>
      {status && <span className={`spc-status spc-${String(status).toLowerCase()}`}>{status === 'READY' ? <><CheckCircle2 size={14} aria-hidden="true" /> Basılabilir</> : status === 'WARNINGS' ? <><AlertTriangle size={14} aria-hidden="true" /> Uyarılarla basılabilir</> : <><ShieldAlert size={14} aria-hidden="true" /> Basılamaz</>}</span>}</div>
    {error && <div className="alert error" role="alert">{error}</div>}
    {!check && !error && <p className="muted" role="status">Kontrol ediliyor…</p>}
    {check && <>
      {!!check.blockers?.length && <><p className="spc-sub">Basmadan önce düzeltilmesi gerekenler</p>{list(check.blockers, 'block')}</>}
      {!!check.warnings?.length && <><p className="spc-sub">Uyarılar</p>{list(check.warnings, 'warn')}</>}
      <div className="spc-booklets">{Object.entries(check.booklets || {}).map(([code, b]: [string, any]) => <span key={code}>Kitapçık {code}: {b.questionCount} soru{b.pages ? ` · ${b.pages} sayfa` : ''}{b.pdf?.generated ? (b.pdf.stale ? ' · indirilen PDF eski' : ' · PDF güncel') : ''}</span>)}</div>
    </>}
    {showForm && form && <fieldset className="spc-form" disabled={saving || locked}><legend>Sayfa düzeni</legend>
      <label>Sayfa<select value={form.pageSize} onChange={(e) => set('pageSize', e.target.value as Settings['pageSize'])}><option value="A4">A4</option><option value="A5">A5</option></select></label>
      <label>Yön<select value={form.orientation} onChange={(e) => set('orientation', e.target.value as Settings['orientation'])}><option value="PORTRAIT">Dikey</option><option value="LANDSCAPE">Yatay</option></select></label>
      <label>Sütun<select value={String(form.columns)} onChange={(e) => set('columns', e.target.value === 'AUTO' ? 'AUTO' : (Number(e.target.value) as 1 | 2))}>{allowAuto && <option value="AUTO">Otomatik</option>}<option value="2">2 sütun</option><option value="1">1 sütun</option></select></label>
      <label>Kenar (mm)<input type="number" inputMode="decimal" min={8} max={25} step={0.5} value={form.marginMm} onChange={(e) => set('marginMm', Number(e.target.value))} /></label>
      <label>Punto<input type="number" inputMode="decimal" min={8} max={13} step={0.5} value={form.fontSizePt} onChange={(e) => set('fontSizePt', Number(e.target.value))} /></label>
      <label>Soru aralığı (pt)<input type="number" inputMode="numeric" min={4} max={30} step={1} value={form.questionSpacingPt} onChange={(e) => set('questionSpacingPt', Number(e.target.value))} /></label>
      <button type="button" className="primary" onClick={() => void save()}>{saving ? 'Kaydediliyor…' : 'Düzeni kaydet'}</button>
    </fieldset>}
    {showForm && locked && <p className="muted">Bu belgenin öğrenci sonucu var; sayfa düzeni değiştirilemez.</p>}
    {note && <div className="alert success" role="status">{note}</div>}
  </section>;
}
