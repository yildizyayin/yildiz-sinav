import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { api } from '../../api';
import { AREA, KIND, SIGNAL, TOPIC, dateTr, nowLocal, pct, properCase } from './labels';
import './guidance.css';

/**
 * Rehberlik R5 — raporlar (owner, 12 Nov 2026): faaliyet raporu (for entering into e-Rehberlik), sınıf raporu,
 * öğrenci raporu (a full one for the guidance teacher, a plain one for the parent) and the manager's school summary.
 */
const PLAN_KIND: Record<string, string> = { CLASS_ACTIVITY: 'Sınıf etkinliği', PARENT_SEMINAR: 'Veli semineri', TEACHER_INFO: 'Öğretmen bilgilendirme', SURVEY: 'Tanıma / anket', GROUP: 'Grup çalışması', CAREER: 'Kariyer', PREVENTION: 'Önleyici çalışma', OTHER: 'Diğer' };
const yearStart = () => { const d = nowLocal().date; const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)); return `${m >= 9 ? y : y - 1}-09-01`; };

function ActivityReport({ manager }: { manager?: boolean }) {
  const [from, setFrom] = useState(yearStart()); const [to, setTo] = useState(nowLocal().date);
  const [r, setR] = useState<any>(null); const [error, setError] = useState('');
  useEffect(() => { setError(''); api<any>(`/api/guidance-summary/activity?from=${from}&to=${to}`).then(setR).catch((e) => setError(e.message)); }, [from, to]);
  const exportXlsx = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { 'Çalışma': 'Bireysel görüşme', 'Sayı': r.totals.individual }, { 'Çalışma': 'Grup görüşmesi', 'Sayı': r.totals.group }, { 'Çalışma': 'Veli görüşmesi', 'Sayı': r.totals.parent }, { 'Çalışma': 'Öğretmen görüşmesi', 'Sayı': r.totals.teacher },
      { 'Çalışma': 'Görüşmelere katılan öğrenci', 'Sayı': r.totals.studentsReached }, { 'Çalışma': 'Rehberlik mesajı', 'Sayı': r.messages.total }, { 'Çalışma': 'Verilen haftalık program', 'Sayı': r.programs.given },
      { 'Çalışma': 'Uygulanan sınıf etkinliği', 'Sayı': r.activities.done }, ...r.planDone.map((p: any) => ({ 'Çalışma': `Plan · ${PLAN_KIND[p.kind]}`, 'Sayı': p.n })),
    ]), 'Özet');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.meetings.map((m: any) => ({ 'Tür': KIND[m.kind], 'Alan': AREA[m.area], 'Konu': TOPIC[m.topic], 'Görüşme': m.n, 'Öğrenci': m.students }))), 'Görüşmeler');
    XLSX.writeFile(wb, `Rehberlik faaliyet raporu ${from} ${to}.xlsx`);
  };
  return <div className="gd">
    <div className="gd-head"><div className="gd-actions"><label>Başlangıç<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>Bitiş<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></div>
      {r && <div className="gd-actions"><button type="button" onClick={exportXlsx}>Excel’e aktar</button><button type="button" onClick={() => window.print()}>Yazdır</button></div>}</div>
    {error && <div className="alert error">{error}</div>}
    {r && <>
      <p className="gd-note">{r.note}{manager ? ' Rehberlik görüşmelerinin içeriği ve öğrenci adları bu özette yer almaz.' : ''}</p>
      <div className="gd-stats">
        <div className="gd-stat"><strong>{r.totals.individual}</strong><span>bireysel görüşme</span></div><div className="gd-stat"><strong>{r.totals.group}</strong><span>grup görüşmesi</span></div>
        <div className="gd-stat"><strong>{r.totals.parent}</strong><span>veli görüşmesi</span></div><div className="gd-stat"><strong>{r.totals.teacher}</strong><span>öğretmen görüşmesi</span></div>
        <div className="gd-stat"><strong>{r.messages.total}</strong><span>rehberlik mesajı{r.messages.urgent ? ` · ${r.messages.urgent} acil` : ''}</span></div>
        <div className="gd-stat"><strong>{r.programs.given}</strong><span>haftalık program ({r.programs.students} öğrenci)</span></div>
        <div className="gd-stat"><strong>{r.activities.done}/{r.activities.given}</strong><span>sınıf etkinliği uygulandı</span></div>
        <div className="gd-stat"><strong>{r.diaryStudents}</strong><span>öğrenci ekran günlüğü tuttu</span></div>
      </div>
      <div className="gd-grid">
        <section className="gd-card"><h2>Görüşmeler</h2>{!r.meetings.length && <div className="empty">Bu aralıkta tamamlanan görüşme yok.</div>}
          <table className="gd-table"><tbody>{r.meetings.map((m: any, k: number) => <tr key={k}><td>{KIND[m.kind]}</td><td>{AREA[m.area]}</td><td>{TOPIC[m.topic]}</td><td><b>{m.n}</b></td></tr>)}</tbody></table></section>
        <section className="gd-card"><h2>Yıllık plandan yapılanlar</h2>{!r.planDone.length && <div className="empty">Yok.</div>}<table className="gd-table"><tbody>{r.planDone.map((p: any) => <tr key={p.kind}><td>{PLAN_KIND[p.kind]}</td><td><b>{p.n}</b></td></tr>)}</tbody></table>
          <h2>Ölçme araçları</h2>{!r.tests.length && <div className="empty">Yok.</div>}<table className="gd-table"><tbody>{r.tests.map((x: any) => <tr key={x.title}><td>{x.title}</td><td>{x.answered}/{x.n} yanıt</td></tr>)}</tbody></table>
          {r.surveys.length > 0 && <><h2>Anketler</h2><table className="gd-table"><tbody>{r.surveys.map((x: any, k: number) => <tr key={k}><td>{x.title}</td><td>{x.responded}/{x.invited}</td></tr>)}</tbody></table></>}</section>
      </div></>}
  </div>;
}

