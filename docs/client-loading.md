# Client page loading acceptance — 2026-10-07

All 71 page modules in App.tsx now use module-level React lazy imports. Named exports retain their names through a default adapter. RoleGate and host/password redirects run before protected page rendering. This reduces downloaded code; server authorization remains the security boundary.

PageLoader shows an accessible loading status. A nested loader around the Layout outlet keeps navigation visible while a page loads. Errors show a generic message and a manual reload button, without exposing error details or automatically looping reloads. Error state resets on route changes; ordinary navigation and query changes do not remount the boundary's children by key. The application-level loader handles login, marketing and results entry points.

Local production build measurement: before, one client JavaScript file was 1,646,880 bytes (~459,950 gzip). After splitting, the initial static import closure is 324,290 bytes (99,883 gzip), an approximately 80% reduction in startup JavaScript. The largest deferred chunk is xlsx (~419 kB). Total application code is not reduced by this amount; additional pages download on demand. Shared CSS remains approximately 298 kB before gzip.

`npm run build` followed by `npm run test:bundle` checks the emitted client manifest and actual files. The check follows static imports with cycle protection, excludes pages and xlsx from startup, requires six important pages to remain dynamic entries, and enforces a 400,000-byte startup JavaScript budget. It does not rely on output filenames or treat dynamic imports as startup downloads.

Validation: 144 test files / 760 existing tests passed; final typecheck and production build passed; client bundle acceptance passed. No new browser timing, failed-chunk interaction, network waterfall, slow-device, offline or authenticated distributed-load measurement is claimed. Actual navigation across roles, stale-deployment chunk recovery and the Cloudflare asset configuration still need provider/browser acceptance. No production deploy, main merge, migration or feature activation occurred.

React references: https://react.dev/reference/react/lazy and https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
