# Historical live smoke reports

These reports describe their recorded dates and revisions. They are not release acceptance for the current branch. Both histories are retained when integrating main.

## Development branch report

# Live Staging Smoke Report

- Target: `https://demo.anunex.com`
- Time: `2026-09-28T15:31:39.301Z`
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
    "requestId": "a423cbd92a6b15fb"
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

- ✅ **Nibiru manager AI transparency + institution scope** — TODAY_STATUS
- ❌ **Final feature smoke failure**

```text
Error: POST /api/nibiru/pairing-code expected 200, got 500
{
  "ok": false,
  "error": {
    "code": "SERVER_ERROR",
    "message": "Sunucu hatası oluştu.",
    "requestId": "a423cc496cf4a364"
  }
}
    at req (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-final-features-smoke.mjs:11:392)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-final-features-smoke.mjs:34:18
```

## Nibiru academic growth / communication checks

- ✅ **Official academic target source registry** — MEB Rota Maarif + e-Okul + ÖSYM + YÖK Atlas
- ✅ **Official target search boundaries** — LGS 0 · YKS 0 verified rows currently loaded
- ✅ **Institution announcement center** — panel + WhatsApp-template + SMS-fallback ledger ready
- ✅ **Worksheet calendar + Nibiru guidance** — 5 published calendar rows visible
- ✅ **Teacher communication + worksheet scope** — role-scoped endpoints available
- ✅ **Student target eligibility + analysis boundary** — grade 7 · target not set
- ✅ **Super Admin official-source governance** — source URL + official flag enforced
- ✅ **Official question intelligence registry** — MEB LGS + ÖSYM YKS + EBA/OGM references · protected text not copied
- ✅ **Official question intelligence authorization** — Super Admin only status/source governance
- ✅ **Official outcome-history contract** — 0 outcome rows · historical priority is explicitly not a prediction guarantee

## Standard package acceptance

- ✅ **Standard readiness gate** — core ready · external setup 2
- ✅ **External provider activation contract** — YouTube setup · WhatsApp setup
- ✅ **Standard question bank** — 32 approved printable questions
- ✅ **Education Coach verified mastery cycle** — 3 tasks · existing mastered evidence reused · progress 0%
- ✅ **Zero Error exam source** — institution exams are selectable, not only central snapshots
- ✅ **Correct / wrong / blank question review** — all answer states available
- ✅ **Publisher solution + topic micro-learning contract** — registered video path
- ❌ **Standard acceptance failure**

```text
Error: POST /api/student-books/personal expected 201, got 500
{
  "ok": false,
  "error": {
    "code": "SERVER_ERROR",
    "message": "Sunucu hatası oluştu.",
    "requestId": "a423cc604bd867dd"
  }
}
    at req (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-smoke.mjs:6:476)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-smoke.mjs:66:17
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
    "requestId": "a423cc64bd237834"
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
Error: Nibiru did not create/reuse counselor-governed RBA proposal
    at assert (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-guidance-governance-smoke.mjs:4:36)
    at file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-guidance-governance-smoke.mjs:20:2
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
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
- Run: `cap_6b61cc6a-187b-4e6f-9367-b1f49f0a6a85`


## Main branch report

# Live Staging Smoke Report

- Target: `https://demo.anunex.com`
- Time: `2026-09-25T19:24:00.463Z`
- Result: **PASSED**
- Passed checks before finish: **17**

## Checks

- ✅ **Public config** — Anunex — Nibiru AI Destekli Ölçme ve Analiz Platformu / staging
- ✅ **Unauthenticated API boundary**
- ✅ **Turnstile server validation**
- ✅ **Manager tenant dashboard** — 162 active / 45 guest / 21 applied exams
- ✅ **Active/guest student separation** — 162 / 45
- ✅ **110-person exam matching preview** — 20 core active + 45 known guest + 0 new guest
- ✅ **110-person chunked exam evaluation** — 65 committed in 13 safe chunks
- ✅ **Repeat guest identity matching** — still 45 guests; no duplicates
- ✅ **Student dashboard data** — 2 developing outcomes
- ✅ **Student self-service + IDOR boundary** — 9 visible exams
- ✅ **Parent linked-child boundary** — 7/A
- ✅ **Branch teacher dashboard scope** — 1 classes / 20 students
- ✅ **Branch teacher subject scope** — Matematik
- ✅ **Guidance dashboard scope** — 1 classes / 20 students
- ✅ **Guidance teacher all-subject scope** — Fen Bilimleri, Matematik, Türkçe
- ✅ **Super Admin institution access**
- ✅ **Session revocation on logout**

## Mandatory KVKK / privacy-by-design live gate

- Environment: staging
- Suite: `kvkk-live-v1`
- Result: **PASSED**
- Synthetic-only checks completed: **17**
- ✅ **Cross-tenant read/write denial**
- ✅ **Student self scope**
- ✅ **Parent linked-child scope**
- ✅ **Teacher assignment scope**
- ✅ **Guidance-only raw assessment boundary**
- ✅ **Logout session revocation**
- ✅ **AI outbound redaction / pseudonymization**
- ✅ **WhatsApp academic-detail minimization**
- ✅ **Protected export authorization + audit evidence**
- ✅ **Notice version + acknowledgement evidence**
- ✅ **Purpose-specific consent grant + withdrawal**
- ✅ **Synthetic anonymization job enters legal-review gate**
- ✅ **Provider/transfer registry completeness with release still blocked**
- ✅ **Incident-response 72-hour timer**
- ✅ **Camera raw-frame server rejection**
- ✅ **Voice raw-audio ephemeral / voiceprint disabled**
- ✅ **Smoke output contains no raw PII/secrets**

