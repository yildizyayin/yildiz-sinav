const BASE = (process.env.SMOKE_BASE_URL || '').replace(/\/$/, '');
const PASSWORD = process.env.SMOKE_DEMO_PASSWORD || 'Demo123!';
const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

if (!BASE) throw new Error('SMOKE_BASE_URL is required');

function assert(value, message, details) {
  if (!value) throw new Error(`${message}${details === undefined ? '' : `\n${JSON.stringify(details, null, 2)}`}`);
}

async function request(path, { method = 'GET', cookie, json, form, expected = 200, raw = false } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }
  const response = await fetch(`${BASE}${path}`, { method, headers, body, redirect: 'manual' });
  const text = await response.text();
  if (raw) return { response, payload: text };
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  const expectedStatuses = Array.isArray(expected) ? expected : [expected];
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(`${method} ${path} expected ${expectedStatuses.join('/')} got ${response.status}\n${JSON.stringify(payload, null, 2)}`);
  }
  return { response, payload };
}

async function login(identifier) {
  const { response, payload } = await request('/api/auth/login', {
    method: 'POST',
    json: { identifier, password: PASSWORD, remember: false, turnstileToken: TOKEN },
  });
  assert(payload?.ok === true, `${identifier} login failed`, payload);
  const cookie = (response.headers.get('set-cookie') || '').match(/(yildiz_session=[^;]+)/)?.[1];
  assert(cookie, `${identifier} session cookie missing`);
  return cookie;
}

const admin = await login('super');
const teacher = await login('math');
const manager = await login('manager');
const student = await login('student1');
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

const optionSet = (count = 4) => Array.from({ length: count }, (_, index) => ({
  label: String.fromCharCode(65 + index),
  text: `Sentetik seçenek ${String.fromCharCode(65 + index)}`,
}));

async function createQuestion({ subjectId, outcomeId, index, academicYear = '2026-2027', gradeLevel = 7, difficultyLevel = (index % 6) + 1, contentMode = 'TEXT', withImage = false, optionCount = 4 }) {
  const payload = {
    stemText: `PR ${suffix} · soru ${index}`,
    academicYear,
    gradeLevel,
    subjectId,
    topic: 'Soru havuzu staging konusu',
    subtopic: 'Zengin içerik doğrulaması',
    questionType: 'MULTIPLE_CHOICE',
    difficultyLevel,
    contentMode,
    optionCount,
    options: optionSet(optionCount),
    correctAnswer: optionCount === 5 ? 'E' : 'B',
    solutionText: 'Bu soru yalnızca staging kabul testi için üretilmiştir.',
    sourceLabel: `QUESTION_POOL_PIPELINE_${suffix}`,
    copyrightStatus: 'OWNED',
    nodeIds: [outcomeId],
    priorGradeRefs: ['6'],
    lgsProbability: 0.25,
    yksProbability: 0.1,
    exam5yCount: index,
  };
  if (!withImage) {
    const result = await request('/api/platform/questions', { method: 'POST', cookie: admin, json: payload, expected: 201 });
    assert(result.payload?.id && result.payload?.reviewStatus === 'APPROVED', 'Text question was not approved in staging', result.payload);
    return { id: result.payload.id, correctAnswer: payload.correctAnswer, contentMode, assetCount: 0 };
  }
  const form = new FormData();
  form.set('payload', JSON.stringify({ ...payload, imageAlt: `PR ${suffix} sentetik soru görseli` }));
  form.set('file', new Blob([imageBytes], { type: 'image/png' }), `question-${suffix}.png`);
  const result = await request('/api/platform/questions', { method: 'POST', cookie: admin, form, expected: 201 });
  assert(result.payload?.id && result.payload?.reviewStatus === 'APPROVED' && Number(result.payload?.assetCount) >= 1, 'Image question was not approved with an R2 asset', result.payload);
  return { id: result.payload.id, correctAnswer: payload.correctAnswer, contentMode, assetCount: result.payload.assetCount };
}

