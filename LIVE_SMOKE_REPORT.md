# Live Staging Smoke Report

- Target: `https://yildiz-sinav-v1.rtsgida.workers.dev`
- Time: `2026-08-20T20:19:08.739Z`
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
Error: POST /api/scan-batches/batch_7ce8b26e-5cb4-4875-b1cb-56d83f8a3d6a/evaluate expected 200, got 500
{
  "ok": false,
  "error": {
    "code": "EVALUATION_CHUNK_FAILED",
    "message": "Sınav değerlendirme grubunda işlem hatası oluştu. İşlem güvenli şekilde tekrar denenebilir."
  }
}
    at http (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-smoke.mjs:53:11)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async run (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-smoke.mjs:126:21)
```
