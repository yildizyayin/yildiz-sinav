# Native browser smoke harness — 2026-10-07

`npm run test:browser` builds the current production client, serves it on an ephemeral localhost-only port, then runs six Chromium scenarios through Playwright 1.62.1:

- Login password visibility, remember-me and synthetic rejected credentials; no Excel/report chunk in login startup.
- An unauthenticated protected route redirects to login.
- Demo role selection at a 390×844 mobile viewport.
- Marketing entry point.
- Results entry point and student role selection at a mobile viewport.
- A missing lazy Login chunk produces the recovery UI.

All API responses are synthetic and explicit. Unknown API calls fail the scenario. External traffic is aborted; this server never connects to production or authenticates a real user. Service workers are blocked so network interception is deterministic. This does not complete six-role backend authorization, real browser service-worker lifecycle, camera/PDF/CSV saving, spreadsheet opening, native-device or distributed-load acceptance.

Setup on a machine with browser download access:

```sh
npm ci
npx playwright install chromium --only-shell
npm run test:browser
```

If a compatible Chromium executable is already installed, set the task-specific `ANUNEX_BROWSER_EXECUTABLE` environment variable to its absolute path. Linux CI may also require Playwright system dependencies. The runner prints success only after all six scenarios finish; a missing browser fails rather than silently skipping checks. Close handlers release browser contexts and the localhost server.

Current environment result: browser binary was absent. Chromium headless-shell installation failed because the downloaded archive was empty/invalid. Thus no native-browser scenario has passed here; the six scenario assertions are not yet empirically verified in Chromium. The server's actual HTTP behavior passed a Node integration test covering SPA fallback, JavaScript MIME, 404 assets, isolated backend APIs and path traversal denial. Script syntax, typecheck, production build and startup bundle acceptance were checked separately.

Playwright references: https://playwright.dev/docs/browsers and https://playwright.dev/docs/mock
