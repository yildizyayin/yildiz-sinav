# Prepared result artifacts: gated rollout

Status: code foundation only. No production binding, enabled rollout, artifact reader, cache, or measured 10k/1m capacity yet.

The SuperAdmin POST /api/admin/result-network/administrations/:id/prepare-artifacts accepts expectedSnapshotVersion and an optional participant cursor. Each request preflights up to 50 published snapshot records, prepares deterministic artifacts in RESULT_FILES, then commits the manifest page and audit under the exam operation lock with write fencing. A retry never overwrites different stored bytes. The response exposes counts and a continuation cursor, not bucket URLs. Partial R2 success followed by manifest failure leaves unreferenced objects; retries are safe but cleanup is required.

RESULT_ARTIFACTS_ENABLED must equal true and a dedicated private RESULT_FILES binding must exist. The shared content FILES bucket is never used. These settings are intentionally not configured in Wrangler. Binding existence does not prove privacy; disable R2 public access and validate account permissions before enabling. The preparer currently runs after publication, and does not reduce reader database load until a reader is integrated.

## Required next steps

1. Provision and validate private bucket isolation in a test environment. No anonymous read or generated public URL.
2. Add a reader that checks the live session, peer identity expiry, current published administration and exact version before reading any private artifact. Verify stored digest and institution/participant/version scope. Withdrawal, session revocation and expired identity must deny access even when artifacts/cache exist.
3. Add retention purge and unreferenced-object cleanup. Manifest cascades alone do not delete R2 objects. Do not enable the feature until deletion tests pass; preserve historical versions only within permitted retention.
4. Integrate a bounded background producer and an all-participants completeness gate before switching readership. Missing artifacts use only the authorized frozen snapshot, never mutable results. Handle retry/withdrawal/owner loss and partial object creation explicitly.
5. Optimize list summaries and session/authorization separately. Moving detailed payload bytes out of D1 does not remove session queries or guarantee first-read/cache-hit performance for a million distinct students.
6. Measure private R2 reads, regional cold/warm cache, lookup/verification bursts, D1 query duration and observed origin traffic. Run the existing staged 10k/1m acceptance scenarios with separate identities and correctness oracles.

The previous capacity plan's live-reader findings are historical: student and published institution data now use the channel's immutable snapshot; mutable AI-tip queries were removed. Session D1 checks remain on every request. Both CI and PR Preview succeeded at c96d87dff8d4ec394138af14817c74c462565dfd; earlier provisioning failures must not be treated as a current blocker without rechecking.
