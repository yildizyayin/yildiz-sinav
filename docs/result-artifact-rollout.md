# Prepared result artifacts: gated rollout

Status: code foundation only. No production binding, enabled rollout, enabled reader rollout, cache, or measured 10k/1m capacity yet.

The SuperAdmin POST /api/admin/result-network/administrations/:id/prepare-artifacts accepts expectedSnapshotVersion and an optional participant cursor. Each request preflights up to 50 published snapshot records, prepares deterministic artifacts in RESULT_FILES, then commits the manifest page and audit under the exam operation lock with write fencing. A retry never overwrites different stored bytes. The response exposes counts and a continuation cursor, not bucket URLs. Partial R2 success followed by manifest failure leaves unreferenced objects; retries are safe but cleanup is required.

RESULT_ARTIFACTS_ENABLED, RESULT_ARTIFACT_CLEANUP_ENABLED and RESULT_RETENTION_QUEUE_ENABLED must all equal true; RESULT_RETENTION_QUEUE and the dedicated private RESULT_FILES binding must exist. The shared content FILES bucket is never used. These settings are intentionally not configured in Wrangler. Binding existence does not prove privacy; disable R2 public access and validate account permissions before enabling. The preparer currently runs after publication; only the optional authorized detail reader consumes its files.

## Required next steps

1. Provision and validate private bucket isolation in a test environment. No anonymous read or generated public URL.
2. Validate the implemented reader that checks the live session, peer identity expiry, current published administration and exact version before reading any private artifact. Verify stored digest and institution/participant/version scope. Withdrawal, session revocation and expired identity must deny access even when artifacts/cache exist.
3. Validate the implemented version retirement and orphan cleanup against real R2, including backlog drainage. Manifest cascades alone do not delete R2 objects. Do not enable the feature until deletion tests pass; preserve historical versions only within permitted retention.
4. Integrate a bounded background producer and an all-participants completeness gate before switching readership. Missing artifacts use only the authorized frozen snapshot, never mutable results. Handle retry/withdrawal/owner loss and partial object creation explicitly.
5. Optimize list summaries and session/authorization separately. Moving detailed payload bytes out of D1 does not remove session queries or guarantee first-read/cache-hit performance for a million distinct students.
6. Measure private R2 reads, regional cold/warm cache, lookup/verification bursts, D1 query duration and observed origin traffic. Run the existing staged 10k/1m acceptance scenarios with separate identities and correctness oracles.

The previous capacity plan's live-reader findings are historical: student and published institution data now use the channel's immutable snapshot; mutable AI-tip queries were removed. Session D1 checks remain on every request. Both CI and PR Preview succeeded at c96d87dff8d4ec394138af14817c74c462565dfd; earlier provisioning failures must not be treated as a current blocker without rechecking.

## Authorized detail reader (2026-10-02)
RESULT_ARTIFACT_READS_ENABLED=true plus RESULT_FILES enables the detail path only. It first resolves the live session, then executes the same institution/name/grade/nonempty-lookup-token/expiry/publication/version predicates as the immutable snapshot reader. The authorization query selects manifest key/hash and scope metadata, without selecting the large report payload. The R2 object key must exactly match the administration/version/participant/hash namespace; raw bytes must match SHA-256 and the envelope must match institution, exam, participant and publication version. No public URL is returned.

A missing artifact falls back to a fresh authorized immutable snapshot query. Corrupt or foreign-scope content returns 503 without returning bytes. Current approved video metadata is checked separately against frozen wrong-question IDs. List queries and session D1 validation are unchanged. This reader remains disabled by default, and there is no cache layer yet. Real R2/D1 integration, full session revocation tests, retention backlog drainage and completeness gates must pass before production activation.


## Durable retirement and scheduled reconciliation (2026-10-02)
Migration 0062 records administration/exam IDs and a permanent retired-through version without participant data or cascading foreign keys. The scheduled retention purge acquires the exam operation lock and rechecks channel, status and expiry before retiring versions. Retirement is committed before source/manifest cascade deletion, so R2 orphans remain discoverable even if the following purge transaction fails. Retired versions cannot be prepared, reopened or read through either snapshot/detail or institution paths. Both publication channels allocate above retained retirement numbers, avoiding namespace reuse after snapshot deletion.

