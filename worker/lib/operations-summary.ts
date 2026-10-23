/**
 * A077: one Super Admin summary of what is running, waiting and failing — scheduled jobs paused or not,
 * background report jobs, import/scan work waiting for a person, and failed notification deliveries. Every
 * figure is a count from the source table (indexed status columns, bounded), never a cached guess.
 */
import type { AuthUser, Env } from '../types';
import { json, one } from './db';
import { scheduledJobsPaused } from './scheduled-pause';

const count = async (env: Env, sql: string) => Number((await one<{ c: number }>(env.DB.prepare(sql)).catch(() => null))?.c ?? -1);

export async function handleOperationsSummary(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/admin/operations-summary') return null;
  const { getAuthUser } = await import('./auth');
  const user: AuthUser | null = await getAuthUser(env, request);
  if (!user) return json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Oturum açmanız gerekiyor.' } }, 401);
  if (user.role !== 'SUPER_ADMIN') return json({ ok: false, error: { code: 'FORBIDDEN', message: 'Operasyon özetini yalnız Süper Admin görür.' } }, 403);
  if (request.method !== 'GET') return json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Bu yöntem desteklenmiyor.' } }, 405);
  const [rubricQueued, rubricFailed, cohortQueued, cohortFailed, importsWaiting, importsFailed, scansWaiting, deliveriesFailed, announcementsStuck] = await Promise.all([
    count(env, `SELECT count(*) c FROM private_rubric_export_jobs WHERE status IN ('QUEUED','RUNNING')`),
    count(env, `SELECT count(*) c FROM private_rubric_export_jobs WHERE status='FAILED' OR error_code='EXPORT_RETRY'`),
    count(env, `SELECT count(*) c FROM private_cohort_report_jobs WHERE status IN ('QUEUED','RUNNING')`),
    count(env, `SELECT count(*) c FROM private_cohort_report_jobs WHERE status='FAILED'`),
    count(env, `SELECT count(*) c FROM import_jobs WHERE status='NEEDS_REVIEW'`),
    count(env, `SELECT count(*) c FROM import_jobs WHERE status='FAILED'`),
    count(env, `SELECT count(*) c FROM scan_batches WHERE status IN ('PREVIEW','NEEDS_REVIEW','READY')`),
    count(env, `SELECT count(*) c FROM announcement_deliveries WHERE status='FAILED'`),
    count(env, `SELECT count(*) c FROM announcements WHERE status='SENDING' AND datetime(updated_at)<datetime('now','-15 minutes')`),
  ]);
  const problems: string[] = [];
  if (rubricFailed > 0 || cohortFailed > 0) problems.push('Başarısız arka plan raporu var.');
  if (importsFailed > 0) problems.push('Başarısız veri aktarımı var.');
  if (deliveriesFailed > 0) problems.push('Gönderilemeyen bildirim var.');
  if (announcementsStuck > 0) problems.push('15 dakikadan uzun süredir gönderimde kalan duyuru var.');
  if ([rubricQueued, rubricFailed, cohortQueued, cohortFailed, importsWaiting, importsFailed, scansWaiting, deliveriesFailed, announcementsStuck].some((x) => x < 0)) problems.push('Bazı sayılar okunamadı (-1).');
  return json({ ok: true, generatedAt: new Date().toISOString(), environment: env.ENVIRONMENT || 'unknown',
    scheduledJobs: { paused: scheduledJobsPaused(env) },
    backgroundReports: { rubricExports: { waiting: rubricQueued, failed: rubricFailed }, cohortReports: { waiting: cohortQueued, failed: cohortFailed } },
    waitingForPeople: { importsNeedingReview: importsWaiting, opticalBatchesNotCommitted: scansWaiting },
    failures: { imports: importsFailed, notificationDeliveries: deliveriesFailed, announcementsStuckSending: announcementsStuck },
    problems, status: problems.length ? 'ATTENTION' : 'OK' });
}
