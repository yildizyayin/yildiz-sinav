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
