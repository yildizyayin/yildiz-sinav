import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { AREA, dateTr, nowLocal, properCase } from './labels';
import './guidance.css';

/**
 * Rehberlik R4 (owner, 12 Nov 2026): Yıllık Plan, Etkinlikler, Kütüphane, Dijital Sağlık for the guidance teacher;
 * "Rehberlik Etkinliklerim" for class teachers; the screen & sleep diary for students and parents; shared resources.
 */

const MONTHS = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
const MONTH_NAME: Record<number, string> = { 1: 'Ocak', 2: 'Şubat', 3: 'Mart', 4: 'Nisan', 5: 'Mayıs', 6: 'Haziran', 7: 'Temmuz', 8: 'Ağustos', 9: 'Eylül', 10: 'Ekim', 11: 'Kasım', 12: 'Aralık' };
const KIND: Record<string, string> = { CLASS_ACTIVITY: 'Sınıf etkinliği', PARENT_SEMINAR: 'Veli semineri', TEACHER_INFO: 'Öğretmen bilgilendirme', SURVEY: 'Tanıma / anket', GROUP: 'Grup çalışması', CAREER: 'Kariyer', PREVENTION: 'Önleyici çalışma', OTHER: 'Diğer' };
const TOPIC: Record<string, string> = { PEER_BULLYING: 'Akran zorbalığı', SCREEN: 'Ekran ve dijital sağlık', EXAM_ANXIETY: 'Sınav kaygısı', STUDY: 'Verimli çalışma', CAREER: 'Kariyer', FRIENDS: 'Arkadaşlık', SELF: 'Kendini tanıma', GREETING: 'Selamlaşma', SAFETY: 'Güvenlik', SLEEP: 'Uyku', OTHER: 'Diğer' };
const AUD: Record<string, string> = { STUDENT: 'Öğrenci', PARENT: 'Veli', TEACHER: 'Öğretmen' };
const schoolYear = () => { const d = nowLocal().date; const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)); const s = m >= 9 ? y : y - 1; return `${s}-${s + 1}`; };
const hm = (min?: number | null) => (min == null ? '—' : `${Math.floor(min / 60)} sa ${min % 60} dk`);

