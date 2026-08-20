const BASE_URL = (process.env.SMOKE_BASE_URL || 'https://yildiz-sinav-v1.rtsgida.workers.dev').replace(/\/$/, '');
const PASSWORD = process.env.SMOKE_DEMO_PASSWORD || 'Demo123!';
const TURNSTILE_TEST_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

const results = [];
function check(condition, message, details) {
  if (!condition) {
    const suffix = details === undefined ? '' : `\n${JSON.stringify(details, null, 2)}`;
    throw new Error(`${message}${suffix}`);
  }
}
function pass(name, details = '') {
  results.push({ name, ok: true, details });
  console.log(`✓ ${name}${details ? ` — ${details}` : ''}`);
}

async function http(path, { method = 'GET', cookie, json, form, expected = 200 } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) body = form;
  const response = await fetch(`${BASE_URL}${path}`, { method, headers, body, redirect: 'manual' });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  if (response.status !== expected) {
    throw new Error(`${method} ${path} expected ${expected}, got ${response.status}\n${JSON.stringify(payload, null, 2)}`);
  }
  return { response, payload };
}

async function login(identifier) {
  const { response, payload } = await http('/api/auth/login', {
    method: 'POST',
    json: { identifier, password: PASSWORD, remember: false, turnstileToken: TURNSTILE_TEST_TOKEN },
    expected: 200,
  });
  check(payload?.ok === true, `${identifier} login payload invalid`, payload);
  const setCookie = response.headers.get('set-cookie') || '';
  const session = setCookie.match(/(yildiz_session=[^;]+)/)?.[1];
  check(Boolean(session), `${identifier} login did not return session cookie`, { setCookie: setCookie ? '[present]' : '[missing]' });
  return session;
}

function demoCsv() {
  const rows = ['student_number,name,class,booklet,answers_MAT,answers_TUR,answers_FEN'];
  for (let i = 1; i <= 65; i++) {
    rows.push(`${1000 + i},Aktif${i} Öğrenci${i},7/A,A,ABCDEABCDE,ABCDEABCDE,ABCDEABCDE`);
  }
  for (let i = 1; i <= 45; i++) {
    rows.push(`${2000 + i},Misafir${i} Katılımcı${i},7/A,A,ABCDEABCDE,ABCDEABCDE,ABCDEABCDE`);
  }
  return rows.join('\n');
}

async function preview110(cookie) {
  const form = new FormData();
  form.append('file', new Blob([demoCsv()], { type: 'text/csv' }), 'smoke-110.csv');
  const { payload } = await http('/api/exams/exam_demo_active/preview-file', { method: 'POST', cookie, form, expected: 200 });
  check(payload?.ok === true, '110 participant preview failed', payload);
  check(payload.total === 110, 'Expected 110 preview rows', payload);
  check(payload.counts?.active === 65, 'Expected 65 active matches', payload.counts);
  check(payload.counts?.guest === 45, 'Expected 45 known guest matches', payload.counts);
  check(payload.counts?.newGuest === 0, 'Expected 0 new guests', payload.counts);
  check(payload.counts?.ambiguous === 0 && payload.counts?.invalid === 0, 'Expected no ambiguous/invalid rows', payload.counts);
  check(payload.status === 'READY', '110 participant batch should be READY', payload);
  return payload;
}

