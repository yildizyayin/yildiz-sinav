# Institution and guidance frozen learning summaries

Status: implemented on draft PR branch; tests, build, typecheck, migrations and live acceptance have NOT run for this code.

## Selection and scope

GET `/api/reporting/institution/frozen-learning-summary` is SUPER_ADMIN (explicit institution) or INSTITUTION_MANAGER (own institution) only. GET `/api/reporting/guidance/frozen-learning-summary` is GUIDANCE_TEACHER with an exact current institution/season/class GUIDANCE assignment. The helper repeats the assignment witness rather than trusting its caller's class object.

Parameters: academicYear, sources (EXAM,QUESTION_BANK,MINI_TEST,FOY,MINI_GAME), optional examIds (1–20 required when EXAM is selected), repeatPolicy FIRST or LATEST; optional paired fromDate/toDate within the academic year. Date bounds are inclusive UTC calendar days and apply to non-exam completion/observation dates. Selected exam snapshots are unaffected. Guidance also requires classId; Super Admin requires institutionId.

EXAM uses selected published exam snapshots, including scheduled publication checks and a participant/enrollment season witness. Other selected sources use all eligible records in the chosen academic year and optional date range. These are not arbitrary selected individual run IDs. Digital mini tests require NEW/non-practice, submitted/scored evidence. Practice and mini evidence bind the frozen enrollment and season. Föy/game rows bind their frozen enrollment/season. No current answer/content/curriculum label joins are used to reconstruct results.

Institution scope includes the year's retained enrollment records, including departed students with matching evidence; guidance scope is the active enrollment in the assigned current class. Class labels and grouping follow enrollment class identity, not an immutable exam-time class-name snapshot; the existing exam-only summary remains available for its separate frozen exam/class totals. A guest without a canonical student enrollment is not included in the combined academic cohort.

## Calculation

Existing frozen reducers validate exam, practice, mini-test, föy and game evidence. Practice FIRST/LATEST deduplicates within each enrollment/content/context and selected date range before class aggregation. It never deduplicates across students. Different sources remain separate learning events even if a question's content overlaps.

Accuracy groups are separated by enrollment class/grade, frozen subject, curriculum version, academic year, frozen grade and program version. Correct/(correct+wrong+blank) uses question-event weights; invalid items are separate. Outcomes with multiple mappings cannot inflate a subject's question count because existing reducers count each question once per subject context. No student mean, national rank, official ability score, total cohort enrollment denominator or rubric-level conversion is produced. Participating enrollment count includes only enrollments with valid academic events in that group; absent students are not zero scores.

Source breakdowns show eligible question counts. Mini-game session/score/duration/XP are a separate table; average game score uses the unrounded total score divided by session count, not averages of rounded student means.

## Limits and coverage

At most five batch queries are used, not a per-student query chain. Each source fetches up to 5001 rows and rejects >5000; combined groups reject >500. No silently truncated report is returned. This is an interactive bounded report, not a million-student export. Institution-wide scopes beyond the cap need a separately designed partitioned/background export; the current UI can choose narrower dates/fewer sources and guidance can choose its class.

Coverage shows admitted source row counts and reducer exclusions/repeated practice counts. Rows with missing/unverifiable frozen year/enrollment context cannot enter the scoped dataset and are not claimed as counted legacy exclusions. Cohort outcome feedback is now included, separated by enrollment class/grade and frozen outcome context, with source breakdowns, participating enrollment counts and frozen-label conflict handling. Outcome rows are not summed into subject totals. More than 1000 outcome groups rejects the report. Rubric distributions remain in their separate rubric-summary panel.

## Final-stage acceptance

Check all unauthorized roles, wrong institution/year/class/season and revoked guidance assignment; independent students solving the same question; FIRST/LATEST and exact ties; all four academic sources; multiple outcome refs; invalid-only groups; NEW versus REVIEW mini tests; year and program separation; mixed guest/canonical exam cohorts; weighted game averages; source/group caps; zero evidence; scoped UI stale-response suppression. Update existing exact game payload fixtures for `totalScore` if needed. No final acceptance has run yet.

## Arka plan kurum raporu

Büyük kurum kapsamları için ayrı, varsayılan kapalı bir hazırlama yolu kodlandı. Dönem kayıtlarına bölünür, kaynak değişiminde geçersiz olur ve tek CSV/aynı panel özeti üretir. Yeni yolun sınırları, staging gereksinimleri ve bekleyen testler [private-cohort-background-report.md](private-cohort-background-report.md) içindedir. Rehber sınıfının arka plan yolu bu tur açılmadı.
