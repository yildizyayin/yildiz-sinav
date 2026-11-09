import { useEffect, useMemo, useState } from 'react';
import { api, qs } from '../api';
import './unified-outcome-report.css';

/**
 * Birleşik Karne (owner, 9 Nov 2026): one line per outcome from every source — exams, question bank, mini tests,
 * worksheets — with the institution's question target and the "learned" rule (last 30 days, 8 different questions,
 * 80%). Plain words for students and parents; the source breakdown for staff.
 */
const SOURCE: Record<string, string> = { EXAM: 'Sınav', QUESTION_BANK: 'Soru çözme', MINI_TEST: 'Mini test', FOY: 'Föy' };
const pct = (v: number | null | undefined) => (v == null ? '—' : `%${Math.round(v * 100)}`);

export function UnifiedOutcomeReport({ studentId, role, institutionId }: { studentId: string; role: string; institutionId?: string }) {
  const [data, setData] = useState<any>(null); const [error, setError] = useState(''); const [filter, setFilter] = useState<'ALL' | 'DEVELOPING' | 'LEARNED'>('ALL');
  const learner = role === 'STUDENT' || role === 'PARENT';
  const canSetTarget = role === 'SUPER_ADMIN' || role === 'INSTITUTION_MANAGER';
  const [target, setTarget] = useState(''); const [saving, setSaving] = useState(false); const [notice, setNotice] = useState('');
  const load = () => api<any>(`/api/reporting/students/${encodeURIComponent(studentId)}/outcome-evidence`).then((r) => { setData(r); setTarget(String(r.rules?.target || 30)); }).catch((e: any) => setError(e.message));
  useEffect(() => { if (!studentId) return; setData(null); setError(''); void load(); }, [studentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const o of data?.outcomes || []) { if (filter !== 'ALL' && o.status !== filter) continue; const k = o.subjectName || 'Diğer'; if (!map.has(k)) map.set(k, []); map.get(k)!.push(o); }
    return [...map.entries()];
  }, [data, filter]);
  const all = data?.outcomes || [];
  const learned = all.filter((o: any) => o.status === 'LEARNED').length;
  const saveTarget = async () => {
    setSaving(true); setNotice(''); setError('');
    try { await api<any>(`/api/reporting/learning-settings${qs({ institutionId: role === 'SUPER_ADMIN' ? institutionId || null : null })}`, { method: 'PUT', body: JSON.stringify({ outcomeQuestionTarget: Number(target) }) }); setNotice('Kurumun kazanım başına soru hedefi kaydedildi.'); await load(); }
    catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };
  if (!studentId) return null;
  return <section className="panel unified-outcomes" aria-labelledby="unified-outcomes-title">
    <div className="panel-head unified-head">
      <div><h2 id="unified-outcomes-title">Kazanım karnesi</h2>
        <p>{learner ? 'Her konuda kaç farklı soru çözdüğün ve son bir ayda ne kadarını doğru yaptığın.' : 'Sınav, soru çözme, mini test ve föyden gelen tüm cevaplar kazanım bazında tek kayıtta.'}</p></div>
      {data && <div className="unified-summary"><strong>{learned}</strong><span>/ {all.length} kazanım öğrenildi</span></div>}
    </div>
    {error && <div className="alert error" role="alert">{error}</div>}
    {notice && <div className="alert success" role="status">{notice}</div>}
    {data && <p className="unified-rule">Öğrenildi sayılması için son {data.rules.learned.days} günde en az {data.rules.learned.minQuestions} farklı soru ve %{Math.round(data.rules.learned.minRate * 100)} doğru gerekir. Hedef: kazanım başına {data.rules.target} farklı soru.</p>}
    {canSetTarget && data && <div className="unified-target"><label>Kurumun kazanım başına soru hedefi<input type="number" min={20} max={100} step={1} value={target} onChange={(e) => setTarget(e.target.value)} /></label><button type="button" className="secondary" onClick={() => void saveTarget()} disabled={saving || Number(target) === data.rules.target}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button><small>20 ile 100 arası.</small></div>}
    {data && all.length > 0 && <div className="unified-filter" role="group" aria-label="Kazanım filtresi">
      {([['ALL', 'Tümü'], ['DEVELOPING', learner ? 'Çalışmam gerekenler' : 'Gelişiyor'], ['LEARNED', 'Öğrenildi']] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={filter === k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{l}</button>)}
    </div>}
    {!data && !error && <p className="muted">Yükleniyor…</p>}
    {data && !all.length && <div className="empty">Henüz kazanıma bağlı bir cevap yok. Sınav, soru çözme, mini test veya föy sonuçları geldikçe burada görünecek.</div>}
    {groups.map(([subject, items]) => <div className="unified-subject" key={subject}>
      <h3>{subject}</h3>
      <ul>{items.map((o: any) => <li key={o.outcomeId} className={`unified-row ${o.status === 'LEARNED' ? 'learned' : ''}`}>
        <div className="unified-title"><span className="unified-code">{o.code}</span><span>{o.title}</span></div>
        <div className="unified-meta">
          <span className={`unified-chip ${o.status === 'LEARNED' ? 'ok' : 'dev'}`}>{o.status === 'LEARNED' ? 'Öğrenildi' : learner ? 'Çalışmaya devam' : 'Gelişiyor'}</span>
          <span>{o.uniqueQuestions} / {o.target} farklı soru</span>
          <span>son {o.recent.days} gün: {o.recent.uniqueQuestions ? `${o.recent.uniqueQuestions} soru, ${pct(o.recent.rate)}` : 'çalışma yok'}</span>
          {!learner && <span className="unified-sources">{Object.entries(o.bySource).filter(([, v]: any) => v.attempts).map(([k, v]: any) => `${SOURCE[k]} ${v.correct}/${v.attempts}`).join(' · ')}{o.attempts > o.uniqueQuestions ? ` · ${o.attempts} çözüm` : ''}</span>}
        </div>
        <div className="unified-bar" aria-hidden="true"><i style={{ width: `${Math.round(o.targetProgress * 100)}%` }} /></div>
      </li>)}</ul>
    </div>)}
  </section>;
}