async function run() {
  console.log(`Live smoke target: ${BASE_URL}`);

  const config = await http('/api/config');
  check(config.payload?.environment === 'staging', 'Expected staging environment', config.payload);
  pass('Public config', `${config.payload.productName} / ${config.payload.environment}`);

  const unauth = await http('/api/dashboard', { expected: 401 });
  check(unauth.payload?.error?.code === 'UNAUTHENTICATED', 'Unauthenticated boundary failed', unauth.payload);
  pass('Unauthenticated API boundary');

  const missingTurnstile = await http('/api/auth/login', {
    method: 'POST',
    json: { identifier: 'manager', password: PASSWORD },
    expected: 400,
  });
  check(missingTurnstile.payload?.error?.code === 'TURNSTILE_REQUIRED', 'Turnstile server-side enforcement failed', missingTurnstile.payload);
  pass('Turnstile server validation');

  const manager = await login('manager');
  const managerMe = await http('/api/auth/me', { cookie: manager });
  check(managerMe.payload?.user?.role === 'INSTITUTION_MANAGER', 'Manager role mismatch', managerMe.payload);
  const dash = await http('/api/dashboard', { cookie: manager });
  const cards = Object.fromEntries((dash.payload?.cards || []).map((c) => [c.label, Number(c.value)]));
  check(cards['Aktif Öğrenci'] === 65, 'Manager dashboard active count mismatch', cards);
  check(cards['Misafir Öğrenci'] === 45, 'Manager dashboard guest count mismatch', cards);
  check(cards['Uygulanan Sınav'] === 20, 'Manager dashboard applied exam count mismatch', cards);
  pass('Manager tenant dashboard', '65 active / 45 guest / 20 applied exams');

  const activeStudents = await http('/api/students?status=ACTIVE', { cookie: manager });
  const guestStudents = await http('/api/students?status=GUEST', { cookie: manager });
  check(activeStudents.payload?.students?.length === 65, 'Active student list count mismatch', activeStudents.payload?.students?.length);
  check(guestStudents.payload?.students?.length === 45, 'Guest student list count mismatch', guestStudents.payload?.students?.length);
  pass('Active/guest student separation', '65 / 45');

  const p1 = await preview110(manager);
  pass('110-person exam matching preview', '65 active + 45 known guest + 0 new guest');

  const evaluated = await http(`/api/scan-batches/${p1.batchId}/evaluate`, { method: 'POST', cookie: manager, expected: 200 });
  check(evaluated.payload?.processed === 110, 'Expected 110 evaluated participants', evaluated.payload);
  pass('110-person exam evaluation', `${evaluated.payload.processed} participants committed`);

  const postEvalGuests = await http('/api/students?status=GUEST', { cookie: manager });
  check(postEvalGuests.payload?.students?.length === 45, 'Evaluation created duplicate guest identities', postEvalGuests.payload?.students?.length);
  const p2 = await preview110(manager);
  check(p2.counts?.active === 65 && p2.counts?.guest === 45 && p2.counts?.newGuest === 0, 'Repeat exam matching changed identity counts', p2.counts);
  pass('Repeat guest identity matching', 'still 45 guests; no duplicates after evaluation');

  const student = await login('student1');
  const studentMe = await http('/api/auth/me', { cookie: student });
  check(studentMe.payload?.user?.role === 'STUDENT' && studentMe.payload?.user?.student_id === 'stu_a001', 'Student identity binding mismatch', studentMe.payload);
  const myResults = await http('/api/my-results', { cookie: student });
  check(Array.isArray(myResults.payload?.results) && myResults.payload.results.length >= 8, 'Student historical results missing', myResults.payload);
  const ownReport = await http('/api/reporting/students/stu_a001/combined', { cookie: student });
  check(ownReport.payload?.student?.id === 'stu_a001', 'Student own combined report failed', ownReport.payload);
  const otherStudentDenied = await http('/api/reporting/students/stu_a002/combined', { cookie: student, expected: 403 });
  check(otherStudentDenied.payload?.error?.code === 'FORBIDDEN', 'Student IDOR protection failed', otherStudentDenied.payload);
  pass('Student self-service + IDOR boundary', `${myResults.payload.results.length} visible results`);

  const parent = await login('parent1');
  const parentDash = await http('/api/dashboard', { cookie: parent });
  check(parentDash.payload?.children?.length === 1 && parentDash.payload.children[0].id === 'stu_a001', 'Parent-child link mismatch', parentDash.payload);
  await http('/api/reporting/students/stu_a001/combined', { cookie: parent });
  const otherChildDenied = await http('/api/reporting/students/stu_a002/combined', { cookie: parent, expected: 403 });
  check(otherChildDenied.payload?.error?.code === 'FORBIDDEN', 'Parent child access boundary failed', otherChildDenied.payload);
  pass('Parent linked-child boundary');

  const teacher = await login('math');
  const teacherReport = await http('/api/reporting/students/stu_a001/combined', { cookie: teacher });
  check(teacherReport.payload?.restrictedToSubjects === true, 'Branch teacher report should be subject-restricted', teacherReport.payload);
  const teacherSubjects = [...new Set((teacherReport.payload?.outcomes || []).map((x) => x.subject_name))];
  check(teacherSubjects.length > 0 && teacherSubjects.every((x) => x === 'Matematik'), 'Branch teacher received non-Math outcomes', teacherSubjects);
  pass('Branch teacher subject scope', teacherSubjects.join(', '));

  const guidance = await login('guidance');
  const guidanceReport = await http('/api/reporting/students/stu_a001/combined', { cookie: guidance });
  check(guidanceReport.payload?.restrictedToSubjects === false, 'Guidance report should be all-subject for assigned class', guidanceReport.payload);
  const guidanceSubjects = [...new Set((guidanceReport.payload?.outcomes || []).map((x) => x.subject_name))];
  check(guidanceSubjects.includes('Matematik') && guidanceSubjects.includes('Türkçe') && guidanceSubjects.includes('Fen Bilimleri'), 'Guidance teacher does not see all assigned-class subjects', guidanceSubjects);
  pass('Guidance teacher all-subject scope', guidanceSubjects.join(', '));

  const superAdmin = await login('super');
  const institutions = await http('/api/institutions', { cookie: superAdmin });
  check((institutions.payload?.institutions || []).some((x) => x.id === 'inst_demo' && x.name === 'Demo Koleji'), 'Super Admin institution access failed', institutions.payload);
  pass('Super Admin institution access');

  const logout = await http('/api/auth/logout', { method: 'POST', cookie: student });
  check(logout.payload?.ok === true, 'Logout failed', logout.payload);
  const revoked = await http('/api/auth/me', { cookie: student, expected: 401 });
  check(revoked.payload?.error?.code === 'UNAUTHENTICATED', 'Revoked session still active', revoked.payload);
  pass('Session revocation on logout');

  console.log(`\n${results.length} live smoke checks passed.`);
}

run().catch((error) => {
  console.error('\nLIVE SMOKE FAILED');
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
