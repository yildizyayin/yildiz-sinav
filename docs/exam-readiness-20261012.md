# ANUNEX çalışma kaydı — 12 Ekim 2026

## Kullanıcı hedefi
Mevcut sınav taslakta kalıyor. Sınav ekleme, kaydetme, aktifleştirme, dosya yükleme, öğrenci eşleştirme ve değerlendirme hazır olmalı. Süper Admin sadeleşmeli; Nibiru sesi ücretli sağlayıcı açılmadan incelenmeli. Ajan görevleri koordineli yürütüldü.

## Başlangıç
GitHub main: 9889b5743671d40e7801d2068de8ecdce47b3b52. İzole çalışma dalı: fix/exam-readiness-20261012. Önceki production run 38227133465 artık SUCCESS; eski kayıttaki bekleyen onay bilgisi güncel değil.

## Düzeltilen somut sorunlar
- Hazır görünen merkezi sınav, kurum dağıtımı eksik olduğundan aktifleşemiyordu. Detay ve aktifleştirme artık aynı hazırlık kararını kullanır; eksikler ayrı listelenir.
- Sınav detayından aktifleştirme görünür; öğrenci sonuçları ayrıca yayımlanır.
- Taslak kaydetme gerçek kayda dönüştü. Kısmi işlem hatasında oluşturulan kayıt korunur; tekrar denemede yeni sınav açılması önlenir.
- Mevcut sınavı düzenleme bağlantısı boş oluşturma ekranını açıyordu. Query ile mevcut kayıt açılır; başlık/tarih/yıl/sahip ve puanlama profili korunur.
- Süper Admin değerlendirmede kurum seçemiyordu. Aktif kurum seçimi eklenip yükleme/kamera öncesinde zorunlu oldu; yöneticinin kendi kurum kapsamı korunur.
- Değerlendirme küçük sunucu parçalarıyla çalışırken istemci ilk cevabı tamamlanma sanıyordu. İstemci done=true sonuna kadar ilerler; hata veya ilerlemeyen cevapta durur ve yeniden denenebilir.
- Parçalı değerlendirmede iptal edilen kayıtlar artık sonuç üretmez; manuel misafir seçimi desteklenir. Merkezi kurum dağıtımı/durum kontrolü doğrudan ve parçalı yollarda uygulanır.
- Birleşik ölçme kaydında sınav soru kimliği, soru havuzunun foreign key alanına yazılıyordu. 0088 migration ayrı exam_question_id ekler; mevcut soru havuzu referansları korunur. Parçalı değerlendirme de birleşik ölçme kayıtlarını tamamlar.
- Süper Admin gereksiz açıklama metinleri temizlendi; yükleme hatasında sahte sıfır veya sürekli yükleniyor gösterilmez.
- Nibiru Dinle: doğrulanmış sunucu sesi yoksa yalnız cihazın yerel Türkçe sesi kullanılabilir. Türkçe ses yoksa açık bilgi verilir. Ücretli TTS, WhatsApp ve SMS etkinleştirilmedi.

## Kanıt ve sınırlar
Gerçek SQLite, tüm migration şeması ve gerçek oturum çereziyle draft→cevap anahtarı→kurum dağıtımı→ACTIVE→TXT/DAT→TCKN/no/isim eşleşmesi→manuel eşleşme/A-B seçimi→iptal→değerlendirme→sonuç/cevap/birleşik karne kayıtları doğrulanır. Doğrudan ve iki parça gerektiren yollar test edilir.
Tarayıcı kabulü sentetik API fixture kullanır; gerçek kurum/sınav verisi kanıtı değildir. Yerel Chromium indirilemediği için tarayıcı kabulü GitHub'da çalıştırılmalıdır.
Bu ortamda kullanıcının açık production Süper Admin oturumu yok. Kullanıcının mevcut taslağı henüz tanımlanıp aktifleştirilmedi; gerçek sınav verisi değiştirilmedi. Eksik anahtar/puanlama/kurum dağıtımı uydurulmayacak.
Gerçek cihazda duyulabilir Türkçe ses ve production kullanıcı akışı henüz doğrulanmadı. 10K/1M kapasite kabulü bu değişikliğin kanıtı değildir.

## Devam sırası
1. Son değişiklikleri tam test/typecheck/build ve GitHub browser kabulünden geçir.
2. Başarılı branch/PR'yi main'e birleştir; staging'i yalnız güvenli fast-forward ile güncelle.
3. Production GitHub environment reviewer kapısı varsa koru; bu araç bağlantısında review mutation yok. Deploy başarı kanıtı olmadan canlı bitti deme.
4. Güncel deploy/schema/health doğrula. Kullanıcının örnek sınavı için docs/exam-center-user-acceptance.md rehberini kullan.
5. Mevcut taslağın özel kaydını yalnız yetkili oturumla incele; hangi eksiklerin kaldığını somut göster.

İlgisiz eski çalışma dizinleri ve draft PR #229 değişmedi. Takvim/Nibiru önceki kabul kaydı docs/nibiru-acceptance-20261009.md içindedir.

