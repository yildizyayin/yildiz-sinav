import { useEffect, useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import { api } from '../api';
import '../exam-workspace.css';

type Outcome = { id: string; subject_id: string; code?: string; title: string };
type Question = { id: string; subject_id: string; question_no: number; subject_name?: string; outcome_ids: string[]; references: any[] };
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
  const [query, setQuery] = useState('');
  const load = async () => {
    setBusy(true); setError(''); setLoaded(false);
    try {
      const [data, catalog] = await Promise.all([
        api<any>(`/api/exam-definitions/${encodeURIComponent(examId)}/outcome-mappings`),
        api<any>(`/api/exam-definitions/${encodeURIComponent(examId)}/outcome-catalog`),
      ]);
      setQuestions((data.questions || []).map((q: Question) => ({ ...q, outcome_ids: q.outcome_ids || [], references: q.references || [] })));
      setRevision(data.revision); setOutcomes(catalog.outcomes || []); setStrict(data.outcomeMode ? data.outcomeMode === 'OFFICIAL_REQUIRED' : required); setMatches([]); setLoaded(true);
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
        const ids = found.filter(m => m.subjectId === q.subject_id && m.questionNo === q.question_no && m.outcomeId && ['CODE', 'TITLE'].includes(m.reason)).map(m => m.outcomeId!);
        return ids.length ? { ...q, outcome_ids: [...new Set([...q.outcome_ids, ...ids])] } : q;
      }));
      setNotice('Kod ve tam ifade eşleşmeleri seçildi. Belirsiz önerileri kontrol edip değişiklikleri kaydedin.');
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/exam-definitions/${encodeURIComponent(examId)}/outcome-mappings`, { method: 'PUT', body: JSON.stringify({ expectedRevision: revision, mappings: questions.map(q => ({ questionId: q.id, outcomeIds: q.outcome_ids })), outcomeMode: strict ? 'OFFICIAL_REQUIRED' : 'OPTIONAL' }) });
      await load(); setNotice('Kazanım eşleştirmeleri kaydedildi.'); onSaved?.();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const subjectIds = [...new Set(questions.map(q => q.subject_id))];
  return <section className="panel exam-outcome-editor"><div className="panel-head"><div><h2>Kazanım eşleştirmeleri</h2><p>Soru ve cevap anahtarını değiştirmeden kazanımları düzenleyin. Otomatik seçim yalnız resmî kapsam içindeki kod veya tam ifade eşleşmesiyle yapılır.</p></div><button className="ghost" disabled={busy} onClick={() => void load()}><RefreshCw size={15}/> Yenile</button></div>
    {error && <div className="alert error" role="alert">{error}</div>}{notice && <div className="alert success" role="status">{notice}</div>}
    <label className="exam-strict-toggle"><input type="checkbox" checked={strict} disabled={busy || !loaded} onChange={e => setStrict(e.target.checked)}/> Bütün aktif sorularda doğrulanmış kazanım zorunlu olsun</label>
    <div className="exam-filter-row"><label>Ders<select value={subject} onChange={e => setSubject(e.target.value)}><option value="">Tüm dersler</option>{subjectIds.map(id => <option key={id} value={id}>{questions.find(q => q.subject_id === id)?.subject_name || id}</option>)}</select></label><label>Katalogda ara<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Kazanım kodu veya açıklaması"/></label><button className="secondary" disabled={busy || !loaded} onClick={() => void match()}>Otomatik eşleştir</button></div>
    {loaded && !outcomes.length && <div className="alert warning">Bu sınavın yıl, sınıf ve program kapsamı için doğrulanmış resmî katalog bulunamadı. Kaynak ifadeler korunur; kazanımları daha sonra tamamlayabilirsiniz.</div>}
    <div className="table-card"><table><thead><tr><th>Ders / soru</th><th>Kaynak ifade</th><th>Resmî kazanım seçimi</th><th>Durum</th></tr></thead><tbody>{questions.filter(q => !subject || q.subject_id === subject).map(q => {
      const found = matches.find(m => m.subjectId === q.subject_id && m.questionNo === q.question_no);
      const available = outcomes.filter(o => o.subject_id === q.subject_id && (!query || q.outcome_ids.includes(o.id) || `${o.code || ''} ${o.title}`.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR'))));
      return <tr key={q.id}><td>{q.subject_name || q.subject_id}<br/><strong>Soru {q.question_no}</strong></td><td>{q.references.map((r: any) => r.publisherTitle || r.title || r.officialCode || r.code).filter(Boolean).join(' · ') || 'Kaynak ifade yok'}</td><td><select multiple size={Math.min(4, Math.max(2, available.length))} aria-label={`${q.subject_name || q.subject_id} soru ${q.question_no} kazanım seçimi`} value={q.outcome_ids} disabled={busy} onChange={e => { const ids = Array.from(e.target.selectedOptions, o => o.value); setQuestions(current => current.map(row => row.id === q.id ? { ...row, outcome_ids: ids } : row)); }}>{available.map(o => <option key={o.id} value={o.id}>{o.code ? `${o.code} · ` : ''}{o.title}</option>)}</select>{found?.reason === 'AMBIGUOUS' && <small>Birden fazla aday var; seçim yapın.</small>}{!!found?.suggestions?.length && <div className="exam-outcome-suggestions">{found.suggestions.map(o => <button key={o.id} className="ghost" disabled={busy} onClick={() => setQuestions(current => current.map(row => row.id === q.id ? { ...row, outcome_ids: [...new Set([...row.outcome_ids, o.id])] } : row))}>Öneri: {o.code || o.title}</button>)}</div>}</td><td><span className={`status ${q.outcome_ids.length ? 'ok' : strict ? 'error' : 'warn'}`}>{q.outcome_ids.length ? `${q.outcome_ids.length} seçili` : 'Eşleşme bekliyor'}</span></td></tr>;
    })}{loaded && !questions.length && <tr><td colSpan={4}>Önce sınavın ders ve soru yapısını kaydedin.</td></tr>}</tbody></table></div>
    <div className="exam-editor-footer"><small>Bir soruya birden fazla kazanım seçebilirsiniz. Eksik kazanımlar taslak kaydına engel olmaz.</small><button className="primary" disabled={busy || !loaded || !questions.length} onClick={() => void save()}><Save size={16}/> Kazanımları kaydet</button></div>
  </section>;
}
