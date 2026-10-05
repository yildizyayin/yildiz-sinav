# Kontrollü soru taslağı üretimi

## Güncel kalite ekleri — 5 Ekim

Prompt açık Türkçe, sınıfa uygun dil, gerekçeli tek doğru cevap/çeldirici,
çözüm adımları ve yalnız doğrulanmış çıktı bağlamını ister. Aynı normalize
seçenekler şema/MC doğrulamasında reddedilir. Gerçek pedagojik doğruluk ve
semantik özgünlük insan incelemesine bağlıdır. Onay için dört kontrol ve
revizyon/program tanığı yanında zorunlu qualityReview gerekçeleri kaydedilir.
Varsayılan kapalı model ayarı değiştirilmedi; gerçek pilot yapılmadı. Yeni kod
henüz test edilmedi. [Kabul ve pilot planı](maarif-formative-quality-acceptance.md).


Seçilen başlangıç modeli: `@cf/zai-org/glm-4.7-flash`. Cloudflare'ın çok dilli
metin üretimi ve yapılandırılmış cevap arayüzü bulunan modeli olarak tercih
edildi. Türkçe eğitim içeriği kalitesi için gerçek üretim pilotu henüz
çalıştırılmadı; model seçimi pedagojik doğruluk garantisi değildir.
Resmî model arayüzü: https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/

Üretim varsayılan olarak kapalıdır. Model seçmek özelliği etkinleştirmez.
`QUESTION_GENERATION_ENABLED=true` ve AI binding gerekir; model
`QUESTION_GENERATION_MODEL` ile değiştirilebilir. Bu çalışma canlı ayarı veya
ücretli model çağrısını etkinleştirmez. Arka plan cron/Queue tüketicisi yoktur;
çalıştırma yetkisi yalnız Süper Admin'e verilir.

Talep önce tek çalışana kiralanır. Yıl/sınıf/ders, aktif çıktı, doğrulanmış
CV/program ve yakalanan çıktı kodu/başlığı tekrar kontrol edilir. Başka
çalışanın kiraladığı talep yeni model çağrısı başlatmaz. Deneme sayısı ve
çıktı boyutu sınırlanır. İptal veya bağlam değişikliği eski üretimin kayıt
hakkını kaldırır.

Çıktılar sadece metinli çoktan seçmeli soru taslaklarıdır. Şema, seçenekler,
cevap etiketi ve çözüm zorunludur. Benzerlik kontrolünün ilk aşaması tam
metin/seçenek kopyalarını engeller; anlamsal özgünlük ve cevabın gerçek
doğruluğu insan incelemesiyle kontrol edilir.

Kaydedilen soru AI_GENERATED + REVIEW durumundadır; talep, model ve soru
bağlantısı korunur. Soru, kazanım bağlantıları, üretim sonucu ve denetim
kayıtları aynı atomik işlemde tutulur. İnsan incelemesi mevcut dört kontrol,
soru revizyonu ve program bağlamı tanığı üzerinden yürür; otomatik onay veya
öğrenci akademik puanı oluşturulmaz.

Bir istek kiralamasının tek kayıt üretmesi, dış modelin faturalamasının tam
olarak bir kez gerçekleşmesini garanti etmez. Süre aşımı ve tekrar denemede
veritabanı çiti eski sonucu engeller; sağlayıcı çalışmasının iptali ayrıca
pilot aşamasında doğrulanmalıdır. Gerçek Türkçe kalite/maliyet/gecikme pilotu,
anlamsal tekrar kontrolü ve Maarif süreç/rubrik görevleri sonraki işlerdir.

Üretim sınırları: en fazla 3 deneme; 120 saniyelik yürütme kilidi; 45 saniyelik sağlayıcı bekleme sınırı; 6000 çıktı tokeni; 16 KiB giriş ve 64 KiB çıktı sınırı. Taslaklar REVIEW ve RESTRICTED olarak kaydedilir. Kullanım hakkını yetkili insan açıkça belirler; bu değişiklikten sonra güncel sürümde dört inceleme kontrolü yeniden tamamlanır.
