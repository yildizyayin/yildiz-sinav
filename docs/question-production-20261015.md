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
