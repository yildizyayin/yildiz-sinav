# Live Staging Smoke Report

- Target: `https://yildiz-sinav-v1.rtsgida.workers.dev`
- Time: `2026-08-27T20:18:29.583Z`
- Result: **PASSED**
- Passed checks before finish: **17**

## Checks

- ✅ **Public config** — Anunex — Nibiru AI Destekli Ölçme ve Analiz Platformu / staging
- ✅ **Unauthenticated API boundary**
- ✅ **Turnstile server validation**
- ✅ **Manager tenant dashboard** — 67 active / 45 guest / 21 applied exams
- ✅ **Active/guest student separation** — 67 / 45
- ✅ **110-person exam matching preview** — 65 core active + 45 known guest + 0 new guest
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

- ✅ **Nibiru manager AI transparency + institution scope** — TODAY_STATUS
- ❌ **Final feature smoke failure**

```text
Error: Nibiru settings missing
{
  "ok": true,
  "settings": {
    "id": "platform",
    "assistant_name": "Nibiru AI",
    "enabled": 1,
    "whatsapp_enabled": 0,
    "public_whatsapp_number": "+905441790940",
    "ai_model": "@cf/zai-org/glm-4.7-flash",
    "education_language_mode": "MEB_DEVELOPMENTAL",
    "transparency_text": "Ben Nibiru AI, Anunex’in yapay zekâ akademik asistanıyım.",
    "updated_by": null,
    "updated_at": "2026-08-27 20:17:32"
  },
  "provider": {
    "ready": false,
    "verifyToken": false,
    "appSecret": false,
    "accessToken": false,
    "phoneNumberId": false
  }
}
    at assert (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-final-features-smoke.mjs:9:36)
    at file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-final-features-smoke.mjs:28:2
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
```

## Nibiru academic growth / communication checks

- ✅ **Official academic target source registry** — MEB Rota Maarif + e-Okul + ÖSYM + YÖK Atlas
- ✅ **Official target search boundaries** — LGS 0 · YKS 0 verified rows currently loaded
- ✅ **Institution announcement center** — panel + WhatsApp-template + SMS-fallback ledger ready
- ❌ **Academic growth smoke failure**

```text
Error: Nibiru worksheet answer lacks AI disclosure
{
  "ok": true,
  "answer": "Nibiru: 2026-08-27 için yetki alanınızda yakın tarihli planlanmış bir föy görünmüyor. Föy Takvimi sekmesinden yıllık planı kontrol edebilirsiniz.",
  "intent": "WORKSHEET_CALENDAR",
  "outcome": "ANSWERED"
}
    at assert (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-academic-growth-smoke.mjs:9:36)
    at file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-academic-growth-smoke.mjs:35:2
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
```

## Standard package acceptance

- ❌ **Standard acceptance failure**

```text
Error: GET /api/standard-readiness expected 200, got 404
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "API yolu bulunamadı."
  }
}
    at req (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-smoke.mjs:6:392)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-smoke.mjs:11:18
```

## Standard final closure

- ❌ **Standard final closure failure**

```text
Error: GET /api/standard-readiness failed with 404
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "API yolu bulunamadı."
  }
}
    at assert (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-closure-smoke.mjs:4:36)
    at jsonReq (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-closure-smoke.mjs:7:339)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-closure-smoke.mjs:12:18
```

## Counselor-approved RBA / guidance governance

- ❌ **Guidance governance failure**

```text
Error: GET /api/nibiru/guidance/instruments expected 200, got 404
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "API yolu bulunamadı."
  }
}
    at req (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-guidance-governance-smoke.mjs:6:392)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-guidance-governance-smoke.mjs:12:20
```

## Student Intelligence / Learning Graph

- ❌ **Student Intelligence failure**

```text
Error: GET /api/student-intelligence/profile expected 200, got 400
{
  "ok": false,
  "error": {
    "code": "D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'",
    "message": "Öğrenci akademik profili oluşturulamadı."
  }
}
    at req (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-student-intelligence-smoke.mjs:6:392)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-student-intelligence-smoke.mjs:12:14
```
