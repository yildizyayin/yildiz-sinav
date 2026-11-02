# T10 — Soru Üretim Ekibi

## Tasarım yönü

Onaylı T10 referansı: `Duraklatılmış soru üretim ekibi konsolu.png` (`libfile_676c8c2f7b988191b4b80d260b1bbbe5`). 2 Kasım'daki iki Instagram referansının ardından kullanıcı; kompakt özet, belirgin ana çalışma alanı ve ölçülü etkileşim önerisini onayladı.

Üstte üretim kotası, insan incelemesi, onaylı soru ve raporlanan kullanım; ardından gerçek ekip/yürütme durumu, kuyruk ve manuel görev alanı bulunur. Müfredat kapsamı ve hedef açıklamaları korunur, günlük operasyonun altına taşınır. T01 sol menü, mevcut marka ve açık içerik alanı korunur. Ana kimlik STANDARD temasında orman yeşilidir; diğer temalara nötr taşma koruması uygulanır.

Referans videolar: https://www.instagram.com/reel/DfCWtPgPcfP/ ve https://www.instagram.com/reel/DfMH6YTTcwx/ . Bilgi hiyerarşisi ve kısa basma/hover geçişleri alınmıştır. Koyu/neon dashboard, fotoğraf üzerinde cam menü veya yalnız simgeli navigasyon kopyalanmamıştır. Varsayılan görünüm sessizdir ve reduced-motion destekler.

## Teknik sınır ve bilinçli farklar

- Zaman serisi API'si olmadığı için üretim grafiği veya uydurma hız/eğilim eklenmez.
- Sayılar, ajan durumları, kota ve engeller aynı mevcut API alanlarından gelir. Tasarım otomatik üretimi başlatmaz, bütçeyi ya da sayacı değiştirmez.
- İnsan onayı, kullanım hakkı ve doğrulanmış müfredat kontrolleri aynıdır. Kısıtlı sorular onaylı gibi sunulmaz.
- Mevcut dört sekme ve işlevler korunur. Referansta bulunan fakat kaynakta olmayan ek filtreler, ayrıntı düğmeleri veya bildirimler eklenmez.
- Gerçek hedef, kapsam, açık uçlu üretim ve ortak yazılı açıklamaları gizlenmez. Bu yüzden ekran referanstan uzundur.
- Manuel görev ve kuyruk geniş ekranda iki sütun, 1199 px altında tek sütundur. Tablolar kendi kapsayıcısında kayar; sayfa kaymaz.
- Yeni state/effect/API/handler/rol kuralı yoktur. Görünüm importu ve sınıfları geri alınıp taşınan tam kaynak satırları karşılaştırıldığında kaynak mantığı birebir aynıdır.
- Yazdırma CSS'i değiştirilmemiştir; yeni kurallar yalnız `@media screen` içindedir. İçerik sırası baskıda da yeni okuma sırasıdır; fiziksel baskı doğrulaması yapılmış sayılmaz.

## Değişen dosyalar

`QuestionTeam.tsx`: CSS importu, ek sınıflar, yerleşim kapsayıcısı ve mevcut bölümlerin sırası. `approved-question-team.css`: kapsamlı görünüm kuralları. İki kontrol betiği, bu belge, doğrulama JSON'u ve 1440/390 görüntüleri.

Worker, migrations, src/lib, api/auth, tests, workflow, wrangler ve bağımlılıklar değişmez. Öğrenci kazanım kanıtı teknik PR434'ün bulunduğu `491ea25b896100f7cbf84a19378e294f2bbbc35f` tabanı korunur.

## Kontroller

```sh
npm ci
npm run typecheck
npm test
npm run build
node scripts/check-question-team-presentation.mjs
ANUNEX_BROWSER_EXECUTABLE=/path/to/chromium node scripts/design-question-team-smoke.mjs
```

Tam test paketi: 354 dosya / 1.521 test başarılı. Typecheck ve build başarılı. 27 tarayıcı senaryosu başarılı (360/390/768/1024/1180/1440, beş tema, tüm sekmeler ve engel durumları). Minimum örneklenen metin kontrastı 5,941:1; kapsamlı erişilebilirlik sertifikası değildir. Tarayıcı doğrulamasının son sonuçları `verification.json` içinde; fixture verileri temsilîdir, resmî kazanım veya canlı üretim kanıtı değildir. Gerçek üretim/veri/model çağrısı yapılmaz. Betik dış ağı engeller ve yalnız beklenen sentetik kontrol PATCH'ine izin verir.

## Elle kabul

1. Süper Admin / STANDARD ile Soru Havuzu Ekibi ekranını aç; gerçek sayılar, ortam ve son veri zamanını kontrol et.
2. Ekip ve ajan durumlarının kapalı/engelli/çalışıyor farklarını metinle gösterdiğini kontrol et.
3. 360 ve 390 px'te menüyü aç/kapat, sekmeler ve kart içi tabloları kontrol et; sayfa yatay taşmamalı.
4. Doğrulanmış çıktı seçilmeden görev kaydının pasif kaldığını kontrol et. Görsel kabul için üretim görevi başlatmak gerekmez.
5. Medya incelemesinde onay kutuları ve kullanım hakkı tamamlanmadan onay işleminin pasif kaldığını kontrol et.
6. Diğer temaları, klavye odağını, azaltılmış hareketi ve yazdırma görünümünü kontrol et.
