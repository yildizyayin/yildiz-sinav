import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Archive, ArrowLeft, ArrowRight, BookOpenCheck, Check, CheckCircle2, CircleAlert, Clock3, Copy, Eye, FileText, FileUp, Globe2, Info, Layers3, Link2, LockKeyhole, MoreVertical, PlayCircle, Printer, RefreshCw, Save, Send, Share2, ShieldCheck, Sparkles, Trash2, UploadCloud, Workflow } from 'lucide-react';
import * as XLSX from 'xlsx';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { EXAM_CHOICES, EXAM_TEMPLATES, cleanAnswers, matchOfficialOutcome, parseAnswerKeyText, parseAnswerKeyWorkbookRows, type ExamTemplate, type OutcomeCatalogEntry, type ParsedAnswerEntry, type SubjectOption } from '../lib/guidedDefinitions';

type SubjectConfig = { subjectId: string; questionCount: number; questionStart: number; questionEnd: number; optionCount: 4 | 5; questionStatus: 'ACTIVE' | 'CANCELLED' | 'EXCLUDED'; wrongDivisor: number; sortOrder: number };
type OutcomeMap = { subjectId: string; questionNo: number; outcomeId: string };
type DefinitionMode = 'STANDARD' | 'OUTCOME';
type CreateMethod = 'ANSWER_KEY' | 'MANUAL';
type BuilderStep = 1 | 2 | 3 | 4;
type ExamDocumentKind = 'ANSWER_KEY_PDF' | 'OUTCOME_TABLE' | 'EXAM_PDF' | 'OPTICAL_DOCUMENT' | 'SEKONIC' | 'BICOM' | 'OTHER_DIGITAL_FILE' | 'PUBLISHER_LOGO' | 'VIDEO_SOLUTION';
type PendingDocument = { id: string; kind: ExamDocumentKind; title: string; file: File; bookletCode: string };
type PendingVideo = { id: string; title: string; url: string; publishMode: 'DRAFT' | 'NOW' | 'SCHEDULED'; publishAt: string; visibility: 'STUDENT_TEACHER' };

const EXAM_DOCUMENT_OPTIONS: Array<{ value: ExamDocumentKind; label: string; help: string }> = [
  { value: 'ANSWER_KEY_PDF', label: 'Cevap Anahtarı PDF', help: 'Kazanımsız/standart cevap anahtarını arşivler.' },
  { value: 'OUTCOME_TABLE', label: 'Kazanım Tablosu', help: 'CSV/XLSX/PDF kazanım kaynağını saklar.' },
  { value: 'EXAM_PDF', label: 'Deneme PDF', help: 'Öğrencinin görebileceği deneme belgesini arşivler.' },
  { value: 'OPTICAL_DOCUMENT', label: 'Optik Dokümanı', help: 'Optik referans dosyasıdır; optik tanımının yerine geçmez.' },
  { value: 'SEKONIC', label: 'Sekonic', help: 'Sekonic okuma kaynağını optik arşivine ekler.' },
  { value: 'BICOM', label: 'Bicom', help: 'Bicom okuma kaynağını optik arşivine ekler.' },
  { value: 'OTHER_DIGITAL_FILE', label: 'Diğer Dijital Dosya', help: 'Sınava ait ek dijital belgeyi arşivler.' },
  { value: 'PUBLISHER_LOGO', label: 'Yayınevi Logosu', help: 'Kazanımsız cevap anahtarı PDF üretiminde kullanılır.' },
  { value: 'VIDEO_SOLUTION', label: 'Video Çözüm', help: 'Bağlantıyı şimdi, taslakta veya planlanan tarihte yayınlar.' },
];

function documentAccept(kind: ExamDocumentKind) {
  if (kind === 'PUBLISHER_LOGO') return 'image/png,image/jpeg,image/svg+xml,image/webp';
  if (kind === 'OPTICAL_DOCUMENT' || kind === 'SEKONIC' || kind === 'BICOM') return '.pdf,.csv,.xlsx,.txt,.dat,.fmt,.zip';
  return '.pdf,.csv,.xlsx';
}

function archiveDocumentLabel(asset: any) {
  let kind = '';
  try { kind = JSON.parse(asset.metadata_json || '{}').documentKind || ''; } catch { /* legacy archive row */ }
  const labels: Record<string, string> = {
    ANSWER_KEY_PDF: 'Cevap Anahtarı PDF',
    SOURCE_ANSWER_KEY: 'Cevap Anahtarı PDF',
    OUTCOME_TABLE: 'Kazanım Tablosu',
    QUALIFIED_ANSWER_KEY: 'Kazanım Tablosu',
    EXAM_PDF: 'Deneme PDF',
    OPTICAL_DOCUMENT: 'Optik Dokümanı',
    SEKONIC: 'Sekonic',
    BICOM: 'Bicom',
    OTHER_DIGITAL_FILE: 'Diğer Dijital Dosya',
    PUBLISHER_LOGO: 'Yayınevi logosu',
    PLAIN_ANSWER_KEY_PDF: 'Kazanımsız markalı PDF',
  };
  return labels[kind] || labels[asset.asset_type] || 'Kaynak dosya';
}

function subjectName(options: any, id: string) {
  return options.subjects?.find((s: any) => s.id === id)?.name || id;
}
function safeDownloadName(value: string) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'sinav';
}

