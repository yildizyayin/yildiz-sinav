# D001 / T02 — Sınav detay ve genel görünüm

Onaylı yön: **LGS Deneme 01 sınav detayları.png**, 19 Ekim, Library libfile_8cccf5d9ab7c819180ab589df441e42a. Orijinal reference.png olarak kaydedildi. Liste yayını40334539725 / 479b0e23 SUCCESS, Verify release ve Read-only production smoke acceptance başarılı olarak doğrulandıktan sonra bu adıma geçildi.

## Değişiklik

src/pages/ExamDetail.tsx yalnız CSS importu, JSX yerleşimi/sınıflar ve mevcut schedule yanıtının salt okunur kaydedilmiş tarih özeti. Genel bilgiler/çalışma alanı sol, taslak hazırlık kontrolü sağ; dar ekranda tek sütun. State, effect, yardımcı/işlem fonksiyonları, API ve izinler başlangıçtaki main2ed4d245 ile byte karşılaştırmasında aynı. Aktifleştirme/publish ayrımı, disabled koşulları ve Türkçe metinler korunur. Düzenleme/yükleme/rapor/kanal hedefleri ve üç nokta/çöp kutusu akışı aynı.

Yeni approved-exam-detail.css STANDARD+SUPER_ADMIN+screen kapsamıyla açık yüzey, kompakt kart ve kontrol satırları, gerçek sekme vurgusu, kaydırılabilir sekme/tablo, okunur durumlar ve sessiz basma/focus/reduced-motion sağlar. Yeni dl tarih yerleşimi diğer temalarda da okunur; renkleri değişmez. Hidden paneller CSS ile gösterilmez. Başka rolün yeni yetkisi yok. worker/, migrations/, API/auth/lib/tests/github/wrangler/paketler/report-print.css ve diğer ekranlar değişmedi.

## Referanstan ayrılıklar

- Mevcut sekmeler Genel bakış / Dersler ve cevap anahtarı / Kazanımlar / Uygulama ve yayın / Yönetim olarak korunur. Ders tablosu kendi mevcut sekmesinde kalır; Genel'e kopyalanmadı. Optik/dosya veya değerlendirme için yeni sekme/state uydurulmadı.
- Aktifleştir düğmesi mevcut hazırlık panelindedir; aynı hazır olma/yetki koşullarına tabidir. Referansın düğmesini her sekmeye çoğaltmak için davranış değiştirilmedi. Önceki aktifleştirme davranışı değiştirme talepleri bu görünüm görevinin kapsamına alınmadı; mevcut testler korunur.
- Hazırlık sayıları/mesajları yalnız mevcut readiness.checks/blockers/warnings'ten gelir. Örnek90/90 veya82/90 kullanılmaz. ACTIVE sınavda eski davranış gereği taslak hazırlık paneli gösterilmez.
- Kanal bileşeni yalnız bekleyen güncelleme uyarısı sağlar; her kanalın tam durum kartı için veri/state yok. app/sonuc için sahte yayında/yayımlanmadı tablosu eklenmedi; mevcut Yönetim sekmesindeki Kanalları yönet bağlantısı kalır. Sonuç KPI'si mevcut result_freeze_status bilgisidir, kanal yayını değildir.
- Tarihler kaydedilmiş schedule yanıtından mevcut toLocalInput biçimleyicisiyle gösterilir; formda henüz kaydedilmemiş alanlardan alınmaz. Tarih yoksa —. Mevcut tarayıcı/sunucu saat davranışı değişmedi.
- Orijinal marka/üst bar ve son onaylı sol menü korundu; prototipin temsili logosu yeniden çizilmedi. Başlık/işlem yazıları korunur. Kiremit ana işlem AA için koyudur.

Görseller sentetik API'li gerçek React üretim çıktısıdır, gerçek üretim istatistiği değildir. Betik GET dışında çağrıyı reddeder; gerçek veriye yazılmaz. Print kontrolü yalnız mevcut sidebar gizlemesini doğrular; PDF rapor testi değildir.

## Elle kabul

Süper Admin STANDARD → sınav listesi → bir sınav. Genel bilgiler, kaydedilmiş tarihler, taslak hazırlık ve pasif aktifleştirme görünür. Hazır taslak/aktif/yayında durumlarını ayırın. Sekmeleri açın; önceki içerik gizlenmeli. Menüde aynı Düzenle/Kopyala/Raporlar/Arşivle/Çöp kutusuna taşı. Çöp kutusunda etki/kapsam görünmeli, Vazgeç kapatmalı. Telefonda menü/paneller/sekme ve tablo kaydırması, klavye odağı ve diğer temaları kontrol edin.

## Yerel doğrulama

npm ci, typecheck ve build başarılı. 319 dosya/1419 testten 316 dosya/1414 test geçti. Üç değiştirilmeyen backend test dosyasında5 adet5000ms timeout: question-generation-runner, rubric-observation-acceptance, s020-institution-claim. Tam yerel paketin geçtiği iddia edilmez. İlgili5 mevcut dosya/20 test ayrıca başarılı. Önceden onaylanan süreç istisnasıyla PR GitHub CI tam doğrulaması için açılır; verify başarılı olmadan merge edilmez. Test dosyaları/süreleri değiştirilmedi.

28 tarayıcı senaryosu: STANDARD1440/1180/1024/768/390/360; diğer4 tema1440/390; hazır/aktif/yayında/hata/yükleniyor/çöp kutusu1440/390; kurum yöneticisi1440/390. Sekme hidden davranışı, menü konumu ve hedefi, kanal yetkisi, taslak pasifliği, hazır aktifleştirme, yayını ayrı tutma, çöp kutusu etki/kapsam/Vazgeç, GET-only, sayfa taşması, görünür klavye odağı, >=40px hedefler, reduced-motion, tablo içi scroll, mobil menü ve print sidebar gizleme kontrol edilir. Örneklenen minimum metin kontrastı5.8597:1. İlk turdaki eski kart dekorasyonu/boşluk düzeltildi; son görünümle28 senaryo yeniden geçti. verification.json son başarılı turundur. Çöp kutusu açık iletişim kutusu görüntüsü trash-dialog-390.png adıyla ayrıca korunur.
