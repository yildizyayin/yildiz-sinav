import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../../api';
import { properCase } from './labels';
import './guidance.css';

/**
 * Rehberlik R3 — ölçme araçları (owner, 12 Nov 2026): the student's form for every item type, the anonymous survey
 * inbox (students, parents, teachers), the guidance teacher's tools panel and the Super Admin's review of new tools.
 */

const LIKERT = ['Hiç', 'Nadiren', 'Bazen', 'Çoğu zaman', 'Her zaman'];

// ------------------------------------------------------------------ one form, every item type
export function TestItemsForm({ schema, classmates, value, onChange }: { schema: any; classmates?: any[]; value: Record<string, any>; onChange: (v: Record<string, any>) => void }) {
  const set = (id: string, v: any) => onChange({ ...value, [id]: v });
  const min = Number(schema?.scale?.min || 1), max = Number(schema?.scale?.max || 5);
  const labels: string[] = schema?.scale?.labels || LIKERT;
  return <ol className="gt-items">{(schema?.items || []).map((it: any) => {
    const type = it.type || 'LIKERT';
    return <li key={it.id} className="gt-item"><p>{it.text}{it.optional ? <small> (isteğe bağlı)</small> : null}</p>
      {type === 'LIKERT' && <div className="gt-scale" role="radiogroup">{Array.from({ length: max - min + 1 }, (_, k) => min + k).map((n, k) => <label key={n} className={value[it.id] === n ? 'on' : ''}><input type="radio" name={it.id} checked={value[it.id] === n} onChange={() => set(it.id, n)} /><span>{labels[k] || n}</span></label>)}</div>}
      {type === 'YESNO' && <div className="gt-scale two">{[['YES', 'Evet'], ['NO', 'Hayır']].map(([k, l]) => <label key={k} className={value[it.id] === k ? 'on' : ''}><input type="radio" name={it.id} checked={value[it.id] === k} onChange={() => set(it.id, k)} /><span>{l}</span></label>)}</div>}
      {type === 'AB' && <div className="gt-ab">{(['A', 'B'] as const).map((k) => <label key={k} className={value[it.id] === k ? 'on' : ''}><input type="radio" name={it.id} checked={value[it.id] === k} onChange={() => set(it.id, k)} /><span>{(k === 'A' ? it.a : it.b)?.text || k}</span></label>)}</div>}
      {type === 'CHOICE' && <div className="gt-scale">{(it.options || []).map((o: any) => <label key={o.id} className={value[it.id] === o.id ? 'on' : ''}><input type="radio" name={it.id} checked={value[it.id] === o.id} onChange={() => set(it.id, o.id)} /><span>{o.text}</span></label>)}</div>}
      {type === 'TEXT' && <textarea value={value[it.id] || ''} maxLength={1000} onChange={(e) => set(it.id, e.target.value)} />}
      {type === 'PEER' && <div className="gd-pick">{(classmates || []).map((c: any) => { const list: string[] = value[it.id] || []; const on = list.includes(c.id); return <label key={c.id}><input type="checkbox" checked={on} disabled={!on && list.length >= Number(it.max || 3)} onChange={() => set(it.id, on ? list.filter((x) => x !== c.id) : [...list, c.id])} />{properCase(c.name)}</label>; })}<small className="gd-note">En fazla {it.max || 3} kişi</small></div>}
    </li>;
  })}</ol>;
}
export function formComplete(schema: any, value: Record<string, any>) {
  return (schema?.items || []).every((it: any) => it.optional || (it.type === 'TEXT' ? String(value[it.id] || '').trim() : it.type === 'PEER' ? (value[it.id] || []).length : value[it.id] !== undefined));
}
export function toApiResponses(schema: any, value: Record<string, any>) {
  return Object.fromEntries((schema?.items || []).filter((it: any) => value[it.id] !== undefined).map((it: any) => [it.id, it.type === 'YESNO' ? value[it.id] === 'YES' : value[it.id]]));
}

