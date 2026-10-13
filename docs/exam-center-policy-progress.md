# Sınav Merkezi çalışma kaydı — 13 Ekim 2026

## Yetkili görev
Kompakt sınav merkezi; sevilen sınav ekleme formunu koruma; isteğe bağlı kazanım; kod yoksa doğrulanmış metinden eşleştirme; sonradan eşleştirmeyi geçmiş analizlere yansıtma; ayrı APP/RESULT yayınları; geri alınabilir kapsamlı kaldırma.

## Tamamlanan kod
- Kompakt tablo ve ayrılmış detay sekmeleri; büyük gezegen görselleri kaldırıldı.
- Doğrulanmış yıl/sınıf/ders/program kataloğundan kod veya tam normalize metin eşleştirme. Belirsiz adaylar manuel onay bekler. Boş katalog açıkça bildirilir.
- Kitapçık bazında kayıt kontrolü; eksik kazanım uyarısı; bütün kazanımların zorunlu olması ayrı, varsayılan kapalı seçenek.
- Kazanım eşleştirmesi bağımsız, sürüm kontrollü işlem; donmuş anahtarlardan bağımsızdır. Tüm yayınevi kaynak referansları korunur.
- Tarihsel kazanım analizleri kayıtlı cevap durumlarından yeniden oluşturulur; puan/net/sıralama ve donmuş özgün rapor değiştirilmez. APP güncel analizi, RESULT yalnız ayrıca yayınlanan analizi okur.
- Sonuç Portalı Yönetimi: kayıt/yayın sürümü, bekleyen değişiklik uyarısı, önizleme, yayınla/güncelle/yayından kaldır.
- APP/RESULT/BOTH kaldırma ve geri alma; fiziksel öğrenci sonucu silinmez. Aktifleştirme RESULT kanalını otomatik yayınlamaz.
- Kanal ve kaynak yazımları aynı sınav kilidi altında; yayın audit kayıtları aynı atomik transaction içinde.
- Mahremiyet temizliğinde yeni analiz geçmişi de silinir.
- Kanal ve katalog verileri toplu sorgulanır; sınav başına yüzlerce bağımsız sorgu yapılmaz.

## Doğrulama
- Yerel test paketi: 171 dosya / 899 test başarılı.
- Migration geçmişi/benzersizlik kontrolü başarılı.
- GitHub CI, kaynak doğrulama ve dış sağlayıcı izolasyonu başarılı (3376151c sürümü).
- 6 genel, 9 Nibiru/takvim, 8 sınav değerlendirme browser senaryosu başarılı. Yeni çalışma alanı senaryosunun son yayın ekranı kontrolündeki tam metin seçicisi, hücrenin sürüm alt metnini içerdiği için düzeltilmiştir; son workflow doğrulaması beklenmektedir.
- UI etkileşim testleri başarılı. Tam browser screenshot kabulü GitHub workflow içerisinde sentetik API fixture kullanır.
- Gerçek öğrenci sınavları bu kontrollerde değiştirilmedi.

## Kalan yayın adımları
1. Tamamlandı: son tip/build kontrolleri, GitHub branch ve PR #239 kaydı.
2. GitHub CI + Exam Center Readiness Acceptance sonuçları; yeni browser senaryoları ve görselleri incele.
3. Başarılı değişiklikleri main ve staging'e aktar; üretim ve sonuç worker deploy sonuçlarını izle.
4. Yeni sürümün gerçekten başarılı deploy sonucunu ve sağlık kontrollerini görmeden canlıya alındı deme.

Repo: yildizyayin/yildiz-sinav. Çalışma branch: fix/exam-policy-20261012. Sonuç portalı üretimde kanonik APP D1/R2 paylaşır; demo/staging kayıtları üretim sonuç portalına aktarılmaz.

## Yayın kontrol noktası — 13 Ekim 2026
PR #239 birleştirildi (6b81db25). Son kaynak sürümü 08fdd5f8 için GitHub CI ve 26 browser senaryosu başarılı: https://github.com/yildizyayin/yildiz-sinav/actions/runs/38413634094

Birleştirme sırasında main'de ayrıca Soru Havuzu değişiklikleri vardı. Demo dağıtımı 0102 pilot bütçe migration'ında Cloudflare SQLITE incomplete input hatası aldı. Bu migration demo üzerinde PENDING, üretimdeki son başarılı dağıtım 679f629e olup 0102 içermediğinden uygulanmamış trigger içindeki CASE/END ifadesi SELECT RAISE ... WHERE ile sadeleştirildi (f229bf69). Bütçe, aşım ve tekrar rezervasyon testleri 4/4 geçti. Başarılı yeni remote dağıtım henüz doğrulanmış değil.

Üretim kuyruğunda eski 67ad6d74 sürümünün 38413821707 çalışması production reviewer onayı bekliyor. Sonuç yayını da production reviewer onayı gerektiriyor. Eski sürümü onaylama; güncel deployment çalışmasını kullan. Ortam onayını GitHub bağlantısındaki araçlar değiştiremiyor; bu yetki kullanıcı hesabında.
