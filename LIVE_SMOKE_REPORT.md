# Live Staging Smoke Report

- Target: `https://yildiz-sinav-v1.rtsgida.workers.dev`
- Time: `2026-08-20T20:09:46.201Z`
- Result: **FAILED**
- Passed checks before finish: **3**

## Checks

- ✅ **Public config** — Ölçme Platformu / staging
- ✅ **Unauthenticated API boundary**
- ✅ **Turnstile server validation**

## Failure

```text
Error: Manager dashboard applied exam count mismatch
{
  "Aktif Öğrenci": 65,
  "Misafir Öğrenci": 45,
  "Uygulanan Sınav": 21
}
    at check (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-smoke.mjs:12:11)
    at run (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-smoke.mjs:114:3)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
```
