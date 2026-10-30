# T09 — Soru Havuzu görünümü

## Kapsam

ANUNEX_STANDARD / SUPER_ADMIN / Soru havuzu sekmesi. Onaylı orman yeşili liste + önizleme dili mevcut arayüze uygulanır. T01 sol menü değişmez. Diğer temalar ve öğretmen ekranında yalnız soru görünümünün taşmasını engelleyen kapsamlı olmayan yerleşim kuralları vardır; renk kimlikleri değişmez. Baskı CSS’i değişmez.

Referans: onaylı `ANUNEX Soru Havuzu önizlemesi.png` (Library kimliği `libfile_ad98b2a3d4388191a07851a405711564`).

## Teknik uygunluk / sıra

| Alan | Kanıt ve karar |
|---|---|
| Mevcut Soru Havuzu | Liste, arama/filtre, önizleme, manuel giriş, aktarım ve insan inceleme bileşenleri mevcut; bu PR görünümünü uyarlar. Gerçek backend/veri kabulünün tamamlandığı iddia edilmez. |
| Soru Havuzu Ekibi | Mevcut ayrı ekran; otomasyon ve 7/24 üretim hazır kabul edilmedi. Sonraki tasarım öncesi teknik inceleme gerekiyor. |
| Studio / yeni editörler | P01 #420 main’e alındı. P02/P03 ve yeni şekil çizme/üretim akışlarının kabulü ayrıca doğrulanmalı; bu PR o sekmelere tasarım uygulamaz. |
| Hızlı Test | Ayrı teknik/görsel kabul gerekiyor; bu PR kapsamı dışında. |
| Raporlar | Cloud teknik çalışması sürüyor; tasarım değişikliği bekletilir. |

## Bilinçli referans farkları

- Mevcut filtreler korunur. Referanstaki ek yıl/ders/kazanım filtreleri, sayfalama ve Studio’ya toplu aktarım teknik destek doğrulanmadan eklenmez.
- İnsan incelemesi, telif kısıtı, doğrulanmış kazanım/geçmiş ve manuel soru giriş alanları gizlenmez. Bu nedenle ekran referanstan daha uzundur.
- Ana yerleşim yaklaşık eşit liste/önizleme sütunları, 1199 px altında tek sütundur. Mobilde her iki alan da erişilebilir.
- 40 px dokunma alanı olan etiketlerin içindeki onay kutuları 18 px görünür.

## Değişen uygulama dosyaları

- `src/pages/ContentCenter.tsx`: yalnız CSS importu ve kök sınıf/data öznitelikleri.
- `src/pages/approved-question-pool.css`: sayfa ile sınırlı görünüm ve taşma koruması.

State, effect, API, rol, doğrulama, Türkçe metin, rota, buton işlevi ve eski sınıf adları değişmez. Worker/migration/lib/tests/workflow/dependency değişikliği yoktur; P01’in mevcut main değişiklikleri bu PR’ye ait değildir.

## Doğrulama

`npm ci`, `npm run typecheck`, `npm test`, `npm run build` çalıştırılır. Tarayıcı kanıtı `scripts/design-question-pool-smoke.mjs` ile gerçek React derlemesi üzerinde sentetik API verileri kullanılarak alınır; production hesabı/verisi kullanılmaz. `verification.json` senaryoları kaydeder. Ekran görüntüleri canlı veri veya canlı yayın kanıtı değildir.

```sh
ANUNEX_BROWSER_EXECUTABLE=/path/to/chromium node scripts/design-question-pool-smoke.mjs
```

Tarayıcı kapsamı: 360–1440 px, beş tema, öğretmen görünümü, boş durum, tekli/toplu insan incelemesi ve RESTRICTED onay engeli, grafik, yazılı rubrik, form hatası/başarısı, aktarım meşgul/hatası, Studio izolasyonu, uzun içerik; konsol hatası, sayfa taşması, odak, dokunma alanı ve print kabuğu kontrolü. Kontrast örnekleri otomatik örneklenir; kapsamlı erişilebilirlik sertifikası değildir.

## Mevcut teknik borçlar (değiştirilmedi)

- `load()` bazı soru API hatalarını boş listeye çeviriyor; gerçek hata/boş sonuç ayrımı teknik iş olarak ele alınmalı.
- Önizlemedeki göz simgesi için mevcut kaynakta tıklama işlevi yok; bu PR ona yeni bir davranış yüklemez.
- Studio sekmesinde 390 px yatay taşma mevcut; T09 sınıfı çıkarıldığında aynı genişlik doğrulanır. Studio teknik/tasarım işi içinde giderilmeli; bu PR onu düzeltmiş saymaz.
- Liste limiti mevcut API davranışıdır; gerçek sayfalama eklenmez.

## Elle kabul

1. Süper Admin / STANDARD ile İçerik ve Öğrenme → Soru Havuzu & Studio aç.
2. Listeyi ara ve filtrele; soru seç, cevap/çözüm ve kazanım kartlarını kontrol et.
3. İncelemede/RESTRICTED soruda onay engelinin sürdüğünü doğrula; gerçek onay verme zorunluluğu yok.
4. Eksik seçenekli formun hata verdiğini, boş listenin mesajını, dosya aktarımında meşgul/hata durumunu kontrol et.
5. 390 ve 360 px’te menüyü aç/kapat; sayfa taşmamalı, bilgiler kaybolmamalı.
6. Diğer panel temaları ve öğretmen hesabının yetki sınırlarını kontrol et.
7. Studio’ya geç; mevcut teknik akışın değişmediğini kontrol et. Yazdırma önizlemesini karşılaştır.
