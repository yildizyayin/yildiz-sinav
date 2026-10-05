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

## Remaining integration

Teacher observation capture, exact institution/season/class/subject authorization, immutable observation snapshots, correction/withdrawal history, idempotent submissions and student/parent/branch/guidance report presentation are not implemented by this registry change. Multiple-choice accuracy remains separate from observation evidence.

## Final-stage checks

Apply migrations in isolation; check foreign keys and immutability triggers; check official and teacher-designed payload validation, duplicate version conflicts, unauthenticated/non-admin rejection, changed curriculum context, UI source confirmation resets and version-switch response isolation. Validate official content and observable level definitions with subject specialists before a pupil pilot.
