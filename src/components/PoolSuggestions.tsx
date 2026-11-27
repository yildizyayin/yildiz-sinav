import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * Yayın ekibi · Öğretmen önerileri (owner, 27 Nov 2026: "Beyan + yayın ekibi onayı"). Questions teachers offered to
 * the shared pool, with their declaration. Nothing enters the pool from here: the team writes the question in the
 * pool (Soru havuzu → Yeni soru ekle), approves it through the normal review, then records the decision here.
 */
type S = { id: string; institution: string; teacher: string; gradeLevel: number | null; subject: string | null; correctAnswer: string | null; note: string | null; statement: string; status: string; reviewNote: string | null; questionBankId: string | null; createdAt: string };
const STATUSES: Array<[string, string]> = [['PENDING', 'Bekleyen'], ['ACCEPTED', 'Kabul edilen'], ['REJECTED', 'Reddedilen']];

export function PoolSuggestions() {
  const [status, setStatus] = useState('PENDING');
  const [rows, setRows] = useState<S[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = () => api<any>(`/api/admin/pool-suggestions?status=${status}`).then((r) => { setRows(r.suggestions || []); setCounts(r.counts || {}); }).catch((e) => setError(e?.message || 'Öneriler yüklenemedi.'));
  useEffect(() => { setRows(null); void load(); }, [status]);
  const decide = async (s: S, decision: 'ACCEPTED' | 'REJECTED', note: string, questionBankId: string) => {
    setError(''); setNotice('');
    try { await api(`/api/admin/pool-suggestions/${encodeURIComponent(s.id)}/decide`, { method: 'POST', body: JSON.stringify({ decision, note, questionBankId }) }); setNotice(decision === 'ACCEPTED' ? 'Öneri kabul edildi; öğretmen sonucu görecek.' : 'Öneri reddedildi; öğretmen nedenini görecek.'); await load(); }
    catch (e: any) { setError(e?.message || 'Karar kaydedilemedi.'); }
  };
  return <div className="module-card pool-sugg">
    <div className="module-heading"><div><span className="eyebrow">Yayın ekibi</span><h2>Öğretmenlerin havuza önerdiği sorular</h2>
      <p>Öğretmen soruyu kendisinin yazdığını ya da kurumuna ait olduğunu beyan etti. Uygunsa soruyu <b>Soru havuzu → Yeni soru ekle</b> ile havuza yazın, normal incelemeden geçirin ve kimliğini buraya girin.</p></div></div>
    <div className="pool-sugg-tabs" role="tablist">{STATUSES.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={status === k} className={status === k ? 'active' : ''} onClick={() => setStatus(k)}>{l} <span>{counts[k] || 0}</span></button>)}</div>
    {error && <div className="alert error" role="alert">{error}</div>}
    {notice && <div className="alert success" role="status">{notice}</div>}
    {!rows ? <p className="muted">Yükleniyor…</p> : !rows.length ? <p className="muted">Bu listede öneri yok.</p>
      : <div className="pool-sugg-list">{rows.map((s) => <Card key={s.id} s={s} onDecide={decide} />)}</div>}
  </div>;
}

function Card({ s, onDecide }: { s: S; onDecide: (s: S, d: 'ACCEPTED' | 'REJECTED', note: string, qid: string) => Promise<void> }) {
  const [qid, setQid] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async (d: 'ACCEPTED' | 'REJECTED') => { setBusy(true); await onDecide(s, d, note, qid); setBusy(false); };
  return <article className="pool-sugg-card">
    <img src={`/api/admin/pool-suggestions/${encodeURIComponent(s.id)}/image`} alt="Önerilen soru" loading="lazy" />
    <div className="pool-sugg-body">
      <p className="pool-sugg-meta"><b>{s.teacher}</b> · {s.institution}{s.gradeLevel ? ` · ${s.gradeLevel}. sınıf` : ''}{s.subject ? ` · ${s.subject}` : ''} · cevap <b>{s.correctAnswer || '—'}</b></p>
      {s.note && <p className="pool-sugg-note">“{s.note}”</p>}
      <p className="pool-sugg-statement">Beyan: {s.statement}</p>
      {s.status === 'PENDING' ? <div className="pool-sugg-actions">
        <label>Havuza yazılan sorunun kimliği<input value={qid} onChange={(e) => setQid(e.target.value)} placeholder="q_…" /></label>
        <label>Öğretmene not<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ret nedeni ya da teşekkür" maxLength={400} /></label>
        <div><button type="button" className="primary" disabled={busy || !qid.trim()} onClick={() => void go('ACCEPTED')}>Kabul et</button> <button type="button" className="secondary" disabled={busy || note.trim().length < 3} onClick={() => void go('REJECTED')}>Reddet</button></div>
      </div> : <p className="pool-sugg-meta">{s.status === 'ACCEPTED' ? `Kabul edildi · havuz sorusu ${s.questionBankId}` : 'Reddedildi'}{s.reviewNote ? ` · “${s.reviewNote}”` : ''}</p>}
    </div>
  </article>;
}
