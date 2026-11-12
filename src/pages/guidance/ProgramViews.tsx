import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import qrcode from 'qrcode-generator';
import { api } from '../../api';
import { DAY, DAY_SHORT, KIND_LABEL, ORIGIN, SOURCE, mondayOf, nowLocal, pct, plusDays, properCase, weekLabel } from './labels';
import './guidance.css';
import './program.css';

/**
 * Rehberlik R2 — hazır haftalık program (owner, 12 Nov 2026). The guidance teacher prepares a class's week in one
 * step, edits it (add / remove / move / change counts) and gives it; the student follows it on "Bu Haftam", the parent
 * sees it, a subject teacher adds the targets of their lesson, and every programme prints on one A4 page with a QR code.
 */

const thisMonday = () => mondayOf(nowLocal().date);
function WeekNav({ week, onChange }: { week: string; onChange: (w: string) => void }) {
  return <div className="gp-weeknav"><button type="button" onClick={() => onChange(plusDays(week, -7))} aria-label="Önceki hafta">‹</button><strong>{weekLabel(week)}</strong><button type="button" onClick={() => onChange(plusDays(week, 7))} aria-label="Sonraki hafta">›</button>{week !== thisMonday() && <button type="button" className="gp-today" onClick={() => onChange(thisMonday())}>Bu hafta</button>}</div>;
}
function Bar({ value, label }: { value: number; label?: string }) {
  return <div className="gp-bar" role="img" aria-label={label || pct(value)}><i style={{ width: `${Math.round(Math.min(1, value) * 100)}%` }} /></div>;
}