## GitHub kabul güncellemesi
PR #232 açıldı. İlk run 38253435302 kaynak kontrolleri, 879 test, 96 temiz migration ve ilk 15 browser senaryosunu geçti. Sınav browser testi kitapçık select alanının erişilebilir adındaki belirsizlikte durdu; select açık aria-label ile düzeltildi. Son kabul tekrar çalıştırılacak; başarısız testi atlamayın. Optik fallback seçiminde birden fazla şablon varsa artık sadece yetkili şablon seçenekleri döner; önce seçenekler dönmediğinden kullanıcı ilerleyemiyordu.
Dört mevcut rapor ajanının (API sağlık, performans, issue tekilleştirme, ekip durumu) local composite action kullanmadan önce checkout adımı eksikti; mevcut görev/cron/yetkiler korunarak checkout eklendi. Bunlar sürekli izleme ajanlarıdır; bu oturumdaki kodlama alt ajanlarından ayrıdır.

## Release handoff — source accepted, Cloudflare/account steps pending
- PR #232 merged normally to main 1c11f500167c63c4cbb2272759c46a6b1fa1e375. No branch protection or environment reviewers bypassed. Final source/browser run 38254015862 SUCCESS: 879 tests, 96 clean migrations, 6 general + 9 Nibiru/calendar + 8 exam browser scenarios. Screenshots inspected; browser uses synthetic API fixtures.
- External Result Provider Isolation Probe 38254022043 failed twice on GET /accounts/.../workers/subdomain -> 504 Gateway Timeout. Application/source checks passed; unrelated provider deployment is not accepted or claimed successful.
- Staging safely fast-forwarded from fb281bdee... to 1c11f500... (4 ahead, 0 behind). Deploy 38254791626 applied schema then uploaded assets and Worker, but final trigger configuration failed on GET /accounts/.../queues -> 504. No live readiness claimed. One staging retry requested. No remote reseed, 100K write or outbound message.
- Production run 38254740397 waits at required production reviewer gate. DO NOT approve this superseded run: its schema-after-code ordering is being corrected before the next release. Connector cannot cancel runs or perform environment review. User should cancel superseded pending run in GitHub and approve the newer schema-before-code release only after source CI passes.
- Production workflow repair resolves the existing production Worker D1 binding and applies migrations before deploying code against the same resolved DB. This prevents new exam response code reaching traffic without 0088. Existing environment protection/concurrency preserved. Local targeting/order tests and YAML validation pass; new source CI follows publication.
- App's actual customer draft remains unidentified/unmodified because no production admin session is available in this environment. Do not invent missing answer keys, outcomes, scoring or institution assignment. Actual phone Turkish audio remains unverified and depends on local voice availability.

## Final account handoff — 12 October 2026
This section supersedes the preceding provisional release notes.
- Application PR #232 merged at 1c11f500167c63c4cbb2272759c46a6b1fa1e375. Production schema-before-code fix published at 679f629efaef6d1308c57420f48a81116da8283e. Main CI run 38255822491 SUCCESS: 881 tests, typecheck/build and clean migration/seed validation. Application browser acceptance 38254015862 SUCCESS: 23 scenarios with synthetic API fixtures; screenshots reviewed.
- Public live/read-only acceptance run 38256193089 SUCCESS on branch fix/exam-live-readiness-20261012 (faced0a231fed15b50817415fee82eae6fa731ff): all three app/demo/sonuc health endpoints HTTP200/ok; demo anonymous exam definitions/identity/calendar return401; demo /nibiru-direct serves the accepted release bundle assets/index-Byk7ndfh.js, fetched HTTP200. No account login, real exam modification, AI call or outbound message. This verifies deployed demo public assets/access boundaries, not the customer's actual exam or signed-in evaluation.
- Staging deployment 38254791626 applied 0088 successfully before uploading accepted assets/Worker. First attempt ended red on Cloudflare queues API504 after upload. Retry ended red when Wrangler rejected an HTTP200 deployments API response as malformed before a new upload; full operational deploy acceptance is NOT green despite public frontend/source availability. Keep Cloudflare failure visible, do not claim it fixed or weaken guards. No third retry requested.
- Current correct production run: https://github.com/yildizyayin/yildiz-sinav/actions/runs/38255822833, source679f629..., status PENDING behind superseded run38254740397 that waits for the production environment reviewer. Correct procedure: user CANCELS superseded run https://github.com/yildizyayin/yildiz-sinav/actions/runs/38254740397, opens the newer38255822833, then Review deployments→production→Approve and deploy after normal verification. Existing review/concurrency policy remains. Connector has neither cancel-run nor environment-review mutation; no account protections bypassed.
- app.anunex.com new exam fixes NOT deployed yet. Its existing public health is healthy. A completed review/deploy must be inspected for Cloudflare errors and source/schema/real flows before saying production ready.
- User's actual draft remains unmodified and unidentified: no authorized production admin browser session was available. Continue with secure account access and actual readiness blockers, not invented keys/outcomes/assignments. Hardware Turkish local voice remains user-device verification.
- Four report-agent checkout repairs published; structure validated. Existing uptime/D1 watcher history was successful, but new report executions were not triggered or claimed.
