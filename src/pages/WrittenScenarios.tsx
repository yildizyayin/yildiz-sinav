import { useEffect, useState } from 'react';
import { Archive, CheckCircle2, FileText, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { api, qs } from '../api';
import { useAuth } from '../auth';

/** A037: common written exam distribution tables (ortak yazılı konu–soru dağılım tabloları). */
type Row = { unit: string; topic: string; outcomeCode: string; questionCount: number };
type Scenario = { label: string; rows: Row[] };
export const AUTHORITY_LABEL: Record<string, string> = { ODSGM: 'ÖDSGM (ülke geneli)', IL_ZUMRE: 'İl zümresi', OKUL_ZUMRE: 'Okul zümresi' };
export const STATUS_LABEL: Record<string, string> = { DRAFT: 'Taslak — resmî değil', VERIFIED: 'Resmî kaynakla doğrulandı', ZUMRE: 'Okul zümresi kararı', ARCHIVED: 'Arşivde' };
const emptyRow = (): Row => ({ unit: '', topic: '', outcomeCode: '', questionCount: 1 });
const thisYear = () => { const d = new Date(); const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${y + 1}`; };

export function WrittenScenarios() {
  const { user } = useAuth();
  const admin = user?.role === 'SUPER_ADMIN';
  const manager = user?.role === 'INSTITUTION_MANAGER';
  const [year, setYear] = useState(thisYear());
  const [archived, setArchived] = useState(false);
  const [tables, setTables] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [open, setOpen] = useState<any>(null);
  const [form, setForm] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => { try { setTables((await api<any>(`/api/written-scenarios${qs({ academicYear: year, archived: archived ? '1' : '' })}`)).tables || []); } catch (e: any) { setError(e.message); } };
  useEffect(() => { void load(); }, [year, archived]);
  useEffect(() => { api<any>('/api/written-scenarios/subjects').then((r) => setSubjects(r.subjects || [])).catch(() => {}); }, []);

  const show = async (id: string) => { setError(''); try { setOpen(await api<any>(`/api/written-scenarios/${encodeURIComponent(id)}`)); } catch (e: any) { setError(e.message); } };
  const startNew = () => setForm({ id: null, academicYear: year, term: 1, examNo: 1, gradeLevel: 8, subjectId: subjects[0]?.id || '', authority: admin ? 'ODSGM' : 'OKUL_ZUMRE', province: '', sourceTitle: '', sourceUrl: '', sourceAcademicYear: year, sourcePublishedAt: '', scenarios: [{ label: '1. Senaryo', rows: [emptyRow()] }] as Scenario[] });
  const startEdit = () => { const t = open.table; setForm({ id: t.id, academicYear: t.academic_year, term: t.term, examNo: t.exam_no, gradeLevel: t.grade_level, subjectId: t.subject_id, authority: t.authority, province: t.province || '', sourceTitle: t.source_title, sourceUrl: t.source_url || '', sourceAcademicYear: t.source_academic_year || '', sourcePublishedAt: t.source_published_at || '', scenarios: t.scenarios.map((s: any) => ({ label: s.label, rows: s.rows.map((r: any) => ({ unit: r.unit || '', topic: r.topic || '', outcomeCode: r.outcome_code || '', questionCount: r.question_count })) })) }); };
  const act = async (fn: () => Promise<any>, ok: string) => { setBusy(true); setError(''); setNotice(''); try { const r = await fn(); setNotice(ok); await load(); return r; } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  const save = async () => {
    const body = { ...form, province: form.province || null, sourceUrl: form.sourceUrl || null, sourceAcademicYear: form.sourceAcademicYear || null, sourcePublishedAt: form.sourcePublishedAt || null };
    const r = await act(() => api<any>(form.id ? `/api/written-scenarios/${encodeURIComponent(form.id)}` : '/api/written-scenarios', { method: form.id ? 'PUT' : 'POST', body: JSON.stringify(body) }), 'Tablo kaydedildi.');
    if (r?.id) { setForm(null); await show(r.id); if (r.blockers?.length && admin && form.authority !== 'OKUL_ZUMRE') setNotice(`Tablo kaydedildi; resmî doğrulama için eksikler: ${r.blockers.join(' ')}`); }
  };
  const setScenario = (i: number, s: Scenario) => setForm({ ...form, scenarios: form.scenarios.map((x: Scenario, k: number) => (k === i ? s : x)) });

  return <>
    <div className="page-head"><div><span className="eyebrow">Ortak Yazılı Sınavlar</span><h1>Konu–Soru Dağılım Senaryoları</h1><p>ÖDSGM ve il zümresi tabloları yalnız aynı eğitim yılına ait MEB belgesiyle resmî olarak doğrulanır. Okul zümresi senaryosunu seçer; okulun kendi zümre tablosu resmî sayılmaz.</p></div>
      <div style={{ display: 'flex', gap: 8 }}><button className="ghost" onClick={() => void load()}><RefreshCw size={16} /> Yenile</button>{(admin || manager) && <button className="primary" onClick={startNew}><Plus size={16} /> {admin ? 'Tablo gir' : 'Zümre tablosu gir'}</button>}</div></div>
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert success">{notice}</div>}
    <div className="toolbar" style={{ display: 'flex', gap: 12, alignItems: 'end', marginBottom: 12 }}>
      <label>Eğitim yılı<input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2027-2028" /></label>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Arşiv</label>
    </div>
    <div className="table-card"><table><thead><tr><th>Sınıf / Ders</th><th>Dönem / Sınav</th><th>Hazırlayan</th><th>Kaynak</th><th>Durum</th><th>Senaryo</th><th></th></tr></thead><tbody>
      {tables.map((t) => <tr key={t.id}><td>{t.grade_level}. sınıf · {t.subject_name}</td><td>{t.term}. dönem · {t.exam_no}. sınav</td><td>{AUTHORITY_LABEL[t.authority]}{t.province ? ` · ${t.province}` : ''}</td><td><small>{t.source_title}{t.source_academic_year ? ` (${t.source_academic_year})` : ''}</small></td>
        <td><span className={`status ${t.status === 'VERIFIED' ? 'ok' : 'warn'}`}>{STATUS_LABEL[t.status]}</span></td><td>{t.scenario_count}{t.chosen_scenario_id ? ' · seçildi' : ''}</td><td><button className="ghost" onClick={() => void show(t.id)}>Aç</button></td></tr>)}
    </tbody></table>{!tables.length && <div className="empty">Bu yıl için tablo yok. {year} belgesi yayımlanmadan resmî tablo doğrulanamaz.</div>}</div>

    {open && !form && <div className="panel" style={{ marginTop: 20 }}>
      <div className="panel-head"><div><h2>{open.table.grade_level}. sınıf {open.table.subject_name} · {open.table.term}. dönem {open.table.exam_no}. sınav</h2>
        <p>{AUTHORITY_LABEL[open.table.authority]}{open.table.province ? ` · ${open.table.province}` : ''} · {open.table.academic_year} · <strong>{STATUS_LABEL[open.table.status]}</strong></p>
        <p><FileText size={14} /> {open.table.source_url ? <a href={open.table.source_url} target="_blank" rel="noreferrer">{open.table.source_title}</a> : open.table.source_title}{open.table.source_academic_year ? ` · kaynak yılı ${open.table.source_academic_year}` : ''}</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['DRAFT', 'ZUMRE'].includes(open.table.status) && (admin || (manager && open.table.authority === 'OKUL_ZUMRE')) && <button className="ghost" disabled={busy} onClick={startEdit}>Düzenle</button>}
          {admin && open.table.status === 'DRAFT' && <button className="primary" disabled={busy || open.blockers.length > 0} onClick={async () => { if (confirm('Bu tablonun belirtilen resmî MEB belgesiyle birebir aynı olduğunu doğruluyor musunuz? Doğrulanan tablo değiştirilemez.')) { await act(() => api(`/api/written-scenarios/${open.table.id}/verify`, { method: 'POST', body: '{}' }), 'Tablo resmî olarak doğrulandı.'); await show(open.table.id); } }}><ShieldCheck size={16} /> Resmî olarak doğrula</button>}
          {open.table.status !== 'ARCHIVED' && (admin || (manager && open.table.authority === 'OKUL_ZUMRE')) && <button className="ghost" disabled={busy} onClick={async () => { if (confirm('Tablo arşive alınsın mı?')) { await act(() => api(`/api/written-scenarios/${open.table.id}/archive`, { method: 'POST', body: '{}' }), 'Tablo arşive alındı.'); setOpen(null); } }}><Archive size={16} /> Arşivle</button>}
        </div></div>
      {open.blockers?.length > 0 && <div className="alert warn"><strong>Resmî doğrulama kapalı:</strong><ul>{open.blockers.map((b: string) => <li key={b}>{b}</li>)}</ul></div>}
      {open.table.scenarios.map((s: any) => <div key={s.id} className="panel" style={{ marginTop: 12, borderColor: open.choice?.scenario_id === s.id ? '#16a34a' : undefined }}>
        <div className="panel-head"><div><h3>{s.label} · {s.total} soru</h3>{open.choice?.scenario_id === s.id && <p><CheckCircle2 size={14} /> Okulunuzun zümre seçimi</p>}</div>
          {manager && ['VERIFIED', 'ZUMRE'].includes(open.table.status) && open.choice?.scenario_id !== s.id && <button className="primary" disabled={busy} onClick={async () => { const note = prompt('Zümre kararı notu (isteğe bağlı):') ?? ''; await act(() => api(`/api/written-scenarios/${open.table.id}/choice`, { method: 'POST', body: JSON.stringify({ scenarioId: s.id, note }) }), `${s.label} okul senaryosu olarak seçildi.`); await show(open.table.id); }}>Bu senaryoyu seç</button>}</div>
        <table><thead><tr><th>Ünite / Tema</th><th>Konu</th><th>Kazanım / Öğrenme çıktısı</th><th>Soru</th></tr></thead><tbody>{s.rows.map((r: any) => <tr key={r.id}><td>{r.unit || '—'}</td><td>{r.topic || '—'}</td><td>{r.outcome_code || '—'}{r.outcome_code && !r.outcome_id ? <span className="status warn"> programda yok</span> : null}</td><td>{r.question_count}</td></tr>)}</tbody></table>
      </div>)}
    </div>}

    {form && <div className="panel" style={{ marginTop: 20 }}>
      <div className="panel-head"><div><h2>{form.id ? 'Tabloyu düzenle' : 'Yeni dağılım tablosu'}</h2><p>Satırları resmî belgeden birebir girin. Sistem eksik kazanım veya soru sayısı uydurmaz.</p></div></div>
      <div className="form-grid">
        <label>Eğitim yılı<input value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} /></label>
        <label>Dönem<select value={form.term} onChange={(e) => setForm({ ...form, term: Number(e.target.value) })}><option value={1}>1. dönem</option><option value={2}>2. dönem</option></select></label>
        <label>Sınav<select value={form.examNo} onChange={(e) => setForm({ ...form, examNo: Number(e.target.value) })}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}. sınav</option>)}</select></label>
        <label>Sınıf<input type="number" min={1} max={12} value={form.gradeLevel} onChange={(e) => setForm({ ...form, gradeLevel: Number(e.target.value) })} /></label>
        <label>Ders<select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        {admin && !form.id && <label>Hazırlayan<select value={form.authority} onChange={(e) => setForm({ ...form, authority: e.target.value })}><option value="ODSGM">ÖDSGM (ülke geneli)</option><option value="IL_ZUMRE">İl zümresi</option></select></label>}
        {form.authority === 'IL_ZUMRE' && <label>İl<input value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} /></label>}
        <label>Kaynak belge adı<input value={form.sourceTitle} onChange={(e) => setForm({ ...form, sourceTitle: e.target.value })} placeholder={manager ? 'Örn. Zümre toplantı tutanağı' : 'MEB duyurusunun adı'} /></label>
        <label>Kaynak bağlantısı<input value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} placeholder="https://www.meb.gov.tr/..." /></label>
        <label>Kaynağın eğitim yılı<input value={form.sourceAcademicYear} onChange={(e) => setForm({ ...form, sourceAcademicYear: e.target.value })} /></label>
        <label>Yayın tarihi<input type="date" value={form.sourcePublishedAt} onChange={(e) => setForm({ ...form, sourcePublishedAt: e.target.value })} /></label>
      </div>
      {form.scenarios.map((s: Scenario, i: number) => <div key={i} className="panel" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}><label>Senaryo adı<input value={s.label} onChange={(e) => setScenario(i, { ...s, label: e.target.value })} /></label><strong>Toplam: {s.rows.reduce((t, r) => t + (Number(r.questionCount) || 0), 0)} soru</strong>
          {form.scenarios.length > 1 && <button className="ghost" onClick={() => setForm({ ...form, scenarios: form.scenarios.filter((_: Scenario, k: number) => k !== i) })}><Trash2 size={14} /> Senaryoyu sil</button>}</div>
        <table><thead><tr><th>Ünite / Tema</th><th>Konu</th><th>Kazanım kodu</th><th>Soru</th><th></th></tr></thead><tbody>{s.rows.map((r, k) => {
          const setRow = (patch: Partial<Row>) => setScenario(i, { ...s, rows: s.rows.map((x, j) => (j === k ? { ...x, ...patch } : x)) });
          return <tr key={k}><td><input value={r.unit} onChange={(e) => setRow({ unit: e.target.value })} /></td><td><input value={r.topic} onChange={(e) => setRow({ topic: e.target.value })} /></td><td><input value={r.outcomeCode} onChange={(e) => setRow({ outcomeCode: e.target.value })} /></td>
            <td><input type="number" min={1} max={20} value={r.questionCount} onChange={(e) => setRow({ questionCount: Number(e.target.value) })} style={{ width: 70 }} /></td><td>{s.rows.length > 1 && <button className="ghost" onClick={() => setScenario(i, { ...s, rows: s.rows.filter((_, j) => j !== k) })}><Trash2 size={14} /></button>}</td></tr>;
        })}</tbody></table>
        <button className="ghost" onClick={() => setScenario(i, { ...s, rows: [...s.rows, emptyRow()] })}><Plus size={14} /> Satır ekle</button>
      </div>)}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="ghost" onClick={() => setForm({ ...form, scenarios: [...form.scenarios, { label: `${form.scenarios.length + 1}. Senaryo`, rows: [emptyRow()] }] })}><Plus size={14} /> Senaryo ekle</button>
        <button className="ghost" onClick={() => setForm(null)}>Vazgeç</button>
        <button className="primary" disabled={busy} onClick={() => void save()}>Kaydet</button>
      </div>
    </div>}
  </>;
}
