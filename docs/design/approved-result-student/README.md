# D007 — Sonuç portalı onaylı görünüm

Yalnız görünüm. Mevcut Türkçe metinler, erişim doğrulaması, state/effect/API çağrıları, yetkiler, işlem düğmeleri ve rapor kaynakları değiştirilmedi. Yeni kütüphane yok. Yeni stiller yalnız ekran medyasında ve `.approved-result-portal` altında; uygulama kabuğuna taşınmaz.

## Doğrulama

`npm ci`, `npm run typecheck`, `npm test`, `npm run build`; ayrıca `scripts/design-result-portal-smoke.mjs` ile sentetik API verisi ve sentetik Turnstile alanı kullanılır. Gerçek kullanıcı/kurum, gerçek giriş, canlı Turnstile veya canlı yük testi değildir. `verification.json` çalıştırılan senaryoları kaydeder. 1440/390 ekran görüntüleri bu dizindedir; 360/768 taşma kontrolleri JSON kaydındadır. Fiziksel PDF yazdırma ve canlı mobil cihaz testi yapılmış sayılmaz.

## Bilinçli ayrımlar

- Referans görsellerin renk, yoğunluk ve tipografi dili uygulanır; mevcut metinler korunur.
- Referanstaki yeni durum, veri, sekme, rapor metriği veya yetki kapsamı uydurulmaz.
- Mevcut rapor ön izlemesi kesin yayımlanmış sonuç gibi gösterilmez; eksik sıralama/puan sıfır yapılmaz.
- Büyük tanıtım alanı küçültülür; seçilen rolün form/iş alanı öne alınır. Orijinal marka ve Nibiru varlıkları korunur.

## Teknik eşgüdüm ve yayın

Bu tasarımlar güncel teknik ana dal 32bb3e622f3a5a2f48eef08607abdce1e9baee01 üzerine birlikte alınarak yeniden doğrulanır. S030/S031 teknik çalışmaları genel misafir adımını kaldırdı, kurum raporu/karneleri ve ayrı yazdırma akışını ekledi. Bu PR bu iş kurallarını değiştirmez. Eski rapor ekran görüntüleri güncel görüntülerle yenilenir; sentetik kontrol canlı veri veya fiziksel çıktı kanıtı değildir.

S031 ile sonuç portalı, başarılı `Deploy Production Cloudflare Worker` dağıtımını aynı commit üzerinden izler. Üretim ortamı onayı korunur. Sonuç portalının kendi `Deploy ANUNEX Result Network` çalışması başarıyla bitmeden portal canlı kabul edilmez. Tasarım işi `.github/` dosyalarına dokunmaz.

## Bu adım

Öğrenci: ana giriş, kurum/öğrenci arama, erişim kodu, sonuç geçmişi/analiz, boş/hata/meşgul/oturum geri yükleme. Referanstaki yöntem sekmeleri yerine mevcut seçici korunur. Yeni toplam puan, sıra ve tablo eklenmez.

## Referans ve sonuç

Onaylı görsel: https://chatgpt.com/library?file_id=libfile_909a4835cf008191b03bb9cb22aff2fc&account_id=personal

Güncel ana dal 6c5579f22e6e850fb88bd783757099b357995a95 üzerinde typecheck/build ve 321 dosya / 1423 test geçti. Üç rol + uygulama kabuğu için toplam 42 sentetik tarayıcı senaryosu doğrulandı.

## Astra son görsel incelemesi

Onaylı üç referans ve mevcut görüntüler Astra tarafından incelendi. Orijinal marka yatay hizaya alındı; telefonda üç bağlantı kompakt ve 40 px hedeflerle korundu. Bayi ana işlemi onaylı sıcak vurgu rengine getirildi. Kurum/bayi özetleri yeni üçlü teknik yapıya uyarlandı. İşleyiş, metinler ve yetkiler değiştirilmedi.

## Güncel ana dal kontrol notu

32bb3e62 üzerinde typecheck/build geçti. Tam yerel koşu: 317 dosya başarılı, 5 dosyada 6 süre aşımı (toplam322 dosya/1427 test). Test dosyaları ve süre sınırları değiştirilmedi; ayrı tekrar yapıldı. Son merge için güncel PR GitHub verify kontrollerinin tamamının başarı koşulu korunur.

S031 kurum raporunda önceki `reportSource` yayın/önizleme etiketi artık görünmüyor. Bu görünüm PR’si bunu değiştirmiyor; teknik inceleme gerektirir. Raporda yayın/önizleme ayrımının eksiksiz korunduğu iddia edilmez.
