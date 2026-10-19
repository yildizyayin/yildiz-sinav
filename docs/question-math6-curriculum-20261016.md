# Math grade six: bounded first-theme curriculum expansion

Official source checked 2026-10-16: https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/456 . Four exact code/title pairs, MAT.6.1.1–MAT.6.1.4, cover factors/multiples, divisibility, primes/prime factors and common factors/multiples. Teaching guidance explicitly excludes formal EBOB/EKOK concepts here. The programVersion string is an internal ANUNEX import label, not an official MEB version identifier. AcademicYear is the target ANUNEX data context, not a newly inferred official rollout assertion.

Implemented: bounded source-checked manifest, exact official code/title validation, quoted semicolon UTF-8 CSV generation through existing admin preview/commit API, idempotent existing-version reuse only after metadata and exact active-outcome/learning-node verification, and exact code/title-bound grade-six guidance shared by author/editor/verifier via officialPilotGuidance. No grade-five proof is extended to grade six. Grade-six calculations still require the existing independent solver and reviewer; production qualification is not inferred from importing curriculum.

The staging-only import verifies the campaign is paused and snapshots pilot budget, campaign state, generation-job count and question-bank count before/after. It checks every learning node is active in grade 6 and academic year 2026-2027. It does not generate, enable campaigns, reset pilot caps, rewrite prior failures or alter production. Four rows are the first theme only, not the full grade or all subjects. Source HTML SHA-256 and retrieval timestamp are stored in workflow evidence alongside importer provenance; the importer stores its CSV source hash separately.

Validation: 42 relevant tests in six files passed; TypeScript check passed. Includes exact source pairing/mismatch rejection, pinned source/grade, missing scope restriction, script-only source rejection, comma-containing official title preserved in one CSV cell, scope guidance and existing proof regression tests. No new question-generation/model-editor call.

Previous staging app workflow 38930908079 succeeded on retry including Nibiru probe. Next: record live import outcome and linked node count before claiming records imported. Question quality qualification, other grades/subjects and mass-production readiness remain separate unfinished work.

## Verified staging result

Live import workflow 38932441956 / job 117079532499 succeeded. Created curriculum version cv_9972d139-a506-4dce-958d-64cca594323c with exactly four official active outcomes MAT.6.1.1–MAT.6.1.4 and four active learning graph nodes. Existing-version reuse was not needed. Runtime fetched and matched the official source and recorded its HTML SHA-256 and retrieval time.

Before/after unchanged: pilot 50/50, campaign editorial-20261015 PAUSED, generation jobs 32, question bank count 165. No new question was generated or published. Private generator/scheduler deploy workflow 38932441775 / job 117079531866 succeeded, so grade-six scope guidance is deployed. Main app run 38932441799 / job 117079531557 passed source/typecheck/tests/build, migrations, Worker deploy and demo-domain verification; general Nibiru provider probe was still running at recording. Full app workflow completion is not claimed.

Next single work item: qualify an independent scientific verification route for the newly imported grade-six scope before any new production campaign. Other five target grades and subject curricula remain incomplete; this import does not meet the 500,000-question campaign requirement.
