# Sonuç yayını kapasite kabul planı

Durum: 10.000 veya 1.000.000 eşzamanlı kullanıcı için hazır olduğu ölçülmüş değildir. Bir milyon kayıt üretme/SQL testi, bir milyon eşzamanlı kullanıcı testi değildir. Bu belge hedef ve kabul kapısıdır; kapasite garantisi değildir.

## Yük tanımı

| Senaryo | Hedef | Kabul testi |
| --- | --- | --- |
| Ani sonuç dalgası | 10.000 ayrı oturum aynı başlangıçta sonuç listesi ve detayı ister | Dağıtılmış 10.000 VU, kişi başına iki istek; tüm dalga tamamlanır |
| Ulusal yayın dalgası | 1.000.000 ayrı oturum aynı başlangıçta sonuç ister | En az 100 koordine yük üretici, toplam 1.000.000 ayrı kullanıcı; üretici kapasitesi ayrıca ölçülür |
| Sürekli yoğun kullanım | Aynı anda aktif kullanıcılar, düşünme süresi ve yenileme davranışı | Ayrı uzun süreli test; sayfa başına çağrı sayısı ve RPS ölçülür |
| İlk giriş dalgası | Oturumu olmayan kullanıcılar doğrulama ve sonuç ister | Lookup/verify/challenge/session yazıları ayrı test; önceden girişli okuma testi bunu kapsamaz |

İki sonuç isteği, 60 saniyeye eşit dağılmış geliş varsayımıyla 10.000 kişi için yaklaşık 333 RPS, 1.000.000 kişi için 33.333 RPS eder. Bu bir eşzamanlılık dönüşümü değildir; eşit geliş varsayımıdır. Aynı anda başlayan dalganın ilk saniyesi daha ağırdır. Kapasiteyi kullanıcı sayısı, geliş hızı, istek sayısı ve gecikme birlikte tanımlar.

## Mevcut bulgular

- Sonuç listesi: D1 oturum doğrulaması, kimlik/kurum/sınav/sonuç/snapshot join'leri ve ek AI ipucu sorgusu.
- Sonuç detayı: D1 oturum doğrulaması, peer yetkisi, üç ayrı branş/kazanım/video sorgusu.
- Sonuç Ağı okuyucuları henüz tamamen sabit payload'a geçmedi; canlı tablo bağımlılığı var.
- `scripts/generate-scale-100k-sql.mjs` veri hacmi denemesidir; canlı concurrency kanıtı değildir.
- Tek D1 veritabanı sorguları sırayla işler; sorgu süresi kapasiteyi belirler ve kuyruk dolabilir. Read replica başına da bu sınır geçerlidir.
- Cache API veri merkezine yereldir. Bir noktada sıcak cache başka noktadaki soğuk erişimi kanıtlamaz.

Resmî kaynaklar:
https://developers.cloudflare.com/d1/platform/limits/
https://developers.cloudflare.com/d1/best-practices/read-replication/
https://developers.cloudflare.com/workers/reference/how-the-cache-works/

## Uygulama sırası

1. Immutable sonuç payload'ı ve yayın kanalına bağlı sabit sürüm referansı; sorgu başına yeniden hesaplama yok. Yetki oturum/öğrenci/kurum kapsamında sunucuda doğrulanır.
2. Sonuç okuma yolunu sınav değerlendirme, PDF, Nibiru üretimi ve yayın yazılarından ayır. AI ipuçları ve raporlar yayından önce kuyrukla hazırlanır.
3. Yayın öncesi private R2 sonuç nesneleri ve sürümlü manifest hazırlığı değerlendirilir. Ham öğrenci dosyasına herkese açık URL verilmez. Cache key kurum/katılımcı/sürümü kapsar; yetki kontrolü önbellekten önce yapılır. Revocation, yayın geri çekme ve dönem sonu silme tutarlılığı tasarlanır.
4. Oturum doğrulamasının D1'i her istekte tek merkezde boğması ayrıca çözülür: imzalı kısa ömürlü erişim ve revocation veya ölçülmüş replica/shard yapısı. D1 replica gecikmesi yayın/geri çekme yetkisi için kör biçimde kullanılamaz.
5. Soğuk cache, ayrı kullanıcılar, aynı veri merkezi ve çoklu bölge senaryoları ölçülür. Kişiye özel cache tekrar erişimi hızlandırır; bir milyon ayrı öğrencinin ilk erişimini ortak cache hit gibi sayma.
6. Workers/D1/R2/KV/Queues plan, binding ve kotaları gerçek hesapta doğrulanır; Worker ölçeği tek başına database/auth kapasitesi garantisi değildir. Maliyet ve kapasite kararı lansmandan önce alınır.
7. İzleme: p50/p95/p99, 5xx/429/timeouts, başarılı doğru kullanıcı yanıtı, D1 rows_read/query duration/overload, cache hit ve origin RPS, kuyruk yaşları, kaynak tüketimi ve maliyet. Kontrollü yeniden deneme jitter/backoff ile; koruma için kullanıcıları keyfî olarak atma kapasite başarısı sayılmaz.

## Kabul kapıları

Önerilen ürün hedefi: sonuç okuma p95 ≤1 saniye, p99 ≤2 saniye, beklenen yetkili istek hata oranı <%0,1. Yanlış öğrenci/kurum verisi için tolerans sıfır. Bunlar ölçüm hedefidir.

`scripts/load/result-read.k6.js` başlangıç dalgası iskeletidir. Sentetik, farklı oturumlar gerekir. Giriş/Turnstile, oturumun IP'ye bağlanması ve shard kaynak IP'si fixture hazırlanırken korunur; bunlar bypass edilmez. Sonuç detayının doğru öğrenci/branş kanıtı ayrıca fixture oracle ile doğrulanmalıdır; yalnız HTTP200 yeterli kabul değildir.

Örnek smoke: `LOAD_PROFILE=smoke LOAD_BASE_URL=http://127.0.0.1:8787 LOAD_SESSIONS_FILE=./synthetic-sessions.json k6 run scripts/load/result-read.k6.js`

Remote staging için `LOAD_STAGING_ORIGIN` ve `LOAD_CONFIRM_STAGING=true` açıkça gerekir. Üretim domainleri scriptte engellenir. `peak1m` en az100 shard ister; `LOAD_SHARDS`/`LOAD_SHARD_ID`, her shard'a ayrı oturum fixture'ı ve ortak başlangıç koordinasyonu gerekir. Çok sayıda generator zorunluluğu tek başına üretici yeterliliği kanıtı değildir. Bu test henüz çalıştırılmadı; repository scriptinin syntax kontrolü gerçek performans ölçümü değildir.

Canlıya çıkış ancak hem 10k hem1m için tanımlı senaryolar geçince kapasite onayı alır; sonuçlar tarih, ortam, plan, commit, veri hacmi ve dağılımla kaydedilir. Cloudflare preview yetki engeli çözülmeden uzaktan kabul testi tamamlanamaz.

Mevcut teknik sıra korunur: terk edilmiş işlem kilidi recovery → Sonuç Ağı snapshot okuyucuları ve erişim yolu → önceden hazırlanmış sonuç dağıtımı → ölçülmüş kapasite kapıları → kalan karne/PDF.
