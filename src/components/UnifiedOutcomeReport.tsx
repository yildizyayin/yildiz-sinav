import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api';
import './unified-outcome-report.css';

/**
 * Birleşik Karne (owner, 9 Nov 2026): one line per outcome from every source — exams, question bank, mini tests,
 * worksheets — with the institution's question target and the "learned" rule (last 30 days, 8 different questions,
 * 80%). Plain words for students and parents; the source breakdown for staff.
 */
const SOURCE: Record<string, string> = { EXAM: 'Sınav', QUESTION_BANK: 'Soru çözme', MINI_TEST: 'Mini test', FOY: 'Föy', WRITTEN: 'Yazılı', GAME: 'Mini oyun' };
const KINDS: Record<string, string> = { ONE_TO_ONE: 'Birebir çalışma', EXTRA_PRACTICE: 'Ek çalışma verildi', CLASS_REVIEW: 'Sınıfta tekrar', PARENT_CONTACT: 'Veliyle görüşme', GUIDANCE_REFERRAL: 'Rehberliğe yönlendirme', OTHER: 'Diğer' };
const pct = (v: number | null | undefined) => (v == null ? '—' : `%${Math.round(v * 100)}`);

export function UnifiedOutcomeReport({ studentId, role, institutionId }: { studentId: string; role: string; institutionId?: string }) {
  const [data, setData] = useState<any>(null); const [error, setError] = useState(''); const [filter, setFilter] = useState<'ALL' | 'DEVELOPING' | 'LEARNED'>('ALL');
  const learner = role === 'STUDENT' || role === 'PARENT';
  const canSetTarget = role === 'SUPER_ADMIN' || role === 'INSTITUTION_MANAGER';
  const [target, setTarget] = useState('');
  const staff = !learner;
  const [interventions, setInterventions] = useState<any[]>([]); const [openFor, setOpenFor] = useState(''); const [kind, setKind] = useState('ONE_TO_ONE'); const [note, setNote] = useState('');
  const loadInterventions = () => staff && studentId ? api<any>(`/api/reporting/students/${encodeURIComponent(studentId)}/interventions`).then((r) => setInterventions(r.interventions || [])).catch(() => setInterventions([])) : Promise.resolve();
  useEffect(() => { void loadInterventions(); }, [studentId, staff]); // eslint-disable-line react-hooks/exhaustive-deps
  const addIntervention = async (outcomeId: string) => {
    setError(''); try { await api<any>(`/api/reporting/students/${encodeURIComponent(studentId)}/interventions`, { method: 'POST', body: JSON.stringify({ outcomeId, kind, note: note.trim() || null }) }); setOpenFor(''); setNote(''); setNotice('Müdahale kaydedildi.'); await loadInterventions(); } catch (e: any) { setError(e.message); }
  };
  const withdraw = async (id: string) => { setError(''); try { await api<any>(`/api/reporting/students/${encodeURIComponent(studentId)}/interventions/${encodeURIComponent(id)}/withdraw`, { method: 'POST', body: '{}' }); await loadInterventions(); } catch (e: any) { setError(e.message); } };
  const [period, setPeriod] = useState<'NOW' | 'M3' | 'M6' | 'YEAR'>('NOW'); const [periods, setPeriods] = useState<any>(null); const [saving, setSaving] = useState(false); const [notice, setNotice] = useState('');
  const load = () => api<any>(`/api/reporting/students/${encodeURIComponent(studentId)}/outcome-evidence`).then((r) => { setData(r); setTarget(String(r.rules?.target || 30)); }).catch((e: any) => setError(e.message));
  useEffect(() => { if (!studentId) return; setData(null); setPeriods(null); setPeriod('NOW'); setError(''); void load(); }, [studentId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!studentId || period === 'NOW' || periods) return; void api<any>(`/api/reporting/students/${encodeURIComponent(studentId)}/outcome-evidence/periods`).then(setPeriods).catch((e: any) => setError(e.message)); }, [studentId, period, periods]);
  const activePeriod = period === 'NOW' ? null : periods?.periods?.find((p: any) => p.key === period);
  const periodStatus = (outcomeId: string) => periods?.trajectories?.find((t: any) => t.outcomeId === outcomeId)?.statuses?.[period] || null;
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
        <p>{learner ? 'Her konuda kaç farklı soru çözdüğün ve son bir ayda ne kadarını doğru yaptığın.' : 'Sınav, yazılı, soru çözme, mini test ve föyden gelen tüm cevaplar kazanım bazında tek kayıtta. Yazılıda maddenin puanının en az %70\'i alındıysa doğru sayılır.'}</p></div>
      {data && <div className="unified-summary"><strong>{learned}</strong><span>/ {all.length} kazanım öğrenildi</span></div>}
    </div>
    {error && <div className="alert error" role="alert">{error}</div>}
    {notice && <div className="alert success" role="status">{notice}</div>}
    {data && <p className="unified-rule">Öğrenildi sayılması için son {data.rules.learned.days} günde en az {data.rules.learned.minQuestions} farklı soru ve %{Math.round(data.rules.learned.minRate * 100)} doğru gerekir. Hedef: kazanım başına {data.rules.target} farklı soru.</p>}
    {data && all.length > 0 && <div className="unified-periods" role="tablist" aria-label="Karne dönemi">
      {([['NOW', 'Şu an'], ['M3', '3. ay'], ['M6', '6. ay'], ['YEAR', 'Yıl sonu']] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={period === k} className={period === k ? 'active' : ''} onClick={() => setPeriod(k)}>{l}</button>)}
    </div>}
    {period !== 'NOW' && !activePeriod && !error && <p className="muted">Dönem raporu hazırlanıyor…</p>}
    {activePeriod && <div className="unified-period-card">
      <p className="unified-rule">{activePeriod.label}: {new Date(`${activePeriod.from}T00:00:00`).toLocaleDateString('tr-TR')} – {new Date(`${activePeriod.to}T00:00:00`).toLocaleDateString('tr-TR')} · {activePeriod.state === 'COMPLETE' ? 'tamamlandı' : activePeriod.state === 'IN_PROGRESS' ? `devam ediyor (${new Date(`${activePeriod.asOf}T00:00:00`).toLocaleDateString('tr-TR')} itibarıyla)` : 'henüz başlamadı'}</p>
      <div className="unified-period-stats">
        <div><strong>{activePeriod.summary.learned}</strong><span>öğrenilen kazanım</span></div>
        <div><strong>{activePeriod.summary.developing}</strong><span>gelişen kazanım</span></div>
        <div><strong>{activePeriod.summary.uniqueQuestions}</strong><span>farklı soru</span></div>
        <div><strong>{pct(activePeriod.summary.recentRate)}</strong><span>son 30 gün doğru</span></div>
      </div>
    </div>}
    {data?.recommendations?.length > 0 && <div className="unified-recs">
      <h3>{learner ? 'Sıradaki çalışman' : 'Önerilen çalışma'}</h3>
      <ol>{data.recommendations.map((r: any) => <li key={r.outcomeId}>
        <div className="unified-title"><span className="unified-code">{r.code}</span><span>{r.title}</span></div>
        <p>{r.needForLearned > 0 ? `Öğrenildi sayılması için son 30 günde ${r.needForLearned} farklı soru daha${r.recentRate != null ? ` (şu an ${pct(r.recentRate)} doğru)` : ''}.` : `Son 30 gündeki doğru oranını %${Math.round(data.rules.learned.minRate * 100)}'e çıkarmak yeterli (şu an ${pct(r.recentRate)}).`}</p>
        <div className="unified-rec-actions">
          {r.practice.available > 0 && (role === 'STUDENT' ? <Link className="unified-rec-link" to={`/question-practice?nodeId=${encodeURIComponent(r.practice.nodeId)}`}>Bu konudan soru çöz ({r.practice.available})</Link> : <span className="unified-rec-tag">{r.practice.available} çözülmemiş onaylı soru</span>)}
          {r.worksheets.map((w: any) => <span className="unified-rec-tag" key={w.id}>Föy: {w.title}</span>)}
          {r.video && <a className="unified-rec-link" href={r.video.url} target="_blank" rel="noopener noreferrer">Konu videosu{r.video.title ? `: ${r.video.title}` : ''}</a>}
          {r.askTeacher && <span className="unified-rec-tag muted">Bu kazanım için henüz onaylı içerik yok{learner ? '; öğretmenine danışabilirsin' : ''}.</span>}
        </div>
      </li>)}</ol>
    </div>}
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
          {(() => { const st = period === 'NOW' ? o.status : periodStatus(o.outcomeId); return st ? <span className={`unified-chip ${st === 'LEARNED' ? 'ok' : 'dev'}`}>{st === 'LEARNED' ? 'Öğrenildi' : learner ? 'Çalışmaya devam' : 'Gelişiyor'}</span> : <span className="unified-chip none">Bu dönemde veri yok</span>; })()}
          <span>{o.uniqueQuestions} / {o.target} farklı soru</span>
          <span>son {o.recent.days} gün: {o.recent.uniqueQuestions ? `${o.recent.uniqueQuestions} soru, ${pct(o.recent.rate)}` : 'çalışma yok'}</span>
          {!learner && <span className="unified-sources">{Object.entries(o.bySource).filter(([, v]: any) => v.attempts).map(([k, v]: any) => `${SOURCE[k]} ${v.correct}/${v.attempts}`).join(' · ')}{o.attempts > o.uniqueQuestions ? ` · ${o.attempts} çözüm` : ''}</span>}
        </div>
        <div className="unified-bar" aria-hidden="true"><i style={{ width: `${Math.round(o.targetProgress * 100)}%` }} /></div>
        {staff && <div className="unified-interventions">
          {interventions.filter((i) => i.outcome_id === o.outcomeId).map((i) => <div key={i.id} className="unified-intervention"><strong>{KINDS[i.kind] || i.kind}</strong><span>{new Date(String(i.created_at).replace(' ', 'T') + 'Z').toLocaleDateString('tr-TR')} · {i.created_by_name}</span>{i.note && <em>{i.note}</em>}{i.mine && <button type="button" className="link-button" onClick={() => void withdraw(i.id)}>Geri al</button>}</div>)}
          {openFor === o.outcomeId ? <div className="unified-intervention-form">
            <label>Ne yapıldı<select value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label>Not (isteğe bağlı)<input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Kısa not" /></label>
            <div className="unified-intervention-actions"><button type="button" onClick={() => void addIntervention(o.outcomeId)}>Kaydet</button><button type="button" className="secondary" onClick={() => setOpenFor('')}>Vazgeç</button></div>
          </div> : <button type="button" className="link-button" onClick={() => { setOpenFor(o.outcomeId); setKind('ONE_TO_ONE'); setNote(''); }}>+ Müdahale ekle</button>}
        </div>}
      </li>)}</ul>
    </div>)}
  </section>;
}
