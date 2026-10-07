# Rubric history, export and cohort distributions

Status: partial local acceptance completed; provider staging and browser acceptance remain pending. All 94 SQL migrations are exercised in the SQLite acceptance fixtures; separate local D1 migration verification is recorded in the continuation log. Migration 0081 adds ordered history/cohort indexes; 0079–0080 remain prerequisites.

## Individual history

GET `/api/learning-observations/students/:id` now supports `view=history`, optional enrollmentId and nextCursor. Every page repeats authorization. History is available to Super Admin, the institution manager for their own institution, the student's own account and a parent with a currently active link. Teacher/guidance history mode is denied; their existing current active class/subject scope remains unchanged. No new historical assignment permission is inferred.

History permits retained LEFT/GRADUATED/ARCHIVED enrollments and inactive prior seasons/classes. Matching observation enrollment/student/institution/season identity is required. Historical observations retain their original class identity even if the enrollment's class later changes; history authority comes from institution/own-student/active-parent-link, not an old teacher assignment. Write and withdrawal flows remain current active TEACHER/SUBJECT only.

Pages contain up to 200 unwithdrawn observations with keyset `(observed_at DESC,id DESC)`. Cursor carries student/view/enrollment scope and is validated; it never grants permission. A changed period/view/user/student suppresses stale results. The UI has history and enrollment controls plus load-more.

CSV export walks all pages of the selected authorized scope from the beginning, with a 5000-observation cap. Exceeding the cap fails without downloading a partial CSV. The browser handles UTF-8 BOM, semicolon/quote/newline escaping and spreadsheet formula prefixes. Each row is a frozen rubric criterion with its selected level and observation evidence/feedback/next step. Withdrawal reasons and hidden records are not exported. No server/public artifact or message is created. Changing scope or unmounting suppresses download.

Pagination/export are reads of mutable visibility, not a globally locked point-in-time snapshot. Concurrent publication or withdrawal can affect subsequent pages. A separate archive directory lists authorized students with unwithdrawn observations, including departed/archived records, with 50-row keyset pagination. It is restricted to the same history roles; Super Admin must choose an institution and that scope is preserved in the selected history panel. Student/parent links and manager institution scope are checked at the server. The existing active-student picker remains separate. Larger background archive exports are pending.

## Institution/guidance rubric distribution

GET `/api/reporting/institution/frozen-rubric-summary` is Super Admin/own-institution manager only. GET `/api/reporting/guidance/frozen-rubric-summary` requires the exact current active institution/season/class GUIDANCE assignment, repeated inside the helper. Other roles are denied cohort access.

Parameters: academicYear, observationPolicy LATEST (default) or ALL, optional paired fromDate/toDate; guidance requires classId and Super Admin requires institutionId. Date bounds are inclusive UTC calendar days in the academic year's two calendar years.

Only unwithdrawn observations with matching enrollment/institution/season/year participate. Institution reports include retained enrollment histories and group on the observation's original class. Guidance additionally requires current active enrollment and matching current class. Frozen schema, rubric ID, year, subject, curriculum identity, criteria and exact selections are validated. Inconsistent definitions for the same rubric version reject the report with 409 rather than merge conflicting levels.

LATEST uses the last valid observed_at/id per enrollment and rubric version in the selected range. ALL counts every valid observation and explicitly allows repeated student contributions. Groups separate observation class, rubric version, curriculum version and criterion. Levels show observation counts and observation-weighted percentages; participating enrollment count is separate. Rubric versions, criteria and levels are never translated to numeric ability scores or combined with exam accuracy. No student names, IDs, evidence notes or feedback are returned in the cohort payload.

Source >5000 observations or >500 criterion groups fails explicitly; date narrowing is available. Large background exports remain pending. Class names are looked up from retained class identity; criterion/level definitions are exclusively frozen snapshots.

## Deferred acceptance

Check all history roles, revoked parent links, cross-institution enrollment selection, teacher/guidance historical rejection, moved-class enrollment, inactive old season/class, duplicate timestamp pagination ties and invalid cursor scope. Verify CSV quotation, formula protection, export cap/no partial download, scope switch/unmount and concurrent visibility behavior. Cohort checks: LATEST/ALL, equal timestamp ordering, repeated observations, withdrawn/malformed/conflicting snapshots, rubric version separation, exact guidance assignment, no individual PII and date/group caps. Tests have not run.

## Observation acceptance — 2026-10-06