RESULT_ARTIFACT_CLEANUP_ENABLED=true and the dedicated RESULT_FILES binding enable scheduled file sweeps. Each invocation handles at most five retirement records; each page lists 51 and deletes at most 50 objects from one exact version prefix. A failed job is delayed five minutes and other jobs continue. Progress updates compare the observed version range and cursor; a concurrent retirement extension cannot be overwritten by stale sweep bookkeeping. After an empty final version, the range restarts at version 1 and is checked again after one day to catch late writes from a revoked R2 owner. This marker is never deleted automatically. Old sweeps cannot delete objects belonging to a newer publication or another administration.

D1 cohort purge now processes at most 80 participants per administration, up to five administrations per invocation. The page deletion and retention event commit together under owner fencing; completion records aggregate deleted counts. Participants and their shared snapshots are retained if another administration or a licensed delivery profile/publication still references the exam; only the expired administration's identities and manifests are removed in that case. Permanent student entities are never deleted by this purge. This limits work per invocation but is not yet a complete high-volume retention service: the former result Worker cron ran daily. The draft now schedules discovery/recovery every 15 minutes and provides an optional queue consumer. Real queue/private-bucket provisioning, measured backlog drainage, migration coverage for all past artifacts, alert wiring and an agreed deletion completion deadline are mandatory before merging/deploying this lifecycle change or enabling artifacts. At a million records, the daily schedule with these bounds is insufficient. Initial retirement/discovery precedes future sweeps; default flags remain off, no private binding, queue or cron change is deployed. Session validation is still a D1 read per request; no 10k/1m acceptance has run.

Tests cover real SQLite cascades, bounded two-page purge, expiry recheck, busy/revoked owner, failed purge transaction, producer-created orphans after audit rollback, retired producer/reader/reopen denial, preserved future namespaces, failed R2 deletion, five-job limit, later reconciliation, and version allocation beyond deleted history. Buckets are mocks, not a live R2 integration proof.


## Optional queue drain and operator view (2026-10-02)
Migration 0063 adds a durable transport record per administration and job kind: status, dispatch token, next dispatch time, successful pages, failure count and sanitized error code. The source of deletion authority remains the current administration expiry and permanent retired-version record. Messages carry exactly schemaVersion, kind, administrationId and token; no participant information or object URL is sent.

RESULT_RETENTION_QUEUE_ENABLED=true requires a RESULT_RETENTION_QUEUE binding. Missing binding is a configuration error, not silent fallback. The result Worker exposes a queue consumer. Cron discovery emits at most 100 notifications and reserves each transport record for 15 minutes before sending. Notifications lost after reservation or sent to a dead-letter queue can be rediscovered from the durable source; old dispatch tokens do not process data. Continuations rotate tokens before sending, so a crash during send cannot repeat the completed D1 participant page. Final source commits are reconciled if transport status was not saved. Busy exam locks retry after 30 seconds, processing failures after five minutes. A temporarily paused queue retries without database work. Invalid/unknown messages are acknowledged without deletion.

Each cohort message processes at most 80 participants under the existing exam lock and refreshed expiry/channel checks. Each artifact message deletes at most 50 files from the exact retired prefix. Queue continuations have zero configured delay while backlog remains; artifact retries respect the durable retry time, and completed version ranges are rechecked after one day. This removes the fixed daily/minute-per-page bottleneck; it is not a measured million-record capacity guarantee.

config/result-retention-queues.example.json supplies a configuration fragment for a producer, a consumer batch of five, concurrency cap of five, five retries and a dead-letter queue. It is an example and is not merged into production configuration. Provision both queues and verify actual account limits, private R2 binding and consumer behavior in staging before enabling. The draft cron frequency is 15 minutes; no cron deployment happened. Retention 90/60/15 notices still run in queue mode.

