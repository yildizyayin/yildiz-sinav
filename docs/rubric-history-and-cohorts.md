# Rubric history, export and cohort distributions

Status: code added, NOT tested/typechecked/built/migrated or deployed. Migration 0081 adds ordered history/cohort indexes; 0079–0080 remain prerequisites.

## Individual history

GET `/api/learning-observations/students/:id` now supports `view=history`, optional enrollmentId and nextCursor. Every page repeats authorization. History is available to Super Admin, the institution manager for their own institution, the student's own account and a parent with a currently active link. Teacher/guidance history mode is denied; their existing current active class/subject scope remains unchanged. No new historical assignment permission is inferred.

History permits retained LEFT/GRADUATED/ARCHIVED enrollments and inactive prior seasons/classes. Matching observation enrollment/student/institution/season identity is required. Historical observations retain their original class identity even if the enrollment's class later changes; history authority comes from institution/own-student/active-parent-link, not an old teacher assignment. Write and withdrawal flows remain current active TEACHER/SUBJECT only.

Pages contain up to 200 unwithdrawn observations with keyset `(observed_at DESC,id DESC)`. Cursor carries student/view/enrollment scope and is validated; it never grants permission. A changed period/view/user/student suppresses stale results. The UI has history and enrollment controls plus load-more.

CSV export walks all pages of the selected authorized scope from the beginning, with a 5000-observation cap. Exceeding the cap fails without downloading a partial CSV. The browser handles UTF-8 BOM, semicolon/quote/newline escaping and spreadsheet formula prefixes. Each row is a frozen rubric criterion with its selected level and observation evidence/feedback/next step. Withdrawal reasons and hidden records are not exported. No server/public artifact or message is created. Changing scope or unmounting suppresses download.

Pagination/export are reads of mutable visibility, not a globally locked point-in-time snapshot. Concurrent publication or withdrawal can affect subsequent pages. A separate archive directory lists authorized students with unwithdrawn observations, including departed/archived records, with 50-row keyset pagination. It is restricted to the same history roles; Super Admin must choose an institution and that scope is preserved in the selected history panel. Student/parent links and manager institution scope are checked at the server. The existing active-student picker remains separate. Larger background archive exports are pending.

## Institution/guidance rubric distribution

GET `/api/reporting/institution/frozen-rubric-summary` is Super Admin/own-institution manager only. GET `/api/reporting/guidance/frozen-rubric-summary` requires the exact current active institution/season/class GUIDANCE assignment, repeated inside the helper. Other roles are denied cohort access.

Parameters: academicYear, observationPolicy LATEST (default) or ALL, optional paired fromDate/toDate; guidance requires classId and Super Admin requires institutionId. Date bounds are inclusive UTC calendar days in the academic year's two calendar years.

Only unwithdrawn observations with matching enrollment/institution/season/year participate. Institution reports include retained enrollment histories and group on the observation's original class. Guidance additionally requires current active enrollment and matching current class. Frozen schema, rubric ID, year, subject, curriculum identity, criteria and exact selections are validated. Inconsistent definitions for the same rubric version reject the report with 409 rather than merge conflicting levels.

LATEST uses the last valid observed_at/id per enrollment and rubric version in the selected range. ALL counts every valid observation and explicitly allows repeated student contributions. Groups separate observation class, rubric version, curriculum version and criterion. Levels show observation counts and observation-weighted percentages; participating enrollment count is separate. Rubric versions, criteria and levels are never translated to numeric ability scores or combined with exam accuracy. No student names, IDs, evidence notes or feedback are returned in the cohort payload.

Source >5000 observations or >500 criterion groups fails explicitly; date narrowing is available. Large background exports remain pending. Class names are looked up from retained class identity; criterion/level definitions are exclusively frozen snapshots.

## Deferred acceptance

Check all history roles, revoked parent links, cross-institution enrollment selection, teacher/guidance historical rejection, moved-class enrollment, inactive old season/class, duplicate timestamp pagination ties and invalid cursor scope. Verify CSV quotation, formula protection, export cap/no partial download, scope switch/unmount and concurrent visibility behavior. Cohort checks: LATEST/ALL, equal timestamp ordering, repeated observations, withdrawn/malformed/conflicting snapshots, rubric version separation, exact guidance assignment, no individual PII and date/group caps. Tests have not run.
