# ANUNEX ajanları: mevcut yapı ve görev planı

2 Ekim 2026. Kaynak incelemesi: worker/nibiru-license-entry.ts, src/pages/AgentCenter.tsx, .github/workflows/agent-*.yml ve .github/actions/agent-report/action.yml. Agent Center allowlisti GitHub'daki #227 dalından da doğrulandı. Tanım bulunması, workflow'un etkin olduğu veya son çalışmasının başarılı olduğu anlamına gelmez. Bu inceleme canlı GITHUB_AGENT_TOKEN bağlantısını, kota/secret durumunu veya bütün ajanların çalışma geçmişini doğrulamadı. Hiçbir ajan tetiklenmedi; Issue, SMS veya WhatsApp gönderilmedi.

## Gerçekte ne var?

Panelde 20 ajan tanımı var: 18 denetim/raporlama workflow'u ve kredi bekleyen 2 Anthropic tabanlı ajan (Triyaj, Kod Yazıcı). Depoda ayrıca etiket kurulum workflow'u var; toplam 21 agent-* dosyası. “Free” sınıfı, Anthropic anahtarı gerektirmeyen görevleri ifade ediyor; GitHub/Cloudflare kaynaklarının sınırsız veya her koşulda ücretsiz olduğunu kanıtlamıyor.

Agent Center GET /api/ai-agents yalnız Super Admin'e açıktır. GITHUB_AGENT_TOKEN yoksa configured=false verir; varsa GitHub workflow listesi, son çalışmalar ve Issue özetlerini okur. Ücretli ajanlar panel API'sinde duraklatılır. Bu, GitHub'daki doğrudan workflow/etiket tetiklerini küresel olarak kapatan bir kilit değildir.

## Görev dağılımı

| Mevcut ajanlar | Bu projede kullanacağımız görev | Mevcut sınır / önce tamamlanacak iş |
|---|---|---|
| CI Sağlık | Tip kontrolü, bütün testler, derleme; #227 regressions | Panel çalıştırma ref'i main; taslak branch ayrıca CI üzerinden doğrulanmalı |
| D1 Şema Denetimi | 0061–0063 migration ve FK cascade tutarlılığı | Yerel D1 uygulaması, gerçek R2/Queue kanıtı değil |
| Tenant ve KVKK | Başka kurum/sürüm erişimi, silme, log redaksiyonu | Sabit test listelerine yeni snapshot/artifact/retention/queue testlerini eklemek gerekir |
| İzleyici, API Sağlık | Domain ve health hatalarının erken tespiti | Yetkili sonuç okuma ve kuyruk ilerlemesini şu an ölçmüyor |
| Hafif Performans | Public GET süreleri ve hızlı bozulma sinyali | Tekil GET ölçümü; eşzamanlı öğrenci kapasitesi kanıtı değil |
| Yük Testi | İzole staging'de gerçek sonuç okuma + login yükü | Şu an yalnız ana sayfa GET; öğrenci fixture/oracle yok, 1m girişi reddediliyor |
| Deploy Doğrulayıcı, Release, Route | Çözümlenmiş üretim bağları, Worker entry, yetki sınırı ve yayına hazırlık | Şablon placeholder'larını gerçek deploy öncesi çözülmüş config ile ayırmalı |
| Demo Veri | Sentetik çok kurum/öğrenci fixture ve tekrar yükleme tutarlılığı | Gerçek öğrenci verisi kullanılmamalı; load fixture kapsamı ayrıca hazırlanmalı |
| İçerik Eksik Tarayıcı, İçerik Kalitesi | Maarif/kazanım/karne kaynaklarında eksik tanımları bulma | Anahtar kelime tarar; resmî doğruluk ve akademik onay üretmez |
| Frontend Erişilebilirlik | Etiket/alt metin bulguları | Statik regex; gerçek tarayıcı, ekran okuyucu ve mobil E2E yerine geçmez |
| Bağımlılık Güvenliği | Bilinen bağımlılık açıkları | İş mantığı, tenant ve yetki açıklarını kanıtlamaz |
| Issue Tekilleştirme, Durum Raporu | Tek hata/tek kayıt, günlük sonuç özeti | Raporun doğru göreve bağlı olması ve kapanış koşulları düzeltilecek |
| Triyaj (kredi bekliyor) | Bulgu sınıflandırma ve öncelik önerisi | Kod/yetki/müfredat/silme kararı vermez; gerekmeden etkinleştirilmeyecek |
| Kod Yazıcı (kredi bekliyor) | Küçük ve geri alınabilir UI/rapor düzeltme PR'ı | Mevcut prompt silme, auth, güvenlik, resmî içerik ve büyük mimariyi yasaklıyor; otomatik merge yok |