const blockedTeacherUpload = await request('/api/platform/questions', {
  method: 'POST',
  cookie: teacher,
  json: { stemText: 'Yetkisiz staging yükleme denemesi', contentMode: 'TEXT', questionType: 'MULTIPLE_CHOICE', optionCount: 4, options: optionSet(), correctAnswer: 'A' },
  expected: 403,
});
assert(blockedTeacherUpload.payload?.error, 'Teacher question upload was not blocked', blockedTeacherUpload.payload);
console.log('✓ SUPER_ADMIN-only question upload gate');

const questions = [];
questions.push(await createQuestion({ subjectId: 'sub_fen', outcomeId: 'out_fen_1', index: 1, contentMode: 'MIXED', withImage: true }));
questions.push(await createQuestion({ subjectId: 'sub_fen', outcomeId: 'out_fen_1', index: 2, optionCount: 5 }));
for (const index of [3, 4, 5]) questions.push(await createQuestion({ subjectId: 'sub_fen', outcomeId: 'out_fen_1', index }));
const mathQuestion = await createQuestion({ subjectId: 'sub_mat', outcomeId: 'out_mat_1', index: 6 });
console.log(`✓ Rich question fixtures — ${questions.length + 1} questions · 4/5 choices · six difficulty levels`);

// PR preview databases survive reruns. The unfiltered first page is ordered by
// difficulty, so older easy questions can displace this level-2 media fixture.
// Exercise the existing student filters without changing visibility rules.
const practice = await request('/api/platform/student-practice?gradeLevel=7&subjectId=sub_fen&nodeId=ln_out_fen_1&difficultyLevel=2&limit=20', { cookie: student });
const visualQuestion = (practice.payload?.questions || []).find((question) => question.id === questions[0].id);
assert(visualQuestion, 'Student practice did not return the approved visual question', practice.payload);
assert(!Object.prototype.hasOwnProperty.call(visualQuestion, 'correct_answer'), 'Student practice leaked the correct answer', visualQuestion);
assert(visualQuestion.assets?.some((asset) => asset.url?.includes(`/api/platform/questions/${questions[0].id}/assets/`)), 'Student practice did not expose the question media route', visualQuestion);
const assetUrl = visualQuestion.assets.find((asset) => asset.url)?.url;
const media = await request(assetUrl, { cookie: student, expected: 200 });
assert(media.response.headers.get('content-type')?.startsWith('image/'), 'Question media did not come from R2 with an image content type', media.response.headers.get('content-type'));
console.log('✓ Student visual practice — media visible, answer hidden, R2 asset reachable');

assert(typeof visualQuestion.practiceToken === 'string' && visualQuestion.practiceToken.length > 20, 'Student practice verification token missing');
const submitted = await request('/api/platform/student-practice/attempts', {
  method: 'POST',
  cookie: student,
  json: { questionId: questions[0].id, answer: questions[0].correctAnswer, practiceToken: visualQuestion.practiceToken },
  expected: 200,
});
assert(submitted.payload?.correct === true && submitted.payload?.runId, 'Question practice did not create a scored assessment run', submitted.payload);
const feed = await request('/api/platform/assessment-feed', { cookie: student });
assert(feed.payload?.measurements?.some((measurement) => measurement.source_type === 'QUESTION_BANK' || measurement.sourceType === 'QUESTION_BANK'), 'Question practice was not included in the student assessment feed', feed.payload);
console.log('✓ Unified assessment feed — question practice response persisted');

const teacherQuestions = await request('/api/platform/questions?subjectId=sub_mat', { cookie: teacher });
assert(teacherQuestions.payload?.questions?.some((question) => question.id === mathQuestion.id), 'Math teacher could not see an assigned-subject question', teacherQuestions.payload);
const teacherCrossSubject = await request('/api/platform/questions?subjectId=sub_tur', { cookie: teacher });
assert(!(teacherCrossSubject.payload?.questions || []).some((question) => question.subject_id === 'sub_tur'), 'Branch teacher received a cross-subject question', teacherCrossSubject.payload);
console.log('✓ Branch teacher subject isolation');

