import { useEffect, useState } from 'react';
import { api } from '../api';
import './report-center.css';

/** S036 "Optik ve FMT" (Super Admin menu): the optics the evaluation can read with. A new optic is added from its FMT
 * in Sınav yükleme ("Optik listede yok mu? Optik ekle"), where it is tried on a real TXT/DAT before it is saved. */
export function OpticalCatalog({ onUpload, embedded = false }: { onUpload: () => void; embedded?: boolean }) {
  const [rows, setRows] = useState<any[]>([]); const [error, setError] = useState(''); const [q, setQ] = useState('');
  useEffect(() => { void api<any>('/api/admin/result-network/operations/catalog?mode=INSTITUTION').then((r) => setRows(r.opticals || [])).catch((e: any) => setError(e.message)); }, []);
  const shown = rows.filter((o) => !q.trim() || `${o.name} ${o.version}`.toLocaleLowerCase('tr-TR').includes(q.trim().toLocaleLowerCase('tr-TR')));
  return <section className="rm dc" aria-labelledby="oc-title">
    <header className="rm-head"><div>{!embedded && <div className="rm-kicker">SINAVLAR</div>}<h1 id="oc-title" className={embedded ? 'rm-visually-hidden' : 'rm-title'}>Optik ve FMT</h1><p className="rm-sub">Değerlendirmenin okuyabildiği optikler. Yeni optik, Sınav yükleme ekranında FMT dosyası gerçek bir TXT/DAT ile denenerek eklenir.</p></div>
      <button type="button" className="rm-next" onClick={onUpload}>Optik ekle · Sınav yükleme</button></header>
    {error && <div className="rm-alert" role="alert">{error}</div>}
    <label className="rm-search"><span className="rm-visually-hidden">Ara</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20 16 16" /></svg><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Optik adı ara" /></label>
    <section className="rm-card"><div className="dc-table-wrap"><table className="dc-table"><thead><tr><th>Optik</th><th>Sürüm</th></tr></thead>
      <tbody>{shown.map((o) => <tr key={o.id}><td><b>{o.name}</b></td><td className="dc-muted">{o.version}</td></tr>)}</tbody></table>
      {!shown.length && <p className="rm-empty">{rows.length ? 'Eşleşen optik yok.' : 'Kayıtlı optik yok.'}</p>}</div></section>
  </section>;
}