## Öncelikli bulgular

1. **Talimat kayıtları yürütme kuyruğu değil.** /api/ai-agents/instructions yalnız GitHub Issue açıyor; ücretsiz workflow'larda talimat metnini okuyup belirtilen işi yapan tüketici bulunmadı. “Talimat kuyruğa alındı” ifadesi işi yürüttükleri anlamına gelmiyor. Açık talimat → çalıştırma → belirli run/PR kanıtı → inceleme → kapanış ilişkisi eklenmeli.
2. **Talimatlar yanlış kapanabilir.** Talimat Issue'ları hem ajan-talimatı hem ilgili rapor etiketi alıyor. agent-report başarıda aynı rapor etiketiyle bulunan açık Issue'ları kapatıyor; talimat etiketini dışlamıyor. Rutin bir sağlıklı rapor, yapılmamış görevi kapatabilir. Talimat ve rapor kayıtları ayrılmalı; kapanış görev kanıtına bağlanmalı.
3. **Main ref'i taslak değişiklikleri görmez.** Panel dispatch kodu ref:'main' gönderiyor; Kod Yazıcı da main tabanlı PR öneriyor. #227 değişikliklerini doğrularken bu ajanları çalıştırmak yeterli değil. Denetimler kontrollü branch/commit ref'i ile kanıta bağlanmalı.
4. **Yük ajanı kapasite hedefiyle uyumsuz.** Tek GitHub runner, ana sayfa GET, p95<2s/hata<%5 ve 999999 VU üst sınırı; bunlar 1m farklı öğrencinin doğru sonucunu okumasını kanıtlamaz. #228'deki scripts/load/result-read.k6.js sentetik kullanıcı/oracle/disjoint shard planına bağlanmalı. Login ve sonuç okuma ayrı; staging izin listesi ve gerçek ölçüm gerekir. Mevcut üretim URL reddi tam string karşılaştırması; sondaki slash/path gibi varyantlar için hostname parse ile doğrulanmalı. Üretime test başlatılmadı.
5. **Bazı denetimler yanlış alarm üretebilir.** Release/route ajanları kaynak şablondaki production placeholder'larını hata sayıyor; deploy workflow bu değerleri çözmek üzere tasarlanmış. Frontend regex'i geçerli label içinde kullanılan input'ları da eksik sanabilir. Raporlar gerçek çözümlenmiş config ve tarayıcı testleriyle ayrıştırılmalı.
6. **Silme ajanı eklemek gerekmiyor.** Veriyi silen yetki kontrollü deterministik Worker/Queue'dur. Ajanların görevi gecikme/hata/sonuç kanıtını okumak ve raporlamaktır. Ajanlara genel Super Admin oturumu, üretim D1 silme veya özel R2 listeleme yetkisi verilmemeli. Gerekirse sadece sayısal/sanitized monitoring için dar kapsamlı ayrı kimlik tasarlanır.

## Uygulama sırası

1. Talimat/rapor ayrımı ve kanıtsız otomatik kapanışın önlenmesi.
2. CI, KVKK, tenant ve D1 ajanlarını doğru commit + yeni test kapsamına bağlama.
3. Kuyruk sağlık verisini agent status raporuna dar yetkili okuma ile bağlama; hata/30dk ilerlemesizlik ve katılımcı temizliği operasyon hedefi ihlalini raporlama. Şimdilik panelde gösteriliyor; dış uyarı gönderimi yok.
4. Yük ajanını gerçek sentetik sonuç/oturum/shard kabul senaryosuna çevirme; staging'de ölçüm.
5. Release/route/frontend yanlış pozitiflerini düzeltme, browser E2E kanıtı ekleme.
6. Kredi gerektiren ajanlara yalnız gerekince küçük iş verme. Ana kaynak değişiklikleri ve veri güvenliği Sol yüksek; mimari/kapasite bağımsız inceleme Astra yüksek; rapor düzeni ve düşük riskli UI işleri Luna orta. Bu model ayrımı teknik görev planıdır; mevcut workflow'lar otomatik olarak Sol/Luna/Astra kullanmıyor.

Yıllık lisans/eğitim yılı geçişi analiz sınırında kalır. Resmî Maarif ve MEB/ÖSYM içeriği ajanların otomatik karar alanına bırakılmaz. Gerçek private R2/Queue, öğrenci sonuç akışı ve 10k/1m kabul ölçümü yapılmadan hazır ilan edilmez.
