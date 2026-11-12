import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { MESSAGE_CATEGORY, MESSAGE_STATUS, dateTr, properCase } from './labels';
import './guidance.css';

/**
 * "Rehber öğretmenime yaz" (owner, 12 Nov 2026): a student (by name or without one), a parent about their own child
 * or a teacher about a student of their class writes to the school's guidance service. Only the guidance teachers read
 * it. When the message speaks of harm, the screen shows 112 and Alo 147 straight away.
 */
export function WriteToCounselor() {
  const { user } = useAuth();
  const role = user?.role;
  const [mine, setMine] = useState<any>(null);
  const [category, setCategory] = useState(role === 'TEACHER' ? 'WORRY' : 'TALK');
  const [body, setBody] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api<any>('/api/guidance-center/messages/mine').then((r) => { setMine(r); if (r.students?.length === 1) setStudentId(r.students[0].id); }).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, []);
  const send = async () => {
    setBusy(true); setError(''); setSent(null);
    try {
      const r = await api<any>('/api/guidance-center/messages', { method: 'POST', body: JSON.stringify({ category, body, anonymous: role === 'STUDENT' && anonymous, studentId: role === 'STUDENT' ? null : studentId || null }) });
      setSent(r); setBody(''); await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const title = role === 'TEACHER' ? 'Rehbere Bildir' : role === 'PARENT' ? 'Rehber Öğretmeni' : 'Rehber Öğretmenime Yaz';
  const intro = role === 'TEACHER' ? 'Bir öğrenciyle ilgili gözleminizi ya da endişenizi okulun rehber öğretmenine iletin.'
    : role === 'PARENT' ? 'Çocuğunuzla ilgili konuşmak istediğiniz bir konuyu okulun rehber öğretmenine yazın; size dönüş yapılır.'
      : 'İçinden geçeni, bir sorunu ya da konuşmak istediğin bir konuyu rehber öğretmenine yazabilirsin. Mesajını yalnız rehber öğretmenin okur.';
  return <div className="page gd" style={{ maxWidth: 760 }}>
    <div className="page-head"><div><span className="eyebrow">Rehberlik</span><h1>{title}</h1><p className="muted">{intro}</p></div></div>
    <div className="gd-emergency" role="note"><strong>Acil bir durum varsa beklemeyin.</strong><span>Sen ya da bir başkası tehlikedeyse hemen güvendiğin bir yetişkine, öğretmenine ya da okul idaresine söyle.</span>
      <span><a href="tel:112">112 Acil Çağrı</a> · <a href="tel:147">Alo 147 Çocuk Destek Hattı</a></span></div>
    {error && <div className="alert error">{error}</div>}
    {sent && <div className={sent.urgent ? 'gd-emergency' : 'alert success'} role="status">
      {sent.urgent ? <><strong>Mesajın rehber öğretmenine acil olarak iletildi.</strong><span>Şu an kendini ya da bir arkadaşını güvende hissetmiyorsan hemen bir yetişkine söyle ya da ara:</span><span>{sent.emergency.lines.map((l: any) => <a key={l.number} href={`tel:${l.number}`} style={{ marginRight: 12 }}>{l.label}: {l.number}</a>)}</span></>
        : <>Mesajınız rehber öğretmenine iletildi. Teşekkürler.</>}
    </div>}
    <section className="gd-card gd-form">
      {role !== 'STUDENT' && <label>{role === 'PARENT' ? 'Çocuğunuz' : 'Öğrenci (isteğe bağlı)'}<select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
        {role === 'TEACHER' && <option value="">Genel bir konu</option>}
        {(mine?.students || []).map((s: any) => <option key={s.id} value={s.id}>{properCase(s.name)}{s.class_name ? ` · ${s.class_name}` : ''}</option>)}</select></label>}
      <label>Konu<select value={category} onChange={(e) => setCategory(e.target.value)}>{Object.entries(MESSAGE_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Mesaj<textarea value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} placeholder={role === 'STUDENT' ? 'Ne anlatmak istersin?' : 'Kısaca yazın'} /></label>
      {role === 'STUDENT' && <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
        <span>Adımı yazmadan gönder<br /><small className="gd-note">İsimsiz mesajda rehber öğretmen yalnız sınıfını görür; sana özel dönüş yapamaz. Bir arkadaşın için endişeleniyorsan isimsiz yazabilirsin.</small></span></label>}
      <div className="gd-actions"><button className="primary" type="button" disabled={busy || body.trim().length < 3 || (role === 'PARENT' && !studentId)} onClick={send}>Gönder</button></div>
    </section>
    {mine?.messages?.length > 0 && <section className="gd-card"><h2>Gönderdiklerim</h2><ul className="gd-list">{mine.messages.map((m: any) => <li key={m.id} className="gd-item">
      <div className="row"><strong>{MESSAGE_CATEGORY[m.category]}{m.student && role !== 'STUDENT' ? ` · ${properCase(m.student)}` : ''}</strong><span className="gd-chip">{MESSAGE_STATUS[m.status]}</span></div><p>{m.body}</p><small>{dateTr(m.created_at)}</small></li>)}</ul></section>}
  </div>;
}
