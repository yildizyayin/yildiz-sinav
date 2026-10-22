import { useEffect, useState } from 'react';
import { CheckCircle2, FileText, Plus, RefreshCw, Trash2, Wand2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';

/** A040: written exam paper from the school's chosen scenario; answer key; finalisation pins rubrics. */
type Item = { scenarioRowId: string; source: 'BANK' | 'ZUMRE'; questionId?: string; stemText?: string; modelAnswer?: string; rubric?: any; label?: string; points?: number };
const STATUS: Record<string, string> = { DRAFT: 'Taslak', FINAL: 'Kesinleşti', ARCHIVED: 'Arşivde' };
const fromServer = (i: any): Item => i.source === 'BANK' ? { scenarioRowId: i.scenario_row_id, source: 'BANK', questionId: i.question_id, label: (i.stem_text || '').slice(0, 140), points: i.points } : { scenarioRowId: i.scenario_row_id, source: 'ZUMRE', stemText: i.zumre_stem, modelAnswer: i.zumre_model_answer, rubric: i.zumre_rubric, points: i.points };
const zumreRubric = (total: number) => ({ totalPoints: total, criteria: [{ criterion: 'Cevabın doğruluğu ve tamlığı', points: total }], alternatives: [] });

export function WrittenPapers() {
  const { user } = useAuth();
  const [papers, setPapers] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [newPaper, setNewPaper] = useState({ tableId: '', title: '', classLabel: '', examDate: '' });
  const [open, setOpen] = useState<any>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const load = async () => { try { setPapers((await api<any>('/api/written-papers')).papers || []); setTables(((await api<any>('/api/written-scenarios')).tables || []).filter((t: any) => t.chosen_scenario_id && ['VERIFIED', 'ZUMRE'].includes(t.status))); } catch (e: any) { setError(e.message); } };
  useEffect(() => { void load(); }, []);
  const show = async (id: string) => { setError(''); try { const r = await api<any>(`/api/written-papers/${id}`); setOpen(r); setItems(r.items.map(fromServer)); } catch (e: any) { setError(e.message); } };
  const act = async (fn: () => Promise<any>, ok: string, reopen = true) => { setBusy(true); setError(''); setNotice(''); try { const r = await fn(); setNotice(ok); if (reopen && open) await show(open.paper.id); await load(); return r; } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  const save = () => act(() => api(`/api/written-papers/${open.paper.id}/items`, { method: 'PUT', body: JSON.stringify({ items }) }), 'Kâğıt kaydedildi.');
  const draft = open?.paper.status === 'DRAFT';
  const total = items.reduce((t, i) => t + (Number(i.source === 'ZUMRE' ? i.rubric?.totalPoints : i.points) || 0), 0);

  return <>
    <div className="page-head"><div><span className="eyebrow">Yazılı Sınavlar</span><h1>Yazılı Sınav Kâğıtları</h1><p>Kâğıt, okulunuzun zümre kararıyla seçtiği senaryoya göre dağıtılır. Her soru onaylı rubrikle gelir; uygulanan kapsamlarda 2 soruyu zümre yazar. Kâğıt ve anahtar kesinleştirildikten sonra basılır ve değiştirilemez.</p></div><button className="ghost" onClick={() => void load()}><RefreshCw size={16} /> Yenile</button></div>
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert success">{notice}</div>}
    {user?.role !== 'SUPER_ADMIN' && <div className="panel"><div className="form-grid">
      <label>Dağılım tablosu (senaryosu seçilmiş)<select value={newPaper.tableId} onChange={(e) => setNewPaper({ ...newPaper, tableId: e.target.value })}><option value="">Seçin</option>{tables.map((t) => <option key={t.id} value={t.id}>{t.academic_year} · {t.grade_level}. sınıf {t.subject_name} · {t.term}. dönem {t.exam_no}. sınav</option>)}</select></label>
      <label>Başlık<input value={newPaper.title} onChange={(e) => setNewPaper({ ...newPaper, title: e.target.value })} placeholder="8-A Türkçe 1. yazılı" /></label>
      <label>Sınıf<input value={newPaper.classLabel} onChange={(e) => setNewPaper({ ...newPaper, classLabel: e.target.value })} /></label>
      <label>Tarih<input type="date" value={newPaper.examDate} onChange={(e) => setNewPaper({ ...newPaper, examDate: e.target.value })} /></label>
    </div><button className="primary" disabled={busy || !newPaper.tableId || !newPaper.title} onClick={async () => { const r = await act(() => api<any>('/api/written-papers', { method: 'POST', body: JSON.stringify(newPaper) }), 'Kâğıt oluşturuldu.', false); if (r?.id) await show(r.id); }}><Plus size={16} /> Kâğıt oluştur</button></div>}
    <div className="table-card" style={{ marginTop: 16 }}><table><thead><tr><th>Kâğıt</th><th>Sınıf / ders</th><th>Soru</th><th>Durum</th><th></th></tr></thead><tbody>
      {papers.map((p) => <tr key={p.id}><td>{p.title}{p.class_label ? ` · ${p.class_label}` : ''}</td><td>{p.grade_level}. sınıf {p.subject_name} · {p.academic_year}</td><td>{p.item_count}</td><td>{STATUS[p.status]}{p.total_points ? ` · ${p.total_points} puan` : ''}</td><td><button className="ghost" onClick={() => void show(p.id)}>Aç</button></td></tr>)}
    </tbody></table>{!papers.length && <div className="empty">Henüz yazılı kâğıdı yok.</div>}</div>

    {open && <div className="panel" style={{ marginTop: 20 }}>
      <div className="panel-head"><div><h2>{open.paper.title} · {STATUS[open.paper.status]}</h2><p>{open.paper.grade_level}. sınıf {open.paper.subject_name} · {open.paper.scenario_label} · {open.paper.zumreRuleText}</p>
        <p className={total === 100 ? 'status ok' : 'status warn'}>Toplam: {total} / 100</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          {draft && <button className="ghost" disabled={busy} onClick={() => void act(() => api(`/api/written-papers/${open.paper.id}/autofill`, { method: 'POST', body: '{}' }), 'Boş yerler onaylı sorularla dolduruldu.')}><Wand2 size={16} /> Otomatik doldur</button>}
          {draft && <button className="primary" disabled={busy || open.blockers.length > 0} onClick={() => { if (confirm('Soruları, dağılımı, puanları ve anahtarı kontrol ettiniz mi? Kesinleşen kâğıt değiştirilemez.')) void act(() => api(`/api/written-papers/${open.paper.id}/finalize`, { method: 'POST', body: JSON.stringify({ confirm: true }) }), 'Kâğıt kesinleşti.'); }}><CheckCircle2 size={16} /> Kesinleştir</button>}
          {open.paper.status === 'FINAL' && <><a className="ghost" href={`/api/written-papers/${open.paper.id}/paper`} target="_blank" rel="noreferrer"><FileText size={16} /> Kâğıt</a><a className="ghost" href={`/api/written-papers/${open.paper.id}/key`} target="_blank" rel="noreferrer"><FileText size={16} /> Cevap anahtarı</a></>}
        </div></div>
      {open.blockers.length > 0 && <div className="alert warn"><strong>Kesinleştirmeden önce:</strong><ul>{open.blockers.map((b: string) => <li key={b}>{b}</li>)}</ul></div>}
      {open.warnings.length > 0 && <div className="alert info">{open.warnings.join(' ')}</div>}
      {open.rows.map((row: any) => {
        const own = items.map((it, k) => ({ it, k })).filter((x) => x.it.scenarioRowId === row.id);
        return <div key={row.id} className="panel" style={{ marginTop: 12 }}>
          <h3>{row.unit || '—'} · {row.topic || '—'}{row.outcome_code ? ` · ${row.outcome_code}` : ''} — {own.length}/{row.question_count} soru</h3>
          {own.map(({ it, k }) => <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'start', marginTop: 6 }}>
            {it.source === 'BANK' ? <span style={{ flex: 1 }}>{it.label} <small>({it.points} puan)</small></span> : <div style={{ flex: 1 }}><textarea disabled={!draft} value={it.stemText || ''} placeholder="Zümre sorusu" onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, stemText: e.target.value } : x)))} /><textarea disabled={!draft} value={it.modelAnswer || ''} placeholder="Model cevap" onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, modelAnswer: e.target.value } : x)))} /><label>Puan<input type="number" disabled={!draft} min={1} max={100} value={it.rubric?.totalPoints || 0} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, rubric: zumreRubric(Number(e.target.value)) } : x)))} /></label><small> Zümre sorusu</small></div>}
            {draft && <button className="ghost" onClick={() => setItems(items.filter((_, j) => j !== k))}><Trash2 size={14} /></button>}
          </div>)}
          {draft && own.length < row.question_count && <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <select defaultValue="" onChange={(e) => { const c = row.candidates.find((x: any) => x.id === e.target.value); if (c) setItems([...items, { scenarioRowId: row.id, source: 'BANK', questionId: c.id, label: c.stem, points: c.points }]); e.target.value = ''; }}><option value="">Onaylı sorudan ekle…</option>{row.candidates.filter((c: any) => !items.some((i) => i.questionId === c.id)).map((c: any) => <option key={c.id} value={c.id}>{c.points} p · {c.stem}</option>)}</select>
            <button className="ghost" onClick={() => setItems([...items, { scenarioRowId: row.id, source: 'ZUMRE', stemText: '', modelAnswer: '', rubric: zumreRubric(10) }])}><Plus size={14} /> Zümre sorusu</button>
          </div>}
        </div>;
      })}
      {draft && <button className="primary" style={{ marginTop: 12 }} disabled={busy} onClick={() => void save()}>Kâğıdı kaydet</button>}
    </div>}
  </>;
}
