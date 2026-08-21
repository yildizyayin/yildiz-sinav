# Live Staging Smoke Report

- Target: `https://yildiz-sinav-v1.rtsgida.workers.dev`
- Time: `2026-08-21T21:37:55.066Z`
- Result: **PASSED**
- Passed checks before finish: **17**

## Checks

- ✅ **Public config** — Ölçme Platformu / staging
- ✅ **Unauthenticated API boundary**
- ✅ **Turnstile server validation**
- ✅ **Manager tenant dashboard** — 65 active / 45 guest / 21 applied exams
- ✅ **Active/guest student separation** — 65 / 45
- ✅ **110-person exam matching preview** — 65 active + 45 known guest + 0 new guest
- ✅ **110-person chunked exam evaluation** — 110 committed in 22 safe chunks
- ✅ **Repeat guest identity matching** — still 45 guests; no duplicates
- ✅ **Student dashboard data** — 2 developing outcomes
- ✅ **Student self-service + IDOR boundary** — 9 visible exams
- ✅ **Parent linked-child boundary** — 7/A
- ✅ **Branch teacher dashboard scope** — 1 classes / 65 students
- ✅ **Branch teacher subject scope** — Matematik
- ✅ **Guidance dashboard scope** — 1 classes / 65 students
- ✅ **Guidance teacher all-subject scope** — Fen Bilimleri, Matematik, Türkçe
- ✅ **Super Admin institution access**
- ✅ **Session revocation on logout**

## Final platform feature checks

- ❌ **Final feature smoke failure**

```text
Error: POST /api/nibiru/chat expected 200, got 404
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "API yolu bulunamadı."
  }
}
    at req (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-final-features-smoke.mjs:11:392)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-final-features-smoke.mjs:21:22
```
