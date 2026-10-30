import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import './report-center.css';
import './foy-evaluation.css';

/**
 * Föy değerlendirme on sonuc (30 Oct): pick a föy and a school, upload the paper föy optic (TXT/DAT), check who was
 * matched, then evaluate. Scores go to the registered students' report cards as föy evidence; there is no ranking.
 * The same föy answered online by a student counts only once (first submission).
 */
type Mode = 'INSTITUTION' | 'DEALER' | 'SUPER_ADMIN';
const when = (s: string) => s ? new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const trackLabel = (t: string) => t === 'NUMERIC' ? 'Sayısal' : t === 'VERBAL' ? 'Sözel' : t;
const ws = (w: any) => `${w.title} · ${w.program_code === 'SCHOOL' ? `${w.grade_level}. sınıf` : w.program_code} · ${trackLabel(w.track)} ${w.sequence_no}`;

export function FoyEvaluation({ mode, embedded = false }: { mode: Mode; embedded?: boolean }) {
  const scope = mode === 'DEALER' ? 'DEALER' : 'INSTITUTION';
  const [catalog, setCatalog] = useState<any>({ institutions: [], worksheets: [], opticals: [] });
  const [history, setHistory] = useState<any[]>([]);
  const [form, setForm] = useState({ worksheetId: '', institutionId: '', templateVersionId: '' });
  const [file, setFile] = useState<File | null>(null);
  const [q, setQ] = useState('');
  const [batch, setBatch] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  const load = async () => {
    try {
      const [c, h] = await Promise.all([api<any>(`/api/admin/result-network/operations/foy/catalog?mode=${scope}`), api<any>(`/api/admin/result-network/operations/foy/batches?mode=${scope}`)]);
      setCatalog(c); setHistory(h.batches || []);
      if (c.institutions?.length === 1) setForm((f) => ({ ...f, institutionId: f.institutionId || c.institutions[0].id }));
    } catch (e: any) { setError(e.message); }
  };
  useEffect(() => { void load(); }, [scope]);

  const schools = useMemo(() => {
    const term = q.trim().toLocaleLowerCase('tr-TR');
    const list = (catalog.institutions || []) as any[];
    return (term ? list.filter((i) => `${i.name} ${i.code || ''} ${i.city || ''} ${i.district || ''}`.toLocaleLowerCase('tr-TR').includes(term)) : list).slice(0, 300);
  }, [catalog.institutions, q]);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setBatch(null);
    if (!form.worksheetId || !form.institutionId || !file) return setError('Föy, kurum ve dosya seçin.');
    const fd = new FormData(); fd.set('worksheetId', form.worksheetId); fd.set('institutionId', form.institutionId); if (form.templateVersionId) fd.set('templateVersionId', form.templateVersionId); fd.set('file', file);
    setBusy(true);
    try { setBatch(await api<any>('/api/admin/result-network/operations/foy/upload', { method: 'POST', body: fd })); await load(); }
    catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };
  const open = async (id: string) => { setError(''); try { setBatch(await api<any>(`/api/admin/result-network/operations/foy/batches/${id}`)); window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e: any) { setError(e.message); } };
  const evaluate = async () => {
    if (!batch?.batch?.id) return; setBusy(true); setError('');
    try {
      let r: any; let guard = 0;
      do { r = await api<any>(`/api/admin/result-network/operations/foy/batches/${batch.batch.id}/evaluate`, { method: 'POST' }); setBatch(r); setProgress(`${r.counts.scored + r.counts.setAside} / ${r.counts.total} kâğıt`); guard++; } while (r.done === false && guard < 60);
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); setProgress(''); }
  };
  const remove = async () => {
    if (!batch?.batch?.id || !confirm('Bu yükleme silinsin mi? Değerlendirilmemiş kâğıtlar kaldırılır.')) return;
    setBusy(true); try { await api(`/api/admin/result-network/operations/foy/batches/${batch.batch.id}`, { method: 'DELETE' }); setBatch(null); await load(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const status = (r: any) => r.status === 'SCORED' ? <span className="dc-pill ok">Değerlendirildi</span> : r.status === 'READY' ? <span className="dc-pill wait">Hazır</span> : <span className="dc-pill bad">Kenarda</span>;
  return <div className={`rm dc foy-ev ${embedded ? 'foy-embedded' : ''}`}>
    <header className="rm-head"><div><div className="rm-kicker">FÖY</div><h1 className="rm-title">Föy değerlendirme</h1>
      <p className="rm-sub">Planlı föyün optik dosyasını yükleyin. Sonuç, kurumun kayıtlı öğrencisinin karnesine föy sonucu olarak yazılır; sıralama yapılmaz. Öğrenci aynı föyü online da çözdüyse ilk gönderim sayılır.</p></div></header>
    {error && <div className="rm-alert" role="alert">{error}</div>}
    {mode === 'SUPER_ADMIN' && Number(catalog.waitingForKey) > 0 && <div className="rm-card foy-info" role="note"><b>{catalog.waitingForKey} yayındaki föyün cevap anahtarı eksik.</b> Anahtar app.anunex.com › Föy Yönetim Merkezi'nde girilir; tamamlanan föy bu listeye gelir.</div>}

    <form className="rm-card foy-form" onSubmit={upload}>
      <div className="rm-card-head"><h2>1. Föy, kurum ve dosya</h2></div>
      {!catalog.worksheets?.length ? <p className="rm-empty">Değerlendirmeye hazır föy yok. Föyün yayında olması ve cevap anahtarının tam girilmiş olması gerekir.</p> : <>
        <label className="rm-select">Föy<select required value={form.worksheetId} onChange={(e) => setForm({ ...form, worksheetId: e.target.value })}><option value="">Föy seçin</option>{catalog.worksheets.map((w: any) => <option key={w.id} value={w.id}>{ws(w)} · {w.academic_year}</option>)}</select></label>
        {(catalog.institutions || []).length > 1 && <label className="rm-search"><span className="rm-visually-hidden">Kurum ara</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20 16 16" /></svg><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kurum ara: ad, MEB kodu, il, ilçe" /></label>}
        <label className="rm-select">Kurum<select required value={form.institutionId} onChange={(e) => setForm({ ...form, institutionId: e.target.value })}><option value="">Kurum seçin</option>{schools.map((i: any) => <option key={i.id} value={i.id}>{i.name}{i.code ? ` · ${i.code}` : ''}{i.district ? ` · ${i.city}/${i.district}` : ''}</option>)}</select></label>
        <label className="rm-select">Optik form<select value={form.templateVersionId} onChange={(e) => setForm({ ...form, templateVersionId: e.target.value })}><option value="">Otomatik tanı</option>{(catalog.opticals || []).map((o: any) => <option key={o.id} value={o.id}>{o.name} · v{o.version}</option>)}</select></label>
        <label className="rm-select">Optik dosyası (TXT/DAT)<input type="file" accept=".txt,.dat,.csv,text/plain" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
        <button type="submit" className="rm-primary" disabled={busy}>{busy && !batch ? 'Okunuyor…' : 'Yükle ve kontrol et'}</button>
      </>}
    </form>

    {batch?.batch && <section className="rm-card" aria-labelledby="foy-batch">
      <div className="rm-card-head"><h2 id="foy-batch">2. Kontrol ve değerlendirme</h2><span className="rm-muted">{batch.batch.worksheet_title} · {batch.batch.institution_name}</span></div>
      <div className="foy-counts"><span><b>{batch.counts.total}</b> kâğıt</span><span><b>{batch.counts.ready}</b> hazır</span><span><b>{batch.counts.scored}</b> değerlendirildi</span><span><b>{batch.counts.setAside}</b> kenarda</span></div>
      {(batch.notes || []).length > 0 && <ul className="rm-note">{batch.notes.map((n: string) => <li key={n}>{n}</li>)}</ul>}
      <div className="dc-table-wrap"><table className="dc-table"><thead><tr><th>Satır</th><th>Optikteki ad / no</th><th>Öğrenci</th><th>Durum</th><th className="r">D / Y / B</th></tr></thead>
        <tbody>{(batch.records || []).map((r: any) => <tr key={r.id}><td className="num">{r.row_no}</td><td><b>{r.display_name || 'Ad okunamadı'}</b><small>No {r.student_number || '—'}</small></td><td>{r.student_name && r.status !== 'SET_ASIDE' ? r.student_name : <span className="dc-muted">—</span>}</td><td>{status(r)}{r.reason && <small className="dc-warn">{r.reason}</small>}</td><td className="r num">{r.status === 'SCORED' ? `${r.correct} / ${r.wrong} / ${r.blank}` : ''}</td></tr>)}</tbody></table></div>
      <div className="rm-tools foy-actions">
        {batch.counts.ready > 0 && <button type="button" className="rm-primary" disabled={busy} onClick={() => void evaluate()}>{busy ? (progress || 'Değerlendiriliyor…') : `Değerlendir (${batch.counts.ready} öğrenci)`}</button>}
        {batch.batch.status !== 'COMMITTED' && !batch.counts.scored && <button type="button" className="dc-btn" disabled={busy} onClick={() => void remove()}>Yüklemeyi sil</button>}
        {batch.batch.status === 'COMMITTED' && <p className="rm-note">Değerlendirme tamamlandı. Sonuçlar öğrencinin ve öğretmenin föy raporunda görünür.</p>}
      </div>
    </section>}

    <section className="rm-card" aria-labelledby="foy-hist"><div className="rm-card-head"><h2 id="foy-hist">Föy yüklemeleri</h2></div>
      <div className="dc-table-wrap"><table className="dc-table"><thead><tr><th>Föy</th><th>Kurum</th><th>Yükleme</th><th className="r">Değerlendirilen</th><th className="r">Kenarda</th><th></th></tr></thead>
        <tbody>{history.map((b) => <tr key={b.id}><td><b>{b.worksheet_title}</b><small>{b.academic_year}</small></td><td>{b.institution_name}</td><td className="dc-muted">{when(b.created_at)}<small>{b.file_name}</small></td><td className="r num">{b.scored}</td><td className="r num">{b.set_aside}</td><td className="r"><button type="button" className="dc-btn dc-main" onClick={() => void open(b.id)}>{b.status === 'COMMITTED' ? 'Aç' : 'Devam et'}</button></td></tr>)}</tbody></table>
        {!history.length && <p className="rm-empty">Henüz föy yüklemesi yok.</p>}</div></section>
  </div>;
}
