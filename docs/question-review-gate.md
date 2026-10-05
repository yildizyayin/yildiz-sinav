# Soru incelemesi ve kaynak beyanı

Açıkça AI/AI_GENERATED/AI_DRAFT/NIBIRU/NIBIRU_AI kaynağıyla girilen soru
AI_GENERATED olarak saklanır ve otomatik öğrenci havuzuna alınmaz. Geçerli
MANUAL OWNED Süper Admin yükleme davranışı korunur. AI kaynağı metadata
düzenlemesiyle manuel kaynağa düşürülemez veya keepApproved ile onaylanamaz.

İki review API yolu aynı servise bağlanır. Onaylanan çoktan seçmeli içerikte
4/5 dolu seçenek ve seçeneklerle tutarlı cevap gerekir. AI için ayrıca dolu
soru, çözüm ve kaynak; geçerli yıl/sınıf/ders; aynı bağlamdaki doğrulanmış aktif
öğrenme çıktısı ve insan incelemesi kutuları gerekir: cevap/çözüm, müfredat,
yaş uygunluğu, özgünlük/kullanım hakkı. Bu kutular insan beyanıdır; otomatik
pedagojik doğruluk veya semantik özgünlük garantisi değildir.

0071 soru inceleme revizyonunu ve inceleme kontrol kayıtlarını ekler. Banka
kazanım bağlantısı, medya ve içerik bloğu değişince revizyon artar. AI onayı,
ekranda incelenen expectedRevision ve expectedContext değerlerini gerektirir;
ekran açıldıktan sonra program değişmişse karar reddedilir. En fazla 15 çıktı
incelenir; en büyük koşullu yazı 97 parametre kullanır. Yazı sırasında soru revizyonu ve
doğrulanmış program bağlamı tekrar karşılaştırılır. İnceleme kararı, insan
inceleyici ve zamanla kaydedilir. Medya dosyası baytlarının aynı URL altında
değişmesi ayrıca değişmez arşiv işiyle kapatılmalıdır.

Mevcut serbest prompt üreticisi sadece taslak JSON döndürür; bu değişiklik onu
kalıcı çıktı bazlı üretim kuyruğuna dönüştürmez. Sağlayıcı çağrısı, ücretli
paket aktivasyonu veya sınırsız hazır soru üretimi bu işte yapılmaz. Kaynağı
beyan edilmeden manuel yapıştırılan AI metni otomatik ayırt edilemez.

D1 uyumluluğu, sorgu başına parametre ve desen sınırları gözetilerek doğrulanır.
Resmî teknik sınırlar: https://developers.cloudflare.com/d1/platform/limits/
