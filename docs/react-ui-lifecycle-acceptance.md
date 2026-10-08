# Mounted React UI acceptance — 2026-10-07

Eleven tests now mount actual RubricObservationReport and PageLoader components using React DOM createRoot and act in a pinned happy-dom 20.14.5 development-only environment. Deferred promises allow scope changes while requests are pending. No runtime production component was changed for these tests. The private background-export child is mocked so rubric lifecycle assertions are isolated from its separate API calls. API responses, object URL creation and network timing are controlled fixtures.

Rubric tests verify stale A/B/A success and error responses, populated textarea/date draft reset after student changes, late pagination errors, publish and withdrawal completion without messages or reloads into another student, and CSV cancellation across A/B/A and unmount without creating a download object URL.

PageLoader tests verify accessible loading while a lazy page is pending, state retention when only the query changes, and rejection handling without internal error details followed by recovery on another route.

These tests close the previous gap between pure cancellation-helper tests and actual mounted React state/effect behavior. They are DOM simulation tests, not Chromium/WebKit/Firefox tests. Real download saving, CSV spreadsheet opening, browser network waterfalls, service-worker lifecycle, authenticated six-role navigation, mobile/PDF/camera acceptance and Cloudflare acceptance remain open. No actual 10,000/1,000,000-user capacity measurement is claimed.

Run the targeted acceptance with `npm test -- tests/rubric-ui-lifecycle.test.ts tests/page-loader-lifecycle.test.ts`. No extra vitest configuration is required; each file declares its DOM environment.
