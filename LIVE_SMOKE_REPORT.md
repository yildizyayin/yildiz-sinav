# Live Staging Smoke Report

- Target: `https://yildiz-sinav-v1.rtsgida.workers.dev`
- Time: `2026-08-27T20:39:00.312Z`
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
- ✅ **Nibiru WhatsApp role pairing preparation** — parent/teacher/manager role-safe pairing codes
- ✅ **Optik 840 + printer calibration + personalized print flow** — 65 students · A/B set recognized · existing assignments preserved · Canon Öğretmenler Odası
- ✅ **License rollout backward compatibility** — LEGACY · LEGACY_ACTIVE
- ✅ **Activation request + notification flow** — manager request → Super Admin decision → manager notification
- ✅ **Student wrong/blank learning flow** — 4 question rows available
- ✅ **Nibiru parent context + non-academic redirect** — student-linked context · AI disclosure · safe redirect
- ✅ **Parent weekly summary + notification flow** — 1 exams in last 7 days
- ✅ **Demo identity preservation** — 45 guests preserved after rejected smoke request

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
Error: POST /api/nibiru/coach/items/coach_20260827_stu_a001_i1/mini-test expected 201, got 200
{
  "ok": true,
  "reused": true,
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
    "code": "D1_ERROR: no such column: future_identity_label at offset 31: SQLITE_ERROR",
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