const studio = await request('/api/platform/studio', {
  method: 'POST',
  cookie: manager,
  json: {
    title: `PR ${suffix} A/B soru havuzu kabul testi`,
    documentType: 'PRACTICE_EXAM',
    gradeLevel: 7,
    subjectId: 'sub_fen',
    questionCount: 5,
    questionIds: questions.map((question) => question.id),
    optionMode: 'MIXED',
    bookletCodes: ['A', 'B'],
    deliveryMode: 'PDF_OPTICAL',
    sourceTypes: ['QUESTION_BANK'],
  },
  expected: 201,
});
assert(Number(studio.payload?.selectedQuestions) >= 5 && studio.payload?.bookletCodes?.includes('A') && studio.payload?.bookletCodes?.includes('B'), 'A/B PDF-optical studio blueprint was not created', studio.payload);
console.log('✓ A/B + PDF_OPTICAL studio blueprint');

for (const booklet of ['A', 'B']) {
  const pdf = await request(`/api/platform/studio/${encodeURIComponent(studio.payload.id)}/pdf?booklet=${booklet}`, { cookie: manager, expected: 200, raw: true });
  assert(pdf.response.headers.get('content-type')?.includes('application/pdf'), `Booklet ${booklet} did not return a PDF`, pdf.response.headers);
  assert(String(pdf.payload).startsWith('%PDF-1.4'), `Booklet ${booklet} is not a valid generated PDF`, String(pdf.payload).slice(0, 20));
  assert(pdf.response.headers.get('x-anunex-optical-form') === 'included', `Booklet ${booklet} has no optical form marker`, pdf.response.headers);
}
const opticalTemplate = await request(`/api/platform/studio/${encodeURIComponent(studio.payload.id)}/optical-template?booklet=A`, { cookie: manager, expected: 200 });
assert(opticalTemplate.payload?.template?.optical?.cameraGeometry?.regions?.length, 'Generated PDF did not publish a camera-readable optical geometry', opticalTemplate.payload);
const opticalAnswers = Object.fromEntries(questions.slice(0, 5).map((question) => [question.id, question.correctAnswer]));
const opticalSubmit = await request(`/api/platform/studio/${encodeURIComponent(studio.payload.id)}/optical-submit`, { method: 'POST', cookie: manager, expected: 200, json: { studentId: 'stu_a001', booklet: 'A', answers: opticalAnswers } });
assert(opticalSubmit.payload?.runId && opticalSubmit.payload?.score === 1 && opticalSubmit.payload?.booklet === 'A', 'Camera-derived optical submission was not scored in the unified ledger', opticalSubmit.payload);
console.log('✓ Real PDF generation — A/B booklets + optical page');

const assignment = await request('/api/platform/assignments', {
  method: 'POST',
  cookie: manager,
  json: {
    title: `PR ${suffix} soru havuzu ödevi`,
    assignmentType: 'TEACHER',
    studentIds: ['stu_a001'],
    items: [{ itemType: 'QUESTION', referenceId: questions[0].id, payload: { source: 'QUESTION_POOL_PIPELINE' } }],
    publish: true,
  },
  expected: 201,
});
assert(assignment.payload?.id, 'Institution manager could not assign a question to a student', assignment.payload);
const assignments = await request('/api/platform/assignments', { cookie: student });
assert(assignments.payload?.assignments?.some((item) => item.id === assignment.payload.id), 'Student did not receive the question assignment', assignments.payload);
console.log('✓ Institution assignment → student measurement entry');

