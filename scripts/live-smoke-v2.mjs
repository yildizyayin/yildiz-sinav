import { writeFileSync } from 'node:fs';

const BASE_URL = (process.env.SMOKE_BASE_URL || 'https://yildiz-sinav-v1.rtsgida.workers.dev').replace(/\/$/, '');
const PASSWORD = process.env.SMOKE_DEMO_PASSWORD || 'Demo123!';
const TURNSTILE_TEST_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
const REPORT_PATH = 'LIVE_SMOKE_REPORT.md';
const passed = [];

function assert(value, message, details) {
  if (!value) throw new Error(`${message}${details === undefined ? '' : `\n${JSON.stringify(details, null, 2)}`}`);
}
function ok(name, details = '') {
  passed.push({ name, details });
  console.log(`✓ ${name}${details ? ` — ${details}` : ''}`);
}
function report(error) {
  const lines = [
    '# Live Staging Smoke Report', '',
    `- Target: \`${BASE_URL}\``,
    `- Time: \`${new Date().toISOString()}\``,
    `- Result: **${error ? 'FAILED' : 'PASSED'}**`,
    `- Passed checks before finish: **${passed.length}**`, '',
    '## Checks', '',
    ...(passed.length ? passed.map((x) => `- ✅ **${x.name}**${x.details ? ` — ${x.details}` : ''}`) : ['- No checks completed.']),
  ];
  if (error) lines.push('', '## Failure', '', '```text', String(error instanceof Error ? error.stack || error.message : error).slice(0, 12000), '```');
  lines.push('');
  writeFileSync(REPORT_PATH, lines.join('\n'));
}

async function request(path, { method = 'GET', cookie, json, form, expected = 200 } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  let body;
  if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  else if (form) body = form;
  const response = await fetch(`${BASE_URL}${path}`, { method, headers, body, redirect: 'manual' });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  if (response.status !== expected) throw new Error(`${method} ${path} expected ${expected}, got ${response.status}\n${JSON.stringify(payload, null, 2)}`);
  return { response, payload };
}

async function login(identifier) {
  const { response, payload } = await request('/api/auth/login', {
    method: 'POST', expected: 200,
    json: { identifier, password: PASSWORD, remember: false, turnstileToken: TURNSTILE_TEST_TOKEN },
  });
  assert(payload?.ok === true, `${identifier} login failed`, payload);
  const cookie = (response.headers.get('set-cookie') || '').match(/(yildiz_session=[^;]+)/)?.[1];
  assert(cookie, `${identifier} session cookie missing`);
  return cookie;
}

function build110Csv() {
  const rows = ['student_number,name,class,booklet,answers_MAT,answers_TUR,answers_FEN'];
  for (let i = 1; i <= 65; i++) rows.push(`${1000 + i},Aktif${i} Öğrenci${i},7/A,A,ABCDEABCDE,ABCDEABCDE,ABCDEABCDE`);
  for (let i = 1; i <= 45; i++) rows.push(`${2000 + i},Misafir${i} Katılımcı${i},7/A,A,ABCDEABCDE,ABCDEABCDE,ABCDEABCDE`);
  return rows.join('\n');
}

async function preview110(cookie) {
  const form = new FormData();
  form.append('file', new Blob([build110Csv()], { type: 'text/csv' }), 'smoke-110.csv');
  const { payload } = await request('/api/exams/exam_demo_active/preview-file', { method: 'POST', cookie, form });
  assert(payload?.total === 110, 'Preview total must be 110', payload);
  assert(payload?.counts?.active === 65, 'Preview must match 65 active students', payload?.counts);
  assert(payload?.counts?.guest === 45, 'Preview must match 45 known guests', payload?.counts);
  assert(payload?.counts?.newGuest === 0, 'Preview must create no new guest identity', payload?.counts);
  assert(payload?.counts?.ambiguous === 0 && payload?.counts?.invalid === 0, 'Preview contains unresolved rows', payload?.counts);
  assert(payload?.status === 'READY', 'Preview batch must be READY', payload);
  return payload;
}

async function evaluateFully(cookie, batchId) {
  let latest = null;
  for (let attempt = 1; attempt <= 40; attempt++) {
    const { payload } = await request(`/api/scan-batches/${batchId}/evaluate`, { method: 'POST', cookie });
    assert(payload?.ok === true, 'Evaluation chunk failed', payload);
    latest = payload;
    console.log(`  evaluation chunk ${attempt}: ${payload.processed}/${payload.total}, remaining ${payload.remaining}`);
    if (payload.done) return { ...payload, attempts: attempt };
    assert(Number(payload.processedThisRun) > 0, 'Evaluation made no forward progress', payload);
  }
  throw new Error(`Evaluation did not finish within 40 chunks: ${JSON.stringify(latest)}`);
}

