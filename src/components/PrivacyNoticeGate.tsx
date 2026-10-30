import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api, ApiError } from '../api';

type Notice = { id: string; title: string; version: string; body: string | null; content_url: string | null };
type Pending = { purposeCode: string; title: string; purpose: string; studentId: string; studentName: string };

/**
 * S047: after login, a person reads and acknowledges the active KVKK aydınlatma metni for their role once per
 * version. A parent also sees the consent-based purposes the Super Admin has approved for their children
 * (18 yaş altı: rıza veliden). With no active notice and no approved purpose nothing is shown.
 */
export function PrivacyNoticeGate() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void api<any>('/api/privacy/notices/current').then((r) => { if (r.notice && !r.acknowledged) setNotice(r.notice); }).catch(() => undefined);
    void api<any>('/api/privacy/consents/pending').then((r) => setPending(r.pending || [])).catch(() => undefined);
  }, []);
  const acknowledge = async () => {
    setBusy(true); setError('');
    try { await api('/api/privacy/notices/acknowledge', { method: 'POST', body: JSON.stringify({ noticeVersionId: notice!.id, channel: 'WEB' }) }); setNotice(null); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Kaydedilemedi.'); }
    finally { setBusy(false); }
  };
  const decide = async (p: Pending, grant: boolean) => {
    setBusy(true); setError('');
    try {
      if (grant) await api('/api/privacy/consents', { method: 'POST', body: JSON.stringify({ purposeCode: p.purposeCode, studentId: p.studentId, channel: 'WEB' }) });
      setPending((list) => list.filter((x) => !(x.purposeCode === p.purposeCode && x.studentId === p.studentId)));
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Kaydedilemedi.'); }
    finally { setBusy(false); }
  };
  if (!notice && !pending.length) return null;
  return <div className="privacy-gate-overlay" role="presentation">
    <section className="privacy-gate-dialog" role="dialog" aria-modal="true" aria-labelledby="privacy-gate-title">
      {notice ? <>
        <h2 id="privacy-gate-title"><ShieldCheck size={20} /> {notice.title}</h2>
        <p className="muted">KVKK aydınlatma metni · sürüm {notice.version}</p>
        <div className="privacy-gate-text">{notice.body || (notice.content_url ? <a href={notice.content_url} target="_blank" rel="noopener noreferrer">Metni aç</a> : 'Metin yüklenemedi.')}</div>
        {error && <div role="alert" className="alert error">{error}</div>}
        <footer><button className="primary" disabled={busy} onClick={() => void acknowledge()}>Okudum, bilgilendirildim</button></footer>
      </> : <>
        <h2 id="privacy-gate-title"><ShieldCheck size={20} /> Veli onayı</h2>
        <p className="muted">18 yaşından küçük öğrenciler için aşağıdaki işlemlerde onay veliden alınır. Onay vermek isteğe bağlıdır ve istediğiniz zaman geri alınabilir.</p>
        {pending.map((p) => <div key={`${p.purposeCode}:${p.studentId}`} className="list-card" style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
          <strong>{p.title} · {p.studentName}</strong><span className="muted">{p.purpose}</span>
          <div style={{ display: 'flex', gap: 8 }}><button className="primary" disabled={busy} onClick={() => void decide(p, true)}>Onaylıyorum</button><button className="secondary" disabled={busy} onClick={() => void decide(p, false)}>Şimdi değil</button></div>
        </div>)}
        {error && <div role="alert" className="alert error">{error}</div>}
      </>}
    </section>
  </div>;
}
