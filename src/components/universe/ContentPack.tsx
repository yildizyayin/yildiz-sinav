import { useState } from 'react';
import { api } from '../../api';
import { buildContent } from '../../pages/UniverseCenter';

/**
 * Toplu içerik paketi (oyun yol haritası, Aşama 1; owner 25 Nov 2026: "oyun içeriklerini sürekli güncel tutmalıyız").
 * A month's activities pasted as one JSON pack — easy to prepare with ChatGPT or by hand — checked here row by row,
 * then sent to the server, which ties each one to a verified MEB outcome by its code and saves it for approval.
 */
const SAMPLE = {
  paket: '5. sınıf matematik · Aralık 2026',
  hak: 'OWNED',
  etkinlikler: [
    { kazanim: 'M.5.1.1.1', sinif: 5, tur: 'PAIRS', baslik: 'Basamak adları', ciftler: ['7 binler = 7 000', '7 yüzler = 700', '7 onlar = 70', '7 birler = 7'] },
    { kazanim: 'M.5.1.1.1', sinif: 5, tur: 'SEQUENCE', yonerge: 'Sayıları küçükten büyüğe sırala.', sira: ['9 999', '89 999', '90 100', '98 001'] },
    { kazanim: 'M.5.1.1.1', sinif: 5, tur: 'CLOZE', metin: '40 605 sayısında 6 rakamı [yüzler] basamağındadır.' },
    { kazanim: 'M.5.1.1.1', sinif: 5, tur: 'STEPS', problem: '3 kalem 12 TL ise 5 kalem kaç TL?', adimlar: ['1 kalem kaç TL? = 4', '5 kalem kaç TL? = 20'] },
  ],
};
const KIND_TR: Record<string, string> = { PAIRS: 'Eşleştirme', SEQUENCE: 'Sıralama', CLOZE: 'Boşluk', STEPS: 'Adım adım', AUDIO_QUESTION: 'Dinle ve seç' };
const join = (v: any) => (Array.isArray(v) ? v.map((x) => String(x)).join('\n') : String(v ?? ''));

/** Turns the pack's plain Turkish fields into what the server expects; rows that cannot be built carry their error. */
export function packToItems(pack: any): { items: any[]; errors: Array<{ row: number; message: string }> } {
  const rows: any[] = Array.isArray(pack?.etkinlikler) ? pack.etkinlikler : Array.isArray(pack) ? pack : [];
  const items: any[] = [], errors: Array<{ row: number; message: string }> = [];
  rows.forEach((r, k) => {
    const kind = String(r?.tur || '').toUpperCase();
    const f: Record<string, string> = kind === 'PAIRS' ? { pairs: join(r.ciftler) }
      : kind === 'SEQUENCE' ? { prompt: String(r.yonerge || ''), items: join(r.sira) }
        : kind === 'CLOZE' ? { text: String(r.metin || '') }
          : kind === 'STEPS' ? { prompt: String(r.problem || ''), steps: join(r.adimlar) }
            : kind === 'AUDIO_QUESTION' ? { transcript: String(r.metin || ''), question: String(r.soru || ''), options: join(r.secenekler), correct: String(r.dogru || '') } : {};
    if (!KIND_TR[kind]) { errors.push({ row: k + 1, message: `Tür "${r?.tur ?? ''}" desteklenmiyor (PAIRS, SEQUENCE, CLOZE, STEPS, AUDIO_QUESTION).` }); return; }
    if (!String(r?.kazanim || '').trim()) { errors.push({ row: k + 1, message: 'Kazanım kodu yok.' }); return; }
    const built = buildContent(kind, f);
    if ('error' in built) { errors.push({ row: k + 1, message: built.error }); return; }
    items.push({ row: k + 1, outcomeCode: String(r.kazanim).trim(), gradeLevel: Number(r.sinif) || null, contentKind: kind, title: r.baslik ? String(r.baslik) : null, copyrightStatus: String(r.hak || pack?.hak || 'UNKNOWN'), public: built.public, answer: built.answer });
  });
  return { items, errors };
}

export function ContentPack({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ created: number; skipped: number; failed: Array<{ row: number; message: string }> } | null>(null);
  const [error, setError] = useState('');
  let parsed: any = null, parseError = '';
  if (text.trim()) { try { parsed = JSON.parse(text); } catch { parseError = 'Paket geçerli bir JSON değil. Örneği doldurup üzerinde değişiklik yapabilirsin.'; } }
  const check = parsed ? packToItems(parsed) : null;
  const send = async () => {
    if (!check?.items.length) return;
    setBusy(true); setError(''); setReport(null);
    try {
      const r = await api<any>('/api/reporting/universe/contents/bulk', { method: 'POST', body: JSON.stringify({ name: parsed?.paket || null, items: check.items }) });
      // server rows follow the sent items; map them back to the pack's own row numbers
      const failed = [...check.errors, ...(r.results || []).filter((x: any) => !x.ok).map((x: any) => ({ row: check.items[x.row - 1]?.row ?? x.row, message: x.message }))].sort((a, b) => a.row - b.row);
      setReport({ created: r.created || 0, skipped: r.skipped || 0, failed });
      onDone();
    } catch (e: any) { setError(e.message || 'Paket gönderilemedi.'); }
    setBusy(false);
  };
  return <section className="panel" style={{ display: 'grid', gap: 10 }}>
    <h2 style={{ margin: 0, fontSize: 18 }}>Toplu içerik paketi</h2>
    <p className="muted" style={{ margin: 0 }}>Bir ayın etkinliklerini tek seferde ekle. Her satır kazanım koduyla doğrulanmış bir MEB kazanımına bağlanır ve onaya düşer; onaylanmadan öğrenciye çıkmaz. Aynı etkinlik ikinci kez gönderilirse atlanır. En çok 200 etkinlik. Örnekteki kazanım kodlarını kendi kazanım kodlarınla değiştir.</p>
    <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>Paket (JSON)<textarea rows={10} value={text} onChange={(e) => { setText(e.target.value); setReport(null); }} placeholder='{"paket":"…","hak":"OWNED","etkinlikler":[{"kazanim":"…","sinif":5,"tur":"PAIRS","ciftler":["sol = sağ"]}]}' style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, width: '100%', boxSizing: 'border-box' }} /></label>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <button type="button" className="ghost" onClick={() => { setText(JSON.stringify(SAMPLE, null, 2)); setReport(null); }}>Örnek paketi doldur</button>
      <button type="button" className="primary" disabled={busy || !check?.items.length} onClick={() => void send()}>{busy ? 'Gönderiliyor…' : `${check?.items.length || 0} etkinliği onaya gönder`}</button>
      {check && <span className="muted">{check.items.length} hazır{check.errors.length ? ` · ${check.errors.length} satırda sorun var` : ''}</span>}
    </div>
    {parseError && <div className="alert error">{parseError}</div>}
    {check && check.errors.length > 0 && !report && <ul className="muted" style={{ margin: 0 }}>{check.errors.map((x) => <li key={x.row}>{x.row}. satır: {x.message}</li>)}</ul>}
    {error && <div className="alert error">{error}</div>}
    {report && <div className="alert success" role="status">{report.created} etkinlik onaya gönderildi{report.skipped ? `, ${report.skipped} zaten vardı` : ''}{report.failed.length ? `, ${report.failed.length} satır eklenemedi` : ''}.
      {report.failed.length > 0 && <ul style={{ margin: '6px 0 0' }}>{report.failed.map((x) => <li key={x.row}>{x.row}. satır: {x.message}</li>)}</ul>}</div>}
  </section>;
}
