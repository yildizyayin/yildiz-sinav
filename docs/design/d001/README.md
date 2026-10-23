# D001 — Astra ortak görünüm ve Süper Admin

Temel: `8164d0745f052b8d4c96ebe7b9e6a2da2752662c` (main).
Dal: `design/d001-core`.

## Kapsam

Çalışan uygulamanın yalnız `src/astra-panel.css` dosyasına, `@media screen` ve `ANUNEX_STANDARD` kapsamlı bir katman eklendi. Astra'nın 240 px sol menüsü, açık içerik alanı, modül renkleri, özgün ANUNEX ve Nibiru bileşenleri korundu. Kartlar, tablolar, formlar, butonlar, mesaj kutuları, sekmeler ve boş durumlar ortaklaştırıldı; Süper Admin yönetim özeti daha kompakt düzenlendi. Soru havuzu ve ekip sayfasının kendi değişkenleri ortak dile uyarlandı; mor zorluk göstergesi denim mavisine çevrildi. Telefonda eski bir `span` kuralının gizlediği Nibiru işareti görünür yapıldı.

Hiçbir JSX, metin, rota, state, API çağrısı, yetki veya buton davranışı değiştirilmedi. Backend, veritabanı, testler, tema seçimi ve yazdırma stil dosyaları değişmedi. Sonuç portalı ve tanıtım sitesi bu katmanın kapsamı dışındadır. Diğer rol panellerinin ayrıntılı tasarımları D002–D006, sonuç portalı D007 kapsamında ayrı PR'larda ele alınacaktır.

## Referanslardan bilinçli ayrılıklar

- T01/Astra'nın sol menü geometrisi kullanıldı; kayıtlardaki farklı menü adları ve gruplaması mevcut uygulamaya taşınmadı. Güncel talimattaki metin/rota/yetki koruma kuralı önceliklidir.
- Modül vurguları beyaz üzerinde okunaklı metin sağlayacak kadar koyulaştırıldı; açık içerik ve modül kimliği korundu.
- Yönetim özetindeki mevcut operasyon paneli, içerik veya işleyiş değişmeden tam genişlikte üç sütuna yerleştirildi; telefonda tek sütundur.
- Reddedilmiş/ertelenmiş Nibiru büyüme animasyonu eklenmedi. Mevcut marka işareti ve mevcut hareketleri korunur; azaltılmış hareket tercihinde yeni katman animasyonu durdurur.
- Yeni ek görsel bu görev mesajında erişilebilir değildi. Depodaki onaylı Astra ve kayıtlı tasarım kararları esas alındı. Bu çalışma piksel piksel bütün eski görsel taslakların yeniden üretimi olarak sunulmaz.

## Doğrulama

- `npm ci`: başarılı; bağımlılık manifesti/kilidi değişmedi.
- `npm run typecheck`: başarılı.
- `npm test`: 312 dosya, 1399 test başarılı.
- `npm run build`: başarılı. Mevcut Worker statik/dinamik import uyarısı sürüyor; derleme hatası değil.
- Yerel üretim çıktısı, Chromium ve yalnız sentetik API yanıtları kullanıldı. Gerçek hesap veya öğrenci verisi kullanılmadı; üretim/mesaj gönderme işlemi yapılmadı.
- Yönetim özeti, sınav merkezi, sınav ekleme, soru havuzu ve ekip sayfası 1440/390/360 px'te kontrol edildi. Mobil menü açma/kapatma çalıştı. Sayfa yatay taşması ve render hatası görülmedi; geniş tablolar kendi kapsayıcısında kaydırılır.
- Ek 360 px hata/boş durum taraması: raporlar, kurumlar, kullanıcılar, sınıflar, öğrenciler, yoklama, ödev, takvim, Nibiru, ajan merkezi, optik, optik basma ve rehberlik. API'ler bu taramada örnek 503 yanıtı verdi. Bu kontrol dolu veriyle bütün iş akışlarının uçtan uca doğrulaması değildir.
- Yeni durum bileşenlerinde ölçülen kontrast: hata 7,36; başarı 7,09; uyarı 6,72; bilgi 6,58; sınav modülü birincil buton 6,01; pasif/meşgul buton 5,48; boş durum 5,61. Bu örnek ölçümler tüm eski bileşenler için eksiksiz erişilebilirlik sertifikası değildir.
- Görünür klavye odağı ve en az 40 px buton yüksekliği doğrulandı. Meşgul işareti normal tercihte `busy-spin`, azaltılmış harekette `none`; pasif durum korunur.
- Yeni CSS katmanı tarayıcıda kaldırılarak karşılaştırıldı: FOCUS/STUDIO/COSMIC/NEON için kabuk ve örnek bileşenlerin hesaplanmış stilleri aynı kaldı. STANDARD yazdırma modunda da aynı kaldı. Bu, tüm çok sayfalı PDF raporlarının yeniden basım testi değildir.

## Ekran görüntüleri

Görüntüler gerçek React üretim çıktısından alınmıştır. İçerikteki bütün sayılar ve isimler **sentetiktir**, canlı sistemin durumunu göstermez.

| Ekran | Masaüstü | Telefon |
|---|---|---|
| Yönetim özeti | [1440 px](home-1440.png) | [390 px](home-390.png) |
| Sınav merkezi | [1440 px](exam-center-1440.png) | [390 px](exam-center-390.png) |
| Sınav ekleme | [1440 px](exam-add-1440.png) | [390 px](exam-add-390.png) |
| Soru havuzu | [1440 px](content-1440.png) | [390 px](content-390.png) |
| Soru üretim ekibi | [1440 px](team-1440.png) | [390 px](team-390.png) |

[Mobil açık menü](mobile-menu-390.png) · [Durum bileşenleri](control-states-1440.png).

## PR önizlemesinde elle kontrol

1. Süper Admin ile giriş yapın; Yönetim özeti ve sol menüyü 1440 px'te inceleyin.
2. Sınav Merkezi, Sınav Ekle, Soru havuzu ve ekip sayfasını açın; mevcut sekme ve bağlantıların aynı hedefe gittiğini kontrol edin.
3. Telefonu 390/360 px'e getirin. Menüyü açın, bir bağlantıya dokunun; kapanmasını ve geniş tablonun yalnız kendi kartında kaymasını kontrol edin.
4. Klavyeyle Tab kullanın; odak halkasını kontrol edin. Test hesabında yavaş işlem sırasında meşgul işaretini, pasif butonları ve hata/başarı mesajlarını gözlemleyin.
5. Tema seçimi sayfasından diğer temalara geçin; kendi görünümünün korunduğunu kontrol edin. Azaltılmış hareket tercihini açın.
6. Test raporunda yazdırma önizlemesini açın; çok sayfalı raporu gerçek örnek veriyle ayrıca kontrol edin.
7. Canlıya alma, yalnız PR incelemesi ve gerçek veriyle kabul kontrolünden sonra ayrı işlem olarak yapılır.