Super Admin GET /api/admin/result-network/retention-queue returns bounded diagnostic rows (100 plus hasMore), aggregate pending/error/done/redispatch-due counts and successful page timestamps. Tokens and raw exceptions are omitted. The Result Network Admin has a read-only “Veri Temizliği” section with refresh, status counts and job rows. Browser interaction QA and alert delivery are still pending; the view does not claim exact deletion percentages or completion deadlines.

Validated against actual SQLite and mocked Queue/R2: multi-page cohort/artifact drains; old/duplicate tickets; lost initial sends; send failure after a successful page; failed D1 page rollback; busy lock; changed expiry; pause/missing-binding gates; private diagnostics; five-minute artifact retry; bounded 100-job discovery and later jobs; crash between final source commit and transport status. Cloudflare Queue API semantics were checked against https://developers.cloudflare.com/queues/configuration/javascript-apis/ and https://developers.cloudflare.com/queues/configuration/batching-retries/ . Real provider integration and 10k/1m load acceptance remain required.


## Diagnostic health thresholds (2026-10-02)
The diagnostic endpoint and read-only admin view now show queue errors, 30-minute lack of successful progress, missing enabled Queue binding, and expired cohorts exceeding an operational cleanup target. RESULT_RETENTION_DEADLINE_HOURS accepts 1–720 hours (default pilot target 24). This is an operational target for COHORT_PURGE, not statutory compliance or proof of R2 deletion. Backlog is computed directly from expired administration records, including cohorts never dispatched; completed/PURGED cohorts leave that backlog. R2 completion deadlines and external alert delivery remain to be implemented and measured. A source-based agent analysis is recorded in docs/agent-operating-analysis.md; no workflow or message was triggered.

## Bounded readiness audit (2026-10-02)

Super Admin GET `/api/admin/result-network/administrations/:id/artifact-readiness?expectedSnapshotVersion=N&cursor=...` audits at most 50 identities per page. It requires a private RESULT_FILES binding and the exact unretired published Result Network version. Aggregate coverage counts expected identity rows, existing snapshots and manifests; these counts do not prove valid sources or available R2 bytes. Each page checks snapshot/participant/institution identity scope, deterministic expected artifact key/hash, and exact private object bytes. Counts distinguish missing/invalid snapshots, missing/invalid manifests, missing objects and corrupt objects. Provider failures return a sanitized 503; publication is rechecked after reads so withdrawal/version change returns 409. No object URL, student payload or raw provider error is returned.

The response always has rolloutReady=false and verificationScope=CURRENT_PAGE_ONLY. Reaching the final cursor does not certify previously inspected pages, an unchanged cohort, persistent object availability or private bucket configuration. A durable all-participant certificate and bounded background producer are still required before switching readership. This diagnostic neither changes reader flags nor publishes/creates/deletes artifacts. Five tests use actual SQLite and mocked R2, including multi-page bounds, corrupt/missing data, foreign institution scope, retired versions, provider failures and mid-read withdrawal.

Environment check: this execution workspace has no Cloudflare API credential environment variables or Wrangler credential file, and the result production template contains no RESULT_FILES/RESULT_RETENTION_QUEUE bindings. Therefore real provider integration was not run; this is a local access/configuration limitation, not proof that the account has no resources. Provision isolated staging through authorized account tooling before running Queue/R2 integration.

## Durable preparation progress: disabled pilot (2026-10-02)

Migration 0064 records a cursor, prepared row count, actor and attempt timestamps per administration/version, cascading with administration deletion. Super Admin POST `prepare-artifact-job` accepts expectedSnapshotVersion and optional restart=true. A duplicate start preserves progress; an explicit restart resets it. GET on the same route returns at most 10 progress records plus hasMore, without participant cursor or actor identity. All responses use no-store and rolloutReady=false.

The additional RESULT_ARTIFACT_BACKGROUND_ENABLED flag defaults off. Existing preparation, cleanup and retention Queue flags plus private bucket/Queue bindings are also required. When enabled, the scheduled pilot tries at most two RUNNING jobs, at most 50 rows each. Successful manifest rows, audit and cursor/count advance commit in the same fenced D1 batch. Failed batches leave retryable R2 orphans but no progress advance. Conditional puts validate existing bytes; conflicting manifests are rejected before object writes. A missing cohort snapshot prevents completion. Attempt timestamps rotate processed/failing jobs; a busy exam lock may still delay a job. No production flag, cron or binding was deployed.

