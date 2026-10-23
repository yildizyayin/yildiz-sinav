import { useState } from 'react';
import { FileUp } from 'lucide-react';
import { api } from '../api';
import { rowsFromJson, toImportRows } from '../lib/questionImportRows';

const STATUS: Record<string, string> = { READY: 'Eklenecek', DUPLICATE: 'Zaten var', INVALID: 'Hatalı' };

/** A082: Super Admin bulk import — preview with row errors, then send valid rows to the REVIEW queue. */
export function QuestionImport({ onDone }: { onDone: (message: string) => Promise<void> | void }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const read = async (file: File | undefined) => {
    setError(''); setPreview(null); setRows([]); if (!file) return;
    try {
      let parsed: Record<string, unknown>[];
      if (/\.json$/i.test(file.name)) parsed = rowsFromJson(await file.text());
      else { const XLSX = await import('xlsx'); const book = XLSX.read(await file.arrayBuffer(), { type: 'array' }); parsed = toImportRows(XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '', raw: false })); }
      if (!parsed.length) throw new Error('Dosyada satır bulunamadı.');
      setRows(parsed); setFileName(file.name);
      setBusy(true); setPreview(await api<any>('/api/admin/question-import/preview', { method: 'POST', body: JSON.stringify({ rows: parsed, fileName: file.name }) }));
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const commit = async () => {
    setBusy(true); setError('');
    try { const r = await api<any>('/api/admin/question-import/commit', { method: 'POST', body: JSON.stringify({ rows, fileName, confirm: true }) }); setPreview(r); await onDone(`${r.summary.added} soru inceleme kuyruğuna eklendi; ${r.summary.duplicates + r.summary.skippedAsCopy} kopya atlandı, ${r.summary.invalid} satır hatalı.`); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return <details className="panel" style={{ marginBottom: 12 }}>
    <summary><FileUp size={16} /> Toplu soru aktar (Excel / CSV / JSON)</summary>
    <p>Sütunlar: Kaynak, Sınıf, Kazanım kodu, Soru, A, B, C, D, (E), Doğru cevap, Çözüm, Zorluk (1–6), Telif. Her soru doğrulanmış 2027–2028 resmî kazanımına bağlanmalı. Eklenen sorular incelemeye düşer; otomatik onaylanmaz.</p>
    <input type="file" accept=".xlsx,.xls,.csv,.json" disabled={busy} onChange={(e) => void read(e.target.files?.[0])} />
    {error && <div className="alert error">{error}</div>}
    {preview && <>
      <p><strong>{preview.summary.total}</strong> satır · {preview.summary.ready} eklenecek · {preview.summary.duplicates} zaten var · {preview.summary.invalid} hatalı{preview.summary.added !== undefined ? ` · ${preview.summary.added} eklendi` : ''}</p>
      <div className="table-card"><table><thead><tr><th>Satır</th><th>Durum</th><th>Kazanım</th><th>Hata / uyarı</th></tr></thead><tbody>
        {preview.rows.map((r: any) => <tr key={r.line}><td>{r.line}</td><td>{STATUS[r.status] || r.status}</td><td>{r.outcome ? `${r.outcome.code} · ${r.outcome.gradeLevel}. sınıf` : '—'}</td><td>{[...r.errors, ...r.warnings].join(' ')}</td></tr>)}
      </tbody></table></div>
      {preview.summary.added === undefined && preview.summary.ready > 0 && <button className="primary" disabled={busy} onClick={() => void commit()}>{preview.summary.ready} soruyu incelemeye ekle</button>}
    </>}
  </details>;
}