const foyAttempt = await request('/api/platform/foy/attempts', {
  method: 'POST', cookie: student,
  json: { assignmentId: assignment.payload.id, answers: { [questions[0].id]: questions[0].correctAnswer } },
  expected: 200,
});
assert(foyAttempt.payload?.runId && foyAttempt.payload?.score === 1, 'Föy attempt was not written to the unified ledger', foyAttempt.payload);
const external = await request('/api/platform/assessment-imports/external', {
  method: 'POST', cookie: manager,
  json: { studentId: 'stu_a001', externalKey: `external_${suffix}`, sourceLabel: 'Sentetik dış kaynak', title: 'Dış kaynak deneme', subjectId: 'sub_fen', score: 72, correctCount: 18, wrongCount: 4, blankCount: 3 },
  expected: 201,
});
assert(external.payload?.runId && external.payload?.score === 0.72, 'External assessment was not normalized into the unified ledger', external.payload);
const sourceFeed = await request('/api/platform/assessment-feed', { cookie: student });
const sourceSet = new Set((sourceFeed.payload?.measurements || []).map((item) => item.source_type || item.sourceType));
assert(sourceSet.has('FOY') && sourceSet.has('EXTERNAL'), 'Föy or external assessment was not visible in the unified feed', sourceFeed.payload);
console.log('✓ Unified assessment adapters — FOY + external results visible');