Identity membership/scope changes, snapshot changes, participant institution changes, Result Network institution scope changes, manifest update/delete and publication withdrawal/version change invalidate progress through database triggers. Invalidated jobs require explicit restart. Identity expiry/lockout changes alone do not rebuild nonpersonal prepared payloads; live authorization remains mandatory. PREPARED means this cursor pass wrote its manifest pages, not that R2 currently contains all valid files. R2 files can disappear after a pass, cohort/generation certification and independent verification are still missing. Neither the reader flag nor publication is switched by this job.

This 15-minute cron driver is a bounded pilot, not the million-student producer: at two 50-row pages per invocation, a Queue-based high-throughput producer and measured quotas are still required. The durable all-participant verification certificate is intentionally not declared implemented. Global coverage aggregation in artifact-readiness still needs cost measurement/optimization. Tests exercise SQLite transactions/cascades and mocked R2, not real Cloudflare integration.

## Preparation retry diagnostics (2026-10-02)

Migration 0065 adds an internal attempt token, cumulative failure count, sanitized active error code and retry time. The pilot scheduler retries failed pages after five minutes. Successful page commits clear the active error/retry time and attempt token while preserving cumulative failures. Explicit restart resets health metadata. Source-invalid/source-incomplete/manifest-conflict/publication-change/ownership-loss use fixed codes; other exceptions become RESULT_ARTIFACT_PREPARATION_FAILED. Raw provider messages, object keys, payloads and tokens are omitted from the operator DTO.

Error metadata updates compare administration/version, RUNNING status and exact attempt token. They cannot alter cursor/count and cannot annotate a restarted/new attempt. Token clearing on success prevents a delayed failure from rewriting completed progress. Busy locks that prevent attempt creation do not produce a recorded page failure. Error metadata persistence itself still depends on D1 availability; external alert delivery and UI integration remain pending. This is telemetry and retry backoff, not a verified completeness certificate or high-volume producer.

## Durable independent full-cohort pass (2026-10-02)

Migration 0066 adds preparation source_generation and a verification record per administration/version with the captured generation, expected count, verified count, cursor, status, error/retry metadata and verified_at. Verification cascades with preparation/administration deletion. Existing cohort/source invalidation triggers advance the generation and invalidate verification. Explicit preparation restart advances generation too. Durable retirement and official institution code changes/deletion also invalidate progress.

Super Admin POST `/api/admin/result-network/administrations/:id/verify-artifact-job` accepts expectedSnapshotVersion and optional restart=true. It requires the separate RESULT_ARTIFACT_VERIFICATION_ENABLED flag (off by default), background flag and dedicated private bucket, a PREPARED generation and the exact current unretired published version. Empty cohorts are rejected. A duplicate request preserves state; explicit restart rechecks the current expected cohort count and resets verification. GET returns at most 10 records plus hasMore without participant cursor/actor/payload/object URL.

The scheduled pilot independently reads at most two verification pages, each at most 50 identities. It recomputes the deterministic source bytes and verifies identity/institution scope, manifest key/hash and exact R2 bytes through the readiness auditor. The cohort count is captured once at start; verification pages skip the expensive global coverage aggregation. Page count/cursor, completion timestamp and audit commit atomically under the exam lock and write fence, with captured generation/cursor/status comparisons. A bad/missing source or object invalidates the pass; provider outages back off five minutes without advancing. Source mutation or revocation during a private read cannot commit a stale successful page. VERIFIED is recorded only when the last page passes and total verified_count equals expected_count.

This is a **completed sequential full-cohort pass**, not continuous R2 availability. Files can be externally removed/corrupted after verification, and objects checked on earlier pages can change independently while later pages are checked. certificate_current only means the recorded pass is VERIFIED and its source generation/publication is still current; it does not reread all R2 objects. Consumers must still use live authorization and digest checks, and reader fallback stays authorized frozen snapshots. rolloutReady always remains false. Verification does not enable readership or deploy, and is not a capacity/privacy certification. A truly simultaneous all-object availability guarantee is not provided by R2 or this record.

