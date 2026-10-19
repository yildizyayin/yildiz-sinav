# Üretim kotası, müfredat ve ortak yazılı — 19 Ekim 2026

## İstenen değişiklik

Sistem içindeki toplam soru adedi kotası production ortamında UNLIMITED olur. Bu ayar sağlayıcı ücretlerini, hesap/rate limitlerini, bir görevdeki soru sayısını, bağımsız kontrolü veya insan inceleme kapasitesini kaldırmaz. Eski pilot cap `legacy_question_cap` alanında ve tüketim `reserved_count` alanında korunur; başarısız/iptal işler iade edilmez. Migration bütün ortamlarda LIMITED ile başlar, yalnız production iş akışı açıkça UNLIMITED yapar.

## Production aktarımı

`Deploy App Production Only` içindeki mevcut production environment koruması devam eder. Migration ardından `scripts/production-question-curricula.mjs`:

- GitHub Actions / doğru depo / production Worker binding / bağlı D1 doğrulaması yapar.
- Sıkıştırılmış resmî branş kataloğunu açar, mevcut kayıtla 77 kapsam ve 2.916 kazanımın kod/metin/tema özetlerini karşılaştırır.
- Her program indeksi ve tema metnini **tymm.meb.gov.tr üzerinden yeniden okur**. İçerik veya kapsam değişirse müfredat/kota yazımı başlamadan durur.
- Yeni müfredat sürümlerini önce `verified=0` ile hazırlar; kayıtlar, öğrenme düğümleri, resmî kod, yıl/ders/sınıf/sürüm ve provenans doğrulandıktan sonra doğrular. Kesinti sonrası aynı kimliklerle sürdürülebilir. Eski sürümleri ve öğrenci/soru bağlantılarını silmez.
- Otomasyon kaydında insan aktörünü taklit etmez: GitHub run kimliği ve resmî kaynak doğrulama yöntemi audit/provenans kayıtlarına yazılır.
- Başarılı aktarım ardından yalnız production kotasını UNLIMITED yapar; sayaçları sıfırlamaz. Model çağrısı, otomatik insan onayı ve video üretimi yapmaz.

Aktarım resmî mevcut programın ANUNEX 2027–2028 hedef kapsamıdır. 2027–2028 yıllık planı, sınav senaryosu veya LGS/TYT/AYT kapsamı doğrulanmış sayılmaz. Katalogdaki engelli/kapsam dışı öğeler uydurularak doldurulmaz. 8/12 programlarının aktarılması otomatik üretim sınıf iznini genişletmez (5,6,7,9,10,11).

## Canlıya geçiş kanıtı

Kodun merge edilmesi veya workflow'nun başlaması aktarımın tamamlandığı anlamına gelmez. Başarılı production run içindeki `PRODUCTION_QUESTION_SETUP` 77/2916, budget_mode UNLIMITED, korunmuş reserved_count göstermeli. Sonraki read-only `QUESTION_RUNTIME_READINESS` diğer engelleri ayrı raporlar. Şu an bilinen servis aktörü ve insan inceleme kapasitesi eksikleri otomatik uydurulmaz; sıfır kapasitede üretim başlamaz.

## Ortak yazılı

Kararlar `COMMON-WRITTEN.md` ve `data/common-written-policy-20261019.json` dosyalarında tamamlandı; Süper Admin ekip paneli durum ve MEB kaynak bağlantısını gösterir. Bu değişiklik tam açık uçlu üretim/puanlama akışını uyguladığı iddiasında değildir.