// ------------------------------------------------------------------ the week as columns (editor, student, parent)
type GridProps = { items: any[]; days?: number[]; editable?: boolean; studentMode?: boolean; today?: number | null; onChange?: () => void; setError?: (m: string) => void };
function WeekGrid({ items, days = [1, 2, 3, 4, 5, 6, 7], editable, studentMode, today, onChange, setError }: GridProps) {
  const patch = async (id: string, body: any) => { try { await api(`/api/guidance-program/items/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }); onChange?.(); } catch (e: any) { setError?.(e.message); } };
  const remove = async (id: string) => { try { await api(`/api/guidance-program/items/${encodeURIComponent(id)}`, { method: 'DELETE' }); onChange?.(); } catch (e: any) { setError?.(e.message); } };
  return <div className={`gp-grid${days.length === 1 ? ' one' : editable ? ' wide' : ''}`}>{days.map((d) => {
    const list = items.filter((i) => i.day === d);
    const sum = list.reduce((a, i) => a + Number(i.target_count || 0), 0);
    return <section key={d} className={`gp-day${today === d ? ' today' : ''}`} aria-label={DAY[d]}>
      <header><strong>{DAY[d]}</strong>{sum ? <small>{sum} soru</small> : <small>dinlenme</small>}</header>
      {list.map((i) => <article key={i.id} className={`gp-row k-${i.kind}${i.done ? ' done' : ''}`} title={i.reason || ''}>
        <div className="gp-row-top">
          {(studentMode || editable) ? <label className="gp-check"><input type="checkbox" checked={!!i.done} onChange={(e) => patch(i.id, { done: e.target.checked })} aria-label="Yapıldı" /></label> : <span className={`gp-dot${i.done ? ' on' : ''}`} />}
          <div className="gp-row-text"><strong>{i.subject_name ? `${i.subject_name} · ` : ''}{i.topic}</strong>
            <small>{SOURCE[i.source]}{i.source_detail ? ` · ${i.source_detail}` : ''}</small></div>
          <span className="gp-count">{i.target_count}</span>
        </div>
        <div className="gp-tags"><span className="gd-chip">{KIND_LABEL[i.kind] || i.kind}</span>{i.origin !== 'SYSTEM' && <span className="gd-chip">{ORIGIN[i.origin]}</span>}</div>
        {editable && <div className="gp-edit">
          <select value={i.day} onChange={(e) => patch(i.id, { day: Number(e.target.value) })} aria-label="Gün">{[1, 2, 3, 4, 5, 6, 7].map((x) => <option key={x} value={x}>{DAY_SHORT[x]}</option>)}</select>
          <input type="number" min={0} max={500} defaultValue={i.target_count} onBlur={(e) => Number(e.target.value) !== i.target_count && patch(i.id, { targetCount: Number(e.target.value) })} aria-label="Soru sayısı" />
          <button type="button" onClick={() => remove(i.id)} aria-label="Satırı sil">Sil</button>
        </div>}
        {i.video && <a className="gp-link" href={i.video.url} target="_blank" rel="noreferrer">▶ Konu videosu{i.video.end != null ? ` (${Math.max(1, Math.round((i.video.end - (i.video.start || 0)) / 60))} dk)` : ''}</a>}
        {editable && i.reason && <small className="gp-reason">{i.reason}</small>}
        {studentMode && i.origin === 'STUDENT' && <button type="button" className="gp-link" onClick={() => remove(i.id)}>Kaldır</button>}
      </article>)}
    </section>;
  })}</div>;
}

function AddRow({ programId, subjects, student, onDone }: { programId: string; subjects: any[]; student?: boolean; onDone: () => void }) {
  const [day, setDay] = useState(1); const [subjectId, setSubjectId] = useState(''); const [topic, setTopic] = useState(''); const [source, setSource] = useState(student ? 'OKUL_KITABI' : 'OKUL_KITABI'); const [detail, setDetail] = useState(''); const [count, setCount] = useState(20); const [error, setError] = useState('');
  const add = async () => { setError(''); try { await api(`/api/guidance-program/programs/${encodeURIComponent(programId)}/items`, { method: 'POST', body: JSON.stringify({ day, subjectId: subjectId || null, topic, source, sourceDetail: detail || null, targetCount: count }) }); setTopic(''); setDetail(''); onDone(); } catch (e: any) { setError(e.message); } };
  return <div className="gd-form">{error && <div className="alert error">{error}</div>}
    <div className="two">
      <label>Gün<select value={day} onChange={(e) => setDay(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6, 7].map((x) => <option key={x} value={x}>{DAY[x]}</option>)}</select></label>
      <label>Ders<select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">Genel</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>Konu<input value={topic} maxLength={200} onChange={(e) => setTopic(e.target.value)} placeholder="Örn. Paragrafta ana düşünce" /></label>
      <label>Kaynak<select value={source} onChange={(e) => setSource(e.target.value)}>{Object.entries(SOURCE).filter(([k]) => !student || k !== 'ANUNEX').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Kaynak ayrıntısı<input value={detail} maxLength={120} onChange={(e) => setDetail(e.target.value)} placeholder="Föy no, sayfa…" /></label>
      <label>Soru sayısı<input type="number" min={1} max={500} value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
    </div>
    <div className="gd-actions"><button className="primary" type="button" disabled={!topic.trim() || count < 1} onClick={add}>{student ? 'Hedefimi ekle' : 'Satırı ekle'}</button></div></div>;
}

function Progress({ progress, compact }: { progress: any; compact?: boolean }) {
  if (!progress) return null;
  return <div className="gp-progress">
    <div className="gp-progress-head"><strong>{pct(progress.completion)}</strong><span>{progress.achieved} / {progress.target} soru · {progress.activeDays} gün çalışıldı</span></div>
    <Bar value={progress.completion} />
    {!compact && <div className="gp-subjects">{progress.subjects.filter((s: any) => s.target || s.verified || s.declared).map((s: any) => <div key={s.subjectId || '_'} className="gp-subject">
      <span>{s.name}</span><Bar value={s.target ? s.achieved / s.target : 0} /><small>{s.achieved}{s.target ? ` / ${s.target}` : ''}</small></div>)}</div>}
    <p className="gd-note">ANUNEX içinde çözülen (doğrulanmış): {progress.verified.solved} soru{progress.verified.accuracy != null ? `, doğruluk ${pct(progress.verified.accuracy)}` : ''} · Öğrencinin girdiği (beyan): {progress.declared.solved} soru{progress.declared.accuracy != null ? `, doğruluk ${pct(progress.declared.accuracy)}` : ''}</p>
  </div>;
}

// ------------------------------------------------------------------ guidance teacher: class week
export function GuidanceWeekly() {
  const [params, setParams] = useSearchParams();
  const week = params.get('week') || thisMonday();
  const classId = params.get('classId') || '';
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState({ weeklyTarget: 0, weakPct: 60, worksheetPct: 30, reviewPct: 10, studyDays: [1, 2, 3, 4, 5, 6], reviewDay: 7, showSignature: true });
  const [tplName, setTplName] = useState('');
  const navigate = useNavigate();
  const load = () => api<any>(`/api/guidance-program/overview?week=${week}${classId ? `&classId=${encodeURIComponent(classId)}` : ''}`).then((r) => { setData(r); setSettings((s) => s.weeklyTarget ? s : { ...s, weeklyTarget: r.lastWeeklyTarget || 0 }); }).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, [week, classId]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string, v: any) => setParams((p) => { const n = new URLSearchParams(p); n.set(k, v); return n; });
  const prepare = async (studentIds?: string[]) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await api<any>('/api/guidance-program/generate', { method: 'POST', body: JSON.stringify({ ...settings, week, ...(studentIds ? { studentIds } : { classId: data.classId }) }) });
      const made = r.results.filter((x: any) => !x.skipped).length, given = r.results.filter((x: any) => x.skipped === 'GIVEN').length;
      setNotice(`${made} öğrencinin programı hazırlandı.${given ? ` ${given} öğrenciye bu hafta zaten program verilmiş; onlara dokunulmadı.` : ''} Satırları düzenleyip “Öğrencilere ver” deyin.`);
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const giveAll = async () => { setBusy(true); setError(''); try { const r = await api<any>('/api/guidance-program/give-class', { method: 'POST', body: JSON.stringify({ classId: data.classId, week }) }); setNotice(`${r.given} öğrenciye program verildi; öğrenci ve velilerine bildirim gitti.`); await load(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  const saveTemplate = async () => { try { await api('/api/guidance-program/templates', { method: 'POST', body: JSON.stringify({ ...settings, name: tplName }) }); setTplName(''); await load(); } catch (e: any) { setError(e.message); } };
  const useTemplate = (t: any) => setSettings({ weeklyTarget: t.weekly_target, weakPct: t.weak_pct, worksheetPct: t.worksheet_pct, reviewPct: t.review_pct, studyDays: String(t.study_days).split(',').map(Number), reviewDay: t.review_day, showSignature: !!t.show_signature });
  const drafts = (data?.students || []).filter((s: any) => s.program?.status === 'DRAFT').length;
  return <div className="page gd">
    <div className="page-head"><div><span className="eyebrow">Rehberlik · Akademik takip</span><h1>Haftalık Program</h1><p className="muted">Sistem her öğrencinin haftasını kendi eksiklerine göre hazırlar: son denemelerdeki eksik kazanımlar, bu haftanın föyleri, branş öğretmenlerinin hedefleri ve bir tekrar günü. Siz düzenleyip öğrencilere verirsiniz.</p></div></div>
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert success" role="status">{notice}</div>}
    <div className="gd-head"><WeekNav week={week} onChange={(w) => set('week', w)} />
      {data?.classes?.length > 0 && <label>Sınıf<select value={data.classId} onChange={(e) => set('classId', e.target.value)}>{data.classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}</div>
    {data && !data.classes.length && <div className="empty">Size atanmış rehberlik sınıfı yok.</div>}
    {data?.classes?.length > 0 && <section className="gd-card gd-form">
      <h2>Hazırlama ayarları {data.templates.length > 0 && <select aria-label="Şablon" defaultValue="" onChange={(e) => { const t = data.templates.find((x: any) => x.id === e.target.value); if (t) useTemplate(t); }}><option value="">Şablon seç</option>{data.templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}</h2>
      <div className="two">
        <label>Haftalık toplam soru<input type="number" min={10} max={3000} value={settings.weeklyTarget || ''} onChange={(e) => setSettings({ ...settings, weeklyTarget: Number(e.target.value) })} placeholder="Örn. 300" /></label>
        <label>Eksik kazanım %<input type="number" min={0} max={100} value={settings.weakPct} onChange={(e) => setSettings({ ...settings, weakPct: Number(e.target.value) })} /></label>
        <label>Föy %<input type="number" min={0} max={100} value={settings.worksheetPct} onChange={(e) => setSettings({ ...settings, worksheetPct: Number(e.target.value) })} /></label>
        <label>Tekrar %<input type="number" min={0} max={100} value={settings.reviewPct} onChange={(e) => setSettings({ ...settings, reviewPct: Number(e.target.value) })} /></label>
        <label>Tekrar günü<select value={settings.reviewDay} onChange={(e) => setSettings({ ...settings, reviewDay: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{DAY[d]}</option>)}</select></label>
      </div>
      <div className="gd-pick" aria-label="Çalışma günleri">{[1, 2, 3, 4, 5, 6, 7].map((d) => <label key={d}><input type="checkbox" checked={settings.studyDays.includes(d)} onChange={(e) => setSettings({ ...settings, studyDays: e.target.checked ? [...settings.studyDays, d].sort() : settings.studyDays.filter((x) => x !== d) })} />{DAY[d]}</label>)}</div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={settings.showSignature} onChange={(e) => setSettings({ ...settings, showSignature: e.target.checked })} />Çıktıda öğrenci ve veli imza alanı olsun</label>
      <p className="gd-note">Oranların toplamı 100 olmalı (şu an {settings.weakPct + settings.worksheetPct + settings.reviewPct}). Geçen haftasının yarısını yapan öğrencinin toplamı sistem tarafından biraz azaltılır; çok iyi giden öğrencininki biraz artırılır.</p>
      <div className="gd-actions">
        <button className="primary" type="button" disabled={busy || settings.weeklyTarget < 10} onClick={() => prepare()}>Sınıfa hazırla</button>
        <button type="button" disabled={busy || !drafts} onClick={giveAll}>Taslakları öğrencilere ver ({drafts})</button>
        <Link to={`/rehberlik/haftalik-program/yazdir?classId=${encodeURIComponent(data.classId)}&week=${week}`}>Sınıfı yazdır</Link>
        <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Şablon adı" style={{ maxWidth: 200 }} /><button type="button" disabled={!tplName.trim() || settings.weeklyTarget < 10} onClick={saveTemplate}>Şablon olarak kaydet</button>
      </div>
    </section>}
    {data?.students?.length > 0 && <div className="gd-card gd-scroll"><table className="gd-table"><thead><tr><th>Öğrenci</th><th>Program</th><th>Tamamlama</th><th>Doğrulanmış</th><th>Beyan</th><th>Gün</th><th>Net</th><th></th></tr></thead><tbody>
      {data.students.map((s: any) => <tr key={s.id}>
        <td><strong>{properCase(s.name)}</strong><br /><small className="muted">{s.student_number}</small></td>
        <td>{s.program ? <span className={`gd-chip ${s.program.status === 'GIVEN' ? 'ok' : ''}`}>{s.program.status === 'GIVEN' ? 'Verildi' : 'Taslak'}</span> : <span className="muted">—</span>}</td>
        <td style={{ minWidth: 120 }}>{s.program ? <><Bar value={s.program.completion} /><small>{pct(s.program.completion)} · {s.program.achieved}/{s.program.target}</small></> : '—'}</td>
        <td>{s.program?.verified ? `${s.program.verified.solved}${s.program.verified.accuracy != null ? ` · ${pct(s.program.verified.accuracy)}` : ''}` : '—'}</td>
        <td>{s.program?.declared ? `${s.program.declared.solved}${s.program.declared.accuracy != null ? ` · ${pct(s.program.declared.accuracy)}` : ''}` : '—'}</td>
        <td>{s.program ? s.program.activeDays : '—'}</td>
        <td>{s.lastNet != null ? <>{s.lastNet.toLocaleString('tr-TR')}{s.netTrend != null && <small className={s.netTrend < 0 ? 'gp-down' : 'gp-up'}> {s.netTrend > 0 ? '▲' : s.netTrend < 0 ? '▼' : '■'} {Math.abs(s.netTrend).toLocaleString('tr-TR')}</small>}</> : '—'}</td>
        <td><div className="gd-actions">{s.program ? <button type="button" className="primary" onClick={() => navigate(`/rehberlik/haftalik-program/${encodeURIComponent(s.program.id)}`)}>Aç</button> : <button type="button" disabled={busy || settings.weeklyTarget < 10} onClick={() => prepare([s.id])}>Hazırla</button>}</div></td>
      </tr>)}</tbody></table></div>}
  </div>;
}

// ------------------------------------------------------------------ guidance teacher: one programme
export function ProgramEditor() {
  const { id = '' } = useParams();
  const [data, setData] = useState<any>(null); const [subjects, setSubjects] = useState<any[]>([]);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [note, setNote] = useState<string | null>(null);
  const load = () => api<any>(`/api/guidance-program/programs/${encodeURIComponent(id)}`).then((r) => { setData(r); setNote((n) => n ?? (r.program.note || '')); }).catch((e) => setError(e.message));
  useEffect(() => { void load(); api<any>('/api/guidance-program/targets').then((r) => setSubjects(r.subjects || [])).catch(() => setSubjects([])); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (error && !data) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!data) return <div className="page"><p className="muted">Yükleniyor…</p></div>;
  const p = data.program;
  const saveNote = async (extra: any = {}) => { try { await api(`/api/guidance-program/programs/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ note, ...extra }) }); setNotice('Kaydedildi.'); await load(); } catch (e: any) { setError(e.message); } };
  const give = async () => { try { await saveNote(); await api(`/api/guidance-program/programs/${encodeURIComponent(id)}/give`, { method: 'POST', body: '{}' }); setNotice('Program öğrenciye verildi; öğrenci ve velisine bildirim gitti.'); await load(); } catch (e: any) { setError(e.message); } };
  const total = data.items.reduce((a: number, i: any) => a + Number(i.target_count || 0), 0);
  return <div className="page gd">
    <div className="page-head"><div><span className="eyebrow"><Link to={`/rehberlik/haftalik-program?week=${p.week_start}`}>Haftalık Program</Link> · {weekLabel(p.week_start)}</span><h1>{properCase(p.student_name)}</h1><p className="muted">{p.class_name} · Toplam {total} soru · {p.status === 'GIVEN' ? 'Öğrenciye verildi' : 'Taslak — öğrenci henüz görmüyor'}</p></div>
      <div className="gd-actions">{p.status !== 'GIVEN' && <button type="button" className="primary" onClick={give}>Öğrenciye ver</button>}<Link to={`/rehberlik/haftalik-program/${encodeURIComponent(id)}/yazdir`}>Yazdır</Link></div></div>
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert success" role="status">{notice}</div>}
    <p className="gd-note">Her satırın neden orada olduğu altında yazar. Günü değiştirebilir, soru sayısını düzeltebilir, satır silebilir ya da ekleyebilirsiniz.</p>
    <WeekGrid items={data.items} editable onChange={load} setError={setError} />
    <section className="gd-card"><h2>Satır ekle</h2><AddRow programId={id} subjects={subjects} onDone={load} /></section>
    <section className="gd-card gd-form"><h2>Öğrenciye not</h2><textarea value={note ?? ''} maxLength={600} onChange={(e) => setNote(e.target.value)} placeholder="Örn. Pazar günü yanlışlarını tekrar etmeyi unutma." />
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={!!p.show_signature} onChange={(e) => saveNote({ showSignature: e.target.checked })} />Çıktıda imza alanı</label>
      <div className="gd-actions"><button type="button" onClick={() => saveNote()}>Notu kaydet</button></div></section>
    {p.status === 'GIVEN' && <section className="gd-card"><h2>Bu haftanın gidişi</h2><Progress progress={data.progress} /></section>}
  </div>;
}

