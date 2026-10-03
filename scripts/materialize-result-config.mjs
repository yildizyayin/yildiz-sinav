import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function materializeResultConfig(template, env) {
  const config = structuredClone(template);
  if (!env.DATABASE_ID || !env.DATABASE_NAME || !env.BUCKET_NAME) throw new Error('Canonical DB and FILES bindings are required');
  config.d1_databases[0].database_id = env.DATABASE_ID;
  config.d1_databases[0].database_name = env.DATABASE_NAME;
  config.r2_buckets[0].bucket_name = env.BUCKET_NAME;
  const names = [env.RESULT_PRIVATE_BUCKET, env.RESULT_ARTIFACT_QUEUE_NAME, env.RESULT_ARTIFACT_DLQ_NAME, env.RESULT_RETENTION_QUEUE_NAME, env.RESULT_RETENTION_DLQ_NAME].map(value => String(value || '').trim());
  if (!names.some(Boolean)) return config;
  if (!names.every(Boolean)) throw new Error('All five result resource names must be configured together');
  if (names.some(name => !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name))) throw new Error('Invalid result resource name');
  if (names[0] === env.BUCKET_NAME || new Set(names.slice(1)).size !== 4) throw new Error('Private bucket and queue resources must be isolated');
  const [bucket, artifact, artifactDlq, retention, retentionDlq] = names;
  config.r2_buckets.push({ binding: 'RESULT_FILES', bucket_name: bucket });
  config.queues = {
    producers: [{ binding: 'RESULT_ARTIFACT_QUEUE', queue: artifact }, { binding: 'RESULT_RETENTION_QUEUE', queue: retention }],
    consumers: [[artifact, artifactDlq], [retention, retentionDlq]].map(([queue, dlq]) => ({ queue, dead_letter_queue: dlq, max_batch_size: 5, max_batch_timeout: 5, max_retries: 5, max_concurrency: 5 })),
  };
  config.vars = { ...config.vars, RESULT_ARTIFACT_QUEUE_NAME: artifact, RESULT_RETENTION_QUEUE_NAME: retention };
  // Resource bindings alone do not authorize producer, reader or cleanup rollout.
  for (const flag of ['RESULT_ARTIFACTS_ENABLED', 'RESULT_ARTIFACT_READS_ENABLED', 'RESULT_ARTIFACT_CLEANUP_ENABLED', 'RESULT_RETENTION_QUEUE_ENABLED', 'RESULT_ARTIFACT_BACKGROUND_ENABLED', 'RESULT_ARTIFACT_VERIFICATION_ENABLED', 'RESULT_ARTIFACT_QUEUE_ENABLED']) config.vars[flag] = 'false';
  return config;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: materialize-result-config.mjs INPUT OUTPUT');
  writeFileSync(output, JSON.stringify(materializeResultConfig(JSON.parse(readFileSync(input, 'utf8')), process.env), null, 2) + '\n');
}