const plan = await request('/api/nibiru/coach/daily-plan', { method: 'POST', cookie: student, json: {}, expected: [200, 201] });
const outcomeItem = (plan.payload?.items || []).find((item) => item.payload?.kind === 'OUTCOME_PRACTICE');
assert(outcomeItem?.id, 'Nibiru did not create an outcome practice item from the seeded evidence', plan.payload);
// Practice reads and optical/Foy answers above expose the original fixtures.
// Create a separate, never-read pool only after those adapters have finished.
// The catalog verifies the outcome against the student's current enrollment;
// its academic year must also be explicit on each newly uploaded question.
const [catalog, outcomeEvidence, profile] = await Promise.all([
  request('/api/nibiru/coach/mini-test-catalog', { cookie: student }),
  request('/api/my-outcomes', { cookie: student }),
  request('/api/student-intelligence/profile', { cookie: student }),
]);
const miniOutcomeId = outcomeItem.payload.outcomeId || outcomeItem.reference_id;
assert(catalog.payload?.items?.some((item) => item.id === miniOutcomeId), 'Daily-plan outcome is not in the current verified curriculum catalog', { miniOutcomeId, catalog: catalog.payload });
const miniOutcome = outcomeEvidence.payload?.outcomes?.find((item) => item.id === miniOutcomeId);
const miniScope = profile.payload?.profile;
assert(miniOutcome?.subject_id && miniScope?.academicYear === catalog.payload.academicYear && Number.isInteger(miniScope?.gradeLevel), 'Mini-test fixture enrollment or outcome subject could not be resolved', { miniOutcome, miniScope });
const miniQuestions = [];
// Reruns can advance the measurement cycle to ten questions. All fresh items
// carry media so the visual assertion also holds at every supported test size.
for (let index = 7; index < 17; index++) {
  miniQuestions.push(await createQuestion({ subjectId: miniOutcome.subject_id, outcomeId: miniOutcomeId, index, academicYear: miniScope.academicYear, gradeLevel: miniScope.gradeLevel, difficultyLevel: 1, contentMode: 'MIXED', withImage: true, optionCount: index % 2 ? 4 : 5 }));
}
console.log(`✓ Fresh NEW mini-test pool — ${miniQuestions.length} approved visual questions · ${miniScope.academicYear} · grade ${miniScope.gradeLevel}`);
const started = await request(`/api/nibiru/coach/items/${encodeURIComponent(outcomeItem.id)}/mini-test`, { method: 'POST', cookie: student, json: { mode: 'NEW' }, expected: [200, 201] });
assert(started.payload?.testId && Number(started.payload?.questionCount) >= 5, 'Nibiru mini-test did not start with five questions', started.payload);
assert(started.payload?.questionMode === 'NEW', 'Nibiru mini-test did not retain NEW selection mode', started.payload);
const detail = await request(`/api/nibiru/coach/mini-tests/${encodeURIComponent(started.payload.testId)}`, { cookie: student });
assert(detail.payload?.questions?.length >= 5 && detail.payload.questions.every((question) => question.correct_answer == null && question.solution_text == null), 'Nibiru mini-test leaked answers/solutions or has too few questions', detail.payload);
assert(detail.payload.questions.some((question) => question.assets?.length), 'Nibiru mini-test did not hydrate question media', detail.payload.questions);
assert(detail.payload.questions.some((question) => miniQuestions.some((item) => item.id === question.question_id)), 'Mini-test did not select any fresh fixture questions', detail.payload.questions);
const answers = [];
for (const question of detail.payload.questions) {
  const known = questions.concat(mathQuestion, miniQuestions).find((item) => item.id === question.question_id);
  let answer = known?.correctAnswer;
  if (!answer) {
    // Existing unseen approved questions may share the outcome. Resolve their
    // actual answer through the admin view instead of guessing a default.
    const adminQuestion = await request(`/api/platform/questions?subjectId=${encodeURIComponent(miniOutcome.subject_id)}&q=${encodeURIComponent(question.stem_text)}`, { cookie: admin });
    answer = adminQuestion.payload?.questions?.find((item) => item.id === question.question_id)?.correct_answer;
  }
  assert(answer, 'Mini-test selected a question without a known admin answer', { questionId: question.question_id });
  answers.push({ questionId: question.question_id, answer });
}
const duplicateSubmissions = await Promise.all([0, 1].map(() => request(`/api/nibiru/coach/mini-tests/${encodeURIComponent(started.payload.testId)}/submit`, { method: 'POST', cookie: student, json: { answers } })));
assert(duplicateSubmissions.filter((item) => item.payload?.reused === false).length === 1 && duplicateSubmissions.filter((item) => item.payload?.reused === true).length === 1, 'Concurrent mini submissions did not produce exactly one durable winner', duplicateSubmissions.map((item) => item.payload));
assert(duplicateSubmissions.every((item) => item.payload?.result?.status === 'PASSED' && item.payload.result.correct === detail.payload.questions.length), 'Concurrent mini submissions did not return the same persisted result', duplicateSubmissions.map((item) => item.payload));
const miniTest = duplicateSubmissions[0];
console.log('✓ Concurrent mini-test submission — one winner, stable reused result');
assert(miniTest.payload?.result?.status === 'PASSED', 'Nibiru mini-test did not persist a passing measurement', miniTest.payload);
const practiceDiscovery = await request(`/api/reporting/students/stu_a001/practice-runs?academicYear=${encodeURIComponent(miniScope.academicYear)}&limit=50`, { cookie: student });
assert(practiceDiscovery.payload?.runs?.some((run) => run.id === submitted.payload.runId), 'Practice discovery did not return the authorized scored solution', practiceDiscovery.payload);
const miniDiscovery = await request(`/api/reporting/students/stu_a001/mini-test-runs?academicYear=${encodeURIComponent(miniScope.academicYear)}&limit=50`, { cookie: student });
assert(miniDiscovery.payload?.runs?.some((run) => run.id === started.payload.testId && !Number.isNaN(Date.parse(run.completedAt))), 'Mini-test discovery did not return the authorized completed NEW test', miniDiscovery.payload);
assert(miniDiscovery.payload.runs.every((run) => Object.keys(run).every((key) => ['id', 'completedAt'].includes(key))), 'Mini-test discovery leaked question or context details', miniDiscovery.payload);
const miniReport = await request(`/api/reporting/students/stu_a001/frozen-mini-tests?academicYear=${encodeURIComponent(miniScope.academicYear)}&testIds=${encodeURIComponent(started.payload.testId)}`, { cookie: student });
const miniGroup = miniReport.payload?.groups?.find((group) => group.subjectId === miniOutcome.subject_id);
assert(miniGroup?.evidenceCount === detail.payload.questions.length && miniGroup.accuracyPercent === 100 && miniReport.payload?.officialScore == null, 'Frozen mini-test report did not use native submitted evidence', miniReport.payload);
const combinedMini = await request(`/api/reporting/students/stu_a001/frozen-combined?academicYear=${encodeURIComponent(miniScope.academicYear)}&miniTestIds=${encodeURIComponent(started.payload.testId)}&runIds=${encodeURIComponent(submitted.payload.runId)}`, { cookie: student });
assert(combinedMini.payload?.sourceTypes?.includes('MINI_TEST') && combinedMini.payload?.sourceTypes?.includes('QUESTION_BANK') && combinedMini.payload?.groups?.some((group) => group.evidenceCount === detail.payload.questions.length + 1 && group.accuracyPercent === 100), 'Combined report did not include frozen mini-test evidence', combinedMini.payload);
console.log('✓ Frozen mini-test report — native evidence and combined source');

