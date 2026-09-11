const BASE = (process.env.SMOKE_BASE_URL || '').replace(/\/$/, '');
const PASSWORD = process.env.SMOKE_DEMO_PASSWORD || 'Demo123!';
const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

if (!BASE) throw new Error('SMOKE_BASE_URL is required');

function assert(value, message, details) {
  if (!value) throw new Error(`${message}${details === undefined ? '' : `\n${JSON.stringify(details, null, 2)}`}`);
}

async function request(path, { method = 'GET', cookie, json, form, expected = 200 } = {}) {
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

async function createQuestion({ subjectId, outcomeId, index, contentMode = 'TEXT', withImage = false, optionCount = 4 }) {
  const payload = {
    stemText: `PR ${suffix} · soru ${index}`,
    gradeLevel: 7,
    subjectId,
    topic: 'Soru havuzu staging konusu',
    subtopic: 'Zengin içerik doğrulaması',
    questionType: 'MULTIPLE_CHOICE',
    difficultyLevel: (index % 6) + 1,
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
  assert(result.payload?.id && Number(result.payload?.assetCount) >= 1, 'Image question did not write an R2 asset', result.payload);
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

const practice = await request('/api/platform/student-practice?gradeLevel=7&limit=20', { cookie: student });
const visualQuestion = (practice.payload?.questions || []).find((question) => question.id === questions[0].id);
assert(visualQuestion, 'Student practice did not return the approved visual question', practice.payload);
assert(!Object.prototype.hasOwnProperty.call(visualQuestion, 'correct_answer'), 'Student practice leaked the correct answer', visualQuestion);
assert(visualQuestion.assets?.some((asset) => asset.url?.includes(`/api/platform/questions/${questions[0].id}/assets/`)), 'Student practice did not expose the question media route', visualQuestion);
const assetUrl = visualQuestion.assets.find((asset) => asset.url)?.url;
const media = await request(assetUrl, { cookie: student, expected: 200 });
assert(media.response.headers.get('content-type')?.startsWith('image/'), 'Question media did not come from R2 with an image content type', media.response.headers.get('content-type'));
console.log('✓ Student visual practice — media visible, answer hidden, R2 asset reachable');

const submitted = await request('/api/platform/student-practice/attempts', {
  method: 'POST',
  cookie: student,
  json: { questionId: questions[0].id, answer: questions[0].correctAnswer, runId: `asr_${suffix}` },
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
    optionMode: 'MIXED',
    bookletCodes: ['A', 'B'],
    deliveryMode: 'PDF_OPTICAL',
    sourceTypes: ['QUESTION_BANK'],
  },
  expected: 201,
});
assert(Number(studio.payload?.selectedQuestions) >= 5 && studio.payload?.bookletCodes?.includes('A') && studio.payload?.bookletCodes?.includes('B'), 'A/B PDF-optical studio blueprint was not created', studio.payload);
console.log('✓ A/B + PDF_OPTICAL studio blueprint');

const assignment = await request('/api/platform/assignments', {
  method: 'POST',
  cookie: manager,
  json: {
    title: `PR ${suffix} soru havuzu ödevi`,
    assignmentType: 'QUESTION_BANK',
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

const plan = await request('/api/nibiru/coach/daily-plan', { method: 'POST', cookie: student, json: {}, expected: [200, 201] });
const outcomeItem = (plan.payload?.items || []).find((item) => item.payload?.kind === 'OUTCOME_PRACTICE');
assert(outcomeItem?.id, 'Nibiru did not create an outcome practice item from the seeded evidence', plan.payload);
const started = await request(`/api/nibiru/coach/items/${encodeURIComponent(outcomeItem.id)}/mini-test`, { method: 'POST', cookie: student, json: {}, expected: [200, 201] });
assert(started.payload?.testId && Number(started.payload?.questionCount) >= 5, 'Nibiru mini-test did not start with five questions', started.payload);
const detail = await request(`/api/nibiru/coach/mini-tests/${encodeURIComponent(started.payload.testId)}`, { cookie: student });
assert(detail.payload?.questions?.length >= 5 && detail.payload.questions.every((question) => question.correct_answer == null), 'Nibiru mini-test leaked answers or has too few questions', detail.payload);
assert(detail.payload.questions.some((question) => question.assets?.length), 'Nibiru mini-test did not hydrate question media', detail.payload.questions);
const answers = detail.payload.questions.map((question) => {
  const known = questions.concat(mathQuestion).find((item) => item.id === question.question_id);
  return { questionId: question.question_id, answer: known?.correctAnswer || 'B' };
});
const miniTest = await request(`/api/nibiru/coach/mini-tests/${encodeURIComponent(started.payload.testId)}/submit`, { method: 'POST', cookie: student, json: { answers } });
assert(miniTest.payload?.result?.status === 'PASSED', 'Nibiru mini-test did not persist a passing measurement', miniTest.payload);
const finalFeed = await request('/api/platform/assessment-feed', { cookie: student });
assert(finalFeed.payload?.measurements?.some((measurement) => measurement.source_type === 'MINI_TEST' || measurement.sourceType === 'MINI_TEST'), 'Nibiru mini-test was not included in the unified assessment feed', finalFeed.payload);
console.log('✓ Nibiru mini-test — visual content, scoring and unified measurement feed');

console.log('\nQuestion pool assessment pipeline staging smoke passed.');
