import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';

// Synthetic staging users only. Each independent generator owns disjoint users.
const profiles = { smoke: 10, peak10k: 10000, peak1m: 1000000 };
const profile = __ENV.LOAD_PROFILE || 'smoke';
if (!(profile in profiles)) throw new Error('Unknown LOAD_PROFILE');
const base = (__ENV.LOAD_BASE_URL || '').replace(/\/$/, '');
if (!/^https?:\/\/[^/]+$/.test(base)) throw new Error('LOAD_BASE_URL must be an origin');
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base) &&
    (!__ENV.LOAD_STAGING_ORIGIN || base !== __ENV.LOAD_STAGING_ORIGIN || __ENV.LOAD_CONFIRM_STAGING !== 'true')) {
  throw new Error('Remote load requires explicit isolated staging origin confirmation');
}
if (/^https:\/\/(app|sonuc|demo)\.anunex\.com$/.test(base)) throw new Error('Production domains are excluded');
const shards = Number(__ENV.LOAD_SHARDS || 1);
const shardId = Number(__ENV.LOAD_SHARD_ID || 0);
if (!Number.isSafeInteger(shards) || shards < 1 || !Number.isSafeInteger(shardId) || shardId < 0 || shardId >= shards) throw new Error('Invalid shard configuration');
if (profile === 'peak1m' && shards < 100) throw new Error('Million-user profile requires at least 100 coordinated generators');
const total = profiles[profile];
const vus = Math.floor(total / shards) + (shardId < total % shards ? 1 : 0);
if (!vus) throw new Error('Shard has no users');
const sessions = new SharedArray('synthetic-sessions', () => JSON.parse(open(__ENV.LOAD_SESSIONS_FILE || './synthetic-sessions.json')));
if (sessions.length < vus) throw new Error('Each virtual user requires a distinct synthetic staging session');
export const options = {
  scenarios: { result_wave: { executor: 'per-vu-iterations', vus, iterations: 1, maxDuration: '2m', gracefulStop: '10s' } },
  thresholds: { http_req_failed: ['rate<0.001'], http_req_duration: ['p(95)<1000', 'p(99)<2000'], checks: ['rate>0.999'] },
  discardResponseBodies: false,
};
export default function () {
  const session = sessions[exec.vu.idInTest - 1];
  if (!session?.cookie || !session?.examId || !session?.expectedExamId) throw new Error('Invalid synthetic session fixture');
  const params = { headers: { Cookie: session.cookie }, redirects: 0, timeout: '10s' };
  const list = http.get(`${base}/api/public/results/student`, { ...params, tags: { name: 'result-list' } });
  check(list, { 'authorized expected result': r => {
    if (r.status !== 200) return false;
    try { const body = r.json(); return body.ok === true && Array.isArray(body.exams) && body.exams.some(e => e.exam_id === session.expectedExamId); } catch { return false; }
  } });
  const detail = http.get(`${base}/api/public/results/exams/${encodeURIComponent(session.examId)}`, { ...params, tags: { name: 'result-detail' } });
  check(detail, { 'authorized detail succeeds': r => { try { return r.status === 200 && r.json().ok === true; } catch { return false; } } });
}
