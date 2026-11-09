import { useMemo, useState } from 'react';
import { IdCard, Printer } from 'lucide-react';
import { api } from '../api';
import './student-access-cards.css';

type Row = { id: string; first_name: string; last_name: string; student_number?: string | null; grade_level?: number | null; section?: string | null; student_user_id?: string | null };
type Card = { studentId: string; name: string; gradeLevel: number | null; section: string | null; studentNumber: string; username: string; password: string };

/**
 * Owner (9 Nov): an institution opens its students' app accounts class by class and prints sign-in cards.
 * Username = institution code + student number; the temporary password is shown only here, once, and must be changed
 * at the first sign-in. SMS delivery comes later (Netgsm).
 */
export function StudentAccessCards({ institutionId, students, onDone, sendInstitution }: { institutionId: string; students: Row[]; onDone: () => void; sendInstitution: boolean }) {
  const classOf = (s: Row) => `${s.grade_level ?? '—'}/${s.section || '—'}`;
  const classes = useMemo(() => [...new Set(students.map(classOf))].sort((a, b) => a.localeCompare(b, 'tr', { numeric: true })), [students]);
  const [klass, setKlass] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [result, setResult] = useState<{ institution: { name: string; code: string }; created: Card[]; skipped: Array<{ name: string; reason: string }> } | null>(null);
  const inClass = students.filter((s) => !klass || classOf(s) === klass);
  const waiting = inClass.filter((s) => !s.student_user_id);
  const withoutNumber = waiting.filter((s) => !String(s.student_number || '').trim());
  const open = async () => {
    if (!waiting.length) return;
    if (!window.confirm(`${waiting.length} öğrencinin app hesabı açılacak${withoutNumber.length ? ` (${withoutNumber.length} öğrencinin numarası yok, onlar atlanır)` : ''}. Şifreler yalnız bir kez gösterilecek; kartları hemen yazdırın. Devam edilsin mi?`)) return;
    setBusy(true); setError('');
    try {
      const r = await api<any>('/api/students/access-accounts/auto', { method: 'POST', body: JSON.stringify({ institutionId: sendInstitution ? institutionId : undefined, studentIds: waiting.map((s) => s.id) }) });
      setResult(r); onDone();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  if (result) return <section className="panel-card sac-result">
    <div className="card-title sac-noprint"><IdCard size={19} /><div><strong>{result.created.length} hesap açıldı</strong><small>Şifreler yalnız şimdi görünür. Kartları yazdırmadan bu sayfadan çıkmayın; öğrenci ilk girişte şifresini değiştirir.</small></div></div>
    {!!result.skipped.length && <div className="alert warning sac-noprint"><strong>{result.skipped.length} öğrenci atlandı</strong><ul>{result.skipped.map((s, i) => <li key={i}>{s.name}: {s.reason}</li>)}</ul></div>}
    <div className="sac-actions sac-noprint"><button className="primary" type="button" onClick={() => window.print()}><Printer size={16} /> Kartları yazdır</button><button className="ghost" type="button" onClick={() => { if (window.confirm('Kartları kapatırsanız şifreler bir daha gösterilmez. Yazdırdınız mı?')) setResult(null); }}>Kapat</button></div>
    <div className="sac-cards" aria-label="Giriş kartları">{result.created.map((c) => <article className="sac-card" key={c.studentId}>
      <header><strong>ANUNEX</strong><span>{result.institution.name}</span></header>
      <h3>{c.name}</h3><p className="sac-meta">{c.gradeLevel ?? ''}{c.section ? `/${c.section}` : ''} · No {c.studentNumber}</p>
      <dl><dt>Adres</dt><dd>app.anunex.com</dd><dt>Kullanıcı adı</dt><dd><code>{c.username}</code></dd><dt>Geçici şifre</dt><dd><code>{c.password}</code></dd></dl>
      <footer>İlk girişte yeni şifreni belirle. Bu kartı kimseyle paylaşma.</footer>
    </article>)}</div>
  </section>;
  return <section className="panel-card sac">
    <div className="card-title"><IdCard size={19} /><div><strong>Sınıf sınıf hesap aç ve giriş kartı yazdır</strong><small>Kullanıcı adı kurum kodu + öğrenci no olur; geçici şifre ilk girişte değişir.</small></div></div>
    {error && <div className="alert error">{error}</div>}
    <div className="sac-row"><label>Sınıf<select value={klass} onChange={(e) => setKlass(e.target.value)}><option value="">Tüm sınıflar</option>{classes.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
      <p className="sac-count"><strong>{waiting.length}</strong> öğrencinin hesabı yok{withoutNumber.length ? <> · <span className="warning">{withoutNumber.length} numarasız (elle açılır)</span></> : null} · {inClass.length - waiting.length} hesap açık</p></div>
    <button className="primary" type="button" disabled={busy || waiting.length === 0} onClick={() => void open()}>{busy ? 'Açılıyor…' : `${waiting.length} hesabı aç ve kartları hazırla`}</button>
  </section>;
}