function useClasses() {
  const [classes, setClasses] = useState<any[]>([]);
  useEffect(() => { api<any>('/api/guidance-center/students').then((s) => { const m = new Map<string, any>(); for (const st of s.students || []) if (st.classId) m.set(st.classId, { id: st.classId, name: st.className }); setClasses([...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'))); }).catch(() => setClasses([])); }, []);
  return classes;
}

// ------------------------------------------------------------------ Yıllık Plan
export function AnnualPlan() {
  const [year, setYear] = useState(schoolYear());
  const [data, setData] = useState<any>(null); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [head, setHead] = useState({ theme: '', priorities: '' });
  const [form, setForm] = useState({ month: 9, kind: 'CLASS_ACTIVITY', area: 'SOCIAL_EMOTIONAL', title: '', targetDate: '', gradeMin: '', gradeMax: '' });
  const load = () => api<any>(`/api/guidance-content/plan?year=${year}`).then((r) => { setData(r); setHead({ theme: r.plan?.theme || '', priorities: r.plan?.priorities || '' }); }).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, [year]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveHead = async () => { try { await api('/api/guidance-content/plan', { method: 'PUT', body: JSON.stringify({ year, ...head }) }); setNotice('Kaydedildi.'); } catch (e: any) { setError(e.message); } };
  const add = async () => { try { await api('/api/guidance-content/plan/entries', { method: 'POST', body: JSON.stringify({ year, ...form, gradeMin: Number(form.gradeMin) || null, gradeMax: Number(form.gradeMax) || null }) }); setForm({ ...form, title: '' }); await load(); } catch (e: any) { setError(e.message); } };
  const patch = async (id: string, body: any) => { try { await api(`/api/guidance-content/plan/entries/${encodeURIComponent(id)}`, { method: body ? 'PATCH' : 'DELETE', ...(body ? { body: JSON.stringify(body) } : {}) }); await load(); } catch (e: any) { setError(e.message); } };
  const y0 = Number(year.slice(0, 4));
  return <div className="page gd">
    <div className="page-head"><div><span className="eyebrow">Rehberlik</span><h1>Yıllık Plan</h1><p className="muted">Okulun rehberlik yılı ay ay: sınıf etkinlikleri, veli seminerleri, öğretmen bilgilendirmeleri, tanıma çalışmaları. MEB’in yıllık teması ve RİBA öncelikleri planın başında durur.</p></div>
      <div className="gd-actions"><select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Eğitim yılı">{[y0 - 1, y0, y0 + 1].map((y) => <option key={y} value={`${y}-${y + 1}`}>{y}–{y + 1}</option>)}</select><button type="button" onClick={() => window.print()}>Yazdır</button></div></div>
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert success" role="status">{notice}</div>}
    <section className="gd-card gd-form"><h2>Yılın çerçevesi</h2>
      <div className="two"><label>MEB yıllık rehberlik teması<input value={head.theme} maxLength={200} onChange={(e) => setHead({ ...head, theme: e.target.value })} placeholder="Örn. 2026–2027: Selamlaşma" /></label></div>
      <label>Öncelikli ihtiyaçlar (anket ve gözlemlerden)<textarea value={head.priorities} maxLength={2000} onChange={(e) => setHead({ ...head, priorities: e.target.value })} /></label>
      <div className="gd-actions"><button type="button" className="primary" onClick={saveHead}>Kaydet</button></div></section>
    <section className="gd-card gd-form"><h2>Plana ekle</h2><div className="two">
      <label>Ay<select value={form.month} onChange={(e) => setForm({ ...form, month: Number(e.target.value) })}>{MONTHS.map((m) => <option key={m} value={m}>{MONTH_NAME[m]}</option>)}</select></label>
      <label>Tür<select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Alan<select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>{Object.entries(AREA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Başlık<input value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label>Tarih (isteğe bağlı)<input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} /></label>
      <label>Sınıf düzeyi<span style={{ display: 'flex', gap: 6 }}><input inputMode="numeric" placeholder="en az" value={form.gradeMin} onChange={(e) => setForm({ ...form, gradeMin: e.target.value })} /><input inputMode="numeric" placeholder="en çok" value={form.gradeMax} onChange={(e) => setForm({ ...form, gradeMax: e.target.value })} /></span></label>
    </div><div className="gd-actions"><button type="button" className="primary" disabled={!form.title.trim()} onClick={add}>Ekle</button></div></section>
    <div className="gd-grid">{MONTHS.map((m) => { const list = (data?.entries || []).filter((e: any) => e.month === m); return <section key={m} className="gd-card"><h2>{MONTH_NAME[m]} <small>{list.length} çalışma</small></h2>
      {!list.length && <div className="empty">Henüz bir şey yok.</div>}
      <ul className="gd-list">{list.map((e: any) => <li key={e.id} className="gd-item"><div className="row"><strong style={{ textDecoration: e.status === 'CANCELLED' ? 'line-through' : undefined }}>{e.title}</strong><span className={`gd-chip ${e.status === 'DONE' ? 'ok' : ''}`}>{e.status === 'DONE' ? 'Yapıldı' : e.status === 'CANCELLED' ? 'İptal' : KIND[e.kind]}</span></div>
        <small>{AREA[e.area]}{e.grade_min ? ` · ${e.grade_min}–${e.grade_max || e.grade_min}. sınıf` : ''}{e.target_date ? ` · ${dateTr(e.target_date)}` : ''}</small>
        <div className="gd-actions">{e.status !== 'DONE' && <button type="button" onClick={() => patch(e.id, { status: 'DONE' })}>Yapıldı</button>}<button type="button" onClick={() => patch(e.id, null)}>Sil</button></div></li>)}</ul></section>; })}</div>
  </div>;
}

// ------------------------------------------------------------------ Etkinlikler
export function ActivityPool() {
  const classes = useClasses();
  const [data, setData] = useState<any>(null); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [topic, setTopic] = useState(''); const [open, setOpen] = useState<string | null>(null);
  const [assign, setAssign] = useState<any>({ classId: '', teacherId: '', dueDate: '' }); const [teachers, setTeachers] = useState<any[]>([]);
  const load = () => api<any>('/api/guidance-content/activities').then(setData).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, []);
  useEffect(() => { setTeachers([]); if (assign.classId) api<any>(`/api/guidance-content/class-teachers?classId=${encodeURIComponent(assign.classId)}`).then((r) => setTeachers(r.teachers || [])).catch(() => setTeachers([])); }, [assign.classId]);
  const give = async (id: string) => { setError(''); try { await api('/api/guidance-content/activities/assign', { method: 'POST', body: JSON.stringify({ activityId: id, ...assign }) }); setNotice('Etkinlik sınıfa verildi.'); setOpen(null); await load(); } catch (e: any) { setError(e.message); } };
  const list = (data?.activities || []).filter((a: any) => !topic || a.topic === topic);
  return <div className="page gd">
    <div className="page-head"><div><span className="eyebrow">Rehberlik</span><h1>Sınıf Etkinlikleri</h1><p className="muted">Uzman onaylı etkinlik havuzu. Bir etkinliği sınıfa ve o sınıfa giren bir öğretmene verin; öğretmen uygulayınca işaretler.</p></div></div>
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert success" role="status">{notice}</div>}
    {data && !data.activities.length && <div className="empty">Henüz onaylanmış etkinlik yok.{data.pendingReview ? ` ${data.pendingReview} etkinlik uzman onayında.` : ''}</div>}
    {data?.activities?.length > 0 && <label style={{ maxWidth: 320 }}>Konu<select value={topic} onChange={(e) => setTopic(e.target.value)}><option value="">Tümü</option>{Object.entries(TOPIC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
    <div className="gd-grid">{list.map((a: any) => <section key={a.id} className="gd-card"><h2>{a.title} <small>{a.grade_min}–{a.grade_max}. sınıf · {a.duration_min} dk</small></h2>
      <span className="gd-chip">{TOPIC[a.topic]}</span><p style={{ margin: 0 }}>{a.goal}</p>
      <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 4 }}>{a.steps.map((s: string, k: number) => <li key={k} style={{ fontSize: 14 }}>{s}</li>)}</ol>
      {a.materials && <small className="gd-note">Malzeme: {a.materials}</small>}
      {open === a.id ? <div className="gd-form"><div className="two">
        <label>Sınıf<select value={assign.classId} onChange={(e) => setAssign({ ...assign, classId: e.target.value, teacherId: '' })}><option value="">Seçin</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Uygulayacak öğretmen<select value={assign.teacherId} onChange={(e) => setAssign({ ...assign, teacherId: e.target.value })}><option value="">Kendim uygulayacağım</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}{t.subject ? ` · ${t.subject}` : ''}</option>)}</select></label>
        <label>Son tarih<input type="date" value={assign.dueDate} onChange={(e) => setAssign({ ...assign, dueDate: e.target.value })} /></label></div>
        <div className="gd-actions"><button type="button" className="primary" disabled={!assign.classId} onClick={() => give(a.id)}>Ver</button><button type="button" onClick={() => setOpen(null)}>Vazgeç</button></div></div>
        : <div className="gd-actions"><button type="button" className="primary" onClick={() => setOpen(a.id)}>Sınıfa ver</button></div>}
    </section>)}</div>
    {data?.assignments?.length > 0 && <section className="gd-card"><h2>Verilen etkinlikler</h2><ul className="gd-list">{data.assignments.map((g: any) => <li key={g.id} className="gd-item"><div className="row"><strong>{g.title} · {g.class_name}</strong><span className={`gd-chip ${g.status === 'DONE' ? 'ok' : ''}`}>{g.status === 'DONE' ? 'Uygulandı' : 'Bekliyor'}</span></div>
      <small>{g.teacher || 'Rehber öğretmen'}{g.due_date ? ` · son tarih ${dateTr(g.due_date)}` : ''}{g.teacher_note ? ` · Not: ${g.teacher_note}` : ''}</small></li>)}</ul></section>}
  </div>;
}

// ------------------------------------------------------------------ Kütüphane
export function ResourceLibrary() {
  const classes = useClasses();
  const [data, setData] = useState<any>(null); const [error, setError] = useState(''); const [aud, setAud] = useState(''); const [target, setTarget] = useState<Record<string, string>>({}); const [open, setOpen] = useState<string | null>(null);
  const load = () => api<any>('/api/guidance-content/resources').then(setData).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, []);
  const share = async (id: string) => { try { await api(`/api/guidance-content/resources/${encodeURIComponent(id)}/share`, { method: 'POST', body: JSON.stringify({ classId: target[id] || null }) }); await load(); } catch (e: any) { setError(e.message); } };
  return <div className="page gd">
    <div className="page-head"><div><span className="eyebrow">Rehberlik</span><h1>Kaynak Kütüphanesi</h1><p className="muted">Öğrenci, veli ve öğretmenler için uzman onaylı kısa rehberler. Paylaştığınız kaynak, ilgili kişilerin “Rehber Öğretmeni” sayfasında görünür.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    {data && !data.resources.length && <div className="empty">Henüz onaylanmış kaynak yok; ANUNEX’in hazırladığı kaynaklar uzman onayında.</div>}
    {data?.resources?.length > 0 && <div className="gd-tabs">{[['', 'Tümü'], ['STUDENT', 'Öğrenci'], ['PARENT', 'Veli'], ['TEACHER', 'Öğretmen']].map(([k, v]) => <button key={k} type="button" className={aud === k ? 'on' : ''} onClick={() => setAud(k)}>{v}</button>)}</div>}
    <div className="gd-grid">{(data?.resources || []).filter((r: any) => !aud || r.audience === aud).map((r: any) => <section key={r.id} className="gd-card"><h2>{r.title} <small>{AUD[r.audience]} · {TOPIC[r.topic]}</small></h2>
      <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 14 }}>{open === r.id ? r.body : `${r.body.slice(0, 180)}${r.body.length > 180 ? '…' : ''}`}</p>
      <div className="gd-actions"><button type="button" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Kısalt' : 'Tamamını oku'}</button></div>
      {r.shared.length > 0 && <small className="gd-note">Paylaşıldı: {r.shared.join(', ')}</small>}
      <div className="gd-actions"><select value={target[r.id] || ''} onChange={(e) => setTarget({ ...target, [r.id]: e.target.value })} aria-label="Kime"><option value="">Tüm okul</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button type="button" className="primary" onClick={() => share(r.id)}>Paylaş</button></div>
    </section>)}</div>
  </div>;
}

// ------------------------------------------------------------------ Dijital Sağlık (counsellor)
export function DigitalHealth() {
  const classes = useClasses();
  const [classId, setClassId] = useState(''); const [data, setData] = useState<any>(null); const [error, setError] = useState('');
  useEffect(() => { if (!classId && classes[0]) setClassId(classes[0].id); }, [classes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (classId) api<any>(`/api/guidance-content/screen/class?classId=${encodeURIComponent(classId)}`).then(setData).catch((e) => setError(e.message)); }, [classId]);
  return <div className="page gd">
    <div className="page-head"><div><span className="eyebrow">Rehberlik</span><h1>Dijital Sağlık</h1><p className="muted">Öğrencilerin ve velilerin tuttuğu ekran ve uyku günlüğünün son 7 günü. Bu bir öz bildirimdir, bağımlılık tanısı değildir; yüksek değerler bir konuşma başlangıcıdır. Günlüğü yaygınlaştırmak için “Ekran saatimi ben yönetirim” etkinliğini ve veli rehberini kullanabilirsiniz.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    <label style={{ maxWidth: 260 }}>Sınıf<select value={classId} onChange={(e) => setClassId(e.target.value)}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    {data && <><div className="gd-stats"><div className="gd-stat"><strong>{data.loggedStudents}</strong><span>öğrenci günlük tuttu</span></div><div className="gd-stat"><strong>{hm(data.classAvgMinutes)}</strong><span>sınıf günlük ortalaması</span></div></div>
      <div className="gd-card gd-scroll"><table className="gd-table"><thead><tr><th>Öğrenci</th><th>Kayıt</th><th>Günlük ortalama</th><th>Geç yatış (23.30 sonrası)</th></tr></thead><tbody>
        {data.students.map((s: any) => <tr key={s.id}><td>{properCase(s.name)}</td><td>{s.days || '—'}</td><td>{s.days ? <span className={`gd-chip ${s.avgMinutes > 240 ? 'medium' : ''}`}>{hm(s.avgMinutes)}</span> : '—'}</td><td>{s.days ? s.lateNights : '—'}</td></tr>)}
      </tbody></table></div></>}
  </div>;
}

// ------------------------------------------------------------------ class teacher: Rehberlik Etkinliklerim
export function TeacherActivities() {
  const [rows, setRows] = useState<any[] | null>(null); const [note, setNote] = useState<Record<string, string>>({}); const [error, setError] = useState('');
  const load = () => api<any>('/api/guidance-content/my-activities').then((r) => setRows(r.assignments || [])).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, []);
  const done = async (id: string) => { try { await api(`/api/guidance-content/my-activities/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ note: note[id] || '' }) }); await load(); } catch (e: any) { setError(e.message); } };
  return <div className="page gd" style={{ maxWidth: 900 }}>
    <div className="page-head"><div><span className="eyebrow">Rehberlik</span><h1>Rehberlik Etkinlikleri</h1><p className="muted">Rehber öğretmenin sınıfınız için planladığı etkinlikler. Uyguladıktan sonra kısa bir notla işaretleyin.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    {rows && !rows.length && <div className="empty">Size verilmiş bir rehberlik etkinliği yok.</div>}
    <ul className="gd-list">{(rows || []).map((g) => <li key={g.id} className="gd-item"><div className="row"><strong>{g.title} · {g.class_name}</strong><span className={`gd-chip ${g.status === 'DONE' ? 'ok' : ''}`}>{g.status === 'DONE' ? 'Uygulandı' : g.due_date ? `Son tarih ${dateTr(g.due_date)}` : 'Bekliyor'}</span></div>
      <p>{g.goal}</p><ol style={{ margin: 0, paddingLeft: 20 }}>{g.steps.map((s: string, k: number) => <li key={k} style={{ fontSize: 14 }}>{s}</li>)}</ol>
      {g.status === 'ASSIGNED' && <div className="gd-form"><input value={note[g.id] || ''} maxLength={500} placeholder="Kısa not (isteğe bağlı)" onChange={(e) => setNote({ ...note, [g.id]: e.target.value })} /><div className="gd-actions"><button type="button" className="primary" onClick={() => done(g.id)}>Uygulandı</button></div></div>}
    </li>)}</ul>
  </div>;
}

// ------------------------------------------------------------------ student / parent: Ekran ve uyku günlüğü
export function ScreenDiary() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [studentId, setStudentId] = useState('');
  const [form, setForm] = useState({ date: nowLocal().date, hours: '1', minutes: '0', bedtime: '22:30' });
  const load = () => api<any>(`/api/guidance-content/screen/mine${studentId ? `?studentId=${encodeURIComponent(studentId)}` : ''}`).then((r) => { setData(r); if (r.studentId && !studentId) setStudentId(r.studentId); }).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, [studentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => { setError(''); try { await api('/api/guidance-content/screen/mine', { method: 'POST', body: JSON.stringify({ date: form.date, screenMinutes: Number(form.hours) * 60 + Number(form.minutes), bedtime: form.bedtime || null, studentId: studentId || null }) }); setNotice('Kaydedildi.'); await load(); } catch (e: any) { setError(e.message); } };
  const week = useMemo(() => (data?.logs || []).filter((l: any) => l.entered_by === (user?.role === 'PARENT' ? 'PARENT' : 'STUDENT')).slice(0, 7), [data, user]);
  const avg = week.length ? Math.round(week.reduce((a: number, l: any) => a + l.screen_minutes, 0) / week.length) : null;
  const parent = user?.role === 'PARENT';
  return <div className="page gd" style={{ maxWidth: 820 }}>
    <div className="page-head"><div><span className="eyebrow">Dijital sağlık</span><h1>{parent ? 'Ekran ve Uyku Günlüğü' : 'Ekran ve Uyku Günlüğüm'}</h1><p className="muted">{parent ? 'Çocuğunuzun ders dışı ekran süresini ve yatış saatini günde bir kez yazın. Amaç yasaklamak değil, birlikte fark etmek.' : 'Ders dışı ekran süreni (telefon, tablet, oyun, TV) ve yatış saatini günde bir kez yaz. Kendi alışkanlığını görmek ilk adım.'}</p></div></div>
    {parent && data?.children?.length > 1 && <label style={{ maxWidth: 280 }}>Çocuğunuz<select value={studentId} onChange={(e) => setStudentId(e.target.value)}>{data.children.map((c: any) => <option key={c.id} value={c.id}>{properCase(c.name)}</option>)}</select></label>}
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert success" role="status">{notice}</div>}
    <section className="gd-card gd-form"><div className="two">
      <label>Gün<input type="date" value={form.date} max={nowLocal().date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
      <label>Ekran süresi<span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input inputMode="numeric" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value.replace(/\D/g, '') })} aria-label="Saat" /> sa <input inputMode="numeric" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value.replace(/\D/g, '') })} aria-label="Dakika" /> dk</span></label>
      <label>Yatış saati<input type="time" value={form.bedtime} onChange={(e) => setForm({ ...form, bedtime: e.target.value })} /></label></div>
      <div className="gd-actions"><button type="button" className="primary" onClick={save}>Kaydet</button></div></section>
    {week.length > 0 && <section className="gd-card"><h2>Son günler <small>ortalama {hm(avg)}</small></h2>
      <ul className="gd-list">{week.map((l: any) => <li key={l.log_date} className="gd-item"><div className="row"><strong>{dateTr(l.log_date)}</strong><span className={`gd-chip ${l.screen_minutes > 240 ? 'medium' : 'ok'}`}>{hm(l.screen_minutes)}</span></div>{l.bedtime && <small>Yatış: {l.bedtime}</small>}</li>)}</ul>
      <p className="gd-note">İpucu: yatmadan önceki son yarım saati ekransız geçirmek uykuya dalmayı kolaylaştırır. Ekran dışı sevdiğin bir etkinlik planla.</p></section>}
  </div>;
}

// ------------------------------------------------------------------ shared resources (students, parents, teachers)
export function SharedResources() {
  const [rows, setRows] = useState<any[]>([]); const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { api<any>('/api/guidance-content/resources/mine').then((r) => setRows(r.resources || [])).catch(() => setRows([])); }, []);
  if (!rows.length) return null;
  return <section className="gd-card"><h2>Rehberlik kaynakları</h2><ul className="gd-list">{rows.map((r) => <li key={r.id} className="gd-item"><div className="row"><strong>{r.title}</strong><button type="button" className="ghost" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Kapat' : 'Oku'}</button></div>{open === r.id && <p>{r.body}</p>}</li>)}</ul></section>;
}

// ------------------------------------------------------------------ Super Admin: activities and resources awaiting approval
export function GuidanceContentReview() {
  const [q, setQ] = useState<any>(null); const [error, setError] = useState(''); const [open, setOpen] = useState<string | null>(null);
  const load = () => api<any>('/api/guidance-content/review').then(setQ).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, []);
  const decide = async (kind: string, id: string, decision: string) => { try { await api(`/api/guidance-content/review/${kind}/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ decision }) }); await load(); } catch (e: any) { setError(e.message); } };
  if (!q) return error ? <div className="alert error">{error}</div> : null;
  return <section className="gd gd-card" style={{ marginTop: 16 }}><h2>Sınıf etkinlikleri ve kaynaklar · uzman onayı</h2>{error && <div className="alert error">{error}</div>}
    {!q.activities.length && !q.resources.length && <div className="empty">Onay bekleyen içerik yok.</div>}
    <ul className="gd-list">{q.activities.map((a: any) => <li key={a.id} className="gd-item"><div className="row"><strong>Etkinlik · {a.title}</strong><small>{a.grade_min}–{a.grade_max}. sınıf · {TOPIC[a.topic]}</small></div><small>{a.goal}</small>
      {open === a.id && <ol style={{ margin: 0, paddingLeft: 20 }}>{a.steps.map((s: string, k: number) => <li key={k} style={{ fontSize: 14 }}>{s}</li>)}</ol>}
      <div className="gd-actions"><button type="button" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? 'Gizle' : 'Adımları gör'}</button><button type="button" className="primary" onClick={() => decide('activities', a.id, 'APPROVE')}>Onayla</button><button type="button" onClick={() => decide('activities', a.id, 'REJECT')}>Reddet</button></div></li>)}
      {q.resources.map((r: any) => <li key={r.id} className="gd-item"><div className="row"><strong>Kaynak · {r.title}</strong><small>{AUD[r.audience]} · {TOPIC[r.topic]}</small></div>
        {open === r.id ? <p>{r.body}</p> : null}
        <div className="gd-actions"><button type="button" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Gizle' : 'Metni oku'}</button><button type="button" className="primary" onClick={() => decide('resources', r.id, 'APPROVE')}>Onayla</button><button type="button" onClick={() => decide('resources', r.id, 'REJECT')}>Reddet</button></div></li>)}</ul></section>;
}
