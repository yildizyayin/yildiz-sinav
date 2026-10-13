# Three-option D1 migration runbook (not approved for production)

**Scope:** question_bank, exam_subjects, exam_questions, answer_keys. Each has an existing CHECK(option_count IN (4,5)) and must retain every row, FK reference, index and trigger.

## Preconditions
1. Finish the disposable SQLite rebuild rehearsal and require a green CI.
2. Inventory sqlite_master entries and PRAGMA foreign_key_list for all four tables plus inbound references; retain each table's complete current DDL, not the original baseline definition.
3. Take a verified independent D1 backup/export and capture stable row counts and IDs. Stop if restoration cannot be rehearsed.
4. Prepare an additive, explicitly reviewed migration based on the *current effective schema* including all later ALTERs, indexes, triggers, and views. Do not use CREATE TABLE AS SELECT as it drops constraints.
5. Run a clone migration with D1 local migration runner, enable FK validation, compare row identities and PRAGMA integrity_check, and exercise rollback in disposable SQLite. Observe D1 limitations on PRAGMA foreign_keys inside transactions.

## Release gate
- No automatic destructive migration while dependency inventory is incomplete.
- Require 4-option and 5-option historic records to retain IDs and all child references.
- Prove new 3-option inserts for each table and answer-evaluation tests.
- Record explicit reviewer approval before using the migration on any remote D1 environment.
- Keep any Studio three-option publishing disabled until the actual runtime schema passes checks.

## Recovery
If any count, identity, FK, trigger or index check fails, do not proceed with remote writes. Restore from the verified backup using a planned maintenance procedure; do not assume SQLite transaction rollback can undo a previously committed D1 migration.
