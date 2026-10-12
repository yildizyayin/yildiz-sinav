# Sınav Merkezi — kullanıcı doğrulama rehberi

Bu rehber hazır olma ölçütlerini tanımlar; her adımın canlı ortamda geçtiğini iddia etmez. Kullanıcının taslakta kalan gerçek sınavı henüz adı/kimliğiyle belirlenmedi; o sınavın eksikleri ve durumu ayrıca doğrulanmalıdır. Önce test kurumunda, kişisel veri içermeyen bir sınav ve optik dosyasıyla deneyin.

## 1. Sınav ekle ve taslağı kontrol et

1. Sınav Merkezi → Sınav Ekle bölümünü açın.
2. Sınav adı, sınıf, ders/soru yapısı, kitapçıklar, cevap anahtarı ve puanlama profilini tamamlayın.
3. **Taslak olarak kaydet** düğmesine basın. Sayfayı yenileyince sınav ve doldurduğunuz bilgiler korunmalıdır.
4. Sınav adına tıklayıp detayını açın. Eksik bilgiler varsa **Sınav taslakta: tamamlanması gerekenler** alanında görünmelidir. Eksik bir anahtarı sistem tahmin ederek tamamlamamalıdır.
5. Tüm zorunlu kontroller geçtiğinde **Sınavı aktifleştir** düğmesine basın. Durum **Değerlendirmeye açık** olmalıdır. Bu işlem öğrenci sonuçlarını yayınlamaz.

## 2. Dosya yükle ve kayıtları kontrol et

1. Aktif sınavdan **Veri yükle / değerlendir** çalışma alanına geçin.
2. Süper Admin olarak öğrencilerin ait olduğu kurumu seçin. Kurum yöneticisinde kendi kurum kapsamı kullanılır.
3. Sınava bağlı optik/FMT ile uyumlu TXT/DAT dosyasını seçip **Dosyayı Analiz Et** düğmesine basın.
4. Toplam kayıt sayısını dosyanızla karşılaştırın. Öğrenci eşleşmesinin TCKN, öğrenci numarası ve ad soyad sırasıyla yapıldığını örnek kayıtlarla doğrulayın.
5. Eşleşmeyen kaydı **Eşleştir** ile doğru öğrenciye bağlayın; uygun durumda Misafir veya İptal seçin. Birbirine benzeyen isimleri otomatik onaylamayın.
6. Kitapçık boş/hatalıysa A/B doğru, yanlış ve netlerini görün; bildiğiniz gerçek kitapçığı seçip **Kitapçığı Onayla** düğmesine basın. Karar verilmeden değerlendirme başlamamalıdır.

## 3. Değerlendir ve sonuç raporuna geç

1. Kontrol gerektiren kayıtları kapattıktan sonra **SINAVI DEĞERLENDİR** düğmesine basın.
2. **Değerlendirme tamamlandı** bildirimi ve işlenen kayıt sayısını kontrol edin. Sunucu hata verdiğinde başarı bildirimi görünmemelidir.
3. **Sonuç raporlarını aç** bağlantısını kullanın. Seçtiğiniz sınav ve kurum korunmalıdır.
4. Bilinen bir örnek öğrencinin doğru, yanlış, boş, net ve puanını elle hesapladığınız örnekle karşılaştırın.
5. **Başka dosya değerlendir** ile yeni dosya için temiz çalışma alanı açıldığını kontrol edin.

## 4. Yayını ayrıca kontrol et

Değerlendirme ile öğrenci/veli yayını ayrı aşamalardır. Sonuçları kontrol ettikten sonra sınav detayından sıralamayı dondurup yayınlayın veya yayın zamanını planlayın. Öğrenci, veli ve `sonuc.anunex.com` erişimini kendi yetkileriyle ayrıca deneyin. Yayınlanmamış sonuçlar yetkisiz kullanıcıya açılmamalıdır.

## Kanıt kapsamı

`scripts/browser-exam-readiness.mjs`, derlenmiş gerçek istemciyi sentetik API yanıtlarıyla sınar: taslak engelleri, aktifleştirme, kurum seçimi, dosya isteği, kitapçık kararı, değerlendirme reddi ve rapor bağlantısı. Bu test tek başına canlı veritabanını, gerçek optik dosyasının okuma doğruluğunu, puanlamayı veya telefon kamerasını doğrulamaz. Bu başlıkların ayrı sunucu/canlı test kanıtı ve kullanıcının görerek onayı gerekir.
