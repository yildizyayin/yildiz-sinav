import { describe, expect, it } from 'vitest';
import probe from '../worker/result-provider-probe';

describe('isolated provider probe', () => {
  it('rejects requests without a secret before touching resources', async () => {
    const response = await probe.fetch(new Request('https://example.test/start', { method: 'POST' }), {} as any);
    expect(response.status).toBe(403);
  });
  it('confirms conditional writes and independent queues with synthetic data', async () => {
    const objects = new Map<string, string>();
    const sent: any[] = [];
    const env: any = {
      PROBE_TOKEN: 'synthetic-test-token', RESULT_ARTIFACT_QUEUE_NAME: 'artifact', RESULT_RETENTION_QUEUE_NAME: 'retention',
      RESULT_FILES: {
        async put(key: string, body: string) { if (objects.has(key)) return null; objects.set(key, body); return {}; },
        async get(key: string) { return objects.has(key) ? { text: async () => objects.get(key) } : null; },
        async head(key: string) { return objects.has(key) ? {} : null; },
      },
      RESULT_ARTIFACT_QUEUE: { send: async (body: any) => sent.push(['artifact', body]) },
      RESULT_RETENTION_QUEUE: { send: async (body: any) => sent.push(['retention', body]) },
    };
    const response = await probe.fetch(new Request('https://example.test/start', { method: 'POST', headers: { Authorization: 'Bearer synthetic-test-token' } }), env);
    expect(response.status).toBe(202);
    const start: any = await response.json();
    expect(start.conditionalWritePassed).toBe(true);
    expect(objects.size).toBe(1);
    for (const [queue, body] of sent) {
      let acknowledged = false;
      await probe.queue({ queue, messages: [{ body, ack() { acknowledged = true; }, retry() { throw Error('unexpected retry'); } }] } as any, env);
      expect(acknowledged).toBe(true);
    }
    const status = await probe.fetch(new Request(`https://example.test/status?probeId=${start.probeId}`, { headers: { Authorization: 'Bearer synthetic-test-token' } }), env);
    expect(await status.json()).toMatchObject({ complete: true, artifactConsumed: true, retentionConsumed: true });
    let retry = false;
    await probe.queue({ queue: 'unknown', retryAll() { retry = true; } } as any, env);
    expect(retry).toBe(true);
  });
});
