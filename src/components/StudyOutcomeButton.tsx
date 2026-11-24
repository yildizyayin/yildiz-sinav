import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { api } from '../api';

/** Opens (or continues) the Nibiru outcome loop for a wrong/blank deneme question. */
export function StudyOutcomeButton({ examQuestionId, outcomeId, className = 'primary subtle' }: { examQuestionId: string; outcomeId?: string | null; className?: string }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const start = async () => {
    setBusy(true); setError('');
    try {
      const r = await api<any>('/api/nibiru/coach/loops', { method: 'POST', body: JSON.stringify({ examQuestionId, outcomeId: outcomeId || undefined }) });
      navigate(`/kazanim-calismasi/${encodeURIComponent(r.loop.id)}`);
    } catch (e: any) { setError(e.message); setBusy(false); }
  };
  return <span style={{ display: 'inline-grid', gap: 4 }}>
    <button type="button" className={className} disabled={busy} onClick={() => void start()}><Sparkles size={14} aria-hidden="true" /> {busy ? 'Hazırlanıyor…' : 'Bu kazanımı çalış'}</button>
    {error && <small className="muted" role="alert" style={{ maxWidth: 260 }}>{error}</small>}
  </span>;
}
