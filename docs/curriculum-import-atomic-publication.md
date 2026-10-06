# Atomic curriculum publication

Status: implementation only. Tests, type checking, build, migration and live deployment have not run.

## Publication boundary

Preview stores the job as PREVIEW while writing staging rows. Staging INSERT SELECT reads bounded JSON chunks of at most 100 rows and 450,000 UTF-8 bytes, replacing one database round trip per row. A single oversized row is rejected before storing the source file/job. READY is assigned only after the expected row count exists and CSV validation has no issues. An interrupted preview cannot be committed. Incomplete legacy READY jobs are rejected at commit too.

Commit requires literal `confirmedOfficial: true`, complete valid rows, and unambiguous parent codes within the same subject and grade. Duplicate codes, missing parents, self-links and cycles are rejected during parsing and again before commit. Optional parentless rows remain allowed; no missing hierarchy is inferred.

A fixed five-statement D1 batch creates the verified curriculum version, all outcomes with parent links, official provenance, the COMMITTED job and sanitized audit record together. The first statement rechecks READY status, source hash/URL, row counts, valid flags, active subjects, node types and grade context. If that witness is absent, all following statements are no-ops and the request returns 409. Constraint/query failures roll the batch back. Concurrent commits of one job cannot both publish. Competing version names use the existing unique constraints and return 409.

Outcome IDs are derived from unique staging row IDs. Parent resolution matches job, subject ID, grade (including NULL) and code; it never selects a parent from another grade or version. Migration 0086 indexes this lookup. One INSERT SELECT replaces per-row network writes and updates. The 10,000-row/8-MB application limit remains; completion time at that maximum is unmeasured and D1 limits still apply.

D1 transaction behaviour is documented in [Cloudflare's database API](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch). These semantics do not make source content automatically official: the existing source policy and human declaration remain, and subject specialist content review is still required for a pupil pilot.

## Final-stage verification

Check interrupted preview, incomplete legacy READY jobs, missing/ambiguous/cross-subject/cross-grade parents, self/multi-node cycles and out-of-order valid hierarchy. Update older parser fixtures that referenced missing parents. Check 10,000-row deep chains without recursion overflow, forward parent foreign keys in a set-based INSERT, injected failure at every batch statement, simultaneous same-job commits, conflicting version names, revoked subject activity, literal confirmation and malformed JSON. Confirm no partial verified version/provenance/outcomes survives failure; successful commit retains exact parent relationships and sanitized audit. Run migrations through 0086 in isolation before staging acceptance.
