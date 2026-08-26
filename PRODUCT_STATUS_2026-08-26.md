# Ölçme Platformu — Vaat / Teslim / Kalan Envanteri

Tarih: 26 Ağustos 2026

Bu envanter yalnız bağımsız Ölçme Platformunu kapsar. YILDIZERP; öğrenci, öğretmen, sınav ve akademik sonuçları kendi içinde tutmaz. İki sistem ileride yalnız ticari/operasyonel özetlerle entegre edilir.

## Teslim edilenler

| Vaat / karar | Bugünkü durum | Doğrulama sınırı |
|---|---|---|
| Multi-tenant kurum, kullanıcı ve rol panelleri | Teslim edildi | API yetki kapsamları ve tenant izolasyon testleri var |
| Kurumun kendi sınavını tanımlaması/yüklemesi | Teslim edildi | Sınav Merkezi, gelişmiş tanım, kitapçık ve cevap anahtarı akışları var |
| TXT/DAT/CSV, kamera OMR, eşleştirme ve değerlendirme | Teslim edildi | Yeniden başlatılabilir parça değerlendirme ve ilerleme defteri var |
| Sürümlü puanlama ve sonuç/karne/rapor | Teslim edildi | Doğrulanmamış resmî kural hesaplamada kullanılamaz |
| Optik tanıtma, baskı ve yazıcı kalibrasyonu | Teslim edildi | Gerçek cihaz/FMT koordinat kabulü dış örnek gerektirir |
| Soru Havuzu, Studio ve telif/provenance güvenliği | Teslim edildi | Onaylı ve hak durumu uygun olmayan soru basılamaz |
| Learning Graph, Recovery, kişiye özel kitap ve Sıfır Hata | Teslim edildi | Yeni kazanımlar otomatik Learning Graph düğümüne bağlanır |
| Nibiru temel akademik asistan | Teslim edildi | Kritik puan/kimlik hesapları AI'a bırakılmaz |
| AI Eğitim Koçu | Teslim edildi | 5–10 soruluk mini-test, %80 geçme, destek ve yeniden ölçüm zorunlu |
| LGS/YKS hedef motoru | Motor ve doğrulanmış içe aktarma akışı teslim edildi | Gerçek hedef kayıtları resmî kaynak paketi gelmeden üretilmez |
| Föy Merkezi ve yıllık föy/soru planı | 36 haftalık planlayıcı teslim edildi | Yalnız doğrulanmış müfredattan plan üretir; eksik soruyu `CONTENT_REQUIRED` işaretler |
| Mini öğrenme oyunları | 5 gerçek oyun akışı teslim edildi | Sınıf 5–12; skor ve XP sunucuda sınırlandırılır |
| Free/Standard, Gold, Premium | Teslim edildi | Standard ücretsiz; Gold 100 TL/yıl; Premium 300 TL/yıl |
| Ödeme sonrası Super Admin onayı | Banka transferi/dekont akışı teslim edildi | Referans olmadan onay verilemez; aylık Live Credit otomatik işlenir |
| Live rezervasyon ve kredi cüzdanı | Teslim edildi | Gerçek görüşme linki sağlayıcı adaptöründen sonra açılır |
| YouTube mikro öğrenme, WhatsApp ve Nibiru Voice | Kod yolları teslim edildi | Gerçek secret/hesap ve sağlayıcı kabulü gerekir |
| PWA/mobil web | Teslim edildi | Manifest, çevrimdışı uygulama kabuğu ve kurulabilir web deneyimi var |
| Enterprise/Campus, yayınevi, kabul/bursluluk ve akıllı tahta | Veri modeli, API ve rol ekranları mevcut | Standard'a aktarım ayrı kabul/feature gate kararı gerektirir |
| Ölçek omurgası | Parçalı D1 yazımı, iş defteri, yayın snapshot'ı ve cache mevcut | 100.000 öğrenci yük testi ve Queue/Workflow eşiği canlı kapasite çalışması gerektirir |
| Tamamlanma Merkezi | Teslim edildi | Gerçek veri sayıları, secret parçaları ve kod/sağlayıcı ayrımı görünür |

## Kullanıcı kararıyla sonraya bırakılanlar

1. AI Rehber Öğretmeni'nin ürün kabulü ve son kullanıcıya açılması.
2. AI Branş Öğretmeni'nin ürün kabulü ve son kullanıcıya açılması.

Mevcut eski iskeletler “tamamlandı” sayılmaz; bu iki rol için yeni geliştirme bu teslimde yapılmadı.

## Dış girdiye veya ayrı projeye bağlı kalanlar

| Kalan | Neden kodla tek başına kapatılamaz | Tamamlanma koşulu |
|---|---|---|
| iyzico / PayTR canlı ödeme | Merchant hesabı, secret, callback onayı ve sandbox/canlı test gerekir | Sağlayıcı seçimi + hesap + test kartı + callback kabulü |
| Telegram | Bot hesabı/token ve ayrıca kanal adaptörü gerekir | Bot kurulumu + webhook + eşleştirme ve güvenlik kabulü |
| Native iOS / Android | Apple/Google geliştirici hesapları, bundle/package ve imza gerekir | Mağaza projeleri, imzalar, inceleme ve yayın |
| Canlı görüşme sağlayıcısı | Provider hesabı, güvenli meeting API'si ve kayıt politikası gerekir | Sağlayıcı seçimi + anahtar + görüşme kabul testi |
| Gerçek LGS/YKS hedef veri seti | Resmî ve yıllık güncel kaynağın doğrulanması gerekir | Kaynak URL'li içe aktarma + admin doğrulaması |
| Gerçek MEB müfredatı ve yıllık soru üretimi | Telif ve resmî kaynak doğrulaması gerekir | 5–12 doğrulanmış müfredat + her slota yeterli OWNED/LICENSED/PUBLIC_DOMAIN soru |
| Gerçek optik/FMT ve yazıcı kalibrasyonu | Fiziksel form ve cihaz çıktısı gerekir | Örnek dosya/form + gerçek baskı/tarama kabulü |
| Edesis/Okulizyon özel adaptörleri | Gerçek export şemaları bilinmeden alan eşleştirmesi uydurulamaz | Anonimleştirilmiş gerçek örnek dosyalar |
| 100.000 öğrenci kapasite kanıtı | Canlıya yakın veri ve trafik profili gerekir | Yük testi, eşik raporu, gerekirse Queue/Workflow kaynağı |
| Marka, logo ve production domaini | Kullanıcı daha sonra kesinleştirme kararı verdi | Tescil/domain/marka kararı ve DNS kurulumu |
| ERP entegrasyonu | ERP ayrı ürün olarak kalacak | Yalnız onaylı ticari/operasyonel özet sözleşmesi |

## Bu teslimin teknik kabul sonucu

- TypeScript typecheck: başarılı.
- Vitest: 36 dosya, 151 test başarılı.
- Production build: başarılı.
- Migration 0001–0024: temiz SQLite üzerinde başarılı.
- Demo seed: iki kez çalıştırılarak idempotency doğrulandı.
- Eğitim Koçu demo havuzu: hedef kazanımda 5 doğrulanmış soru.
- Fiyat sözleşmesi: Standard 0 TL, Gold 100 TL/yıl, Premium 300 TL/yıl.

Canlı D1 migration, gerçek sağlayıcı çağrıları ve production smoke testi bu kayıtla yapılmış sayılmaz; ayrı deploy kabulünde çalıştırılmalıdır.
