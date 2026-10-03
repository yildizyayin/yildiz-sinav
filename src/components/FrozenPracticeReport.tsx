import { useEffect, useMemo, useRef, useState } from 'react';
import { api, qs } from '../api';

type Run = { id: string; completedAt: string };
export function FrozenPracticeReport({ studentId, exams = [], selectedExamIds = [] }: { studentId: string; exams?: any[]; selectedExamIds?: string[] }) {
 const years = useMemo(() => [...new Set(exams.map(e => e.academic_year).filter(y => typeof y === 'string' && /^\d{4}-\d{4}$/.test(y)))].sort().reverse() as string[], [exams]);
 const [year, setYear] = useState(''), [runs, setRuns] = useState<Run[]>([]), [selected, setSelected] = useState<string[]>([]);
 const [cursor, setCursor] = useState<string | null>(null), [loadedScope, setLoadedScope] = useState(''), [restricted, setRestricted] = useState(false);
 const [mode, setMode] = useState<'FIRST' | 'LATEST'>('LATEST'), [listBusy, setListBusy] = useState(false), [reportBusy, setReportBusy] = useState(false);
 const [listError, setListError] = useState(''), [reportError, setReportError] = useState(''), [data, setData] = useState<any>(null);
 const chosenYear = year || years[0] || '';
 const [includeExams,setIncludeExams]=useState(false);
 const examIds=selectedExamIds.filter(id=>exams.some(e=>e.exam_id===id&&(!e.academic_year||e.academic_year===chosenYear))).sort();
 const validYear = /^\d{4}-\d{4}$/.test(chosenYear) && Number(chosenYear.slice(5)) === Number(chosenYear.slice(0, 4)) + 1;
 const scope = JSON.stringify([studentId, chosenYear]), key = JSON.stringify([scope, [...selected].sort(), mode, includeExams, examIds]);
 const scopeRef = useRef(scope), keyRef = useRef(key), listGeneration = useRef(0), reportGeneration = useRef(0);
 scopeRef.current = scope; keyRef.current = key;
 const seenCursors = useRef(new Set<string>());
 useEffect(() => { listGeneration.current++; reportGeneration.current++; setRuns([]); setSelected([]); setCursor(null); setLoadedScope(''); setRestricted(false); setListBusy(false); setReportBusy(false); setListError(''); setReportError(''); setData(null); seenCursors.current.clear(); }, [scope]);
 useEffect(() => { reportGeneration.current++; setData(null); setReportError(''); setReportBusy(false); }, [key]);
 useEffect(() => () => { listGeneration.current++; reportGeneration.current++; }, []);
 const loadRuns = async (more: boolean) => {
  const requestScope = scope, attempt = ++listGeneration.current, requestedCursor = more ? cursor : null;
  setListBusy(true); setListError('');
  if (!more) { setSelected([]); setData(null); }
  try {
   const result = await api<any>(`/api/reporting/students/${encodeURIComponent(studentId)}/practice-runs${qs({ academicYear: chosenYear, limit: 50, cursor: requestedCursor })}`);
   if (scopeRef.current !== requestScope || listGeneration.current !== attempt) return;
   const page = Array.isArray(result.runs) ? result.runs as Run[] : [];
   setRuns(previous => [...new Map([...(more ? previous : []), ...page].map(run => [run.id, run])).values()]);
   setLoadedScope(requestScope); setRestricted(Boolean(result.restrictedToSubjects));
   const next = typeof result.nextCursor === 'string' ? result.nextCursor : null;
   if (requestedCursor) seenCursors.current.add(requestedCursor);
   if (next && seenCursors.current.has(next)) { setCursor(null); setListError('Liste devamı tekrarlandı. Gösterilen kayıtlar korunuyor; listeyi yeniden yükleyin.'); }
   else setCursor(next);
  } catch (e: any) { if (scopeRef.current === requestScope && listGeneration.current === attempt) setListError(e.message || 'Çözüm kayıtları alınamadı.'); }
  finally { if (scopeRef.current === requestScope && listGeneration.current === attempt) setListBusy(false); }
 };
 const loadReport = async () => {
  const requestKey = key, attempt = ++reportGeneration.current;
  setReportBusy(true); setReportError(''); setData(null);
  try {
   const result = await api<any>(`/api/reporting/students/${encodeURIComponent(studentId)}/${includeExams?'frozen-combined':'frozen-practice'}${qs({ academicYear: chosenYear, runIds: selected.join(','), repeatPolicy: mode, examIds:includeExams?examIds.join(','):null })}`);
   if (keyRef.current === requestKey && reportGeneration.current === attempt) setData({ key: requestKey, result });
  } catch (e: any) { if (keyRef.current === requestKey && reportGeneration.current === attempt) setReportError(e.message || 'Soru pratiği karnesi hazırlanamadı.'); }
  finally { if (keyRef.current === requestKey && reportGeneration.current === attempt) setReportBusy(false); }
 };
 const result = data?.key === key ? data.result : null;
 return <section className="panel" style={{ marginBottom: 20 }} aria-label="Seçili soru pratiği karnesi">
  <div className="panel-head"><div><h2>Seçili soru pratiği karnesi</h2><p>Dijital soru havuzu çözümlerini seçin; isterseniz üstte seçtiğiniz sınavlarla birleştirin. Föy ve mini oyun henüz dahil değildir.</p></div></div>
  <div className="form-grid"><label>Eğitim yılı<input value={chosenYear} onChange={e => setYear(e.target.value)} placeholder="2026-2027" list="practice-report-years"/><datalist id="practice-report-years">{years.map(y => <option key={y} value={y}/>)}</datalist></label>
   <div><button className="secondary" onClick={() => { seenCursors.current.clear(); void loadRuns(false); }} disabled={listBusy || !studentId || !validYear}>{listBusy ? 'Yükleniyor…' : 'Çözüm Kayıtlarını Yükle'}</button></div></div>
  {listError && <div className="alert error" role="alert">{listError}</div>}
  {loadedScope === scope && restricted && <div className="alert info">Yalnız yetkili branşınızdaki çözüm kayıtları gösteriliyor.</div>}
  {loadedScope === scope && <><p>{selected.length} kayıt seçili · En fazla 100 kayıt. Liste her yüklemede en fazla 50 kayıt getirir.</p>
   <div className="cards-list">{runs.map((run, index) => <label className="list-card" key={run.id} style={{ alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={selected.includes(run.id)} disabled={!selected.includes(run.id) && selected.length >= 100} onChange={() => setSelected(previous => previous.includes(run.id) ? previous.filter(id => id !== run.id) : previous.length < 100 ? [...previous, run.id] : previous)}/><div><strong>Çözüm kaydı {index + 1}</strong><span>{new Date(run.completedAt).toLocaleString('tr-TR')}</span></div></label>)}</div>
   {!runs.length && <div className="empty">Bu eğitim yılında erişilebilir çözüm kaydı bulunmuyor.</div>}
   {cursor && <button className="secondary" disabled={listBusy} onClick={() => void loadRuns(true)}>{listBusy ? 'Yükleniyor…' : 'Daha Fazla Kayıt Yükle'}</button>}
   <label><input type="checkbox" checked={includeExams} onChange={e=>setIncludeExams(e.target.checked)}/> Üstte seçili, bu eğitim yılındaki {examIds.length} sınavı ekle (en fazla 20)</label><div className="form-grid" style={{ marginTop: 16 }}><label>Tekrarlanan çözüm<select value={mode} onChange={e => setMode(e.target.value as 'FIRST' | 'LATEST')}><option value="FIRST">Seçili kayıtlar içindeki ilk çözüm</option><option value="LATEST">Seçili kayıtlar içindeki son çözüm</option></select></label><div><button className="secondary" disabled={reportBusy || !validYear || !selected.length || selected.length > 100 || (includeExams&&(!examIds.length||examIds.length>20))} onClick={() => void loadReport()}>{reportBusy ? 'Hazırlanıyor…' : includeExams?'Birleşik Karneyi Hazırla':'Soru Pratiği Karnesini Hazırla'}</button></div></div>
  </>}
  <p className="muted">İlk/son çözüm yalnız seçtiğiniz kayıtlar arasında belirlenir. Farklı soru sürümleri ve müfredat bağlamları ayrı tutulur. Doğruluk yüzdesi resmî puan veya beceri düzeyi değildir.</p>
  {reportError && <div className="alert error" role="alert">{reportError}</div>}
  {result && <>
   {result.sourceTypes?.length>1&&<div className="alert info">Birleşik karne: sınav ve soru pratiği kanıtları soru sayısıyla ağırlıklandırılır. Farklı müfredat sürümleri ayrı gösterilir.</div>}
   {result.sourceCoverage?.map((s:any)=><p key={s.sourceType}>{s.sourceType==='EXAM'?'Sınav':'Soru pratiği'}: {s.unavailableCount} seçili kayıt kullanılamadı{s.coverage?` · ${s.coverage.excludedEvidence||0} kanıt kapsam dışında`:''}</p>)}
   {result.restrictedToSubjects && <div className="alert info">Karne yetkili branşınızla sınırlıdır.</div>}
   {result.coverage && <p>{result.coverage.repeatedAttempts} tekrar eden çözüm, seçilen ilk/son politikasına göre tekilleştirildi.</p>}
   {result.coverage && (result.coverage.legacyRuns > 0 || result.coverage.excludedEvidence > 0) && <div className="alert info">{result.coverage.legacyRuns} kayıtta ayrıntılı kanıt eksik. {result.coverage.excludedEvidence} kayıt doğrulanamadığı için hesaba katılmadı.</div>}
   {result.unavailableRunIds?.length > 0 && <div className="alert info">Seçilen kayıtların {result.unavailableRunIds.length} tanesi bu kapsamda kullanılamadı.</div>}
   <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Ders</th><th>Sınıf</th><th>Doğru / Yanlış / Boş</th><th>Kanıt</th><th>Doğruluk</th></tr></thead><tbody>{(result.groups || []).map((group: any) => <tr key={JSON.stringify([group.subjectId, group.curriculumVersionId, group.gradeLevel, group.programVersion])}><td>{group.subjectName || 'Ders adı mevcut değil'}{group.programVersion && <><br/><small>{group.programVersion}</small></>}</td><td>{group.gradeLevel}</td><td>{group.correct} / {group.wrong} / {group.blank}</td><td>{group.evidenceCount}</td><td>{group.accuracyPercent === null ? '—' : `%${Number(group.accuracyPercent).toFixed(1)}`}</td></tr>)}</tbody></table></div>
   {!result.groups?.length && <div className="empty">Seçili kapsamda doğrulanmış soru kanıtı bulunmuyor.</div>}
  </>}
 </section>;
}
