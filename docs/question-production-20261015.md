# 15 Ekim — otonom kalite, kota ve sürekli yürütme

Kullanıcı üç işi tamamlamayı istedi. Başlangıç main0db2518e / PR259 production38609258549 başarılı. Yerel çalışma question-production, feat/question-production-20261015. Eski pilot46/50; sıfırlanmayacak. Eski üç denemelik editorial kaynak işi kapalı, AI destekli tek revizyonu otonom başarı değildir.

İlk eklenen katman:0112 günlük UTC AI bütçesi ve model çağrısı rezervasyonları. Paralel çağrılar DB trigger ile aynı sınırda; başarılı çağrının gerçek nöronu veya resmi token oranıyla tahmini kaydedilir. Eksik kullanım ve hatalar rezervasyonu tutar. Gün içinde config artırımı mevcut günlük sınırı büyütmez.10.000 üstü günlük sınır ek ücretli bütçe bayrağı olmadan çalışmaz. Hesap genelinde diğer Nibiru çağrıları bu soru bütçesine dahil değildir; ücretsiz fatura garantisi verilmez. Yalnız GPT-OSS120b ve bağımsız Nemotron120b için sonlu token/süre ve byte bazlı muhafazakâr rezervasyon var.

Denetçi için sabit bir doğru kaynak ve yanlış cevap anahtarı, yanlış çözüm hesabı, çelişen tablo içeren üç negatif kontrol; root/staging-only POST tek kez. Hiç soru oluşturmaz veya insan onayı vermez. Sonuç DB'de saklanır; yeniden istek yeni model çağrısı yapmaz.

İlk canlı ölçüm planı: kalan4 hak, iki doğrulanmış MAT5 çıktısı, dört farklı görev. Her iş tek üretici denemesi, hiçbir yeni-key tekrar zinciri veya insan düzeltmesi yok. Denetçi negatif kontrolleri geçmeden dört iş başlatılmaz. Bu küçük örnek tüm MEB kapsamını/500k üretim hızını kanıtlamaz.

13 odaklı test, typecheck ve111 dosyalık migration politikası geçti. Canlı dağıtım/ölçüm henüz yok. Sonraki: stage'e ilk katmanı dağıt, sabit canlı denetimi yürüt; günlük maliyet ve gerçek otonom kalite sonucuna göre kampanya/iş dağıtımı ve çoklu işçi sınırlarını tamamla. Otomatik üretim ve ücretli kapasite henüz açılmadı.

## İlk gerçek karşı örnek sonucu

38722085021 BLOCKED: doğru örnek geçti; yanlış anahtar modelce, yanlış hesap mekanik denetimde reddedildi; C fiyatı180→380 yapılan çelişen tabloya model4/4 verdi. Bu bilimsel yanlış olumlu kayıt altındadır. Dört üretim işi başlatılmadı; pilot46/50, üç model denetim çağrısı407 yuvarlanmış nöron, held0. v1 kaydı değiştirilmez.

Düzeltme: cevap/çözüm/tasarım notu görmeyen bilimsel çözücü. Kaynak sayıları exact veri şemasıyla sabit; bütün görsel sayıları aritmetikte kullanılmalı, operand kaynak/önceki sonuçtan gelmeli, işlem sonuçları server'da hesaplanır, tek doğru seçenek anahtarla uyuşmalı. Bağımsız hesap kanıtı editoryal denetçiye ayrıca verilir. v2 aynı sabit örneklerde tekrar ölçülür; başarı uydurulmaz.

0113 ayrı kampanya/slot/günlük taslak kayıtları: eski50 kotası yerinde kalır, yeni kampanya varsayılanPAUSED. Toplam taslak üst sınırı500000, kabul hedefi500000; retler nedeniyle taslak tavanı kabul hedefine ulaşmayı garanti etmez. Dakikalık bağımsız worker ana uygulamanın diğer cron işlerini sıklaştırmaz. Başlatma root, aynıOrigin ve revizyon tanığı ister; v2 karşı örnekleri ve farklı görevlerde enaz3/4 otonom geçiş, iki kazanım ve iki sunum gerekir. Sadece küçük doğrulanmış pilot, bütün MEB/500k hız belgesi değildir. İnsan incelemesi50 dolunca durur; budget bitince yeni UTC gününü bekler;3 başarısızlıktaPAUSED, stale slotlar FAILED, otomatik retry yok. En fazla4 işçi; mevcut10000 nöron sınırında muhafazakâr kabul kapasitesi1 işçi.

## v2 ve çalışma planı bulguları