// ------------------------------------------------------------------ anonymous surveys inbox
export function SurveyInbox() {
  const [rows, setRows] = useState<any[] | null>(null); const [open, setOpen] = useState<string | null>(null); const [answers, setAnswers] = useState<Record<string, any>>({}); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const load = () => api<any>('/api/guidance-tools/my-surveys').then((r) => setRows(r.surveys || [])).catch(() => setRows([]));
  useEffect(() => { void load(); }, []);
  if (!rows?.length) return notice ? <div className="alert success">{notice}</div> : null;
  const send = async (s: any) => { setError(''); try { await api(`/api/guidance-tools/my-surveys/${encodeURIComponent(s.inviteId)}`, { method: 'POST', body: JSON.stringify({ answers }) }); setNotice('Yanıtların isimsiz olarak kaydedildi. Teşekkürler!'); setOpen(null); setAnswers({}); await load(); } catch (e: any) { setError(e.message); } };
  return <section className="gd-card"><h2>Rehberlik anketleri <small>isimsiz</small></h2>{notice && <div className="alert success">{notice}</div>}{error && <div className="alert error">{error}</div>}
    <ul className="gd-list">{rows.map((s) => <li key={s.inviteId} className="gd-item"><div className="row"><strong>{s.title}</strong><small>{s.formTitle}</small></div>
      <small>Yanıtların adınla eşleştirilmez; okul yalnız toplu sonuçları görür.</small>
      {open === s.inviteId ? <>
        {s.kind === 'RIBA' ? <ol className="gt-items">{s.items.map((it: any) => <li key={it.id} className="gt-item"><p>{it.text}</p><div className="gt-scale two">{['A', 'B'].map((k) => <label key={k} className={answers[it.id] === k ? 'on' : ''}><input type="radio" name={it.id} checked={answers[it.id] === k} onChange={() => setAnswers({ ...answers, [it.id]: k })} /><span>{s.answerLabels?.[k] || k}</span></label>)}</div></li>)}</ol>
          : <TestItemsForm schema={{ scale: s.scale, items: s.items }} value={answers} onChange={setAnswers} />}
        <div className="gd-actions"><button type="button" className="primary" disabled={s.items.some((it: any) => answers[it.id] === undefined)} onClick={() => send(s)}>Gönder</button></div></>
        : <div className="gd-actions"><button type="button" className="primary" onClick={() => { setOpen(s.inviteId); setAnswers({}); }}>Yanıtla</button></div>}
    </li>)}</ul></section>;
}

// ------------------------------------------------------------------ guidance teacher: tools panel
export function GuidanceToolsPanel() {
  const [tab, setTab] = useState('apply');
  const [cat, setCat] = useState<any>(null); const [classes, setClasses] = useState<any[]>([]);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const load = () => Promise.all([api<any>('/api/guidance-tools/catalog'), api<any>('/api/guidance-center/students')]).then(([c, s]) => {
    setCat(c); const m = new Map<string, any>(); for (const st of s.students || []) if (st.classId) m.set(st.classId, { id: st.classId, name: st.className }); setClasses([...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr')));
  }).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, []);
  const active = (cat?.instruments || []).filter((i: any) => i.active);
  return <section className="gd gd-card" style={{ marginBottom: 16 }}>
    <h2>Ölçme araçları</h2>
    <div className="gd-tabs">{[['apply', 'Sınıfa uygula'], ['report', 'Sınıf raporu'], ['surveys', 'Anketler (RİBA, okul iklimi)'], ['draft', 'Kendi aracım']].map(([k, v]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setNotice(''); setError(''); }}>{v}</button>)}</div>
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert success" role="status">{notice}</div>}
    {tab === 'apply' && <ApplyTab tools={active} classes={classes} drafts={(cat?.instruments || []).filter((i: any) => !i.active)} onDone={(m) => setNotice(m)} onError={setError} />}
    {tab === 'report' && <ReportTab tools={active} classes={classes} />}
    {tab === 'surveys' && <SurveysTab templates={cat?.templates || []} onError={setError} />}
    {tab === 'draft' && <DraftTab onDone={() => { setNotice('Aracınız Süper Admin onayına gönderildi. Onaylanınca “Sınıfa uygula” listesinde görünür.'); void load(); }} onError={setError} />}
  </section>;
}

