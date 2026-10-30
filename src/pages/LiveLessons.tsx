import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Video, CalendarPlus, Radio, ExternalLink, XCircle } from 'lucide-react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';

type Lesson = { id: string; class_id: string; class_name: string; subject_name: string | null; title: string; teacher_name: string | null; starts_at: string; duration_minutes: number; provider: string; join_url: string | null; status: string; joinOpen?: boolean };
const PROVIDER: Record<string, string> = { ZOOM: 'Zoom', TEAMS: 'Microsoft Teams', MEET: 'Google Meet', OTHER: 'Diğer' };
const STAFF = ['INSTITUTION_MANAGER', 'TEACHER', 'GUIDANCE_TEACHER', 'SUPER_ADMIN'];
const fmt = (iso: string) => new Date(iso).toLocaleString('tr-TR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/** S048: the institution's own live lessons (its Zoom/Teams/Meet account); ANUNEX keeps the plan and the link. */
export function LiveLessons() {
  const { user } = useAuth();
  const staff = STAFF.includes(user?.role || '');
  const manager = user?.role === 'INSTITUTION_MANAGER' || user?.role === 'SUPER_ADMIN';
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [remote, setRemote] = useState<{ starts_on: string; ends_on: string; note: string | null } | null>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [institutionId, setInstitutionId] = useState('');
  const [form, setForm] = useState({ title: '', provider: 'ZOOM', joinUrl: '', startsAt: localInput(new Date(Date.now() + 3600000)), durationMinutes: 40, classIds: [] as string[] });
  const [mode, setMode] = useState({ startsOn: new Date().toISOString().slice(0, 10), endsOn: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [, setTick] = useState(0);
  const isSA = user?.role === 'SUPER_ADMIN';
  const q = isSA && institutionId ? `?institutionId=${encodeURIComponent(institutionId)}` : '';

  const load = () => api<any>(`/api/live-lessons${q}`).then((r) => { setLessons(r.lessons || []); setRemote(r.remoteMode || null); }).catch((e) => setError(e instanceof ApiError ? e.message : 'Dersler yüklenemedi.'));
  useEffect(() => { if (!isSA || institutionId) void load(); }, [institutionId]);
  useEffect(() => { if (!staff) { const t = setInterval(() => { setTick((v) => v + 1); void load(); }, 60000); return () => clearInterval(t); } }, [staff]);
  useEffect(() => { if (isSA) void api<any>('/api/institutions').then((r) => setInstitutions(r.institutions || [])).catch(() => setInstitutions([])); }, [isSA]);
  useEffect(() => { if (staff && (!isSA || institutionId)) void api<any>(`/api/classes${isSA ? `?institutionId=${encodeURIComponent(institutionId)}` : ''}`).then((r) => setClasses(r.classes || [])).catch(() => setClasses([])); }, [staff, institutionId]);

  const send = async (path: string, method: string, body: unknown, ok: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await api(path + q, { method, body: JSON.stringify({ ...(body as any), institutionId: institutionId || undefined }) }); setNotice(ok); await load(); return true; }
    catch (e) { setError(e instanceof ApiError ? e.message : 'İşlem tamamlanamadı.'); return false; }
    finally { setBusy(false); }
  };
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const done = await send('/api/live-lessons', 'POST', { ...form, startsAt: new Date(form.startsAt).toISOString() }, `${form.classIds.length} şube için canlı ders planlandı.`);
    if (done) setForm((f) => ({ ...f, title: '', joinUrl: '', classIds: [] }));
  };
  const grouped = useMemo(() => {
    const m = new Map<string, Lesson[]>();
    for (const l of lessons) { const k = new Date(l.starts_at).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }); m.set(k, [...(m.get(k) || []), l]); }
    return [...m.entries()];
  }, [lessons]);

  return <div className="page">
    <div className="page-head"><div><span className="eyebrow">Eğitim Operasyonu</span><h1>Canlı Ders</h1><p className="muted">{staff ? 'Kurumunuzun kendi Zoom, Teams veya Meet hesabıyla yaptığı dersleri planlayın; öğrenci ve veliler ANUNEX’te "Derse katıl" düğmesini görür.' : 'Kurumunuzun planladığı canlı dersler. Bağlantı ders başlamadan 15 dakika önce açılır.'}</p></div><Video size={40} /></div>
    {error && <div className="alert error">{error}</div>}
    {notice && <div className="alert success">{notice}</div>}
    {remote && <div className="alert info"><Radio size={16} /> <strong>Uzaktan eğitim modu:</strong> {new Date(remote.starts_on).toLocaleDateString('tr-TR')} – {new Date(remote.ends_on).toLocaleDateString('tr-TR')}{remote.note ? ` · ${remote.note}` : ''}</div>}
    {isSA && <section className="panel"><label>Kurum<select value={institutionId} onChange={(e) => setInstitutionId(e.target.value)}><option value="">Kurum seçin</option>{institutions.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label></section>}

    {staff && (!isSA || institutionId) && <section className="panel">
      <h2><CalendarPlus size={18} /> Canlı ders planla</h2>
      <form className="form-grid" onSubmit={create}>
        <label>Ders başlığı<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Örn. Matematik · Üslü sayılar" required /></label>
        <label>Platform<select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>{Object.entries(PROVIDER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Toplantı bağlantısı<input value={form.joinUrl} onChange={(e) => setForm({ ...form, joinUrl: e.target.value })} placeholder="https://…" inputMode="url" required /></label>
        <label>Başlangıç<input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} required /></label>
        <label>Süre (dakika)<input type="number" min={10} max={240} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} /></label>
        <fieldset style={{ gridColumn: '1 / -1' }}><legend>Şubeler</legend><div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>{classes.map((c: any) => <label key={c.id} className="check"><input type="checkbox" checked={form.classIds.includes(c.id)} onChange={(e) => setForm({ ...form, classIds: e.target.checked ? [...form.classIds, c.id] : form.classIds.filter((x) => x !== c.id) })} /> {c.name}</label>)}{!classes.length && <span className="muted">Şube bulunamadı.</span>}</div></fieldset>
        <div style={{ gridColumn: '1 / -1' }}><button className="primary" disabled={busy || !form.classIds.length}>Planla</button> <span className="muted">Görüntü, kayıt ve katılımcı yönetimi kurumunuzun kendi platform hesabındadır; ANUNEX yalnız bağlantıyı saklar.</span></div>
      </form>
    </section>}

    {manager && (!isSA || institutionId) && <section className="panel">
      <h2><Radio size={18} /> Uzaktan eğitim modu</h2>
      <p className="muted">Tatil, kapanma veya pandemi gibi dönemlerde açın; öğrenci ve velilerin canlı ders ekranında duyuru olarak görünür.</p>
      <div className="form-grid">
        <label>Başlangıç<input type="date" value={mode.startsOn} onChange={(e) => setMode({ ...mode, startsOn: e.target.value })} /></label>
        <label>Bitiş<input type="date" value={mode.endsOn} onChange={(e) => setMode({ ...mode, endsOn: e.target.value })} /></label>
        <label>Not<input value={mode.note} onChange={(e) => setMode({ ...mode, note: e.target.value })} placeholder="Örn. Okul kapalı; dersler programdaki saatlerde canlı yapılacak." /></label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="primary" disabled={busy} onClick={() => void send('/api/live-lessons/remote-mode', 'PUT', mode, 'Uzaktan eğitim modu kaydedildi.')}>Kaydet</button>{remote && <button className="secondary" disabled={busy} onClick={() => void send('/api/live-lessons/remote-mode', 'PUT', { off: true }, 'Uzaktan eğitim modu kapatıldı.')}>Kapat</button>}</div>
    </section>}

    <section className="panel">
      <h2>{staff ? 'Planlanan dersler (14 gün)' : 'Canlı derslerim'}</h2>
      {!grouped.length && <p className="muted">Planlanmış canlı ders yok.</p>}
      {grouped.map(([day, list]) => <div key={day} style={{ marginBottom: 14 }}>
        <h3 style={{ margin: '8px 0' }}>{day}</h3>
        {!staff ? <div className="live-cards">{list.map((l) => <div className="live-card" key={l.id}>
          <strong>{l.title}</strong>
          <span className="muted">{fmt(l.starts_at)} · {l.duration_minutes} dk · {PROVIDER[l.provider] || l.provider}{l.teacher_name ? ` · ${l.teacher_name}` : ''}</span>
          {l.joinOpen && l.join_url ? <a className="primary" href={l.join_url} target="_blank" rel="noopener noreferrer"><Video size={14} /> Derse katıl</a> : <span className="muted">Bağlantı ders saatinden 15 dakika önce açılır.</span>}
        </div>)}</div> : <div className="table-card"><table><thead><tr><th>Saat</th><th>Ders</th><th>Şube</th><th>Platform</th><th>{staff ? 'İşlem' : ''}</th></tr></thead><tbody>
          {list.map((l) => <tr key={l.id} style={l.status === 'CANCELLED' ? { opacity: .55 } : undefined}>
            <td>{fmt(l.starts_at)} · {l.duration_minutes} dk</td>
            <td><strong>{l.title}</strong>{l.teacher_name ? <div className="muted">{l.teacher_name}</div> : null}</td>
            <td>{l.class_name}</td>
            <td>{PROVIDER[l.provider] || l.provider}</td>
            <td>{l.status === 'CANCELLED' ? <span className="status neutral">İptal</span> : staff
              ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><a className="secondary" href={l.join_url || '#'} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Aç</a><Link className="secondary" to={`/attendance?classId=${encodeURIComponent(l.class_id)}&date=${l.starts_at.slice(0, 10)}`}>Yoklama</Link><button className="secondary" disabled={busy} onClick={() => { if (confirm('Bu canlı ders iptal edilsin mi?')) void send(`/api/live-lessons/${l.id}/cancel`, 'POST', {}, 'Ders iptal edildi.'); }}><XCircle size={14} /> İptal</button></div>
              : l.joinOpen && l.join_url ? <a className="primary" href={l.join_url} target="_blank" rel="noopener noreferrer"><Video size={14} /> Derse katıl</a> : <span className="muted">Bağlantı ders saatinde açılır</span>}</td>
          </tr>)}
        </tbody></table></div>}
      </div>)}
    </section>
  </div>;
}
