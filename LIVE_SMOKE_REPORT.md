# Live Staging Smoke Report

- Target: `https://demo.anunex.com`
- Time: `2026-09-02T14:57:56.747Z`
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
- ✅ **Optik 840 + printer calibration + personalized print flow** — 65 students · A/B set recognized · existing assignments preserved · Canon Öğretmenler Odası
- ✅ **License rollout backward compatibility** — LEGACY · LEGACY_ACTIVE
- ✅ **Activation request + notification flow** — manager request → Super Admin decision → manager notification
- ✅ **Student wrong/blank learning flow** — 4 question rows available
- ✅ **Nibiru parent context + non-academic redirect** — student-linked context · AI disclosure · safe redirect
- ✅ **Parent weekly summary + notification flow** — 0 exams in last 7 days
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

- ✅ **Persistent student intelligence profile** — v38 · 174 evidence · 3 subjects
- ✅ **Idempotent refresh + versioned history** — 38 history snapshots
- ✅ **Live outcome → evidence → Learning Graph sync** — 6 outcome nodes · 2 current priorities
- ✅ **Parent-safe intelligence scope** — academic view retained · counselor dimensions masked
- ✅ **Branch teacher subject boundary** — Matematik only · cross-domain history blocked
- ✅ **Counselor-reviewed development integration** — 387 reviewed signals · no raw responses
- ✅ **Nibiru common intelligence context** — profile v38 · 2 compact priorities · EDUCATION_COACH

## 100K Queue kapasite kabulü

- ✅ **Başarılı** — 100.000 izole sentetik kayıt · 1000 Queue parçası · 0 başarısız parça · son 30 günlük kanıt yeniden kullanıldı
- Run: `cap_f55767b0-a5d9-493b-b86f-891ee4a65ea5`
