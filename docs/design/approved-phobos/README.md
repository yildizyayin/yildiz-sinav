# T07 — Phobos / Optik Tanımlama görünümü

Onaylı referans: `reference.png` / Library `libfile_7f78f86674e88191866aea06b7fc3b85`,19Ekim2026. Taban761964aa592b857714d1fcc51fdc54ab31bfc40c. Cloud'un rapor teknik çalışmaları bu kapsamda değildir.

## Uygulama

Mevcut `/opticals` katalog/ağaç, form penceresi, kart/sürüm bilgileri, FMT eşleme, TXT/DAT, manuel parametre, gelişmiş JSON, fotoğraf ve yayın kontrollerinin görünümü yenilenir. Beyaz kartlar, sıcak amber, kompakt alanlar, okunaklı tablolar, görünür odak ve mobil düzen. Ana görsel kurallar yalnız SUPER_ADMIN/ANUNEX_STANDARD/screen kapsamındadır. Diğer temalarda yalnız yeni FMT sınıfına taşma sınırı uygulanır; tema seçimi ve yetkiler değişmez.

Uygulamada yalnız Opticals.tsx'e CSS importu ve yeni sınıf/data-role hookları eklenir. Tüm mevcut className'ler, Türkçe metinler, API/validation/state/effect/handler/disabled/checked/value/key ifadeleri ve inline geometry style'ları korunur. Kaynak karşılaştırması bu ifadelerin aynı kaldığını doğrular. OpticalDesign/OpticalPrepare/Reports/worker/lib/tests/workflows/migrations/paket dosyaları değişmez.

## Referanstan bilinçli ayrımlar

- Mevcut h1 `Optik Form Ağacı` ve düğme/metinler test/ürün sözleşmesi gereği korunur.
- Referanstaki sol seçilebilir alan listesi + ortada otomatik şematik form + sağ seçili alan düzenleyicisi mevcut ekranın birebir işleyişi değildir. Yeni state/API, sahte sekmeler veya işlevsiz düğmeler eklenmez. Mevcut FMT/TXT/manuel/fotoğraf yöntemleri kullanılır.
- Fotoğraf önizlemesi yalnız kullanıcının gerçekten yüklediği görseldir. Sembolik optik çizimi veya baskıya hazır çıktıya dönüştürülmez. Fotoğraf kutuları, baloncuk koordinatları, referans işaretleri ve pointer işleyişi aynıdır. Geometriyi temsil eden öneri düğmeleri40px genel düğme ölçüsünden özellikle hariç tutulur.
- Yayındaki sürüm kilidi, gerçek örnek dosya testi ve yayın ön koşulları korunur. Tanımlama baskı değildir; Deimos bu tur değiştirilmez.
- T07'nin görsel diline uyarlama, referanstaki tüm yeni editör işlevlerinin geliştirilmiş olduğu anlamına gelmez. Eksik etkileşimler ayrı teknik iş kapsamıdır.

## Doğrulama

npm ci,typecheck,build ve tam329dosya/1452test geçti. Test veya süre sınırı değiştirilmedi. Ayrı `scripts/design-phobos-smoke.mjs` sentetik yerel fixture kullanır; üretim verisine bağlanmaz. Harici ağ engellenir; izinli tek POST yerel sahteFMT endpointidir. Kaydetme/yayın/silme gerçek ortamda çalıştırılmaz.

Son tarayıcı kaydı `verification.json`: standart1440/1180/1024/768/390/360,4diğer tema1440/390, katalog/form penceresi/TXT/gelişmiş1440/390; boş/hata/yayında/fotoğraf/busy/FMT hata/başarı/yayın engeli390 ve kurum kataloğu390. Sayfa taşması,40px normal kontroller, görünür klavye odağı, reduced-motion, menü, pasif düğmeler, örneklenen metin kontrastı ve fotoğraf alanının göreli geometrisi kontrol edilir. Tam uygulama erişilebilirlik sertifikası, gerçek cihaz/OCR veya makine okunabilir baskı kalifikasyonu değildir.

Yeni CSS yalnız screen medyasında; yazdırma dosyaları değişmez. Print medyasında sidebar gizleme kontrol edilir, gerçek baskı testi yapılmış sayılmaz.

## Elle kontrol

1. Süper Admin/standart temada Optik Form Ağacı'nı açın; katalog ve üç nokta işlemleri görünür olmalı.
2. Ağaçtan bir optik açın; sürüm ve tanım yolları aynı şekilde çalışmalı. Yayındaki sürüm düzenleme için açılmamalı.
3. Yeni form penceresinde zorunlu alanlar boşken Kaydet pasif olmalı; doldurun ve kaydetmeden Vazgeç ile çıkın.
4. FMT/TXT başlangıç–uzunluk alanlarını390/360px'te kontrol edin; tablo kendi içinde kaymalı, sayfa genişlememeli.
5. Kendi deneme fotoğrafınızla alan ve gerçek referans işaretlerini kontrol edin; görsel boyut değişimi koordinat anlamını değiştirmemeli.
6. Örnek dosya doğrulaması/yayın kontrolünü kendi test optiğinizde uygulayın; eksik kontrol uyarıları görünür kalmalı.
