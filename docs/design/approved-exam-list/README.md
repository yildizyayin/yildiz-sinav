# D001 — Sınav Merkezi listesi

26 Ekim 2026. Görsel kaynak: onaylı T01 ailesindeki **ANUNEX Sınav Merkezi Yönetim Ekranı.png**, Library libfile_c45cbefbc4e481918e371bde660276cf; orijinal `reference.png` olarak korunur. 21 Ekim kurum yöneticisi görseli bunun yerine kullanılmadı. Sol menü için PR378'deki son onaylı referans geçerlidir; menü bu adımda değişmez.

## Uygulama

- `src/pages/ExamCenterHub.tsx`: yalnız CSS importu, yeni sınıflar, mevcut filtrelerin tablo paneline taşınması ve mevcut sınav detay bağlantısının aynı hedefle satır sonunda Görüntüle olarak tekrarı.
- `src/pages/approved-exam-list.css`: açık tablo yüzeyi, kompakt filtre/başlık, 80px veri satırları, ölçülü kiremit ana işlem, okunur durum etiketleri; STANDARD + SUPER_ADMIN + screen kapsamı.
- `scripts/design-approved-exam-list-smoke.mjs`: mevcut Playwright ve statik üretim sunucusuyla sentetik tarayıcı kabulü. Yeni paket yok. `ANUNEX_BROWSER_EXECUTABLE` ile mevcut Chromium yolu verilebilir.

State, effect, API çağrısı, filtreleme, arşiv sorgusu, rol kontrolü ve upload/evaluate yönlendirmeleri byte karşılaştırmasıyla değişmedi. Türkçe başlık, açıklama, alan/işlem/durum ve boş mesajları korundu. Başlığa tıklama sürer. Mevcut sınıflar silinmedi. Yeni Görüntüle bağlantısı yeni yetki veya işlem üretmez; aynı sınav detayına gider. Üç nokta/düzenle/kopyala/rapor/arşiv/çöp kutusu mevcut detay ekranında kalır.

## Bilinçli farklar / ayrı teknik ihtiyaçlar

- Başlık **Kayıtlı sınavlar**: mevcut Türkçe metinleri değiştirmeme şartı nedeniyle korunur.
- API yalnız id/title/exam_type/grade_level/academic_year/status/publisher_name/participant_count/booklet_codes/app_channel_status getiriyor. Uygulama tarihi, hazırlık/anahtar/kazanım blokajları ve sonuc kanal revizyonu listede yok; bunlar uydurulmadı. Mevcut Katılım/Kitapçık/Durum sütunları korunur. ACTIVE, sonuc yayında/güncel anlamına çevrilmedi; mevcut **Kurumlara yayında değil** koşulu aynı.
- Örnekteki yıl/sınıf filtresi, sayaçlar, sayfalama, filtre sıfırlama ve sekmeli yeni merkez akışı mevcut listede yok. Yeni state/iş mantığı veya çalışmayan dekoratif kontrol eklenmedi. Mevcut arama/durum, Sınav Yükle/Sınav Ekle/Yayın ve kanal yönetimi bağlantıları korunur. Optik ve belge akışları bu adımda taşınmadı.
- Logo/topbar/menü PR378 ve PR381'deki gerçek marka/kabuktur; görseldeki temsili amblem yeniden çizilmedi.
- Renk, boşluk ve tablo dili referanstan; eksik verilerle bütün ekran birebir tamamlandı denmez. Eksik sözleşmeler teknik iş listesinde tutulur.

## Görüntüler ve doğrulama

PNG'ler gerçek React üretim çıktısı + sentetik kullanıcı/API; kurgu istatistikler canlı verisi değildir. Dış servisler engellenir; hiçbir POST/PATCH/DELETE çağrısı yapılmaz. Rapor yazdırma CSS'i değişmedi. Tarayıcıda print kontrolü yalnız sidebar gizlenmesidir; çok sayfalı PDF rapor kabulü değildir.

Son test sonuçları ve doğrulama kapsamı PR açıklamasında ve verification.json'da verilir. Mevcut testler/süre limitleri değiştirilmedi. Yerel arka uç süre aşımı durumunda önceki kullanıcı onayıyla PR'da GitHub CI kullanılır; CI başarısızken merge edilmez.

Elle kabul: STANDARD Süper Admin → Sınav Merkezi; arama, durum ve arşiv filtresi; sınav adı/Görüntüle aynı detayı açmalı; Yenile ve hata/boş durum; Sınav Ekle/Yükle/kanal hedefleri; telefonda menü aç/kapat ve tablo içi kaydırma. Diğer temalarda okunabilirlik ve mevcut kurum rolü kanal yetkisi korunmalı.

### Yerel sonuçlar

npm ci, typecheck ve build geçti. İlgili mevcut 5 test dosyası/20 test geçti. İlk tam yerel paket 317 dosya/1413 test: 285 dosya/1359 test geçti; 32 dosyada 54 başarısızlık, tamamı `Test timed out in 5000ms`. Bu tam paketin başarılı olduğu iddia edilmez. Tam paket a4f1f4c6 tabanıyla başladı; devamında paralel PR382 (47462632) çakışmasız alındı. Son typecheck/build ve 20 ilgili test güncel 47462632 tabanındadır. CI tam birleşim üzerinde ayrıca doğrulanmalıdır. Test/süre limiti değişmedi.

Tarayıcı kabulü 23 senaryo: STANDARD1440/1180/1024/768/390/360; FOCUS/STUDIO/COSMIC/NEON1440/390; boş/hata/yükleniyor/uzun içerik1440/390; kurum yöneticisi390. Arama, eşleşmeyen sonuç, kapalı/arşiv filtreleri ve tekrar normal kataloğa dönüş, hedef linkler, yetki, menü, focus, >=40px hedef, reduced-motion ve tablo içi kaydırma kontrol edilir. Örneklenen minimum metin kontrastı 5.5498:1. Yerel fixture kabulüdür; gerçek hesap/üretim veri kabulü veya bütün uygulama AA sertifikası değildir.
