import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from '../api';
import './test-check-dialog.css';

/**
 * "Göndermeden önce son bir kontrol" (owner, 27 Nov 2026): before a test first reaches students — homework, print or
 * the board — the teacher confirms the questions suit the class; the responsibility is the teacher's. Asked once per
 * set of questions: changing a question asks again. The confirmation is recorded with who and when.
 */
export function TestCheckDialog({ testId, onConfirmed, onCancel, onReview }: { testId: string; onConfirmed: () => void; onCancel: () => void; onReview?: () => void }) {
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const box = useRef<HTMLInputElement | null>(null);
  useEffect(() => { box.current?.focus(); }, []);
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [onCancel]);
  const confirm = async () => {
    setBusy(true); setError('');
    try { await api(`/api/teacher-tests/${encodeURIComponent(testId)}/check`, { method: 'POST', body: JSON.stringify({ confirm: true }) }); onConfirmed(); }
    catch (e: any) { setError(e.message || 'Onay kaydedilemedi.'); setBusy(false); }
  };
  return <div className="tcd-layer">
    <div className="tcd" role="dialog" aria-modal="true" aria-labelledby="tcd-title">
      <span className="tcd-icon" aria-hidden="true"><ShieldCheck size={28} /></span>
      <h2 id="tcd-title">Göndermeden önce son bir kontrol</h2>
      <p className="tcd-q">Bu testteki soruların sınıfınızın düzeyine, kurumunuzun öğretim anlayışına ve ders planınıza uygun olduğunu kontrol ettiniz mi?</p>
      <p className="tcd-note">ANUNEX havuzundaki sorular yayın ekibimizce incelenmiştir. Ancak testin sınıfınıza uygunluğuna son kararı siz verirsiniz; testi gönderme sorumluluğu öğretmene aittir.</p>
      <label className="tcd-check"><input ref={box} type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />Soruları kontrol ettim, testi sınıfım için uygun buluyorum.</label>
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="tcd-actions">
        {onReview ? <button type="button" className="tcd-ghost" onClick={onReview}>Soruları bir daha göster</button> : <button type="button" className="tcd-ghost" onClick={onCancel}>Vazgeç</button>}
        <button type="button" className="tcd-go" disabled={!ok || busy} onClick={() => void confirm()}>{busy ? 'Kaydediliyor…' : 'Onayla ve devam et'}</button>
      </div>
    </div>
  </div>;
}
