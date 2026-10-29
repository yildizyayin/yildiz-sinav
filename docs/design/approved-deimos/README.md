# T08 — Deimos / Optik Basma

Onaylı görsel yön: **DEIMOS Optik Basma Önizlemesi.png**, 20 Ekim onayı;
karar kaydı `ANUNEX-tasarim-devir-kaydi.md`, T08.
Referansın kalıcı kimliği: `libfile_a54e4d6a72c081918d88f8ff46ea8eca`.

## Uygulanan görünüm

- Süper Admin / ANUNEX_STANDARD: petrol yeşili kimlik, açık kartlar, tutarlı alanlar.
- Geniş ekranda ayarlar/öğrenci seçimi solda, mevcut baskı önizlemesi sağda.
- Telefonda tek sütun; tablo ve gerçek boyutlu baskı sayfaları kendi kartında kayar.
- Önizleme yüksekliği sınırlı; öğrenci sayısı kadar A4 sayfa tüm ekranı uzatmaz.
- Kalibrasyon, boş/hata/meşgul durumları ve mevcut yazdırma engelleri görünür kalır.
- Diğer temalarda marka rengi uygulanmaz; önizlemenin nötr kabı okunur kalır.

## İşleyiş sınırı / referanstan bilinçli ayrılıklar

Bu çalışma yalnız mevcut `OpticalPrepare.tsx` görünümünü uyarlar. Referansın
sayfalama, yakınlaştırma, öğrenci arama, boş form indirme ve bağımsız PDF oluşturma
kontrolleri mevcut sayfada bulunmadığı için eklenmedi. Mevcut **Seçilenleri Yazdır**
düğmesi ve işletim sisteminin yazdır/PDF akışı korundu. Kitapçık seti mevcut
metin alanıyla girilir; yeni dağıtım algoritması veya durum makinesi eklenmedi.
Kalibrasyon ekranına bağlantı korunur; sahte düzeltme/kalibrasyon kontrolleri yoktur.

Optiğin basılı alanları, arka planı, milimetre koordinatları, öğrenci verileri,
kalibrasyon dönüşümü ve print CSS birebir korunur. Yeni CSS yalnız `@media screen`
içindedir. Önizlemeye eklenen açıklama baskıda mevcut `optical-controls` kuralıyla
gizlenir. Phobos tanımlama, Baskı Şablonu Tasarla, Yazıcı Kalibrasyonu, Raporlar ve
Cloud'un teknik dosyaları değiştirilmedi. Bu ekranın tamamlanması, bu ayrı
ekranların veya fiziksel optik okuyucu uyumluluğunun yeniden doğrulandığı anlamına gelmez.

## Doğrulama

- `npm ci`, `npm run typecheck`, `npm test`, `npm run build`.
- Kaynak eşdeğerliği: CSS importu, kök/sınıf kancaları ve baskıda gizlenen yeni
  açıklama çıkarılınca `OpticalPrepare.tsx` taban dosyası birebir elde edilir.
- `ANUNEX_BROWSER_EXECUTABLE=/path/to/chromium node scripts/design-deimos-smoke.mjs`.
- Sentetik yerel fixture; harici ağ ve tüm yazma istekleri engellenir.
- 17 senaryo: 1440/1024/768/390/360; boş, hata, meşgul, kalibrasyon eksik;
  diğer dört panel teması. Veri, ekran görüntüleri ve optik tabanı sentetiktir.
- Seçim kaldırma/geri seçme, boş seçimin yazdırmayı engellemesi, kalibrasyonsuz
  yazdırma engeli ve kalibrasyonlu `window.print` çağrısı kontrol edilir.
- Ekran/yazdırma sayfa genişliği, yüksekliği ve dönüşümü eşitliği; baskıda
  kontrollerin gizlenmesi; sayfa taşması, 40 px hedefler, görünür odak, AA metin
  kontrast örnekleri kontrol edilir. Gerçek yazıcı/okuyucu testi yerine geçmez.

`verification.json` senaryo sonuçlarını, PNG'ler gerçek tarayıcı görüntülerini içerir.
