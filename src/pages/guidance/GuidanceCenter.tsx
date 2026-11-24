import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { AREA, KIND, MEETING_STATUS, MESSAGE_CATEGORY, MESSAGE_STATUS, SENDER, SIGNAL, TOPIC, TOPIC_AREA, dateTr, nowLocal, properCase, timeTr } from './labels';
import './guidance.css';

/**
 * Rehberlik merkezi R1 (owner, 11–12 Nov 2026): Bugün, Öğrenciler, öğrenci rehberlik dosyası, Görüşmeler, Erken Uyarı.
 * The system shows signals with their reasons; the guidance teacher decides. No case management.
 */

function useLoad<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const reload = () => { if (!path) return; setError(''); api<T>(path).then(setData).catch((e) => setError(e.message)); };
  useEffect(reload, [path, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, reload, setError };
}

function WarningChip({ w }: { w: any }) {
  return <span className={`gd-chip ${w.watched ? 'watch' : w.level === 'HIGH' ? 'high' : 'medium'}`} title={w.reason}>{SIGNAL[w.key] || w.key}{w.watched ? ' · izleniyor' : ''}</span>;
}

// ------------------------------------------------------------------ meeting form (also used from a message or a warning)
export function MeetingForm({ students, preset, onDone }: { students: any[]; preset?: { studentIds?: string[]; topic?: string; kind?: string; sourceMessageId?: string }; onDone: () => void }) {
  const now = nowLocal();
  const [kind, setKind] = useState(preset?.kind || 'INDIVIDUAL');
  const [topic, setTopic] = useState(preset?.topic || 'STUDY');
  const [area, setArea] = useState(TOPIC_AREA[preset?.topic || 'STUDY']);
  const [date, setDate] = useState(now.date);
  const [time, setTime] = useState('10:00');
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<string[]>(preset?.studentIds || []);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const shown = useMemo(() => { const f = filter.toLocaleLowerCase('tr-TR'); return students.filter((s) => !f || `${s.name} ${s.className || ''}`.toLocaleLowerCase('tr-TR').includes(f)).slice(0, 60); }, [students, filter]);
  const toggle = (id: string) => setPicked((p) => kind === 'GROUP' ? (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]) : [id]);
  const save = async () => {
    setBusy(true); setError('');
    try {
      await api('/api/guidance-center/meetings', { method: 'POST', body: JSON.stringify({ kind, area, topic, title: title || null, scheduledAt: `${date}T${time}`, studentIds: picked, sourceMessageId: preset?.sourceMessageId || null }) });
      onDone();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return <div className="gd-form">
    {error && <div className="alert error">{error}</div>}
    <div className="two">
      <label>Görüşme türü<select value={kind} onChange={(e) => { setKind(e.target.value); if (e.target.value !== 'GROUP') setPicked((p) => p.slice(0, 1)); }}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Konu<select value={topic} onChange={(e) => { setTopic(e.target.value); setArea(TOPIC_AREA[e.target.value]); }}>{Object.entries(TOPIC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Gelişim alanı<select value={area} onChange={(e) => setArea(e.target.value)}>{Object.entries(AREA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Tarih<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label>Saat<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      <label>Başlık (isteğe bağlı)<input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Örn. Deneme sonrası değerlendirme" /></label>
    </div>
    {!preset?.studentIds?.length && <>
      <label>{kind === 'GROUP' ? 'Öğrenciler (en az iki)' : 'Öğrenci'}<input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Ad ya da sınıf ara" /></label>
      <div className="gd-pick">{shown.map((s) => <label key={s.id}><input type={kind === 'GROUP' ? 'checkbox' : 'radio'} checked={picked.includes(s.id)} onChange={() => toggle(s.id)} />{properCase(s.name)} <small>{s.className}</small></label>)}</div>
    </>}
    <div className="gd-actions"><button className="primary" type="button" disabled={busy || !picked.length} onClick={save}>Görüşmeyi planla</button></div>
  </div>;
}

// ------------------------------------------------------------------ Bugün
export function GuidanceToday() {
  const { data, error, reload, setError } = useLoad<any>('/api/guidance-center/today');
  const students = useLoad<any>('/api/guidance-center/students');
  const [planFor, setPlanFor] = useState<any>(null);
  const navigate = useNavigate();
  const setStatus = async (id: string, status: string) => { try { await api(`/api/guidance-center/messages/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) }); reload(); } catch (e: any) { setError(e.message); } };
  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!data) return <div className="page"><p className="muted">Yükleniyor…</p></div>;
  const urgent = data.messages.filter((m: any) => m.urgent);
  return <div className="page gd">
    <div className="page-head"><div><span className="eyebrow">Rehberlik · {dateTr(data.date)}</span><h1>Bugün</h1><p className="muted">Mesajlar, bugünkü görüşmeler, izleme zamanı gelenler ve erken uyarılar tek yerde. Sistem öğrenciyi etiketlemez; her uyarının nedeni yazar, kararı siz verirsiniz.</p></div></div>
    <div className="gd-stats">
      <div className="gd-stat"><strong>{data.studentCount}</strong><span>rehberliğinizdeki öğrenci</span></div>
      <div className="gd-stat"><strong>{data.messages.length}</strong><span>açık mesaj{urgent.length ? ` · ${urgent.length} acil` : ''}</span></div>
      <div className="gd-stat"><strong>{data.meetings.length}</strong><span>bugünkü görüşme</span></div>
      <div className="gd-stat"><strong>{data.warningCount}</strong><span>erken uyarı</span></div>
    </div>
    {planFor && <section className="gd-card"><h2>Görüşme planla <button type="button" className="ghost" onClick={() => setPlanFor(null)}>Kapat</button></h2>
      <MeetingForm students={students.data?.students || []} preset={planFor} onDone={() => { setPlanFor(null); reload(); }} /></section>}
    <div className="gd-grid">
      <section className="gd-card">
        <h2>Mesajlar <small>“Rehber öğretmenime yaz”</small></h2>
        {!data.messages.length && <div className="empty">Açık mesaj yok.</div>}
        <ul className="gd-list">{data.messages.map((m: any) => <li key={m.id} className={`gd-item${m.urgent ? ' urgent' : ''}`}>
          <div className="row"><strong>{m.anonymous ? `İsimsiz öğrenci · ${m.class_name || 'sınıf yok'}` : `${properCase(m.student) || m.sender || ''}${m.class_name ? ` · ${m.class_name}` : ''}`}</strong>
            <span className="gd-chip">{SENDER[m.sender_role]} · {MESSAGE_CATEGORY[m.category]}</span>{m.urgent ? <span className="gd-chip high">Acil</span> : null}</div>
          <p>{m.body}</p>
          <small>{dateTr(m.created_at)} · {MESSAGE_STATUS[m.status]}</small>
          <div className="gd-actions">
            {!m.anonymous && m.student_id && <button className="primary" type="button" onClick={() => setPlanFor({ studentIds: [m.student_id], topic: m.category === 'PEER_BULLYING' ? 'PEER_BULLYING' : m.category === 'STUDY' ? 'STUDY' : m.category === 'FAMILY' ? 'FAMILY' : 'OTHER', kind: m.sender_role === 'PARENT' ? 'PARENT' : 'INDIVIDUAL', sourceMessageId: m.id })}>Görüşme planla</button>}
            {m.status === 'NEW' && <button type="button" onClick={() => setStatus(m.id, 'SEEN')}>Görüldü</button>}
            <button type="button" onClick={() => setStatus(m.id, 'CLOSED')}>Kapat</button>
          </div>
          {m.anonymous ? <small>İsimsiz mesaj: gönderen bilinmez. Sınıfa yönelik önleyici bir çalışma ya da sınıf rehber öğretmeniyle görüşme düşünebilirsiniz.</small> : null}
        </li>)}</ul>
      </section>
      <section className="gd-card">
        <h2>Bugünkü görüşmeler <Link to="/rehberlik/gorusmeler">Tümü</Link></h2>
        {!data.meetings.length && <div className="empty">Bugün planlı görüşme yok.</div>}
        <ul className="gd-list">{data.meetings.map((m: any) => <li key={m.id} className="gd-item"><div className="row"><strong>{timeTr(m.scheduled_at)} · {m.title || TOPIC[m.topic]}</strong><span className="gd-chip">{KIND[m.kind]}</span></div><small>{m.students.map(properCase).join(', ')}</small></li>)}</ul>
        <h2>İzleme zamanı gelenler</h2>
        {!data.followUps.length && <div className="empty">Bu hafta izleme tarihi gelen görüşme yok.</div>}
        <ul className="gd-list">{data.followUps.map((m: any) => <li key={m.id} className="gd-item"><div className="row"><strong>{m.students.map(properCase).join(', ')}</strong><span className="gd-chip">{dateTr(m.follow_up_date)}</span></div><small>{TOPIC[m.topic]}{m.next_step ? ` · Sonraki adım: ${m.next_step}` : ''}</small></li>)}</ul>
      </section>
      <section className="gd-card">
        <h2>Erken uyarı <Link to="/rehberlik/erken-uyari">Tümü</Link></h2>
        {!data.warnings.length && <div className="empty">Şu an uyarı yok.</div>}
        <ul className="gd-list">{data.warnings.map((w: any) => <li key={`${w.studentId}-${w.key}`} className="gd-item" role="button" tabIndex={0} onClick={() => navigate(`/rehberlik/ogrenciler/${encodeURIComponent(w.studentId)}`)} style={{ cursor: 'pointer' }}>
          <div className="row"><strong>{properCase(w.name)} <small>{w.className}</small></strong><WarningChip w={w} /></div><small>{w.reason}</small></li>)}</ul>
      </section>
    </div>
  </div>;
}

// ------------------------------------------------------------------ Öğrenciler
export function GuidanceStudents() {
  const { data, error } = useLoad<any>('/api/guidance-center/students');
  const [filter, setFilter] = useState('');
  const [onlyWarn, setOnlyWarn] = useState(false);
  const navigate = useNavigate();
  const rows = useMemo(() => { const f = filter.toLocaleLowerCase('tr-TR'); return (data?.students || []).filter((s: any) => (!f || `${s.name} ${s.className} ${s.number}`.toLocaleLowerCase('tr-TR').includes(f)) && (!onlyWarn || s.warnings.length)); }, [data, filter, onlyWarn]);
  return <div className="page gd">
    <div className="page-head"><div><span className="eyebrow">Rehberlik</span><h1>Öğrenciler</h1><p className="muted">Rehberliğini yaptığınız öğrenciler. Bir öğrenciye dokunun; rehberlik dosyası açılır.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    <div className="gd-head"><label style={{ flex: 1, minWidth: 220 }}>Ara<input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Ad, sınıf ya da numara" /></label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={onlyWarn} onChange={(e) => setOnlyWarn(e.target.checked)} />Yalnız uyarısı olanlar</label></div>
    {data && !data.students.length && <div className="empty">Size atanmış rehberlik sınıfı yok. Kurum yöneticiniz rehberlik atamasını yapınca öğrencileriniz burada görünür.</div>}
    {rows.length > 0 && <div className="gd-card gd-scroll"><table className="gd-table"><thead><tr><th>Öğrenci</th><th>Sınıf</th><th>Uyarılar</th><th>Son görüşme</th><th>Destek planı</th></tr></thead><tbody>
      {rows.map((s: any) => <tr key={s.id} className="click" onClick={() => navigate(`/rehberlik/ogrenciler/${encodeURIComponent(s.id)}`)}>
        <td><strong>{properCase(s.name)}</strong><br /><small className="muted">{s.number}</small></td><td>{s.className}</td>
        <td>{s.warnings.length ? <div className="gd-actions">{s.warnings.map((w: any) => <WarningChip key={w.key} w={w} />)}</div> : <span className="muted">—</span>}</td>
        <td>{s.lastMeeting ? dateTr(s.lastMeeting.slice(0, 10)) : <span className="muted">—</span>}</td>
        <td>{s.planStatus === 'ACTIVE' ? <span className="gd-chip ok">Aktif</span> : s.planStatus === 'CLOSED' ? <span className="gd-chip">Kapandı</span> : <span className="muted">—</span>}</td></tr>)}
    </tbody></table></div>}
  </div>;
}

// ------------------------------------------------------------------ öğrenci rehberlik dosyası
const TABS = [['general', 'Genel'], ['academic', 'Akademik'], ['tests', 'Testler'], ['meetings', 'Görüşmeler'], ['plan', 'Destek planı'], ['private', 'Gizli notlar']] as const;

export function GuidanceStudentFile() {
  const { id = '' } = useParams();
  const { data, error, reload } = useLoad<any>(`/api/guidance-center/students/${encodeURIComponent(id)}`, [id]);
  const [tab, setTab] = useState<string>('general');
  const [planning, setPlanning] = useState(false);
  if (error) return <div className="page"><div className="alert error">{error}</div><Link to="/rehberlik/ogrenciler">Öğrencilere dön</Link></div>;
  if (!data) return <div className="page"><p className="muted">Yükleniyor…</p></div>;
  const s = data.student;
  return <div className="page gd">
    <div className="page-head"><div><span className="eyebrow"><Link to="/rehberlik/ogrenciler">Öğrenciler</Link> · Rehberlik dosyası</span><h1>{properCase(s.name)}</h1>
      <p className="muted">{s.className} · No {s.number}{s.parents.length ? ` · Veli: ${s.parents.map((p: any) => p.name).join(', ')}` : ''}</p></div>
      <div className="gd-actions"><button className="primary" type="button" onClick={() => setPlanning((v) => !v)}>Görüşme planla</button><Link to={`/rehberlik/ogrenciler/${encodeURIComponent(s.id)}/rapor`}>Rapor</Link></div></div>
    {data.warnings.length > 0 && <div className="gd-card"><h2>Erken uyarı</h2><ul className="gd-list">{data.warnings.map((w: any) => <li key={w.key} className="gd-item"><div className="row"><WarningChip w={w} /></div><small>{w.reason}</small></li>)}</ul></div>}
    {planning && <section className="gd-card"><h2>Görüşme planla</h2><MeetingForm students={[{ id: s.id, name: s.name, className: s.className }]} preset={{ studentIds: [s.id] }} onDone={() => { setPlanning(false); reload(); setTab('meetings'); }} /></section>}
    <div className="gd-tabs" role="tablist">{TABS.map(([k, v]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{v}</button>)}</div>
    {tab === 'general' && <div className="gd-grid">
      <section className="gd-card"><h2>Devam <small>son {data.attendance.days} gün</small></h2>
        <div className="gd-stats"><div className="gd-stat"><strong>{data.attendance.absent}</strong><span>devamsız</span></div><div className="gd-stat"><strong>{data.attendance.late}</strong><span>geç</span></div><div className="gd-stat"><strong>{data.attendance.excused}</strong><span>izinli</span></div></div></section>
      <section className="gd-card"><h2>Rehberlik mesajları</h2>{!data.messages.length && <div className="empty">Bu öğrenciyle ilgili isimli mesaj yok.</div>}
        <ul className="gd-list">{data.messages.map((m: any) => <li key={m.id} className={`gd-item${m.urgent ? ' urgent' : ''}`}><div className="row"><strong>{SENDER[m.sender_role]} · {MESSAGE_CATEGORY[m.category]}</strong><small>{dateTr(m.created_at)} · {MESSAGE_STATUS[m.status]}</small></div><p>{m.body}</p></li>)}</ul></section>
    </div>}
    {tab === 'academic' && <div className="gd-grid">
      <section className="gd-card"><h2>Son denemeler</h2>{!data.exams.length && <div className="empty">Yayımlanmış deneme sonucu yok.</div>}
        <table className="gd-table"><tbody>{data.exams.map((e: any, k: number) => <tr key={k}><td>{e.title}<br /><small className="muted">{dateTr(e.exam_date)}</small></td><td><strong>{Number(e.net).toLocaleString('tr-TR')}</strong> net</td></tr>)}</tbody></table></section>
      <section className="gd-card"><h2>Kazanım destek döngüsü</h2><div className="gd-stats"><div className="gd-stat"><strong>{data.supportLoops.active}</strong><span>devam ediyor</span></div><div className="gd-stat"><strong>{data.supportLoops.passed}</strong><span>tamamlandı</span></div><div className="gd-stat"><strong>{data.supportLoops.review}</strong><span>öğretmen incelemesinde</span></div></div>
        {s.targetType && <p className="gd-note">Hedef: {s.targetType === 'LGS_SCHOOL' ? 'LGS okulu' : 'YKS programı'} seçilmiş.</p>}{s.professions?.length > 0 && <p className="gd-note">Hedef meslekler: {s.professions.join(', ')}</p>}</section>
    </div>}
    {tab === 'tests' && <section className="gd-card"><h2>Ölçme araçları <Link to="/guidance-tests">Ölçme Araçları</Link></h2>{!data.assessments.length && <div className="empty">Uygulanmış test yok.</div>}
      <ul className="gd-list">{data.assessments.map((a: any) => <li key={a.id} className="gd-item"><div className="row"><strong>{a.title}</strong><span className="gd-chip">{a.status === 'REVIEWED' ? 'İncelendi' : a.status === 'SUBMITTED' ? 'İnceleme bekliyor' : a.status}</span></div><small>{dateTr(a.created_at)}</small></li>)}</ul>
      {data.signals.length > 0 && <p className="gd-note">İncelenmiş gelişim sinyalleri: {data.signals.map((g: any) => `${g.signal_key} ${Math.round(g.score)}`).join(' · ')}. Bu sinyaller tanı değildir.</p>}</section>}
    {tab === 'meetings' && <MeetingList meetings={data.meetings} onChange={reload} />}
    {tab === 'plan' && <SupportPlanEditor studentId={s.id} />}
    {tab === 'private' && <PrivateNotes studentId={s.id} />}
  </div>;
}

function MeetingList({ meetings, onChange }: { meetings: any[]; onChange: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!meetings.length) return <div className="empty">Henüz görüşme yok.</div>;
  return <ul className="gd-list">{meetings.map((m: any) => <li key={m.id} className="gd-item">
    <div className="row"><strong>{dateTr(m.scheduled_at.slice(0, 10))} {timeTr(m.scheduled_at)} · {m.title || TOPIC[m.topic]}</strong>
      <span className="gd-actions"><span className="gd-chip">{KIND[m.kind]} · {AREA[m.area]}</span><span className={`gd-chip ${m.status === 'DONE' ? 'ok' : ''}`}>{MEETING_STATUS[m.status]}</span></span></div>
    {m.students && Array.isArray(m.students) && <small>{m.students.map((x: any) => properCase(x.name || x)).join(', ')}</small>}
    {m.summary && <p>{m.summary}</p>}
    {m.next_step && <small>Sonraki adım: {m.next_step}{m.follow_up_date ? ` · İzleme: ${dateTr(m.follow_up_date)}` : ''}</small>}
    {m.status === 'PLANNED' && (open === m.id ? <CompleteMeeting meeting={m} onDone={() => { setOpen(null); onChange(); }} /> : <div className="gd-actions"><button type="button" className="primary" onClick={() => setOpen(m.id)}>Tamamla</button><button type="button" onClick={async () => { await api(`/api/guidance-center/meetings/${encodeURIComponent(m.id)}`, { method: 'PATCH', body: JSON.stringify({ status: 'CANCELLED' }) }); onChange(); }}>İptal et</button></div>)}
  </li>)}</ul>;
}

function CompleteMeeting({ meeting, onDone }: { meeting: any; onDone: () => void }) {
  const [summary, setSummary] = useState(''); const [next, setNext] = useState(''); const [follow, setFollow] = useState(''); const [error, setError] = useState('');
  const save = async () => { setError(''); try { await api(`/api/guidance-center/meetings/${encodeURIComponent(meeting.id)}`, { method: 'PATCH', body: JSON.stringify({ status: 'DONE', summary, nextStep: next || null, followUpDate: follow || null }) }); onDone(); } catch (e: any) { setError(e.message); } };
  return <div className="gd-form">{error && <div className="alert error">{error}</div>}
    <label>Kısa özet (yalnız siz görürsünüz)<textarea value={summary} maxLength={4000} onChange={(e) => setSummary(e.target.value)} /></label>
    <div className="two"><label>Sonraki adım<input value={next} maxLength={1000} onChange={(e) => setNext(e.target.value)} placeholder="Örn. İki hafta sonra yeniden görüş" /></label><label>İzleme tarihi<input type="date" value={follow} onChange={(e) => setFollow(e.target.value)} /></label></div>
    <p className="gd-note">Hassas ayrıntıları “Gizli notlar”a yazın; özet de yalnız sizde kalır.</p>
    <div className="gd-actions"><button className="primary" type="button" disabled={!summary.trim()} onClick={save}>Görüşmeyi kaydet</button></div></div>;
}

function SupportPlanEditor({ studentId }: { studentId: string }) {
  const [plan, setPlan] = useState<any>(null); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  useEffect(() => { api<any>(`/api/guidance-report/students/${encodeURIComponent(studentId)}/support-plan`).then((r) => setPlan(r.plan || { goals: '', actions: '', reviewDate: '', status: 'ACTIVE' })).catch((e) => setError(e.message)); }, [studentId]);
  if (!plan) return error ? <div className="alert error">{error}</div> : <p className="muted">Yükleniyor…</p>;
  const save = async () => { setError(''); setNotice(''); try { await api(`/api/guidance-report/students/${encodeURIComponent(studentId)}/support-plan`, { method: 'PUT', body: JSON.stringify({ goals: plan.goals, actions: plan.actions, reviewDate: plan.reviewDate || null, status: plan.status, sharedWithStudent: !!plan.sharedWithStudent, sharedWithParent: !!plan.sharedWithParent }) }); setNotice('Destek planı kaydedildi.'); } catch (e: any) { setError(e.message); } };
  return <section className="gd-card gd-form"><h2>Destek planı {plan.version ? <small>sürüm {plan.version}</small> : null}</h2>
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert success">{notice}</div>}
    <label>Hedefler<textarea value={plan.goals || ''} onChange={(e) => setPlan({ ...plan, goals: e.target.value })} /></label>
    <label>Yapılacaklar<textarea value={plan.actions || ''} onChange={(e) => setPlan({ ...plan, actions: e.target.value })} /></label>
    <div className="two"><label>Gözden geçirme tarihi<input type="date" value={plan.reviewDate || ''} onChange={(e) => setPlan({ ...plan, reviewDate: e.target.value })} /></label>
      <label>Durum<select value={plan.status} onChange={(e) => setPlan({ ...plan, status: e.target.value })}><option value="ACTIVE">Aktif</option><option value="CLOSED">Kapandı</option></select></label></div>
    <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={!!plan.sharedWithStudent} onChange={(e) => setPlan({ ...plan, sharedWithStudent: e.target.checked })} />Öğrenciyle paylaş</label>
    <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={!!plan.sharedWithParent} onChange={(e) => setPlan({ ...plan, sharedWithParent: e.target.checked })} />Veliyle paylaş</label>
    <div className="gd-actions"><button className="primary" type="button" onClick={save}>Kaydet</button></div></section>;
}

function PrivateNotes({ studentId }: { studentId: string }) {
  const [rows, setRows] = useState<any[] | null>(null); const [body, setBody] = useState(''); const [error, setError] = useState('');
  const load = () => api<any>(`/api/guidance-report/students/${encodeURIComponent(studentId)}/private-records`).then((r) => setRows(r.records || [])).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, [studentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = async () => { setError(''); try { await api(`/api/guidance-report/students/${encodeURIComponent(studentId)}/private-records`, { method: 'POST', body: JSON.stringify({ body }) }); setBody(''); await load(); } catch (e: any) { setError(e.message); } };
  return <section className="gd-card gd-form"><h2>Gizli notlar <small>yalnız siz · değiştirilemez · her okuma kayda geçer</small></h2>
    {error && <div className="alert error">{error}</div>}
    <label>Yeni not<textarea value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} /></label>
    <div className="gd-actions"><button className="primary" type="button" disabled={!body.trim()} onClick={add}>Notu ekle</button></div>
    {rows && !rows.length && <div className="empty">Gizli not yok.</div>}
    <ul className="gd-list">{(rows || []).map((r) => <li key={r.id} className="gd-item"><small>{dateTr(r.created_at)} · {r.author}</small><p>{r.body}</p></li>)}</ul></section>;
}

// ------------------------------------------------------------------ Görüşmeler
export function GuidanceMeetings() {
  const { data, error, reload } = useLoad<any>('/api/guidance-center/meetings');
  const students = useLoad<any>('/api/guidance-center/students');
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming');
  const today = nowLocal().date;
  const list = (data?.meetings || []).filter((m: any) => view === 'upcoming' ? m.status === 'PLANNED' && m.scheduled_at.slice(0, 10) >= today : m.status !== 'PLANNED' || m.scheduled_at.slice(0, 10) < today);
  if (view === 'past') list.reverse();
  return <div className="page gd">
    <div className="page-head"><div><span className="eyebrow">Rehberlik</span><h1>Görüşmeler</h1><p className="muted">Bireysel, grup, veli ve öğretmen görüşmeleriniz. Özetler yalnız sizde kalır.</p></div>
      <div className="gd-actions"><button className="primary" type="button" onClick={() => setAdding((v) => !v)}>Yeni görüşme</button></div></div>
    {error && <div className="alert error">{error}</div>}
    {adding && <section className="gd-card"><h2>Yeni görüşme</h2><MeetingForm students={students.data?.students || []} onDone={() => { setAdding(false); reload(); }} /></section>}
    <div className="gd-tabs"><button type="button" className={view === 'upcoming' ? 'on' : ''} onClick={() => setView('upcoming')}>Yaklaşan</button><button type="button" className={view === 'past' ? 'on' : ''} onClick={() => setView('past')}>Geçmiş</button></div>
    {data && <MeetingList meetings={list} onChange={reload} />}
  </div>;
}

// ------------------------------------------------------------------ Erken Uyarı
export function GuidanceWarnings() {
  const { data, error, reload, setError } = useLoad<any>('/api/guidance-center/warnings');
  const students = useLoad<any>('/api/guidance-center/students');
  const [planFor, setPlanFor] = useState<any>(null);
  const decide = async (w: any, action: string) => { try { await api(`/api/guidance-center/warnings/${encodeURIComponent(w.studentId)}/${w.key}`, { method: 'POST', body: JSON.stringify({ action }) }); reload(); } catch (e: any) { setError(e.message); } };
  return <div className="page gd">
    <div className="page-head"><div><span className="eyebrow">Rehberlik</span><h1>Erken Uyarı</h1><p className="muted">Devamsızlık, deneme neti, kazanım destek döngüsü ve rehberlik mesajlarından gelen sinyaller. Her sinyalin nedeni yazar; sistem öğrenciyi etiketlemez. “Kapat” sinyali 30 gün gizler.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    {planFor && <section className="gd-card"><h2>Görüşme planla <button type="button" className="ghost" onClick={() => setPlanFor(null)}>Kapat</button></h2><MeetingForm students={students.data?.students || []} preset={planFor} onDone={() => setPlanFor(null)} /></section>}
    {data && !data.warnings.length && <div className="empty">Şu an erken uyarı yok.</div>}
    <ul className="gd-list">{(data?.warnings || []).map((w: any) => <li key={`${w.studentId}-${w.key}`} className={`gd-item${w.level === 'HIGH' && !w.watched ? ' urgent' : ''}`}>
      <div className="row"><strong><Link to={`/rehberlik/ogrenciler/${encodeURIComponent(w.studentId)}`}>{properCase(w.name)}</Link> <small>{w.className}</small></strong><WarningChip w={w} /></div>
      <small>{w.reason}</small>
      <div className="gd-actions"><button type="button" className="primary" onClick={() => setPlanFor({ studentIds: [w.studentId], topic: w.key === 'ATTENDANCE' ? 'ATTENDANCE' : w.key === 'NET_DROP' ? 'EXAM' : 'STUDY' })}>Görüşme planla</button>
        {w.watched ? <button type="button" onClick={() => decide(w, 'CLEAR')}>İzlemeyi bırak</button> : <button type="button" onClick={() => decide(w, 'WATCH')}>İzlemeye al</button>}
        <button type="button" onClick={() => decide(w, 'DISMISS')}>30 gün kapat</button></div>
    </li>)}</ul>
  </div>;
}
