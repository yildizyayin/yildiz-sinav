import { useEffect, useMemo, useRef, useState } from 'react';
import { api, qs } from '../api';

type Run = { id: string; completedAt: string };
type Source = 'practice' | 'mini-test';
const sourceName = (source: string) => source === 'EXAM' ? 'Sınav' : source === 'MINI_TEST' ? 'Yeni soru mini testi' : 'Soru pratiği';

export function useRunSelection(studentId: string, year: string, source: Source, maximum: number) {
 const scope = JSON.stringify([studentId, year]);
 const [runs, setRuns] = useState<Run[]>([]), [selected, setSelected] = useState<string[]>([]);
 const [cursor, setCursor] = useState<string | null>(null), [loadedScope, setLoadedScope] = useState('');
 const [restricted, setRestricted] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [activityScope, setActivityScope] = useState('');
 const scopeRef = useRef(scope), generation = useRef(0), seenCursors = useRef(new Set<string>());
 scopeRef.current = scope;
 useEffect(() => {
  generation.current++; setRuns([]); setSelected([]); setCursor(null); setLoadedScope('');
  setRestricted(false); setBusy(false); setError(''); seenCursors.current.clear();
 }, [scope]);
 useEffect(() => () => { generation.current++; }, []);
 const loaded = loadedScope === scope;
 const load = async (more: boolean) => {
  const requestScope = scope, attempt = ++generation.current, requestedCursor = more && loaded ? cursor : null;
  setActivityScope(requestScope); setBusy(true); setError('');
  if (!more) { setSelected([]); setLoadedScope(''); seenCursors.current.clear(); }
  try {
   const result = await api<any>('/api/reporting/students/' + encodeURIComponent(studentId) + '/' + source + '-runs' + qs({ academicYear: year, limit: 50, cursor: requestedCursor }));
   if (scopeRef.current !== requestScope || generation.current !== attempt) return;
   const page: Run[] = Array.isArray(result.runs) ? result.runs.filter((run: any) => typeof run?.id === 'string' && run.id.length > 0 && run.id.length <= 100 && typeof run.completedAt === 'string').slice(0, 50) : [];
   setRuns(previous => [...new Map([...(more ? previous : []), ...page].map(run => [run.id, run])).values()]);
   setLoadedScope(requestScope); setRestricted(Boolean(result.restrictedToSubjects));
   if (requestedCursor) seenCursors.current.add(requestedCursor);
   const next = typeof result.nextCursor === 'string' && result.nextCursor.length > 0 ? result.nextCursor : null;
   if (next && (next.length > 512 || seenCursors.current.has(next))) {
    setCursor(null); setError('Liste devamı geçersiz veya tekrarlandı. Gösterilen kayıtlar korunuyor; listeyi yeniden yükleyin.');
   } else setCursor(next);
  } catch (e: any) {
   if (scopeRef.current === requestScope && generation.current === attempt) setError(e.message || 'Kayıtlar alınamadı.');
  } finally {
   if (scopeRef.current === requestScope && generation.current === attempt) setBusy(false);
  }
 };
 const toggle = (id: string) => setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id) : previous.length < maximum ? [...previous, id] : previous);
 return { runs: loaded ? runs : [], selected: loaded ? selected : [], cursor: loaded ? cursor : null, loaded, restricted: loaded && restricted, busy: activityScope === scope && busy, error: activityScope === scope ? error : '', load, toggle, maximum };
}

export function RunSelector({ selection, title, empty, valid }: { selection: ReturnType<typeof useRunSelection>; title: string; empty: string; valid: boolean }) {
 return <div style={{ marginTop: 16 }}>
  <h3>{title}</h3>
  <button className="secondary" onClick={() => void selection.load(false)} disabled={selection.busy || !valid}>{selection.busy ? 'Yükleniyor…' : title + ' Kayıtlarını Yükle'}</button>
  {selection.error && <div className="alert error" role="alert">{selection.error}</div>}
  {selection.restricted && <div className="alert info">Yalnız yetkili branşınızdaki kayıtlar gösteriliyor.</div>}
  {selection.loaded && <>
   <p>{selection.selected.length} kayıt seçili · En fazla {selection.maximum} kayıt. Her sayfada en fazla 50 kayıt yüklenir.</p>
   <div className="cards-list">{selection.runs.map((run, index) => <label className="list-card" key={run.id} style={{ alignItems: 'center', cursor: 'pointer' }}>
    <input type="checkbox" checked={selection.selected.includes(run.id)} disabled={!selection.selected.includes(run.id) && selection.selected.length >= selection.maximum} onChange={() => selection.toggle(run.id)}/>
    <div><strong>{title} {index + 1}</strong><span>{new Date(run.completedAt).toLocaleString('tr-TR')}</span></div>
   </label>)}</div>
   {!selection.runs.length && <div className="empty">{empty}</div>}
   {selection.cursor && <button className="secondary" disabled={selection.busy} onClick={() => void selection.load(true)}>{selection.busy ? 'Yükleniyor…' : 'Daha Fazla Kayıt Yükle'}</button>}
  </>}
 </div>;
}

