import { describe, expect, it } from 'vitest';
import { evaluatedExam, TITLE } from './helpers/exam-flow';
import { publishScheduledExamResults } from '../worker/lib/exam-schedule';

/**
 * A030: results reach students and parents only after publication — now, or at the scheduled time —
 * and what they see is the frozen version. Every screen of the student and parent app is probed through
 * the production entry chain at each stage.
 */
const STUDENT_PATHS = (examId: string) => [
  '/api/dashboard', '/api/student-standard/home-context', '/api/platform/exam-center/results', `/api/platform/exam-center/${examId}/result`,
  '/api/reporting/students/s1/combined', `/api/reporting/students/s1/frozen-exams?examIds=${examId}`, '/api/my-results', '/api/my-outcomes', `/api/my-wrong-answers?examId=${examId}`, '/api/my-wrong-answers',
  '/api/platform/assessment-feed', '/api/platform/learning-state', '/api/platform/rba', '/api/platform/recovery', '/api/notifications', '/api/student-intelligence/s1', '/api/academic-growth/students/s1',
];
const PARENT_PATHS = (examId: string) => [
  '/api/dashboard', '/api/parent/weekly-summary?studentId=s1', '/api/my-results?studentId=s1', '/api/my-outcomes?studentId=s1', `/api/platform/exam-center/${examId}/result?studentId=s1`,
  '/api/platform/exam-center/results?studentId=s1', '/api/reporting/students/s1/combined', '/api/notifications', '/api/student-intelligence/s1',
];
/** What would give the result away: the exam (title/id), a net or an outcome of this exam. */
const leaks = (text: string, examId: string) => [TITLE, examId, 'T.8.1.1', 'M.8.1.1', 'Metnin ana fikrini', 'Üslü ifadeler'].filter((m) => text.includes(m));

async function probe(t: Awaited<ReturnType<typeof evaluatedExam>>) {
  const out: Array<{ as: string; path: string; status: number; leaked: string[] }> = [];
  for (const [as, paths] of [['stuuser', STUDENT_PATHS(t.examId)], ['parent', PARENT_PATHS(t.examId)]] as const) {
    for (const path of paths) { const r = await t.request(path, 'GET', undefined, as); out.push({ as, path, status: r.response.status, leaked: leaks(r.text, t.examId) }); }
  }
  return out;
}