Tests with real SQLite/mocked R2 cover 51-row independent verification, no last-page-only shortcut, missing objects/repair/restart, source mutation on a later page invalidating earlier progress, preparation restart/manifest mutation/retirement invalidation, audit rollback, owner revocation, role/disabled/unprepared gates and sanitized provider backoff. Real provider integration and the higher-throughput Queue producer remain pending.

## Optional preparation/verification Queue transport (2026-10-02)

Migration 0067 adds a durable ticket per phase (PREPARE/VERIFY), administration, version and captured source generation. Tickets store a token, source page cursor, dispatch lease, transport status, processed-page bookkeeping and sanitized error code. They cascade with preparation/administration deletion. Messages contain exactly six fields: schemaVersion, kind, administrationId, snapshotVersion, sourceGeneration and token; participant cursor, actor, file URLs and student payloads stay out of the Queue.

RESULT_ARTIFACT_QUEUE_ENABLED defaults off. It requires the dedicated RESULT_ARTIFACT_QUEUE producer plus background/artifact/cleanup/retention Queue flags and private bucket. A missing enabled producer is a configuration error. The example config/result-artifact-queues.example.json supplies separate producer/consumer/DLQ names, batch/concurrency caps of five and an explicit RESULT_ARTIFACT_QUEUE_NAME; merge the fragment into an isolated staging config only after provisioning, not into deployed production automatically. Result Worker routes an exact artifact queue name to this consumer; the existing retention consumer remains separate. Queue mode disables both slow preparation and verification cron page drivers. Cron becomes a bounded watchdog, reserving at most 100 due jobs for 15 minutes before send.

Consumer pages check the durable token and source generation/cursor under the exam lock before data work. Successful source page commits remain fenced and atomic. Continuations rotate transport tokens before send and use zero delay. Missing sends/DLQ/lost continuation notifications remain rediscoverable after the watchdog lease. If a source page committed before transport bookkeeping, the source cursor/terminal state reconciles the ticket without repeating the completed page. Duplicate/stale/old-generation/withdrawn tickets are acknowledged without source writes. Unknown/extra-field messages are rejected; paused consumers retry without database work. Busy/ownership/stale-lock conflicts retry after 30 seconds; provider/content failures retry after five minutes with fixed health codes. A preparation source failure also updates the per-job sanitized health metadata using its attempt token. 

VERIFY messages are sent only for explicitly requested VERIFYING jobs and require the verification flag. PREPARED alone does not auto-create verification, enable readership or imply rollout readiness. Diagnostics GET /api/admin/result-network/artifact-queue is SuperAdmin-only and bounded to 100 tickets plus hasMore, omitting tokens and participant cursors. External alerts/UI integration remain pending. Processed-page transport counts can undercount a crash after final source completion; source audits and actual verified counts remain authoritative.

Producer source selection now left-joins snapshots from the bounded identity page. A missing snapshot in that page blocks advancement instead of being skipped by an inner join. This removes the previous managed producer’s full-cohort missing-snapshot scan on every page. Verification already avoids per-page global coverage COUNT. Manual readiness global coverage still needs cost measurement.

Tests use real SQLite and mocked Queue/R2, including 101-row preparation then independent Queue verification, duplicate token, restart generation, lost sends, continuation failure, final source commit reconciliation, busy locks, sanitized failures, malformed/paused/missing-binding gates, superseded token check inside the lock, bounded 100-ticket discovery and later remaining jobs. No real provider deployment/integration or 10k/1m load run happened. Single-exam writes still serialize through the exam lock; higher concurrency across administrations and 50-object pages are bounded foundations, not a million-student throughput guarantee. Actual subrequest/CPU/D1/R2/Queue quotas and end-to-end duration must be measured before enabling.

Queue routing fails safely: unknown queue names retry without touching source data, and equal artifact/retention names raise RESULT_QUEUE_ROUTE_CONFLICT. Custom names must be provisioned in RESULT_ARTIFACT_QUEUE_NAME and RESULT_RETENTION_QUEUE_NAME; defaults match the example queue names.