function ApplyTab({ tools, classes, drafts, onDone, onError }: { tools: any[]; classes: any[]; drafts: any[]; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [code, setCode] = useState(''); const [classId, setClassId] = useState(''); const [busy, setBusy] = useState(false);
  const chosen = tools.find((t) => t.code === code);
  const go = async () => { setBusy(true); try { const r = await api<any>('/api/guidance-tools/assign', { method: 'POST', body: JSON.stringify({ instrumentCode: code, classId }) }); onDone(`${r.opened} öğrenciye açıldı.${r.reused ? ` ${r.reused} öğrencide zaten açıktı.` : ''}${r.skippedGrade ? ` ${r.skippedGrade} öğrenci sınıf düzeyi uymadığı için atlandı.` : ''}`); } catch (e: any) { onError(e.message); } finally { setBusy(false); } };
  return <div className="gd-form">
    <div className="two"><label>Araç<select value={code} onChange={(e) => setCode(e.target.value)}><option value="">Seçin</option>{tools.map((t) => <option key={t.code} value={t.code}>{t.title}{t.grade_min ? ` (${t.grade_min}–${t.grade_max}. sınıf)` : ''}</option>)}</select></label>
      <label>Sınıf<select value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Seçin</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>
    {chosen && <p className="gd-note">{chosen.description} · {chosen.itemCount} madde</p>}
    <div className="gd-actions"><button className="primary" type="button" disabled={!code || !classId || busy} onClick={go}>Sınıfa aç</button></div>
    {drafts.length > 0 && <><h3 style={{ margin: '8px 0 0', fontSize: 15 }}>Onay bekleyenler</h3><ul className="gd-list">{drafts.map((d) => <li key={d.code} className="gd-item"><div className="row"><strong>{d.title}</strong><span className={`gd-chip ${d.review_status === 'REJECTED' ? 'high' : 'medium'}`}>{d.review_status === 'REJECTED' ? 'Reddedildi' : 'Uzman onayında'}</span></div>{d.review_note && <small>Not: {d.review_note}</small>}</li>)}</ul></>}
  </div>;
}

function ReportTab({ tools, classes }: { tools: any[]; classes: any[] }) {
  const [code, setCode] = useState(''); const [classId, setClassId] = useState(''); const [rep, setRep] = useState<any>(null); const [error, setError] = useState('');
  useEffect(() => { setRep(null); if (code && classId) api<any>(`/api/guidance-tools/report?instrumentCode=${encodeURIComponent(code)}&classId=${encodeURIComponent(classId)}`).then(setRep).catch((e) => setError(e.message)); }, [code, classId]);
  const dims = useMemo(() => (rep?.averages || []).map((a: any) => a.dimension), [rep]);
  return <div className="gd-form">
    <div className="two"><label>Araç<select value={code} onChange={(e) => setCode(e.target.value)}><option value="">Seçin</option>{tools.map((t) => <option key={t.code} value={t.code}>{t.title}</option>)}</select></label>
      <label>Sınıf<select value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Seçin</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>
    {error && <div className="alert error">{error}</div>}
    {rep && <>
      <p className="gd-note">{rep.answered} / {rep.total} öğrenci yanıtladı. {rep.note}</p>
      {rep.averages.length > 0 && <div className="gd-stats">{rep.averages.map((a: any) => <div key={a.dimension} className="gd-stat"><strong>{Math.round(a.average)}</strong><span>{a.dimension.replaceAll('_', ' ')}{a.low ? ` · ${a.low} öğrenci 40’ın altında` : ''}</span></div>)}</div>}
      {rep.sociogram && <div className="gd-card"><h3 style={{ margin: 0 }}>Sınıf ilişkileri</h3><p className="gd-note">{rep.sociogram.note}</p>
        <p><b>En çok seçilenler:</b> {rep.sociogram.received.filter((r: any) => r.count).slice(0, 5).map((r: any) => `${properCase(r.name)} (${r.count})`).join(', ') || '—'}</p>
        <p><b>Hiç seçilmeyenler:</b> {rep.sociogram.notChosen.length ? rep.sociogram.notChosen.map((r: any) => properCase(r.name)).join(', ') : rep.sociogram.answered < 5 ? 'Yanıt sayısı az olduğu için gösterilmiyor.' : 'Yok'}</p>
        <p><b>Karşılıklı seçimler:</b> {rep.sociogram.mutual.length ? rep.sociogram.mutual.map((m: any) => `${properCase(m[0])} – ${properCase(m[1])}`).join(' · ') : '—'}</p></div>}
      <div className="gd-scroll"><table className="gd-table"><thead><tr><th>Öğrenci</th><th>Durum</th>{dims.map((d: string) => <th key={d}>{d.replaceAll('_', ' ')}</th>)}</tr></thead><tbody>
        {rep.students.map((s: any) => <tr key={s.id}><td>{properCase(s.name)}</td><td>{s.status === 'REVIEWED' ? 'İncelendi' : s.status === 'SUBMITTED' ? 'Yanıtladı' : s.status ? 'Bekliyor' : '—'}</td>{dims.map((d: string) => <td key={d}>{s.dimensions?.[d] != null ? Math.round(s.dimensions[d]) : '—'}</td>)}</tr>)}
      </tbody></table></div></>}
  </div>;
}

function SurveysTab({ templates, onError }: { templates: any[]; onError: (m: string) => void }) {
  const [list, setList] = useState<any[]>([]); const [open, setOpen] = useState<any>(null); const [pct, setPct] = useState(30); const [tpl, setTpl] = useState('');
  const load = () => api<any>('/api/guidance-tools/surveys').then((r) => setList(r.surveys || [])).catch((e) => onError(e.message));
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = templates.filter((t) => t.active);
  const start = async () => { try { await api('/api/guidance-tools/surveys', { method: 'POST', body: JSON.stringify({ templateCode: tpl, samplePct: pct }) }); await load(); } catch (e: any) { onError(e.message); } };
  const show = async (id: string) => { try { setOpen(await api<any>(`/api/guidance-tools/surveys/${encodeURIComponent(id)}`)); } catch (e: any) { onError(e.message); } };
  const exportXlsx = () => {
    const wb = XLSX.utils.book_new();
    for (const f of open.forms) { if (!f.school) continue; const rows = open.survey.kind === 'RIBA' ? f.school.map((x: any) => ({ 'Sıra': x.rank, 'Madde No': x.no, 'Madde': x.text, 'A': x.a, 'B': x.b, 'A %': Math.round(x.aPct * 100) })) : f.school.map((x: any) => ({ 'Madde No': x.no, 'Madde': x.text, 'Alan': x.dimension, 'Yanıt': x.n, 'Ortalama': x.average, 'Puan (0–100)': x.score })); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), f.code.slice(0, 31)); }
    XLSX.writeFile(wb, `${open.survey.title.replace(/[^\p{L}\p{N} ]/gu, '')}.xlsx`);
  };
  return <div className="gd-form">
    {!ready.length && <div className="empty">Henüz onaylanmış anket şablonu yok. RİBA formları resmî MEB kaynağından teyit alındıktan sonra yüklenecek; okul iklimi anketi uzman onayında.</div>}
    {ready.length > 0 && <div className="two"><label>Anket<select value={tpl} onChange={(e) => setTpl(e.target.value)}><option value="">Seçin</option>{ready.map((t) => <option key={t.code} value={t.code}>{t.title}</option>)}</select></label>
      <label>Örneklem (%)<input type="number" min={5} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))} /></label></div>}
    {ready.length > 0 && <div className="gd-actions"><button className="primary" type="button" disabled={!tpl} onClick={start}>Anketi başlat</button></div>}
    <p className="gd-note">Her sınıftan seçilen örneklem davet edilir. Yanıtlar kişiyle eşleştirilmez; beşten az yanıtlı gruplar ayrı gösterilmez.</p>
    <ul className="gd-list">{list.map((s) => <li key={s.id} className="gd-item"><div className="row"><strong>{s.title}</strong><span className="gd-chip">{s.status === 'OPEN' ? 'Açık' : 'Kapandı'} · {s.responded}/{s.invited}</span></div>
      <div className="gd-actions"><button type="button" onClick={() => show(s.id)}>Sonuçlar</button>{s.status === 'OPEN' && <button type="button" onClick={async () => { await api(`/api/guidance-tools/surveys/${encodeURIComponent(s.id)}/close`, { method: 'POST', body: '{}' }); await load(); }}>Kapat</button>}</div></li>)}</ul>
    {open && <div className="gd-card"><h3 style={{ margin: 0 }}>{open.survey.title}</h3><p className="gd-note">{open.note}</p>
      <div className="gd-actions"><button type="button" onClick={exportXlsx}>Excel’e aktar</button></div>
      {open.forms.map((f: any) => <div key={f.code}><h4 style={{ margin: '10px 0 4px' }}>{f.title} · {f.responded}/{f.invited} yanıt</h4>
        {f.hidden ? <p className="gd-note">Gizlilik için en az {open.minGroup} yanıt gerekiyor.</p> : <div className="gd-scroll"><table className="gd-table"><tbody>{f.school.map((x: any) => <tr key={x.id}><td>{x.rank ? `${x.rank}.` : x.no}</td><td>{x.text}</td><td>{open.survey.kind === 'RIBA' ? `A ${x.a} · B ${x.b} · %${Math.round(x.aPct * 100)}` : `${x.average} · ${Math.round(x.score)}/100`}</td></tr>)}</tbody></table></div>}
      </div>)}</div>}
  </div>;
}

