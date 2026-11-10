import { useEffect, useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import { api } from '../api';

/**
 * Nibiru kazanım döngüsü, staff side: students the loop handed to a teacher. Only the class's subject and guidance
 * teachers (and managers) see a row; closing it records what was done as a Birleşik Karne intervention.
 */
const KINDS: Record<string, string> = { ONE_TO_ONE: 'Birebir çalışma', EXTRA_PRACTICE: 'Ek çalışma verildi', CLASS_REVIEW: 'Sınıfta tekrar', PARENT_CONTACT: 'Veliyle görüşme', GUIDANCE_REFERRAL: 'Rehberliğe yönlendirme', OTHER: 'Diğer' };
const REASONS: Record<string, string> = {
  GAME_NOT_ENOUGH: 'Video, mini test ve mini oyundan sonra yeterli değil',
  NOT_ENOUGH_QUESTIONS: 'Mini test için yeterli onaylı soru yok',
  NO_GAME_QUESTIONS: 'Mini test geçilemedi; mini oyun için soru yok',
};
const title = (v: string) => String(v || '').toLocaleLowerCase('tr-TR').replace(/(^|\s)\S/g, (c) => c.toLocaleUpperCase('tr-TR'));
const date = (v: string | null) => v ? new Date(v.replace(' ', 'T') + (v.includes('Z') ? '' : 'Z')).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) : '';

export function OutcomeSupportQueue() {
  const [status, setStatus] = useState<'TEACHER_REVIEW' | 'CLOSED'>('TEACHER_REVIEW');
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState('');
  const [kind, setKind] = useState('ONE_TO_ONE');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async (s = status) => { setError(''); try { setRows((await api<any>(`/api/reporting/outcome-loops?status=${s}`)).loops || []); } catch (e: any) { setError(e.message); setRows([]); } };
  useEffect(() => { void load(status); }, [status]);
  const close = async (id: string) => {
    setBusy(true); setError('');
    try { await api(`/api/reporting/outcome-loops/${encodeURIComponent(id)}/close`, { method: 'POST', body: JSON.stringify({ kind, note }) }); setOpen(''); await load(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return <>
    <div className="page-head"><div><span className="eyebrow">Nibiru kazanım döngüsü</span><h1>Kazanım desteği bekleyen öğrenciler</h1>
      <p>Video, mini test ve mini oyundan sonra hâlâ zorlanan ya da ölçülecek sorusu olmayan öğrenciler. Yalnız size atanmış sınıf ve dersler.</p></div></div>
    <div className="segmented" role="tablist" aria-label="Liste" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      <button type="button" role="tab" aria-selected={status === 'TEACHER_REVIEW'} className={status === 'TEACHER_REVIEW' ? 'primary' : 'ghost'} onClick={() => setStatus('TEACHER_REVIEW')}>Bekleyenler</button>
      <button type="button" role="tab" aria-selected={status === 'CLOSED'} className={status === 'CLOSED' ? 'primary' : 'ghost'} onClick={() => setStatus('CLOSED')}>Kapatılanlar</button>
    </div>
    {error && <div className="alert error" role="alert">{error}</div>}
    {rows === null ? <div className="panel">Yükleniyor…</div> : !rows.length ? <div className="panel"><p className="muted" style={{ margin: 0 }}><LifeBuoy size={16} aria-hidden="true" /> {status === 'CLOSED' ? 'Kapatılmış kayıt yok.' : 'Şu an desteğinizi bekleyen öğrenci yok.'}</p></div> :
      <div className="panel" style={{ display: 'grid', gap: 0, padding: 0 }}>{rows.map((r) => <div key={r.id} style={{ display: 'grid', gap: 6, padding: '14px 16px', borderBottom: '1px solid var(--border,#e5e7eb)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <strong>{title(`${r.first_name || ''} ${r.last_name || ''}`)}{r.class_name ? <span className="muted" style={{ fontWeight: 500 }}> · {r.class_name}</span> : null}</strong>
          <small className="muted">{status === 'CLOSED' ? `Kapatıldı: ${date(r.closed_at)}` : `Bildirim: ${date(r.notified_at || r.created_at)}`}</small>
        </div>
        <span>{r.subject_name} · {r.outcome_code ? `${r.outcome_code} ` : ''}{r.outcome_title}</span>
        <small className="muted">{REASONS[r.teacher_reason] || 'Öğretmen desteği gerekiyor'}
          {r.mini_total ? ` · Mini test ${r.mini_correct}/${r.mini_total}` : ''}{r.game_total ? ` · Mini oyun ${r.game_correct}/${r.game_total}` : ''}</small>
        {status === 'TEACHER_REVIEW' && (open === r.id ? <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
          <label>Ne yaptınız?<select value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Not (isteğe bağlı, yalnız personel görür)<textarea maxLength={500} rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <div style={{ display: 'flex', gap: 8 }}><button type="button" className="primary" disabled={busy} onClick={() => void close(r.id)}>Kaydet ve kapat</button><button type="button" className="ghost" disabled={busy} onClick={() => setOpen('')}>Vazgeç</button></div>
        </div> : <div><button type="button" className="secondary" onClick={() => { setOpen(r.id); setKind('ONE_TO_ONE'); setNote(''); }}>Çalıştım, kapat</button></div>)}
      </div>)}</div>}
  </>;
}
