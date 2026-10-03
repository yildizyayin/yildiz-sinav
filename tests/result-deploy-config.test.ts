import { describe, it, expect } from 'vitest';
import { materializeResultConfig } from '../scripts/materialize-result-config.mjs';
const template = { d1_databases: [{ binding: 'DB' }], r2_buckets: [{ binding: 'FILES' }], vars: { ENVIRONMENT: 'production' } };
const core = { DATABASE_ID: 'id', DATABASE_NAME: 'db', BUCKET_NAME: 'content-bucket' };
const resources = { RESULT_PRIVATE_BUCKET: 'private-results', RESULT_ARTIFACT_QUEUE_NAME: 'artifacts', RESULT_ARTIFACT_DLQ_NAME: 'artifacts-dlq', RESULT_RETENTION_QUEUE_NAME: 'retention', RESULT_RETENTION_DLQ_NAME: 'retention-dlq' };
describe('Result deployment binding isolation', () => {
  it('preserves the core deployment when optional resources are absent', () => {
    const config = materializeResultConfig(template, core);
    expect(config.r2_buckets).toEqual([{ binding: 'FILES', bucket_name: 'content-bucket' }]);
    expect(config.queues).toBeUndefined();
    expect(template.r2_buckets[0].bucket_name).toBeUndefined();
  });
  it('binds both queues and private storage while keeping rollout disabled', () => {
    const config = materializeResultConfig(template, { ...core, ...resources });
    expect(config.r2_buckets[1]).toEqual({ binding: 'RESULT_FILES', bucket_name: 'private-results' });
    expect(config.queues.consumers.map(q => [q.queue, q.dead_letter_queue])).toEqual([['artifacts', 'artifacts-dlq'], ['retention', 'retention-dlq']]);
    expect(config.vars.RESULT_ARTIFACT_QUEUE_NAME).toBe('artifacts');
    expect(Object.entries(config.vars).filter(([key]) => key.endsWith('_ENABLED')).every(([, value]) => value === 'false')).toBe(true);
  });
  it('rejects partial settings, shared storage and conflicting queues before deployment', () => {
    expect(() => materializeResultConfig(template, { ...core, RESULT_PRIVATE_BUCKET: 'private-results' })).toThrow();
    expect(() => materializeResultConfig(template, { ...core, ...resources, RESULT_PRIVATE_BUCKET: core.BUCKET_NAME })).toThrow();
    expect(() => materializeResultConfig(template, { ...core, ...resources, RESULT_RETENTION_DLQ_NAME: 'artifacts' })).toThrow();
    expect(() => materializeResultConfig(template, { ...core, ...resources, RESULT_PRIVATE_BUCKET: '../content' })).toThrow();
  });
});