// ------------------------------------------------------------------ A4 print (one programme or a whole class)
function PrintSheet({ d }: { d: any }) {
  const p = d.program;
  const qr = useMemo(() => { const q = qrcode(0, 'M'); q.addData(`https://app.anunex.com/bu-haftam?week=${p.week_start}`); q.make(); return q.createDataURL(3, 4); }, [p.week_start]);
  const total = d.items.reduce((a: number, i: any) => a + Number(i.target_count || 0), 0);
  return <section className="gp-sheet">
    <header className="gp-sheet-head"><div><small>{p.institution_name}</small><h1>Haftalık Çalışma Programı</h1><p><strong>{properCase(p.student_name)}</strong> · {p.class_name || ''} · {weekLabel(p.week_start)}</p></div>
      <div className="gp-sheet-qr"><img src={qr} alt="Bu Haftam bağlantısı" /><small>Telefonla okut,<br />günü işaretle</small></div></header>
    <div className="gp-sheet-grid">{[1, 2, 3, 4, 5, 6, 7].map((day) => { const list = d.items.filter((i: any) => i.day === day); return <div key={day} className="gp-sheet-day"><strong>{DAY[day]}</strong>
      {list.length ? list.map((i: any) => <div key={i.id} className="gp-sheet-row"><span className="box" /><div><b>{i.subject_name ? `${i.subject_name}: ` : ''}{i.topic}</b><small>{SOURCE[i.source]}{i.source_detail ? ` · ${i.source_detail}` : ''}</small></div><em>{i.target_count}</em></div>) : <small className="rest">Dinlenme</small>}</div>; })}</div>
    <footer className="gp-sheet-foot"><div><b>Toplam {total} soru</b>{p.note ? <p>Rehber öğretmenin notu: {p.note}</p> : null}<small>Rehber öğretmen: {p.counselor || ''}</small></div>
      {p.show_signature ? <div className="gp-sign"><span>Öğrenci imzası</span><span>Veli imzası</span></div> : null}</footer>
  </section>;
}
export function ProgramPrint() {
  const { id } = useParams(); const [params] = useSearchParams();
  const [list, setList] = useState<any[] | null>(null); const [error, setError] = useState('');
  useEffect(() => {
    const req = id ? api<any>(`/api/guidance-program/programs/${encodeURIComponent(id)}`).then((r) => [r]) : api<any>(`/api/guidance-program/print?classId=${encodeURIComponent(params.get('classId') || '')}&week=${params.get('week') || thisMonday()}`).then((r) => r.programs);
    req.then(setList).catch((e) => setError(e.message));
  }, [id, params]);
  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!list) return <div className="page"><p className="muted">Hazırlanıyor…</p></div>;
  return <div className="gp-print">
    <div className="gp-print-bar"><button type="button" className="primary" onClick={() => window.print()}>Yazdır / PDF olarak kaydet</button><span>{list.length} program · A4 yatay</span></div>
    {!list.length && <div className="empty">Bu sınıf için bu hafta hazırlanmış program yok.</div>}
    {list.map((d) => <Fragment key={d.program.id}><PrintSheet d={d} /></Fragment>)}
  </div>;
}

