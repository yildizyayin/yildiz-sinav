/**
 * D1 budget (22 Oct 2026): the free plan allows 5M row reads a day for the whole Cloudflare account. Three
 * workers (app production, result network, app staging) ran every scheduled job every 15 minutes, and the
 * question agents generated around the clock, before the system is even live. Until launch every scheduled
 * job is paused with SCHEDULED_JOBS_PAUSED="true"; a paused run returns before touching the database.
 * Set it to "false" (wrangler vars) to run the jobs again.
 */
export function scheduledJobsPaused(env: unknown): boolean {
  return String((env as { SCHEDULED_JOBS_PAUSED?: string } | null)?.SCHEDULED_JOBS_PAUSED || '').toLowerCase() === 'true';
}
