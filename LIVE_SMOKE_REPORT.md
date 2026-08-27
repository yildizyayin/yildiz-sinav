# Live Staging Smoke Report

- Target: `https://yildiz-sinav-v1.rtsgida.workers.dev`
- Time: `2026-08-27T20:29:46.057Z`
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
    "transparency_text": "Ben Nibiru, Anunex’in yapay zekâ akademik asistanıyım.",
    "updated_by": null,
    "updated_at": "2026-08-27 20:28:53"
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
  "outcome": "ANSWERED",
  "orchestration": {
    "version": "multi-ai-v1",
    "specialist": "INSTITUTION_INSIGHT",
    "label": "Kurum Akademik İçgörü AI",
    "reason": "Kurum/platform kapsamındaki akademik yönetim verisi önceliklendirildi.",
    "subjectHint": null
  },
  "coachPlan": null,
  "guidanceRoute": null,
  "guidanceAssessment": null
}
    at assert (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-academic-growth-smoke.mjs:9:36)
    at file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-academic-growth-smoke.mjs:35:2
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
```

## Standard package acceptance

- ✅ **Standard readiness gate** — core ready · external setup 2
- ✅ **External provider activation contract** — YouTube setup · WhatsApp setup
- ✅ **Standard question bank** — 20 approved printable questions
- ❌ **Standard acceptance failure**

```text
Error: POST /api/nibiru/coach/items/coach_20260827_stu_a001_i1/mini-test expected 200, got 201
{
  "ok": true,
  "reused": false,
  "testId": "cmt_002268df-7dc6-4da3-9adf-dc918b000646",
  "cycleNo": 1,
  "questionCount": 5
}
    at req (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-smoke.mjs:6:392)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-smoke.mjs:31:16
```

## Standard final closure

- ✅ **Standard package final readiness** — sale ready · optional channels 2
- ✅ **Student personalization + countdown** — preferences persisted · live countdown + flip clock context
- ✅ **Basic results + outcome analysis** — 9 exams · 6 outcome rows
- ✅ **Role-safe consumable worksheet** — 7. Sınıf Sayısal Föy 1 · PDF + answer key + 40 question supports
- ✅ **Real registered micro-learning route** — solution + topic video available without YouTube API auto-discovery

## Counselor-approved RBA / guidance governance

- ✅ **Educational instrument registry** — RBA + counselor approval policy
- ✅ **Pre-approval student boundary** — questions/submission blocked
- ✅ **Real counselor approval** — assigned GUIDANCE_TEACHER opened assessment
- ✅ **Student assessment submission** — released only after counselor approval
- ✅ **Counselor review gate** — derived scores accepted into development signals
- ✅ **Nibiru reviewed-development context** — only REVIEWED educational signals used

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

## 100K Queue kapasite kabulü

- ✅ **Başarılı** — 100.000 izole sentetik kayıt · 1000 Queue parçası · 0 başarısız parça
- Run: `cap_f55767b0-a5d9-493b-b86f-891ee4a65ea5`
