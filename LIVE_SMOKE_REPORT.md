# Live Staging Smoke Report

- Target: `https://yildiz-sinav-v1.rtsgida.workers.dev`
- Time: `2026-08-20T20:25:38.127Z`
- Result: **FAILED**
- Passed checks before finish: **8**

## Checks

- ✅ **Public config** — Ölçme Platformu / staging
- ✅ **Unauthenticated API boundary**
- ✅ **Turnstile server validation**
- ✅ **Manager tenant dashboard** — 65 active / 45 guest / 21 applied exams
- ✅ **Active/guest student separation** — 65 / 45
- ✅ **110-person exam matching preview** — 65 active + 45 known guest + 0 new guest
- ✅ **110-person chunked exam evaluation** — 110 committed in 22 safe chunks
- ✅ **Repeat guest identity matching** — still 45 guests; no duplicates

## Failure

```text
Error: Historical student results missing
{
  "ok": true,
  "exams": [
    {
      "exam_id": "exam_demo_active",
      "title": "Demo Merkezi Deneme 21",
      "exam_date": "2026-08-20",
      "correct_count": 30,
      "wrong_count": 0,
      "blank_count": 0,
      "net": 30,
      "score": null,
      "success_percent": 100,
      "institution_rank": 1,
      "booklet_code": "A"
    },
    {
      "exam_id": "exam_hist_08",
      "title": "Haftalık Deneme 08",
      "exam_date": "2026-03-10",
      "correct_count": 22,
      "wrong_count": 6,
      "blank_count": 2,
      "net": 25.2,
      "score": null,
      "success_percent": 84,
      "institution_rank": 1,
      "booklet_code": "A"
    },
    {
      "exam_id": "exam_hist_07",
      "title": "Haftalık Deneme 07",
      "exam_date": "2026-03-09",
      "correct_count": 22,
      "wrong_count": 6,
      "blank_count": 2,
      "net": 24.3,
      "score": null,
      "success_percent": 81,
      "institution_rank": 1,
      "booklet_code": "A"
    },
    {
      "exam_id": "exam_hist_06",
      "title": "Haftalık Deneme 06",
      "exam_date": "2026-02-08",
      "correct_count": 22,
      "wrong_count": 6,
      "blank_count": 2,
      "net": 23.4,
      "score": null,
      "success_percent": 78,
      "institution_rank": 1,
      "booklet_code": "A"
    },
    {
      "exam_id": "exam_hist_05",
      "title": "Haftalık Deneme 05",
      "exam_date": "2026-02-07",
      "correct_count": 22,
      "wrong_count": 6,
      "blank_count": 2,
      "net": 22.5,
      "score": null,
      "success_percent": 75,
      "institution_rank": 1,
      "booklet_code": "A"
    },
    {
      "exam_id": "exam_hist_04",
      "title": "Haftalık Deneme 04",
      "exam_date": "2026-02-06",
      "correct_count": 22,
      "wrong_count": 6,
      "blank_count": 2,
      "net": 21.6,
      "score": null,
      "success_percent": 72,
      "institution_rank": 1,
      "booklet_code": "A"
    },
    {
      "exam_id": "exam_hist_03",
      "title": "Haftalık Deneme 03",
      "exam_date": "2026-01-05",
      "correct_count": 22,
      "wrong_count": 6,
      "blank_count": 2,
      "net": 20.7,
      "score": null,
      "success_percent": 69,
      "institution_rank": 1,
      "booklet_code": "A"
    },
    {
      "exam_id": "exam_hist_02",
      "title": "Haftalık Deneme 02",
      "exam_date": "2026-01-04",
      "correct_count": 22,
      "wrong_count": 6,
      "blank_count": 2,
      "net": 19.8,
      "score": null,
      "success_percent": 66,
      "institution_rank": 1,
      "booklet_code": "A"
    },
    {
      "exam_id": "exam_hist_01",
      "title": "Haftalık Deneme 01",
      "exam_date": "2026-01-03",
      "correct_count": 22,
      "wrong_count": 6,
      "blank_count": 2,
      "net": 18.9,
      "score": null,
      "success_percent": 63,
      "institution_rank": 1,
      "booklet_code": "A"
    }
  ]
}
    at assert (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-smoke-v2.mjs:10:21)
    at main (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-smoke-v2.mjs:133:3)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
```