## Final platform feature checks

- ✅ **Nibiru manager AI transparency + institution scope** — TODAY_STATUS
- ✅ **Nibiru WhatsApp role pairing preparation** — parent/teacher/manager role-safe pairing codes
- ❌ **Final feature smoke failure**

```text
Error: Optik 840 did not receive migration-generated print fields
{
  "ok": true,
  "templates": [
    {
      "template_id": "opt_demo",
      "name": "Demo Kişisel Optik",
      "vendor": "Platform",
      "status": "READY",
      "owner_type": "CENTRAL",
      "owner_id": null,
      "version_id": "optv_demo",
      "version": "v1",
      "page_width_mm": 210,
      "page_height_mm": 297,
      "has_parser": 1,
      "has_camera": 1,
      "has_print": 1
    },
    {
      "template_id": "opt129",
      "name": "Optik 129",
      "vendor": "Sekonic",
      "status": "READY",
      "owner_type": "CENTRAL",
      "owner_id": null,
      "version_id": "v_opt129",
      "version": "placeholder",
      "page_width_mm": 210,
      "page_height_mm": 297,
      "has_parser": 0,
      "has_camera": 0,
      "has_print": 1
    },
    {
      "template_id": "opt129",
      "name": "Optik 129",
      "vendor": "Sekonic",
      "status": "READY",
      "owner_type": "CENTRAL",
      "owner_id": null,
      "version_id": "v_opt129_sekonic",
      "version": "sekonic-fmt-2026-09",
      "page_width_mm": 210,
      "page_height_mm": 297,
      "has_parser": 1,
      "has_camera": 0,
      "has_print": 1
    },
    {
      "template_id": "opt7108",
      "name": "Optik 7108 LGS",
      "vendor": "Sekonic",
      "status": "READY",
      "owner_type": "CENTRAL",
      "owner_id": null,
      "version_id": "v_opt7108_sekonic",
      "version": "sekonic-fmt-2026-09",
      "page_width_mm": 210,
      "page_height_mm": 297,
      "has_parser": 1,
      "has_camera": 0,
      "has_print": 1
    }
  ]
}
    at assert (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-final-features-smoke.mjs:9:36)
    at file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-final-features-smoke.mjs:41:2
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
```

## Nibiru academic growth / communication checks

- ✅ **Official academic target source registry** — MEB Rota Maarif + e-Okul + ÖSYM + YÖK Atlas
- ✅ **Official target search boundaries** — LGS 0 · YKS 0 verified rows currently loaded
- ✅ **Institution announcement center** — panel + WhatsApp-template + SMS-fallback ledger ready
- ✅ **Worksheet calendar + Nibiru guidance** — 5 published calendar rows visible
- ✅ **Teacher communication + worksheet scope** — role-scoped endpoints available
- ✅ **Student target eligibility + analysis boundary** — grade 7 · target not set
- ✅ **Super Admin official-source governance** — source URL + official flag enforced
- ✅ **Official question intelligence registry** — MEB LGS + ÖSYM YKS + EBA/OGM references · protected text not copied
- ✅ **Official question intelligence authorization** — Super Admin only status/source governance
- ✅ **Official outcome-history contract** — 0 outcome rows · historical priority is explicitly not a prediction guarantee

## Standard package acceptance

- ✅ **Standard readiness gate** — core ready · external setup 2
- ✅ **External provider activation contract** — YouTube setup · WhatsApp setup
- ✅ **Standard question bank** — 32 approved printable questions
- ✅ **Education Coach verified mastery cycle** — 3 tasks · existing mastered evidence reused · progress 0%
- ✅ **Zero Error exam source** — institution exams are selectable, not only central snapshots
- ✅ **Correct / wrong / blank question review** — all answer states available
- ✅ **Publisher solution + topic micro-learning contract** — registered video path
- ✅ **Kişiye Özel Kitap** — 2 outcomes · 6 questions
- ✅ **Sıfır Hata Kitapçığı** — 2 wrong · 2 blank · 8 practice
- ✅ **5–12 educational game catalog** — 5 age-appropriate games for grade 5
- ✅ **12th-grade YKS target engine** — maximum 3 targets · official data gate active

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

- ✅ **Persistent student intelligence profile** — v102 · 174 evidence · 3 subjects
- ✅ **Idempotent refresh + versioned history** — 50 history snapshots
- ✅ **Live outcome → evidence → Learning Graph sync** — 6 outcome nodes · 2 current priorities
- ✅ **Parent-safe intelligence scope** — academic view retained · counselor dimensions masked
- ✅ **Branch teacher subject boundary** — Matematik only · cross-domain history blocked
- ✅ **Counselor-reviewed development integration** — 954 reviewed signals · no raw responses
- ✅ **Nibiru common intelligence context** — profile v102 · 2 compact priorities · EDUCATION_COACH

## 100K Queue kapasite kabulü

- ✅ **Başarılı** — 100.000 izole sentetik kayıt · 1000 Queue parçası · 0 başarısız parça · son 30 günlük kanıt yeniden kullanıldı
- Run: `cap_f55767b0-a5d9-493b-b86f-891ee4a65ea5`