function DraftTab({ onDone, onError }: { onDone: () => void; onError: (m: string) => void }) {
  const [title, setTitle] = useState(''); const [description, setDescription] = useState('');
  const [items, setItems] = useState<any[]>([{ id: 'm1', type: 'LIKERT', text: '' }]);
  const upd = (k: number, patch: any) => setItems(items.map((it, i) => (i === k ? { ...it, ...patch } : it)));
  const send = async () => {
    const clean = items.map((it) => it.type === 'AB' ? { id: it.id, type: 'AB', text: it.text, a: { text: it.aText || '', dimension: 'a' }, b: { text: it.bText || '', dimension: 'b' } }
      : it.type === 'CHOICE' ? { id: it.id, type: 'CHOICE', text: it.text, options: String(it.opts || '').split('\n').map((x: string, k: number) => x.trim() && { id: `o${k + 1}`, text: x.trim() }).filter(Boolean) }
        : { id: it.id, type: it.type, text: it.text, ...(it.type === 'TEXT' ? { optional: true } : {}), ...(it.dimension ? { dimension: it.dimension } : {}) });
    try { await api('/api/guidance-tools/drafts', { method: 'POST', body: JSON.stringify({ title, description, items: clean }) }); setTitle(''); setDescription(''); setItems([{ id: 'm1', type: 'LIKERT', text: '' }]); onDone(); } catch (e: any) { onError(e.message); }
  };
  return <div className="gd-form">
    <p className="gd-note">Okulunuza özel kısa bir anket ya da gözlem formu hazırlayın. Tanı amaçlı ölçekler ve izinsiz yayımlanmış ölçek maddeleri kullanılamaz. Araç, Süper Admin (uzman) onayından sonra yalnız okulunuzda kullanılır.</p>
    <label>Başlık<input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label>
    <label>Kısa açıklama<input value={description} maxLength={600} onChange={(e) => setDescription(e.target.value)} /></label>
    {items.map((it, k) => <div key={it.id} className="gd-item"><div className="two">
      <label>Madde {k + 1}<input value={it.text} maxLength={400} onChange={(e) => upd(k, { text: e.target.value })} /></label>
      <label>Tür<select value={it.type} onChange={(e) => upd(k, { type: e.target.value })}><option value="LIKERT">1–5 puan</option><option value="YESNO">Evet / Hayır</option><option value="AB">A / B</option><option value="CHOICE">Çoktan seçmeli</option><option value="TEXT">Kısa yanıt</option></select></label>
      {(it.type === 'LIKERT' || it.type === 'YESNO') && <label>Alan (isteğe bağlı)<input value={it.dimension || ''} maxLength={30} onChange={(e) => upd(k, { dimension: e.target.value.replace(/[^a-zA-Z0-9_ğüşıöçĞÜŞİÖÇ]/g, '_') })} /></label>}
      {it.type === 'AB' && <><label>A seçeneği<input value={it.aText || ''} onChange={(e) => upd(k, { aText: e.target.value })} /></label><label>B seçeneği<input value={it.bText || ''} onChange={(e) => upd(k, { bText: e.target.value })} /></label></>}
      {it.type === 'CHOICE' && <label>Seçenekler (her satıra bir)<textarea value={it.opts || ''} onChange={(e) => upd(k, { opts: e.target.value })} /></label>}
    </div><div className="gd-actions">{items.length > 1 && <button type="button" onClick={() => setItems(items.filter((_, i) => i !== k))}>Maddeyi sil</button>}</div></div>)}
    <div className="gd-actions"><button type="button" onClick={() => setItems([...items, { id: `m${Date.now() % 100000}`, type: 'LIKERT', text: '' }])}>Madde ekle</button>
      <button type="button" className="primary" disabled={!title.trim() || !description.trim() || items.some((i) => i.text.trim().length < 3)} onClick={send}>Onaya gönder</button></div>
  </div>;
}