const finalFeed = await request('/api/platform/assessment-feed', { cookie: student });
assert(finalFeed.payload?.measurements?.some((measurement) => measurement.source_type === 'MINI_TEST' || measurement.sourceType === 'MINI_TEST'), 'Nibiru mini-test was not included in the unified assessment feed', finalFeed.payload);
console.log('✓ Nibiru mini-test — visual content, scoring and unified measurement feed');

// Explicit AI source is a synthetic declaration; no AI provider is called.
const aiDraft = await request('/api/platform/questions', { method: 'POST', cookie: admin, expected: 201, json: {
  stemText: `PR ${suffix} · AI human-review probe`, academicYear: miniScope.academicYear,
  gradeLevel: miniScope.gradeLevel, subjectId: miniOutcome.subject_id, questionType: 'MULTIPLE_CHOICE',
  contentMode: 'TEXT', optionCount: 4, options: optionSet(), correctAnswer: 'B',
  solutionText: 'Synthetic approval-gate probe; no model-generated curriculum content.',
  sourceLabel: `AI_REVIEW_PROBE_${suffix}`, copyrightStatus: 'OWNED', originKind: 'AI_GENERATED', nodeIds: [miniOutcomeId],
} });
assert(aiDraft.payload?.id && aiDraft.payload.reviewStatus === 'REVIEW', 'Explicit AI draft bypassed human review', aiDraft.payload);
const aiList = await request(`/api/platform/questions?q=${encodeURIComponent(`PR ${suffix} · AI human-review probe`)}`, { cookie: admin });
const aiQuestion = aiList.payload?.questions?.find(question => question.id === aiDraft.payload.id);
assert(aiQuestion?.origin_kind === 'AI_GENERATED' && Number.isInteger(aiQuestion.review_revision) && aiQuestion.reviewContext?.length, 'AI draft revision/context is missing', aiQuestion);
const reviewBody = { status: 'APPROVED', expectedRevision: aiQuestion.review_revision, expectedContext: aiQuestion.reviewContext };
const unreviewed = await request(`/api/platform/questions/${aiQuestion.id}/review`, { method: 'PATCH', cookie: admin, json: reviewBody, expected: 400 });
assert(unreviewed.payload?.error?.code === 'HUMAN_REVIEW_REQUIRED', 'Alternative review endpoint bypassed human checks', unreviewed.payload);
const checks = { answerAndSolution: true, curriculum: true, ageAppropriate: true, originalityAndRights: true };
const approvedAi = await request(`/api/question-bank-standard/${aiQuestion.id}/review`, { method: 'PATCH', cookie: admin, json: { ...reviewBody, checks } });
assert(approvedAi.payload?.status === 'APPROVED', 'Reviewed AI draft was not approved', approvedAi.payload);
const staleAi = await request(`/api/platform/questions/${aiQuestion.id}/review`, { method: 'PATCH', cookie: admin, json: { ...reviewBody, checks }, expected: 409 });
assert(staleAi.payload?.error?.code === 'QUESTION_REVIEW_CHANGED', 'Stale AI revision was accepted', staleAi.payload);
console.log('✓ AI human review gate — draft, mandatory checks, verified context, stale revision rejected');

console.log('\nQuestion pool assessment pipeline staging smoke passed.');
