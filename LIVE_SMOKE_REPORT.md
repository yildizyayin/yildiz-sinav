# Live Staging Smoke Report

- Target: `https://yildiz-sinav-v1.rtsgida.workers.dev`
- Time: `2026-08-25T21:49:22.136Z`
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

- ✅ **Nibiru manager AI transparency + institution scope** — TODAY_STATUS
- ✅ **Nibiru WhatsApp role pairing preparation** — parent/teacher/manager role-safe pairing codes
- ✅ **Optik 840 + printer calibration + personalized print flow** — 65 students · A/B set recognized · existing assignments preserved · Canon Öğretmenler Odası
- ✅ **License rollout backward compatibility** — LEGACY · LEGACY_ACTIVE
- ✅ **Activation request + notification flow** — manager request → Super Admin decision → manager notification
- ✅ **Student wrong/blank learning flow** — 0 question rows available
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

- ❌ **Standard acceptance failure**

```text
Error: Standard operational blockers remain
{
  "ok": true,
  "environment": "staging",
  "generatedAt": "2026-08-25T21:50:31.801Z",
  "checks": [
    {
      "key": "IDENTITY",
      "label": "Kimlik / Tenant / Yetki",
      "state": "READY",
      "detail": "Veri modeli hazır"
    },
    {
      "key": "STUDENT_CORE",
      "label": "Öğrenci / Sınıf / Şube",
      "state": "READY",
      "detail": "Veri modeli hazır"
    },
    {
      "key": "TEACHER_CORE",
      "label": "Öğretmen / Branş / Rehberlik",
      "state": "READY",
      "detail": "Veri modeli hazır"
    },
    {
      "key": "EXAM_CENTER",
      "label": "Sınav Merkezi",
      "state": "READY",
      "detail": "Veri modeli hazır"
    },
    {
      "key": "OPTICAL_CENTER",
      "label": "Optik Hazırla / Bas / Oku",
      "state": "READY",
      "detail": "Veri modeli hazır"
    },
    {
      "key": "EVALUATION",
      "label": "Değerlendirme Motoru",
      "state": "READY",
      "detail": "Veri modeli hazır"
    },
    {
      "key": "OUTCOMES",
      "label": "Kazanım Motoru",
      "state": "READY",
      "detail": "Veri modeli hazır"
    },
    {
      "key": "WORKSHEETS",
      "label": "Föy Merkezi",
      "state": "READY",
      "detail": "Veri modeli hazır"
    },
    {
      "key": "QUESTION_BANK",
      "label": "Soru Havuzu",
      "state": "READY",
      "detail": "Veri modeli hazır"
    },
    {
      "key": "TARGETS",
      "label": "LGS / YKS Hedef Motoru",
      "state": "READY",
      "detail": "Veri modeli hazır"
    },
    {
      "key": "STUDENT_EXPERIENCE",
      "label": "Öğrenci Kişiselleştirme / Sayaç / Oyun / Mikro Öğrenme",
      "state": "READY",
      "detail": "Veri modeli hazır"
    },
    {
      "key": "PERSONAL_BOOKS",
      "label": "Kişiye Özel Kitap",
      "state": "READY",
      "detail": "Veri modeli hazır"
    },
    {
      "key": "ZERO_ERROR",
      "label": "Sıfır Hata Kitapçığı",
      "state": "READY",
      "detail": "Veri modeli hazır"
    },
    {
      "key": "NOTIFICATIONS",
      "label": "Bildirim Merkezi",
      "state": "READY",
      "detail": "Veri modeli hazır"
    },
    {
      "key": "R2",
      "label": "Dosya / PDF / Baskı Depolama",
      "state": "READY",
      "detail": "R2 binding hazır"
    },
    {
      "key": "NIBIRU_BASIC",
      "label": "Nibiru Standard AI",
      "state": "READY",
      "detail": "Workers AI binding hazır"
    },
    {
      "key": "YOUTUBE_MICRO",
      "label": "YouTube Mikro Konu Videosu",
      "state": "CONFIG_REQUIRED",
      "detail": "YOUTUBE_API_KEY secret gerekli"
    },
    {
      "key": "WHATSAPP",
      "label": "WhatsApp Akademik Kanalı",
      "state": "CONFIG_REQUIRED",
      "detail": "WhatsApp secret/telefon kimliği yapılandırılmalı"
    }
  ],
  "summary": {
    "total": 18,
    "ready": 16,
    "missing": 0,
    "configRequired": 2,
    "coreReady": true
  },
  "operational": [
    {
      "key": "READY_OPTICAL",
      "label": "Okunabilir hazır optik şablonu",
      "value": 1,
      "state": "READY",
      "detail": "1 hazır optik şablonu var.",
      "blocking": true
    },
    {
      "key": "VERIFIED_SCORING",
      "label": "Doğrulanmış puanlama kuralı",
      "value": 1,
      "state": "READY",
      "detail": "1 doğrulanmış puanlama sürümü var.",
      "blocking": true
    },
    {
      "key": "PRINTABLE_QUESTIONS",
      "label": "Basılabilir onaylı soru",
      "value": 0,
      "state": "SETUP_REQUIRED",
      "detail": "Soru Havuzunda APPROVED + OWNED/LICENSED/PUBLIC_DOMAIN soru eklenmelidir.",
      "blocking": true
    },
    {
      "key": "PUBLISHED_WORKSHEETS",
      "label": "Yayınlanmış föy",
      "value": 4,
      "state": "READY",
      "detail": "4 yayınlanmış föy var.",
      "blocking": true
    },
    {
      "key": "OFFICIAL_TARGET_DATA",
      "label": "LGS/YKS hedef verisi",
      "value": 0,
      "state": "SETUP_REQUIRED",
      "detail": "LGS/YKS hedef araması için resmî hedef verisi içe aktarılmalıdır.",
      "blocking": false
    },
    {
      "key": "ACTIVE_INSTITUTION",
      "label": "Aktif kurum",
      "value": 1,
      "state": "READY",
      "detail": "1 aktif kurum var.",
      "blocking": true
    },
    {
      "key": "ACTIVE_STUDENT",
      "label": "Aktif öğrenci",
      "value": 65,
      "state": "READY",
      "detail": "65 aktif öğrenci var.",
      "blocking": true
    },
    {
      "key": "TEACHER_ASSIGNMENT",
      "label": "Öğretmen ataması",
      "value": 2,
      "state": "READY",
      "detail": "2 aktif öğretmen-sınıf/branş ataması var.",
      "blocking": true
    }
  ],
  "operationalError": null,
  "acceptance": {
    "coreReady": true,
    "blockingSetup": 1,
    "externalSetup": 2,
    "coreAcceptanceReady": false,
    "saleReady": false,
    "standardAcceptanceReady": false
  }
}
    at assert (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-smoke.mjs:4:36)
    at file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-smoke.mjs:13:2
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
```