// ------------------------------------------------------------------ student: Bu Haftam
export function ThisWeek() {
  const [params, setParams] = useSearchParams();
  const week = params.get('week') || thisMonday();
  const [data, setData] = useState<any>(null); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [log, setLog] = useState({ subjectId: '', source: 'OKUL_KITABI', solved: '', correct: '', wrong: '', blank: '' });
  const [adding, setAdding] = useState(false);
  const load = () => api<any>(`/api/guidance-program/mine?week=${week}`).then(setData).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, [week]); // eslint-disable-line react-hooks/exhaustive-deps
  const todayDay = week === thisMonday() ? ((new Date().getDay() + 6) % 7) + 1 : null;
  const todays = (data?.items || []).filter((i: any) => i.day === todayDay);
  const sendLog = async () => {
    setError(''); setNotice('');
    try { await api('/api/guidance-program/logs', { method: 'POST', body: JSON.stringify({ ...log, solved: Number(log.solved), correct: Number(log.correct || 0), wrong: Number(log.wrong || 0), blank: Number(log.blank || 0), subjectId: log.subjectId || null }) }); setLog({ ...log, solved: '', correct: '', wrong: '', blank: '' }); setNotice('Kaydedildi. Emeğine sağlık!'); await load(); } catch (e: any) { setError(e.message); }
  };
  const delLog = async (id: string) => { try { await api(`/api/guidance-program/logs/${encodeURIComponent(id)}`, { method: 'DELETE' }); await load(); } catch (e: any) { setError(e.message); } };
  return <div className="page gd">
    <div className="page-head"><div><span className="eyebrow">Akademik takip</span><h1>Bu Haftam</h1><p className="muted">Rehber öğretmeninin hazırladığı program, bugün yapacakların ve haftanın gidişi. ANUNEX’te çözdüğün sorular kendiliğinden sayılır; kitaptan çözdüklerini aşağıdan ekle.</p></div>
      {data?.program && <div className="gd-actions"><Link to={`/rehberlik/haftalik-program/${encodeURIComponent(data.program.id)}/yazdir`}>Yazdır</Link></div>}</div>
    <WeekNav week={week} onChange={(w) => setParams({ week: w })} />
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert success" role="status">{notice}</div>}
    {data && !data.program && <div className="empty">Bu hafta için rehber öğretmeninin hazırladığı bir program yok. Yine de çalıştıklarını aşağıya ekleyebilirsin.</div>}
    {data?.program && <>
      <div className="gd-grid">
        <section className="gd-card"><h2>Bugün {todayDay ? <small>{DAY[todayDay]}</small> : null}</h2>
          {todayDay && !todays.length && <div className="empty">Bugün için programda bir şey yok. Dinlenmek de çalışmanın parçası.</div>}
          {!todayDay && <div className="empty">Bu hafta bugün değil; günlere aşağıdan bakabilirsin.</div>}
          {todayDay && todays.length > 0 && <WeekGrid items={todays} days={[todayDay]} studentMode onChange={load} setError={setError} />}
        </section>
        <section className="gd-card"><h2>Haftanın gidişi</h2><Progress progress={data.progress} />{data.program.note && <p className="gp-note"><b>Rehber öğretmeninin notu:</b> {data.program.note}</p>}</section>
      </div>
      <h2 className="gp-h2">Haftalık program</h2>
      <WeekGrid items={data.items} studentMode today={todayDay} onChange={load} setError={setError} />
      <section className="gd-card"><h2>Kendi hedefim <button type="button" className="ghost" onClick={() => setAdding((v) => !v)}>{adding ? 'Kapat' : 'Ekle'}</button></h2>{adding && <AddRow programId={data.program.id} subjects={data.subjects || []} student onDone={() => { setAdding(false); void load(); }} />}</section>
    </>}
    <section className="gd-card gd-form"><h2>Kitaptan çözdüklerim <small>beyan</small></h2>
      <div className="two">
        <label>Ders<select value={log.subjectId} onChange={(e) => setLog({ ...log, subjectId: e.target.value })}><option value="">Seç</option>{(data?.subjects || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>Kaynak<select value={log.source} onChange={(e) => setLog({ ...log, source: e.target.value })}>{Object.entries(SOURCE).filter(([k]) => k !== 'ANUNEX').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Çözülen<input inputMode="numeric" value={log.solved} onChange={(e) => setLog({ ...log, solved: e.target.value.replace(/\D/g, '') })} /></label>
        <label>Doğru<input inputMode="numeric" value={log.correct} onChange={(e) => setLog({ ...log, correct: e.target.value.replace(/\D/g, '') })} /></label>
        <label>Yanlış<input inputMode="numeric" value={log.wrong} onChange={(e) => setLog({ ...log, wrong: e.target.value.replace(/\D/g, '') })} /></label>
        <label>Boş<input inputMode="numeric" value={log.blank} onChange={(e) => setLog({ ...log, blank: e.target.value.replace(/\D/g, '') })} /></label>
      </div>
      <div className="gd-actions"><button className="primary" type="button" disabled={!Number(log.solved) || !log.subjectId} onClick={sendLog}>Ekle</button></div>
      {data?.logs?.length > 0 && <ul className="gd-list">{data.logs.map((l: any) => <li key={l.id} className="gd-item"><div className="row"><strong>{l.subject_name || 'Genel'} · {l.solved} soru</strong><small>{new Date(`${l.log_date}T12:00:00`).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</small></div>
        <small>{SOURCE[l.source]} · {l.correct} doğru · {l.wrong} yanlış · {l.blank} boş</small><div className="gd-actions"><button type="button" onClick={() => delLog(l.id)}>Sil</button></div></li>)}</ul>}
    </section>
  </div>;
}

// ------------------------------------------------------------------ parent
export function ParentWeek() {
  const [params, setParams] = useSearchParams();
  const week = params.get('week') || thisMonday();
  const studentId = params.get('studentId') || '';
  const [data, setData] = useState<any>(null); const [error, setError] = useState('');
  useEffect(() => { api<any>(`/api/guidance-program/child?week=${week}${studentId ? `&studentId=${encodeURIComponent(studentId)}` : ''}`).then(setData).catch((e) => setError(e.message)); }, [week, studentId]);
  const set = (k: string, v: string) => setParams((p) => { const n = new URLSearchParams(p); n.set(k, v); return n; });
  return <div className="page gd">
    <div className="page-head"><div><span className="eyebrow">Akademik takip</span><h1>Haftalık Program</h1><p className="muted">Rehber öğretmenin çocuğunuz için hazırladığı haftalık program ve haftanın gidişi. Destek olmanın en iyi yolu: düzenli bir çalışma saati ve küçük ilerlemeleri fark etmek.</p></div></div>
    <div className="gd-head"><WeekNav week={week} onChange={(w) => set('week', w)} />{data?.children?.length > 1 && <label>Çocuğunuz<select value={data.studentId} onChange={(e) => set('studentId', e.target.value)}>{data.children.map((c: any) => <option key={c.id} value={c.id}>{properCase(c.name)}</option>)}</select></label>}</div>
    {error && <div className="alert error">{error}</div>}
    {data && !data.program && <div className="empty">Bu hafta için hazırlanmış bir program yok.</div>}
    {data?.program && <><section className="gd-card"><h2>Haftanın gidişi</h2><Progress progress={data.progress} compact />{data.program.note && <p className="gp-note"><b>Rehber öğretmenin notu:</b> {data.program.note}</p>}</section>
      <WeekGrid items={data.items} /></>}
  </div>;
}

// ------------------------------------------------------------------ subject teacher: haftalık ders hedefi
export function SubjectTargets() {
  const [week, setWeek] = useState(thisMonday());
  const [data, setData] = useState<any>(null); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ classId: '', subjectId: '', topic: '', targetCount: 30, source: 'DIGER', note: '' });
  const load = () => api<any>(`/api/guidance-program/targets?week=${week}`).then((r) => { setData(r); if (r.assignments?.length && !form.classId) setForm((f) => ({ ...f, classId: r.assignments[0].class_id, subjectId: r.assignments[0].subject_id || '' })); }).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, [week]); // eslint-disable-line react-hooks/exhaustive-deps
  const pairs = data?.assignments || [];
  const save = async () => { setError(''); setNotice(''); try { const r = await api<any>('/api/guidance-program/targets', { method: 'POST', body: JSON.stringify({ ...form, week }) }); setNotice(`Hedef eklendi.${r.addedToPrograms ? ` Bu hafta hazırlanmış ${r.addedToPrograms} programa da eklendi.` : ' Rehber öğretmen programları hazırlarken eklenecek.'}`); setForm({ ...form, topic: '' }); await load(); } catch (e: any) { setError(e.message); } };
  return <div className="page gd" style={{ maxWidth: 900 }}>
    <div className="page-head"><div><span className="eyebrow">Akademik takip</span><h1>Haftalık Ders Hedefi</h1><p className="muted">Dersinizin bu haftaki soru hedefini verin; sınıfın haftalık programlarına “Ders hedefi” olarak eklenir.</p></div></div>
    <WeekNav week={week} onChange={setWeek} />
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert success" role="status">{notice}</div>}
    {data && !pairs.length && <div className="empty">Size atanmış bir sınıf-ders yok.</div>}
    {pairs.length > 0 && <section className="gd-card gd-form"><div className="two">
      <label>Sınıf<select value={form.classId} onChange={(e) => { const a = pairs.find((x: any) => x.class_id === e.target.value); setForm({ ...form, classId: e.target.value, subjectId: a?.subject_id || form.subjectId }); }}>{[...new Map(pairs.map((a: any) => [a.class_id, a])).values()].map((a: any) => <option key={a.class_id} value={a.class_id}>{a.class_name}</option>)}</select></label>
      <label>Ders<select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>{(pairs.filter((a: any) => a.class_id === form.classId && a.subject_id).length ? pairs.filter((a: any) => a.class_id === form.classId && a.subject_id).map((a: any) => ({ id: a.subject_id, name: a.subject_name })) : data.subjects).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>Konu<input value={form.topic} maxLength={200} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="Örn. Üslü ifadeler" /></label>
      <label>Soru sayısı<input type="number" min={1} max={500} value={form.targetCount} onChange={(e) => setForm({ ...form, targetCount: Number(e.target.value) })} /></label>
      <label>Kaynak<select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>{Object.entries(SOURCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Not<input value={form.note} maxLength={200} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Sayfa, test no…" /></label>
    </div><div className="gd-actions"><button className="primary" type="button" disabled={!form.topic.trim() || !form.subjectId} onClick={save}>Hedefi ekle</button></div></section>}
    {data?.targets?.length > 0 && <section className="gd-card"><h2>Bu haftaki hedefleriniz</h2><ul className="gd-list">{data.targets.map((t: any) => <li key={t.id} className="gd-item"><div className="row"><strong>{t.class_name} · {t.subject_name} · {t.topic}</strong><span className="gd-chip">{t.target_count} soru</span></div><small>{SOURCE[t.source]}{t.note ? ` · ${t.note}` : ''}</small></li>)}</ul></section>}
  </div>;
}