## Operator status view (2026-10-02)

The Result Network Super Admin sidebar now has Sonuç Dosyaları. The read-only view selects a PUBLISHED administration with a positive current snapshot version, then independently fetches bounded preparation, verification and global Queue diagnostics. Partial endpoint failures are shown separately; disabled preparation/verification are not mistaken for a completed job. Changing selection/version cancels stale result acceptance, and stored responses are scoped to the selected administration/version before rendering.

The current pass indicator requires VERIFIED status, certificate_current=1, exact selected version, a positive integer expected count and equal verified count. PREPARED and Queue DONE have distinct labels and never imply a verified cohort or live-read capacity. Counts are not deletion percentages or continuously available file counts. Fixed operator messages replace raw error details; tokens/cursors are absent from the source DTOs. The responsive view has manual refresh and creates no jobs, publishes no results and changes no flags. Browser interaction/visual QA and real-provider checks are still pending; local status semantics, typecheck and production build are verified.
# GitHub dağıtımına kaynak bağlantıları

## Ayrı provider testi

`config/result-provider-probe.example.json` yalnız ayrılmış test kaynakları için
örnektir: bir özel bucket, iki iş kuyruğu ve iki DLQ. Mevcut production kaynakları
kullanılmaz. Kaynak adları/izinleri doğrulandıktan sonra test Worker'ı bu config ile
dağıtılır; `PROBE_TOKEN` Wrangler secret olarak tanımlanır. Token kaynak dosyasına,
komut argümanına veya loga yazılmaz. Tokenı güvenli ortamda girin.

`RESULT_PROBE_URL` ve `RESULT_PROBE_TOKEN` ortam değişkenleriyle
`node scripts/run-result-provider-probe.mjs` çalıştırılır. İstemci yalnız
`anunex-result-provider-probe` adıyla başlayan HTTPS workers.dev kök adreslerini
kabul eder, yönlendirmeleri reddeder. R2 aynı içerik tekrar yazımı ve farklı
içerikle çakışma kontrolünden sonra iki kuyruğun tüketildiğini en fazla 60 saniye
bekler. PASS gerçek provider kontrolüdür; D1 iş sayfalama, öğrenci yetkilendirme,
DLQ tüketimi, kayıp mesaj senaryoları veya 10k/1m kapasite kanıtı değildir.

Test sentetik dosyaları `provider-probes/` altında bırakır. Sonuç kaydedildikten
sonra yalnız bu ayrılmış Worker/kuyruklar/DLQ/bucket kaldırılır. Worker'a D1,
öğrenci verisi veya üretim domaini bağlanmaz. Worker yalnız gizli tokenla erişilir;
örnek yapılandırmanın paketlenmesi gerçek Cloudflare çalıştırması sayılmaz.

`deploy-result-network.yml` mevcut production DB ve içerik `FILES` bağlantılarını
çözmeye devam eder. Özel sonuç kaynakları için GitHub production ortamı/repo
değişkenlerinde şu beş ad birlikte tanımlanır:
`RESULT_PRIVATE_BUCKET`, `RESULT_ARTIFACT_QUEUE_NAME`,
`RESULT_ARTIFACT_DLQ_NAME`, `RESULT_RETENTION_QUEUE_NAME`,
`RESULT_RETENTION_DLQ_NAME`.

Adları mevcut Cloudflare kaynak envanteriyle doğrulayın. Bu adım kaynak oluşturmaz,
hesap izinlerini doğrulamaz ve kuyrukların başka bir Worker tüketicisi tarafından
kullanılmadığını kontrol etmez. Özel bucket, içerik FILES bucket'ından farklı;
iki iş kuyruğu ve iki DLQ birbirinden farklı olmalıdır. Kısmi ayar yayın öncesinde
hata verir. Beş değişken de boşsa mevcut temel dağıtım korunur.

Bağlantılar tanımlansa bile dosya üretimi, okuma, temizleme, arka plan hazırlama,
doğrulama ve iki kuyruk bayrakları `false` olarak kalır. Gerçek provider testleri
ve kontrollü rollout ayrı aşamadır. Bu bölüm üretim yayınını tetiklemez.
