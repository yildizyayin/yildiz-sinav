# Live Staging Smoke Report

- Target: `https://yildiz-sinav-v1.rtsgida.workers.dev`
- Time: `2026-08-25T21:59:25.842Z`
- Result: **FAILED**
- Passed checks before finish: **3**

## Checks

- ✅ **Public config** — Ölçme Platformu / staging
- ✅ **Unauthenticated API boundary**
- ✅ **Turnstile server validation**

## Failure

```text
Error: Manager dashboard counts mismatch
{
  "Aktif Öğrenci": 67,
  "Misafir Öğrenci": 45,
  "Uygulanan Sınav": 21
}
    at assert (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-smoke-v2.mjs:10:21)
    at main (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-smoke-v2.mjs:107:3)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
```

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
- ✅ **Standard question bank** — 18 approved printable questions
- ✅ **Zero Error exam source** — institution exams are selectable, not only central snapshots
- ✅ **Correct / wrong / blank question review** — all answer states available
- ✅ **Publisher solution + topic micro-learning contract** — YOUTUBE_NOT_CONFIGURED
- ❌ **Standard acceptance failure**

```text
Error: POST /api/student-books/personal expected 201, got 400
{
  "ok": false,
  "error": {
    "code": "INSUFFICIENT_EVIDENCE",
    "message": "Kişiye Özel Kitap oluşturmak için henüz yeterli gelişim alanı kanıtı yok."
  }
}
    at req (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-smoke.mjs:6:392)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-standard-smoke.mjs:31:17
```
