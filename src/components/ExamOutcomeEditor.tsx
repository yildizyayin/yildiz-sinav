import '../pages/approved-answer-outcomes.css';
import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import { api } from '../api';
import '../exam-workspace.css';

type Outcome = { id: string; subject_id: string; code?: string; title: string; unit?: string | null; topic?: string | null };
type Question = { id: string; subject_id: string; question_no: number; subject_name?: string; outcome_ids: string[]; references: any[]; catalog_subject_ids?: string[] };
type Match = { subjectId: string; questionNo: number; outcomeId?: string; reason: string; suggestions?: Outcome[] };
export function ExamOutcomeEditor({ examId, required = false, onSaved }: { examId: string; required?: boolean; onSaved?: () => void }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [revision, setRevision] = useState(0);
  const [strict, setStrict] = useState(required);
  const [matches, setMatches] = useState<Match[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [subject, setSubject] = useState('');
  const [catalogYear, setCatalogYear] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // A022: what was last saved, so unsaved choices are visible and not lost by leaving the page.
  const [saved, setSaved] = useState<Record<string, string>>({});
  // A029: results that already exist are re-analysed on save; say so before and after.
  const [results, setResults] = useState<{ count: number; app: boolean; network: boolean }>({ count: 0, app: false, network: false });
  const signature = (ids: string[]) => [...ids].sort().join('|');
  const dirty = useMemo(() => questions.filter(q => signature(q.outcome_ids) !== (saved[q.id] ?? '')).length, [questions, saved]);
  useEffect(() => { if (!dirty) return; const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  const byId = useMemo(() => new Map(outcomes.map(o => [o.id, o])), [outcomes]);
  const setIds = (qid: string, ids: string[]) => setQuestions(current => current.map(row => row.id === qid ? { ...row, outcome_ids: [...new Set(ids)] } : row));
  const label = (o: Outcome) => `${o.code ? `${o.code} · ` : ''}${o.title}`;
  const load = async () => {
    setBusy(true); setError(''); setLoaded(false);
    try {
      const [data, catalog] = await Promise.all([
        api<any>(`/api/exam-definitions/${encodeURIComponent(examId)}/outcome-mappings`),
        api<any>(`/api/exam-definitions/${encodeURIComponent(examId)}/outcome-catalog`),
      ]);
      const rows = (data.questions || []).map((q: Question) => ({ ...q, outcome_ids: q.outcome_ids || [], references: q.references || [] }));
      setQuestions(rows); setSaved(Object.fromEntries(rows.map((q: Question) => [q.id, signature(q.outcome_ids)])));
      setRevision(data.revision); setResults({ count: Number(data.resultCount) || 0, app: !!data.appPublished, network: !!data.networkPublished }); setOutcomes(catalog.outcomes || []); setCatalogYear(data.catalogYear || null); setStrict(data.outcomeMode ? data.outcomeMode === 'OFFICIAL_REQUIRED' : required); setMatches([]); setLoaded(true);
    } catch (e: any) { setError(e.message || 'Kazanımlar yüklenemedi.'); } finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, [examId]);
  const match = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const entries = questions.flatMap(q => q.references.map(reference => ({ subjectId: q.subject_id, questionNo: q.question_no, reference })));
      if (!entries.length) { setNotice('Kaynak kazanım ifadesi yok. Aşağıdaki resmî katalogdan manuel seçim yapabilirsiniz.'); return; }
      const result = await api<any>(`/api/exam-definitions/${encodeURIComponent(examId)}/outcome-match-preview`, { method: 'POST', body: JSON.stringify({ entries }) });
      const found: Match[] = result.matches || []; setMatches(found);
      setQuestions(current => current.map(q => {
        const ids = found.filter(m => m.subjectId === q.subject_id && m.questionNo === q.question_no && m.outcomeId && ['CODE', 'TITLE', 'APPROVED'].includes(m.reason)).map(m => m.outcomeId!);
        return ids.length ? { ...q, outcome_ids: [...new Set([...q.outcome_ids, ...ids])] } : q;
      }));
      const suggested = found.filter(m => !m.outcomeId && m.suggestions?.length).length;
      setNotice(`${found.filter(m => m.outcomeId).length} soru otomatik eşleşti (MEB kodu, aynı ifade ya da daha önce onayladığınız eşleşme). ${suggested ? `${suggested} soru için öneri var: kontrol edip "Önerileri kabul et" ile onaylayın, sonra kaydedin. Onayladıklarınız bu yayınevinin sonraki sınavlarında kendiliğinden eşleşir.` : ''}`);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const pending = matches.filter(m => !m.outcomeId && m.suggestions?.length && !questions.find(q => q.subject_id === m.subjectId && q.question_no === m.questionNo)?.outcome_ids.length);
  const acceptSuggestions = () => {
    setQuestions(current => current.map(q => { const m = pending.find(x => x.subjectId === q.subject_id && x.questionNo === q.question_no); return m ? { ...q, outcome_ids: [m.suggestions![0].id] } : q; }));
    setNotice(`${pending.length} öneri seçildi. "Kazanımları kaydet" ile onaylayın.`);
  };
  const save = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await api<any>(`/api/exam-definitions/${encodeURIComponent(examId)}/outcome-mappings`, { method: 'PUT', body: JSON.stringify({ expectedRevision: revision, mappings: questions.map(q => ({ questionId: q.id, outcomeIds: q.outcome_ids })), outcomeMode: strict ? 'OFFICIAL_REQUIRED' : 'OPTIONAL' }) });
      const reanalysed = Number(r?.participantCount) || 0;
      await load();
      setNotice(reanalysed ? `Kazanım eşleştirmeleri kaydedildi. ${reanalysed} katılımcının kazanım analizi yeniden yapıldı (analiz sürümü ${r.revision}); puan ve sıralama değişmedi.${results.app ? ' Uygulamada yayınlanmış sonuçlarda yeni kazanımlar görünür.' : ''}${results.network ? ' Sonuç ağında eski analiz kalır; güncellemek için sonuç ağı yayınını ayrıca güncelleyin.' : ''}` : 'Kazanım eşleştirmeleri kaydedildi.');
      onSaved?.();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const subjectIds = [...new Set(questions.map(q => q.subject_id))];
  return <section className="panel exam-outcome-editor approved-outcome-editor"><div className="panel-head"><div><h2>Kazanım eşleştirmeleri</h2><p>Soru ve cevap anahtarını değiştirmeden kazanımları düzenleyin. Otomatik seçim yalnız resmî kapsam içindeki kod veya tam ifade eşleşmesiyle yapılır.</p></div><button className="ghost" disabled={busy} onClick={() => void load()}><RefreshCw size={15}/> Yenile</button></div>
    {error && <div className="alert error" role="alert">{error}</div>}{notice && <div className="alert success" role="status">{notice}</div>}
    {results.count > 0 && <div className="alert warning" role="note">Bu sınavın {results.count} sonucu var. Kaydettiğinizde bu sonuçların kazanım analizi yeniden yapılır; puan, net ve sıralama değişmez, önceki analiz sürümü saklanır.{results.app ? ' Öğrenci ve veliler, uygulamada yayınlanmış sonuçta yeni kazanımları görür.' : ''}{results.network ? ' Sonuç ağı, siz yayını güncelleyene kadar önceki analizi gösterir.' : ''}</div>}
    <label className="exam-strict-toggle"><input type="checkbox" checked={strict} disabled={busy || !loaded} onChange={e => setStrict(e.target.checked)}/> Bütün aktif sorularda doğrulanmış kazanım zorunlu olsun</label>
    <div className="exam-filter-row"><label>Ders<select value={subject} onChange={e => setSubject(e.target.value)}><option value="">Tüm dersler</option>{subjectIds.map(id => <option key={id} value={id}>{questions.find(q => q.subject_id === id)?.subject_name || id}</option>)}</select></label><label>Katalogda ara<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Kazanım kodu veya açıklaması"/></label><button className="secondary" disabled={busy || !loaded} onClick={() => void match()}>Otomatik eşleştir</button>{pending.length > 0 && <button className="primary" disabled={busy} onClick={acceptSuggestions}>Önerileri kabul et ({pending.length})</button>}</div>{catalogYear && <div className="alert info" role="note">MEB kataloğu: {catalogYear} doğrulanmış program.</div>}
    {loaded && !outcomes.length && <div className="alert warning">Bu sınavın yıl, sınıf ve program kapsamı için doğrulanmış resmî katalog bulunamadı. Kaynak ifadeler korunur; kazanımları daha sonra tamamlayabilirsiniz.</div>}
    <div className="table-card"><table><thead><tr><th>Ders / soru</th><th>Kaynak ifade</th><th>Resmî kazanım seçimi</th><th>Durum</th></tr></thead><tbody>{questions.filter(q => !subject || q.subject_id === subject).map(q => {
      const found = matches.find(m => m.subjectId === q.subject_id && m.questionNo === q.question_no);
      const available = outcomes.filter(o => (q.catalog_subject_ids || [q.subject_id]).includes(o.subject_id) && (!query || q.outcome_ids.includes(o.id) || `${o.code || ''} ${o.title}`.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR'))));
      return <tr key={q.id}><td>{q.subject_name || q.subject_id}<br/><strong>Soru {q.question_no}</strong></td><td>{q.references.map((r: any) => r.publisherTitle || r.title || r.officialCode || r.code).filter(Boolean).join(' · ') || 'Kaynak ifade yok'}</td><td><select multiple size={Math.min(4, Math.max(2, available.length))} aria-label={`${q.subject_name || q.subject_id} soru ${q.question_no} kazanım seçimi`} value={q.outcome_ids} disabled={busy} onChange={e => { const ids = Array.from(e.target.selectedOptions, o => o.value); setQuestions(current => current.map(row => row.id === q.id ? { ...row, outcome_ids: ids } : row)); }}>{(() => { const groups = new Map<string, Outcome[]>(); for (const o of available) { const k = o.unit || o.topic || 'Kazanımlar'; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(o); } return groups.size > 1 ? [...groups.entries()].map(([k, list]) => <optgroup key={k} label={k}>{list.map(o => <option key={o.id} value={o.id}>{label(o)}</option>)}</optgroup>) : available.map(o => <option key={o.id} value={o.id}>{label(o)}</option>); })()}</select>
      {q.outcome_ids.length > 0 && <div className="exam-outcome-chips">{q.outcome_ids.map(id => { const o = byId.get(id); return <span key={id} className="exam-outcome-chip" title={o ? label(o) : id}>{o?.code || o?.title || id}<button type="button" aria-label={`${o?.code || id} kazanımını kaldır`} disabled={busy} onClick={() => setIds(q.id, q.outcome_ids.filter(x => x !== id))}>×</button></span>; })}</div>}{found?.reason === 'AMBIGUOUS' && <small>Birden fazla aday var; seçim yapın.</small>}{!!found?.suggestions?.length && <div className="exam-outcome-suggestions">{found.suggestions.map(o => <button key={o.id} className="ghost" disabled={busy} title={label(o)} onClick={() => setIds(q.id, [...q.outcome_ids, o.id])}>Öneri: {o.code ? `${o.code} · ${o.title}` : o.title}</button>)}</div>}</td><td><span className={`status ${q.outcome_ids.length ? 'ok' : strict ? 'error' : 'warn'}`}>{q.outcome_ids.length ? `${q.outcome_ids.length} seçili` : 'Eşleşme bekliyor'}</span></td></tr>;
    })}{loaded && !questions.length && <tr><td colSpan={4}>Önce sınavın ders ve soru yapısını kaydedin.</td></tr>}</tbody></table></div>
    <div className="exam-editor-footer"><small>Bir soruya birden fazla kazanım seçebilirsiniz. Eksik kazanımlar taslak kaydına engel olmaz.</small>{dirty > 0 && <span className="exam-outcome-dirty" role="status">{dirty} soruda kaydedilmemiş değişiklik</span>}<button className="primary" disabled={busy || !loaded || !questions.length} onClick={() => void save()}><Save size={16}/> Kazanımları kaydet</button></div>
  </section>;
}
