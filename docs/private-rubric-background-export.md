# Private queued rubric CSV export

Status: implementation added, NOT tested/typechecked/built/migrated or deployed. Feature remains OFF by default. This implements large individual rubric-history exports; institution-wide cohort background aggregation is still pending and the interactive cohort caps remain.

## Flow

- Authenticated GET `/api/private-rubric-exports` checks capability and lists the actor's latest matching active jobs, enabling resume after leaving the page. When disabled, it reports enabled:false without querying the new tables.
- Authenticated POST on that path validates student/view/enrollment/institution scope via the existing reader before persisting. `confirmedExport:true` and an actor-scoped requestId are required; identical selection retries return the original job, conflicting selection returns 409. A conditional INSERT allows at most three unexpired QUEUED/RUNNING jobs and 20 new jobs per actor per rolling 24 hours. Idempotent replays do not consume another job.
- One dedicated queue message reads at most one 200-observation page. CSV includes frozen criterion/level/source and evidence/feedback/next step. Formula/control prefixes are neutralized; UTF-8 BOM, semicolon and quote/newline escaping are applied. Each part contains its own header and is an independent CSV.
- A two-minute claim token fences writes. A unique private object key is written before a transactional parts/progress batch. Both statements use the same lease, expected part number and fixed commit timestamp witness. Lost claims discard the unreferenced object; published progress cannot count the same page twice. Failed sends/retries are recovered from durable job state by scheduled dispatch; ordinary queue deliveries and the existing scheduler are forwarded unchanged.
- Current active user role/institution/student binding is reloaded before every step. Read scope is rechecked through the existing authorized reader, including current parent links and teacher assignments. Revoked scope ends the job.
- GET `/api/private-rubric-exports/:id` returns owner-only status and up to 50 part entries; cursor lists subsequent parts. Download is GET `/:id/parts/:partNo/download`. No object key, public link or signed URL is exposed.
- Each download checks current actor context and selection, then authorizes every observation ID in that part in <=50-ID DB chunks. Withdrawn observations or lost branch/class/parent authority prevent serving a cached part; the user must regenerate. Only READY jobs can download. R2 response is private/no-store attachment.

Parts avoid the 5000-observation browser-export cap, but are not a single consolidated CSV. Institution-wide weighted cohort exports are not provided by this worker. Pagination is live visibility, not a globally locked point-in-time snapshot. A scope/withdrawal change can revoke a previously ready part.

## Cloudflare provisioning before activation

No resource creation or provider call was made for this change. Staging provisioning is already pending its earlier permission issue.

1. Apply migrations through 0082 in staging, including prerequisite observation tables.
2. Create a dedicated private R2 bucket with no public/custom-domain access. Bind `REPORT_EXPORT_FILES`; do not reuse public content storage. Set a lifecycle rule on `report-exports/` deleting objects after two days as a crash/backlog cleanup backstop.
3. Create `anunex-rubric-exports-staging` and a dedicated DLQ. Bind producer `REPORT_EXPORT_QUEUE`, set `REPORT_EXPORT_QUEUE_NAME=anunex-rubric-exports-staging`, and attach the source queue consumer to the staging app worker. Do not attach the DLQ as the same consumer or reuse exam/result queues. Consumer names are restricted to `anunex-rubric-exports-staging` / `anunex-rubric-exports-production` to avoid intercepting existing queue traffic.
4. Keep REPORT_EXPORTS_ENABLED=false until real provider/role/retention acceptance passes; enable only for the authorized staging pilot. Production provisioning uses its own queue and private bucket, after acceptance.

The outer wrappers are installed in production/staging entry points. Existing cron dispatches up to 10 pending/stale jobs per invocation, in addition to message-driven progression, and retries cleanup for up to two expired jobs (five objects per job). Expiration is 24 hours from request creation, not completion. Access is denied at expiry immediately; physical object cleanup is scheduled and can lag. Cleanup removes object-prefix contents (including orphans), part metadata and stored selection/scope metadata. The private bucket lifecycle is required as a crash/backlog backstop. Cleanup runs when the bucket binding is present even if feature dispatch is disabled.

## Deferred checks

Run native migrations, typecheck/build, then request ID/cap, worker entry forwarding, queue producer/consumer/DLQ, claim-token races, duplicate messages, R2/DB/send failure boundaries, scope revocation/withdrawal before serving, expired-job cleanup/orphan lifecycle, CSV formula escaping, resuming saved jobs and part-list pagination. Inspect no private fields in logs/public responses. Real provider/load acceptance and Cloudflare resources are NOT verified.
