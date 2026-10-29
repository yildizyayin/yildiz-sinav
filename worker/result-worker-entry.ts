import { scheduledJobsPaused } from './lib/scheduled-pause';
import {dispatchResultArtifactQueue,consumeResultArtifactQueue} from './lib/result-artifact-queue';
import {advanceResultArtifactVerification} from './lib/result-artifact-verification';
import {advanceResultArtifactPreparation} from './lib/result-artifact-preparation';
import { sweepRetiredResultArtifacts } from './lib/result-artifact-retention';
import {consumeResultRetentionQueue,dispatchResultRetentionQueue} from './lib/result-retention-queue';
import app from './privacy-export-entry';
import type { Env } from './types';
import { withErrorBoundary } from './lib/error-boundary';
import { json } from './lib/db';
import { handleResultGovernanceMutation, handleResultOperations, purgeExpiredResultNetwork, purgeResultNetworkAdministrationPage, emitResultRetentionNotices } from './result-network-entry';

/**
 * Dedicated production boundary for sonuc.anunex.com.
 *
 * The result product shares the canonical exam catalogue and identity store with
 * ANUNEX, but it must not expose the licensed application's complete API surface.
 */
export function resultApiPathAllowed(pathname: string): boolean {
  if (pathname === '/api/health') return true;
  if (pathname === '/api/auth/login' || pathname === '/api/auth/me' || pathname === '/api/auth/logout') return true;
  // S036: operators change their own password from Profil (authenticated, own account only).
  if (pathname === '/api/auth/change-password') return true;
  if (pathname === '/api/exam-definitions') return true;
  if (pathname === '/api/admin/institution-directory/import') return true;
  if (pathname.startsWith('/api/public/results/')) return true;
  if (pathname.startsWith('/api/admin/result-network/')) return true;
  return false;
}

function unavailable(): Response {
  return json({
    ok: false,
    error: {
      code: 'RESULT_NETWORK_ROUTE_NOT_AVAILABLE',
      message: 'Bu işlem ANUNEX Sonuç Ağı üzerinde kullanılamaz.',
    },
  }, 404, {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return withErrorBoundary(request, async () => {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') && !resultApiPathAllowed(url.pathname)) return unavailable();
    const operation = await handleResultOperations(request, env);
    if (operation) return operation;
    const governanceMutation = await handleResultGovernanceMutation(request, env);
    if (governanceMutation) return governanceMutation;
    return app.fetch(request, env, ctx);
    });
  },
  async queue(batch:MessageBatch,env:Env){
    const artifactName=env.RESULT_ARTIFACT_QUEUE_NAME||'anunex-result-artifacts',retentionName=env.RESULT_RETENTION_QUEUE_NAME||'anunex-result-retention';
    if(artifactName===retentionName)throw Error('RESULT_QUEUE_ROUTE_CONFLICT');
    if(batch.queue===artifactName)await consumeResultArtifactQueue(batch,env);
    else if(batch.queue===retentionName)await consumeResultRetentionQueue(batch,env,purgeResultNetworkAdministrationPage);
    else for(const message of batch.messages)message.retry({delaySeconds:300});
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    // D1 budget: paused before any database read while SCHEDULED_JOBS_PAUSED is "true".
    if (scheduledJobsPaused(env)) { console.log(JSON.stringify({ event: 'scheduled_jobs_paused', worker: 'result' })); return; }
    ctx.waitUntil((async()=>{if(env.RESULT_ARTIFACT_QUEUE_ENABLED==='true')await dispatchResultArtifactQueue(env);else{await advanceResultArtifactPreparation(env);await advanceResultArtifactVerification(env)}})());
    ctx.waitUntil((async()=>{const{purgeExpiredOriginals}=await import('./lib/result-data-center');await purgeExpiredOriginals(env)})().catch((error)=>console.error('Original upload purge failed',error)));
    // D-S039: a deleted upload is restorable for 7 days, then purged.
    ctx.waitUntil((async()=>{const{purgeDeletedBatches}=await import('./lib/batch-lifecycle');await purgeDeletedBatches(env)})().catch((error)=>console.error('Deleted upload purge failed',error)));
    ctx.waitUntil((async()=>{const{pruneOldSnapshotVersions}=await import('./lib/snapshot-prune');await pruneOldSnapshotVersions(env)})().catch((error)=>console.error('Snapshot prune failed',error)));
    // D-S037: live ranks — a published exam that gained students since its last snapshot is written again.
    ctx.waitUntil((async()=>{const{refreshLivePublications}=await import('./result-network-entry');await refreshLivePublications(env)})().catch((error)=>console.error('Live rank refresh failed',error)));
    ctx.waitUntil(env.RESULT_RETENTION_QUEUE_ENABLED==='true'?(async()=>{await emitResultRetentionNotices(env);await dispatchResultRetentionQueue(env)})():(async()=>{await sweepRetiredResultArtifacts(env);await purgeExpiredResultNetwork(env)})());
  },
} satisfies ExportedHandler<Env>;
