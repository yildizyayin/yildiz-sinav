# D001 — Süper Admin ana gösterge paneli

26 Ekim 2026. Sol menü PR #378 / production run 40295271045 başarıyla yayımlandı; Verify release ve Read-only production smoke acceptance başarılı. Kullanıcı sıradaki tasarımlara geçilmesini istedi. Bu adım yalnız ana panelin görünümüdür; yeni menüye dokunulmaz.

## Görsel yön ve uygulama

Onaylı ANUNEX Süper Admin gösterge paneli(1).png, mevcut docs/design/approved-navigation/reference.png. Açık içerik, ortak gösterge şeridi, iki sütunda kompakt tablo görünümü, ince kenarlıklar ve küçük hızlı işlem alanı esas alındı. Orijinal metin, rota, sınıf adları ve veriler korunur. Durum renkleri yazıyla birlikte görünür. Bekleyen işlerin satırı hâlâ aynı mevcut bağlantıdır; yeni API veya işlem eklenmez.

Mevcut sekiz gösterge korunarak tek beyaz şeritte iki sıra halinde gösterilir. Dört bekleyen işlem satırı, altı kurum özeti göstergesi, mevcut sistem sağlığı satırları, denetim kayıtları, dokuz operasyon sayacı ve altı hızlı işlem korunur. Durum yoksa yeni sonuç/başarı üretilmez; mevcut yükleniyor, hata, boş ve bilinmeyen değer metinleri korunur. Başlık Yönetim özeti ve mevcut düğme metinleri değiştirilmez; yalnız referansın açıklama satırı eklenir.

## Altyapıyla çelişen, uydurulmadan açık bırakılan alanlar

worker/index.ts mevcut /api/dashboard yanıtı yalnız cards, pending, institutionSummary, recentActivity, systemHealth sağlar. Bu görünüm görevi backend, API çağrısı ve state değişikliğini yasaklar. Bu nedenle:

- Takvim etkinlik satırları gelmediği için Yaklaşan takvim örnek kayıtlarla doldurulmaz.
- Nibiru görev/ajan durumları bu yanıtta yoktur. Mevcut /api/admin/operations-summary verileri İşler ve hatalar adıyla gösterilir; Nibiru üretimi çalışıyor denmez.
- app/sonuc/demo yayın kanalı erişim durumu ayrı ayrı gelmez; Sistem sağlığı mevcut sunucu alanlarını aynen gösterir, yeni dış erişilebilirlik iddiası yoktur.
- Kurum özeti yalnız toplam değerlerdir; kurum adı/lisans/koltuk satırları uydurulmaz.
- Eğitim yılı/kurum/tarih filtresi ve global kayıt araması için mevcut ana panelde işleyiş yoktur; dekoratif, çalışmayan kontrol eklenmez.
- Hızlı İşlem açılır menüsü yerine mevcut çalışan Sınav Ekle/Sınav Yükle ve altı mevcut hızlı bağlantı korunur.

Bu farklar asistan tarafından kullanıcıya açıklandı; tasarımın eski görselle tüm içerik açısından birebir aynı olduğu veya bu teknik bağlantıların tamamlandığı söylenmez. Ayrı teknik görevde doğrulanmış alanlar bağlandıktan sonra ilgili yerleşimler tamamlanabilir. Şimdiki görünüm yalnız mevcut gerçek veriye uygundur.

## Kapsam ve güvence

src/pages/AdminCommandCenter.tsx: yalnız JSX yerleşimi, sınıflar, görsel sütun başlıkları ve açıklama. Yeni src/pages/approved-admin-dashboard.css: renk/ölçü/grid; ANUNEX_STANDARD + SUPER_ADMIN + screen kapsamı. Diğer temalarda yeni dar hızlı işlem alanını okunur tutan sınırlı yerleşim kuralları vardır; tema renklerine dokunulmaz.

State, useEffect, API çağrıları, pending/summary bağları ve tüm yardımcı fonksiyonların kaynakları tabanla birebir karşılaştırıldı; aynı. worker/, migrations/, src/api.ts, src/auth.tsx, src/lib/, tests/, .github/, wrangler*, paketler, Layout ve report-print.css değişmedi. Sonuç portalına veya diğer rol ekranlarına yeni panel taşınmadı.

## Doğrulama

npm ci, typecheck, build geçti. Yerel tam testte 314 dosya/1410 test geçti, değişmeyen iki backend testinde 5000 ms süre aşımı oluştu: question-generation-jobs ve private-rubric-export-acceptance. Testler ve süre limitleri değiştirilmedi. Önceden kullanıcı tarafından onaylanan, yerel süre aşımını açıkça yazarak PR açıp GitHub CI'da tam doğrulama yöntemi kullanılır; başarılı CI olmadan merge/yayın yapılmaz. Yerel testlerin tümü başarılı diye raporlanmaz.

22 tarayıcı senaryosu: STANDARD 1440/1180/1024/768/390/360, dört alternatif tema 1440/390, dikkat/boş/hata/yükleniyor 1440/390. Sayfa taşması veya JS render hatası yok. Sekiz gösterge/dört kuyruk/altı özet/altı hızlı bağlantı ve örnek denetim kayıtları sayıldı; mevcut hedefler korundu. Mobil menü aç/kapat, klavye odak çizgisi, panel içi yatay kaydırma ve print sidebar gizleme kontrol edildi. Görüntüler gerçek React üretim çıktısında sentetik hesap ve API verisidir; gerçek üretim verisi/oturumu kabulü değildir. Örnek sağlık durumları fixture'dır.

Ekranlar: data-1440.png ve data-390.png normal; attention-390.png dikkat durumları; empty-390.png, error-390.png, loading-390.png ayrı durumlar. verification.json bütün sonuçları tutar. Gerçek çok sayfalı rapor/PDF kabulü bu ana panel görünüm testinden ayrı kalır.

Ek erişilebilirlik kontrolü: yeni ana panelde örneklenen metin/zemin kontrastlarının en düşüğü 5.1648:1; ana panel bağlantılarının tamamı en az 40 px yüksekliğinde. Klavye odak çizgisi ve azaltılmış hareket kontrolü geçti. Bu, bütün uygulama için erişilebilirlik sertifikası değildir.

Tekrar çalıştırılabilir tarayıcı kontrolü: scripts/design-approved-dashboard-smoke.mjs Mevcut Playwright ve browser-smoke-server kullanılır. ANUNEX_BROWSER_EXECUTABLE ile Chromium yolu belirtilir. Yeni bağımlılık veya üretim API çağrısı yoktur.

Son taban: ddb3a5c2dcb86053c1b10a473b53f992c93713cb (paralel PR379 kurum rehberi düzeltmesi). Bu taban çakışmasız alındı; typecheck/build ve 22 tarayıcı senaryosu bu birleşik sürümde tekrar geçti. 316/1412 yerel test sayıları, taban ilerlemeden önceki 93b3 sürümü üzerine uygulanan görünüm çalışmasına aittir. Güncel birleşik sürümün tam testleri GitHub CI tarafından doğrulanacaktır.
