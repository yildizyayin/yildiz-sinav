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

Yeni yoğunluk düzeltmesi: sadece sonuç GET uçlarında doğrulanmış D1 overloaded hatası 503 RESULT_CAPACITY_BUSY ve Retry-After3 döner; mutasyonlar otomatik yeniden denenmez. UI başarılı kod doğrulamasından sonra ayrı READ_RESULTS aşamasına geçer. Sonuç GET hata verirse yalnız GET tekrar edilir; 401 yeniden lookup/doğrulama gerektirir. Yoğunlukta 3 saniye tekrar bekleme, geri dönme/unmount sırasında AbortController, geç yanıt izolasyonu eklendi. Yeni backend ve React akış regresyonları doğrulandı: CI run37910951357, 151 dosya / 794 test PASS. Güncel ürün kodu için run37910170694 native-browser 113759858421: 794 test, altı gerçek Chromium senaryosu ve başlangıç paket denetimi PASS. provider-inventory PASS; ancak özel rapor canlı kabulü FAIL. Üretime aktarım yapılmadı.


## Son yeniden kabul ve açık hatalar

- run37909721913 / job113751685576: parser, 17 API, 17 KVKK, özel rubric/cohort kuyruk/R2/tekrar teslim/rol izolasyonu PASS. Raporlar READY oldu; yalnız bu çalışmanın iki sentetik raporunun expires_at değeri sona çekildi. 20 dakika sonunda durum READY/cleanup_done=0 kaldı: gerçek zamanlanmış temizleme yeniden kabulü FAIL. Tail'de yalnız 09:14:31 UTC için bir scheduled olay görüldü (ok, retention OK, sıfır exception), bu olay 09:15:05 civarındaki süre sonlandırmadan önceydi. Daha sonra tetikleme görülmedi; bu kayıt tek başına CPU/kota veya temizleme algoritması hatası kanıtı değildir.
- run37910170694 / job113759859002: aynı test ortamında parser testi 500 SERVER_ERROR verdi; özel rapor adımları çalışmadı. Her iki çalışmanın always-restoration adımı PASS.
- salt okunur provider tanısı run37912669097: exact preview D1 SELECT CURRENT_TIMESTAMP ve toplam rapor sayıları başarılı; rubric ve cohort tablolarında sekizer temizlenmiş eski iş ve birer süresi dolmuş fakat temizlenmemiş iş var. D1 REST erişimi o anda çalışıyor. Demo cron */15 * * * *, preview cron boş: restorasyon doğrulandı. Python varsayılan istemcisinin config GET 403 hatası bütün tanı işini FAIL yaptı; bu hatayı D1 kota arızası diye yorumlama.
- run37912862667: sentetik super girişi 200; aynı parser isteği yeniden 500 SERVER_ERROR. Tail bağlantısı doğrulanamadığından kök hata sınıfı elde edilemedi.
- .github/workflows/isolated-provider-diagnosis.yml yalnız exact preview için metadata okumaları ve bir sentetik parser tanısı içerir; üretim dağıtımı/zamanlama değişikliği yapmaz. Son tanı kaydını okuyarak devam et. Bağlantı doğrulanamazsa ek sentetik parser isteği göndermez.
- 10.000 burst ve 1.000.000 hedefi hâlâ açık. Otomatik ağır tekrar varsayılan olarak atlanıyor; SKIP kapasite PASS değildir.

Bir sonraki oturum önce PR229 en son başını ve tanı workflow sonucunu okumalı; parser 500 ile cron sonrası temizleme sorununu kapatmalı. Önceki işlevsel PASS sonuçlarını son yeniden kabul FAIL durumunun yerine koymamalı. docs/result-serving-capacity-plan.md dağıtık kapasite için tasarım sözleşmesidir; uygulaması henüz yazılmadı. Fiziksel telefon ve üretim aktivasyonu da açık.

## Sağlayıcı kotası teşhisi — son doğrulama

run37913576384 / job113764263161 sağlayıcı tail API bağlantısını gerçekten kurdu, bir sentetik parser isteğinin 500 SERVER_ERROR sonucunu gördü ve canlı olayını sabit DAILY_LIMIT sınıfında yakaladı (outcome ok, exceptionCount 0). Tail gözlem kaynağı finally içinde silindi; üretim dağıtımı/zamanlama değişikliği yapılmadı. Günlük kota hatası artık doğrulanmış engeldir. Ham hata/veri kaydedilmedi; satır okuma/yazma/Worker istek kotası boyutu henüz ayırt edilmedi. Son boyut tanısı run37913912518 aynı 500 sonucunu tekrar gördü ancak 5 saniye içinde stream olayı alamadı; bu tanı boyutu kanıtlamaz. Körlemesine yeniden istek gönderme.

Cloudflare resmi kaynakları:
- https://developers.cloudflare.com/d1/platform/pricing/ : Free 5 milyon satır okuma/gün ve 100 bin satır yazma/gün, reset 00:00 UTC.
- https://developers.cloudflare.com/changelog/product/d1/ : 1 Eylül 2026 sonrası günlük Free satır kotaları sorguları durdurabilir.
- https://developers.cloudflare.com/workers/platform/pricing/ : Workers Paid hesap başına aylık en az 5 USD, dahil kullanımı aşan tüketim ek ücretlidir. Bu yalnız plan tabanıdır, 10.000/1.000.000 kapasite garantisi değildir.

Kullanıcının ücretsiz kalma tercihi ve ücretli satın alma için ayrı yetki gereği nedeniyle plan yükseltilmedi. Ağır yük tekrarları durduruldu. Kota yenilenmeden veya yeni kaynak bütçesi kararı olmadan canlı yeniden kabul tamamlanamaz. Cron temizliğinin son başarısızlığı bağımsız açık madde olarak kalır; bu teşhis cron olayının neden gelmediğini tek başına kanıtlamaz. Yeni sohbet burada başlamalı; önceki 794 test/altı Chromium PASS korunmalı, canlı özel rapor yeniden kabulü ve yüksek kapasite PASS ilan edilmemeli.
