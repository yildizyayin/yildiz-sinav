# Live Staging Smoke Report

- Target: `https://demo.anunex.com`
- Time: `2026-09-04T15:49:09.305Z`
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
Error: Personalized Optik 840 preparation did not return 65 active students
{
  "ok": true,
  "template": {
    "id": "v_opt840",
    "name": "Optik 840",
    "pageWidthMm": 210,
    "pageHeightMm": 297,
    "printFields": {
      "fields": [
        {
          "key": "studentName",
          "xMm": 15,
          "yMm": 15
        },
        {
          "key": "studentNumber",
          "xMm": 125,
          "yMm": 15
        },
        {
          "key": "class",
          "xMm": 165,
          "yMm": 15
        },
        {
          "key": "bookletCode",
          "xMm": 190,
          "yMm": 15
        },
        {
          "key": "institutionCode",
          "xMm": 15,
          "yMm": 27
        },
        {
          "key": "examTitle",
          "xMm": 70,
          "yMm": 27
        }
      ]
    }
  },
  "institution": {
    "id": "inst_demo",
    "name": "Demo Koleji",
    "code": "DEMO"
  },
  "class": {
    "id": "class_7a",
    "institution_id": "inst_demo",
    "season_id": "season_2627",
    "grade_level": 7,
    "section": "A",
    "name": "7/A",
    "active": 1
  },
  "exam": {
    "id": "exam_demo_active",
    "title": "Demo Merkezi Deneme 21",
    "exam_type": "KURUM",
    "grade_level": 7,
    "exam_date": "2026-08-20"
  },
  "bookletCodes": [
    "A",
    "B"
  ],
  "students": [
    {
      "id": "stu_a001",
      "first_name": "Aktif1",
      "last_name": "Öğrenci1",
      "student_number": "1001",
      "grade_level": 7,
      "section": "A",
      "booklet_code": "A"
    },
    {
      "id": "stu_a002",
      "first_name": "Aktif2",
      "last_name": "Öğrenci2",
      "student_number": "1002",
      "grade_level": 7,
      "section": "A",
      "booklet_code": "A"
    },
    {
      "id": "stu_a003",
      "first_name": "Aktif3",
      "last_name": "Öğrenci3",
      "student_number": "1003",
      "grade_level": 7,
      "section": "A",
      "booklet_code": "A"
    },
    {
      "id": "stu_a004",
      "first_name": "Aktif4",
      "last_name": "Öğrenci4",
      "student_number": "1004",
      "grade_level": 7,
      "section": "A",
      "booklet_code": "A"
    },
    {
      "id": "stu_a005",
      "first_name": "Aktif5",
      "last_name": "Öğrenci5",
      "student_number": "1005",
      "grade_level": 7,
      "section": "A",
      "booklet_code": "A"
    },
    {
      "id": "stu_a006",
      "first_name": "Aktif6",
      "last_name": "Öğrenci6",
      "student_number": "1006",
      "grade_level": 7,
      "section": "A",
      "booklet_code": "A"
    },
    {
      "id": "stu_a007",
      "first_name": "Aktif7",
      "last_name": "Öğrenci7",
      "student_number": "1007",
      "grade_level": 7,
      "section": "A",
      "booklet_code": "A"
    },
    {
      "id": "stu_a008",
      "first_name": "Aktif8",
      "last_name": "Öğrenci8",
      "student_number": "1008",
      "grade_level": 7,
      "section": "A",
      "booklet_code": "A"
    },
    {
      "id": "stu_a009",
      "first_name": "Aktif9",
      "last_name": "Öğrenci9",
      "student_number": "1009",
      "grade_level": 7,
      "section": "A",
      "booklet_code": "A"
    },
    {
      "id": "stu_a010",
      "first_name": "Aktif10",
      "last_name": "Öğrenci10",
      "student_number": "1010",
      "grade_level": 7,
      "section": "A",
      "booklet_code": "A"
    },
    {
      "id": "stu_a011",
      "first_name": "Aktif11",
      "last_name": "Öğrenci11",
      "student_number": "1011",
      "grade_level": 7,
      "section": "A",
      "booklet_code": "A"
    },
    {
      "id": "stu_a012",
      "first_name": "Aktif12",
      "last_name": "Öğrenci12",
      "student_number": "1012",
      "grade_level": 7,
      "section": "A",
      "booklet_code": "A"
    },
    {
      "id": "stu_a013",
      "first_name": "Aktif13",
      "last_name": "Öğrenci13",
      "student_number": "1013",
      "grade_level": 7,
      "section": "A",
      "booklet_code": "A"
    },
    {
      "id": "stu_a014",
      "first_name": "Aktif14",
      "last_name": "Öğrenci14",
      "student_number": "1014",
      "grade_level": 7,
      "section": "A",
      "booklet_code": "A"
    },
    {
      "id": "stu_a015",
      "first_name": "Aktif15",
      "last_name": "Öğrenci15",
      "student_number": "1015",
      "grade_level": 7,
      "section": "A",
      "booklet_code": "A"
    },
    {
      "id": "stu_a016",
      "first_name": "Aktif16",
      "last_name": "Öğrenci16",
      "student_number": "1016",
      "grade_level": 7,
      "section": "A",
      "booklet_code": "A"
    },
    {
      "id": "stu_a017",
      "first_name": "Aktif17",
      "last_name": "Öğrenci17",
      "student_number": "1017",
      "grade_level": 7,
      "section": "A",
      "booklet_code": "A"
    },
    {
      "id": "stu_a018",
      "first_name": "Aktif18",
      "last_name": "Öğrenci18",
      "student_number": "1018",
      "grade_level": 7,
      "section": "A",
      "booklet_code": "A"
    },
    {
      "id": "stu_a019",
      "first_name": "Aktif19",
      "last_name": "Öğrenci19",
      "student_number": "1019",
      "grade_level": 7,
      "section": "A",
      "booklet_code": "A"
    },
    {
      "id": "stu_a020",
      "first_name": "Aktif20",
      "last_name": "Öğrenci20",
      "student_number": "1020",
      "grade_level": 7,
      "section": "A",
      "booklet_code": "A"
    }
  ]
}
    at assert (file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-final-features-smoke.mjs:9:36)
    at file:///home/runner/work/yildiz-sinav/yildiz-sinav/scripts/live-final-features-smoke.mjs:60:2
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
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

- ✅ **Persistent student intelligence profile** — v44 · 174 evidence · 3 subjects
- ✅ **Idempotent refresh + versioned history** — 44 history snapshots
- ✅ **Live outcome → evidence → Learning Graph sync** — 6 outcome nodes · 2 current priorities
- ✅ **Parent-safe intelligence scope** — academic view retained · counselor dimensions masked
- ✅ **Branch teacher subject boundary** — Matematik only · cross-domain history blocked
- ✅ **Counselor-reviewed development integration** — 441 reviewed signals · no raw responses
- ✅ **Nibiru common intelligence context** — profile v44 · 2 compact priorities · EDUCATION_COACH

## 100K Queue kapasite kabulü

- ✅ **Başarılı** — 100.000 izole sentetik kayıt · 1000 Queue parçası · 0 başarısız parça · son 30 günlük kanıt yeniden kullanıldı
- Run: `cap_f55767b0-a5d9-493b-b86f-891ee4a65ea5`
