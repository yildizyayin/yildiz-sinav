# Live Staging Smoke Report

- Target: `https://demo.anunex.com`
- Time: `2026-09-18T19:09:50.160Z`
- Result: **FAILED**
- Passed checks before finish: **0**

## Checks

- No checks completed.

## Failure

```text
Error: Expected staging environment
{
  "ok": true,
  "productName": "Anunex — Nibiru AI Destekli Ölçme ve Analiz Platformu",
  "turnstileSiteKey": "0x4AAAAAAEeOH-5KgRCJKsu1",
  "environment": "production",
  "superAdminMfaEnabled": false
}
    at assert (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-smoke-v2.mjs:13:21)
    at main (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-smoke-v2.mjs:94:3)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
```

## Mandatory KVKK / privacy-by-design live gate

- Environment: staging
- Suite: `kvkk-live-v1`
- Result: **FAILED**
- Synthetic-only checks completed: **0**
- ❌ **KVKK smoke failure** — `NOT_STAGING`

## Final platform feature checks

- ❌ **Final feature smoke failure**

```text
Error: POST /api/auth/login expected 200, got 400
{
  "ok": false,
  "error": {
    "code": "invalid-input-response",
    "message": "Robot doğrulaması başarısız."
  }
}
    at req (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-final-features-smoke.mjs:11:392)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async login (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-final-features-smoke.mjs:13:45)
    at async file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-final-features-smoke.mjs:19:16
```

## Nibiru academic growth / communication checks

- ❌ **Academic growth smoke failure**

```text
Error: POST /api/auth/login expected 200, got 400
{
  "ok": false,
  "error": {
    "code": "invalid-input-response",
    "message": "Robot doğrulaması başarısız."
  }
}
    at req (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-academic-growth-smoke.mjs:11:392)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async login (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-academic-growth-smoke.mjs:12:45)
    at async file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-academic-growth-smoke.mjs:16:16
```

## Standard package acceptance

- ❌ **Standard acceptance failure**

```text
Error: POST /api/auth/login expected 200, got 400
{
  "ok": false,
  "error": {
    "code": "invalid-input-response",
    "message": "Robot doğrulaması başarısız."
  }
}
    at req (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-smoke.mjs:6:476)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async login (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-smoke.mjs:7:45)
    at async file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-smoke.mjs:10:14
```

## Standard final closure

- ❌ **Standard final closure failure**

```text
Error: super login failed
{
  "ok": false,
  "error": {
    "code": "invalid-input-response",
    "message": "Robot doğrulaması başarısız."
  }
}
    at assert (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-closure-smoke.mjs:4:36)
    at login (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-closure-smoke.mjs:6:269)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-closure-smoke.mjs:11:14
```

## Counselor-approved RBA / guidance governance

- ❌ **Guidance governance failure**

```text
Error: POST /api/auth/login expected 200, got 400
{
  "ok": false,
  "error": {
    "code": "invalid-input-response",
    "message": "Robot doğrulaması başarısız."
  }
}
    at req (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-guidance-governance-smoke.mjs:6:392)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async login (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-guidance-governance-smoke.mjs:7:45)
    at async file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-guidance-governance-smoke.mjs:11:16
```

## Student Intelligence / Learning Graph

- ❌ **Student Intelligence failure**

```text
Error: POST /api/auth/login expected 200, got 400
{
  "ok": false,
  "error": {
    "code": "invalid-input-response",
    "message": "Robot doğrulaması başarısız."
  }
}
    at req (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-student-intelligence-smoke.mjs:6:392)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async login (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-student-intelligence-smoke.mjs:7:45)
    at async file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-student-intelligence-smoke.mjs:11:16
```
