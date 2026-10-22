import { useEffect, useState } from 'react';
import { Camera, FileText } from 'lucide-react';
import { api } from '../api';
import { imageFileToImageData } from '../lib/omrEngine';
import { readWrittenPage, type GrayCrop, type WrittenPageRead } from '../lib/writtenCameraReader';

/** A085: print the camera answer sheet, photograph filled sheets, read them on the phone and send the answer boxes. */
function cropToJpeg(c: GrayCrop): string {
  const canvas = document.createElement('canvas'); canvas.width = c.width; canvas.height = c.height;
  const ctx = canvas.getContext('2d')!; const img = ctx.createImageData(c.width, c.height); img.data.set(c.data); ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.72);
}
const FLAG: Record<string, string> = { ILLEGIBLE: 'okunamıyor', LOW_CONFIDENCE: 'düşük güven', AI_OUTPUT_INVALID: 'AI önerisi geçersiz', AI_UNAVAILABLE: 'AI yanıt vermedi', AI_DISABLED: 'AI kapalı', UNREADABLE_DIGITS: 'rakamlar belirsiz', CHECK_MARKS: 'işaretleri kontrol edin' };

export function WrittenCameraScan({ paperId, students }: { paperId: string; students: { id: string; label: string }[] }) {
  const [layout, setLayout] = useState<any>(null);
  const [reads, setReads] = useState<{ name: string; read: WrittenPageRead; studentId: string; sent?: any; error?: string }[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const base = `/api/written-papers/${paperId}/camera`;
  useEffect(() => { api<any>(`${base}/layout`).then((r) => setLayout(r.layout)).catch((e) => setError(e.message)); }, [paperId]);
  const readFiles = async (files: FileList | null) => {
    if (!files || !layout) return; setBusy(true); setError('');
    const out = [];
    for (const f of Array.from(files)) { try { out.push({ name: f.name, read: readWrittenPage(await imageFileToImageData(f, 2200), layout), studentId: '' }); } catch (e: any) { out.push({ name: f.name, read: { ok: false, pageNo: null, studentNumber: null, confidence: 0, issues: [e.message], digits: {}, crops: [] }, studentId: '' }); } }
    setReads([...reads, ...out]); setBusy(false);
  };
  const send = async (k: number) => {
    const r = reads[k]; setBusy(true);
    try {
      const res = await api<any>(`${base}/scans`, { method: 'POST', body: JSON.stringify({ pageNo: r.read.pageNo, studentNumber: r.studentId ? undefined : r.read.studentNumber, studentId: r.studentId || undefined, readConfidence: r.read.confidence, items: r.read.crops.map((c) => ({ itemId: c.itemId, image: cropToJpeg(c), digits: r.read.digits[c.itemId]?.read, issues: r.read.digits[c.itemId]?.issues || [] })) }) });
      setReads(reads.map((x, j) => (j === k ? { ...x, sent: res, error: undefined } : x)));
    } catch (e: any) { setReads(reads.map((x, j) => (j === k ? { ...x, error: e.message } : x))); } finally { setBusy(false); }
  };
  return <div className="panel" style={{ marginTop: 16 }}>
    <h3><Camera size={16} /> Kamera ile okuma</h3>
    <p>Öğrencilere kamera cevap kâğıdını dağıtın. Doldurulan kâğıtları telefonla çekin: dört köşe karesi kadrajda olmalı. Sayısal cevaplar kesin okunur; yazılı cevapların fotoğrafı size gelir, AI yalnız öneri verir. Puanı siz onaylarsınız.</p>
    {error && <div className="alert error">{error}</div>}
    <div style={{ display: 'flex', gap: 8 }}><a className="ghost" href={`${base}/sheet`} target="_blank" rel="noreferrer"><FileText size={16} /> Kamera cevap kâğıdını yazdır</a>
      <label className="primary">Fotoğraf çek / seç<input type="file" accept="image/*" capture="environment" multiple hidden disabled={busy || !layout} onChange={(e) => void readFiles(e.target.files)} /></label></div>
    {reads.map((r, k) => <div key={k} className="panel" style={{ marginTop: 8 }}>
      <strong>{r.name}</strong> · {r.read.pageNo ? `sayfa ${r.read.pageNo}` : 'sayfa okunamadı'} · öğrenci no: {r.read.studentNumber || '—'} · güven {Math.round(r.read.confidence * 100)}%
      {r.read.issues.length > 0 && <ul>{r.read.issues.map((x) => <li key={x}>{x}</li>)}</ul>}
      {r.read.pageNo && !r.sent && <div style={{ display: 'flex', gap: 8 }}>
        <select value={r.studentId} onChange={(e) => setReads(reads.map((x, j) => (j === k ? { ...x, studentId: e.target.value } : x)))}><option value="">{r.read.studentNumber ? 'Okunan numarayı kullan' : 'Öğrenciyi seçin'}</option>{students.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <button className="primary" disabled={busy || (!r.read.studentNumber && !r.studentId)} onClick={() => void send(k)}>Gönder</button></div>}
      {r.error && <div className="alert error">{r.error}</div>}
      {r.sent && <ul>{r.sent.items.map((x: any) => <li key={x.itemId}>{x.suggestion ? `${x.suggestion.source === 'DIGIT_GRID' ? 'Rakam ızgarası' : 'AI'} önerisi: ${x.suggestion.itemPoints} puan${x.suggestion.confidence != null ? ` · güven ${Math.round(x.suggestion.confidence * 100)}%` : ''}` : 'Öneri yok'}{[...x.flags, ...(x.suggestion?.flags || [])].map((f: string) => ` · ${FLAG[f] || f}`).join('')}</li>)}</ul>}
    </div>)}
  </div>;
}
