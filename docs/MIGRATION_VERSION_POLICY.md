# D1 migration version policy

## Rule for new migrations

Every new SQL migration must use a numeric prefix that is unique in `migrations/`.

Before creating a migration, check the highest existing numeric prefix and choose a new unused value. Do not reuse an older prefix even when the descriptive suffix is different.

## Historical duplicate prefixes

A small set of duplicate numeric prefixes predates this policy. Their exact filenames are treated as immutable because D1/Workers migration state can already reference those historical filenames. Renaming an applied file can make a migration engine treat it as a different migration and attempt to apply it again.

The D1 schema agent therefore allowlists only these exact historical groups:

- `0023_coach_mastery_cycle.sql` + `0023_student_intelligence_profile.sql`
- `0024_nibiru_whatsapp_public_number.sql` + `0024_product_completion_center.sql` + `0024_scale_readiness_indexes.sql`
- `0032_approved_theme_catalog.sql` + `0032_exam_scoring_presets.sql`
- `0033_publisher_outcome_mapping.sql` + `0033_results_network_targets_attendance.sql`
- `0042_official_outcome_matching.sql` + `0042_tyt_optional_philosophy.sql`
- `0043_exam_booklet_question_orders.sql` + `0043_exam_content_archive.sql`
- `0045_exam_booklet_question_orders.sql` + `0045_nibiru_session_routing.sql`

The allowlist is not permission to add another file under those prefixes. If any group gains, loses, or renames a file, the schema agent must fail.

## Production rule

Never rename, delete, reorder, or edit an already-applied migration merely to make numbering look sequential. Fix production schema forward with a new uniquely numbered migration and keep the historical audit trail intact.
