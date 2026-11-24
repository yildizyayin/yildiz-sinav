import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { SharedResources } from './ContentViews';
import './guidance.css';

/**
 * Rehberliğim (owner, 13 Nov 2026): "öğrenci sadece rehberin ona gönderdiği işleri görebilsin". One page that shows
 * only what the guidance teacher sent: this week's programme, tests they opened, surveys, shared resources, a support
 * plan, a diary they asked for and planned meeting times. "Rehberime yaz" is always there: the student must always be
 * able to reach the guidance teacher.
 */
const when = (s: string) => { const d = new Date(s.length > 10 ? s : `${s}T00:00`); return Number.isNaN(d.getTime()) ? s : d.toLocaleString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', ...(s.length > 10 ? { hour: '2-digit', minute: '2-digit' } : {}) }); };

export function StudentHub() {
  const [hub, setHub] = useState<any>(null); const [error, setError] = useState('');
  useEffect(() => { api<any>('/api/guidance-center/my-hub').then(setHub).catch((e) => setError(e.message)); }, []);
  const cards: { to: string; title: string; text: string; badge?: string }[] = [];
  if (hub?.program) cards.push({ to: '/bu-haftam', title: 'Bu haftaki programın', text: `Rehber öğretmenin bu hafta için ${hub.program.items} görevlik bir program hazırladı.`, badge: 'Yeni hafta' });
  if (hub?.tests?.todo) cards.push({ to: '/guidance-tests', title: 'Sana açılan test', text: `Rehber öğretmenin ${hub.tests.todo} test açtı; uygun bir zamanda doldurabilirsin.`, badge: `${hub.tests.todo} bekliyor` });
  if (hub?.surveys) cards.push({ to: '/guidance-tests', title: 'Anket', text: 'Okulunda isimsiz bir anket var; cevapların adınla eşleşmez.', badge: `${hub.surveys} anket` });
  if (hub?.diary) cards.push({ to: '/ekran-gunlugum', title: 'Ekran ve uyku günlüğü', text: `Rehber öğretmenin ${when(hub.diary.until)} tarihine kadar günde bir kez doldurmanı istedi.${hub.diary.note ? ` Not: ${hub.diary.note}` : ''}`, badge: 'Açık' });
  if (hub?.tests?.done && !hub.tests.todo) cards.push({ to: '/guidance-tests', title: 'Doldurduğun testler', text: `${hub.tests.done} testini doldurdun; rehber öğretmenin inceliyor ya da inceledi.` });
  return <div className="page gd" style={{ maxWidth: 820 }}>
    <div className="page-head"><div><span className="eyebrow">Rehberlik</span><h1>Rehberliğim</h1><p className="muted">Rehber öğretmeninin sana gönderdikleri burada görünür.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    {hub?.meetings?.length > 0 && <section className="gd-card"><h2>Görüşme</h2>{hub.meetings.map((m: string) => <p key={m} style={{ margin: '4px 0' }}>Rehber öğretmeninle <strong>{when(m)}</strong> görüşmen var.</p>)}</section>}
    {cards.length > 0 && <ul className="gd-list">{cards.map((c) => <li key={c.title} className="gd-item"><Link to={c.to} style={{ display: 'grid', gap: 4, textDecoration: 'none', color: 'inherit' }}><div className="row"><strong>{c.title}</strong>{c.badge && <span className="gd-chip ok">{c.badge}</span>}</div><span className="muted">{c.text}</span></Link></li>)}</ul>}
    {hub?.supportPlan && <section className="gd-card"><h2>Destek planın</h2><p className="muted">Rehber öğretmeninin seninle paylaştığı destek planı <Link to="/guidance-tests">burada</Link>.</p></section>}
    {hub?.resources > 0 && <SharedResources />}
    {hub && !hub.any && <section className="gd-card"><h2>Şimdilik bir şey yok</h2><p className="muted">Rehber öğretmenin sana bir program, test, anket ya da görev gönderdiğinde burada göreceksin.</p></section>}
    <section className="gd-card"><h2>Rehber öğretmenine yaz</h2><p className="muted">Bir şey seni üzüyorsa, biri sana zarar veriyorsa ya da sadece konuşmak istiyorsan rehber öğretmenine buradan yazabilirsin. İstersen adını göstermeden de yazabilirsin.</p><div className="gd-actions"><Link className="primary" to="/rehberime-yaz">Rehberime yaz</Link></div></section>
  </div>;
}
