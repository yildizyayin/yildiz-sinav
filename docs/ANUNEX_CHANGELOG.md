# ANUNEX Çalışma Günlüğü

## 2026-09-23 — Proje kayıt sistemi başlangıcı

- GitHub tek kaynak olacak şekilde proje belgeleri oluşturuldu.
- Ürün, domain, sınav, optik ve canlıya alma sınırları yazıldı.
- Kullanıcı tarafından bildirilen canlı Sınav Merkezi sorunları başarısız durum olarak kayda geçirildi.
- `Aç/Görüntüle`, dosya yükleme ve optik akışları canlı kabul testine bağlandı.
- Önceki otomatik test veya workflow başarısının canlı kullanıcı akışı yerine geçmeyeceği kararlaştırıldı.

## Kayıt kuralı

Her değişiklik şu bilgilerle eklenir:

- Tarih
- Karar/görev ID’si
- Değişen dosya veya modül
- Test sonucu
- Canlı doğrulama sonucu
- Bilinen sınırlama
## 2026-09-23 — Salt-okuma Sınav Merkezi denetimi

- Aç eyleminin gerçek detay çalışma alanına değil, aynı bileşendeki seçili satıra bağlandığı tespit edildi.
- Dosya yükleme kartının yalnızca INSTITUTION_MANAGER rolünde gösterildiği tespit edildi; SUPER_ADMIN için görünürlük açığı kaydedildi.
- mode=upload bağlantısının ayrı bir yükleme çalışma alanı oluşturmadığı kaydedildi.
- Bu bulgular kod değişikliği yapılmadan önceki hata haritası olarak kabul edildi.
## 2026-09-23 — Hedefli Sınav Merkezi düzeltmesi

- Kayıtlı sınavdaki Sınavı aç eylemi gerçek sınav detay çalışma alanına bağlandı.
- Süper Admin için dosya yükleme kartı görünür hale getirildi.
- Production onayı verilmedi; canlı kabul testi bekleniyor.
