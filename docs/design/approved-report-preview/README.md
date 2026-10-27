# T06 — Mevcut rapor ekranının onaylı görünüme uyarlanması

Onaylı referans: `reference.png` / Library `libfile_78e8accf4840819190b82341fa14611b`, 19 Ekim 2026. T01 sol menü korunur. Taban: 50863a5aeb93397d325dce2c0ba7f0326ac1c72a.

## Uygulanan görünüm

`Reports.tsx` mevcut kurum/öğrenci seçimi ve sınav seçimini solda, gerçek öğrenci özeti/ders gelişimi/geçmişini sağda sunar. Yardımcı arşiv/rubrik/donmuş kaynak araçlarının tamamı aşağıda korunur. Yeni metin yalnız personel önizlemesinin sonuç yayını olmadığını açıklar.

Yeni CSS yalnız SUPER_ADMIN + ANUNEX_STANDARD + ekran medyasında etkindir. Beyaz kartlar, ölçülü Mars vurgusu, 300px seçim sütunu, dar ekranda tek sütun, kart içinde tablo kaydırma, görünür klavye odağı ve reduced-motion sağlanır. Mevcut marka/sol menü değişmez. Diğer temalar ve rollerde sunulan veriler ve kontroller korunur.

JSX yerleşimi değişir; state/effect/API, izin koşulları, öğrenci kapsamı, sınav seçimi, export fonksiyonları, handler/disabled/value/checked/key ifadeleri kaynak karşılaştırmasıyla aynı. Aynı key kullanılan ayrı yardımcı bileşenler ayrı yerleşim kapsayıcılarına alınmıştır; key veya yetki değişmez. Arşiv kartının tekrarsızlığı tarayıcıda kontrol edilir.

## Referanstan zorunlu ayrımlar — T06 tamamen bitmiş değildir

Onaylı referansta tek sınavın puan sıralı öğrenci tablosu, satıra bağlı rapor önizlemesi, şube/durum/puan filtreleri, sayfalama ve toplu karne indirme vardır. Mevcut `/reports` ekranı öğrenci seçerek birleşik gelişim raporu oluşturur; `examId` aramasıyla o listeyi açan bir akışı bulunmuyor. Bu görünüm PR'si yeni API/state/filtre veya işlevsiz düğme eklemez. Mevcut seçiciler ve raporlar kullanılır; sahte sayılar/resmî kazanımlar üretilmez. Tam T06 eşitliği için ayrı teknik sözleşme/uygulama gereklidir. Bu uyarlama tamamlandığında T06'nın tüm işlevleri kapandı denmemelidir.

## Doğrulama

- npm ci, typecheck ve build geçti.
- Mevcut ilgili6 dosya/23 test geçti: report-selection, report-print-contract, rubric-ui-lifecycle, private-rubric-panel-lifecycle, a076-theme-per-user, exam-evaluate-navigation.
- Tam yerel koşu322 dosya/1427 test:313 dosya/1407 test geçti;9 dosyada20 hata, tamamı5000ms timeout. Testler ve süreler değiştirilmedi. Önceden onaylanan süreçle PR GitHub CI'ye gönderilir; tüm verify SUCCESS olmadan merge yok.
- `scripts/design-report-preview-smoke.mjs`:23 sentetik senaryo. Standart1440/1180/1024/768/390/360; diğer4 tema1440/390; boş/hata/busy/seçim değişikliği390; diğer5rol390. Salt okunur fixture, ağ dışı istekler engellenir, üretim verisi kullanılmaz.
- Öğrenci değişince eski rapor temizliği, değişen sınav seçimi güncellenmeden CSV/PDF pasifliği, güncelleme sonrası açılması, tek arşiv kartı, mobil menü, sayfa taşması, render hataları, hedef>=40px ve odak kontrol edilir. Örneklenen metin kontrastı minimum5.929:1; bütün uygulama için AA sertifikası değildir.
- Print medyasında menünün gizlenmesi kontrol edilir; CSS screen ile sınırlıdır ve report-print.css değişmez. Fiziksel çıktı/PDF mizanpaj kalifikasyonu yapılmış sayılmaz.

## Elle kontrol

1. Süper Admin/standart temada Raporlar'ı açın; kurum ve öğrenci seçin.
2. Gerçek öğrenci özeti üstte, yardımcı araçlar altta görünmeli; kurum değişince önceki öğrencinin verisi kalmamalı.
3. Sınav seçimini değiştirin; CSV/PDF güncelleme öncesi pasif, Raporu Güncelle sonrası kullanılabilir olmalı.
4. 390/360px menü ve seçimleri kullanın; sayfa taşmamalı, tablolarda kart içinde yatay kaydırma olmalı.
5. Diğer temalarda ve yetkili diğer rollerde mevcut rapor/çocuk/branş sınırlarını kontrol edin.
6. Gerçek karne çıktısını ayrıca doğrulayın; personel önizlemesini sonuç yayını gibi değerlendirmeyin.
