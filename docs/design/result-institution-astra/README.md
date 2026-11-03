# Sonuç kurum paneli — Astra görünümü

Bu çalışma yalnız oturum açılmış **kurum panelinin** görünümünü yeniler. Mevcut ekranlar, Türkçe içerikler, gerçek sayaçlar ve işlem akışları korunur. Yeni veri, özellik veya işlem eklenmez.

## Görsel yaklaşım

- Lacivert `#142e40` gezinme, petrol `#0d626a` ana işlem, beyaz yüzeyler ve açık gri çizgiler.
- Ana sayfada gerçek değerlendirme sayıları, belirgin sınav yükleme kartı, rapor/veri kısayolları ve daha okunaklı son yüklemeler.
- Sınav yükleme adımlarında tutarlı etiket–alan aralıkları; dosya seçimi, okul doğrulaması, kitapçık seçimi ve değerlendirme özetinde belirgin hiyerarşi.
- Geçmiş ve veri tablolarında yerel yatay kaydırma, okunaklı satırlar ve tutarlı işlem düğmeleri.
- Kurum iletişim formu ve parola formunda ferah düzen; 600 px altında tek sütun. 860 px menü aç/kapat davranışı korunur.
- Ana form düğmeleri 44–48 px; veri, sekme ve bağlantı düğmeleri en az 40 px. Yeni odak görünümü belirgindir; hareket azaltma tercihi desteklenir.

## Sınırlar

Değişen uygulama dosyası: `src/pages/approved-result-institution.css`. Var olan kuralların sonuna, yalnız `@media screen` içinde çalışan kurum rolü + `.osh` kapsamlı bir katman eklenmiştir. Giriş ekranına, öğrenciye, bayiye ve uygulama yöneticisi kabuğuna yeni seçici uygulanmaz. Ortak JSX, API, yetki kontrolü, state/effect, yönlendirme, veri kaynakları ve bağımlılıklar değişmez.

`.rm`, ana sayfa ve hesap ekranlarında da kullanıldığı için bütün sınıf dışlanmaz. Ana sayfa, üst başlık ve belirli arayüz kartları açık seçicilerle ele alınır. Rapor belgesinin `.rx-pages` / `.rm-preview` alanlarına seçici veya devralınacak ortak renk değişkeni eklenmez; PDF/rapor üretimi ve yazdırma stilleri değiştirilmez. Başlangıçtaki CSS kuralları korunmuştur.

## Doğrulama — 3 Kasım 2026

- Güncel ana dal tabanı: `b3a35b2bfa60c6eab7dbb922a4e0d1e174f53a8f`.
- `npm ci`, tip kontrolü, derleme ve mevcut 363 dosyadaki 1.547 test başarılı.
- CSS ayrıştırma kontrolünde 194 yeni seçicinin tamamı kurum rolüne ve ekran ortamına sınırlı. `git diff --check` başarılı.
- `scripts/design-result-institution-astra-smoke.mjs` hazır ve sözdizimi kontrolü geçti. Tarayıcı kurulumu tamamlanmadığından senaryolar çalıştırılmadı; mobil taşma, klavye odağı, kontrast ve ekran görüntüsü kabulü bekliyor.
- Tarayıcı hazır olduğunda: `npm run build`, ardından `node scripts/design-result-institution-astra-smoke.mjs`. Harici yerel Chromium için `ANUNEX_BROWSER_EXECUTABLE` kullanılabilir.
- PR açma ve canlı yayın bekliyor. Öğrenci açılışı, bayi, rapor belgeleri ve işleyiş bu değişiklikte aynı.
