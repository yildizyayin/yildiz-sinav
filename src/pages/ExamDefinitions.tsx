import { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, CheckCircle2, CircleAlert, FileUp, Plus, RefreshCw, Save, Send, Sparkles } from 'lucide-react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { EXAM_CHOICES, cleanAnswers, parseAnswerKeyText, type ParsedAnswerEntry, type SubjectOption } from '../lib/guidedDefinitions';

type SubjectConfig = { subjectId: string; questionCount: number; wrongDivisor: number; sortOrder: number };
type OutcomeMap = { subjectId: string; questionNo: number; outcomeId: string };
type DefinitionMode = 'STANDARD' | 'OUTCOME';
type CreateMethod = 'ANSWER_KEY' | 'MANUAL';

function subjectName(options: any, id: string) {
  return options.subjects?.find((s: any) => s.id === id)?.name || id;
}

export function ExamDefinitions() {
  const { user } = useAuth();
  const [options, setOptions] = useState<any>({ subjects: [], scoringVersions: [], institutions: [], outcomes: [] });
  const [rows, setRows] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [createMethod, setCreateMethod] = useState<CreateMethod>('ANSWER_KEY');
  const [definitionMode, setDefinitionMode] = useState<DefinitionMode>('STANDARD');
  const [choiceKey, setChoiceKey] = useState('STD_7');
  const selectedChoice = EXAM_CHOICES.find((x) => x.key === choiceKey) || EXAM_CHOICES[0];
  const [createForm, setCreateForm] = useState({
    ownerType: user?.role === 'SUPER_ADMIN' ? 'CENTRAL' : 'INSTITUTION',
    institutionId: 'inst_demo', academicYear: '2026-2027', title: '', examDate: '', scoringRuleVersionId: 'srv_demo',
  });
  const [answerKeyText, setAnswerKeyText] = useState('');
  const [analysis, setAnalysis] = useState<ReturnType<typeof parseAnswerKeyText> | null>(null);
  const [booklets, setBooklets] = useState('A');
  const [subjects, setSubjects] = useState<SubjectConfig[]>([]);
  const [keyEntries, setKeyEntries] = useState<ParsedAnswerEntry[]>([]);
  const [outcomeMappings, setOutcomeMappings] = useState<OutcomeMap[]>([]);
  const [assignedInstitutions, setAssignedInstitutions] = useState<string[]>([]);
  const [outcomeRequired, setOutcomeRequired] = useState(false);

  const loadOptions = async (gradeLevel?: number) => {
    const data = await api<any>(`/api/exam-definitions/options${qs({ gradeLevel: gradeLevel || null })}`);
    setOptions(data);
    if (!createForm.scoringRuleVersionId && data.scoringVersions?.[0]?.id) setCreateForm((f) => ({ ...f, scoringRuleVersionId: data.scoringVersions[0].id }));
  };
  const loadRows = async () => { const data = await api<any>('/api/exam-definitions'); setRows(data.exams || []); };
  const loadDetail = async (id: string) => {
    if (!id) { setDetail(null); return; }
    const data = await api<any>(`/api/exam-definitions/${id}`);
    setDetail(data);
    setBooklets((data.booklets || []).map((b: any) => b.code).join(','));
    setSubjects((data.subjects || []).map((s: any) => ({ subjectId: s.subject_id, questionCount: Number(s.question_count), wrongDivisor: Number(s.wrong_divisor), sortOrder: Number(s.sort_order) })));
    const entries: ParsedAnswerEntry[] = [];
    for (const s of data.subjects || []) for (const b of data.booklets || []) {
      const answers = (data.answerKey || []).filter((x: any) => x.subject_id === s.subject_id && x.booklet_code === b.code).sort((a: any, b2: any) => a.question_no - b2.question_no).map((x: any) => x.correct_answer || '').join('');
      entries.push({ subjectId: s.subject_id, bookletCode: b.code, answers });
    }
    setKeyEntries(entries);
    const maps: OutcomeMap[] = [];
    for (const r of data.answerKey || []) for (const outcomeId of String(r.outcome_ids || '').split(',').filter(Boolean)) maps.push({ subjectId: r.subject_id, questionNo: Number(r.question_no), outcomeId });
    setOutcomeMappings(maps);
    setOutcomeRequired(maps.length > 0);
    setAssignedInstitutions((data.institutions || []).filter((x: any) => x.enabled).map((x: any) => x.institution_id));
    await loadOptions(Number(data.exam.grade_level) || undefined);
  };

  useEffect(() => { void Promise.all([loadRows(), loadOptions(selectedChoice.gradeLevel)]).catch((e) => setError(e.message)); }, []);
  useEffect(() => { void loadOptions(selectedChoice.gradeLevel).catch((e) => setError(e.message)); }, [choiceKey]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId).catch((e) => setError(e.message)); }, [selectedId]);

  const selectedSubjectIds = useMemo(() => new Set(subjects.map((s) => s.subjectId)), [subjects]);

  const analyseKey = (text = answerKeyText) => {
    const result = parseAnswerKeyText(text, options.subjects as SubjectOption[]);
    setAnalysis(result);
    if (!result.entries.length) { setError('Cevap anahtarında ders satırı bulunamadı. Örnek: MAT: ABCDE... veya TUR;ABCDE...'); return; }
    setError('');
    setBooklets(result.detectedBooklets.join(','));
    setKeyEntries(result.entries);
    const cfg = Object.entries(result.questionCounts).map(([subjectId, questionCount], index) => ({ subjectId, questionCount, wrongDivisor: 4, sortOrder: index + 1 }));
    setSubjects(cfg);
    setNotice(`Cevap anahtarı analiz edildi: ${cfg.length} ders, ${cfg.reduce((n, x) => n + x.questionCount, 0)} soru, ${result.detectedBooklets.length} kitapçık.`);
  };

  const readAnswerFile = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    setAnswerKeyText(text);
    analyseKey(text);
  };

  const createExam = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      if (!createForm.title.trim()) throw new Error('Sınav adı gereklidir.');
      if (createMethod === 'ANSWER_KEY' && !keyEntries.length) throw new Error('Önce cevap anahtarını yükleyin veya yapıştırıp analiz edin.');
      const created = await api<any>('/api/exam-definitions', { method: 'POST', body: JSON.stringify({
        ownerType: createForm.ownerType,
        institutionId: createForm.ownerType === 'INSTITUTION' ? createForm.institutionId : null,
        academicYear: createForm.academicYear,
        title: createForm.title,
        examType: selectedChoice.examType,
        gradeLevel: selectedChoice.gradeLevel,
        examDate: createForm.examDate || null,
        scoringRuleVersionId: createForm.scoringRuleVersionId || null,
      }) });
      if (subjects.length) {
        await api(`/api/exam-definitions/${created.id}/structure`, { method: 'PUT', body: JSON.stringify({ booklets: booklets.split(',').map((x) => x.trim()).filter(Boolean), subjects }) });
      }
      if (keyEntries.length) {
        await api(`/api/exam-definitions/${created.id}/answer-key`, { method: 'PUT', body: JSON.stringify({ entries: keyEntries, outcomeMappings: [] }) });
      }
      setOutcomeRequired(definitionMode === 'OUTCOME');
      setSelectedId(created.id);
      setCreateForm((f) => ({ ...f, title: '' }));
      setNotice(definitionMode === 'OUTCOME' ? 'Sınav oluşturuldu. Şimdi soru-kazanım eşleştirmelerini tamamlayın.' : 'Sınav cevap anahtarından oluşturuldu. Kontrol edip yayınlayabilirsiniz.');
      await loadRows();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const toggleSubject = (subjectId: string, checked: boolean) => setSubjects((current) => checked
    ? [...current, { subjectId, questionCount: 20, wrongDivisor: 4, sortOrder: current.length + 1 }]
    : current.filter((s) => s.subjectId !== subjectId).map((s, i) => ({ ...s, sortOrder: i + 1 })));
  const patchSubject = (subjectId: string, patch: Partial<SubjectConfig>) => setSubjects((current) => current.map((s) => s.subjectId === subjectId ? { ...s, ...patch } : s));

  const saveStructure = async () => {
    if (!selectedId) return;
    setBusy(true); setError('');
    try {
      await api(`/api/exam-definitions/${selectedId}/structure`, { method: 'PUT', body: JSON.stringify({ booklets: booklets.split(',').map((x) => x.trim()).filter(Boolean), subjects }) });
      setNotice('Dersler, soru sayıları ve kitapçıklar kaydedildi.'); await loadDetail(selectedId); await loadRows();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const setKey = (subjectId: string, bookletCode: string, answers: string) => setKeyEntries((current) => {
    const next = current.filter((x) => !(x.subjectId === subjectId && x.bookletCode === bookletCode));
    next.push({ subjectId, bookletCode, answers: cleanAnswers(answers) }); return next;
  });
  const setOutcome = (subjectId: string, questionNo: number, outcomeId: string) => setOutcomeMappings((current) => {
    const next = current.filter((x) => !(x.subjectId === subjectId && x.questionNo === questionNo));
    if (outcomeId) next.push({ subjectId, questionNo, outcomeId }); return next;
  });

  const saveAnswerKey = async () => {
    if (!selectedId) return;
    setBusy(true); setError('');
    try {
      await api(`/api/exam-definitions/${selectedId}/answer-key`, { method: 'PUT', body: JSON.stringify({ entries: keyEntries, outcomeMappings }) });
      setNotice('Cevap anahtarı ve kazanımlar kaydedildi.'); await loadDetail(selectedId); await loadRows();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const saveInstitutions = async () => {
    if (!selectedId) return;
    setBusy(true); setError('');
    try { await api(`/api/exam-definitions/${selectedId}/institutions`, { method: 'PUT', body: JSON.stringify({ institutionIds: assignedInstitutions }) }); setNotice('Sınavın kurum dağıtımı kaydedildi.'); await loadDetail(selectedId); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const publish = async () => {
    if (!selectedId) return;
    if (outcomeRequired && Number(detail?.readiness?.outcome_mapped_questions || 0) < Number(detail?.readiness?.expected_questions || 0)) { setError('Kazanımlı sınavda her soru bir kazanıma bağlanmadan yayınlama yapmayın.'); return; }
    if (!confirm('Sınav değerlendirmeye açılsın mı? Yayından sonra soru yapısı kilitlenecektir.')) return;
    setBusy(true); setError('');
    try { await api(`/api/exam-definitions/${selectedId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'ACTIVE' }) }); setNotice('Sınav yayınlandı.'); await loadDetail(selectedId); await loadRows(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return <>
    <div className="page-head"><div><span className="eyebrow">Sınav Oluştur</span><h1>Cevap anahtarından sınavı otomatik tanımla</h1><p>Önce sınav seviyesini seçin. Cevap anahtarını yüklediğinizde ders ve soru sayıları otomatik çıkar; isterseniz standart, isterseniz kazanımlı sınav oluşturun.</p></div><button className="ghost" onClick={() => void loadRows()}><RefreshCw size={16} /> Yenile</button></div>
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert success">{notice}</div>}

    <div className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-head"><div><h2>1. Sınav seviyesi</h2><p>LGS / TYT / AYT veya 4-11. sınıf standart denemesi seçin.</p></div><BookOpenCheck /></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{EXAM_CHOICES.map((c) => <button key={c.key} className={choiceKey === c.key ? 'primary' : 'secondary'} onClick={() => setChoiceKey(c.key)}>{c.label}</button>)}</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
        <button className={definitionMode === 'STANDARD' ? 'primary' : 'secondary'} onClick={() => setDefinitionMode('STANDARD')}>Standart Cevap Anahtarı</button>
        <button className={definitionMode === 'OUTCOME' ? 'primary' : 'secondary'} onClick={() => setDefinitionMode('OUTCOME')}><Sparkles size={16} /> Kazanımlı Sınav</button>
      </div>
    </div>

    <div className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-head"><div><h2>2. Sınavı nasıl oluşturalım?</h2><p>En hızlı yöntem cevap anahtarını önce vermektir.</p></div></div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}><button className={createMethod === 'ANSWER_KEY' ? 'primary' : 'secondary'} onClick={() => setCreateMethod('ANSWER_KEY')}>Cevap Anahtarından Oluştur</button><button className={createMethod === 'MANUAL' ? 'primary' : 'secondary'} onClick={() => setCreateMethod('MANUAL')}>Ders / Soru Sayısını Manuel Gir</button></div>
      {createMethod === 'ANSWER_KEY' ? <>
        <div className="form-grid"><label>Cevap anahtarı dosyası<input type="file" accept=".txt,.csv,.dat,text/plain,text/csv" onChange={(e) => void readAnswerFile(e.target.files?.[0])} /></label><label>Kitapçıklar<input value={booklets} onChange={(e) => setBooklets(e.target.value)} placeholder="A veya A,B" /></label></div>
        <label>Veya cevap anahtarını yapıştır<textarea rows={8} value={answerKeyText} onChange={(e) => setAnswerKeyText(e.target.value)} placeholder={'MAT: ABCDEABCDE\nTUR: ABCDEABCDE\nFEN: ABCDEABCDE\n\n[A] ve [B] başlıklarıyla çoklu kitapçık da girebilirsiniz.'} /></label>
        <button className="secondary" onClick={() => analyseKey()}><FileUp size={16} /> Anahtarı Analiz Et</button>
        {analysis && <div className={analysis.unknownLines.length ? 'alert warning' : 'alert success'} style={{ marginTop: 12 }}><strong>{Object.keys(analysis.questionCounts).length} ders bulundu.</strong> {analysis.unknownLines.length ? `${analysis.unknownLines.length} satır tanınmadı; aşağıdaki yapıyı kontrol edin.` : 'Soru sayıları cevap anahtarından çıkarıldı.'}</div>}
      </> : <div className="cards-list">{options.subjects?.map((s: any) => { const cfg = subjects.find((x) => x.subjectId === s.id); return <div className="list-card" key={s.id}><input type="checkbox" checked={selectedSubjectIds.has(s.id)} onChange={(e) => toggleSubject(s.id, e.target.checked)} /><div style={{ flex: 1 }}><strong>{s.name}</strong><span>{s.code}</span></div>{cfg && <label className="compact-field">Soru<input type="number" min="1" max="200" value={cfg.questionCount} onChange={(e) => patchSubject(s.id, { questionCount: Number(e.target.value) })} /></label>}</div>; })}</div>}
    </div>

    <div className="panel" style={{ marginBottom: 20 }}><div className="panel-head"><div><h2>3. Sınav bilgileri ve oluştur</h2><p>Teknik ayrıntılar sonraki ekranda değiştirilebilir.</p></div></div><div className="form-grid">
      {user?.role === 'SUPER_ADMIN' && <label>Sahiplik<select value={createForm.ownerType} onChange={(e) => setCreateForm((f) => ({ ...f, ownerType: e.target.value }))}><option value="CENTRAL">Merkezi Sınav</option><option value="INSTITUTION">Kuruma Özel</option></select></label>}
      {user?.role === 'SUPER_ADMIN' && createForm.ownerType === 'INSTITUTION' && <label>Kurum<select value={createForm.institutionId} onChange={(e) => setCreateForm((f) => ({ ...f, institutionId: e.target.value }))}>{options.institutions?.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>}
      <label>Sınav adı<input value={createForm.title} onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))} placeholder={`${selectedChoice.label} - 01`} /></label>
      <label>Eğitim yılı<input value={createForm.academicYear} onChange={(e) => setCreateForm((f) => ({ ...f, academicYear: e.target.value }))} /></label>
      <label>Tarih<input type="date" value={createForm.examDate} onChange={(e) => setCreateForm((f) => ({ ...f, examDate: e.target.value }))} /></label>
      <label>Puanlama<select value={createForm.scoringRuleVersionId} onChange={(e) => setCreateForm((f) => ({ ...f, scoringRuleVersionId: e.target.value }))}><option value="">Seçiniz</option>{options.scoringVersions?.map((s: any) => <option key={s.id} value={s.id}>{s.rule_name} · {s.academic_year} {s.version}{s.verified ? ' · Doğrulandı' : ' · Tanım gerekli'}</option>)}</select></label>
    </div><button className="primary" disabled={busy || !createForm.title.trim()} onClick={createExam}><Plus size={17} /> Sınavı Oluştur</button></div>

    <div className="table-card" style={{ marginBottom: 20 }}><table><thead><tr><th>Sınav</th><th>Tür / Sınıf</th><th>Durum</th><th>Ders / Soru</th><th>Cevap</th><th>Kazanım</th><th></th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td><strong>{r.title}</strong><br /><small>{r.academic_year}{r.institution_name ? ` · ${r.institution_name}` : ''}</small></td><td>{r.exam_type} · {r.grade_level ? `${r.grade_level}. sınıf` : '-'}</td><td><span className={`status ${r.status === 'ACTIVE' ? 'ok' : 'neutral'}`}>{r.status}</span></td><td>{r.subject_count} / {r.question_count}</td><td>{r.answer_count}</td><td>{r.outcome_mapped_count}</td><td><button className="ghost" onClick={() => setSelectedId(r.id)}>Aç / Düzenle</button></td></tr>)}</tbody></table></div>

    {detail && <>
      <div className="section-head"><div><h2>{detail.exam.title}</h2><p>{detail.exam.exam_type} · {detail.exam.grade_level}. sınıf · {detail.exam.status === 'DRAFT' ? 'Düzenlenebilir taslak' : 'Yayında'}</p></div>{detail.exam.status === 'DRAFT' && <button className="primary" disabled={busy || !detail.readiness?.ready_to_publish} onClick={publish}><Send size={17} /> Sınavı Yayınla</button>}</div>
      <div className="kpi-grid" style={{ marginBottom: 20 }}><div className="kpi-card"><span>Soru</span><strong>{detail.readiness?.actual_questions || 0}/{detail.readiness?.expected_questions || 0}</strong></div><div className="kpi-card"><span>Cevap</span><strong>{detail.readiness?.actual_answers || 0}/{detail.readiness?.expected_answers || 0}</strong></div><div className="kpi-card"><span>Kazanımlı Soru</span><strong>{detail.readiness?.outcome_mapped_questions || 0}</strong></div><div className="kpi-card"><span>Hazır mı?</span><strong>{detail.readiness?.ready_to_publish ? 'Evet' : 'Eksik var'}</strong></div></div>
      {detail.exam.status === 'DRAFT' && <>
        <div className="panel" style={{ marginBottom: 20 }}><div className="panel-head"><div><h2>Dersler ve soru sayıları</h2><p>Cevap anahtarından geldi; gerekirse burada düzeltin.</p></div></div><label>Kitapçıklar<input value={booklets} onChange={(e) => setBooklets(e.target.value)} /></label><div className="cards-list">{options.subjects?.map((s: any) => { const cfg = subjects.find((x) => x.subjectId === s.id); return <div className="list-card" key={s.id}><input type="checkbox" checked={selectedSubjectIds.has(s.id)} onChange={(e) => toggleSubject(s.id, e.target.checked)} /><div style={{ flex: 1 }}><strong>{s.name}</strong><span>{s.code}</span></div>{cfg && <><label className="compact-field">Soru<input type="number" value={cfg.questionCount} onChange={(e) => patchSubject(s.id, { questionCount: Number(e.target.value) })} /></label><label className="compact-field">Yanlış götürme<input type="number" step="0.5" value={cfg.wrongDivisor} onChange={(e) => patchSubject(s.id, { wrongDivisor: Number(e.target.value) })} /></label></>}</div>; })}</div><button className="secondary" onClick={saveStructure}><Save size={16} /> Yapıyı Kaydet</button></div>

        {!!detail.subjects?.length && !!detail.booklets?.length && <div className="panel" style={{ marginBottom: 20 }}><div className="panel-head"><div><h2>Cevap anahtarı</h2><p>Standart sınavda burada bitirebilirsiniz. Kazanımlı sınavda aşağıda her soruyu kazanıma bağlayın.</p></div><CheckCircle2 /></div>{detail.subjects.map((s: any) => <div key={s.subject_id} style={{ padding: 14, marginBottom: 12, border: '1px solid var(--border,#e5e7eb)', borderRadius: 12 }}><strong>{s.name} · {s.question_count} soru</strong>{detail.booklets.map((b: any) => { const entry = keyEntries.find((x) => x.subjectId === s.subject_id && x.bookletCode === b.code); return <label key={b.code}>{b.code} Kitapçığı<input value={entry?.answers || ''} onChange={(e) => setKey(s.subject_id, b.code, e.target.value)} placeholder={`${s.question_count} cevap`} /><small>{entry?.answers.length || 0}/{s.question_count}</small></label>; })}</div>)}<label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={outcomeRequired} onChange={(e) => setOutcomeRequired(e.target.checked)} /> Bu sınav kazanımlı; bütün sorular kazanıma bağlanacak.</label>
          {outcomeRequired && <div style={{ marginTop: 14 }}>{detail.subjects.map((s: any) => <div key={s.subject_id} style={{ marginBottom: 18 }}><h3>{s.name} kazanımları</h3><div className="form-grid">{Array.from({ length: Number(s.question_count) }, (_, i) => i + 1).map((q) => <label key={q}>Soru {q}<select value={outcomeMappings.find((x) => x.subjectId === s.subject_id && x.questionNo === q)?.outcomeId || ''} onChange={(e) => setOutcome(s.subject_id, q, e.target.value)}><option value="">Kazanım seç</option>{options.outcomes?.filter((o: any) => o.subject_id === s.subject_id).map((o: any) => <option key={o.id} value={o.id}>{o.code ? `${o.code} · ` : ''}{o.title}</option>)}</select></label>)}</div></div>)}</div>}
          <button className="primary" onClick={saveAnswerKey}><Save size={16} /> Cevap Anahtarı ve Kazanımları Kaydet</button></div>}

        {detail.exam.owner_type === 'CENTRAL' && user?.role === 'SUPER_ADMIN' && <div className="panel" style={{ marginBottom: 20 }}><div className="panel-head"><div><h2>Hangi kurumlar kullanacak?</h2><p>Merkezi sınav yalnız seçtiğiniz kurumlarda görünür.</p></div></div><div className="cards-list">{options.institutions?.map((i: any) => <label className="list-card" key={i.id}><input type="checkbox" checked={assignedInstitutions.includes(i.id)} onChange={(e) => setAssignedInstitutions((x) => e.target.checked ? [...new Set([...x, i.id])] : x.filter((id) => id !== i.id))} /><div><strong>{i.name}</strong><span>{i.status}</span></div></label>)}</div><button className="secondary" onClick={saveInstitutions}><Save size={16} /> Kurumları Kaydet</button></div>}
      </>}
      {!detail.readiness?.ready_to_publish && <div className="alert warning"><CircleAlert size={16} /> Yayın için soru sayısı, bütün kitapçık cevapları ve doğrulanmış puanlama kuralı tamamlanmalıdır.{outcomeRequired ? ' Kazanımlı sınavda ayrıca her soru kazanıma bağlanmalıdır.' : ''}</div>}
    </>}
  </>;
}
