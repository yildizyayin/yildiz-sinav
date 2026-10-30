# Sonuç öğrenci paneli — sınav listesi ve ayrı ayrıntı

Onaylı iki ekranlı tasarımın gerçek bileşen uyarlaması. Ana sayfada yayımlanmış sınavlar, puan/net ve Sonucu incele eylemi; sınav açılınca aynı oturumda ayrı ayrıntı görünümü. Kapat ile listeye dönülür. URL/rota ve browser history değiştirilmez; yeni API/state/useEffect/yetki/hesaplama motoru yok.

`ResultPortal` mevcut result/detail/busy ve handler'larını salt sunum bileşeni `StudentResultsWorkspace`'e aktarır. Giriş ve kurum/bayi kodu değişmez. Eksik puan/sıra/sonuç — gösterilir. Doğru/yanlış/boş, net ve puan doğrudan yayımlanmış sınav özetinden gösterilir; derslerden yeniden sonuç hesaplanmaz. Kazanım yüzdesi null ise sıfır gösterilmez. Orijinal ANUNEX ve Nibiru varlıkları kullanılır.

Yeni stiller STUDENT ve student-results-v2 kapsamlı ekran kurallarıdır; giriş/HOME/kurum/bayi/app/print CSS'i değişmez. Giriş sonrası pazarlama hero alanı ekranda gizlenir. Sonuç karnesi mevcut printSection işlevini kullanır; yeni sunucu PDF servisi değildir.

Birleşik karne bu PR'da çalışır gibi sunulmaz: sonuç oturumuna açık API yok. Teknik gerekçe ve uygulanabilir görev combined-report-cloud.md dosyasında; lisanslı rapor API sınırı açılmaz. Yeni veri ve hesaplama varsayılmaz.

Doğrulama: npm ci, npm run typecheck, npm test, npm run build; scripts/design-student-results-v2-smoke.mjs sentetik API/Turnstile ile gerçek React derlemesini kontrol eder. Görüntüler örnek veridir; canlı öğrenci verisi değildir. Liste/ayrıntı/Kapat akışı,360/390/768/1440,boş/hata/meşgul/oturum,diğerroller ve app izolasyonu,odak/kontrast/dokunma alanı kontrol edilir. Sınav ayrıntısında yeni tablo kartı kendi içinde yatay kaydırılır; sayfa taşmaz.
