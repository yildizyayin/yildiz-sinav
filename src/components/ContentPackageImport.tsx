import { useMemo, useState } from 'react';
import { FolderUp } from 'lucide-react';
import { api } from '../api';
import { fileIndex, mediaPaths, mimeOf, outcomeFromJson, packageName, requestBody, type PkgOutcome } from '../lib/contentPackage';

/**
 * İçerik Paketi (owner, 26 Nov 2026): the Super Admin selects the unzipped package folder; ANUNEX previews every outcome,
 * uploads only the files it does not have yet (each checked by its hash on the server) and adds the ready questions
 * to the REVIEW queue with their image, solution video and the outcome's topic video. Running it again resumes.
 */
type Row = { o: PkgOutcome; preview?: any; error?: string; state?: 'waiting' | 'working' | 'done' };
const TOPIC: Record<string, string> = { EXISTS: 'yüklü', READY: 'hazır', NEEDS_MEDIA: 'yüklenecek', NONE: 'yok', INVALID: 'hatalı' };

export function ContentPackageImport({ onDone }: { onDone: (message: string) => Promise<void> | void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [files, setFiles] = useState<Map<string, any>>(new Map());
  const [pkg, setPkg] = useState('');
  const [rights, setRights] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const patch = (k: number, v: Partial<Row>) => setRows((r) => r.map((x, i) => (i === k ? { ...x, ...v } : x)));

  const load = async (outs: PkgOutcome[], index: Map<string, any>) => {
    if (!outs.length) throw new Error('Pakette Kazanimlar/<KOD>/Sorular.json bulunamadı. ANUNEX paket ZIP’ini ya da ZIP’ten çıkarılmış klasörü seçin.');
    outs.sort((a, b) => a.code.localeCompare(b.code, 'tr', { numeric: true }));
    setFiles(index); setPkg(packageName(outs[0])); setRows(outs.map((o) => ({ o })));
  };
  const pick = async (list: FileList | null) => {
    setError(''); setRows([]); setProgress('');
    if (!list?.length) return;
    try {
      const all = [...list]; const index = fileIndex(all);
      const jsons = all.filter((f) => /(^|\/)Kazanimlar\/[^/]+\/Sorular\.json$/.test((f as any).webkitRelativePath || f.name));
      await load(await Promise.all(jsons.map(async (f) => outcomeFromJson(await f.text()))), index);
    } catch (e: any) { setError(e.message); }
  };
  // the package ZIPs themselves: read in place (only the table of contents first, each file when it is sent)
  const pickZip = async (list: FileList | null) => {
    setError(''); setRows([]); setProgress('');
    if (!list?.length) return;
    try {
      setProgress('ZIP içeriği okunuyor…');
      const { ZipReader, BlobReader, TextWriter } = await import('@zip.js/zip.js');
      const index = new Map<string, any>(); const outs: PkgOutcome[] = [];
      for (const z of [...list]) {
        const entries = await new ZipReader(new BlobReader(z)).getEntries();
        for (const e of entries) {
          if (e.directory) continue;
          const at = e.filename.indexOf('Kazanimlar/'); if (at < 0) continue;
          const path = e.filename.slice(at);
          index.set(path, e);
          if (/^Kazanimlar\/[^/]+\/Sorular\.json$/.test(path)) outs.push(outcomeFromJson(await (e as any).getData(new TextWriter())));
        }
      }
      setProgress(''); await load(outs, index);
    } catch (e: any) { setProgress(''); setError(e.message || 'ZIP okunamadı.'); }
  };
  const body = async (file: any, path: string) => {
    if (file instanceof Blob) return file;
    const { BlobWriter } = await import('@zip.js/zip.js');
    return file.getData(new BlobWriter(mimeOf(path)));
  };
  const preview = async () => {
    setBusy(true); setError('');
    for (const [k, r] of rows.entries()) {
      try { patch(k, { preview: await api<any>('/api/admin/content-package/preview', { method: 'POST', body: JSON.stringify(requestBody(r.o, pkg, rights)) }), error: undefined }); }
      catch (e: any) { patch(k, { error: e.message }); }
    }
    setBusy(false);
  };
  const run = async () => {
    setBusy(true); setError(''); let added = 0, sent = 0;
    try {
      for (const [k, r] of rows.entries()) {
        const p = await api<any>('/api/admin/content-package/preview', { method: 'POST', body: JSON.stringify(requestBody(r.o, pkg, rights)) });
        if (p.outcomeError || p.errors?.length) { patch(k, { preview: p, state: 'done' }); continue; }
        patch(k, { preview: p, state: 'working' });
        const paths = mediaPaths(r.o);
        for (const [n, m] of (p.need || []).entries()) {
          const path = paths.get(m.sha256), file = path ? files.get(path) : null;
          if (!file) throw new Error(`${r.o.code}: ${path || m.sha256} dosyası seçilen klasörde yok.`);
          setProgress(`${r.o.code} · dosya ${n + 1}/${p.need.length} yükleniyor`);
          await api(`/api/admin/content-package/media/${m.sha256}`, { method: 'PUT', body: await body(file, path!), headers: { 'Content-Type': mimeOf(path!) } });
          sent++;
        }
        setProgress(`${r.o.code} · sorular havuza ekleniyor`);
        const c = await api<any>('/api/admin/content-package/commit', { method: 'POST', body: JSON.stringify(requestBody(r.o, pkg, rights, true)) });
        added += c.created || 0; patch(k, { preview: c, state: 'done' });
      }
      setProgress('');
      await onDone(`${added} soru incelemeye alındı; ${sent} dosya yüklendi. Onaylamadan hiçbiri öğrenciye görünmez.`);
    } catch (e: any) { setError(`${e.message} Yeniden başlatınca kaldığı yerden devam eder.`); }
    setBusy(false);
  };
  const totals = useMemo(() => rows.reduce((t, r) => ({ q: t.q + r.o.questions.length, v: t.v + r.o.questions.filter((q) => q.video).length + (r.o.topic ? 1 : 0), i: t.i + r.o.questions.filter((q) => q.image).length }), { q: 0, v: 0, i: 0 }), [rows]);
  const previewed = rows.length > 0 && rows.every((r) => r.preview || r.error);

  return <details className="panel" style={{ marginBottom: 12 }}>
    <summary style={{ cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><FolderUp size={16} /> İçerik paketi aktar (soru + görsel + çözüm videosu + konu videosu)</summary>
    <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
      <p className="muted" style={{ margin: 0 }}>Paket ZIP dosyalarını doğrudan seçin (iki parça varsa ikisini birlikte). Sorular incelemeye girer; her dosya sunucuda özetiyle doğrulanır. Yarıda kalırsa yeniden başlatın, kaldığı yerden devam eder.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label className="secondary" style={{ cursor: 'pointer', order: 2 }}>ya da çıkarılmış klasörü seç
          <input type="file" multiple style={{ display: 'none' }} disabled={busy} {...({ webkitdirectory: '', directory: '' } as any)} onChange={(e) => void pick(e.target.files)} />
        </label>
        <label className="primary" style={{ cursor: 'pointer', order: 1 }}>ZIP dosyalarını seç
          <input type="file" accept=".zip,application/zip" multiple style={{ display: 'none' }} disabled={busy} onChange={(e) => void pickZip(e.target.files)} />
        </label>
      </div>
      <small className="muted">Klasör seçerken pencere dosyaları göstermez, yalnız klasörleri gösterir; bu normaldir. Klasörü seçip “Yükle”ye basın.</small>
      {error && <div className="alert error" role="alert">{error}</div>}
      {progress && <div className="alert info" role="status">{progress}</div>}
      {rows.length > 0 && <>
        <div className="form-grid">
          <label>Paket adı<input value={pkg} onChange={(e) => setPkg(e.target.value)} disabled={busy} /></label>
          <label>Telif durumu (zorunlu)<select value={rights} onChange={(e) => setRights(e.target.value)} disabled={busy}><option value="">Seçin</option><option value="OWNED">Bize ait</option><option value="LICENSED">Lisanslı / izinli</option><option value="USER_PROVIDED">Kullanıcı sağladı</option></select></label>
        </div>
        <p style={{ margin: 0 }}><strong>{rows.length} kazanım · {totals.q} soru · {totals.i} görsel · {totals.v} video</strong> bulundu.</p>
        <div style={{ overflowX: 'auto' }}><table className="table" style={{ minWidth: 640 }}>
          <thead><tr><th>Kazanım</th><th>Soru</th><th>Eklenecek</th><th>Dosya bekliyor</th><th>Zaten var</th><th>Bekletilen / hatalı</th><th>Konu videosu</th></tr></thead>
          <tbody>{rows.map((r) => { const s = r.preview?.summary; return <tr key={r.o.code} className={r.state === 'working' ? 'active' : ''}>
            <td><strong>{r.o.code}</strong>{r.preview?.outcome && <><br /><small>{r.preview.outcome.title}</small></>}{(r.error || r.preview?.outcomeError) && <><br /><small className="error-text">{r.error || r.preview.outcomeError}</small></>}</td>
            <td>{r.o.questions.length}</td><td>{s ? s.ready + s.needsMedia : '—'}</td><td>{r.preview?.need ? r.preview.need.length : '—'}</td><td>{s ? s.exists + s.duplicate : '—'}</td>
            <td>{s ? `${s.held} / ${s.invalid}` : '—'}{r.preview?.items?.some((i: any) => i.errors?.length) && <details><summary>ayrıntı</summary><ul>{r.preview.items.filter((i: any) => i.errors?.length).slice(0, 10).map((i: any) => <li key={i.id}>{i.id}: {i.errors.join(' ')}</li>)}</ul></details>}</td>
            <td>{r.preview ? TOPIC[r.preview.topic?.status] || '—' : '—'}</td>
          </tr>; })}</tbody>
        </table></div>
        
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="secondary" disabled={busy || !rights} onClick={() => void preview()}>{busy && !progress ? 'Kontrol ediliyor…' : 'Ön raporu hazırla'}</button>
          <button className="primary" disabled={busy || !rights || !previewed} onClick={() => void run()}>Dosyaları yükle ve incelemeye al</button>
        </div>
        {!rights && <small className="muted">Telif durumunu seçmeden ön rapor hazırlanmaz.</small>}
      </>}
    </div>
  </details>;
}