async function main() {
  const config = await request('/api/config');
  assert(config.payload?.environment === 'staging', 'Expected staging environment', config.payload);
  ok('Public config', `${config.payload.productName} / staging`);

  const unauth = await request('/api/dashboard', { expected: 401 });
  assert(unauth.payload?.error?.code === 'UNAUTHENTICATED', 'Unauthenticated boundary failed', unauth.payload);
  ok('Unauthenticated API boundary');

  const noTurnstile = await request('/api/auth/login', { method: 'POST', expected: 400, json: { identifier: 'manager', password: PASSWORD } });
  assert(noTurnstile.payload?.error?.code === 'TURNSTILE_REQUIRED', 'Turnstile must be validated server-side', noTurnstile.payload);
  ok('Turnstile server validation');

  const manager = await login('manager');
  const managerMe = await request('/api/auth/me', { cookie: manager });
  assert(managerMe.payload?.user?.role === 'INSTITUTION_MANAGER', 'Manager role mismatch', managerMe.payload);
  const dash = await request('/api/dashboard', { cookie: manager });
  const cards = Object.fromEntries((dash.payload?.cards || []).map((c) => [c.label, Number(c.value)]));
  assert(cards['Aktif Öğrenci'] === 65 && cards['Misafir Öğrenci'] === 45 && cards['Uygulanan Sınav'] >= 20, 'Manager dashboard counts mismatch', cards);
  ok('Manager tenant dashboard', `65 active / 45 guest / ${cards['Uygulanan Sınav']} applied exams`);

  const active = await request('/api/students?status=ACTIVE', { cookie: manager });
  const guests = await request('/api/students?status=GUEST', { cookie: manager });
  assert(active.payload?.students?.length === 65, 'Active list must contain 65 students', active.payload?.students?.length);
  assert(guests.payload?.students?.length === 45, 'Guest list must contain 45 students', guests.payload?.students?.length);
  ok('Active/guest student separation', '65 / 45');

  const firstPreview = await preview110(manager);
  ok('110-person exam matching preview', '65 active + 45 known guest + 0 new guest');

  const evaluation = await evaluateFully(manager, firstPreview.batchId);
  assert(evaluation.processed === 110 && evaluation.remaining === 0, '110-person evaluation did not commit all rows', evaluation);
  ok('110-person chunked exam evaluation', `110 committed in ${evaluation.attempts} safe chunks`);

  const afterGuests = await request('/api/students?status=GUEST', { cookie: manager });
  assert(afterGuests.payload?.students?.length === 45, 'Evaluation created duplicate guests', afterGuests.payload?.students?.length);
  const secondPreview = await preview110(manager);
  assert(secondPreview.counts?.active === 65 && secondPreview.counts?.guest === 45 && secondPreview.counts?.newGuest === 0, 'Repeat matching changed identity counts', secondPreview.counts);
  ok('Repeat guest identity matching', 'still 45 guests; no duplicates');

  const student = await login('student1');
  const studentMe = await request('/api/auth/me', { cookie: student });
  assert(studentMe.payload?.user?.role === 'STUDENT' && studentMe.payload?.user?.student_id === 'stu_a001', 'Student identity binding failed', studentMe.payload);
  const myResults = await request('/api/my-results', { cookie: student });
  assert(Array.isArray(myResults.payload?.results) && myResults.payload.results.length >= 8, 'Historical student results missing', myResults.payload);
  await request('/api/reporting/students/stu_a001/combined', { cookie: student });
  const studentIdor = await request('/api/reporting/students/stu_a002/combined', { cookie: student, expected: 403 });
  assert(studentIdor.payload?.error?.code === 'FORBIDDEN', 'Student can access another student', studentIdor.payload);
  ok('Student self-service + IDOR boundary', `${myResults.payload.results.length} visible results`);

  const parent = await login('parent1');
  const parentDash = await request('/api/dashboard', { cookie: parent });
  assert(parentDash.payload?.children?.length === 1 && parentDash.payload.children[0].id === 'stu_a001', 'Parent child link failed', parentDash.payload);
  await request('/api/reporting/students/stu_a001/combined', { cookie: parent });
  const parentIdor = await request('/api/reporting/students/stu_a002/combined', { cookie: parent, expected: 403 });
  assert(parentIdor.payload?.error?.code === 'FORBIDDEN', 'Parent can access an unrelated child', parentIdor.payload);
  ok('Parent linked-child boundary');

  const teacher = await login('math');
  const teacherReport = await request('/api/reporting/students/stu_a001/combined', { cookie: teacher });
  assert(teacherReport.payload?.restrictedToSubjects === true, 'Branch teacher report is not restricted', teacherReport.payload);
  const teacherSubjects = [...new Set((teacherReport.payload?.outcomes || []).map((x) => x.subject_name))];
  assert(teacherSubjects.length > 0 && teacherSubjects.every((x) => x === 'Matematik'), 'Branch teacher received other subjects', teacherSubjects);
  ok('Branch teacher subject scope', teacherSubjects.join(', '));

  const guidance = await login('guidance');
  const guidanceReport = await request('/api/reporting/students/stu_a001/combined', { cookie: guidance });
  assert(guidanceReport.payload?.restrictedToSubjects === false, 'Guidance teacher is incorrectly subject-restricted', guidanceReport.payload);
  const guidanceSubjects = [...new Set((guidanceReport.payload?.outcomes || []).map((x) => x.subject_name))];
  assert(['Matematik', 'Türkçe', 'Fen Bilimleri'].every((x) => guidanceSubjects.includes(x)), 'Guidance teacher cannot see all assigned-class subjects', guidanceSubjects);
  ok('Guidance teacher all-subject scope', guidanceSubjects.join(', '));

  const superAdmin = await login('super');
  const institutions = await request('/api/institutions', { cookie: superAdmin });
  assert((institutions.payload?.institutions || []).some((x) => x.id === 'inst_demo' && x.name === 'Demo Koleji'), 'Super Admin cannot see Demo Koleji', institutions.payload);
  ok('Super Admin institution access');

  const logout = await request('/api/auth/logout', { method: 'POST', cookie: student });
  assert(logout.payload?.ok === true, 'Logout failed', logout.payload);
  const revoked = await request('/api/auth/me', { cookie: student, expected: 401 });
  assert(revoked.payload?.error?.code === 'UNAUTHENTICATED', 'Logged-out session is still usable', revoked.payload);
  ok('Session revocation on logout');

  report(null);
  console.log(`\n${passed.length} live smoke checks passed.`);
}

main().catch((error) => {
  report(error);
  console.error('\nLIVE SMOKE FAILED');
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
