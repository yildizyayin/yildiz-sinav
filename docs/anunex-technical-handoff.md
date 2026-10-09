# ANUNEX teknik devam kaydı — 9 Ekim 2026

Bu kayıt ile [PR229](https://github.com/yildizyayin/yildiz-sinav/pull/229) birlikte okunmalı. Ana dalda yayımlanmış sürüm c5d45c30b0f2350b605e304c59b87f3228e7da3b. Yeni düzeltmeler fix/post-release-technical-acceptance dalında; PR taslak ve üretime aktarılmadı.

Kullanıcı GitHub ve Cloudflare işlemlerini yetkilendirdi; bilgisayarında kurulum/PowerShell adımı istemiyor. Ücretli plan satın alma yetkisi verilmedi. Tamamlanan işi yeni sohbette tekrar yapmadan bu kayıt, PR ve en son Actions sonuçları okunmalı.

| İş | Doğrulanan durum |
| --- | --- |
| Öğrenci eşleştirme ve kitapçık | Test ortamında manuel eşleştirme, eksik kitapçık A/B karşılaştırması/düzeltmesi ve değerlendirme geçti. |
| Raporlar | Altı rolün CSV/PDF erişimi, öğretmen branşı, öğrenci/veli yayımlanmış raporu test ortamında geçti. |
| Yayınlama | Eksik sınav profilinin freeze işlemini etkisiz bırakması düzeltildi. Profil ve snapshot aynı işlemde yazılıyor; geç hata geri alınıyor. |
| Özel raporlar | Kuyruk, özel R2, yeniden teslim, rol izolasyonu, süre aşımı ve gerçek zamanlanmış dosya/metadata temizliği geçti. Üretim aktivasyonu bekliyor. |
| 10.000 istek | run37903414741: 511 başarılı, 9.489 başarısız. Kapasite kabulü geçmedi. |
| 100 istek | p95 627,65 ms; bütün istekler başarılı. |
| 500 istek | p95 2,32 sn; bütün istekler başarılı. |
| 1.000 istek, eski sorgu | p95 4,06 sn; bütün istekler yanıt aldı, 2,5 sn hedefi geçilemedi. |
| 1.000 istek, tek sorgu | run37905670873: p95 2,98 sn; bütün istekler yanıt aldı, hedef hâlâ geçilemedi. |
| 1.000.000 istek | Çalıştırılmadı. Mevcut Workers Free hesabının günlük dinamik istek sınırını aşar. |
| Fiziksel telefon | Test edilmedi; sentetik kamera akışı ve Chromium fotoğraf motoru doğrulandı. |

Tek sorgu düzenlemesi oturum iptali, süre aşımı, IP bağlama, yayımlanmış sürüm ve emekli edilmiş sonuç kontrollerini aynı canlı SQL ifadesinde tutuyor. Yetkilendirme veya özel sonuç yanıtı önbelleğe alınmıyor. run37905550928 ile 149 dosya/788 test, altı Chromium senaryosu, 17 API+17 KVKK, altı rol ve gerçek cron temizliği tekrar geçti; demo zamanlaması geri yüklendi.

Sorgu profili run37906462250: 12 satır okuma, yaklaşık 1,15–1,37 ms SQL süresi; kimlik kontrolü sorgu planında iki kez değerlendiriliyor. Son ürün commit86bb4dd7737016d66dd20a6f6a38c6e3ba07bedb bunu istek içi MATERIALIZED CTE ile bir değerlendirmeye indiriyor. Bu kalıcı önbellek değil. Yeni tam kabul run37907149550 tüm işlevsel kapılarda PASS ve demo cron restorasyonu PASS. run37907404263 yeni 1.000 istek denemesi PASS: tüm yanıtlar doğru, p95 2,43 sn. Sorgu planı kimliği bir kez değerlendiriyor; okuma sayısı 12'de kaldı. Bu tek seferlik 1.000 istek ölçümüdür; 10.000/1.000.000 kapasitesi hâlâ kabul edilmedi. run37908062935 2.000 istek: bütün yanıtlar doğru, p95 5,09 sn; performans FAIL, cleanup PASS. run37908460336 4.000 istek: 3.102 başarılı, 898 hata (%22,45), p95 8,22 sn; cleanup PASS. Sanitized canlı tail en az 67 D1_OVERLOAD olayı yakaladı. Darboğaz gerçek D1 aşırı yüküdür; kapasite kabulü geçmedi.

Sonraki adımlar:
1. D1 yoğunluğunda güvenli 503/Retry-After ve doğrulanmış erişim kodunu tekrar göndermeyen READ_RESULTS düzeltmesi için yeni kabul sonucunu doğrula. Bu düzeltme kapasiteyi sertifikalandırmaz; 10.000/1.000.000 için dağıtık erişim/sonuç mimarisi ve kaynak kararı açık.
2. Yük hedefi sağlanmazsa gerçek hata sınıfını ve dağıtık sonuç/erişim mimarisini çöz. Başarısız 10.000 yükü körlemesine tekrarlama; atlanan kapasite işini başarılı sayma. Auth/revocation/role kurallarını ve kabul eşiklerini gevşetme.
3. Bir milyon istek için gerekli ücretli kaynak kararını kullanıcıyla somut maliyet üzerinden ele al. Ücretli planın tek veritabanının paralellik sınırını tek başına çözdüğünü iddia etme.
4. Üretim özel rapor R2/queue yapılandırması ve güvenli provisioning commitli. Açık kabul engelleri kapanmadan etkinleştirme yapılmadı.

Üretim öncesi normal GitHub ortam onayı run37901700420 otomatik incelemede, CI/kabul sürerken önkoşul eksikliği gerekçesiyle reddedildi. Bu onay kontrolünü başka API, gizli bilgi yerini değiştirme veya dolaylı dağıtımla aşma.

Testler sadece yerleşik yalıtılmış staging Worker/DB ve sentetik hesaplarda yapıldı. Üretim öğrencilerine sentetik veri veya yük testi uygulanmadı. Bulunduğumuz çalışma oturumunda yerel komut çalıştırıcı yanıt vermemeye başladı; GitHub Actions doğrulaması kullanılmaya devam ediyor.

Yeni yoğunluk düzeltmesi: sadece sonuç GET uçlarında doğrulanmış D1 overloaded hatası 503 RESULT_CAPACITY_BUSY ve Retry-After3 döner; mutasyonlar otomatik yeniden denenmez. UI başarılı kod doğrulamasından sonra ayrı READ_RESULTS aşamasına geçer. Sonuç GET hata verirse yalnız GET tekrar edilir; 401 yeniden lookup/doğrulama gerektirir. Yoğunlukta 3 saniye tekrar bekleme, geri dönme/unmount sırasında AbortController, geç yanıt izolasyonu eklendi. Yeni backend ve React akış regresyonları CI ile doğrulanacak.
