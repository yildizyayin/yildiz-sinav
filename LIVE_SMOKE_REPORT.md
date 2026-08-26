# Live Staging Smoke Report

- Target: `https://yildiz-sinav-v1.rtsgida.workers.dev`
- Time: `2026-08-26T11:46:32.175Z`
- Result: **PASSED**
- Passed checks before finish: **17**

## Checks

- ✅ **Public config** — Ölçme Platformu / staging
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
- ✅ **Standard question bank** — 18 approved printable questions
- ✅ **Education Coach persistent daily plan** — 2 tasks · same-day reuse · progress 50%
- ✅ **Nibiru specialist orchestration** — study plan → Education Coach · math question → Subject Teacher AI
- ✅ **Zero Error exam source** — institution exams are selectable, not only central snapshots
- ✅ **Correct / wrong / blank question review** — all answer states available
- ✅ **Publisher solution + topic micro-learning contract** — registered video path
- ✅ **Kişiye Özel Kitap** — 2 outcomes · 6 questions
- ✅ **Sıfır Hata Kitapçığı** — 2 wrong · 2 blank · 8 practice
- ✅ **5–6 educational game catalog** — 5 age-appropriate games for grade 5
- ✅ **Guidance AI target route** — 0 active targets · snapshot-safe · no fake rank/net gap
- ✅ **12th-grade YKS target + Guidance AI** — maximum 3 targets · target question → Guidance AI

## Standard final closure

- ✅ **Standard package final readiness** — sale ready · optional channels 2
- ❌ **Standard final closure failure**

```text
Error: Countdown target did not persist into home context
{
  "ok": true,
  "student": {
    "id": "stu_a001",
    "gradeLevel": 7,
    "className": "7/A",
    "enrollmentStatus": "ACTIVE"
  },
  "countdown": {
    "enabled": true,
    "label": "Standard Kabul Sınavı",
    "targetDate": "2027-06-01",
    "days": 279,
    "flipClock": true
  },
  "preferences": {
    "theme_key": "MIDDLE_FOCUS",
    "appearance": "DARK",
    "font_key": "SYSTEM",
    "font_scale": 1.05,
    "animation_level": "NORMAL",
    "countdown_enabled": 1,
    "countdown_flip_clock": 1,
    "motivation_enabled": 1,
    "voice_motivation_enabled": 0,
    "student_id": "stu_a001",
    "countdown_label": "Standard Kabul Sınavı",
    "countdown_target_date": "2027-06-01",
    "motivation_identity": null,
    "updated_at": "2026-08-26 11:47:27"
  },
  "targets": []
}
    at assert (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-closure-smoke.mjs:4:36)
    at file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-closure-smoke.mjs:24:2
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
```
