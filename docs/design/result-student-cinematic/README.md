# Öğrenci başarılı giriş açılışı — Astra

Başlangıç: `origin/main` / `8eac120`. Dal: `design/result-student-cinematic`.

Önceki basit büyüme/solma yerine, koyu zeminde organik mavi parçacık küresi, derinlik sıralaması, iki yörünge izi, özgün Nibiru çekirdeği ve ANUNEX marka geçişi uygulanır. Referansın ışık ve parçacık fikri yeniden kodlanmıştır; referans video veya üçüncü taraf medya kullanılmaz. Mor renk eklenmez. Canonical `NibiruMark` ve `AnunexBrand` bileşenlerinin kaynakları değişmez.

## Akış ve kapsam

- Toplam süre **1,6 saniye**; kısa oluşum, marka görünümü ve son ~320 ms içinde öğrenci ekranına solma.
- Mevcut taze başarılı giriş bağlamı korunur. `ResultPortal.tsx` ve `StudentResultsWorkspace.tsx` değiştirilmez; oturum yenileme/geri yükleme sırasında açılışın yeniden gösterilmesi eklenmez.
- Atla ve Esc hemen kapatır. Başlangıçta azaltılmış hareket tercihinde modal/canvas kurulmaz; açıkken tercih değişirse kapanır.
- 5–7. sınıfta daha aydınlık mavi atmosfer ve mevcut “Birlikte keşfedelim.” metni; 8–12/mezun için daha sakin koyu atmosfer. Diğer sınıflarda nötr görünüm.
- Yalnız yerel Canvas 2D ve CSS. Ağ isteği, öğrenci verisi, ses, medya dosyası veya yeni bağımlılık yok.
- Telefonda 1000 parçacık, en fazla 30 fps ve 1,5 DPR; geniş ekranda 1800 parçacık ve en fazla 2 DPR. Kapanışta rAF ve ResizeObserver temizlenir.
- Kimlik doğrulama, veri kaynakları, rapor/PDF ve kurum/bayi panelleri değişmez. Yeni stil dosyası yalnız açılış sınıflarını hedefler; yazdırmada açılış gizlidir.

## Doğrulama

- `npm run typecheck`: geçti.
- `npm run build`: geçti; mevcut büyük parça boyutu uyarıları sürer.
- `vitest`: `result-student-entrance`, `s037-student-login`, `result-session-read`, `result-worker-boundary` — **4 dosya / 16 test geçti**.
- Yeni 5 DOM yaşam döngüsü testi: azaltılmış harekette atlama; 1,6 saniyede kapanma; Atla, Esc ve hareket tercihi değişiminde anında kapanma; dekoratif animasyon kaynaklarının bırakılması. Canvas piksel çıktısını doğrulamaz.
- `node --check scripts/design-result-student-cinematic-smoke.mjs` ve `git diff --check`: geçti.

Tarayıcı senaryoları `scripts/design-result-student-cinematic-smoke.mjs` içinde hazırlanmıştır: gerçek giriş bileşeni üzerinden sentetik Turnstile/API, sınıf görünümleri, 1440/390/360 px, klavye odağı, Atla/Esc, hareket tercihi, süre, taze giriş/yenileme ve taşma. **Bu ortamda tarayıcı testi çalıştırılamadı:** Chromium bulunmuyor; normal Playwright kurulumu kesilmiş ZIP dosyaları nedeniyle başarısız. Önceden kalmış yerel Chromium arşivi de kesilmiş durumda. Bu nedenle görsel kalite, gerçek tarayıcı performansı ve fiziksel mobil cihaz sonucu doğrulanmış sayılmaz; başarılı ekran görüntüsü veya video üretilmiş iddiası yoktur.

Çalıştırmak için kurulu Chromium ile:

```sh
ANUNEX_BROWSER_EXECUTABLE=/absolute/path/to/chromium node scripts/design-result-student-cinematic-smoke.mjs
```

Playwright video desteği de kuruluysa `ANUNEX_RECORD_ENTRANCE_VIDEO=1` isteğe bağlı kayıt açar. Üretilen veriler sentetiktir.

## Çevrimdışı tasarım önizlemesi

Depo kökünde `node scripts/build-result-student-cinematic-preview.mjs` çalıştırıldığında, gerçek açılış bileşenini içeren tek HTML dosyası bu dizinde üretilir. Dosyayı tarayıcıda açıp iki sınıf seçeneğini oynatabilirsiniz. Bu önizlemede öğrenci oturumu, API veya gerçek veri yoktur; HTML çıktısı uygulamanın üretim paketine girmez. Üretilen HTML'nin çalıştırılması, iki tonun açılması, dekoratif çizim döngüsü, Atla, Esc ve azaltılmış hareket bir benzetilmiş DOM ortamında doğrulanmıştır; bu, görsel tarayıcı kabulü değildir.

Tam test paketi: **365 dosya, 1.554 test geçti**.
