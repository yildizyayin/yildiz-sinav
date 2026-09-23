# ANUNEX Master Checklist

Bir iş ancak ilgili kabul testleri geçip `CANLIDA DOĞRULANDI` durumuna geldiğinde tamamdır.

## Faz 0 — Temel kayıt sistemi

- [x] Ürün sözleşmesi yazıldı.
- [x] Karar defteri oluşturuldu.
- [x] Mevcut durum belgesi oluşturuldu.
- [x] Kabul testleri belgesi oluşturuldu.
- [x] Yeni sohbet başlangıç protokolü yazıldı.
- [ ] Bu belgeler GitHub ana çalışma dalında görünür ve güncel.

## Faz 1 — Sınav Merkezi dikey akışı

- [ ] Süper Admin sınav kartını eksiksiz kaydedebilir.
- [ ] Kurum sınavı yükleme ekranındaki listede görebilir.
- [ ] Sınav adı ve Görüntüle ile detay çalışma alanı açılır.
- [ ] Detay ekranında yükleniyor, hata ve tekrar dene durumları çalışır.
- [ ] Sınav düzenleme gerçek kaydı günceller.
- [ ] Kopyalama yeni ve bağımsız bir taslak üretir.
- [ ] Arşivleme listeden kontrollü çıkarır.
- [ ] Silme onay ister ve yetkili API işlemi yapar.
- [ ] Dosya seçme alanı gerçek input ve yükleme sürecine bağlıdır.
- [ ] Yükleme sonrası değerlendirme kuyruğu ve hata durumu görünür.
- [ ] `app` ve `sonuc` sınav kimliği/silme/yayın durumları doğrulanır.

## Faz 2 — Phobos optik form ağacı

- [ ] Optik Form Ekle modalı kararlaştırılan alanları içerir.
- [ ] Parametre baş/uz değerleri kaydedilir ve tekrar açıldığında korunur.
- [ ] Form türü, yayınevi, optik kodu ve kullanıcı kapsamı kaydedilir.
- [ ] Düzenle, kopyala ve sil işlemleri üç nokta menüsünde çalışır.
- [ ] Süper Admin ana havuza yayınlayabilir.
- [ ] Kurum optiği yalnız kuruma görünür.
- [ ] Gerçek Optik 129/840 veya üretici örneğiyle koordinat doğrulaması yapılır.

## Faz 3 — Deimos optik basma

- [ ] Basma ekranı optik tanımlama ekranından bağımsızdır.
- [ ] Sınav ve kitapçık seçimi gerçek kayıtlardan gelir.
- [ ] A/B/C/D kitapçık seçimi çalışır.
- [ ] Yazdırma/PDF üretimi gerçek optik tanımını kullanır.
- [ ] Üretilen form kamera ve fiziksel baskı testinden geçer.

## Faz 4 — Değerlendirme ve kazanım

- [ ] TXT/DAT/FMT dosyası yükleme çalışır.
- [ ] Gerçek optik görseli/telefon kamerası akışı çalışır.
- [ ] Öğrenci TCKN → öğrenci no → isim eşleşme sırası uygulanır.
- [ ] Kayıtsız öğrenciler ayrı sekmede listelenir.
- [ ] Eşleştir, misafir, iptal seçenekleri çalışır.
- [ ] Yayınevi kazanımı korunur.
- [ ] Resmî MEB kazanımı ayrı alanda eşleştirilir.
- [ ] Eşleşmeyen kazanım uydurulmaz ve manuel incelemeye gider.
- [ ] Sonuç ve rapor üretimi gerçek sınavla doğrulanır.

## Faz 5 — Güvenlik, performans ve canlı

- [ ] Tenant/rol izolasyonu API seviyesinde test edilir.
- [ ] PII loglarda tutulmaz.
- [ ] Veri saklama/silme kuralları doğrulanır.
- [ ] 5–10 milyon ölçek hedefi için kritik sorgular gözden geçirilir.
- [ ] Typecheck geçer.
- [ ] Testler geçer.
- [ ] Build geçer.
- [ ] Staging kabul testi geçer.
- [ ] Kullanıcı onayı alınır.
- [ ] Production deploy yapılır.
- [ ] Production smoke test ve gerçek kullanıcı akışı geçer.

