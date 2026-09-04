# Live Staging Smoke Report

- Target: `https://demo.anunex.com`
- Time: `2026-09-04T17:25:43.211Z`
- Result: **FAILED**
- Passed checks before finish: **5**

## Checks

- ✅ **Public config** — Anunex — Nibiru AI Destekli Ölçme ve Analiz Platformu / staging
- ✅ **Unauthenticated API boundary**
- ✅ **Turnstile server validation**
- ✅ **Manager tenant dashboard** — 162 active / 45 guest / 21 applied exams
- ✅ **Active/guest student separation** — 162 / 45

## Failure

```text
Error: POST /api/exams/exam_demo_active/preview-file expected 200, got 500
{
  "ok": false,
  "error": {
    "code": "SERVER_ERROR",
    "message": "Sunucu hatası oluştu.",
    "requestId": "a35eb1ef1a2dcf0a"
  }
}
    at request (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-smoke-v2.mjs:44:43)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async preview110 (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-smoke-v2.mjs:69:23)
    at async main (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-smoke-v2.mjs:119:24)
```

## Mandatory KVKK / privacy-by-design live gate

- Environment: staging
- Suite: `kvkk-live-v1`
- Result: **FAILED**
- Synthetic-only checks completed: **5**
- ✅ **Cross-tenant read/write denial**
- ✅ **Student self scope**
- ✅ **Parent linked-child scope**
- ✅ **Teacher assignment scope**
- ✅ **Guidance-only raw assessment boundary**
- ❌ **KVKK smoke failure** — `logout-revocation:POST:/api/auth/logout:HTTP_500:SERVER_ERROR`

## Final platform feature checks

- ❌ **Final feature smoke failure**

```text
Error: POST /api/nibiru/chat expected 200, got 500
{
  "ok": false,
  "error": {
    "code": "SERVER_ERROR",
    "message": "Sunucu hatası oluştu.",
    "requestId": "a35eb209add61726"
  }
}
    at req (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-final-features-smoke.mjs:11:392)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-final-features-smoke.mjs:21:22
```

## Nibiru academic growth / communication checks

- ✅ **Official academic target source registry** — MEB Rota Maarif + e-Okul + ÖSYM + YÖK Atlas
- ✅ **Official target search boundaries** — LGS 0 · YKS 0 verified rows currently loaded
- ✅ **Institution announcement center** — panel + WhatsApp-template + SMS-fallback ledger ready
- ✅ **Worksheet calendar + Nibiru guidance** — 4 published calendar rows visible
- ✅ **Teacher communication + worksheet scope** — role-scoped endpoints available
- ✅ **Student target eligibility + analysis boundary** — grade 7 · target not set
- ✅ **Super Admin official-source governance** — source URL + official flag enforced
- ✅ **Official question intelligence registry** — MEB LGS + ÖSYM YKS + EBA/OGM references · protected text not copied
- ✅ **Official question intelligence authorization** — Super Admin only status/source governance
- ✅ **Official outcome-history contract** — 0 outcome rows · historical priority is explicitly not a prediction guarantee

## Standard package acceptance

- ✅ **Standard readiness gate** — core ready · external setup 2
- ✅ **External provider activation contract** — YouTube setup · WhatsApp setup
- ✅ **Standard question bank** — 20 approved printable questions
- ❌ **Standard acceptance failure**

```text
Error: POST /api/nibiru/chat expected 200, got 500
{
  "ok": false,
  "error": {
    "code": "SERVER_ERROR",
    "message": "Sunucu hatası oluştu.",
    "requestId": "a35eb2709d97eb25"
  }
}
    at req (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-smoke.mjs:6:476)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-smoke.mjs:24:14
```

## Standard final closure

- ✅ **Standard package final readiness** — sale ready · optional channels 2
- ❌ **Standard final closure failure**

```text
Error: PATCH /api/student-standard/preferences failed with 500
{
  "ok": false,
  "error": {
    "code": "SERVER_ERROR",
    "message": "Sunucu hatası oluştu.",
    "requestId": "a35eb2e44d50cf0a"
  }
}
    at assert (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-closure-smoke.mjs:4:36)
    at jsonReq (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-closure-smoke.mjs:7:339)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-closure-smoke.mjs:20:14
```

## Counselor-approved RBA / guidance governance

- ✅ **Educational instrument registry** — RBA + counselor approval policy
- ❌ **Guidance governance failure**

```text
Error: POST /api/nibiru/chat expected 200, got 500
{
  "ok": false,
  "error": {
    "code": "SERVER_ERROR",
    "message": "Sunucu hatası oluştu.",
    "requestId": "a35eb2e81c09586f"
  }
}
    at req (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-guidance-governance-smoke.mjs:6:392)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-guidance-governance-smoke.mjs:19:26
```

## Student Intelligence / Learning Graph

- ❌ **Student Intelligence failure**

```text
Error: GET /api/student-intelligence/profile expected 200, got 400
{
  "ok": false,
  "error": {
    "code": "D1_ERROR: Your account has exceeded D1's free tier daily row write limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue. See https://developers.cloudflare.com/d1/platform/limits/ for more details.",
    "message": "Öğrenci akademik profili oluşturulamadı."
  }
}
    at req (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-student-intelligence-smoke.mjs:6:392)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-student-intelligence-smoke.mjs:12:14
```

## 100K Queue kapasite kabulü

- ✅ **Başarılı** — 100.000 izole sentetik kayıt · 1000 Queue parçası · 0 başarısız parça · son 30 günlük kanıt yeniden kullanıldı
- Run: `cap_f55767b0-a5d9-493b-b86f-891ee4a65ea5`
