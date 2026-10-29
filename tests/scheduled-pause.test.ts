import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import prod from '../worker/preview-policy-production-entry';
import staging from '../worker/preview-policy-staging-entry';
import result from '../worker/result-worker-entry';

/** D1 budget: with SCHEDULED_JOBS_PAUSED="true" no scheduled job touches the database. */
const counting = () => { let calls = 0; const stmt: any = { bind: () => stmt, first: async () => null, all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 0 } }), raw: async () => [] }; return { get calls() { return calls; }, DB: { prepare: () => { calls++; return stmt; }, batch: async () => { calls++; return []; } } }; };
async function run(worker: any, paused: string | undefined) {
  const db = counting(); const waits: Promise<unknown>[] = [];
  const env: any = { DB: db.DB, ENVIRONMENT: 'production', ...(paused === undefined ? {} : { SCHEDULED_JOBS_PAUSED: paused }) };
  try { await worker.scheduled({ cron: '*/15 * * * *', scheduledTime: Date.now() }, env, { waitUntil: (p: Promise<unknown>) => waits.push(p.catch(() => undefined)), passThroughOnException() {} }); } catch { /* jobs may fail on the stub; only the reads count */ }
  await Promise.all(waits);
  return db.calls;
}

describe('scheduled jobs pause (D1 budget)', () => {
  for (const [name, worker] of [['app production', prod], ['app staging', staging], ['result network', result]] as const) {
    it(`${name}: paused runs read nothing; unpaused runs do read`, async () => {
      expect(await run(worker, 'true')).toBe(0);
      expect(await run(worker, 'false')).toBeGreaterThan(0);
    });
  }
  // S041 (owner, 29 Oct): Cloudflare is on the paid plan; production runs its scheduled jobs again. Staging stays paused,
  // and the question agents stay off in production until their own launch decision.
  it('production runs scheduled jobs, staging stays paused, question agents stay off', () => {
    for (const f of ['wrangler.production.jsonc', 'wrangler.result.production.jsonc']) expect(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), f).toContain('"SCHEDULED_JOBS_PAUSED": "false"');
    expect(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')).toContain('"SCHEDULED_JOBS_PAUSED": "true"');
    const p = readFileSync(new URL('../wrangler.production.jsonc', import.meta.url), 'utf8');
    for (const k of ['QUESTION_AGENT_EXECUTION_ENABLED', 'QUESTION_GENERATION_ENABLED', 'QUESTION_VIDEO_RENDER_ENABLED']) expect(p).toContain(`"${k}": "false"`);
  });
});
