# Onaylı sol menü — 26 Ekim 2026

Bağlayıcı görsel: kullanıcının yüklediği ANUNEX Süper Admin gösterge paneli(1).png; değiştirilmemiş kopyası reference.png. 24 Ekim PR #376'daki profil üstte/Nibiru altta/renkli küreli menü kullanıcı tarafından reddedildi; bu referans onun yerine geçer.

Kullanıcı 26 Ekim'de, menü adları/grupları ve çalışan menü araması için önceki metin/state değiştirmeme kuralına istisna verilmesini “devam edelim” ile onayladı. Yetki, rota, API ve backend iş kuralları korunur. Bu iş yalnız Süper Admin + ANUNEX_STANDARD sol menüsüdür. Diğer roller ve temalar mevcut menülerini korur. Sonuç portalına app menüsü taşınmaz.

## Uygulanan

Genel Bakış doğrudan bağlantı; Ölçme ve Sınav, İçerik ve Öğrenme, Eğitim Operasyonu, Rehberlik ve Analiz, Kullanıcılar ve Kurumlar, Nibiru ve Ajanlar, Sistem Yönetimi açılır gruplar. Referanstaki sıra, beyaz yüzey, çizgi ikonları, hafif mavi aktif sayfa ve ince sol şerit uygulanır. Altta sabit Yardım ve Süper Admin profil/çıkış alanı; üstte menü araması, menü altında Soru Havuzu/Takvim kısayolları.

Arama yalnız mevcut yetkili menü kayıtlarını filtreler; Türkçe harf/büyük-küçük harf eşleştirir. Eşleşmeyen aramada dürüst boş durum. Sonuç mevcut rotaya gider; mobil menü kapanır ve arama temizlenir. Mevcut 49 benzersiz menü yolu korunur; yeni backend rotası veya yetki eklenmez. Aktif sayfanın grubu açılır; klavye odağı, aria-expanded ve yerel HTML details kullanılır.

Görseldeki yaklaşık 300 px sol menü genişliği uygulanır. Önceki 240 px teknik ölçü, uzun başlıkları iki satıra düşürerek referansı bozuyordu; son görsel talimatına göre bu görsel ölçü önceliklidir. Mobilde min(300px, viewport - 40px). İçerik alanı açık kalır; mor/dekoratif küreler yoktur.

Orijinal ANUNEX marka bileşeni korunur; referans görseldeki temsili sözcük/yörünge logosu yeniden çizilmedi. Nibiru büyük alt kartı kaldırılır; Nibiru ve Ajanlar gerçek menü grubudur, mevcut üst bar Nibiru bağlantısı korunur. Yardım alanı menü kullanım açıklamasıdır; canlı destek/sohbet/çağrı merkezi varmış gibi sunulmaz. Kısayollar mevcut iki sabit bağlantıdır; kişiselleştirme veya kayıt servisi uydurulmadı.

Ana gösterge paneli içeriği bu adımda yeniden tasarlanmadı: gerçek veri alanlarının referansın tablo düzenine eşlenmesi sonraki iş. Örnek kurum/sayı/tarih/çalışıyor durumları üretime aktarılmaz. Global kayıt araması, tarih/kurum filtreleri veya Hızlı İşlem düğmesi işlevi doğrulanmadan dekoratif düğmeler olarak eklenmedi.

## Kanıt

comparison.html: referans ile gerçek React sol menüsü yan yana. home-1440.png ve home-390.png: masaüstü ve telefon; tüm ekranlar sentetik veriyle yerel üretim çıktısıdır. verification.json: 1440/1180/1024/768/390/360 px'te arama, Türkçe eşleşme, sonuç yok, arama temizleme, mevcut rotaya gitme, aktif grup, mobil kapanma, yardım/profil açma, focus, reduced-motion, print sidebar gizleme ve taşma/render hata kontrolü. Üretim oturum/veri kabulü değildir.

## Korunan kapsam

worker/, migrations/, src/api.ts, src/auth.tsx, src/lib/, tests/, .github/, wrangler*, paketler ve rota tanımları değişmedi. Layout.tsx'e yalnız Süper Admin STANDARD için yeni gezinme bileşeni bağlanır; mevcut logout akışı aynıdır. Yeni state yalnız menü araması ve grup açma içindir.

## Son doğrulama durumu

npm ci ve npm run typecheck geçti; npm run build geçti. Yerel tarayıcı kabulü altı genişlikte geçti. Mevcut testler ve süre limitleri değiştirilmedi.

Tam npm test çalışmasında 312 dosya / 1404 test geçti; üç backend testinde 5000 ms süre aşımı oluştu: s020-institution-claim, a082-question-import, scheduler-read-budget. Değiştirilmemiş main ayrı worktree'de çalıştırıldığında a082-question-import ve scheduler-read-budget senaryolarında da aynı süre aşımı türü görüldü. İşçi sayısı azaltılarak ve aynı kaynaklar RAM dosya alanında çalıştırılarak yapılan ortam denemesi tam başarı sağlamadı; kaynak/test/timeout/kalite kapıları değiştirilmedi. Sorunun yalnız bu menü değişikliğine bağlı olduğu iddia edilmiyor; tüm testler geçti denmiyor.

Kullanıcının “PR öncesi tüm komutlar başarılı olmalı” kuralı nedeniyle bu aşamada yalnız tasarım dalı hazırlanır. PR/merge/production yayını yapılmaz. Sonraki işlem: görünümü referansla değerlendirmek ve değişmemiş testleri güvenilir ortamda tamamen geçirmek; ardından ayrı PR. D003 ve sonraki tasarım yayınları bekler.
