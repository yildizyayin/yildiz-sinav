# D007 — Sonuç portalı onaylı görünüm

Yalnız görünüm. Mevcut Türkçe metinler, erişim doğrulaması, state/effect/API çağrıları, yetkiler, işlem düğmeleri ve rapor kaynakları değiştirilmedi. Yeni kütüphane yok. Yeni stiller yalnız ekran medyasında ve `.approved-result-portal` altında; uygulama kabuğuna taşınmaz.

## Doğrulama

`npm ci`, `npm run typecheck`, `npm test`, `npm run build`; ayrıca `scripts/design-result-portal-smoke.mjs` ile sentetik API verisi ve sentetik Turnstile alanı kullanılır. Gerçek kullanıcı/kurum, gerçek giriş, canlı Turnstile veya canlı yük testi değildir. `verification.json` çalıştırılan senaryoları kaydeder. 1440/390 ekran görüntüleri bu dizindedir; 360/768 taşma kontrolleri JSON kaydındadır. Fiziksel PDF yazdırma ve canlı mobil cihaz testi yapılmış sayılmaz.

## Bilinçli ayrımlar

- Referans görsellerin renk, yoğunluk ve tipografi dili uygulanır; mevcut metinler korunur.
- Referanstaki yeni durum, veri, sekme, rapor metriği veya yetki kapsamı uydurulmaz.
- Mevcut rapor ön izlemesi kesin yayımlanmış sonuç gibi gösterilmez; eksik sıralama/puan sıfır yapılmaz.
- Büyük tanıtım alanı küçültülür; seçilen rolün form/iş alanı öne alınır. Orijinal marka ve Nibiru varlıkları korunur.

## Kapsam dışı teknik uyumsuzluk

Son karar: sonuç portalında genel öğrenci sicili eşleştirmesi istenmiyor; yalnız çift optikte eşleşmeyen kayıtlar istisna olabilir. Mevcut operasyon bileşeni genel MATCH/GUEST/CANCEL incelemesi içeriyor. Bu tasarım işi bunları kaldırmaz veya gizlemez; ayrı teknik düzeltme gerekir. Mevcut ağ yöneticisi yerleşimi de işleyiş değişikliği yapılmadan korunur. Öğrencinin sonuç erişim kodu doğrulaması bu eşleştirmeden farklıdır ve korunur.

## Yayın

Normal app üretim dağıtımı, sonuç portalının dağıtıldığı anlamına gelmez. Mevcut `Deploy ANUNEX Result Network` iş akışı main dalından ayrıca çalıştırılmalı; önceden bağlı alan adı için `attach_domain=false`. Korunan `.github/` tetikleyicisi değiştirilmez.

## Bu adım

Kurum: parola gösterme/gizleme, beni hatırla, güvenlik alanı, mevcut ilk giriş PIN bölümü, yetkili operasyon, kurum kartı ve rapor. Referanstaki ek yan bilgi paneli için yeni veri veya işlem uydurulmaz.

## Referans ve sonuç

Onaylı görsel: https://chatgpt.com/library?file_id=libfile_5e849cad44708191b270b0a7c4913f30&account_id=personal

Güncel ana dal 6c5579f22e6e850fb88bd783757099b357995a95 üzerinde typecheck/build ve 321 dosya / 1423 test geçti. Üç rol + uygulama kabuğu için toplam 42 sentetik tarayıcı senaryosu doğrulandı.
