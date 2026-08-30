import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const BASE = (process.env.SMOKE_BASE_URL || 'https://yildiz-sinav-v1.rtsgida.workers.dev').replace(/\/$/, '');
const PASSWORD = process.env.SMOKE_DEMO_PASSWORD || 'Demo123!';
const TURNSTILE = 'XXXX.DUMMY.TOKEN.XXXX';
const REPORT = 'LIVE_SMOKE_REPORT.md';
const SUITE_VERSION = 'kvkk-live-v1';
const checks = [];
let currentCheck = 'bootstrap';
let adminCookie = null;

function assert(value, code) {
  if (!value) throw new Error(code);
}

function pass(name, detail = '') {
  checks.push({ name, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function errorCode(payload) {
  return String(payload?.error?.code || payload?.code || 'UNEXPECTED_RESPONSE').replace(/[^A-Z0-9_.:-]/gi, '').slice(0, 80);
}

async function req(path, { method = 'GET', cookie, json, expected = 200, read = true } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }
  const response = await fetch(`${BASE}${path}`, { method, headers, body, redirect: 'manual' });
  let payload = null;
  if (read) {
    const text = await response.text();
    try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  }
  const expectedStatuses = Array.isArray(expected) ? expected : [expected];
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(`${currentCheck}:${method}:${path}:HTTP_${response.status}:${errorCode(payload)}`);
  }
  return { response, payload };
}

async function login(identifier) {
  const { response, payload } = await req('/api/auth/login', {
    method: 'POST',
    json: { identifier, password: PASSWORD, remember: false, turnstileToken: TURNSTILE },
  });
  assert(payload?.ok === true, 'LOGIN_FAILED');
  const cookie = (response.headers.get('set-cookie') || '').match(/(yildiz_session=[^;]+)/)?.[1];
  assert(cookie, 'SESSION_COOKIE_MISSING');
  return cookie;
}

function safeReportText(text) {
  return String(text)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[REDACTED_EMAIL]')
    .replace(/(?<!\d)\d{11}(?!\d)/g, '[REDACTED_ID]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/giu, 'Bearer [REDACTED]')
    .replace(/yildiz_session=[^\s;]+/giu, 'yildiz_session=[REDACTED]')
    .replaceAll(PASSWORD, '[REDACTED_PASSWORD]');
}

function reportSection(result, failureCode = '') {
  const lines = [
    '',
    '## Mandatory KVKK / privacy-by-design live gate',
    '',
    `- Environment: staging`,
    `- Suite: \`${SUITE_VERSION}\``,
    `- Result: **${result}**`,
    `- Synthetic-only checks completed: **${checks.length}**`,
    ...checks.map(item => `- ✅ **${item.name}**${item.detail ? ` — ${item.detail}` : ''}`),
  ];
  if (failureCode) lines.push(`- ❌ **KVKK smoke failure** — \`${failureCode}\``);
  lines.push('');
  return safeReportText(lines.join('\n'));
}

function persist(result, failureCode = '') {
  if (!existsSync(REPORT)) writeFileSync(REPORT, '# Live Staging Smoke Report\n');
  appendFileSync(REPORT, reportSection(result, failureCode));
}

function assertNoSensitiveSmokeOutput() {
  const candidate = reportSection('PASSED');
  assert(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(candidate), 'REPORT_EMAIL_LEAK');
  assert(!/(?<!\d)\d{11}(?!\d)/.test(candidate), 'REPORT_ID_LEAK');
  assert(!/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/iu.test(candidate), 'REPORT_BEARER_LEAK');
  assert(!/yildiz_session=[^\s;]+/iu.test(candidate), 'REPORT_SESSION_LEAK');
  assert(!candidate.includes(PASSWORD), 'REPORT_PASSWORD_LEAK');
}

async function recordRun(status, failureCodes = []) {
  if (!adminCookie) return;
  await req('/api/admin/privacy/smoke/record', {
    method: 'POST',
    cookie: adminCookie,
    json: {
      status,
      suiteVersion: SUITE_VERSION,
      commitSha: process.env.GITHUB_SHA || '',
      checksTotal: Math.max(checks.length, 1),
      checksPassed: status === 'PASSED' ? checks.length : Math.min(checks.length, Math.max(checks.length, 1) - 1),
      failureCodes,
    },
    expected: 201,
  });
}

try {
  currentCheck = 'environment';
  const config = await req('/api/config');
  assert(config.payload?.environment === 'staging', 'NOT_STAGING');

  const manager = await login('manager');
  const student = await login('student1');
  const parent = await login('parent1');
  const teacher = await login('math');
  const guidance = await login('guidance');
  adminCookie = await login('super');

  currentCheck = 'cross-tenant-scope';
  const crossRead = await req('/api/reporting/students/stu_privacy_b/combined', { cookie: manager, expected: 403 });
  assert(crossRead.payload?.error?.code === 'FORBIDDEN', 'CROSS_TENANT_READ_NOT_DENIED');
  const crossWrite = await req('/api/privacy/requests', {
    method: 'POST', cookie: parent, expected: 403,
    json: { requestType: 'ACCESS', studentId: 'stu_privacy_b', scopeNote: 'synthetic smoke scope' },
  });
  assert(crossWrite.payload?.error?.code === 'FORBIDDEN', 'CROSS_TENANT_WRITE_NOT_DENIED');
  pass('Cross-tenant read/write denial');

  currentCheck = 'student-self-scope';
  await req('/api/reporting/students/stu_a001/combined', { cookie: student });
  const studentIdor = await req('/api/reporting/students/stu_a002/combined', { cookie: student, expected: 403 });
  assert(studentIdor.payload?.error?.code === 'FORBIDDEN', 'STUDENT_IDOR_NOT_DENIED');
  pass('Student self scope');

  currentCheck = 'parent-linked-child';
  await req('/api/reporting/students/stu_a001/combined', { cookie: parent });
  const parentIdor = await req('/api/reporting/students/stu_a002/combined', { cookie: parent, expected: 403 });
  assert(parentIdor.payload?.error?.code === 'FORBIDDEN', 'PARENT_UNLINKED_CHILD_NOT_DENIED');
  pass('Parent linked-child scope');

  currentCheck = 'teacher-assignment';
  const assigned = await req('/api/reporting/students/stu_a001/combined', { cookie: teacher });
  assert(assigned.payload?.restrictedToSubjects === true, 'TEACHER_SUBJECT_SCOPE_MISSING');
  const unassigned = await req('/api/reporting/students/stu_std5/combined', { cookie: teacher, expected: 403 });
  assert(unassigned.payload?.error?.code === 'FORBIDDEN', 'TEACHER_UNASSIGNED_CLASS_NOT_DENIED');
  pass('Teacher assignment scope');

  currentCheck = 'guidance-raw-scope';
  const teacherQueue = await req('/api/nibiru/guidance/assessments/counselor-queue', { cookie: teacher, expected: 403 });
  assert(teacherQueue.payload?.error?.code === 'FORBIDDEN', 'GUIDANCE_QUEUE_TEACHER_NOT_DENIED');
  const guidanceQueue = await req('/api/nibiru/guidance/assessments/counselor-queue', { cookie: guidance });
  const queueRows = Array.isArray(guidanceQueue.payload?.sessions) ? guidanceQueue.payload.sessions : [];
  assert(queueRows.every(row => !Object.prototype.hasOwnProperty.call(row, 'response_json')), 'GUIDANCE_QUEUE_RAW_RESPONSE_EXPOSED');
  pass('Guidance-only raw assessment boundary');

  currentCheck = 'logout-revocation';
  const logoutCookie = await login('student1');
  const loggedOut = await req('/api/auth/logout', { method: 'POST', cookie: logoutCookie });
  assert(loggedOut.payload?.ok === true, 'LOGOUT_FAILED');
  const revoked = await req('/api/auth/me', { cookie: logoutCookie, expected: 401 });
  assert(revoked.payload?.error?.code === 'UNAUTHENTICATED', 'SESSION_NOT_REVOKED');
  pass('Logout session revocation');

  currentCheck = 'ai-redaction';
  const minimization = await req('/api/admin/privacy/smoke/minimization', { method: 'POST', cookie: adminCookie });
  assert(minimization.payload?.syntheticOnly === true, 'MINIMIZATION_NOT_SYNTHETIC');
  assert(minimization.payload?.ai?.passed === true && Number(minimization.payload?.ai?.redactions || 0) >= 3, 'AI_REDACTION_FAILED');
  pass('AI outbound redaction / pseudonymization');

  currentCheck = 'whatsapp-minimization';
  assert(minimization.payload?.whatsapp?.passed === true && minimization.payload?.whatsapp?.minimized === true, 'WHATSAPP_MINIMIZATION_FAILED');
  pass('WhatsApp academic-detail minimization');

  currentCheck = 'sensitive-export-audit';
  const blockedExport = await req('/api/admin/privacy/exports/requests.csv', { cookie: manager, expected: 403 });
  assert(blockedExport.payload?.error?.code === 'FORBIDDEN', 'SENSITIVE_EXPORT_AUTH_FAILED');
  const exportResponse = await req('/api/admin/privacy/exports/requests.csv', { cookie: adminCookie, expected: 200, read: false });
  assert(exportResponse.response.headers.get('x-anunex-sensitive-export') === 'audited', 'SENSITIVE_EXPORT_HEADER_MISSING');
  assert((exportResponse.response.headers.get('cache-control') || '').includes('no-store'), 'SENSITIVE_EXPORT_CACHE_POLICY_MISSING');
  const audit = await req('/api/admin/privacy/smoke/audit-evidence', { cookie: adminCookie });
  assert(audit.payload?.sensitiveExportAudit?.found === true, 'SENSITIVE_EXPORT_AUDIT_MISSING');
  pass('Protected export authorization + audit evidence');

  currentCheck = 'notice-evidence';
  const notice = await req('/api/privacy/notices/current', { cookie: student });
  assert(notice.payload?.notice?.id, 'ACTIVE_NOTICE_MISSING');
  const acknowledged = await req('/api/privacy/notices/acknowledge', {
    method: 'POST', cookie: student, expected: [200, 201],
    json: { noticeVersionId: notice.payload.notice.id, channel: 'WEB' },
  });
  assert(Boolean(acknowledged.payload?.receiptId) && (acknowledged.payload?.acknowledged === true || acknowledged.payload?.alreadyRecorded === true), 'NOTICE_ACK_EVIDENCE_MISSING');
  pass('Notice version + acknowledgement evidence');

  currentCheck = 'consent-withdrawal';
  const consent = await req('/api/privacy/consents', {
    method: 'POST', cookie: student, expected: [200, 201],
    json: { purposeCode: 'SMOKE_CONSENT', noticeVersionId: notice.payload.notice.id, channel: 'WEB' },
  });
  assert(consent.payload?.state === 'GRANTED' && consent.payload?.id, 'CONSENT_GRANT_FAILED');
  const withdrawal = await req(`/api/privacy/consents/${encodeURIComponent(consent.payload.id)}/withdraw`, { method: 'POST', cookie: student });
  assert(withdrawal.payload?.state === 'WITHDRAWN', 'CONSENT_WITHDRAW_FAILED');
  pass('Purpose-specific consent grant + withdrawal');

  currentCheck = 'deletion-job';
  const dsr = await req('/api/privacy/requests', {
    method: 'POST', cookie: student, expected: 201,
    json: { requestType: 'ANONYMIZE', scopeNote: 'synthetic smoke controlled-job verification' },
  });
  assert(dsr.payload?.id, 'ANONYMIZE_DSR_CREATE_FAILED');
  const verified = await req(`/api/admin/privacy/requests/${encodeURIComponent(dsr.payload.id)}/verify`, { method: 'POST', cookie: adminCookie });
  assert(verified.payload?.identityVerificationStatus === 'VERIFIED', 'ANONYMIZE_DSR_VERIFY_FAILED');
  const deletionJob = await req('/api/admin/privacy/deletion-jobs', {
    method: 'POST', cookie: adminCookie, expected: 201,
    json: { requestId: dsr.payload.id, mode: 'ANONYMIZE', reasonCode: 'SMOKE_SYNTHETIC' },
  });
  assert(deletionJob.payload?.status === 'LEGAL_REVIEW' && deletionJob.payload?.id, 'ANONYMIZE_JOB_CONTROL_GATE_FAILED');
  pass('Synthetic anonymization job enters legal-review gate');

  currentCheck = 'provider-transfer-registry';
  const processors = await req('/api/admin/privacy/processors', { cookie: adminCookie });
  const transfers = await req('/api/admin/privacy/transfers', { cookie: adminCookie });
  const requiredServices = ['CLOUDFLARE', 'META_WHATSAPP', 'YOUTUBE', 'NIBIRU_AI'];
  const processorCodes = new Set((processors.payload?.items || []).map(item => item.service_code));
  const transferCodes = new Set((transfers.payload?.items || []).map(item => item.service_code));
  assert(requiredServices.every(code => processorCodes.has(code)), 'PROCESSOR_REGISTRY_INCOMPLETE');
  assert(requiredServices.every(code => transferCodes.has(code)), 'TRANSFER_REGISTRY_INCOMPLETE');
  const releaseGate = await req('/api/admin/privacy/release-gate', { cookie: adminCookie });
  assert(releaseGate.payload?.productionReleaseAllowed === false, 'LEGAL_RELEASE_GATE_ACCIDENTALLY_OPEN');
  pass('Provider/transfer registry completeness with release still blocked');

  currentCheck = 'incident-timer';
  const detectedAt = new Date().toISOString();
  const incident = await req('/api/admin/privacy/incidents', {
    method: 'POST', cookie: adminCookie, expected: 201,
    json: {
      title: 'Synthetic privacy smoke incident',
      incidentType: 'SYNTHETIC_SMOKE',
      riskLevel: 'LOW',
      personalDataInvolved: true,
      detectedAt,
      affectedDataCategories: ['SYNTHETIC_TEST_DATA'],
      affectedSubjectCategories: ['SYNTHETIC_TEST_SUBJECT'],
      estimatedSubjectCount: 1,
    },
  });
  const due = new Date(incident.payload?.authorityNotificationDueAt || '').getTime();
  const start = new Date(detectedAt).getTime();
  assert(Number.isFinite(due) && due - start === 72 * 60 * 60 * 1000, 'INCIDENT_72H_TIMER_FAILED');
  pass('Incident-response 72-hour timer');

  currentCheck = 'camera-raw-media';
  const camera = await req('/api/exams/exam_demo_active/camera-preview', {
    method: 'POST', cookie: manager, expected: 400,
    json: { frame: 'synthetic-raw-frame-marker', extractedMarks: ['A', 'B'] },
  });
  assert(camera.payload?.error?.code === 'CAMERA_RAW_MEDIA_NOT_ACCEPTED', 'CAMERA_RAW_MEDIA_NOT_REJECTED');
  assert(minimization.payload?.camera?.rawMediaDetected === true, 'CAMERA_DETECTOR_DIAGNOSTIC_FAILED');
  pass('Camera raw-frame server rejection');

  currentCheck = 'voice-ephemeral';
  const voiceResponse = await fetch(`${BASE}/api/nibiru/voice/transcribe`, {
    method: 'POST',
    headers: { Cookie: student, 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(0),
    redirect: 'manual',
  });
  await voiceResponse.arrayBuffer();
  assert(voiceResponse.headers.get('x-anunex-raw-audio-retention') === 'ephemeral', 'VOICE_EPHEMERAL_HEADER_MISSING');
  assert(voiceResponse.headers.get('x-anunex-voiceprint') === 'disabled', 'VOICEPRINT_DISABLED_HEADER_MISSING');
  assert((voiceResponse.headers.get('cache-control') || '').includes('no-store'), 'VOICE_NO_STORE_HEADER_MISSING');
  pass('Voice raw-audio ephemeral / voiceprint disabled');

  currentCheck = 'smoke-output-redaction';
  assertNoSensitiveSmokeOutput();
  pass('Smoke output contains no raw PII/secrets');

  currentCheck = 'smoke-evidence-record';
  await recordRun('PASSED');
  persist('PASSED');
  console.log(`\n${checks.length} mandatory KVKK/security live checks passed.`);
} catch (error) {
  const raw = String(error instanceof Error ? error.message : 'KVKK_SMOKE_FAILED');
  const failureCode = safeReportText(raw).replace(/[^A-Za-z0-9_.:\/-]/g, '_').slice(0, 180) || 'KVKK_SMOKE_FAILED';
  try { await recordRun('FAILED', [failureCode.replace(/[^A-Z0-9_.:-]/gi, '_').toUpperCase().slice(0, 80)]); } catch {}
  persist('FAILED', failureCode);
  console.error(`KVKK LIVE SMOKE FAILED: ${failureCode}`);
  process.exitCode = 1;
}