export function ExamDefinitions() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [options, setOptions] = useState<any>({ subjects: [], scoringVersions: [], institutions: [], outcomes: [] });
  const [rows, setRows] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState(() => searchParams.get('examId') || '');
  const [createdExamId, setCreatedExamId] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [openExamMenu, setOpenExamMenu] = useState<string | null>(null);

  const [createMethod, setCreateMethod] = useState<CreateMethod>('ANSWER_KEY');
  const [builderStep, setBuilderStep] = useState<BuilderStep>(1);
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
  const [answerKeyFile, setAnswerKeyFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<ReturnType<typeof parseAnswerKeyText> | null>(null);
  const [booklets, setBooklets] = useState('A');
  const [subjects, setSubjects] = useState<SubjectConfig[]>([]);
  const [keyEntries, setKeyEntries] = useState<ParsedAnswerEntry[]>([]);
  const [outcomeMappings, setOutcomeMappings] = useState<OutcomeMap[]>([]);
  const [assignedInstitutions, setAssignedInstitutions] = useState<string[]>([]);
  const [outcomeRequired, setOutcomeRequired] = useState(false);
  const [content, setContent] = useState<any>({ assets: [], videos: [] });
  const [contentBusy, setContentBusy] = useState(false);
  const [videoForm, setVideoForm] = useState({ url: '', title: '', linkType: 'EXAM', publishMode: 'DRAFT', publishAt: '', visibility: 'STUDENT_TEACHER' });
  const [opticalVersionId, setOpticalVersionId] = useState('');
  const [opticalBooklets, setOpticalBooklets] = useState<string[]>([]);
  const [opticalModes, setOpticalModes] = useState<string[]>(['TXT', 'DAT', 'CAMERA']);
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [pendingDocuments, setPendingDocuments] = useState<PendingDocument[]>([]);
  const [pendingVideos, setPendingVideos] = useState<PendingVideo[]>([]);
  const [documentDraft, setDocumentDraft] = useState<{ kind: ExamDocumentKind; title: string; file: File | null; bookletCode: string; url: string; publishMode: 'DRAFT' | 'NOW' | 'SCHEDULED'; publishAt: string }>({ kind: 'ANSWER_KEY_PDF', title: '', file: null, bookletCode: 'A', url: '', publishMode: 'DRAFT', publishAt: '' });

  const loadContent = async (id: string) => {
    const data = await api<any>(`/api/exam-content/${id}`);
    setContent(data);
    const binding = data.opticalBindings?.[0];
    setOpticalVersionId(binding?.optical_template_version_id || '');
    setOpticalBooklets(data.opticalBindings?.map((x: any) => x.booklet_code) || []);
    try { setOpticalModes(binding?.input_modes_json ? JSON.parse(binding.input_modes_json) : ['TXT', 'DAT', 'CAMERA']); } catch { setOpticalModes(['TXT', 'DAT', 'CAMERA']); }
    return data;
  };

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
  const loadRows = async () => {
    const data = await api<any>('/api/exam-definitions');
    setRows(Array.isArray(data.exams) ? data.exams : []);
  };
  const loadDetail = async (id: string) => {
    if (!id) { setDetail(null); return; }
    const data = await api<any>(`/api/exam-definitions/${id}`);
    if (!data?.exam?.id) throw new Error('Sınav kaydı okunamadı. Listeyi yenileyip tekrar deneyin.');
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
      entries.push({ subjectId: s.subject_id, bookletCode: b.code, answers, optionCount: Number(keyRows[0]?.answer_option_count || s.option_count || 5) === 4 ? 4 : 5, ...(keyRows.length ? { acceptedAnswers: keyRows.map((x: any) => { try { const parsed = JSON.parse(x.accepted_answers || '[]'); return Array.isArray(parsed) ? parsed : [x.correct_answer]; } catch { return [x.correct_answer]; } }), questionStatuses: keyRows.map((x: any) => x.answer_question_status || x.question_status || 'ACTIVE'), bookletQuestionNumbers: keyRows.map((x: any) => Number(x.printed_question_no || x.question_no)), outcomeRefs: keyRows.map((x: any) => { const code = String(x.outcome_codes || '').split(',')[0].trim(); const title = String(x.outcome_titles || '').split(',')[0].trim(); let publisher: any = null; try { publisher = x.publisher_outcome_json ? JSON.parse(x.publisher_outcome_json) : null; } catch { publisher = null; } return code || title || publisher?.publisherTitle || publisher?.publisherCode ? { code: code || publisher?.officialCode || undefined, title: title || publisher?.publisherTitle || undefined, ...publisher } : null; }) } : {}) });
    }
    for (const group of Object.values((data.optionalAnswerKey || []).reduce((acc: Record<string, any>, row: any) => {
      const key = `${row.subject_id}::${row.booklet_code}`;
      const current = acc[key] || { subjectId: row.subject_id, bookletCode: row.booklet_code, answers: '', optionCount: Number(row.answer_option_count || 4) === 4 ? 4 : 5, acceptedAnswers: [], questionStatuses: [], bookletQuestionNumbers: [] };
      current.answers += row.correct_answer || '';
      try { const parsed = JSON.parse(row.accepted_answers || '[]'); current.acceptedAnswers.push(Array.isArray(parsed) ? parsed : [row.correct_answer]); } catch { current.acceptedAnswers.push([row.correct_answer]); }
      current.questionStatuses.push(row.answer_question_status || row.question_status || 'ACTIVE');
      current.bookletQuestionNumbers.push(Number(row.question_no));
      acc[key] = current;
      return acc;
    }, {}))) entries.push(group as ParsedAnswerEntry);
    setKeyEntries(entries);
    const maps: OutcomeMap[] = [];
    for (const r of data.answerKey || []) for (const outcomeId of String(r.outcome_ids || '').split(',').filter(Boolean)) maps.push({ subjectId: r.subject_id, questionNo: Number(r.question_no), outcomeId });
    setOutcomeMappings(maps);
    setOutcomeRequired(data.exam.outcome_mode === 'OFFICIAL_REQUIRED' || maps.length > 0);
    setAssignedInstitutions((data.institutions || []).filter((x: any) => x.enabled).map((x: any) => x.institution_id));
    try { await loadContent(id); } catch { setContent({ assets: [], videos: [] }); }
    await loadOptions(Number(data.exam.grade_level) || undefined);
  };

  useEffect(() => { void Promise.all([loadRows(), loadOptions(selectedChoice.gradeLevel)]).catch((e) => setError(e.message)); }, []);
  useEffect(() => { if (user) setCreateForm((f) => ({ ...f, ownerType: user.role === 'SUPER_ADMIN' ? f.ownerType : 'INSTITUTION' })); }, [user?.role]);
  useEffect(() => { void loadOptions(selectedChoice.gradeLevel).catch((e) => setError(e.message)); }, [choiceKey]);
  useEffect(() => {
    const nextTemplate = selectedChoice.key === 'STD_5' || selectedChoice.key === 'STD_6' || selectedChoice.key === 'STD_7' ? `SCHOOL_${selectedChoice.gradeLevel}` : selectedChoice.key;
    setTemplateKey((current) => current === `${nextTemplate}_OUTCOME` && EXAM_TEMPLATES.some((x) => x.key === current) ? current : (EXAM_TEMPLATES.some((x) => x.key === nextTemplate) ? nextTemplate : 'CUSTOM'));
    setCreateForm((f) => ({ ...f, gradeLevel: String(selectedChoice.gradeLevel || f.gradeLevel) }));
  }, [choiceKey]);
  useEffect(() => {
    if (!selectedId) return;
    setDetail(null);
    setDetailLoading(true);
    void loadDetail(selectedId)
      .catch((e) => setError(e.message || 'Sınav ayrıntıları yüklenemedi.'))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);
  useEffect(() => {
    const queryId = searchParams.get('examId') || '';
    if (queryId !== selectedId) setSelectedId(queryId);
  }, [searchParams, selectedId]);

  const selectedSubjectIds = useMemo(() => new Set(subjects.map((s) => s.subjectId)), [subjects]);
  const visibleSubjects = useMemo(() => (options.subjects || []).filter((subject: any) => {
    const code = String(subject.code || '');
    if (selectedChoice.examType === 'TYT') return code.startsWith('TYT_');
    if (selectedChoice.examType === 'AYT') return code.startsWith('AYT_');
    if (selectedChoice.examType === 'YDT') return code === 'YDT_DIL';
    if (selectedChoice.examType === 'TYT_AYT') return code.startsWith('TYT_') || code.startsWith('AYT_');
    return !code.startsWith('TYT_') && !code.startsWith('AYT_');
  }), [options.subjects, selectedChoice.examType, selectedTemplate.sections]);

  const applyTemplate = (template: ExamTemplate = selectedTemplate) => {
    const next = template.sections.map((section, index) => {
      const subject = options.subjects?.find((s: any) => s.code === section.subjectCode);
      return subject ? { subjectId: subject.id, questionCount: section.questionCount, questionStart: section.questionStart, questionEnd: section.questionEnd, optionCount: section.optionCount, questionStatus: 'ACTIVE' as const, wrongDivisor: section.wrongDivisor, sortOrder: index + 1 } : null;
    }).filter(Boolean) as SubjectConfig[];
    if (template.sections.length && next.length !== template.sections.length) { setError('Şablon derslerinden bazıları henüz sistemde tanımlı değil. Önce veritabanı seed/migration adımını uygulayın.'); return; }
    setSubjects(next);
    setOutcomeRequired(Boolean(template.requiresOutcomes));
    setDefinitionMode(template.requiresOutcomes ? 'OUTCOME' : 'STANDARD');
    const requiredQuestions = next.reduce((n, x) => n + x.questionCount, 0);
    const optionalQuestions = (template.optionalSections || []).reduce((n: number, x: any) => n + x.questionCount, 0);
    setNotice(`${template.label} uygulandı: ${requiredQuestions} puanlanan soru, ${next.length} test.${optionalQuestions ? ` Cevap anahtarında ayrıca ${optionalQuestions} seçmeli soru alanı bulunur; toplam TYT sayısı 120 olarak kalır.` : ''}`);
  };

  const autoMatchOutcomes = (result: ReturnType<typeof parseAnswerKeyText>, ignoredSubjectIds = new Set<string>()) => {
    const mappings: OutcomeMap[] = [];
    let matched = 0; let ambiguous = 0; let missing = 0; let unverified = 0;
    for (const entry of result.entries) {
      if (ignoredSubjectIds.has(entry.subjectId)) continue;
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

  const rematchSavedOutcomes = () => {
    const mappings: OutcomeMap[] = [];
    let matched = 0; let ambiguous = 0; let missing = 0; let unverified = 0;
    for (const entry of keyEntries) {
      for (const [index, reference] of (entry.outcomeRefs || []).entries()) {
        if (!reference) continue;
        const questionNo = (subjects.find((subject) => subject.subjectId === entry.subjectId)?.questionStart || 1) + index;
        const match = matchOfficialOutcome(reference, entry.subjectId, options.outcomes as OutcomeCatalogEntry[]);
        if (match.outcomeId) { mappings.push({ subjectId: entry.subjectId, questionNo, outcomeId: match.outcomeId }); matched++; }
        else if (match.reason === 'AMBIGUOUS') ambiguous++;
        else if (match.reason === 'UNVERIFIED') unverified++;
        else missing++;
      }
    }
    if (!matched && !ambiguous && !missing && !unverified) { setError('Bu sınavın kayıtlı cevap anahtarında eşleştirilecek kazanım kodu veya açıklaması bulunmuyor.'); return; }
    setOutcomeMappings(mappings);
    setOutcomeRequired(true);
    setNotice(`${matched} kazanım doğrulanmış MEB/ÖSYM kataloğuyla eşleşti; ${ambiguous + missing + unverified} kayıt manuel kontrol bekliyor.`);
  };

  const applyAnalysis = (result: ReturnType<typeof parseAnswerKeyText>) => {
    setAnalysis(result);
    if (!result.entries.length) { setError('Cevap anahtarında işlenebilir soru satırı bulunamadı. Referans şablonda CEVAP ANAHTARI bölümünü ve test adlarını kontrol edin.'); return; }
    setError('');
    setBooklets(result.detectedBooklets.join(','));
    setKeyEntries(result.entries);
    const detectedTitle = result.metadata?.title || '';
    const detectedTitleNorm = detectedTitle.toLocaleUpperCase('tr-TR');
    if (detectedTitleNorm.includes('TYT')) setChoiceKey('TYT');
    else if (detectedTitleNorm.includes('AYT')) setChoiceKey('AYT');
    else if (detectedTitleNorm.includes('YDT')) setChoiceKey('YDT');
    else if (detectedTitleNorm.includes('LGS')) setChoiceKey('LGS');
    setCreateForm((current) => ({ ...current, title: current.title || result.metadata?.title || '', publisherName: current.publisherName || result.metadata?.publisherName || '', gradeLevel: (!current.gradeLevel || current.gradeLevel === String(selectedChoice.gradeLevel || 7)) ? String(result.metadata?.gradeLevel || current.gradeLevel || selectedChoice.gradeLevel || '') : current.gradeLevel, description: current.description || (result.detectedFormat === 'WIDE_BOOKLET_TABLE' ? 'Kazanımlı cevap anahtarından otomatik oluşturuldu; yayın öncesi kontrol edilmelidir.' : '') }));
    const hasPublisherOutcomes = result.entries.some((entry) => (entry.outcomeRefs || []).some((reference) => Boolean(reference?.publisherTitle || reference?.publisherCode || reference?.officialCode || reference?.code || reference?.title)));
    if (hasPublisherOutcomes) { setOutcomeRequired(true); setDefinitionMode('OUTCOME'); }
    const mappingSummary = autoMatchOutcomes(result);
    const cfg = Object.entries(result.questionCounts).map(([subjectId, questionCount], index) => { const questionStart = result.questionStarts[subjectId] || 1; const optionCount = result.entries.find((entry) => entry.subjectId === subjectId)?.optionCount || 5; return { subjectId, questionCount, questionStart, questionEnd: questionStart + questionCount - 1, optionCount, questionStatus: 'ACTIVE' as const, wrongDivisor: selectedChoice.defaultWrongDivisor, sortOrder: index + 1 }; });
    setSubjects(cfg);
    const outcomeNotice = result.entries.some((entry) => (entry.outcomeRefs || []).some(Boolean)) ? ` ${mappingSummary.matched} kazanım otomatik eşleşti; ${mappingSummary.ambiguous + mappingSummary.missing + mappingSummary.unverified} kayıt manuel kontrol bekliyor.` : '';
    const warningNotice = result.warnings?.length ? ` Uyarı: ${result.warnings.join(' ')}` : '';
    setNotice(`Cevap anahtarı analiz edildi: ${cfg.length} ders, ${cfg.reduce((n, x) => n + x.questionCount, 0)} soru, ${result.detectedBooklets.length} kitapçık.${outcomeNotice}${warningNotice}`);
  };

  const analyseKey = (text = answerKeyText) => applyAnalysis(parseAnswerKeyText(text, options.subjects as SubjectOption[]));

  const readAnswerFile = async (file?: File) => {
    if (!file) return;
    setAnswerKeyFile(file);
    let text = '';
    if (file.name.toLowerCase().endsWith('.xlsx')) {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = firstSheet ? XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as unknown[][] : [];
      text = firstSheet ? XLSX.utils.sheet_to_csv(firstSheet) : '';
      setAnswerKeyText(text);
      applyAnalysis(parseAnswerKeyWorkbookRows(rows, options.subjects as SubjectOption[]));
      return;
    } else text = await file.text();
    setAnswerKeyText(text);
    analyseKey(text);
  };

  const downloadOutcomeTemplate = () => {
    const columnCount = 36;
    const bookletCodes = [...new Set(booklets.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean))];
    const templateBooklets = bookletCodes.length ? bookletCodes : ['A'];
    const rows: any[][] = Array.from({ length: 36 + selectedTemplate.sections.reduce((sum, item) => sum + item.questionCount, 0) }, () => Array(columnCount).fill(''));
    const put = (row: number, column: number, value: string | number) => { rows[row][column] = value; };
    put(0, 0, 'ANUNEX · SINAV YÜKLEME ŞABLONU');
    put(1, 0, 'SINAV ADI'); put(1, 5, createForm.title || 'TYT 1. DENEME');
    put(2, 0, 'SINAV DETAY BİLGİLERİ');
    put(3, 0, 'Sınıf'); put(3, 5, createForm.gradeLevel || selectedChoice.gradeLevel || ''); put(3, 8, 'Yayınevi'); put(3, 13, createForm.publisherName || '');
    put(4, 0, 'Sınav türü'); put(4, 5, selectedChoice.examType); put(4, 8, 'Oturum / bölüm'); put(4, 13, createForm.sessionLabel || '');
    put(5, 0, 'Seçenek sayısı'); put(5, 5, selectedTemplate.sections[0]?.optionCount || 5); put(5, 8, 'Kitapçıklar'); put(5, 13, templateBooklets.join(','));
    put(7, 0, 'TEST İSİMLERİ VE SORU ARALIKLARI');
    put(8, 0, 'Test No'); put(8, 2, 'Test Adı'); put(8, 4, 'Ders Kodu'); put(8, 6, 'İlk Soru No'); put(8, 8, 'Son Soru No'); put(8, 10, 'Kitapçıklar');
    selectedTemplate.sections.forEach((item, index) => { const row = 9 + index; const subjectLabel = options.subjects?.find((subject: any) => subject.code === item.subjectCode)?.name || item.label; put(row, 0, index + 1); put(row, 2, subjectLabel); put(row, 4, item.subjectCode); put(row, 6, item.questionStart); put(row, 8, item.questionEnd); put(row, 10, templateBooklets.join(',')); });
    put(25, 0, 'DERSLER VE TESTLERE GÖRE SORU DAĞILIMI');
    put(26, 0, 'Ders Kodu'); put(26, 2, 'Test No'); put(26, 4, 'İlk Soru No'); put(26, 6, 'Son Soru No'); put(26, 8, 'Alternatif Sıra'); put(26, 10, 'Kazanım Ders Kodu');
    selectedTemplate.sections.forEach((item, index) => { const row = 27 + index; put(row, 0, item.subjectCode); put(row, 2, index + 1); put(row, 4, item.questionStart); put(row, 6, item.questionEnd); put(row, 10, item.subjectCode); });
    const answerHeaderRow = 34;
    put(answerHeaderRow - 1, 0, 'CEVAP ANAHTARI');
    put(answerHeaderRow, 0, 'Test No'); put(answerHeaderRow, 2, 'Açıklama / Test Adı'); put(answerHeaderRow, 4, 'A Soru No'); put(answerHeaderRow, 6, 'B Soru No'); put(answerHeaderRow, 8, 'Doğru Cevap'); put(answerHeaderRow, 10, 'Yayınevi Kazanımı'); put(answerHeaderRow, 24, 'MEB Kazanım Kodu'); put(answerHeaderRow, 26, 'MEB Kazanım Adı'); put(answerHeaderRow, 28, 'Durum'); put(answerHeaderRow, 30, 'Şık Sayısı');
    let answerRow = answerHeaderRow + 1;
    selectedTemplate.sections.forEach((item, testIndex) => {
      for (let offset = 0; offset < item.questionCount; offset++) {
        const subjectLabel = options.subjects?.find((subject: any) => subject.code === item.subjectCode)?.name || item.label; put(answerRow, 0, testIndex + 1); put(answerRow, 2, subjectLabel); put(answerRow, 4, item.questionStart + offset); if (templateBooklets.includes('B')) put(answerRow, 6, item.questionStart + offset); put(answerRow, 8, ''); put(answerRow, 10, ''); put(answerRow, 24, ''); put(answerRow, 26, ''); put(answerRow, 28, 'ACTIVE'); put(answerRow, 30, item.optionCount); answerRow++;
      }
    });
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 35 } }, { s: { r: 2, c: 0 }, e: { r: 2, c: 35 } },
      { s: { r: 7, c: 0 }, e: { r: 7, c: 35 } }, { s: { r: 25, c: 0 }, e: { r: 25, c: 35 } }, { s: { r: 33, c: 0 }, e: { r: 33, c: 35 } },
    ];
    worksheet['!cols'] = Array.from({ length: columnCount }, (_, index) => ({ wch: [0, 1, 2, 3].includes(index) ? 16 : index === 10 ? 34 : index === 24 || index === 26 ? 26 : 12 }));
    const blue = '0067E8'; const pink = 'F3DDF0'; const white = 'FFFFFF';
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:AJ1');
    for (let row = range.s.r; row <= range.e.r; row++) for (let column = range.s.c; column <= range.e.c; column++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (!cell) continue;
      const sectionRow = [0, 2, 7, 25, 33].includes(row);
      const headerRow = [8, 26, 34].includes(row);
      cell.s = { fill: { fgColor: { rgb: sectionRow || headerRow ? blue : pink } }, font: { bold: sectionRow || headerRow, color: { rgb: sectionRow || headerRow ? white : '111827' } }, alignment: { vertical: 'center', wrapText: true }, border: { top: { style: 'thin', color: { rgb: 'FFFFFF' } }, bottom: { style: 'thin', color: { rgb: 'FFFFFF' } }, left: { style: 'thin', color: { rgb: 'FFFFFF' } }, right: { style: 'thin', color: { rgb: 'FFFFFF' } } } };
    }
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, 'Sınav Yükleme');
    XLSX.writeFile(workbook, `${selectedTemplate.key.toLowerCase()}-sinav-yukleme-sablonu.xlsx`);
  };

  const createExam = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const requiresOfficialOutcomes = definitionMode === 'OUTCOME' || Boolean(selectedTemplate.requiresOutcomes);
      if (!createForm.title.trim()) throw new Error('Sınav adı gereklidir.');
      if (!createForm.publisherName.trim()) throw new Error('Yayınevi adı gereklidir.');
      if (!createForm.sessionLabel.trim()) throw new Error('Oturum / bölüm bilgisi gereklidir.');
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
        if (answerKeyFile) { await uploadArchiveForExam(created.id, 'QUALIFIED_ANSWER_KEY', answerKeyFile, { documentKind: 'OUTCOME_TABLE', title: answerKeyFile.name, source: 'ANSWER_KEY_PARSER' }); }
      }
      const documentFailures: string[] = [];
      for (const pending of pendingDocuments) {
        try {
          await uploadArchiveForExam(created.id, archiveTypeForDocument(pending.kind), pending.file, { documentKind: pending.kind, title: pending.title, bookletCode: pending.bookletCode });
        } catch (e: any) { documentFailures.push(`${pending.title}: ${e.message || 'yüklenemedi'}`); }
      }
      for (const pending of pendingVideos) {
        try {
          await api(`/api/exam-content/${created.id}/videos`, { method: 'POST', body: JSON.stringify({ url: pending.url, title: pending.title, linkType: 'EXAM', publishMode: pending.publishMode, publishAt: pending.publishAt ? new Date(pending.publishAt).toISOString() : null, visibility: pending.visibility }) });
        } catch (e: any) { documentFailures.push(`${pending.title}: video bağlantısı kaydedilemedi`); }
      }
      setPendingDocuments([]);
      setPendingVideos([]);
      setOutcomeRequired(requiresOfficialOutcomes);
      setSelectedId(created.id);
      setCreatedExamId(created.id);
      setCreateForm((f) => ({ ...f, title: '' }));
      setNotice(documentFailures.length ? `Sınav oluşturuldu; bazı belgeler daha sonra tekrar yüklenmeli: ${documentFailures.join(' · ')}` : definitionMode === 'OUTCOME' ? 'Sınav oluşturuldu. Şimdi soru-kazanım eşleştirmelerini tamamlayın.' : 'Sınav cevap anahtarından oluşturuldu. Kontrol edip yayınlayabilirsiniz.');
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
    if (outcomeRequired && Number(detail?.readiness?.outcome_mapped_questions || 0) < Number(detail?.readiness?.active_expected_questions ?? detail?.readiness?.expected_questions ?? 0)) { setError('Kazanımlı sınavda her aktif soru bir kazanıma bağlanmadan yayınlama yapmayın.'); return; }
    if (!confirm('Sınav değerlendirmeye açılsın mı? Yayından sonra soru yapısı kilitlenecektir.')) return;
    setBusy(true); setError('');
    try { await api(`/api/exam-definitions/${selectedId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'ACTIVE' }) }); setNotice('Sınav yayınlandı.'); await loadDetail(selectedId); await loadRows(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const closeDetail = () => {
    setSelectedId('');
    setSearchParams({});
    setDetail(null);
    setDetailLoading(false);
    setContent({ assets: [], videos: [] });
    setError('');
  };

  const openExamDefinition = (id: string) => {
    setOpenExamMenu(null);
    setError('');
    setSearchParams({ examId: id });
    setSelectedId(id);
    window.setTimeout(() => document.getElementById('exam-definition-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const copyExamToDraft = () => {
    if (!detail) return;
    setCreateForm((current) => ({
      ...current,
      title: `${detail.exam.title} - Kopya`,
      publisherName: detail.exam.publisher_name || current.publisherName,
      sessionLabel: detail.exam.session_label || current.sessionLabel,
      description: detail.exam.description || '',
      resultNetworkEnabled: false,
      gradeLevel: String(detail.exam.grade_level || current.gradeLevel),
      scoringRuleVersionId: detail.exam.scoring_rule_version_id || current.scoringRuleVersionId,
    }));
    setBooklets((detail.booklets || []).map((booklet: any) => booklet.code).join(',') || 'A');
    setSubjects((detail.subjects || []).map((subject: any) => ({
      subjectId: subject.subject_id,
      questionCount: Number(subject.question_count),
      questionStart: Number(subject.question_start || 1),
      questionEnd: Number(subject.question_end || Number(subject.question_start || 1) + Number(subject.question_count) - 1),
      optionCount: Number(subject.option_count || 5) === 4 ? 4 : 5,
      questionStatus: subject.question_status || 'ACTIVE',
      wrongDivisor: Number(subject.wrong_divisor),
      sortOrder: Number(subject.sort_order),
    })));
    setCreateMethod(keyEntries.length ? 'ANSWER_KEY' : 'MANUAL');
    setPendingDocuments([]);
    setPendingVideos([]);
    setAnswerKeyText('');
    setAnswerKeyFile(null);
    setAnalysis(null);
    setContent({ assets: [], videos: [] });
    setSelectedId('');
    setSearchParams({});
    setDetail(null);
    setCreatedExamId('');
    setBuilderStep(1);
    setError('');
    setNotice('Sınav kopyası taslak olarak hazırlandı. Yeni kayıt öncesi bilgileri kontrol edin.');
  };

  const archiveExam = async () => {
    if (!selectedId || !detail || detail.exam.status === 'ARCHIVED') return;
    if (!confirm('Bu sınav arşivlensin mi? Arşivlenen sınav aktif listelerde kullanılmaz; kalıcı olarak silinmez.')) return;
    setBusy(true); setError('');
    try {
      await api(`/api/exam-definitions/${selectedId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'ARCHIVED' }) });
      setNotice('Sınav arşivlendi.');
      closeDetail();
      await loadRows();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const archiveExamById = async (id: string) => {
    if (!confirm('Bu sınav arşivlensin mi? Aktif listelerde kullanılmaz; kayıtları korunur.')) return;
    setBusy(true); setError(''); setOpenExamMenu(null);
    try { await api(`/api/exam-definitions/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'ARCHIVED' }) }); setNotice('Sınav arşivlendi.'); await loadRows(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const copyExamById = async (id: string) => {
    setBusy(true); setError(''); setOpenExamMenu(null);
    try { const result = await api<any>(`/api/exam-definitions/${id}/copy`, { method: 'POST' }); await loadRows(); setSelectedId(result.id); setNotice('Sınav kopyası oluşturuldu ve taslak olarak açıldı.'); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const deleteExamById = async (id: string) => {
    if (!confirm('Bu taslak sınav ve bağlı tanımları silinsin mi? Bu işlem geri alınamaz.')) return;
    setBusy(true); setError(''); setOpenExamMenu(null);
    try { await api(`/api/exam-definitions/${id}`, { method: 'DELETE' }); if (selectedId === id) closeDetail(); setNotice('Sınav silindi.'); await loadRows(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const archiveTypeForDocument = (kind: ExamDocumentKind) => kind === 'ANSWER_KEY_PDF' ? 'SOURCE_ANSWER_KEY' : kind === 'OUTCOME_TABLE' ? 'QUALIFIED_ANSWER_KEY' : kind === 'EXAM_PDF' ? 'EXAM_PDF' : kind === 'PUBLISHER_LOGO' ? 'PUBLISHER_LOGO' : 'OTHER';

  const uploadArchiveForExam = async (examId: string, assetType: string, file: File, metadata: { documentKind?: string; title?: string; bookletCode?: string; source?: string } = {}) => {
    const form = new FormData();
    form.append('assetType', assetType);
    form.append('documentKind', metadata.documentKind || assetType);
    form.append('title', metadata.title || file.name);
    form.append('bookletCode', metadata.bookletCode || 'A');
    form.append('source', metadata.source || 'EXAM_CREATION');
    form.append('file', file);
    await api(`/api/exam-content/${examId}/assets`, { method: 'POST', body: form });
  };

  const uploadArchive = async (assetType: string, file?: File, metadata: { documentKind?: string; title?: string; bookletCode?: string } = {}) => {
    if (!selectedId || !file) return;
    setContentBusy(true); setError('');
    try { await uploadArchiveForExam(selectedId, assetType, file, metadata); setNotice('Belge sınav arşivine eklendi.'); await loadContent(selectedId); }
    catch (e: any) { setError(e.message); } finally { setContentBusy(false); }
  };

  const addDocumentToQueue = () => {
    const option = EXAM_DOCUMENT_OPTIONS.find((item) => item.value === documentDraft.kind);
    if (documentDraft.kind === 'VIDEO_SOLUTION') {
      if (!documentDraft.title.trim() || !documentDraft.url.trim()) { setError('Video başlığı ve HTTPS bağlantısı gereklidir.'); return; }
      setPendingVideos((items) => [...items, { id: `video-${Date.now()}-${Math.random()}`, title: documentDraft.title.trim(), url: documentDraft.url.trim(), publishMode: documentDraft.publishMode, publishAt: documentDraft.publishAt, visibility: 'STUDENT_TEACHER' }]);
    } else {
      const file = documentDraft.file;
      if (!file) { setError(`${option?.label || 'Belge'} için dosya seçilmelidir.`); return; }
      setPendingDocuments((items) => [...items, { id: `doc-${Date.now()}-${Math.random()}`, kind: documentDraft.kind, title: documentDraft.title.trim() || file.name, file, bookletCode: documentDraft.bookletCode.trim().toUpperCase() || 'A' }]);
    }
    setError('');
    setNotice('Belge sınav oluşturulduktan sonra arşive eklenecek şekilde hazırlandı.');
    setDocumentDraft({ kind: 'ANSWER_KEY_PDF', title: '', file: null, bookletCode: 'A', url: '', publishMode: 'DRAFT', publishAt: '' });
    setDocumentDialogOpen(false);
  };
  const generatePlainPdf = async () => {
    if (!selectedId) return; setContentBusy(true); setError('');
    try { const response = await fetch(`/api/exam-content/${selectedId}/plain-answer-key.pdf?booklet=${encodeURIComponent((booklets.split(',')[0] || 'A').trim())}`, { method: 'POST', credentials: 'include' }); if (!response.ok) { const payload = await response.json().catch(() => null); throw new Error(payload?.error?.message || 'PDF üretilemedi.'); } const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${safeDownloadName(detail?.exam?.title || 'sinav')}-cevap-anahtari.pdf`; anchor.click(); URL.revokeObjectURL(url); setNotice('Kazanımsız, markalı cevap anahtarı oluşturuldu ve arşive eklendi.'); await loadContent(selectedId); }
    catch (e: any) { setError(e.message); } finally { setContentBusy(false); }
  };
  const addVideo = async () => {
    if (!selectedId) return; setContentBusy(true); setError('');
    try { await api(`/api/exam-content/${selectedId}/videos`, { method: 'POST', body: JSON.stringify({ ...videoForm, publishAt: videoForm.publishAt ? new Date(videoForm.publishAt).toISOString() : null }) }); setVideoForm({ url: '', title: '', linkType: 'EXAM', publishMode: 'DRAFT', publishAt: '', visibility: 'STUDENT_TEACHER' }); setNotice('Video bağlantısı kaydedildi.'); await loadContent(selectedId); }
    catch (e: any) { setError(e.message); } finally { setContentBusy(false); }
  };
  const publishVideo = async (id: string) => { if (!selectedId) return; setContentBusy(true); try { await api(`/api/exam-content/${selectedId}/videos/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'PUBLISHED' }) }); setNotice('Video yayınlandı.'); await loadContent(selectedId); } catch (e: any) { setError(e.message); } finally { setContentBusy(false); } };
  const saveOpticalBinding = async () => { if (!selectedId || !opticalVersionId || !opticalBooklets.length) return; setContentBusy(true); setError(''); try { await api(`/api/exam-content/${selectedId}/optical`, { method: 'PUT', body: JSON.stringify({ opticalTemplateVersionId: opticalVersionId, bookletCodes: opticalBooklets, inputModes: opticalModes }) }); setNotice('Optik şablonu sınava bağlandı. Değerlendirme ve baskı ekranları bu tanımı kullanacak.'); await loadContent(selectedId); } catch (e: any) { setError(e.message); } finally { setContentBusy(false); } };

  const totalConfiguredQuestions = subjects.reduce((total, subject) => total + Number(subject.questionCount || 0), 0);
  const totalAnswerSlots = keyEntries.reduce((total, entry) => total + cleanAnswers(entry.answers).length, 0);
  const selectedScoring = options.scoringVersions?.find((x: any) => x.id === createForm.scoringRuleVersionId);
  const isCustomScoring = selectedScoring?.rule_code === 'CUSTOM_EXAM';

  const stepReady = (step: BuilderStep) => {
    if (step === 1) return Boolean(createForm.title.trim() && createForm.publisherName.trim() && createForm.sessionLabel.trim());
    if (step === 2) return createMethod === 'ANSWER_KEY' ? Boolean(keyEntries.length && subjects.length) : Boolean(subjects.length);
    if (step === 3) return true;
    return Boolean(createForm.scoringRuleVersionId);
  };
  const goToBuilderStep = (step: BuilderStep) => {
    if (step <= builderStep || step === 1) { setBuilderStep(step); return; }
    if (step === 2 && !stepReady(1)) { setError('Önce sınav kartındaki zorunlu alanları tamamlayın.'); return; }
    if (step === 3 && !stepReady(2)) { setError('Önce cevap anahtarını veya ders yapısını tamamlayın.'); return; }
    if (step === 4 && !stepReady(2)) { setError('Kontrole geçmeden önce cevap anahtarını veya ders yapısını tamamlayın.'); return; }
    setError(''); setBuilderStep(step);
  };
  const nextBuilderStep = () => {
    if (!stepReady(builderStep)) {
      setError(builderStep === 1 ? 'Sınav adı ve yayınevi adı gereklidir.' : builderStep === 2 ? 'Cevap anahtarını analiz edin veya dersleri manuel oluşturun.' : 'Puanlama profili seçilmelidir.');
      return;
    }
    setError(''); setBuilderStep((current) => current === 4 ? 4 : (current + 1) as BuilderStep);
  };

  return <div className={`exam-definition-page ${selectedId ? 'detail-mode' : ''}`}>
    <div className="exam-simple-shell">
      <div className="exam-simple-head">
        <div><span className="eyebrow">SINAV MERKEZİ</span><h1>Sınavlar</h1><p>Sınav kartını oluşturun veya mevcut sınava sonuç yükleyin.</p></div>
        <div className="exam-simple-actions"><Link className="secondary" to="/exam-center?mode=upload"><UploadCloud size={16}/> Sınav Yükle</Link><a className="primary" href="#exam-card" onClick={() => { closeDetail(); setCreatedExamId(''); setBuilderStep(1); }}><FileText size={16}/> Sınav Ekle</a></div>
      </div>
      {error && <div className="alert error">{error}</div>}{notice && <div className="alert success">{notice}</div>}
      <div className="exam-quick-bar"><span className="quick-status">app.anunex.com ana kayıt</span><span>Optik / FMT sınav kaydından sonra bağlanır.</span>{createForm.resultNetworkEnabled && <span className="quick-status network">sonuc.anunex.com yayını açık</span>}</div><div className="exam-flow-bar" aria-label="Sınav oluşturma adımları">{([[1,'Sınav kartı','Temel bilgileri gir'],[2,'Cevap anahtarı','Şablon veya manuel giriş'],[3,'Belgeler','Arşiv ve video'],[4,'Kontrol ve kayıt','Puanlama ve yayın']] as const).map(([step,label,help], index) => <Fragment key={`builder-step-${step}`}><button type="button" className={`${builderStep === step ? 'active' : ''} ${builderStep > step ? 'complete' : ''}`} onClick={() => goToBuilderStep(step as BuilderStep)}><b>{builderStep > step ? '✓' : `0${step}`}</b><span><strong>{label}</strong><small>{help}</small></span></button>{index < 3 && <i aria-hidden="true" />}</Fragment>)}</div>

      {builderStep === 1 && <section id="exam-card" className="exam-simple-card builder-current-step">
        <div className="exam-simple-card-head"><span className="simple-number">01</span><div><h2>Sınav bilgileri</h2><p>Yeni sınav için temel kart bilgilerini girin.</p></div></div>
        <div className="form-grid builder-form-grid exam-card-grid">
          <label>Yayınevi adı *<input value={createForm.publisherName} onChange={(e) => setCreateForm((f) => ({ ...f, publisherName: e.target.value }))} placeholder="Örn. ANUNEX Yayınları" /></label>
          <label>Sınav adı *<input value={createForm.title} onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))} placeholder="Örn. TYT Türkiye Geneli Deneme 1" /></label>
          <label>Sınav türü *<select value={choiceKey} onChange={(e) => setChoiceKey(e.target.value)}>{EXAM_CHOICES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
          <label>Eğitim yılı *<input value={createForm.academicYear} onChange={(e) => setCreateForm((f) => ({ ...f, academicYear: e.target.value }))} /></label>
          <label>Sınıf düzeyi *<select value={createForm.gradeLevel} onChange={(e) => setCreateForm((f) => ({ ...f, gradeLevel: e.target.value }))}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}. sınıf</option>)}</select></label>
          <label>Oturum / bölüm *<input value={createForm.sessionLabel} onChange={(e) => setCreateForm((f) => ({ ...f, sessionLabel: e.target.value }))} placeholder="Örn. 1. Oturum" /></label>
        </div>
        <label className="builder-textarea-label"><span>Açıklama / not</span><textarea rows={2} value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))} placeholder="İsteğe bağlı açıklama" /></label>
        <label className="simple-publication"><input type="checkbox" checked={createForm.resultNetworkEnabled} onChange={(e) => setCreateForm((f) => ({ ...f, resultNetworkEnabled: e.target.checked }))} /><span><strong>Bu sınav sonuc.anunex.com'da yayınlansın</strong><small>app.anunex.com ana kaydı korunur; sonuç ağı seçilirse aynı sınav kaydı kullanılır.</small></span></label>
        <div className="builder-mode-row"><div><strong>Cevap anahtarı modu</strong><span>Kazanım bağlantısı gerekiyorsa kazanımlı modu seçin.</span></div><div className="segmented-control"><button type="button" className={definitionMode === 'STANDARD' ? 'active' : ''} onClick={() => { setDefinitionMode('STANDARD'); setOutcomeRequired(false); }}>Standart</button><button type="button" className={definitionMode === 'OUTCOME' ? 'active' : ''} onClick={() => { setDefinitionMode('OUTCOME'); setOutcomeRequired(true); }}><Sparkles size={15}/> Kazanımlı</button></div></div>
      </section>}

      {builderStep === 2 && <section id="exam-answer-key" className="exam-simple-card builder-current-step">
        <div className="exam-simple-card-head"><span className="simple-number">02</span><div><h2>Cevap anahtarı</h2><p>Hazır şablon ve CSV/XLSX dosyasıyla hızlıca eşleştirin.</p></div></div>
        <div className="simple-method-row"><button type="button" className={createMethod === 'ANSWER_KEY' ? 'active' : ''} onClick={() => setCreateMethod('ANSWER_KEY')}><FileUp size={16}/> Hazır şablon / dosya</button><button type="button" className={createMethod === 'MANUAL' ? 'active' : ''} onClick={() => setCreateMethod('MANUAL')}><BookOpenCheck size={16}/> Kendin oluştur</button></div>
        {createMethod === 'ANSWER_KEY' ? <>
          <div className="simple-file-row"><label><span>Hazır sınav şablonu</span><select value={templateKey} onChange={(e) => { const key = e.target.value; const chosen = EXAM_TEMPLATES.find((template) => template.key === key); setTemplateKey(key); setOutcomeRequired(Boolean(chosen?.requiresOutcomes)); setDefinitionMode(chosen?.requiresOutcomes ? 'OUTCOME' : 'STANDARD'); const baseKey = key.endsWith('_OUTCOME') ? key.slice(0, -8) : key; const nextChoice = baseKey === 'SCHOOL_5' || baseKey === 'SCHOOL_6' || baseKey === 'SCHOOL_7' ? `STD_${baseKey.slice(-1)}` : baseKey; if (EXAM_CHOICES.some((choice) => choice.key === nextChoice)) setChoiceKey(nextChoice); }}>{EXAM_TEMPLATES.map((template) => <option key={template.key} value={template.key}>{template.label}</option>)}</select></label><div className="simple-template-note"><strong>{selectedTemplate.label}</strong><span>{selectedTemplate.description}</span><div><button type="button" className="ghost" onClick={downloadOutcomeTemplate}>Kazanımlı şablonu indir</button><button type="button" className="secondary" onClick={() => applyTemplate()}>Şablonu uygula</button></div></div></div>
          <div className="simple-file-row"><label className="simple-upload"><span>Kazanımlı cevap anahtarı (.xlsx / .csv)</span><input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => void readAnswerFile(e.target.files?.[0])} /></label><label><span>Kitapçıklar</span><input value={booklets} onChange={(e) => setBooklets(e.target.value)} placeholder="A veya A,B" /></label></div>
          <details className="simple-details"><summary>Metin olarak cevap anahtarı gir</summary><textarea rows={5} value={answerKeyText} onChange={(e) => setAnswerKeyText(e.target.value)} placeholder={'MAT: ABCDEABCDE\nTUR: ABCDEABCDE\nFEN: ABCDEABCDE'} /><button type="button" className="secondary" onClick={() => analyseKey()}><FileUp size={15}/> Anahtarı analiz et</button></details>
          {analysis && <div className={analysis.unknownLines.length || analysis.warnings?.length ? 'builder-analysis warning' : 'builder-analysis success'}><strong>{Object.keys(analysis.questionCounts).length} ders bulundu.</strong> {analysis.detectedFormat === 'WIDE_BOOKLET_TABLE' ? 'Referans Excel düzeni algılandı: test/soru aralığı ve kitapçık sırası korundu.' : ''} Kitapçıklar: {analysis.detectedBooklets.join(', ')}. Yayınevi kazanımları ayrı tutulur; MEB kodu/kazanımı yalnız doğrulanmış katalogdan eşleştirilir. {analysis.unknownLines.length ? `${analysis.unknownLines.length} satır kontrol edilmeli.` : 'Soru sayıları otomatik çıkarıldı.'} {analysis.warnings?.join(' ')}</div>}
        </> : <div className="cards-list builder-subject-list">{visibleSubjects.map((s: any) => { const cfg = subjects.find((x) => x.subjectId === s.id); return <div className="list-card" key={s.id}><input type="checkbox" checked={selectedSubjectIds.has(s.id)} onChange={(e) => toggleSubject(s.id, e.target.checked)} /><div><strong>{s.name}</strong><span>{s.code}</span></div>{cfg && <><label className="compact-field">Başlangıç<input type="number" min="1" value={cfg.questionStart} onChange={(e) => patchSubject(s.id, { questionStart: Number(e.target.value), questionEnd: Number(e.target.value) + cfg.questionCount - 1 })} /></label><label className="compact-field">Bitiş<input type="number" min={cfg.questionStart} value={cfg.questionEnd} onChange={(e) => patchSubject(s.id, { questionEnd: Number(e.target.value), questionCount: Number(e.target.value) - cfg.questionStart + 1 })} /></label><label className="compact-field">Şık<select value={cfg.optionCount} onChange={(e) => patchSubject(s.id, { optionCount: Number(e.target.value) as 4 | 5 })}><option value="4">4</option><option value="5">5</option></select></label></>}</div>; })}</div>}
      </section>}

      {builderStep === 3 && <section id="exam-documents" className="exam-simple-card builder-current-step" style={{ borderColor: pendingDocuments.length || pendingVideos.length ? '#2563eb' : undefined }}>
        <div className="exam-simple-card-head"><span className="simple-number">03</span><div><h2>Belge ekle <small style={{ fontWeight: 500, color: '#64748b' }}>(isteğe bağlı)</small></h2><p>Deneme portalındaki arşiv mantığıyla belge türünü seçin; her tür kendi işleviyle kaydedilir.</p></div><button type="button" className="secondary" onClick={() => setDocumentDialogOpen(true)}><Archive size={16}/> Yeni belge yükle</button></div>
        {(pendingDocuments.length > 0 || pendingVideos.length > 0) && <div className="cards-list" style={{ marginTop: 14 }}>
          {pendingDocuments.map((document) => <div className="list-card" key={document.id}><FileText size={17}/><div style={{ flex: 1 }}><strong>{document.title}</strong><span>{EXAM_DOCUMENT_OPTIONS.find((item) => item.value === document.kind)?.label} · {document.file.name} · Kitapçık {document.bookletCode}</span></div><button type="button" className="ghost" onClick={() => setPendingDocuments((items) => items.filter((item) => item.id !== document.id))}>Kaldır</button></div>)}
          {pendingVideos.map((video) => <div className="list-card" key={video.id}><PlayCircle size={17}/><div style={{ flex: 1 }}><strong>{video.title}</strong><span>Video Çözüm · {video.publishMode === 'NOW' ? 'Şimdi yayınlanacak' : video.publishMode === 'SCHEDULED' ? `Planlandı: ${video.publishAt || 'tarih seçilmedi'}` : 'Taslak'}</span></div><button type="button" className="ghost" onClick={() => setPendingVideos((items) => items.filter((item) => item.id !== video.id))}>Kaldır</button></div>)}
        </div>}
        {documentDialogOpen && <div className="panel" style={{ marginTop: 14, background: 'var(--surface-muted, #f7f9ff)', border: '1px solid #dbeafe' }}>
          <div className="panel-head"><div><h3>Yeni belge yükle</h3><p>Belge sınav kaydedildiğinde merkezi arşive aktarılır.</p></div><button type="button" className="ghost" onClick={() => setDocumentDialogOpen(false)}>×</button></div>
          <div className="form-grid" style={{ alignItems: 'end' }}>
            <label>Belge türü<select value={documentDraft.kind} onChange={(e) => setDocumentDraft((draft) => ({ ...draft, kind: e.target.value as ExamDocumentKind, file: null }))}>{EXAM_DOCUMENT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><small>{EXAM_DOCUMENT_OPTIONS.find((item) => item.value === documentDraft.kind)?.help}</small></label>
            <label>Başlık<input value={documentDraft.title} onChange={(e) => setDocumentDraft((draft) => ({ ...draft, title: e.target.value }))} placeholder="Örn. TYT Deneme 1 Cevap Anahtarı" /></label>
            {documentDraft.kind === 'VIDEO_SOLUTION' ? <><label>Video bağlantısı<input value={documentDraft.url} onChange={(e) => setDocumentDraft((draft) => ({ ...draft, url: e.target.value }))} placeholder="https://..." /></label><label>Yayın zamanı<select value={documentDraft.publishMode} onChange={(e) => setDocumentDraft((draft) => ({ ...draft, publishMode: e.target.value as any }))}><option value="DRAFT">Taslak</option><option value="NOW">Şimdi yayınla</option><option value="SCHEDULED">Tarih planla</option></select></label>{documentDraft.publishMode === 'SCHEDULED' && <label>Yayın tarihi<input type="datetime-local" value={documentDraft.publishAt} onChange={(e) => setDocumentDraft((draft) => ({ ...draft, publishAt: e.target.value }))} /></label>}</> : <><label>Dosya<input type="file" accept={documentAccept(documentDraft.kind)} onChange={(e) => setDocumentDraft((draft) => ({ ...draft, file: e.target.files?.[0] || null }))} /></label><label>Kitapçık<select value={documentDraft.bookletCode} onChange={(e) => setDocumentDraft((draft) => ({ ...draft, bookletCode: e.target.value }))}>{['A', 'B', 'C', 'D'].map((code) => <option key={code} value={code}>{code}</option>)}</select></label></>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}><button type="button" className="secondary" onClick={() => setDocumentDialogOpen(false)}>Vazgeç</button><button type="button" className="primary" onClick={addDocumentToQueue}><Save size={16}/> Listeye ekle</button></div>
        </div>}
      </section>}

      {builderStep === 4 && <section id="exam-scoring" className="exam-simple-card builder-current-step">
        <div className="exam-simple-card-head"><span className="simple-number">04</span><div><h2>Sonuç ayarları</h2><p>Resmî puanlama profilini seçin; gelişmiş seçenekler isteğe bağlıdır.</p></div></div>
        <div className="simple-score-row"><label>Puanlama profili *<select value={createForm.scoringRuleVersionId} onChange={(e) => setCreateForm((f) => ({ ...f, scoringRuleVersionId: e.target.value }))}><option value="">Seçiniz</option>{options.scoringVersions?.map((s: any) => <option key={s.id} value={s.id}>{s.rule_name} · {s.academic_year} {s.version}{s.official ? ' · Kilitli resmî profil' : ''}</option>)}</select></label><div className="locked-profile-note"><LockKeyhole size={16}/><span>{selectedScoring?.official ? 'Resmî profil kilitli; oranlar değiştirilemez.' : 'Özel profil seçilirse gelişmiş alanlar açılır.'}</span></div></div>
        {isCustomScoring && <details className="simple-details" open><summary>Özel deneme puanlaması</summary><div className="form-grid"><label>Yanlışlar doğruyu götürsün mü?<select value={customScoring.wrongMode} onChange={(e) => setCustomScoring((x) => ({ ...x, wrongMode: e.target.value }))}><option value="NONE">Hayır</option><option value="2">2 yanlış = 1 doğru</option><option value="3">3 yanlış = 1 doğru</option><option value="4">4 yanlış = 1 doğru</option><option value="5">5 yanlış = 1 doğru</option><option value="CUSTOM">Özel oran</option></select></label>{customScoring.wrongMode === 'CUSTOM' && <label>Özel oran<input type="number" min="0.1" step="0.1" value={customScoring.wrongDivisor} onChange={(e) => setCustomScoring((x) => ({ ...x, wrongDivisor: Number(e.target.value) }))} /></label>}<label>Sınav kaç üzerinden?<select value={customScoring.scale} onChange={(e) => setCustomScoring((x) => ({ ...x, scale: Number(e.target.value) }))}><option value="100">100</option><option value="500">500</option><option value="1000">1000</option><option value="0">Özel değer</option></select></label>{customScoring.scale === 0 && <label>Özel değer<input type="number" min="1" value={customScoring.customScale} onChange={(e) => setCustomScoring((x) => ({ ...x, customScale: Number(e.target.value) }))} /></label>}</div></details>}
        <details className="simple-details"><summary>Sonuçlarda gösterilecekler ve sıralama</summary><div className="check-grid">{[['correct','Doğru'],['wrong','Yanlış'],['blank','Boş'],['net','Net'],['branchNet','Branş neti'],['successPercent','Başarı yüzdesi'],['rawScore','Ham puan'],['standardScore','Standart puan'],['branchScore','Branş puanı'],['totalScore','Toplam puan'],['ranking','Sıralama'],['percentile','Yüzdelik dilim']].map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean((resultSettings as any)[key])} onChange={(e) => setResultSettings((x) => ({ ...x, [key]: e.target.checked }))} />{label}</label>)}</div><div className="ranking-scope-row"><strong>Sıralama kapsamı</strong>{[['INSTITUTION','Kurum'],['DISTRICT','İlçe'],['CITY','İl'],['NATIONAL','Türkiye'],['NETWORK','Zincir']].map(([value, label]) => <label key={value}><input type="checkbox" checked={resultSettings.rankingScopes.includes(value)} onChange={(e) => setResultSettings((x) => ({ ...x, rankingScopes: e.target.checked ? [...new Set([...x.rankingScopes, value])] : x.rankingScopes.filter((scope) => scope !== value) }))} />{label}</label>)}</div>{(selectedScoring?.rule_code?.startsWith('OSYM_YKS_') || selectedChoice.examType === 'AYT' || selectedChoice.examType === 'YDT') && <label className="publish-toggle"><input type="checkbox" checked={resultSettings.includeObp} onChange={(e) => setResultSettings((x) => ({ ...x, includeObp: e.target.checked }))} /><span><strong>OBP katkısını kullan</strong><small>YKS sonuçlarında gerektiğinde ayrıca işlenir.</small></span></label>}</details>
        {createdExamId && <div className="builder-save-success"><CheckCircle2 size={18}/><div><strong>Sınav kartı oluşturuldu.</strong><span>Şimdi aşağıdaki kayıt ekranından kazanım, belge ve optik bağlantılarını tamamlayabilirsiniz.</span></div></div>}
        <div className="exam-review-strip"><div><span>Sınav kartı</span><strong>{createForm.title || 'Eksik'}</strong></div><div><span>Yapı</span><strong>{subjects.length ? `${subjects.length} test · ${totalConfiguredQuestions} soru` : 'Eksik'}</strong></div><div><span>Cevap anahtarı</span><strong>{keyEntries.length ? `${totalAnswerSlots} cevap · ${booklets}` : 'Manuel yapı'}</strong></div><div><span>Belge</span><strong>{pendingDocuments.length + pendingVideos.length ? `${pendingDocuments.length + pendingVideos.length} bekleyen` : 'İsteğe bağlı'}</strong></div></div>
      </section>}

      <div className="exam-simple-actions-footer"><button type="button" className="secondary" disabled={busy || builderStep === 1} onClick={() => setBuilderStep((current) => Math.max(1, current - 1) as BuilderStep)}>Geri</button><div className="builder-footer-status">Adım {builderStep}/4 <span>{stepReady(builderStep) ? 'Hazır' : 'Eksik alan var'}</span></div>{builderStep < 4 ? <button type="button" className="primary" disabled={busy} onClick={nextBuilderStep}>Devam et <ArrowRight size={16}/></button> : <><button type="button" className="secondary" disabled={busy} onClick={() => setNotice('Taslak bilgileri bu oturumda hazır. Sınavı kaydettiğinizde kalıcı olarak oluşturulur.')}><Save size={16}/> Taslak Kaydet</button><button type="button" className="primary" disabled={busy || !stepReady(4)} onClick={createExam}><Check size={17}/> Sınavı Kaydet</button></>}</div>
    </div>

    <div className="exam-definition-list-shell">
      <div className="exam-list-heading"><div><h2>Kayıtlı sınavlar</h2><p>Bir sınavı açtığınızda ayrı çalışma alanında düzenleme araçları görünür.</p></div></div>
      <div className="table-card" style={{ marginBottom: 20 }}><table><thead><tr><th>Sınav</th><th>Tür / Sınıf</th><th>Durum</th><th>Platform</th><th>Ders / Soru</th><th>Cevap</th><th>Kazanım</th><th>İşlem</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td><button type="button" className="link-button" onClick={() => openExamDefinition(r.id)}><strong>{r.title}</strong></button><small>{r.academic_year}{r.publisher_name ? ` · ${r.publisher_name}` : ''}{r.institution_name ? ` · ${r.institution_name}` : ''}</small></td><td>{r.exam_type} · {r.grade_level ? `${r.grade_level}. sınıf` : '-'}</td><td><span className={`status ${r.status === 'ACTIVE' ? 'ok' : 'neutral'}`}>{r.status}</span></td><td>{r.result_network_enabled ? <span className="status ok">Sonuç ağı</span> : <span className="status neutral">app</span>}</td><td>{r.subject_count} / {r.question_count}</td><td>{r.answer_count}</td><td>{r.outcome_mapped_count}</td><td><div style={{ position: 'relative', display: 'flex', gap: 6, justifyContent: 'flex-end' }}><button className="secondary subtle" onClick={() => openExamDefinition(r.id)}><Eye size={14} /> Görüntüle</button><button type="button" className="icon-button" aria-label={`${r.title} işlemleri`} aria-expanded={openExamMenu === r.id} onClick={() => setOpenExamMenu((current) => current === r.id ? null : r.id)}><MoreVertical size={17} /></button>{openExamMenu === r.id && <div className="exam-row-menu" role="menu"><button role="menuitem" onClick={() => openExamDefinition(r.id)}><Eye size={14} /> Görüntüle / Düzenle</button><button role="menuitem" onClick={() => void copyExamById(r.id)}><Copy size={14} /> Kopyala</button>{r.status !== 'ARCHIVED' && <button role="menuitem" onClick={() => void archiveExamById(r.id)}><Archive size={14} /> Arşivle</button>}{r.status === 'DRAFT' && <button role="menuitem" onClick={() => void deleteExamById(r.id)}><Trash2 size={14} /> Sil</button>}</div>}</div></td></tr>)}</tbody></table></div>
    </div>

    <div id="exam-definition-detail" className="exam-definition-detail-shell">
    {detailLoading && !detail && <div className="panel detail-loading"><RefreshCw size={18} className="spin" /><strong>Sınav ayrıntıları yükleniyor…</strong><span>Kayıt ve cevap anahtarı bilgileri getiriliyor.</span></div>}
    {!detailLoading && !detail && selectedId && <div className="panel detail-loading"><CircleAlert size={18} /><strong>Sınav ayrıntıları açılamadı.</strong><span>{error || 'Listeyi yenileyip tekrar deneyin.'}</span><button type="button" className="secondary" onClick={() => { setError(''); setDetailLoading(true); void loadDetail(selectedId).catch((e) => setError(e.message || 'Sınav ayrıntıları yüklenemedi.')).finally(() => setDetailLoading(false)); }}>Tekrar dene</button></div>}
    {detail && <>
      <div className="exam-detail-toolbar"><button className="ghost" onClick={closeDetail}><ArrowLeft size={16} /> Sınav listesine dön</button><div className="exam-detail-actions"><button className="secondary" disabled={busy} onClick={() => void copyExamById(selectedId)}><Copy size={16} /> Kopyala</button>{detail.exam.status !== 'ARCHIVED' && <button className="danger" disabled={busy} onClick={() => void archiveExam()}><Trash2 size={16} /> Arşivle</button>}{detail.exam.status === 'DRAFT' && <button className="danger" disabled={busy} onClick={() => void deleteExamById(selectedId)}><Trash2 size={16} /> Sil</button>}<div style={{ position: 'relative' }}><button type="button" className="icon-button" aria-label="Sınav işlemleri" aria-expanded={openExamMenu === `detail-${selectedId}`} onClick={() => setOpenExamMenu((current) => current === `detail-${selectedId}` ? null : `detail-${selectedId}`)}><MoreVertical size={18} /></button>{openExamMenu === `detail-${selectedId}` && <div className="exam-row-menu exam-detail-menu" role="menu"><button role="menuitem" onClick={() => setOpenExamMenu(null)}><Eye size={14} /> Görüntüle / Düzenle</button><button role="menuitem" onClick={() => void copyExamById(selectedId)}><Copy size={14} /> Kopyala</button>{detail.exam.status !== 'ARCHIVED' && <button role="menuitem" onClick={() => void archiveExam()}><Archive size={14} /> Arşivle</button>}{detail.exam.status === 'DRAFT' && <button role="menuitem" onClick={() => void deleteExamById(selectedId)}><Trash2 size={14} /> Sil</button>}</div>}</div></div></div>
      <div className="section-head"><div><h2>{detail.exam.title}</h2><p>{detail.exam.exam_type} · {detail.exam.grade_level}. sınıf · {detail.exam.status === 'DRAFT' ? 'Düzenlenebilir taslak' : detail.exam.status === 'ARCHIVED' ? 'Arşivlendi' : 'Yayında'}{detail.exam.outcome_mode === 'OFFICIAL_REQUIRED' ? ' · doğrulanmış kazanım zorunlu' : ''}{detail.exam.result_network_enabled ? ' · sonuc.anunex.com seçili' : ''}</p></div>{detail.exam.status === 'DRAFT' && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="secondary" disabled={busy} onClick={saveGeneral}><Save size={16} /> Kartı güncelle</button><button className="primary" disabled={busy || !detail.readiness?.ready_to_publish} onClick={publish}><Send size={17} /> Sınavı Yayınla</button></div>}</div>
      <div className="kpi-grid" style={{ marginBottom: 20 }}><div className="kpi-card"><span>Soru</span><strong>{detail.readiness?.actual_questions || 0}/{detail.readiness?.expected_questions || 0}</strong></div><div className="kpi-card"><span>Cevap</span><strong>{detail.readiness?.actual_answers || 0}/{detail.readiness?.expected_answers || 0}</strong></div><div className="kpi-card"><span>Kazanımlı Soru</span><strong>{detail.readiness?.outcome_mapped_questions || 0}</strong></div><div className="kpi-card"><span>Hazır mı?</span><strong>{detail.readiness?.ready_to_publish ? 'Evet' : 'Eksik var'}</strong></div></div>
      {detail.exam.status === 'DRAFT' && <>
        <div className="panel" style={{ marginBottom: 20 }}><div className="panel-head"><div><h2>Dersler ve soru aralıkları</h2><p>Başlangıç/bitiş numarası ve 4 veya 5 şık yapısı soru tanımının parçasıdır.</p></div></div><label>Kitapçıklar<input value={booklets} onChange={(e) => setBooklets(e.target.value)} /></label><div className="cards-list">{visibleSubjects.map((s: any) => { const cfg = subjects.find((x) => x.subjectId === s.id); return <div className="list-card" key={s.id}><input type="checkbox" checked={selectedSubjectIds.has(s.id)} onChange={(e) => toggleSubject(s.id, e.target.checked)} /><div style={{ flex: 1 }}><strong>{s.name}</strong><span>{s.code}</span></div>{cfg && <><label className="compact-field">Başlangıç<input type="number" value={cfg.questionStart} onChange={(e) => patchSubject(s.id, { questionStart: Number(e.target.value), questionEnd: Number(e.target.value) + cfg.questionCount - 1 })} /></label><label className="compact-field">Bitiş<input type="number" value={cfg.questionEnd} onChange={(e) => patchSubject(s.id, { questionEnd: Number(e.target.value), questionCount: Number(e.target.value) - cfg.questionStart + 1 })} /></label><label className="compact-field">Şık<select value={cfg.optionCount} onChange={(e) => patchSubject(s.id, { optionCount: Number(e.target.value) as 4 | 5 })}><option value="4">4</option><option value="5">5</option></select></label><label className="compact-field">Yanlış götürme<input type="number" step="0.5" value={cfg.wrongDivisor} onChange={(e) => patchSubject(s.id, { wrongDivisor: Number(e.target.value) })} /></label></>}</div>; })}</div><button className="secondary" onClick={saveStructure}><Save size={16} /> Yapıyı Kaydet</button></div>

        {!!detail.subjects?.length && !!detail.booklets?.length && <div className="panel" style={{ marginBottom: 20 }}><div className="panel-head"><div><h2>Cevap anahtarı</h2><p>Doğru cevap, alternatif kabul, soru durumu ve kazanım bağlantısı aynı tanımda tutulur.</p></div><CheckCircle2 /></div>{detail.subjects.map((s: any) => <div key={s.subject_id} style={{ padding: 14, marginBottom: 12, border: '1px solid var(--border,#e5e7eb)', borderRadius: 12 }}><strong>{s.name} · {s.question_count} soru · {s.option_count || 5} şık</strong>{detail.booklets.map((b: any) => { const entry = keyEntries.find((x) => x.subjectId === s.subject_id && x.bookletCode === b.code); return <div key={b.code}><label>{b.code} Kitapçığı<input value={entry?.answers || ''} onChange={(e) => setKey(s.subject_id, b.code, e.target.value)} placeholder={`${s.question_count} cevap`} /><small>{entry?.answers.length || 0}/{s.question_count}</small></label><div className="question-meta-grid">{Array.from({ length: Number(s.question_count) }, (_, index) => { const questionNo = Number(s.question_start || 1) + index; const status = entry?.questionStatuses?.[index] || 'ACTIVE'; const accepted = entry?.acceptedAnswers?.[index]; const acceptedText = Array.isArray(accepted) ? accepted.join('|') : accepted || entry?.answers?.[index] || ''; return <div key={questionNo}><strong>{questionNo}</strong><select aria-label={`${b.code} ${questionNo} durumu`} value={status} onChange={(e) => setQuestionMetadata(s.subject_id, b.code, index, { status: e.target.value as any })}><option value="ACTIVE">Aktif</option><option value="CANCELLED">İptal</option><option value="EXCLUDED">Değerlendirme dışı</option></select><input aria-label={`${b.code} ${questionNo} kabul`} value={acceptedText} onChange={(e) => setQuestionMetadata(s.subject_id, b.code, index, { accepted: e.target.value })} placeholder="A veya A|B" /></div>; })}</div></div>; })}</div>)}<label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={outcomeRequired} onChange={(e) => setOutcomeRequired(e.target.checked)} /> Bu sınav kazanımlı; bütün sorular kazanıma bağlanacak.</label>
        {outcomeRequired && <div style={{ marginTop: 14 }}><div className="panel-head"><div><h3>Kazanım eşleştirme</h3><p>Yayınevinin verdiği ifade korunur. Otomatik seçim yalnız doğrulanmış resmî MEB/ÖSYM kaydıyla yapılır; eşleşmeyen satır manuel inceleme bekler.</p></div><button type="button" className="secondary" disabled={busy} onClick={rematchSavedOutcomes}><Sparkles size={15} /> Kazanımları eşleştir</button></div>{detail.subjects.map((s: any) => <div key={s.subject_id} style={{ marginBottom: 18 }}><h3>{s.name} kazanımları</h3><div className="form-grid">{Array.from({ length: Number(s.question_count) }, (_, i) => Number(s.question_start || 1) + i).map((q) => { const source = keyEntries.find((entry) => entry.subjectId === s.subject_id && entry.bookletCode === (booklets.split(',')[0] || 'A'))?.outcomeRefs?.[q - Number(s.question_start || 1)] || null; return <label key={q}>Soru {q}{source?.publisherTitle && <small style={{ display: 'block', color: '#64748b', margin: '4px 0' }}>Yayınevi: {source.publisherTitle}{source.officialCode ? ` · MEB kodu: ${source.officialCode}` : ''}</small>}<select value={outcomeMappings.find((x) => x.subjectId === s.subject_id && x.questionNo === q)?.outcomeId || ''} onChange={(e) => setOutcome(s.subject_id, q, e.target.value)}><option value="">MEB kazanımı seç</option>{options.outcomes?.filter((o: any) => o.subject_id === s.subject_id && Number(o.official) === 1 && Number(o.verified) === 1).map((o: any) => <option key={o.id} value={o.id}>{o.code ? `${o.code} · ` : ''}{o.title}</option>)}</select></label>; })}</div></div>)}</div>}
          <button className="primary" onClick={saveAnswerKey}><Save size={16} /> Cevap Anahtarı ve Kazanımları Kaydet</button></div>}

        {detail.exam.owner_type === 'CENTRAL' && user?.role === 'SUPER_ADMIN' && <div className="panel" style={{ marginBottom: 20 }}><div className="panel-head"><div><h2>Hangi kurumlar kullanacak?</h2><p>Merkezi sınav yalnız seçtiğiniz kurumlarda görünür.</p></div></div><div className="cards-list">{options.institutions?.map((i: any) => <label className="list-card" key={i.id}><input type="checkbox" checked={assignedInstitutions.includes(i.id)} onChange={(e) => setAssignedInstitutions((x) => e.target.checked ? [...new Set([...x, i.id])] : x.filter((id) => id !== i.id))} /><div><strong>{i.name}</strong><span>{i.status}</span></div></label>)}</div><button className="secondary" onClick={saveInstitutions}><Save size={16} /> Kurumları Kaydet</button></div>}
      </>}
      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head"><div><h2><Archive size={19} style={{ verticalAlign: 'middle', marginRight: 7 }} /> Sınav İçerik Arşivi</h2><p>Bu sınava ait kazanımlı anahtar, markalı PDF, logo ve video içerikleri merkezi <code>exam_id</code> altında tutulur.</p></div><span className="status ok">Tek kayıt</span></div>
        <div className="form-grid" style={{ alignItems: 'end' }}>
          <label>Kazanımlı cevap anahtarı (PDF)<input type="file" accept=".pdf" disabled={contentBusy} onChange={(e) => void uploadArchive('QUALIFIED_ANSWER_KEY', e.target.files?.[0])} /></label>
          <label>Kaynak cevap anahtarı (CSV / XLSX)<input type="file" accept=".csv,.xlsx,.pdf" disabled={contentBusy} onChange={(e) => void uploadArchive('SOURCE_ANSWER_KEY', e.target.files?.[0])} /></label>
          <label>Yayınevi logosu<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" disabled={contentBusy} onChange={(e) => void uploadArchive('PUBLISHER_LOGO', e.target.files?.[0])} /></label>
          <button className="primary" disabled={contentBusy || !detail.answerKey?.length} onClick={() => void generatePlainPdf()}><FileText size={16} /> Kazanımsız PDF üret</button>
        </div>
        <div className="table-card" style={{ marginTop: 15 }}><table><thead><tr><th>Belge</th><th>Tür</th><th>Sürüm</th><th>Tarih</th><th></th></tr></thead><tbody>{(content.assets || []).map((asset: any) => <tr key={asset.id}><td><strong>{asset.file_name}</strong><br /><small>{Math.round(Number(asset.byte_size || 0) / 1024)} KB</small></td><td>{archiveDocumentLabel(asset)}</td><td>v{asset.version}</td><td>{asset.created_at}</td><td><a className="ghost" href={`/api/exam-content/${selectedId}/assets/${asset.id}`}>İndir</a></td></tr>)}{!content.assets?.length && <tr><td colSpan={5}>Henüz bu sınava bağlı arşiv belgesi yok.</td></tr>}</tbody></table></div>
        <div className="panel" style={{ margin: '15px 0 0', background: 'var(--surface-muted, #f7f9ff)' }}><div className="panel-head"><div><h3><Printer size={17} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Optik / FMT tanımı</h3><p>Optik sınav oluşturma adımından ayrıdır; burada sınava bağlanır ve baskı/okuma ekranlarına aktarılır.</p></div><span className={`status ${content.opticalBindings?.length ? 'ok' : 'neutral'}`}>{content.opticalBindings?.length ? 'Bağlı' : 'Henüz bağlı değil'}</span></div><div className="form-grid" style={{ alignItems: 'end' }}><label>Yayınlanmış optik şablon<select value={opticalVersionId} onChange={(e) => setOpticalVersionId(e.target.value)}><option value="">Optik seçin</option>{(content.opticals || []).map((optical: any) => <option key={optical.version_id} value={optical.version_id}>{optical.name}{optical.vendor ? ` · ${optical.vendor}` : ''} · {optical.version}</option>)}</select></label><div><span className="field-label">Kitapçıklar</span><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{(detail.booklets || []).map((booklet: any) => <label className="check" key={booklet.code}><input type="checkbox" checked={opticalBooklets.includes(booklet.code)} onChange={(e) => setOpticalBooklets((current) => e.target.checked ? [...new Set([...current, booklet.code])] : current.filter((code) => code !== booklet.code))} /> {booklet.code}</label>)}</div></div><div><span className="field-label">Okuma kanalları</span><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{['TXT', 'DAT', 'CAMERA'].map((mode) => <label className="check" key={mode}><input type="checkbox" checked={opticalModes.includes(mode)} onChange={(e) => setOpticalModes((current) => e.target.checked ? [...new Set([...current, mode])] : current.filter((x) => x !== mode))} /> {mode === 'CAMERA' ? 'Telefon kamerası' : mode}</label>)}</div></div><button className="primary" disabled={contentBusy || !opticalVersionId || !opticalBooklets.length} onClick={() => void saveOpticalBinding()}><Save size={16} /> Optiği sınava bağla</button></div>{content.opticalBindings?.length > 0 && <div className="table-card" style={{ marginTop: 12 }}><table><thead><tr><th>Kitapçık</th><th>Optik</th><th>Sürüm</th><th>Okuma</th></tr></thead><tbody>{content.opticalBindings.map((binding: any) => <tr key={binding.id}><td>{binding.booklet_code}</td><td>{binding.template_name}{binding.vendor ? ` · ${binding.vendor}` : ''}</td><td>{binding.template_version}</td><td>{binding.input_modes_json}</td></tr>)}</tbody></table></div>}</div>
        <div className="panel" style={{ margin: '15px 0 0', background: 'var(--surface-muted, #f7f9ff)' }}><div className="panel-head"><div><h3><PlayCircle size={17} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Video çözümü / konu bağlantısı</h3><p>Öğrenci yalnızca sınava katıldıysa, yayınlanmış içeriği kendi sonuç ekranında görür.</p></div></div><div className="form-grid" style={{ alignItems: 'end' }}><label>Video başlığı<input value={videoForm.title} onChange={(e) => setVideoForm((v) => ({ ...v, title: e.target.value }))} placeholder="Örn. TYT Matematik 12. soru çözümü" /></label><label>HTTPS video linki<input value={videoForm.url} onChange={(e) => setVideoForm((v) => ({ ...v, url: e.target.value }))} placeholder="https://..." /></label><label>İçerik türü<select value={videoForm.linkType} onChange={(e) => setVideoForm((v) => ({ ...v, linkType: e.target.value }))}><option value="EXAM">Deneme geneli</option><option value="SOLUTION">Soru çözümü</option><option value="TOPIC">Konu anlatımı</option></select></label><label>Yayın zamanı<select value={videoForm.publishMode} onChange={(e) => setVideoForm((v) => ({ ...v, publishMode: e.target.value }))}><option value="DRAFT">Taslak</option><option value="NOW">Şimdi yayınla</option><option value="SCHEDULED">Tarih planla</option></select></label>{videoForm.publishMode === 'SCHEDULED' && <label><Clock3 size={14} /> İstanbul saati<input type="datetime-local" value={videoForm.publishAt} onChange={(e) => setVideoForm((v) => ({ ...v, publishAt: e.target.value }))} /></label>}<button className="primary" disabled={contentBusy || !videoForm.title || !videoForm.url} onClick={() => void addVideo()}><Save size={16} /> Videoyu kaydet</button></div><div className="table-card" style={{ marginTop: 15 }}><table><thead><tr><th>Başlık</th><th>Tür</th><th>Durum</th><th>Yayın</th><th></th></tr></thead><tbody>{(content.videos || []).map((video: any) => <tr key={video.id}><td><strong>{video.title}</strong><br /><a href={video.url} target="_blank" rel="noreferrer">Bağlantıyı aç</a></td><td>{video.link_type}</td><td><span className={`status ${video.status === 'PUBLISHED' ? 'ok' : 'neutral'}`}>{video.status}</span></td><td>{video.publish_at || video.published_at || '—'}</td><td>{video.status !== 'PUBLISHED' && <button className="ghost" onClick={() => void publishVideo(video.id)}>Yayınla</button>}</td></tr>)}{!content.videos?.length && <tr><td colSpan={5}>Henüz bu sınava bağlı video yok.</td></tr>}</tbody></table></div></div>
      </section>
      {!detail.readiness?.ready_to_publish && <div className="alert warning"><CircleAlert size={16} /> Yayın için soru sayısı, bütün kitapçık cevapları ve doğrulanmış puanlama kuralı tamamlanmalıdır.{outcomeRequired ? ' Kazanımlı sınavda ayrıca her soru kazanıma bağlanmalıdır.' : ''}</div>}
    </>}
    </div>
  </div>;
}