describe('A030: app result publication', () => {
  it('before publication (evaluated, frozen, or scheduled for later) no student or parent screen shows the result', async () => {
    const t = await evaluatedExam('direct', { outcomes: true });
    try {
      const stage = async (name: string) => { const leaked = (await probe(t)).filter((p) => p.leaked.length); expect(leaked, `${name}: ${JSON.stringify(leaked)}`).toEqual([]); };
      await stage('evaluated');
      const frozen = await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST');
      expect(frozen.response.status, frozen.text).toBe(200);
      await stage('frozen');
      const later = new Date(Date.now() + 3 * 86400_000).toISOString();
      const sched = await t.request(`/api/platform/exam-center/${t.examId}/schedule`, 'PUT', { resultPublishAt: later });
      expect(sched.response.status, sched.text).toBe(200);
      expect(await publishScheduledExamResults(t.env)).toBe(0);
      await stage('scheduled');
    } finally { t.db.close(); }
  }, 60000);

  it('publish now: the student and the parent see the frozen result; a later re-evaluation does not change it until republished', async () => {
    const t = await evaluatedExam('direct', { outcomes: true });
    try {
      expect((await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST')).response.status).toBe(200);
      const pub = await t.request(`/api/platform/exam-center/${t.examId}/publish`, 'POST');
      expect(pub.response.status, pub.text).toBe(200);
      const list = await t.request('/api/platform/exam-center/results', 'GET', undefined, 'stuuser');
      expect(list.response.status, list.text).toBe(200);
      expect(list.data.results.map((r: any) => r.exam_id ?? r.id)).toContain(t.examId);
      const one = await t.request(`/api/platform/exam-center/${t.examId}/result`, 'GET', undefined, 'stuuser');
      expect(one.response.status, one.text).toBe(200);
      expect(one.text).toContain(TITLE);
      const parent = await t.request(`/api/platform/exam-center/${t.examId}/result?studentId=s1`, 'GET', undefined, 'parent');
      expect(parent.response.status, parent.text).toBe(200);
      const combined = await t.request('/api/reporting/students/s1/combined', 'GET', undefined, 'stuuser');
      expect(combined.data.exams.map((e: any) => e.exam_id)).toEqual([t.examId]);
      const frozenNet = combined.data.exams[0].net;
      expect(combined.data.outcomes.map((o: any) => o.code).sort()).toEqual(['M.8.1.1', 'T.8.1.1']);
      // The live result changes (e.g. a correction) but the published version stays until it is frozen and published again.
      t.db.prepare(`UPDATE exam_results SET net=net+5 WHERE participant_id IN (SELECT id FROM exam_participants WHERE student_id='s1')`).run();
      const again = await t.request('/api/reporting/students/s1/combined', 'GET', undefined, 'stuuser');
      expect(again.data.exams[0].net).toBe(frozenNet);
    } finally { t.db.close(); }
  }, 60000);

  it('publish later: nothing before the time, the scheduled run publishes, then it is visible', async () => {
    const t = await evaluatedExam('direct');
    try {
      expect((await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST')).response.status).toBe(200);
      const soon = new Date(Date.now() + 60_000).toISOString();
      expect((await t.request(`/api/platform/exam-center/${t.examId}/schedule`, 'PUT', { resultPublishAt: soon })).response.status).toBe(200);
      expect(await publishScheduledExamResults(t.env)).toBe(0);
      expect((await t.request(`/api/platform/exam-center/${t.examId}/result`, 'GET', undefined, 'stuuser')).response.status).toBe(404);
      // time passes
      t.db.prepare(`UPDATE exam_delivery_profiles SET result_publish_at=? WHERE exam_id=?`).run(new Date(Date.now() - 1000).toISOString(), t.examId);
      expect(await publishScheduledExamResults(t.env)).toBe(1);
      const one = await t.request(`/api/platform/exam-center/${t.examId}/result`, 'GET', undefined, 'stuuser');
      expect(one.response.status, one.text).toBe(200);
      expect((t.db.prepare(`SELECT action FROM audit_logs WHERE entity_id=? AND action LIKE 'EXAM_RESULTS_%' ORDER BY rowid`).all(t.examId) as any[]).map((r) => r.action)).toEqual(['EXAM_RESULTS_FROZEN', 'EXAM_RESULTS_AUTO_PUBLISHED']);
    } finally { t.db.close(); }
  }, 60000);
});

describe('A030: sweep of every API path the app calls', () => {
  it('no GET path of the app shows an unpublished result to a student or a parent, even with every optional feature on', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const files: string[] = [];
    const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(tsx?)$/.test(f)) files.push(p); } };
    walk(new URL('../src', import.meta.url).pathname);
    const raw = new Set<string>();
    for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/\/api\/[A-Za-z0-9/_\-]+(?:\$\{[^}]+\}[A-Za-z0-9/_\-]*)*/g)) { raw.add(m[0].replace(/\$\{[^}]+\}/g, ':id').replace(/:id$/, '')); raw.add(m[0].split('${')[0]); }
    expect(raw.size).toBeGreaterThan(200);
    const t = await evaluatedExam('direct', { outcomes: true });
    try {
      t.db.exec(`UPDATE platform_features SET enabled_default=1`);
      const paths = new Set<string>();
      for (const p of raw) if (p.includes(':id')) { paths.add(p.replace(/:id/g, 's1')); paths.add(p.replace(/:id/g, t.examId)); } else paths.add(p);
      const found: string[] = [];
      for (const as of ['stuuser', 'parent']) for (const p of paths) {
        const r = await t.request(`${p}?studentId=s1&examId=${t.examId}&examIds=${t.examId}`, 'GET', undefined, as);
        // The curriculum itself is public: an outcome only counts as leaked together with performance on it.
        const outcomePerformance = /o_(tur|mat)1/.test(r.text) && /(evidence_count|correct_count|success_rate|mastery)/.test(r.text);
        const hit = [TITLE, t.examId, '4.6667', '333.34'].filter((m) => r.text.includes(m)).concat(outcomePerformance ? ['outcome performance'] : []);
        if (hit.length) found.push(`${as} ${p}: ${hit.join(', ')}`);
      }
      expect(found).toEqual([]);
    } finally { t.db.close(); }
  }, 120000);
});
