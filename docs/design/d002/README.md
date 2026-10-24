# D002 — Veli

Veli ana sayfası, bağlı çocuk kartları ve haftalık özet. Haftalık özette mevcut çocuk seçimi değiştirilip doğru başlık yenilendi. Taslaklardaki ana sayfa çocuk seçici, randevu talepleri ve bildirim tercihleri mevcut ekranda bulunmadığı için yeni işleyiş eklenmedi.

Kayıtlı Astra/T01 tasarım dili: açık içerik, koyu okunabilir yazı, ince kenarlıklar, kompakt bilgi, özgün ANUNEX/Nibiru ve mor içermeyen modül vurguları. Bu PR yalnız görünüm içindir. Mevcut metinler, rota, state, API, rol ve buton işlevleri korunur. Bütün taslak özelliklerinin teknik uygulaması tamamlandı iddiası değildir.

## Dosyalar

- src/parent-panel-design.css
- src/main.tsx: yalnız CSS importu; runtime mantığı aynı.
- Bu dizindeki tarayıcı görüntüleri ve açıklama.

## Doğrulama

npm ci, npm run typecheck, npm test ve npm run build başarılı. 312 dosya / 1399 test geçti; testler ve bağımlılıklar değişmedi. Worker statik/dinamik import uyarısı mevcut; derleme hatası değildir.

Yerel üretim çıktısı Chromium ile 1440, 390 ve 360 px genişlikte kontrol edildi. Görsellerdeki tüm isim/sayı/tarih/sonuçlar sentetiktir; canlı sistem durumu değildir. Mobil menü açma/kapatma, sayfa taşması ve hata sınırı kontrol edildi. Veri kaynağı örneklenmeyen ikincil ekranlar kontrollü 503 hata görünümünde incelendi; bütün iş akışlarının gerçek veriyle kabulü değildir.

Yeni stiller yalnız screen ve ilgili STANDARD rolü (D007 yalnız result-portal kökü) kapsamındadır. Yazdırma ve diğer temalar için yeni görünüm etkinleşmez. Ortak mesaj/busy/focus standardı D001 PR #367 ile gelir; bu PRlar main tabanlı ve farklı CSS dosyalarıyla hazırlanır, D001–D007 sırasıyla gözden geçirilip birleştirilmelidir. Main veya canlıya bu çalışmada yazılmadı.

## Görseller

- [home-1440.png](home-1440.png)
- [home-390.png](home-390.png)
- [weekly-390.png](weekly-390.png)

## Elle kabul

1. İlgili rolle test hesabında giriş yapın; yalnız kendi yetkili kayıtlarınızın mevcut ekranlarını açın.
2. 1440/390/360 px, uzun adlar ve büyütülmüş metinle düzeni kontrol edin.
3. Menü, form, mevcut sekmeler ve klavye odağını deneyin; pasif/meşgul/hata/başarı durumunu gözlemleyin.
4. Diğer temalara geçin, yazdırma önizlemesini açın; gerçek çok sayfalı raporları ayrıca kontrol edin.
5. Yeni veya eksik işlevleri bu görünüm PRına eklemek yerine ayrı teknik iş olarak kaydedin.
