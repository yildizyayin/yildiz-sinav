# Sonuç öğrencisi: alt ders, kazanım ve Nibiru inceleme paneli

Yalnız sonuc.anunex.com öğrenci görünümü. Onaylanan yön: açık içerik alanı, petrol/kiremit vurgu, Inter/sistem fontu, orijinal AnunexBrand/NibiruMark. Önceki PR423 tam öğrenci ürünü kabulü değildir; bu PR görünüm ve yerel inceleme etkileşimlerini ilerletir.

## Uygulananlar

- TYT ana testleri ve alt dersleri açılır gruplarda sunulur. Yayımlanmış ana toplam değişmez; alt dersler ayrıca toplanıp toplam sonuç üretilmez. Ayrı gelen branş satırları kendi değeriyle görünür. Ana toplamdan Fizik/Kimya/Biyoloji vb. dağılım tahmin edilmez. Eksik satırların değerleri — ve açıklamayla gösterilir. TYT yapısı LGS/AYT'ye otomatik dayatılmaz; bilinmeyen dersler kaybolmaz. Alternatif Felsefe ayrı kalır.
- Kazanımlar ilk12 ile kesilmez; sunucunun döndürdüğü eşleşmeler, ders/arama ve mevcut veriyle yanlış/boş filtreleriyle incelenir. Doğru, yanlış, boş, kanıt ve oran alanları ayrı; eksik veriler0 değildir. Kanıt eksi doğru, yanlış/boş olarak yorumlanmaz. Sunucu halen en çok100 kazanım döndürür; bu PR o sınırı değiştirmez.
- Nibiru gerçek bir düğmeyle açılır. Native dialog: masaüstü sağ panel, mobil alt panel, kullanıcı isterse tam odak. Esc/çarpı/geri, native klavye odak sınırı, tetikleyiciye odak dönüşü, arka plan kaydırma kilidi ve temizliği. Basma/açılma hareketi ve reduced-motion. Yalnız seçili yayımlanmış sonuç verisini yerel olarak gösterir; API isteği, dış model, ses ve mikrofon başlatmaz.
- Nibiru'nun Sonucumu açıkla / Yanlışlarımı incele / Kazanımlarımı göster eylemleri gerçek mevcut veriyi açar. Lisanslı uygulamanın yeni #425/#426 AI/ses servisleri sonuca taşınmaz; public sonuç Worker sınırı değişmez.
- Birleşik karne görünür fakat Planlanan ve pasiftir. Mevcut sonuç oturumunda teknik bağlantı yok; sahte aktif hazırlama/sohbet eylemi yok. Teknik görev önceki docs/design/student-results-v2/combined-report-cloud.md'dedir.

## Sınırlar / teknik kalanlar

Alt branş verisini hiç üretmeyen bir snapshot bu CSS ile tamamlanamaz. Doğrulanmış kazanım eşleşmesi ve soru bazlı kanıt/yanlış/boş ayrımı eksikse sunucu tarafında ayrı teknik iş gerekir. Mevcut response'ta kazanıma bağlı soru/video kimlikleri yokken Soruları gör düğmesi üretilmez. Nibiru paneli AI sohbeti değildir; çalışan sonuç inceleme alanıdır. Birleşik karne henüz aktif değildir. Bu eksikler bitmiş sayılmaz.

## Değişiklik sınırı

StudentResultsWorkspace.tsx entegrasyonu; ResultLearningDetails.tsx, ResultNibiruPanel.tsx, result-student-model.ts ve result-student-review.css yeni sunum dosyaları. Mevcut ResultPortal oturum/state/effect/handler/rol/API akışı, worker/migrations/lib/api/auth/tests/.github/wrangler/dependency dosyaları değişmez. Yeni state/effect yalnız yerel filtre ve native dialog yaşam döngüsü içindir. Yeni rota ve saklanan öğrenci verisi yok. Baskı stilleri değişmedi; karne düğmesinde beforeprint yalnız kopyalanmış #print-root alt ders gruplarını açar, asıl ekrandaki kapalı/açık durum korunur; yeni stiller screen+STUDENT+student-results-v2 kapsamlıdır. Native kapalı dialog yazdırılmaz; alt grup ve sunum yeni sayfayla birlikte baskıdadır.

## Kontrol

npm ci, npm run typecheck, npm test, npm run build; node scripts/check-result-presentation.mjs; gerçek derlemede sentetik API/Turnstile ile scripts/design-result-student-review-smoke.mjs. 360/390/768/1440px, mevcut ve eksik alt dersler, filtreler, uzun kazanımlar, dialog klavye/mobil/tamodak/odağa dönüş, normal ve azaltılmış hareket, giriş/boş/hata/busy/oturum, kurum/bayi ve app izolasyonu. verification.json ve örnek PNG'ler sentetik kanıttır; canlı öğrenci/gerçek CAPTCHA/AI/üretim yükü kabulü değildir.

Sonra: GitHub verify kontrolleri, ayrı PR, merge, yeni sürüm app ve sonuç dağıtımını ayrı doğrula. Korumalıproductiononayı korunur.
