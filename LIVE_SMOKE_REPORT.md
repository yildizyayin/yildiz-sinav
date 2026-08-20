# Live Staging Smoke Report

- Target: `https://yildiz-sinav-v1.rtsgida.workers.dev`
- Time: `2026-08-20T20:23:07.811Z`
- Result: **FAILED**
- Passed checks before finish: **6**

## Checks

- ✅ **Public config** — Ölçme Platformu / staging
- ✅ **Unauthenticated API boundary**
- ✅ **Turnstile server validation**
- ✅ **Manager tenant dashboard** — 65 active / 45 guest / 21 applied exams
- ✅ **Active/guest student separation** — 65 / 45
- ✅ **110-person exam matching preview** — 65 active + 45 known guest + 0 new guest

## Failure

```text
Error: Expected 110 evaluated participants
{
  "ok": true,
  "done": false,
  "processed": 5,
  "processedThisRun": 5,
  "total": 110,
  "remaining": 105,
  "batchId": "batch_979b6478-095d-4ac3-bcf7-94ecbe84c4ae",
  "examId": "exam_demo_active"
}
    at check (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-smoke.mjs:12:11)
    at run (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-smoke.mjs:127:3)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
```