function ClassReport() {
  const [classes, setClasses] = useState<any[]>([]); const [classId, setClassId] = useState(''); const [r, setR] = useState<any>(null); const [error, setError] = useState('');
  useEffect(() => { api<any>('/api/guidance-center/students').then((s) => { const m = new Map<string, any>(); for (const st of s.students || []) if (st.classId) m.set(st.classId, { id: st.classId, name: st.className }); const list = [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr')); setClasses(list); if (list[0]) setClassId(list[0].id); }).catch((e) => setError(e.message)); }, []);
  useEffect(() => { setR(null); if (classId) api<any>(`/api/guidance-summary/class?classId=${encodeURIComponent(classId)}`).then(setR).catch((e) => setError(e.message)); }, [classId]);
  return <div className="gd">
    <div className="gd-head"><label>Sınıf<select value={classId} onChange={(e) => setClassId(e.target.value)}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{r && <div className="gd-actions"><button type="button" onClick={() => window.print()}>Yazdır</button></div>}</div>
    {error && <div className="alert error">{error}</div>}
    {r && <><div className="gd-stats"><div className="gd-stat"><strong>{r.summary.students}</strong><span>öğrenci</span></div><div className="gd-stat"><strong>{r.summary.withWarnings}</strong><span>erken uyarısı olan</span></div><div className="gd-stat"><strong>{r.summary.met}</strong><span>görüşülen</span></div><div className="gd-stat"><strong>{r.summary.withProgram}</strong><span>bu hafta programı olan</span></div><div className="gd-stat"><strong>{r.summary.supportPlans}</strong><span>aktif destek planı</span></div></div>
      <div className="gd-card gd-scroll"><table className="gd-table"><thead><tr><th>Öğrenci</th><th>Erken uyarı</th><th>Görüşme</th><th>Bu hafta program</th><th>Ölçme aracı</th><th>Destek planı</th></tr></thead><tbody>
        {r.students.map((s: any) => <tr key={s.id}><td><Link to={`/rehberlik/ogrenciler/${encodeURIComponent(s.id)}`}>{properCase(s.name)}</Link><br /><small className="muted">{s.number}</small></td>
          <td>{s.warnings.length ? s.warnings.map((w: any) => <span key={w.key} className="gd-chip medium" title={w.reason} style={{ marginRight: 4 }}>{SIGNAL[w.key] || w.key}</span>) : '—'}</td>
          <td>{s.meetings ? `${s.meetings} · ${dateTr(String(s.lastMeeting).slice(0, 10))}` : '—'}</td><td>{s.programCompletion != null ? pct(s.programCompletion) : '—'}</td><td>{s.tests || '—'}</td><td>{s.supportPlan === 'ACTIVE' ? 'Aktif' : s.supportPlan === 'CLOSED' ? 'Kapandı' : '—'}</td></tr>)}
      </tbody></table></div></>}
  </div>;
}

export function GuidanceReports() {
  const [tab, setTab] = useState('activity');
  return <div className="page gd">
    <div className="page-head"><div><span className="eyebrow">Rehberlik</span><h1>Raporlar</h1><p className="muted">Faaliyet raporu e-Rehberlik’e giriş için dönemin sayılarını verir. Sınıf raporu, sınıfınızın rehberlik görünümüdür. Öğrenci raporunu öğrencinin rehberlik dosyasından alabilirsiniz.</p></div></div>
    <div className="gd-tabs"><button type="button" className={tab === 'activity' ? 'on' : ''} onClick={() => setTab('activity')}>Faaliyet raporu</button><button type="button" className={tab === 'class' ? 'on' : ''} onClick={() => setTab('class')}>Sınıf raporu</button></div>
    {tab === 'activity' ? <ActivityReport /> : <ClassReport />}
  </div>;
}

export function ManagerGuidanceSummary() {
  return <div className="page gd">
    <div className="page-head"><div><span className="eyebrow">Kurum</span><h1>Rehberlik Özeti</h1><p className="muted">Okulun rehberlik çalışmalarının sayısal özeti. Öğrenci adları, görüşme notları ve mesaj içerikleri yalnız rehber öğretmendedir; burada görünmez.</p></div></div>
    <ActivityReport manager />
  </div>;
}

// ------------------------------------------------------------------ öğrenci raporu (tam / veli için)
export function StudentGuidanceReport() {
  const { id = '' } = useParams(); const [params, setParams] = useSearchParams();
  const parent = params.get('veli') === '1';
  const [d, setD] = useState<any>(null); const [plan, setPlan] = useState<any>(null); const [error, setError] = useState('');
  useEffect(() => {
    api<any>(`/api/guidance-center/students/${encodeURIComponent(id)}`).then(setD).catch((e) => setError(e.message));
    api<any>(`/api/guidance-report/students/${encodeURIComponent(id)}/support-plan`).then((r) => setPlan(r.plan)).catch(() => setPlan(null));
  }, [id]);
  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!d) return <div className="page"><p className="muted">Hazırlanıyor…</p></div>;
  const s = d.student;
  return <div className="page gd" style={{ maxWidth: 900 }}>
    <div className="gd-head gd-actions"><Link to={`/rehberlik/ogrenciler/${encodeURIComponent(id)}`}>Dosyaya dön</Link>
      <button type="button" className={!parent ? 'primary' : ''} onClick={() => setParams({})}>Rehber öğretmen için</button><button type="button" className={parent ? 'primary' : ''} onClick={() => setParams({ veli: '1' })}>Veli için (sade)</button>
      <button type="button" onClick={() => window.print()}>Yazdır / PDF</button></div>
    <section className="gd-card" style={{ background: '#fff' }}>
      <small>{nowLocal().date.split('-').reverse().join('.')}</small><h1 style={{ margin: '2px 0' }}>{parent ? 'Rehberlik Gelişim Özeti' : 'Öğrenci Rehberlik Raporu'}</h1>
      <p style={{ margin: 0 }}><b>{properCase(s.name)}</b> · {s.className} · No {s.number}</p>
      {parent && <p className="gd-note">Bu özet çocuğunuzun okuldaki gelişimini desteklemek için hazırlandı. Bir değerlendirme ya da tanı değildir; sorularınız için rehber öğretmenle görüşebilirsiniz.</p>}
      <h2>Devam</h2><p>Son {d.attendance.days} günde {d.attendance.absent} gün devamsızlık{d.attendance.late ? `, ${d.attendance.late} geç kalma` : ''}.</p>
      <h2>Denemeler</h2>{d.exams.length ? <table className="gd-table"><tbody>{d.exams.map((e: any, k: number) => <tr key={k}><td>{e.title}</td><td>{dateTr(e.exam_date)}</td><td><b>{Number(e.net).toLocaleString('tr-TR')}</b> net</td></tr>)}</tbody></table> : <p>Yayımlanmış deneme yok.</p>}
      <h2>Kazanım desteği</h2><p>{d.supportLoops.passed} kazanımda destek tamamlandı, {d.supportLoops.active} kazanımda devam ediyor.</p>
      {s.professions?.length > 0 && <><h2>Hedef meslekler</h2><p>{s.professions.join(', ')}</p></>}
      {plan && (!parent || plan.sharedWithParent) && <><h2>Destek planı</h2><p><b>Hedefler:</b> {plan.goals}</p><p><b>Yapılacaklar:</b> {plan.actions}</p>{plan.reviewDate && <p><b>Gözden geçirme:</b> {dateTr(plan.reviewDate)}</p>}</>}
      {!parent && <>
        <h2>Erken uyarılar</h2>{d.warnings.length ? <ul>{d.warnings.map((w: any) => <li key={w.key}>{SIGNAL[w.key]}: {w.reason}</li>)}</ul> : <p>Yok.</p>}
        <h2>Görüşmeler</h2>{d.meetings.length ? <table className="gd-table"><tbody>{d.meetings.filter((m: any) => m.status === 'DONE').map((m: any) => <tr key={m.id}><td>{dateTr(m.scheduled_at.slice(0, 10))}</td><td>{KIND[m.kind]} · {TOPIC[m.topic]}</td><td>{m.summary}</td></tr>)}</tbody></table> : <p>Yok.</p>}
        <h2>Ölçme araçları</h2>{d.assessments.length ? <ul>{d.assessments.map((a: any) => <li key={a.id}>{a.title} · {a.status === 'REVIEWED' ? 'incelendi' : 'yanıtlandı'}</li>)}</ul> : <p>Yok.</p>}
        <p className="gd-note">Gizli notlar bu rapora alınmaz ({d.privateRecordCount} kayıt). Bu rapor rehber öğretmenin çalışma belgesidir; paylaşmadan önce içeriğini gözden geçirin.</p></>}
      {parent && <div className="gp-sign" style={{ marginTop: 24 }}><span>Rehber öğretmen</span><span>Veli</span></div>}
    </section>
  </div>;
}
