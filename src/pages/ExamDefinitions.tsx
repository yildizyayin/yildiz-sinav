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
    institutionId: '', academicYear: '2026-2027', title: '', examDate: '', scoringRuleVersionId: '',
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
    const preferredRuleCode = selectedChoice.examType === 'LGS' ? 'ANUNEX_LGS_PRACTICE'
      : selectedChoice.examType === 'TYT' ? 'ANUNEX_TYT_PRACTICE'
      : selectedChoice.examType === 'AYT' ? 'ANUNEX_AYT_PRACTICE'
      : selectedChoice.examType === 'TYT_AYT' ? 'ANUNEX_YKS_COMPOSITE'
      : 'ANUNEX_STANDARD_NET';
    const preferredScoring = data.scoringVersions?.find((x: any) => x.rule_code === preferredRuleCode)?.id || data.scoringVersions?.[0]?.id || '';
    setCreateForm((f) => ({ ...f, scoringRuleVersionId: preferredScoring }));
    if (!createForm.institutionId && data.institutions?.[0]?.id) setCreateForm((f) => ({ ...f, institutionId: data.institutions[0].id }));
  };
  const loadRows = async () => { const data = await api<any>('/api/exam-definitions'); setRows(data.exams || []); };
  const loadDetail = async (id: string) => {
    if (!id) { setDetail(null); return; }
    const data = await api<any>(`/api/exam-definitions/${id}`);
    setDetail(data);
    const examType = String(data.exam.exam_type || 'STANDARD');
    setChoiceKey(examType === 'STANDARD' ? `STD_${data.exam.grade_level}` : examType === 'MIDDLE_COMPOSITE' ? `MID_${data.exam.grade_level}` : examType);
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
  const visibleSubjects = useMemo(() => (options.subjects || []).filter((subject: any) => {
    const code = String(subject.code || '');
    if (selectedChoice.examType === 'TYT') return code.startsWith('TYT_');
    if (selectedChoice.examType === 'AYT') return code.startsWith('AYT_');
    if (selectedChoice.examType === 'TYT_AYT') return code.startsWith('TYT_') || code.startsWith('AYT_');
    return !code.startsWith('TYT_') && !code.startsWith('AYT_');
  }), [options.subjects, selectedChoice.examType]);

  const analyseKey = (text = answerKeyText) => {
    const result = parseAnswerKeyText(text, options.subjects as SubjectOption[]);
    setAnalysis(result);
    if (!result.entries.length) { setError('Cevap anahtarında ders satırı bulunamadı. Örnek: MAT: ABCDE... veya TUR;ABCDE...'); return; }
    setError('');
    setBooklets(result.detectedBooklets.join(','));
    setKeyEntries(result.entries);
    const cfg = Object.entries(result.questionCounts).map(([subjectId, questionCount], index) => ({ subjectId, questionCount, wrongDivisor: selectedChoice.defaultWrongDivisor, sortOrder: index + 1 }));
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
      if (user?.role === 'SUPER_ADMIN' && createForm.ownerType === 'INSTITUTION' && !createForm.institutionId) throw new Error('Kuruma özel sınav için kurum seçilmelidir.');
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
    ? [...current, { subjectId, questionCount: 20, wrongDivisor: selectedChoice.defaultWrongDivisor, sortOrder: current.length + 1 }]
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

  const totalConfiguredQuestions = subjects.reduce((total, subject) => total + Number(subject.questionCount || 0), 0);
  const totalAnswerSlots = keyEntries.reduce((total, entry) => total + cleanAnswers(entry.answers).length, 0);

  return <>
    <div className="exam-builder-shell">
      <div className="page-head exam-builder-head">
        <div>
          <span className="eyebrow">SINAV MERKEZİ / OLUŞTUR</span>
          <h1>Yeni sınav oluştur</h1>
          <p>Sınav künyesini tek ekranda tamamlayın. İsterseniz cevap anahtarını yükleyin, isterseniz ders ve soru sayılarını kendiniz belirleyin.</p>
        </div>
        <div className="exam-builder-head-badge"><Sparkles size={17}/><span>Atlas çalışma alanı</span></div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}

      <div className="exam-builder-layout">
        <div className="exam-builder-main">
          <section className="builder-card">
            <div className="builder-step-head">
              <span className="builder-step-number">01</span>
              <div><span className="eyebrow">MODEL</span><h2>Sınav modelini seçin</h2><p>Seçiminiz ders listesini, soru yapısını ve puanlama kuralını hazırlar.</p></div>
            </div>
            <div className="exam-model-grid builder-model-grid">
              {EXAM_CHOICES.map((c) => <button type="button" key={c.key} className={`exam-model-card ${choiceKey === c.key ? 'selected' : ''}`} onClick={() => setChoiceKey(c.key)}>
                <strong>{c.label}</strong><span>{c.description}</span>{c.sessionMode !== 'SINGLE' && <small>{c.sessionMode === 'TYT_AYT' ? 'Bileşik karne' : 'Oturum birleştirme'}</small>}
              </button>)}
            </div>
            <div className="builder-mode-row">
              <div><strong>Değerlendirme tipi</strong><span>Sonuç ekranında kullanılacak analiz kapsamı</span></div>
              <div className="segmented-control">
                <button type="button" className={definitionMode === 'STANDARD' ? 'active' : ''} onClick={() => setDefinitionMode('STANDARD')}>Standart</button>
                <button type="button" className={definitionMode === 'OUTCOME' ? 'active' : ''} onClick={() => setDefinitionMode('OUTCOME')}><Sparkles size={15}/> Kazanımlı</button>
              </div>
            </div>
          </section>

          <section className="builder-card">
            <div className="builder-step-head">
              <span className="builder-step-number">02</span>
              <div><span className="eyebrow">İÇERİK</span><h2>Sınav verisini nasıl ekleyelim?</h2><p>En hızlı yöntem cevap anahtarını yükleyip dersleri otomatik oluşturmaktır.</p></div>
            </div>
            <div className="creation-method-grid">
              <button type="button" className={`creation-method ${createMethod === 'ANSWER_KEY' ? 'selected' : ''}`} onClick={() => setCreateMethod('ANSWER_KEY')}><FileUp size={19}/><span><strong>Cevap anahtarından</strong><small>TXT, CSV veya DAT dosyasını analiz et</small></span></button>
              <button type="button" className={`creation-method ${createMethod === 'MANUAL' ? 'selected' : ''}`} onClick={() => setCreateMethod('MANUAL')}><BookOpenCheck size={19}/><span><strong>Manuel tanımla</strong><small>Dersleri ve soru sayılarını kendin belirle</small></span></button>
            </div>
            {createMethod === 'ANSWER_KEY' ? <>
              <div className="builder-inline-fields">
                <label><span>Cevap anahtarı dosyası</span><input type="file" accept=".txt,.csv,.dat,text/plain,text/csv" onChange={(e) => void readAnswerFile(e.target.files?.[0])} /></label>
                <label><span>Kitapçıklar</span><input value={booklets} onChange={(e) => setBooklets(e.target.value)} placeholder="A veya A,B" /></label>
              </div>
              <label className="builder-textarea-label"><span>Veya cevap anahtarını yapıştır</span><textarea rows={7} value={answerKeyText} onChange={(e) => setAnswerKeyText(e.target.value)} placeholder={'MAT: ABCDEABCDE\nTUR: ABCDEABCDE\nFEN: ABCDEABCDE\n\n[A] ve [B] başlıklarıyla çoklu kitapçık da girebilirsiniz.'} /></label>
              <div className="builder-footer-row"><button type="button" className="secondary" onClick={() => analyseKey()}><FileUp size={16}/> Anahtarı analiz et</button>{analysis && <div className={analysis.unknownLines.length ? 'builder-analysis warning' : 'builder-analysis success'}><strong>{Object.keys(analysis.questionCounts).length} ders bulundu.</strong> {analysis.unknownLines.length ? `${analysis.unknownLines.length} satır kontrol edilmeli.` : 'Soru sayıları otomatik çıkarıldı.'}</div>}</div>
            </> : <div className="cards-list builder-subject-list">{visibleSubjects.map((s: any) => { const cfg = subjects.find((x) => x.subjectId === s.id); return <div className="list-card" key={s.id}><input type="checkbox" checked={selectedSubjectIds.has(s.id)} onChange={(e) => toggleSubject(s.id, e.target.checked)} /><div><strong>{s.name}</strong><span>{s.code}</span></div>{cfg && <label className="compact-field">Soru<input type="number" min="1" max="200" value={cfg.questionCount} onChange={(e) => patchSubject(s.id, { questionCount: Number(e.target.value) })} /></label>}</div>; })}</div>}
          </section>

          <section className="builder-card">
            <div className="builder-step-head">
              <span className="builder-step-number">03</span>
              <div><span className="eyebrow">KÜNYE</span><h2>Sınav bilgilerini tamamlayın</h2><p>Oluşturduktan sonra cevap anahtarı, kurum dağıtımı ve kazanım eşleştirmeleri düzenlenebilir.</p></div>
            </div>
            <div className="form-grid builder-form-grid">
              {user?.role === 'SUPER_ADMIN' && <label>Sahiplik<select value={createForm.ownerType} onChange={(e) => setCreateForm((f) => ({ ...f, ownerType: e.target.value }))}><option value="CENTRAL">Merkezi Sınav</option><option value="INSTITUTION">Kuruma Özel</option></select></label>}
              {user?.role === 'SUPER_ADMIN' && createForm.ownerType === 'INSTITUTION' && <label>Kurum<select value={createForm.institutionId} onChange={(e) => setCreateForm((f) => ({ ...f, institutionId: e.target.value }))}>{options.institutions?.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>}
              <label>Sınav adı<input value={createForm.title} onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))} placeholder={selectedChoice.label + ' - 01'} /></label>
              <label>Eğitim yılı<input value={createForm.academicYear} onChange={(e) => setCreateForm((f) => ({ ...f, academicYear: e.target.value }))} /></label>
              <label>Tarih<input type="date" value={createForm.examDate} onChange={(e) => setCreateForm((f) => ({ ...f, examDate: e.target.value }))} /></label>
              <label>Puanlama<select value={createForm.scoringRuleVersionId} onChange={(e) => setCreateForm((f) => ({ ...f, scoringRuleVersionId: e.target.value }))}><option value="">Seçiniz</option>{options.scoringVersions?.map((s: any) => <option key={s.id} value={s.id}>{s.rule_name} · {s.academic_year} {s.version}{s.verified ? ' · Doğrulandı' : ' · Tanım gerekli'}</option>)}</select></label>
            </div>
            <div className="builder-create-row"><div><strong>Hazır olduğunuzda sınavı oluşturun</strong><span>Bu işlem yeni bir taslak açar; mevcut sınav kayıtlarını değiştirmez.</span></div><button type="button" className="primary builder-create-button" disabled={busy || !createForm.title.trim()} onClick={createExam}><Plus size={17}/> Sınavı oluştur</button></div>
          </section>
        </div>

        <aside className="exam-builder-summary">
          <div className="summary-card">
            <div className="summary-card-head"><span className="eyebrow">ÖNİZLEME</span><CheckCircle2 size={20}/></div>
            <h2>{createForm.title.trim() || 'Yeni sınav'}</h2>
            <p>{selectedChoice.label} · {createForm.academicYear}</p>
            <div className="summary-metrics"><div><strong>{totalConfiguredQuestions}</strong><span>toplam soru</span></div><div><strong>{totalAnswerSlots}</strong><span>cevap alanı</span></div></div>
            <div className="summary-checklist"><div className={createForm.title.trim() ? 'ready' : ''}><span>01</span><span>Sınav adı</span><b>{createForm.title.trim() ? 'Hazır' : 'Bekliyor'}</b></div><div className={subjects.length ? 'ready' : ''}><span>02</span><span>Ders yapısı</span><b>{subjects.length ? subjects.length + ' ders' : 'Bekliyor'}</b></div><div className={createMethod === 'MANUAL' || keyEntries.length ? 'ready' : ''}><span>03</span><span>Cevap anahtarı</span><b>{createMethod === 'MANUAL' ? 'Manuel' : (keyEntries.length ? 'Hazır' : 'Bekliyor')}</b></div></div>
            <div className="summary-tip"><Sparkles size={16}/><span>Kazanımlı seçtiğinizde yayınlamadan önce her soruyu bir kazanıma bağlayabilirsiniz.</span></div>
          </div>
        </aside>
      </div>
    </div>

    <div className="table-card" style={{ marginBottom: 20 }}><table><thead><tr><th>Sınav</th><th>Tür / Sınıf</th><th>Durum</th><th>Ders / Soru</th><th>Cevap</th><th>Kazanım</th><th></th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td><strong>{r.title}</strong><br /><small>{r.academic_year}{r.institution_name ? ` · ${r.institution_name}` : ''}</small></td><td>{r.exam_type} · {r.grade_level ? `${r.grade_level}. sınıf` : '-'}</td><td><span className={`status ${r.status === 'ACTIVE' ? 'ok' : 'neutral'}`}>{r.status}</span></td><td>{r.subject_count} / {r.question_count}</td><td>{r.answer_count}</td><td>{r.outcome_mapped_count}</td><td><button className="ghost" onClick={() => setSelectedId(r.id)}>Aç / Düzenle</button></td></tr>)}</tbody></table></div>

    {detail && <>
      <div className="section-head"><div><h2>{detail.exam.title}</h2><p>{detail.exam.exam_type} · {detail.exam.grade_level}. sınıf · {detail.exam.status === 'DRAFT' ? 'Düzenlenebilir taslak' : 'Yayında'}</p></div>{detail.exam.status === 'DRAFT' && <button className="primary" disabled={busy || !detail.readiness?.ready_to_publish} onClick={publish}><Send size={17} /> Sınavı Yayınla</button>}</div>
      <div className="kpi-grid" style={{ marginBottom: 20 }}><div className="kpi-card"><span>Soru</span><strong>{detail.readiness?.actual_questions || 0}/{detail.readiness?.expected_questions || 0}</strong></div><div className="kpi-card"><span>Cevap</span><strong>{detail.readiness?.actual_answers || 0}/{detail.readiness?.expected_answers || 0}</strong></div><div className="kpi-card"><span>Kazanımlı Soru</span><strong>{detail.readiness?.outcome_mapped_questions || 0}</strong></div><div className="kpi-card"><span>Hazır mı?</span><strong>{detail.readiness?.ready_to_publish ? 'Evet' : 'Eksik var'}</strong></div></div>
      {detail.exam.status === 'DRAFT' && <>
        <div className="panel" style={{ marginBottom: 20 }}><div className="panel-head"><div><h2>Dersler ve soru sayıları</h2><p>Cevap anahtarından geldi; gerekirse burada düzeltin.</p></div></div><label>Kitapçıklar<input value={booklets} onChange={(e) => setBooklets(e.target.value)} /></label><div className="cards-list">{visibleSubjects.map((s: any) => { const cfg = subjects.find((x) => x.subjectId === s.id); return <div className="list-card" key={s.id}><input type="checkbox" checked={selectedSubjectIds.has(s.id)} onChange={(e) => toggleSubject(s.id, e.target.checked)} /><div style={{ flex: 1 }}><strong>{s.name}</strong><span>{s.code}</span></div>{cfg && <><label className="compact-field">Soru<input type="number" value={cfg.questionCount} onChange={(e) => patchSubject(s.id, { questionCount: Number(e.target.value) })} /></label><label className="compact-field">Yanlış götürme<input type="number" step="0.5" value={cfg.wrongDivisor} onChange={(e) => patchSubject(s.id, { wrongDivisor: Number(e.target.value) })} /></label></>}</div>; })}</div><button className="secondary" onClick={saveStructure}><Save size={16} /> Yapıyı Kaydet</button></div>

        {!!detail.subjects?.length && !!detail.booklets?.length && <div className="panel" style={{ marginBottom: 20 }}><div className="panel-head"><div><h2>Cevap anahtarı</h2><p>Standart sınavda burada bitirebilirsiniz. Kazanımlı sınavda aşağıda her soruyu kazanıma bağlayın.</p></div><CheckCircle2 /></div>{detail.subjects.map((s: any) => <div key={s.subject_id} style={{ padding: 14, marginBottom: 12, border: '1px solid var(--border,#e5e7eb)', borderRadius: 12 }}><strong>{s.name} · {s.question_count} soru</strong>{detail.booklets.map((b: any) => { const entry = keyEntries.find((x) => x.subjectId === s.subject_id && x.bookletCode === b.code); return <label key={b.code}>{b.code} Kitapçığı<input value={entry?.answers || ''} onChange={(e) => setKey(s.subject_id, b.code, e.target.value)} placeholder={`${s.question_count} cevap`} /><small>{entry?.answers.length || 0}/{s.question_count}</small></label>; })}</div>)}<label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={outcomeRequired} onChange={(e) => setOutcomeRequired(e.target.checked)} /> Bu sınav kazanımlı; bütün sorular kazanıma bağlanacak.</label>
          {outcomeRequired && <div style={{ marginTop: 14 }}>{detail.subjects.map((s: any) => <div key={s.subject_id} style={{ marginBottom: 18 }}><h3>{s.name} kazanımları</h3><div className="form-grid">{Array.from({ length: Number(s.question_count) }, (_, i) => i + 1).map((q) => <label key={q}>Soru {q}<select value={outcomeMappings.find((x) => x.subjectId === s.subject_id && x.questionNo === q)?.outcomeId || ''} onChange={(e) => setOutcome(s.subject_id, q, e.target.value)}><option value="">Kazanım seç</option>{options.outcomes?.filter((o: any) => o.subject_id === s.subject_id).map((o: any) => <option key={o.id} value={o.id}>{o.code ? `${o.code} · ` : ''}{o.title}</option>)}</select></label>)}</div></div>)}</div>}
          <button className="primary" onClick={saveAnswerKey}><Save size={16} /> Cevap Anahtarı ve Kazanımları Kaydet</button></div>}

        {detail.exam.owner_type === 'CENTRAL' && user?.role === 'SUPER_ADMIN' && <div className="panel" style={{ marginBottom: 20 }}><div className="panel-head"><div><h2>Hangi kurumlar kullanacak?</h2><p>Merkezi sınav yalnız seçtiğiniz kurumlarda görünür.</p></div></div><div className="cards-list">{options.institutions?.map((i: any) => <label className="list-card" key={i.id}><input type="checkbox" checked={assignedInstitutions.includes(i.id)} onChange={(e) => setAssignedInstitutions((x) => e.target.checked ? [...new Set([...x, i.id])] : x.filter((id) => id !== i.id))} /><div><strong>{i.name}</strong><span>{i.status}</span></div></label>)}</div><button className="secondary" onClick={saveInstitutions}><Save size={16} /> Kurumları Kaydet</button></div>}
      </>}
      {!detail.readiness?.ready_to_publish && <div className="alert warning"><CircleAlert size={16} /> Yayın için soru sayısı, bütün kitapçık cevapları ve doğrulanmış puanlama kuralı tamamlanmalıdır.{outcomeRequired ? ' Kazanımlı sınavda ayrıca her soru kazanıma bağlanmalıdır.' : ''}</div>}
    </>}
  </>;
}
