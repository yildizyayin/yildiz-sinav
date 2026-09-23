# ANUNEX Kabul Testleri

Bu testler otomatik testlerin yerine geçmez; gerçek kullanıcı akışını doğrular.

## Sınav Merkezi

1. Süper Admin olarak giriş yap.
2. Sınav Ekle ekranından gerçek bir sınav kartı oluştur.
3. Kaydet sonrası sınavı kayıtlı sınavlar listesinde gör.
4. Aynı sınavı Sınav Yükle ekranındaki seçimde gör.
5. Sınav adına ve `Görüntüle/Aç` eylemine tıkla.
6. Detay ekranının aşağıya açılan yama değil, sınavın çalışma alanı olduğunu doğrula.
7. Üç nokta menüsünden Düzenle, Kopyala, Arşivle ve Sil işlemlerini tek tek dene.
8. Silme öncesi onay penceresini doğrula.
9. Dosya yükleme alanına TXT/DAT/FMT dosyası seç.
10. Dosya adının, boyutunun ve yükleme durumunun göründüğünü doğrula.
11. Hatalı dosyada sessiz kalmak yerine anlaşılır hata mesajı gör.

## Optik

1. Phobos/Optik Form Ağacı’na gir.
2. Form Ekle ile Form Adı, Sıra, Form Türü, Yayınevi, Optik Kodu ve Kullanıcı alanlarını doldur.
3. Öğrenci No, Ad, Soyad, Ad Soyad, Sınıf, Sınıf-Şube, Kitapçık, T.C. Kimlik, Telefon ve Test alanlarından örnek parametre gir.
4. Kaydet ve aynı kaydı yeniden aç.
5. Üç nokta menüsünden Düzenle, Kopyala ve Sil işlemlerini doğrula.
6. Deimos/Optik Basma ekranında bu formu seç; tanımlama ekranına yönlenmediğini doğrula.
7. Kurum kullanıcısıyla kurum optiğinin ana havuzda görünmediğini doğrula.

## Değerlendirme

1. Gerçek sınavı yükle.
2. Öğrenci eşleşmesini TCKN, öğrenci no ve isim sırasıyla doğrula.
3. Eşleşmeyen öğrencilerin ayrı listede görünmesini doğrula.
4. Eşleştir, Misafir ve İptal seçeneklerini uygula.
5. Değerlendirme sonunda rapor ve sonuç kaydını doğrula.

## Başarı ölçütü

Bu akışlardan biri başarısızsa ilgili modül `CANLIDA DOĞRULANDI` sayılmaz ve satışa hazır kabul edilmez.

