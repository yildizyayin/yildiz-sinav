# Sonuç öğrenci portalı — güncel teknik yapıya uyarlanmış Astra görünümü

Kullanıcının acil önceliği üzerine D-S038 öğrenci girişi, sonuç geçmişi ve analiz görünümü güncellendi. Onaylı görsel yön: [Öğrenci Sonuç Sorgulama Ekranı](https://chatgpt.com/library?file_id=libfile_909a4835cf008191b03bb9cb22aff2fc&account_id=personal). Sakin kiremit vurgu, açık içerik alanı, okunaklı formlar ve ölçülü Nibiru kullanımı korunur.

## Uygulama farkı

Yalnız `src/pages/approved-result-student.css` sonuna ekran medyasında `STUDENT` rolüyle sınırlı stiller eklendi. JSX, StudentLogin, ResultPortal, state/effect/API, iş kuralları, Türkçe metinler, rotalar, bağımlılıklar ve eski sınıflar değişmedi. Worker, migration, tests, lib, workflow ve print dosyaları değişmedi. HOME, kurum, bayi ve app kabuğu için yeni tasarım kuralı yok.

- Masaüstünde 712 px ölçülü giriş formu, iki sütunlu ilişkili alanlar.
- Telefonda tek sütun, 16 px giriş yazısı, 40–48 px işlem hedefleri. 360 px ekranda 300 px Turnstile alanı sığar.
- Seçilen kurum, hata/bilgi, meşgul/pasif durumlar; sonuç geçmişi, sıralama satırları, net/puan ve kazanım analizi hiyerarşisi iyileştirildi.
- Mevcut marka ve Nibiru varlıkları korunur. Mobildeki mevcut Nibiru gizleme davranışı değiştirilmedi.

## Bilinçli referans ayrımı

Teknik ekip girişi D-S038 ile tek adıma çevirmiştir: il/ilçe/kurum, öğrenci numarası veya TCKN, adının ilk üç harfi; gerektiğinde sunucunun istediği tam ad. Eski taslaktaki erişim kodu ekranı bu görünüm işinde geri eklenmez. Görsel taslak iş kuralından üstün tutulmaz. Yeni veri, performans metriği veya kazanım kodu üretilmez.

## Doğrulama

`npm ci`, `npm run typecheck`, `npm test`, `npm run build`. Güncel ana dal 660cd1ff üzerinde 345 dosya / 1506 test geçti.

```sh
ANUNEX_BROWSER_EXECUTABLE=/path/to/chromium node scripts/design-student-portal-refresh-smoke.mjs
```

Sentetik API/Turnstile ile gerçek React derlemesinde 360/390/768/1440 px kontrolleri: ana giriş, tek adım öğrenci akışı, kurum adıyla arama, TCKN seçeneği, tam ad isteği, yayın yok bilgisi, hata, meşgul, oturum geri yükleme, boş sonuç, analiz; kurum/bayi girişleri ve app CSS izolasyonu. Kontrast örneklemesi, odak ve dokunma yüksekliği kontrol edilir. `verification.json` son çalışmanın sonucunu kaydeder. Bu kontrol gerçek öğrenci hesabı, gerçek Cloudflare doğrulaması veya canlı yük testi değildir.

Ekran görüntüleri `login-1440.png`, `login-390.png`, `flow-1440.png`, `flow-390.png` sentetik verili çalışan arayüzdür; canlı yayına alınmış olduğunun kanıtı değildir.

## Elle kabul

1. sonuc.anunex.com → Öğrenci Sonuç açın; il, ilçe ve kurumu seçin.
2. Kurum adı/MEB koduyla arama ve il/ilçeden seçime dönüşü deneyin.
3. Öğrenci no/TCKN yöntemini, sınıf ve adın ilk üç harfini doldurun. Gerçek güvenlik kontrolü tamamlanmadan giriş pasif kalmalı.
4. Yetkili kendi kaydınızla sonuç geçmişini, sınav analizini ve Sonuç karnesi baskısını kontrol edin.
5. 360/390 px telefonda sayfa taşmasını, hata/bilgi ve pasif düğmeleri kontrol edin.
6. Kurum/bayi girişlerinin ve app.anunex.com'un aynı kaldığını doğrulayın.

## Yayın

Ayrı tasarım dalı ve PR; kontrol başarısından sonra merge. App dağıtımı başarıyla tamamlanınca S031 sonuç portalı workflow'u aynı kaynak SHA üzerinden izlenir. Sonuç workflow'u SUCCESS olmadan canlı denmez; korumalı production onayı korunur.