Twenty-five isolated acceptance cases execute the actual observation handler and SQL against all 94 migrations. They cover frozen rubric/selections, append-only observation and withdrawal triggers, identical request replay versus changed-content conflict, per-observer request identity and repeated authorization. Sixteen context changes are each checked before selection and again immediately before INSERT: assignment activity, institution, season, class, subject and type; enrollment departure/class/grade; student activity; season/class activity; curriculum grade/verification and outcome activity. Unauthorized roles and unrelated institution/student contexts cannot create records.

All six read roles, active parent-link revocation, subject filtering, guidance revocation, authorized departed-enrollment history and staff history rejection are covered. Original-observer withdrawal requires current subject authority, is rechecked at the INSERT, retains the immutable original and excludes it from current/history lists; a correction uses a new request. A 201-record equal-timestamp case checks 200-row pagination without duplicates, cursor scope and revocation between pages.

This is local SQLite/D1-adapter acceptance, not Cloudflare staging or browser verification. Cohort LATEST/ALL, malformed/conflicting frozen definitions, moved-class history, CSV/UI isolation and actual provider acceptance remain open. The shared rubric join now requires SCHOOL curriculum grade to match enrollment grade, protecting both lookup and conditional INSERT and suppressing incompatible live rubric choices. Historical frozen observations remain readable under their existing authorization rules. No schema changed.

Final local validation: 142 test files / 684 tests pass; typecheck and production build pass. The existing large client bundle warning remains. Registry-level rejection of inconsistent legacy outcome/version grade definitions is a separate boundary to harden; the observation handler now fails closed for them.

## Rubrik dağılımı ve eski sınıf kabulü — 2026-10-07

On ek kabul testi: LATEST/ALL eşit tarihli gözlemlerin düzeylerini ve tekrar/katılımcı sayılarını doğru ayırır; malformed en yeni snapshot eski geçerli gözlemi gizlemez; aynı rubrik sürümünde çelişen geçerli tanımlar 409 verir. Çelişki imzası artık yalnız başlık/ölçütleri değil, dondurulmuş müfredat, ders, kazanım, süreç bileşeni, görev ve kaynak bilgilerini de karşılaştırır. Aynı rubricId farklı curriculumVersionId taşıdığında önce 200 veren regresyon 409 ile kapatıldı. Tarih ve sınıf gibi gözlem bağlamı bu tanım imzasına dahil değildir.

Enrollment başka sınıfa taşındığında kurum dağılımı ve öğrenci geçmişi gözlemin özgün sınıfını korur; eski ve yeni rehberlik sınıfı bu eski gözlemi güncel sınıf dağılımına katmaz. Ayrılan öğrenci/kapalı sezon/pasif sınıf kurum geçmiş dağılımında korunur, güncel rehberlik yetkisi reddedilir. Geri çekilmiş kayıtlar kurum ve rehberlik dağılımlarından çıkar. Rol/kurum sınırı, UTC gün sınırlarının dahil oluşu ve geçersiz tarih/politika kontrolleri geçti. Dağılım çıktısında bireysel kanıt notu/geri bildirim/işlem kimliği yok; resmî puan veya sayısal beceri puanı çıkarılmaz.

Bu yerel SQLite/D1-adapter kabulüdür. Farklı rubrik sürümlerinin ayrı gruplanması, 5000 kayıt/500 grup sınırları, gerçek UI/CSV ve Cloudflare staging ayrıca bekler. Migration değişmedi.

## Sürüm ve sınır kabulü — 2026-10-07

Üç ek kontrol tamamlandı: aynı ölçüt kimliklerini kullanan iki rubrik sürümü LATEST/ALL politikalarında ayrı gruplar olarak kalır, değişen sürüm etiketi ve düzey adları korunur. Tam 5.000 gözlem her iki politikada kabul edilir; 5.001 gözlemde REPORT_SCOPE_TOO_LARGE döner ve groups/eksik toplam verilmez. Tarih aralığını daraltmak 5.000 geçerli kaydı yeniden raporlanabilir yapar. Tam 500 rubrik/ölçüt grubu kabul edilir; grup501 aynı hata ile reddedilir. Yerel test fixtureları sentetiktir.

Bu sınır kontrolleri üretim kodu veya migration değiştirmedi. UI/CSV davranışı ve sağlayıcı kapasitesi ayrıca doğrulanmalıdır; bu sayılar eşzamanlı kullanıcı yük ölçümü değildir.
