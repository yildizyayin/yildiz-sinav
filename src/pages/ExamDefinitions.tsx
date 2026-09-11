import { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, Check, CheckCircle2, CircleAlert, Eye, FileText, FileUp, Globe2, Info, Layers3, Link2, LockKeyhole, RefreshCw, Save, Send, Share2, ShieldCheck, Sparkles, UploadCloud, Workflow } from 'lucide-react';
import * as XLSX from 'xlsx';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { EXAM_CHOICES, EXAM_TEMPLATES, cleanAnswers, matchOfficialOutcome, parseAnswerKeyText, type ExamTemplate, type OutcomeCatalogEntry, type ParsedAnswerEntry, type SubjectOption } from '../lib/guidedDefinitions';

type SubjectConfig = { subjectId: string; questionCount: number; questionStart: number; questionEnd: number; optionCount: 4 | 5; questionStatus: 'ACTIVE' | 'CANCELLED' | 'EXCLUDED'; wrongDivisor: number; sortOrder: number };
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
  const [templateKey, setTemplateKey] = useState('SCHOOL_7');
  const selectedTemplate = EXAM_TEMPLATES.find((x) => x.key === templateKey) || EXAM_TEMPLATES[0];
  const [createForm, setCreateForm] = useState({
    ownerType: user?.role === 'SUPER_ADMIN' ? 'CENTRAL' : 'INSTITUTION', institutionId: '', academicYear: '2026-2027', title: '', examDate: '', scoringRuleVersionId: '',
    publisherName: '', sessionLabel: '', description: '', resultNetworkEnabled: false, gradeLevel: String(selectedChoice.gradeLevel || 7),
  });
  const [customScoring, setCustomScoring] = useState({ wrongMode: 'NONE', wrongDivisor: 4, scale: 100, customScale: 100, weights: {} as Record<string, number> });
  const [resultSettings, setResultSettings] = useState({ correct: true, wrong: true, blank: true, net: true, branchNet: true, successPercent: true, rawScore: true, standardScore: true, branchScore: true, totalScore: true, ranking: true, percentile: true, rankingScopes: ['INSTITUTION', 'DISTRICT', 'CITY', 'NATIONAL'] as string[], includeObp: false });
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
    const preferredRuleCode = selectedChoice.key === 'CUSTOM' ? 'CUSTOM_EXAM'
      : selectedChoice.examType === 'LGS' ? 'MEB_LGS'
      : selectedChoice.examType === 'TYT' ? 'OSYM_TYT'
      : selectedChoice.examType === 'AYT' ? 'OSYM_AYT'
      : selectedChoice.examType === 'YDT' ? 'OSYM_YDT'
      : selectedChoice.examType === 'TYT_AYT' ? 'OSYM_YKS_SAY'
      : 'SCHOOL_100';
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
    setChoiceKey(examType === 'STANDARD' ? `STD_${data.exam.grade_level}` : examType === 'CUSTOM' ? 'CUSTOM' : examType === 'MIDDLE_COMPOSITE' ? `MID_${data.exam.grade_level}` : examType);
    setCreateForm((f) => ({ ...f, publisherName: data.exam.publisher_name || '', sessionLabel: data.exam.session_label || '', description: data.exam.description || '', resultNetworkEnabled: Boolean(data.exam.result_network_enabled), gradeLevel: String(data.exam.grade_level || f.gradeLevel), scoringRuleVersionId: data.exam.scoring_rule_version_id || '' }));
    try { const savedSettings = JSON.parse(data.exam.scoring_settings_json || '{}'); if (savedSettings.show) setResultSettings((current) => ({ ...current, ...savedSettings.show, rankingScopes: savedSettings.rankingScopes || current.rankingScopes, includeObp: Boolean(savedSettings.includeObp) })); } catch { /* legacy exam without result settings */ }
    try { const savedOverride = JSON.parse(data.exam.scoring_override_json || '{}'); if (savedOverride.wrongMode) { const scoreScale = Number(savedOverride.scoreScale || 100); setCustomScoring((current) => ({ ...current, wrongMode: savedOverride.wrongMode, wrongDivisor: Number(savedOverride.wrongDivisor || current.wrongDivisor), scale: [100, 500, 1000].includes(scoreScale) ? scoreScale : 0, customScale: scoreScale, weights: savedOverride.weights || current.weights })); } } catch { /* legacy exam without custom scoring */ }
    setBooklets((data.booklets || []).map((b: any) => b.code).join(','));
    setSubjects((data.subjects || []).map((s: any) => ({ subjectId: s.subject_id, questionCount: Number(s.question_count), questionStart: Number(s.question_start || 1), questionEnd: Number(s.question_end || Number(s.question_start || 1) + Number(s.question_count) - 1), optionCount: Number(s.option_count || 5) === 4 ? 4 : 5, questionStatus: s.question_status || 'ACTIVE', wrongDivisor: Number(s.wrong_divisor), sortOrder: Number(s.sort_order) })));
    const entries: ParsedAnswerEntry[] = [];
    for (const s of data.subjects || []) for (const b of data.booklets || []) {
      const answers = (data.answerKey || []).filter((x: any) => x.subject_id === s.subject_id && x.booklet_code === b.code).sort((a: any, b2: any) => a.question_no - b2.question_no).map((x: any) => x.correct_answer || '').join('');
      const keyRows = (data.answerKey || []).filter((x: any) => x.subject_id === s.subject_id && x.booklet_code === b.code).sort((a: any, b2: any) => a.question_no - b2.question_no);
      entries.push({ subjectId: s.subject_id, bookletCode: b.code, answers, optionCount: Number(keyRows[0]?.answer_option_count || s.option_count || 5) === 4 ? 4 : 5, ...(keyRows.length ? { acceptedAnswers: keyRows.map((x: any) => { try { const parsed = JSON.parse(x.accepted_answers || '[]'); return Array.isArray(parsed) ? parsed : [x.correct_answer]; } catch { return [x.correct_answer]; } }), questionStatuses: keyRows.map((x: any) => x.answer_question_status || x.question_status || 'ACTIVE') } : {}) });
    }
    setKeyEntries(entries);
    const maps: OutcomeMap[] = [];
    for (const r of data.answerKey || []) for (const outcomeId of String(r.outcome_ids || '').split(',').filter(Boolean)) maps.push({ subjectId: r.subject_id, questionNo: Number(r.question_no), outcomeId });
    setOutcomeMappings(maps);
    setOutcomeRequired(data.exam.outcome_mode === 'OFFICIAL_REQUIRED' || maps.length > 0);
    setAssignedInstitutions((data.institutions || []).filter((x: any) => x.enabled).map((x: any) => x.institution_id));
    await loadOptions(Number(data.exam.grade_level) || undefined);
  };

  useEffect(() => { void Promise.all([loadRows(), loadOptions(selectedChoice.gradeLevel)]).catch((e) => setError(e.message)); }, []);
  useEffect(() => { void loadOptions(selectedChoice.gradeLevel).catch((e) => setError(e.message)); }, [choiceKey]);
  useEffect(() => {
    const nextTemplate = selectedChoice.key === 'STD_5' || selectedChoice.key === 'STD_6' || selectedChoice.key === 'STD_7' ? `SCHOOL_${selectedChoice.gradeLevel}` : selectedChoice.key;
    setTemplateKey((current) => current === `${nextTemplate}_OUTCOME` && EXAM_TEMPLATES.some((x) => x.key === current) ? current : (EXAM_TEMPLATES.some((x) => x.key === nextTemplate) ? nextTemplate : 'CUSTOM'));
    setCreateForm((f) => ({ ...f, gradeLevel: String(selectedChoice.gradeLevel || f.gradeLevel) }));
  }, [choiceKey]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId).catch((e) => setError(e.message)); }, [selectedId]);

  const selectedSubjectIds = useMemo(() => new Set(subjects.map((s) => s.subjectId)), [subjects]);
  const visibleSubjects = useMemo(() => (options.subjects || []).filter((subject: any) => {
    const code = String(subject.code || '');
    if (selectedChoice.examType === 'TYT') return code.startsWith('TYT_');
    if (selectedChoice.examType === 'AYT') return code.startsWith('AYT_');
    if (selectedChoice.examType === 'YDT') return code === 'YDT_DIL';
    if (selectedChoice.examType === 'TYT_AYT') return code.startsWith('TYT_') || code.startsWith('AYT_');
    return !code.startsWith('TYT_') && !code.startsWith('AYT_');
  }), [options.subjects, selectedChoice.examType]);

  const applyTemplate = (template: ExamTemplate = selectedTemplate) => {
    const next = template.sections.map((section, index) => {
      const subject = options.subjects?.find((s: any) => s.code === section.subjectCode);
      return subject ? { subjectId: subject.id, questionCount: section.questionCount, questionStart: section.questionStart, questionEnd: section.questionEnd, optionCount: section.optionCount, questionStatus: 'ACTIVE' as const, wrongDivisor: section.wrongDivisor, sortOrder: index + 1 } : null;
    }).filter(Boolean) as SubjectConfig[];
    if (template.sections.length && next.length !== template.sections.length) { setError('Şablon derslerinden bazıları henüz sistemde tanımlı değil. Önce veritabanı seed/migration adımını uygulayın.'); return; }
    setSubjects(next);
    setOutcomeRequired(Boolean(template.requiresOutcomes));
    setDefinitionMode(template.requiresOutcomes ? 'OUTCOME' : 'STANDARD');
    setNotice(`${template.label} uygulandı: ${next.reduce((n, x) => n + x.questionCount, 0)} soru, ${next.length} test.`);
  };

  const autoMatchOutcomes = (result: ReturnType<typeof parseAnswerKeyText>) => {
    const mappings: OutcomeMap[] = [];
    let matched = 0; let ambiguous = 0; let missing = 0; let unverified = 0;
    for (const entry of result.entries) {
      for (const [index, reference] of (entry.outcomeRefs || []).entries()) {
        if (!reference) continue;
        const questionNo = (result.questionStarts[entry.subjectId] || 1) + index;
        const match = matchOfficialOutcome(reference, entry.subjectId, options.outcomes as OutcomeCatalogEntry[]);
        if (match.outcomeId) { mappings.push({ subjectId: entry.subjectId, questionNo, outcomeId: match.outcomeId }); matched++; }
        else if (match.reason === 'AMBIGUOUS') ambiguous++;
        else if (match.reason === 'UNVERIFIED') unverified++;
        else missing++;
      }
    }
    setOutcomeMappings(mappings);
    return { matched, ambiguous, missing, unverified };
  };

  const analyseKey = (text = answerKeyText) => {
    const result = parseAnswerKeyText(text, options.subjects as SubjectOption[]);
    setAnalysis(result);
    if (!result.entries.length) { setError('Cevap anahtarında ders satırı bulunamadı. Örnek: MAT: ABCDE... veya TUR;ABCDE...'); return; }
    setError('');
    setBooklets(result.detectedBooklets.join(','));
    setKeyEntries(result.entries);
    const mappingSummary = autoMatchOutcomes(result);
    const cfg = Object.entries(result.questionCounts).map(([subjectId, questionCount], index) => { const questionStart = result.questionStarts[subjectId] || 1; return { subjectId, questionCount, questionStart, questionEnd: questionStart + questionCount - 1, optionCount: 5 as const, questionStatus: 'ACTIVE' as const, wrongDivisor: selectedChoice.defaultWrongDivisor, sortOrder: index + 1 }; });
    setSubjects(cfg);
    const outcomeNotice = result.entries.some((entry) => (entry.outcomeRefs || []).some(Boolean))
      ? ` ${mappingSummary.matched} kazanım otomatik eşleşti; ${mappingSummary.ambiguous + mappingSummary.missing + mappingSummary.unverified} kayıt manuel kontrol bekliyor.`
      : '';
    setNotice(`Cevap anahtarı analiz edildi: ${cfg.length} ders, ${cfg.reduce((n, x) => n + x.questionCount, 0)} soru, ${result.detectedBooklets.length} kitapçık.${outcomeNotice}`);
  };

  const readAnswerFile = async (file?: File) => {
    if (!file) return;
    let text = '';
    if (file.name.toLowerCase().endsWith('.xlsx')) {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      text = firstSheet ? XLSX.utils.sheet_to_csv(firstSheet) : '';
    } else text = await file.text();
    setAnswerKeyText(text);
    analyseKey(text);
  };

  const downloadOutcomeTemplate = () => {
    const escapeCsv = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const headers = ['Ders', 'Soru', 'Kitapçık', 'Doğru Cevap', 'Şık Sayısı', 'Kabul Edilen Cevaplar', 'Durum', 'Kazanım Kodu', 'Kazanım Açıklaması', 'Ünite', 'Konu', 'Alt Konu', 'Üst Kazanım Kodu'];
    const rows = selectedTemplate.sections.flatMap((item) => Array.from({ length: item.questionCount }, (_, index) => [item.subjectCode, item.questionStart + index, 'A', '', item.optionCount, '', 'ACTIVE', '', '', '', '', '', '']));
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${selectedTemplate.key.toLowerCase()}-kazanimli-cevap-anahtari-sablonu.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  const createExam = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const requiresOfficialOutcomes = definitionMode === 'OUTCOME' || Boolean(selectedTemplate.requiresOutcomes);
      if (!createForm.title.trim()) throw new Error('Sınav adı gereklidir.');
      if (!subjects.length) throw new Error('En az bir test/ders tanımlayın veya hazır şablon uygulayın.');
      if (user?.role === 'SUPER_ADMIN' && createForm.ownerType === 'INSTITUTION' && !createForm.institutionId) throw new Error('Kuruma özel sınav için kurum seçilmelidir.');
      if (createMethod === 'ANSWER_KEY' && !keyEntries.length) throw new Error('Önce cevap anahtarını yükleyin veya yapıştırıp analiz edin.');
      const scoringVersion = options.scoringVersions?.find((x: any) => x.id === createForm.scoringRuleVersionId);
      const scoringSettings = { show: { correct: resultSettings.correct, wrong: resultSettings.wrong, blank: resultSettings.blank, net: resultSettings.net, branchNet: resultSettings.branchNet, successPercent: resultSettings.successPercent, rawScore: resultSettings.rawScore, standardScore: resultSettings.standardScore, branchScore: resultSettings.branchScore, totalScore: resultSettings.totalScore, ranking: resultSettings.ranking, percentile: resultSettings.percentile }, rankingScopes: resultSettings.rankingScopes, includeObp: resultSettings.includeObp };
      const created = await api<any>('/api/exam-definitions', { method: 'POST', body: JSON.stringify({
        ownerType: createForm.ownerType,
        institutionId: createForm.ownerType === 'INSTITUTION' ? createForm.institutionId : null,
        academicYear: createForm.academicYear,
        title: createForm.title,
        examType: selectedChoice.examType,
        gradeLevel: selectedChoice.key === 'CUSTOM' ? Number(createForm.gradeLevel) : selectedChoice.gradeLevel,
        examDate: createForm.examDate || null,
        scoringRuleVersionId: createForm.scoringRuleVersionId || null,
        publisherName: createForm.publisherName || null,
        sessionLabel: createForm.sessionLabel || null,
        description: createForm.description || null,
        resultNetworkEnabled: createForm.resultNetworkEnabled,
        scoringOverride: scoringVersion?.rule_code === 'CUSTOM_EXAM' ? { wrongMode: customScoring.wrongMode, wrongDivisor: customScoring.wrongMode === 'CUSTOM' ? customScoring.wrongDivisor : customScoring.wrongMode === 'NONE' ? 0 : Number(customScoring.wrongMode), scoreScale: customScoring.scale === 0 ? customScoring.customScale : customScoring.scale, weights: customScoring.weights } : null,
        scoringSettings,
        outcomeMode: requiresOfficialOutcomes ? 'OFFICIAL_REQUIRED' : 'OPTIONAL',
      }) });
      if (subjects.length) {
        await api(`/api/exam-definitions/${created.id}/structure`, { method: 'PUT', body: JSON.stringify({ booklets: booklets.split(',').map((x) => x.trim()).filter(Boolean), subjects }) });
      }
      if (keyEntries.length) {
        await api(`/api/exam-definitions/${created.id}/answer-key`, { method: 'PUT', body: JSON.stringify({ entries: keyEntries, outcomeMappings, outcomeMode: requiresOfficialOutcomes ? 'OFFICIAL_REQUIRED' : 'OPTIONAL' }) });
      }
      setOutcomeRequired(requiresOfficialOutcomes);
      setSelectedId(created.id);
      setCreateForm((f) => ({ ...f, title: '' }));
      setNotice(definitionMode === 'OUTCOME' ? 'Sınav oluşturuldu. Şimdi soru-kazanım eşleştirmelerini tamamlayın.' : 'Sınav cevap anahtarından oluşturuldu. Kontrol edip yayınlayabilirsiniz.');
      await loadRows();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const toggleSubject = (subjectId: string, checked: boolean) => setSubjects((current) => checked
    ? [...current, { subjectId, questionCount: 20, questionStart: 1, questionEnd: 20, optionCount: 5, questionStatus: 'ACTIVE', wrongDivisor: selectedChoice.defaultWrongDivisor, sortOrder: current.length + 1 }]
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

  const saveGeneral = async () => {
    if (!selectedId) return;
    setBusy(true); setError('');
    try {
      await api(`/api/exam-definitions/${selectedId}`, { method: 'PATCH', body: JSON.stringify({ title: createForm.title, examType: selectedChoice.examType, gradeLevel: selectedChoice.key === 'CUSTOM' ? Number(createForm.gradeLevel) : selectedChoice.gradeLevel, examDate: createForm.examDate || null, scoringRuleVersionId: createForm.scoringRuleVersionId || null, publisherName: createForm.publisherName || null, sessionLabel: createForm.sessionLabel || null, description: createForm.description || null, resultNetworkEnabled: createForm.resultNetworkEnabled, scoringSettings: resultSettings, outcomeMode: outcomeRequired ? 'OFFICIAL_REQUIRED' : 'OPTIONAL', scoringOverride: isCustomScoring ? { wrongMode: customScoring.wrongMode, wrongDivisor: customScoring.wrongDivisor, scoreScale: customScoring.scale === 0 ? customScoring.customScale : customScoring.scale, weights: customScoring.weights } : null }) });
      setNotice('Sınav kartı ve puanlama ayarları güncellendi.'); await loadDetail(selectedId); await loadRows();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const setKey = (subjectId: string, bookletCode: string, answers: string) => setKeyEntries((current) => {
    const previous = current.find((x) => x.subjectId === subjectId && x.bookletCode === bookletCode);
    const next = current.filter((x) => !(x.subjectId === subjectId && x.bookletCode === bookletCode));
    const cfg = subjects.find((x) => x.subjectId === subjectId);
    next.push({ ...previous, subjectId, bookletCode, answers: cleanAnswers(answers), optionCount: cfg?.optionCount || previous?.optionCount || 5 }); return next;
  });
  const setQuestionMetadata = (subjectId: string, bookletCode: string, index: number, patch: { status?: 'ACTIVE' | 'CANCELLED' | 'EXCLUDED'; accepted?: string }) => setKeyEntries((current) => current.map((entry) => {
    if (entry.subjectId !== subjectId || entry.bookletCode !== bookletCode) return entry;
    const statuses = [...(entry.questionStatuses || Array.from({ length: entry.answers.length }, () => 'ACTIVE' as const))];
    const acceptedAnswers = [...(entry.acceptedAnswers || entry.answers.split('').map((answer) => [answer]))];
    if (patch.status) statuses[index] = patch.status;
    if (patch.accepted !== undefined) { const parsed = patch.accepted.split(/[|/,]/).map((x) => cleanAnswers(x).slice(0, 1)).filter(Boolean); acceptedAnswers[index] = parsed.length ? parsed : [entry.answers[index] || '']; }
    return { ...entry, questionStatuses: statuses, acceptedAnswers };
  }));
  const setOutcome = (subjectId: string, questionNo: number, outcomeId: string) => setOutcomeMappings((current) => {
    const next = current.filter((x) => !(x.subjectId === subjectId && x.questionNo === questionNo));
    if (outcomeId) next.push({ subjectId, questionNo, outcomeId }); return next;
  });

  const saveAnswerKey = async () => {
    if (!selectedId) return;
    setBusy(true); setError('');
    try {
      await api(`/api/exam-definitions/${selectedId}/answer-key`, { method: 'PUT', body: JSON.stringify({ entries: keyEntries, outcomeMappings, outcomeMode: outcomeRequired ? 'OFFICIAL_REQUIRED' : 'OPTIONAL' }) });
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
  const selectedScoring = options.scoringVersions?.find((x: any) => x.id === createForm.scoringRuleVersionId);
  const isCustomScoring = selectedScoring?.rule_code === 'CUSTOM_EXAM';

  return <>
    <div className="exam-builder-shell">
      <div className="exam-architecture-head">
        <div className="exam-architecture-brand"><span className="exam-architecture-mark">A</span><span><strong>ANUNEX</strong><small>Eğitimde Daha Fazlası</small></span></div>
        <div className="exam-architecture-title"><span className="eyebrow">SÜPER ADMİN · TEK PANEL AKIŞI</span><h1>ANUNEX — Sınav Ekle Mimarisi</h1><p>app.anunex.com + sonuc.anunex.com | Sınav kartı, cevap anahtarı ve puanlama tek akışta.</p></div>
        <div className="exam-builder-head-badge"><Sparkles size={17}/><span>Hızlı, sade, hatasız sınav kartı</span></div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}

      <div className="exam-builder-layout">
        <div className="exam-builder-main">
          <section className="builder-card architecture-card">
            <div className="builder-step-head">
              <span className="builder-step-number">1</span>
              <div><span className="eyebrow">TEMEL BİLGİLER</span><h2>Sınav Kartı</h2><p>Sınavın temel bilgilerini girin. Seçtiğiniz tür, ders yapısını ve puanlama profilini hazırlar.</p></div>
            </div>
            <div className="form-grid builder-form-grid exam-card-grid">
              {user?.role === 'SUPER_ADMIN' && <label>Yayınevi adı *<input value={createForm.publisherName} onChange={(e) => setCreateForm((f) => ({ ...f, publisherName: e.target.value }))} placeholder="Yayınevi seçin veya yazın..." /></label>}
              <label>Sınav adı *<input value={createForm.title} onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))} placeholder="Sınav adını girin..." /></label>
              <label>Sınav türü *<select value={choiceKey} onChange={(e) => setChoiceKey(e.target.value)}>{EXAM_CHOICES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
              <label>Eğitim yılı *<input value={createForm.academicYear} onChange={(e) => setCreateForm((f) => ({ ...f, academicYear: e.target.value }))} /></label>
              <label>Sınıf düzeyi *<select value={createForm.gradeLevel} onChange={(e) => setCreateForm((f) => ({ ...f, gradeLevel: e.target.value }))}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}. sınıf</option>)}</select></label>
              <label>Oturum / Bölüm *<input value={createForm.sessionLabel} onChange={(e) => setCreateForm((f) => ({ ...f, sessionLabel: e.target.value }))} placeholder="Örn. Sayısal / 1. Oturum" /></label>
            </div>
            <label className="builder-textarea-label"><span>Açıklama / Not</span><textarea rows={2} value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))} placeholder="Sınavla ilgili açıklama ekleyin..." /></label>
            <div className="builder-mode-row">
              <div><strong>Değerlendirme tipi</strong><span>Sonuç ekranında kullanılacak analiz kapsamı</span></div>
              <div className="segmented-control"><button type="button" className={definitionMode === 'STANDARD' ? 'active' : ''} onClick={() => { setDefinitionMode('STANDARD'); setOutcomeRequired(false); }}>Standart</button><button type="button" className={definitionMode === 'OUTCOME' ? 'active' : ''} onClick={() => { setDefinitionMode('OUTCOME'); setOutcomeRequired(true); }}><Sparkles size={15}/> Kazanımlı</button></div>
            </div>
          </section>

          <section className="builder-card architecture-card">
            <div className="builder-step-head">
              <span className="builder-step-number">2</span>
              <div><span className="eyebrow">SORU VE KAZANIMLAR</span><h2>Cevap Anahtarı</h2><p>Hazır şablon kullanın veya standart dışı sınavı kendiniz oluşturun.</p></div>
            </div>
            <div className="creation-method-grid">
              <button type="button" className={`creation-method ${createMethod === 'ANSWER_KEY' ? 'selected' : ''}`} onClick={() => setCreateMethod('ANSWER_KEY')}><FileUp size={19}/><span><strong>Hazır şablon kullan</strong><small>CSV/XLSX kazanımlı cevap anahtarını eşleştir</small></span></button>
              <button type="button" className={`creation-method ${createMethod === 'MANUAL' ? 'selected' : ''}`} onClick={() => setCreateMethod('MANUAL')}><BookOpenCheck size={19}/><span><strong>Kendin oluştur</strong><small>Ders, aralık, şık ve cevap yapısını tanımla</small></span></button>
            </div>
            {createMethod === 'ANSWER_KEY' ? <>
              <div className="builder-inline-fields">
                <label><span>Hazır sınav şablonu</span><select value={templateKey} onChange={(e) => { const key = e.target.value; const chosen = EXAM_TEMPLATES.find((template) => template.key === key); setTemplateKey(key); setOutcomeRequired(Boolean(chosen?.requiresOutcomes)); setDefinitionMode(chosen?.requiresOutcomes ? 'OUTCOME' : 'STANDARD'); const baseKey = key.endsWith('_OUTCOME') ? key.slice(0, -8) : key; const nextChoice = baseKey === 'SCHOOL_5' || baseKey === 'SCHOOL_6' || baseKey === 'SCHOOL_7' ? `STD_${baseKey.slice(-1)}` : baseKey; if (EXAM_CHOICES.some((choice) => choice.key === nextChoice)) setChoiceKey(nextChoice); }}>{EXAM_TEMPLATES.map((template) => <option key={template.key} value={template.key}>{template.label}</option>)}</select></label>
                <div className="template-helper"><strong>{selectedTemplate.label}</strong><span>{selectedTemplate.description}</span><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="ghost" onClick={downloadOutcomeTemplate}>Kazanımlı CSV indir</button><button type="button" className="secondary" onClick={() => applyTemplate()}>Şablonu uygula</button></div></div>
              </div>
              <div className="builder-inline-fields">
                <label className="upload-field"><span>CSV / XLSX kazanımlı cevap anahtarı</span><span className="upload-zone-compact"><UploadCloud size={18}/><input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => void readAnswerFile(e.target.files?.[0])} /><b>Dosyanızı buraya sürükleyin veya seçin</b><small>Maksimum dosya boyutu: 10 MB</small></span></label>
                <label><span>Kitapçıklar</span><input value={booklets} onChange={(e) => setBooklets(e.target.value)} placeholder="A veya A,B" /></label>
              </div>
              <label className="builder-textarea-label"><span>Veya cevap anahtarını yapıştır</span><textarea rows={7} value={answerKeyText} onChange={(e) => setAnswerKeyText(e.target.value)} placeholder={'MAT: ABCDEABCDE\nTUR: ABCDEABCDE\nFEN: ABCDEABCDE\n\n[A] ve [B] başlıklarıyla çoklu kitapçık da girebilirsiniz.'} /></label>
              <div className="builder-footer-row"><button type="button" className="secondary" onClick={() => analyseKey()}><FileUp size={16}/> Anahtarı analiz et</button>{analysis && <div className={analysis.unknownLines.length ? 'builder-analysis warning' : 'builder-analysis success'}><strong>{Object.keys(analysis.questionCounts).length} ders bulundu.</strong> {analysis.unknownLines.length ? `${analysis.unknownLines.length} satır kontrol edilmeli.` : 'Soru sayıları otomatik çıkarıldı.'}</div>}</div>
            </> : <div className="cards-list builder-subject-list">{visibleSubjects.map((s: any) => { const cfg = subjects.find((x) => x.subjectId === s.id); return <div className="list-card" key={s.id}><input type="checkbox" checked={selectedSubjectIds.has(s.id)} onChange={(e) => toggleSubject(s.id, e.target.checked)} /><div><strong>{s.name}</strong><span>{s.code}</span></div>{cfg && <><label className="compact-field">Başlangıç<input type="number" min="1" value={cfg.questionStart} onChange={(e) => patchSubject(s.id, { questionStart: Number(e.target.value), questionEnd: Number(e.target.value) + cfg.questionCount - 1 })} /></label><label className="compact-field">Bitiş<input type="number" min={cfg.questionStart} value={cfg.questionEnd} onChange={(e) => patchSubject(s.id, { questionEnd: Number(e.target.value), questionCount: Number(e.target.value) - cfg.questionStart + 1 })} /></label><label className="compact-field">Şık<select value={cfg.optionCount} onChange={(e) => patchSubject(s.id, { optionCount: Number(e.target.value) as 4 | 5 })}><option value="4">4</option><option value="5">5</option></select></label></>}</div>; })}</div>}
          </section>

          <section className="builder-card architecture-card">
            <div className="builder-step-head">
              <span className="builder-step-number">3</span>
              <div><span className="eyebrow">DEĞERLENDİRME KURALI</span><h2>Puan Hesaplama</h2><p>Resmî MEB / ÖSYM profilini kullanın veya özel deneme kuralını belirleyin.</p></div>
            </div>
            <div className="scoring-profile-row"><label>Puanlama profili *<select value={createForm.scoringRuleVersionId} onChange={(e) => setCreateForm((f) => ({ ...f, scoringRuleVersionId: e.target.value }))}><option value="">Seçiniz</option>{options.scoringVersions?.map((s: any) => <option key={s.id} value={s.id}>{s.rule_name} · {s.academic_year} {s.version}{s.official ? ' · Kilitli resmî profil' : ''}</option>)}</select></label><div className="locked-profile-note"><LockKeyhole size={16}/><span>{selectedScoring?.official ? 'Resmî profil kilitli; oran ve katsayılar değiştirilemez.' : 'Özel profil seçildiğinde alanlar sınava özel açılır.'}</span></div></div>
            {isCustomScoring && <div className="custom-scoring-box"><div><strong>Özel deneme puanlaması</strong><span>Yanlış oranı, puan ölçeği ve branş ağırlıkları bu sınava özel kaydedilir.</span></div><div className="form-grid"><label>Yanlışlar doğruyu götürsün mü?<select value={customScoring.wrongMode} onChange={(e) => setCustomScoring((x) => ({ ...x, wrongMode: e.target.value }))}><option value="NONE">Hayır</option><option value="2">2 yanlış = 1 doğru</option><option value="3">3 yanlış = 1 doğru</option><option value="4">4 yanlış = 1 doğru</option><option value="5">5 yanlış = 1 doğru</option><option value="CUSTOM">Özel oran</option></select></label>{customScoring.wrongMode === 'CUSTOM' && <label>Özel oran<input type="number" min="0.1" max="20" step="0.1" value={customScoring.wrongDivisor} onChange={(e) => setCustomScoring((x) => ({ ...x, wrongDivisor: Number(e.target.value) }))} /></label>}<label>Sınav kaç üzerinden?<select value={customScoring.scale} onChange={(e) => setCustomScoring((x) => ({ ...x, scale: Number(e.target.value) }))}><option value="100">100</option><option value="500">500</option><option value="1000">1000</option><option value="0">Özel değer</option></select></label>{customScoring.scale === 0 && <label>Özel değer<input type="number" min="1" value={customScoring.customScale} onChange={(e) => setCustomScoring((x) => ({ ...x, customScale: Number(e.target.value) }))} /></label>}</div><div className="custom-weight-grid"><strong>Branş ağırlıkları</strong>{subjects.map((subject) => <label key={subject.subjectId}>{subjectName(options, subject.subjectId)}<input type="number" min="0" step="0.1" value={customScoring.weights[subject.subjectId] ?? 1} onChange={(e) => setCustomScoring((x) => ({ ...x, weights: { ...x.weights, [subject.subjectId]: Number(e.target.value) } }))} /></label>)}</div></div>}
            <div className="result-settings-box"><div><strong>Sonuçta gösterilecekler ve sıralama</strong><span>Değerlendirme motoru yalnız seçilen sonuç metriklerini üretir.</span></div><div className="check-grid">{[['correct','Doğru'],['wrong','Yanlış'],['blank','Boş'],['net','Net'],['branchNet','Branş neti'],['successPercent','Başarı yüzdesi'],['rawScore','Ham puan'],['standardScore','Standart puan'],['branchScore','Branş puanı'],['totalScore','Toplam puan'],['ranking','Sıralama'],['percentile','Yüzdelik dilim']].map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean((resultSettings as any)[key])} onChange={(e) => setResultSettings((x) => ({ ...x, [key]: e.target.checked }))} />{label}</label>)}</div><div className="ranking-scope-row"><strong>Sıralama kapsamı</strong>{[['INSTITUTION','Kurum'],['DISTRICT','İlçe'],['CITY','İl'],['NATIONAL','Türkiye'],['NETWORK','Zincir']].map(([value, label]) => <label key={value}><input type="checkbox" checked={resultSettings.rankingScopes.includes(value)} onChange={(e) => setResultSettings((x) => ({ ...x, rankingScopes: e.target.checked ? [...new Set([...x.rankingScopes, value])] : x.rankingScopes.filter((scope) => scope !== value) }))} />{label}</label>)}</div>{(selectedScoring?.rule_code?.startsWith('OSYM_YKS_') || selectedChoice.examType === 'AYT' || selectedChoice.examType === 'YDT') && <label className="publish-toggle"><input type="checkbox" checked={resultSettings.includeObp} onChange={(e) => setResultSettings((x) => ({ ...x, includeObp: e.target.checked }))} /><span><strong>OBP katkısını kullan</strong><small>YKS sonuçlarında gerektiğinde adayın OBP verisi ayrıca işlenir.</small></span></label>}</div>
          </section>

          <section className="builder-card architecture-card publication-card">
            <div className="builder-step-head"><span className="builder-step-number">4</span><div><span className="eyebrow">YAYIN VE KONTROL</span><h2>Yayın Ayarı / Önizleme</h2><p>Sınav oluşturulmadan önce bilgileri son kez kontrol edin.</p></div></div>
            <div className="publication-preview"><div className="publication-system"><Globe2 size={19}/><div><strong>app.anunex.com</strong><span>Varsayılan merkezi sistem</span></div></div><label className="publish-toggle inline-publish"><input type="checkbox" checked={createForm.resultNetworkEnabled} onChange={(e) => setCreateForm((f) => ({ ...f, resultNetworkEnabled: e.target.checked }))} /><span><strong>Bu sınav sonuc.anunex.com'da yayınlansın</strong><small>Oluşturulan sınav, onay sonrası sonuç platformunda görüntülenir.</small></span></label><div className="live-preview-chip"><Eye size={16}/><span><strong>Sınavı önizle</strong><small>{selectedChoice.label} · {totalConfiguredQuestions} soru · {selectedScoring?.rule_name || 'Puanlama profili seçilmedi'}</small></span></div></div>
            <div className="builder-create-row"><div><strong>Hazır olduğunuzda sınavı oluşturun</strong><span>Oluşturulan kayıt önce taslak olarak açılır; optik/FMT daha sonra bağlanır.</span></div><div className="builder-action-buttons"><button type="button" className="secondary" disabled={busy} onClick={() => setNotice('Taslak bilgileri bu oturumda hazır. Sınav oluşturduğunuzda kalıcı olarak kaydedilir.')}><Save size={16}/> Taslak Kaydet</button><button type="button" className="primary builder-create-button" disabled={busy || !createForm.title.trim()} onClick={createExam}><Check size={17}/> Sınav Oluştur</button></div></div>
          </section>
        </div>

        <aside className="exam-builder-summary">
          <div className="architecture-panel workflow-panel"><div className="architecture-panel-title"><Workflow size={28}/><div><h2>Önerilen İş Akışı</h2><p>Sınav oluşturma sürecinin adım adım akışı</p></div><span className="recommended-badge"><CheckCircle2 size={13}/> Önerilen</span></div><div className="workflow-line">{[['1','Sınav Kartı','Bilgileri'],['2','Şablon Seç veya','Kendin Oluştur'],['3','Cevap Anahtarı','Yükle'],['4','Kazanım','Eşleştir'],['5','Önizleme &','Doğrulama'],['6','Sınav','Oluştur'],['7','Yayın Durumu:','app / sonuc']].map(([number, title, subtitle], index) => <div className="workflow-step" key={number}><span className="workflow-number">{number}</span><span className="workflow-icon">{index === 0 ? <FileText size={19}/> : index === 1 ? <Layers3 size={19}/> : index === 2 ? <UploadCloud size={19}/> : index === 3 ? <Link2 size={19}/> : index === 4 ? <Eye size={19}/> : index === 5 ? <Check size={19}/> : <Share2 size={19}/>}</span><strong>{title}<br/>{subtitle}</strong></div>)}</div><div className="architecture-info"><Info size={18}/><span>Bu akış, Süper Admin’in en hızlı ve hatasız şekilde sınav oluşturabilmesi için tasarlanmıştır.</span></div></div>
          <div className="architecture-panel option-panel"><div className="architecture-panel-title"><Layers3 size={28}/><div><h2>Mimari Seçenekler</h2><p>Sınav oluşturma ve yayınlama için önerilen yaklaşım</p></div></div><div className="architecture-option selected"><div className="option-heading"><span className="option-letter">A</span><strong>Model A — Tek Panel + Yayın Onayı</strong><span className="recommended-badge">Önerilen</span></div>{['Süper Admin tek ekrandan sınav açar','Yayın kutusu ile sonuc.anunex.com kontrol edilir','Optik / FMT daha sonra tanımlanır','Daha az adım, daha hızlı kullanım'].map((item) => <div className="option-point" key={item}><CheckCircle2 size={16}/><span>{item}</span></div>)}<div className="option-note">Hızlı uygulama, düşük operasyon yükü, maksimum verim.</div></div><div className="architecture-option"><div className="option-heading"><span className="option-letter muted-letter">B</span><strong>Model B — Ayrı Hazırlık Alanı</strong></div><div className="option-point"><CheckCircle2 size={16}/><span>Daha kapsamlı yapı; ancak kurulum ve kullanım maliyeti daha yüksek.</span></div></div></div>
          <div className="architecture-panel requirements-panel"><div className="architecture-panel-title"><ShieldCheck size={28}/><div><h2>Cevap Anahtarında Olmazsa Olmazlar</h2><p>Doğru, tutarlı ve hatasız bir sınav için kritik gereksinimler</p></div></div><div className="requirements-grid">{['Ders bazlı bölümleme','Boş / geçersiz cevap kontrolü','4 ve 5 şıklı soru desteği','Kazanım kodu + açıklaması','Soru no aralık kontrolü','Önizleme ve doğrulama zorunlu','Taslak kaydetme desteği','İptal / değerlendirme dışı soru'].map((item) => <div key={item}><CheckCircle2 size={16}/><span>{item}</span></div>)}</div></div>
          <div className="summary-card live-summary-card"><div className="summary-card-head"><span className="eyebrow">CANLI ÖNİZLEME</span><CheckCircle2 size={20}/></div><h2>{createForm.title.trim() || 'Yeni sınav'}</h2><p>{selectedChoice.label} · {createForm.academicYear}</p><div className="summary-metrics"><div><strong>{totalConfiguredQuestions}</strong><span>toplam soru</span></div><div><strong>{totalAnswerSlots}</strong><span>cevap alanı</span></div></div><div className="summary-checklist"><div className={createForm.title.trim() ? 'ready' : ''}><span>1</span><span>Sınav kartı</span><b>{createForm.title.trim() ? 'Hazır' : 'Bekliyor'}</b></div><div className={subjects.length ? 'ready' : ''}><span>2</span><span>Ders yapısı</span><b>{subjects.length ? subjects.length + ' test' : 'Bekliyor'}</b></div><div className={createMethod === 'MANUAL' || keyEntries.length ? 'ready' : ''}><span>3</span><span>Cevap anahtarı</span><b>{createMethod === 'MANUAL' ? 'Manuel' : (keyEntries.length ? 'Hazır' : 'Bekliyor')}</b></div></div><div className="summary-tip"><Sparkles size={16}/><span>Kazanımlı sınavlarda yayın öncesi her soru bir kazanıma bağlanır.</span></div></div>
        </aside>
      </div>
    </div>

    <div className="table-card" style={{ marginBottom: 20 }}><table><thead><tr><th>Sınav</th><th>Tür / Sınıf</th><th>Durum</th><th>Platform</th><th>Ders / Soru</th><th>Cevap</th><th>Kazanım</th><th></th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td><strong>{r.title}</strong><br /><small>{r.academic_year}{r.publisher_name ? ` · ${r.publisher_name}` : ''}{r.institution_name ? ` · ${r.institution_name}` : ''}</small></td><td>{r.exam_type} · {r.grade_level ? `${r.grade_level}. sınıf` : '-'}</td><td><span className={`status ${r.status === 'ACTIVE' ? 'ok' : 'neutral'}`}>{r.status}</span></td><td>{r.result_network_enabled ? <span className="status ok">Sonuç ağı</span> : <span className="status neutral">app</span>}</td><td>{r.subject_count} / {r.question_count}</td><td>{r.answer_count}</td><td>{r.outcome_mapped_count}</td><td><button className="ghost" onClick={() => setSelectedId(r.id)}>Aç / Düzenle</button></td></tr>)}</tbody></table></div>

    {detail && <>
      <div className="section-head"><div><h2>{detail.exam.title}</h2><p>{detail.exam.exam_type} · {detail.exam.grade_level}. sınıf · {detail.exam.status === 'DRAFT' ? 'Düzenlenebilir taslak' : 'Yayında'}{detail.exam.outcome_mode === 'OFFICIAL_REQUIRED' ? ' · doğrulanmış kazanım zorunlu' : ''}{detail.exam.result_network_enabled ? ' · sonuc.anunex.com seçili' : ''}</p></div>{detail.exam.status === 'DRAFT' && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="secondary" disabled={busy} onClick={saveGeneral}><Save size={16} /> Kartı güncelle</button><button className="primary" disabled={busy || !detail.readiness?.ready_to_publish} onClick={publish}><Send size={17} /> Sınavı Yayınla</button></div>}</div>
      <div className="kpi-grid" style={{ marginBottom: 20 }}><div className="kpi-card"><span>Soru</span><strong>{detail.readiness?.actual_questions || 0}/{detail.readiness?.expected_questions || 0}</strong></div><div className="kpi-card"><span>Cevap</span><strong>{detail.readiness?.actual_answers || 0}/{detail.readiness?.expected_answers || 0}</strong></div><div className="kpi-card"><span>Kazanımlı Soru</span><strong>{detail.readiness?.outcome_mapped_questions || 0}</strong></div><div className="kpi-card"><span>Hazır mı?</span><strong>{detail.readiness?.ready_to_publish ? 'Evet' : 'Eksik var'}</strong></div></div>
      {detail.exam.status === 'DRAFT' && <>
        <div className="panel" style={{ marginBottom: 20 }}><div className="panel-head"><div><h2>Dersler ve soru aralıkları</h2><p>Başlangıç/bitiş numarası ve 4 veya 5 şık yapısı soru tanımının parçasıdır.</p></div></div><label>Kitapçıklar<input value={booklets} onChange={(e) => setBooklets(e.target.value)} /></label><div className="cards-list">{visibleSubjects.map((s: any) => { const cfg = subjects.find((x) => x.subjectId === s.id); return <div className="list-card" key={s.id}><input type="checkbox" checked={selectedSubjectIds.has(s.id)} onChange={(e) => toggleSubject(s.id, e.target.checked)} /><div style={{ flex: 1 }}><strong>{s.name}</strong><span>{s.code}</span></div>{cfg && <><label className="compact-field">Başlangıç<input type="number" value={cfg.questionStart} onChange={(e) => patchSubject(s.id, { questionStart: Number(e.target.value), questionEnd: Number(e.target.value) + cfg.questionCount - 1 })} /></label><label className="compact-field">Bitiş<input type="number" value={cfg.questionEnd} onChange={(e) => patchSubject(s.id, { questionEnd: Number(e.target.value), questionCount: Number(e.target.value) - cfg.questionStart + 1 })} /></label><label className="compact-field">Şık<select value={cfg.optionCount} onChange={(e) => patchSubject(s.id, { optionCount: Number(e.target.value) as 4 | 5 })}><option value="4">4</option><option value="5">5</option></select></label><label className="compact-field">Yanlış götürme<input type="number" step="0.5" value={cfg.wrongDivisor} onChange={(e) => patchSubject(s.id, { wrongDivisor: Number(e.target.value) })} /></label></>}</div>; })}</div><button className="secondary" onClick={saveStructure}><Save size={16} /> Yapıyı Kaydet</button></div>

        {!!detail.subjects?.length && !!detail.booklets?.length && <div className="panel" style={{ marginBottom: 20 }}><div className="panel-head"><div><h2>Cevap anahtarı</h2><p>Doğru cevap, alternatif kabul, soru durumu ve kazanım bağlantısı aynı tanımda tutulur.</p></div><CheckCircle2 /></div>{detail.subjects.map((s: any) => <div key={s.subject_id} style={{ padding: 14, marginBottom: 12, border: '1px solid var(--border,#e5e7eb)', borderRadius: 12 }}><strong>{s.name} · {s.question_count} soru · {s.option_count || 5} şık</strong>{detail.booklets.map((b: any) => { const entry = keyEntries.find((x) => x.subjectId === s.subject_id && x.bookletCode === b.code); return <div key={b.code}><label>{b.code} Kitapçığı<input value={entry?.answers || ''} onChange={(e) => setKey(s.subject_id, b.code, e.target.value)} placeholder={`${s.question_count} cevap`} /><small>{entry?.answers.length || 0}/{s.question_count}</small></label><div className="question-meta-grid">{Array.from({ length: Number(s.question_count) }, (_, index) => { const questionNo = Number(s.question_start || 1) + index; const status = entry?.questionStatuses?.[index] || 'ACTIVE'; const accepted = entry?.acceptedAnswers?.[index]; const acceptedText = Array.isArray(accepted) ? accepted.join('|') : accepted || entry?.answers?.[index] || ''; return <div key={questionNo}><strong>{questionNo}</strong><select aria-label={`${b.code} ${questionNo} durumu`} value={status} onChange={(e) => setQuestionMetadata(s.subject_id, b.code, index, { status: e.target.value as any })}><option value="ACTIVE">Aktif</option><option value="CANCELLED">İptal</option><option value="EXCLUDED">Değerlendirme dışı</option></select><input aria-label={`${b.code} ${questionNo} kabul`} value={acceptedText} onChange={(e) => setQuestionMetadata(s.subject_id, b.code, index, { accepted: e.target.value })} placeholder="A veya A|B" /></div>; })}</div></div>; })}</div>)}<label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={outcomeRequired} onChange={(e) => setOutcomeRequired(e.target.checked)} /> Bu sınav kazanımlı; bütün sorular kazanıma bağlanacak.</label>
          {outcomeRequired && <div style={{ marginTop: 14 }}>{detail.subjects.map((s: any) => <div key={s.subject_id} style={{ marginBottom: 18 }}><h3>{s.name} kazanımları</h3><div className="form-grid">{Array.from({ length: Number(s.question_count) }, (_, i) => Number(s.question_start || 1) + i).map((q) => <label key={q}>Soru {q}<select value={outcomeMappings.find((x) => x.subjectId === s.subject_id && x.questionNo === q)?.outcomeId || ''} onChange={(e) => setOutcome(s.subject_id, q, e.target.value)}><option value="">Kazanım seç</option>{options.outcomes?.filter((o: any) => o.subject_id === s.subject_id).map((o: any) => <option key={o.id} value={o.id}>{o.code ? `${o.code} · ` : ''}{o.title}</option>)}</select></label>)}</div></div>)}</div>}
          <button className="primary" onClick={saveAnswerKey}><Save size={16} /> Cevap Anahtarı ve Kazanımları Kaydet</button></div>}

        {detail.exam.owner_type === 'CENTRAL' && user?.role === 'SUPER_ADMIN' && <div className="panel" style={{ marginBottom: 20 }}><div className="panel-head"><div><h2>Hangi kurumlar kullanacak?</h2><p>Merkezi sınav yalnız seçtiğiniz kurumlarda görünür.</p></div></div><div className="cards-list">{options.institutions?.map((i: any) => <label className="list-card" key={i.id}><input type="checkbox" checked={assignedInstitutions.includes(i.id)} onChange={(e) => setAssignedInstitutions((x) => e.target.checked ? [...new Set([...x, i.id])] : x.filter((id) => id !== i.id))} /><div><strong>{i.name}</strong><span>{i.status}</span></div></label>)}</div><button className="secondary" onClick={saveInstitutions}><Save size={16} /> Kurumları Kaydet</button></div>}
      </>}
      {!detail.readiness?.ready_to_publish && <div className="alert warning"><CircleAlert size={16} /> Yayın için soru sayısı, bütün kitapçık cevapları ve doğrulanmış puanlama kuralı tamamlanmalıdır.{outcomeRequired ? ' Kazanımlı sınavda ayrıca her soru kazanıma bağlanmalıdır.' : ''}</div>}
    </>}
  </>;
}
