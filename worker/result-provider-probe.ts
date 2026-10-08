import { storeResultArtifact } from './lib/result-artifacts';

type ProbeEnv = {
  RESULT_FILES: R2Bucket;
  RESULT_ARTIFACT_QUEUE: Queue;
  RESULT_RETENTION_QUEUE: Queue;
  RESULT_ARTIFACT_QUEUE_NAME: string;
  RESULT_RETENTION_QUEUE_NAME: string;
  PROBE_TOKEN: string;
};
const prefix = (id: string) => `provider-probes/${id}/`;
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Deploy only against dedicated disposable resources. No DB, real student data,
// production flags or result routes are included in this provider-only probe.
export default {
  async fetch(request: Request, env: ProbeEnv) {
    if (!env.PROBE_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.PROBE_TOKEN}`) return reply({ ok: false }, 403);
    const url = new URL(request.url);
    if (url.pathname === '/start' && request.method === 'POST') {
      const id = crypto.randomUUID();
      const body = JSON.stringify({ schemaVersion: 1, syntheticProbeId: id });
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))), b => b.toString(16).padStart(2, '0')).join('');
      const artifact = { key: `${prefix(id)}immutable.json`, body, digest };
      await storeResultArtifact(env.RESULT_FILES, artifact);
      await storeResultArtifact(env.RESULT_FILES, artifact);
      let conflictRejected = false;
      try { await storeResultArtifact(env.RESULT_FILES, { ...artifact, body: 'different synthetic bytes' }); }
      catch (error) { conflictRejected = error instanceof Error && error.message === 'RESULT_ARTIFACT_CONTENT_CONFLICT'; }
      const unchanged = await (await env.RESULT_FILES.get(artifact.key))?.text() === body;
      if (!conflictRejected || !unchanged) return reply({ ok: false, code: 'R2_CONDITIONAL_WRITE_FAILED' }, 503);
      await env.RESULT_ARTIFACT_QUEUE.send({ probeId: id, kind: 'ARTIFACT' });
      await env.RESULT_RETENTION_QUEUE.send({ probeId: id, kind: 'RETENTION' });
      return reply({ ok: true, probeId: id, conditionalWritePassed: true }, 202);
    }
    if (url.pathname === '/status' && request.method === 'GET') {
      const id = url.searchParams.get('probeId');
      if (!validId(id)) return reply({ ok: false }, 400);
      const [artifact, retention] = await Promise.all(['ARTIFACT', 'RETENTION'].map(kind => env.RESULT_FILES.head(`${prefix(id)}${kind}.json`)));
      return reply({ ok: true, artifactConsumed: !!artifact, retentionConsumed: !!retention, complete: !!artifact && !!retention });
    }
    return reply({ ok: false }, 404);
  },
  async queue(batch: MessageBatch<{ probeId: string; kind: string }>, env: ProbeEnv) {
    const kind = batch.queue === env.RESULT_ARTIFACT_QUEUE_NAME ? 'ARTIFACT' : batch.queue === env.RESULT_RETENTION_QUEUE_NAME ? 'RETENTION' : null;
    if (!kind) { batch.retryAll({ delaySeconds: 30 }); return; }
    for (const message of batch.messages) {
      if (!validId(message.body?.probeId) || message.body?.kind !== kind) { message.ack(); continue; }
      try {
        await env.RESULT_FILES.put(`${prefix(message.body.probeId)}${kind}.json`, JSON.stringify({ synthetic: true, kind }), { onlyIf: new Headers({ 'If-None-Match': '*' }) });
        message.ack();
      } catch { message.retry({ delaySeconds: 30 }); }
    }
  },
};
