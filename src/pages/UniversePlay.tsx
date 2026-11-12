import { BreakReminder } from '../components/universe/BreakReminder';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { UniversePlayer, UniverseResults } from '../components/universe/UniversePlayer';

/**
 * Nibiru Öğrenme Evreni: one play (owner, 11 Nov 2026). Opened from the learning map with an outcome and a game kind.
 * When the outcome has no suitable approved content the page says so plainly and offers a repeat, never a filler.
 */
export function UniversePlay() {
  const [q] = useSearchParams();
  const outcomeId = q.get('outcome') || '', templateCode = q.get('template') || 'LU_CHOICE';
  const [mode, setMode] = useState<'PRACTICE' | 'REVIEW'>(q.get('mode') === 'REVIEW' ? 'REVIEW' : 'PRACTICE');
  const [data, setData] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  const key = useRef(`pl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  useEffect(() => {
    setData(null); setError(null); setResult(null);
    api<any>('/api/student-standard/universe/sessions', { method: 'POST', body: JSON.stringify({ outcomeId, templateCode, mode, clientKey: `${key.current}-${mode}` }) })
      .then((r) => r.session.status === 'SUBMITTED' ? setResult(r) : setData(r))
      .catch((e: any) => setError({ message: e.message, data: e.details || null }));
  }, [outcomeId, templateCode, mode]);
  if (error) return <div className="panel" style={{ maxWidth: 760, margin: '0 auto', display: 'grid', gap: 10 }}>
    <div className="alert info">{error.message}</div>
    {error.data?.repeatAvailable > 0 && mode === 'PRACTICE' && <div><button className="secondary" onClick={() => setMode('REVIEW')}>Daha önce gördüklerimle tekrar yap ({error.data.repeatAvailable})</button></div>}
    <Link className="ghost" to="/evren">Öğrenme haritasına dön</Link>
  </div>;
  if (result) return <><UniverseResults data={result} /><div style={{ textAlign: 'center', marginTop: 12 }}><Link className="primary" to="/evren">Haritaya dön</Link></div></>;
  if (!data) return <div className="panel">Hazırlanıyor…</div>;
  return <>
    <div style={{ maxWidth: 760, margin: '0 auto 12px' }}><BreakReminder /></div>
    <div className="page-head" style={{ maxWidth: 760, margin: '0 auto' }}><div><span className="eyebrow">{data.session.template.title}{data.session.mode === 'REVIEW' ? ' · tekrar' : ''}</span><h1 style={{ fontSize: 'clamp(18px,3vw,24px)' }}>{data.session.outcome.code} · {data.session.outcome.title}</h1></div></div>
    <UniversePlayer data={data} onDone={setResult} />
  </>;
}