38723904794 v2 BLOCKED: cevap ve çözümü görmeyen model, bozulmuş C380 tablosunda A cevabını hesaplayarak bilimsel hatayı doğru yakaladı. Doğru kaynakta B için280/55=5.0909 sonucundan6 tam kutuya geçişini anlatıda doğru yaptı fakat ayrı CEIL_DIV adımı yazmadı; kanıt protokolü bu yüzden pozitif örneği reddetti. v2 kanıtı korunur. v3 aritmetik kanıtı, doğrulanmış pozitif bölmenin matematiksel tavanını kaynak-türetilmiş sayı kabul eder; yanlış anahtar veya tablo için tolerans yoktur. Sayı sözcükleri de sadece kamuya açık stem'den deterministik ayrıştırılır.

38723904836 özel worker upload'u başarılı fakat cron kurma Cloudflare10072 ile reddedildi: WorkersFree hesabında5 cron sınırı dolu. Ücretli plana geçilmedi. Çözüm: özel worker workers_dev:false, kendi cron'u yok; sadece private service binding ile çağrılır. Mevcut staging cron'u sayısı değiştirilmeden dakikalığa çevrilir; en dış girişte diğer tüm işlerin15 dakikalık sıklığı korunur. Arayüz production bütçe/kalite/kontrol kartı eklendi. v3 canlı deney ve yeni binding henüz doğrulanmadı.

Son tam test1078 geçti; sonrasında protokol/schedule eklemesi için odaklı testler ve typecheck geçti. Son release test/build/CI tekrar gerekli. 0112 ve0113 staging'e uygulanmış olduğundan artık değiştirilmeyecek.

## v3 gerçek ölçüm: bilimsel test geçti, üretim henüz geçmedi

38724799590 goldPASS: doğru kaynak geçti, yanlış anahtar/hesap/C380 tablosu reddedildi. Üç yeni yazar çağrısı yapıldı. qgj_26230b38 önce REVIEW_READY oldu fakat içerik incelendiğinde iki modelin TDK kuralını ters uyguladığı görüldü: dörtyüz doğru, dört yüz yanlış sayılmış. Bu yanlış olumlu artık başarı sayılmaz ve q_e93ca189-206d-469c-81cd-f50ce1e6de4e REJECTED yapılacak. Resmî kural: https://tdk.gov.tr/icerik/yazim-kurallari/sayilarin-yazilisi/ . Yeni deterministik regresyon kontrolü bunu reddeder.

qgj_d03f2a96 READ_ZERO_PERIODS sourceFAILED; bilimsel çözücü doğru B'yi bulmuş ancak kanıtta kaynaksız büyük basamak parçaları kullanmış, metinde ayrıca noktasız/noktalı çelişkisi var. qgj_a8be95a0 TABLE sourceFAILED: doğru şık da distractors içine eklenmiş, başka çeldirici keyfi4.400 çıkarımına dayanıyor. Dördüncü sabit görev aktif istek çakışması yüzünden açılmadı; model çağrısı yok. V3 bu yüzden başarılı otonom ekip ölçümü değildir. AI bütçesi2596 nöron, pilot yeni rezervasyonları49/50 beklenir; yeniden okunacak.

Yeni rol: Qwen3-30b ayrı AI editörü (gerçek WorkersAI çağrısı, TDK/mekanik/şema bulguları + tam paket; bir düzeltme turu). GPT yazar → Qwen editör → Nvidia kör bilimsel çözüm → Nvidia editoryal denetim. Hiçbir insan onayı verilmez. 0114 editör denemesi/sonucu kaynak-hash'e sabit ve tek kullanımlı; başarısız kaynakların AI düzeltmesi yeni yazar çağrısı/kota rezervasyonu yapmaz. Bu, önceki Codex destekli manuel düzeltme ile karıştırılmayacak. Yeni sorularda AI editörü doğrudan akışın parçasıdır.

Ücretsiz50 sorgu/çağrı sınırı için koordinatör ve soru işçisi iki private servis olarak ayrıldı; aynı veritabanı, aynı günlük AI bütçesi. workers_dev ve preview URL'leri kapalı; yeni cron yok. Ana giriş mevcut cron'u kullanır, diğer işler15 dakikada kalır. Yeni private işçi ve0114 henüz canlıda değil. Native62 odaklı test geçti; son ek değişiklikler tekrar doğrulanıyor. Ücretli plan satın alınmadı; mevcut Free planın500MB/D1 veAI10000 nöron/gün sınırları500k/50 gün için yeterli değildir. Kesin yüksek hacim maliyeti henüz onaylanmadı.