// ------------------------------------------------------------------ Super Admin: review new tools and load RİBA forms
export function GuidanceToolReview() {
  const [q, setQ] = useState<any>(null); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [preview, setPreview] = useState<string | null>(null);
  const [form, setForm] = useState<{ tpl: string; code: string; lines: string }>({ tpl: '', code: '', lines: '' });
  const [note, setNote] = useState('');
  const load = () => api<any>('/api/guidance-tools/review-queue').then(setQ).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, []);
  const decide = async (kind: string, id: string, decision: string) => { setError(''); setNotice(''); try { await api(`/api/guidance-tools/review/${kind}/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ decision, note: decision === 'REJECT' ? note : '' }) }); setNotice(decision === 'APPROVE' ? 'Onaylandı ve kullanıma açıldı.' : 'Reddedildi.'); await load(); } catch (e: any) { setError(e.message); } };
  const saveForm = async () => {
    const items = form.lines.split('\n').map((l) => l.trim()).filter(Boolean).map((l, k) => { const [text, area] = l.split('|').map((x) => x.trim()); return { id: `r${k + 1}`, text, ...(area ? { area } : {}) }; });
    try { await api(`/api/guidance-tools/templates/${encodeURIComponent(form.tpl)}/form`, { method: 'PUT', body: JSON.stringify({ formCode: form.code, items }) }); setNotice(`${items.length} madde kaydedildi; şablon yeniden onaya düştü.`); setForm({ ...form, lines: '' }); await load(); } catch (e: any) { setError(e.message); }
  };
  if (!q) return error ? <div className="alert error">{error}</div> : null;
  const riba = q.templates.find((t: any) => t.kind === 'RIBA');
  return <section className="gd gd-card" style={{ marginTop: 16 }}><h2>Rehberlik araçları · uzman onayı</h2>
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert success">{notice}</div>}
    <p className="gd-note">ANUNEX’in yazdığı yeni araçlar ve rehber öğretmenlerin taslakları burada bekler. Onaylanmayan hiçbir araç öğrenciye ulaşmaz. Lütfen maddeleri bir PDR uzmanıyla okuyun.</p>
    <label>Ret notu (isteğe bağlı, rehber öğretmen görür)<input value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} /></label>
    {!q.instruments.length && <div className="empty">Onay bekleyen araç yok.</div>}
    <ul className="gd-list">{q.instruments.map((i: any) => <li key={i.id} className="gd-item"><div className="row"><strong>{i.title}</strong><small>{i.institution_name ? `${i.institution_name} · ${i.owner}` : 'ANUNEX'}{i.grade_min ? ` · ${i.grade_min}–${i.grade_max}. sınıf` : ''}</small></div>
      <small>{i.description}</small>
      {preview === i.id && <ol className="gt-items">{(i.schema.items || []).map((it: any) => <li key={it.id} className="gt-item"><p>{it.text}</p><small className="gd-note">{it.type || 'LIKERT'}{it.dimension ? ` · ${it.dimension}` : ''}{it.reverse ? ' · ters' : ''}{it.a ? ` · A: ${it.a.text} / B: ${it.b.text}` : ''}{it.options ? ` · ${it.options.map((o: any) => o.text).join(' / ')}` : ''}</small></li>)}</ol>}
      <div className="gd-actions"><button type="button" onClick={() => setPreview(preview === i.id ? null : i.id)}>{preview === i.id ? 'Gizle' : `Maddeleri gör (${(i.schema.items || []).length})`}</button><button type="button" className="primary" onClick={() => decide('instruments', i.id, 'APPROVE')}>Onayla</button><button type="button" onClick={() => decide('instruments', i.id, 'REJECT')}>Reddet</button></div></li>)}</ul>
    <h3 style={{ margin: '8px 0 0' }}>Anket şablonları</h3>
    <ul className="gd-list">{q.templates.map((t: any) => <li key={t.id} className="gd-item"><div className="row"><strong>{t.title}</strong><span className={`gd-chip ${t.active ? 'ok' : 'medium'}`}>{t.active ? 'Kullanımda' : t.review_status === 'REJECTED' ? 'Reddedildi' : 'Onay bekliyor'}</span></div>
      <small>{t.forms.forms.map((f: any) => `${f.title}: ${f.items.length} madde`).join(' · ')}</small>
      <div className="gd-actions">{!t.active && <button type="button" className="primary" onClick={() => decide('templates', t.id, 'APPROVE')}>Onayla</button>}{t.active && <button type="button" onClick={() => decide('templates', t.id, 'REJECT')}>Kullanımdan kaldır</button>}</div></li>)}</ul>
    {riba && <div className="gd-form"><h3 style={{ margin: '8px 0 0' }}>RİBA form maddelerini yükle</h3>
      <p className="gd-note">Maddeleri yalnız resmî MEB kaynağından kullanım teyidi alındıktan sonra yükleyin. Her satıra bir madde; isterseniz “madde | alan” biçiminde alan yazın.</p>
      <div className="two"><label>Form<select value={form.code} onChange={(e) => setForm({ ...form, tpl: riba.id, code: e.target.value })}><option value="">Seçin</option>{riba.forms.forms.map((f: any) => <option key={f.code} value={f.code}>{f.title} ({f.items.length})</option>)}</select></label></div>
      <textarea value={form.lines} onChange={(e) => setForm({ ...form, tpl: riba.id, lines: e.target.value })} rows={8} />
      <div className="gd-actions"><button type="button" className="primary" disabled={!form.code || !form.lines.trim()} onClick={saveForm}>Formu kaydet</button></div></div>}
  </section>;
}