export function FrozenPracticeReport({ studentId, exams = [], selectedExamIds = [] }: { studentId: string; exams?: any[]; selectedExamIds?: string[] }) {
 const years = useMemo(() => [...new Set(exams.map(e => e.academic_year).filter(y => typeof y === 'string' && /^\d{4}-\d{4}$/.test(y)))].sort().reverse() as string[], [exams]);
 const [year, setYear] = useState(''), [mode, setMode] = useState<'FIRST' | 'LATEST'>('LATEST'), [includeExams, setIncludeExams] = useState(false);
 const [reportBusy, setReportBusy] = useState(false), [reportError, setReportError] = useState(''), [reportActivityKey, setReportActivityKey] = useState(''), [data, setData] = useState<any>(null);
 const chosenYear = year || years[0] || '';
 const validYear = /^\d{4}-\d{4}$/.test(chosenYear) && Number(chosenYear.slice(5)) === Number(chosenYear.slice(0, 4)) + 1;
 const practice = useRunSelection(studentId, chosenYear, 'practice', 100), mini = useRunSelection(studentId, chosenYear, 'mini-test', 20);
 const examIds = [...new Set(selectedExamIds.filter(id => exams.some(e => e.exam_id === id && e.academic_year === chosenYear)))].sort();
 const scope = JSON.stringify([studentId, chosenYear]);
 const key = JSON.stringify([scope, [...practice.selected].sort(), [...mini.selected].sort(), mode, includeExams, examIds]);
 const keyRef = useRef(key), reportGeneration = useRef(0);
 keyRef.current = key;
 useEffect(() => { setIncludeExams(false); setMode('LATEST'); }, [scope]);
 useEffect(() => { reportGeneration.current++; setData(null); setReportError(''); setReportBusy(false); }, [key]);
 useEffect(() => () => { reportGeneration.current++; }, []);
 const hasSelection = practice.selected.length > 0 || mini.selected.length > 0 || (includeExams && examIds.length > 0);
 const loadReport = async () => {
  const requestKey = key, attempt = ++reportGeneration.current;
  setReportActivityKey(requestKey); setReportBusy(true); setReportError(''); setData(null);
  try {
   const result = await api<any>('/api/reporting/students/' + encodeURIComponent(studentId) + '/frozen-combined' + qs({
    academicYear: chosenYear, runIds: practice.selected.length ? practice.selected.join(',') : null,
    miniTestIds: mini.selected.length ? mini.selected.join(',') : null, repeatPolicy: mode,
    examIds: includeExams && examIds.length ? examIds.join(',') : null,
   }));
   if (keyRef.current === requestKey && reportGeneration.current === attempt) setData({ key: requestKey, result });
  } catch (e: any) {
   if (keyRef.current === requestKey && reportGeneration.current === attempt) setReportError(e.message || 'Seçili kaynakların karnesi hazırlanamadı.');
  } finally {
   if (keyRef.current === requestKey && reportGeneration.current === attempt) setReportBusy(false);
  }
 };
 const result = data?.key === key ? data.result : null;
 return <section className="panel" style={{ marginBottom: 20 }} aria-label="Seçili kaynakların karnesi">
  <div className="panel-head"><div><h2>Seçili kaynakların karnesi</h2><p>Soru pratiği ve yeni soru mini testlerini ayrı ayrı seçin; isterseniz üstte seçtiğiniz sınavlarla birleştirin. Föy ve mini oyun henüz dahil değildir.</p></div></div>
  <div className="form-grid"><label>Eğitim yılı<input value={chosenYear} onChange={e => setYear(e.target.value)} placeholder="2026-2027" list="practice-report-years"/><datalist id="practice-report-years">{years.map(y => <option key={y} value={y}/>)}</datalist></label></div>
  <RunSelector selection={practice} title="Soru pratiği" empty="Bu eğitim yılında erişilebilir soru pratiği kaydı bulunmuyor." valid={Boolean(studentId) && validYear}/>
  <RunSelector selection={mini} title="Yeni soru mini testi" empty="Bu eğitim yılında karneye uygun, tamamlanmış yeni soru mini testi bulunmuyor." valid={Boolean(studentId) && validYear}/>
  <p className="muted">Mini test listesi yalnız sabitlenmiş kanıtı bulunan yeni soru testlerini içerir. Öğrencinin isteğiyle yaptığı tekrar çalışmaları bu karneye katılmaz.</p>
  <label><input type="checkbox" checked={includeExams} onChange={e => setIncludeExams(e.target.checked)}/> Üstte seçili, bu eğitim yılındaki {examIds.length} sınavı ekle (en fazla 20)</label>
  <div className="form-grid" style={{ marginTop: 16 }}>
   <label>Soru pratiğinde tekrarlanan çözüm<select value={mode} disabled={!practice.selected.length} onChange={e => setMode(e.target.value as 'FIRST' | 'LATEST')}><option value="FIRST">Seçili pratik kayıtları içindeki ilk çözüm</option><option value="LATEST">Seçili pratik kayıtları içindeki son çözüm</option></select></label>
   <div><button className="secondary" disabled={(reportActivityKey === key && reportBusy) || !studentId || !validYear || !hasSelection || practice.selected.length > 100 || mini.selected.length > 20 || (includeExams && examIds.length > 20)} onClick={() => void loadReport()}>{reportActivityKey === key && reportBusy ? 'Hazırlanıyor…' : 'Seçili Kaynakların Karnesini Hazırla'}</button></div>
  </div>
  <p className="muted">İlk/son çözüm yalnız seçtiğiniz soru pratiği kayıtları arasında belirlenir. Doğruluk yüzdesi doğru sayısının toplam doğru, yanlış ve boş sayısına oranıdır. Farklı müfredat bağlamları ayrı tutulur; bu yüzde resmî puan veya beceri düzeyi değildir.</p>
  {reportActivityKey === key && reportError && <div className="alert error" role="alert">{reportError}</div>}
  {result && <>
   {result.sourceTypes?.length > 1 && <div className="alert info">Birleşik karnede seçili kaynakların kanıtları soru sayısıyla ağırlıklandırılır. Farklı müfredat sürümleri ayrı gösterilir.</div>}
   {result.sourceCoverage?.map((source: any) => <div key={source.sourceType}>
    <p>{sourceName(source.sourceType)}: {source.unavailableCount || 0} seçili kayıt kullanılamadı{source.coverage ? ' · ' + (source.coverage.excludedEvidence || 0) + ' kanıt kapsam dışında' : ''}</p>
    {source.sourceType === 'QUESTION_BANK' && source.coverage && <p>{source.coverage.repeatedAttempts || 0} tekrar eden pratik çözümü, seçilen ilk/son politikasına göre tekilleştirildi.</p>}
    {source.coverage && (source.coverage.legacyRuns || source.coverage.legacyTests || source.coverage.legacySnapshots) > 0 && <p>{source.coverage.legacyRuns || source.coverage.legacyTests || source.coverage.legacySnapshots} kayıtta ayrıntılı sabitlenmiş kanıt eksik.</p>}
   </div>)}
   {result.restrictedToSubjects && <div className="alert info">Karne yetkili branşınızla sınırlıdır.</div>}
   <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Ders</th><th>Sınıf</th><th>Doğru / Yanlış / Boş</th><th>Kanıt</th><th>Doğruluk</th></tr></thead><tbody>{(result.groups || []).map((group: any) => <tr key={JSON.stringify([group.subjectId, group.curriculumVersionId, group.academicYear, group.gradeLevel, group.programVersion])}>
    <td>{group.subjectName || 'Ders adı mevcut değil'}{group.programVersion && <><br/><small>{group.programVersion}</small></>}</td><td>{group.gradeLevel}</td><td>{group.correct} / {group.wrong} / {group.blank}</td>
    <td>{group.evidenceCount}{group.sourceBreakdown?.map((source: any) => <div key={source.sourceType}><small>{sourceName(source.sourceType)}: {source.evidenceCount}</small></div>)}</td><td>{group.accuracyPercent === null ? '—' : '%' + Number(group.accuracyPercent).toFixed(1)}</td>
   </tr>)}</tbody></table></div>
   {!result.groups?.length && <div className="empty">Seçili kapsamda doğrulanmış soru kanıtı bulunmuyor.</div>}
  </>}
 </section>;
}
