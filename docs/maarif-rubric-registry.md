# Maarif process-component and rubric registry

Implementation status: code added; migration, type checking, tests and browser acceptance have NOT run. No official definitions are seeded. No production deployment.

## Registry contract

- Migration 0079 introduces immutable process components and rubric versions.
- Super Admin alone can read/write the registry API. The existing curriculum authentication boundary runs before the handler.
- A process component references an active, official OUTCOME/SUB_OUTCOME in a verified curriculum version. Source URL, document title, page/section locator, review rationale, reviewer and timestamp are retained.
- Allowed official domain validation is a URL check, not document/content verification. Publication requires an explicit human confirmation. The server does not fetch or attest to source content.
- Rubrics distinguish OFFICIAL from TEACHER_DESIGNED. Official rubrics require their own source citation. Teacher-designed rubrics are not presented as MEB rubrics.
- Each rubric contains 1–10 observable criteria, each with 2–5 labelled/described levels and stable IDs. These bounds are application policy, not an official universal scoring standard. No numeric score or automatic competence inference is generated.
- Published definitions cannot be updated/deleted. Rubric corrections use a new version label. Corrections to official process definitions require a new curriculum version, preserving earlier evidence.
- Component code uniqueness is scoped to the outcome; rubric version-label uniqueness is scoped to the component. Conflicts return HTTP 409.

## API

- GET `/api/curriculum-admin/versions/:id/learning-rubrics`
- POST `/api/curriculum-admin/process-components`
- POST `/api/curriculum-admin/learning-rubrics`

The curriculum version detail screen contains source fields, confirmation, structured criterion/level editors and published rubric details.

## Observation integration

Migration 0080 stores append-only observations with an immutable rubric/criteria/source/outcome snapshot. A second append-only table records withdrawal reasons without overwriting evidence.

- GET `/api/learning-observations/students/:studentId` returns the authorized current active enrollment's rubrics and latest 200 unwithdrawn observations. `hasMore` is explicit; this is not a full-history export.
- POST on that path publishes an explicitly confirmed actual observation. Only TEACHER users with a current SUBJECT assignment matching the exact institution, season, class and subject can write. A guidance assignment alone does not authorize assessing another subject.
- POST `/api/learning-observations/students/:studentId/:observationId/withdraw` lets the original observer withdraw with a 20–1000 character reason while holding current branch authority. Corrections are new observations; withdrawn evidence is retained and excluded from report display.
- Student access is own student ID; parent access requires an active link; managers are institution scoped; branch/guidance access matches exact current assignments. No cross-institution or cross-season assignment reuse.
- Available rubrics must match the active enrollment's academic year, school program and grade through verified curriculum/outcome context. Publication repeats the scope and selected context inside the INSERT to prevent a changed enrollment/assignment from passing a stale precheck.
- Every criterion must have exactly one selected level from the published rubric. Observation/evidence note, constructive feedback and next step are explicit. The date must be valid, not future, and in the academic year's two calendar years; exact institution term dates are not modeled.
- Publication request IDs are unique per observer. A canonical payload fingerprint allows identical retries and rejects conflicting reuse. Original records cannot be updated/deleted.
- Reports embed a separate rubric panel for student, parent, branch, guidance, institution and Super Admin views. Display uses frozen criterion labels/descriptions, not current live rubric labels. No rubric average, official ability score or multiple-choice-to-competency inference is generated.

Historical/left enrollment viewing, archive export/pagination beyond the newest 200 records, broader cohort observation summaries and actual official definitions/content review remain separate work. Current institution/guidance cohort reports do not aggregate these observations.

## Final-stage checks

Apply migrations in isolation; check foreign keys and immutability triggers; check official and teacher-designed payload validation, duplicate version conflicts, unauthenticated/non-admin rejection, changed curriculum context, UI source confirmation resets and version-switch response isolation. Check all six read roles, cross-institution/class/season/subject rejection, revoked authority at the conditional INSERT, duplicate and conflicting request IDs, unknown/repeated criterion IDs, future/out-of-year dates and original-observer withdrawal. Validate official content and observable level definitions with subject specialists before a pupil pilot.
