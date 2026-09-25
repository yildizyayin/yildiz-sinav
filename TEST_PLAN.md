# V1 Test Planı

Amaç yalnız ekranların açılması değil; ticari, akademik ve tenant güvenliği kararlarının gerçekten çalıştığını kanıtlamaktır.

## Otomatik testler

`npm test` şu çekirdek alanları test eder:

- aktif öğrenci eşleştirme
- mevcut misafir öğrenciyi tekrar kullanma
- yeni misafir oluşturma kararı
- benzer/aynı isimde belirsiz eşleşmeyi otomatik birleştirmeme
- yanlış götürme katsayılı net hesabı
- doğrulanmamış scoring rule'u reddetme
- kazanımda minimum evidence olmadan “geliştirilecek” etiketi üretmeme
- TXT/CSV genel parser tespiti
- bilinmeyen formatta sahte başarı vermeme
- kalibrasyonda 3 deneme sonrası manuel moda geçme

## Canlı kabul testleri

### A. Login / güvenlik

1. Super Admin giriş yapar.
2. Turnstile production ortamında server-side doğrulanır.
3. Hatalı login denemelerinde throttle/kilit çalışır.
4. Logout session'ı geçersiz kılar.

### B. Tenant / rol izolasyonu

5. Kurum A yöneticisi Kurum B verisine API URL değiştirerek erişemez.
6. Matematik öğretmeni yetkili sınıflarda Matematik görür.
7. Matematik öğretmeni Fen endpoint'ine erişemez.
8. 8/A rehber öğretmeni 8/A'nın tüm derslerini görür.
9. Aynı rehber öğretmeni atanmadığı 8/B'yi göremez.
10. Öğrenci başka öğrenci result ID'sini açamaz.
11. Veli yalnız linked child verisini görür.

### C. 65 + 110 senaryosu

12. Kurumda 65 ACTIVE öğrenci bulunur.
13. 110 kişilik sınav dosyası yüklenir.
14. Beklenen özet: 65 aktif + 45 misafir/yeni misafir (dosya eşleşmesine göre).
15. Değerlendirme tamamlanır; 110 katılımcının sonucu oluşur.
16. Aynı 45 misafir ikinci ve sonraki sınavlarda yeniden oluşturulmaz.
17. 20 sınav sonunda 45 benzersiz misafir + 900 misafir sınav katılımı ilişkisi korunur.

### D. Misafir -> aktif

18. 8 sınav geçmişi olan misafir seçilir.
19. Ödeme onayı olmadan aktivasyon reddedilir.
20. Super Admin ödeme onayıyla `Misafiri Aktif Öğrenci Yap` uygular.
21. Aynı student identity ACTIVE olur.
22. Öğrenci hesabı bağlandığında geçmiş 8 sınav görünür.
23. Misafir dönemde hiç kullanmadığı hizmetler geriye dönük “kullanıldı” gösterilmez.

### E. Sınav / scoring

24. Sınav seçildiğinde cevap anahtarı otomatik bağlanır.
25. A/B kitapçık doğru hesaplanır.
26. A/B/C/D tanımlı sınav 4 kitapçığı destekler.
27. Sadece A tanımlı sınavda sistem dört kitapçık varsaymaz.
28. Doğrulanmamış resmi scoring rule ile sonuç finalize edilmez.
29. Sonuç hangi scoring rule version ile üretildiyse saklanır.

### F. TXT/DAT / optik

30. Bilinen parser signature otomatik algılanır.
31. Birden fazla olası template varsa kullanıcıya seçenek gösterilir.
32. Manuel seçim aynı ekranda yapılır.
33. Bilinmeyen template sahte “okundu” sonucu üretmez.
34. Kamera aynı session içinde ardışık optik akışına izin verir.
35. Gerçek OMR template geometrisi yoksa kamera bunu açıkça belirtir.

### G. Yazıcı / optik kalibrasyon

36. Printer profile oluşturulur.
37. Optik + printer calibration başlatılır.
38. Test sayfası basılır.
39. Basılan sayfanın fotoğrafı/taraması PC'den yüklenir.
40. 1/3, 2/3, 3/3 otomatik denemeleri işler.
41. 3 başarısız denemeden sonra manuel ayar açılır.
42. Manuel değer girmek tek başına READY yapmaz.
43. Yeni doğrulama görseli tolerance içindeyse READY olur.
44. Yazıcı detayında kalibre optikler; optik detayında kalibre yazıcılar görünür.

### H. Kurum dondurma

45. Super Admin kurumu PASSIVE yapar.
46. Kurum kullanıcılarının mevcut session'ları iptal edilir.
47. Yeni sınav/optik/öğrenci işlemleri reddedilir.
48. Eski veri D1'de korunur.
49. Super Admin veriyi görmeye devam eder.
50. Kurum ACTIVE yapılınca veri kaldığı yerden devam eder.

### I. Eğitim yılı

51. 2026-2027 7/A öğrenci rollover preview'da 2027-2028 8/A olarak önerilir.
52. Commit öncesi veri değişmez.
53. Commit sonrası yeni enrollment oluşur.
54. Eski 2026-2027 7/A enrollment aynen kalır.
55. Şube koru / yeni liste seçeneği doğrulanır.

### J. Veri Transfer Merkezi

56. Edesis/Okulizyon seçildiğinde gerçek adapter tanımı yoksa format uydurulmaz.
57. Generic CSV öğrenci dosyası staging'e alınır.
58. Preview sayıları gösterir.
59. Commit öncesi canlı öğrenci tabloları değişmez.
60. Commit sonrası external identity mapping saklanır.
61. Aynı external record tekrar yüklenirse duplicate öğrenci yaratılmaz.
62. Kaynakta yalnız toplam net varsa kazanım/soru detayı uydurulmaz.

### K. Öğrenci / veli UX

63. Öğrenci son sonucu görür.
64. Geliştirilecek Kazanımlar minimum evidence ile oluşur.
65. Tek yanlış soru öğrenciyi otomatik eksik etiketlemez.
66. Misafir öğrenci login yapamaz.
67. Veli 30 saniyede okunabilecek sade özet görür.

## Production'a geçiş kriteri

A, B, C, D, E, H ve I grupları geçmeden production müşteri kullanımı başlatılmamalıdır. F/G/J grupları gerçek optik, gerçek yazıcı ve gerçek dış sistem örnek dosyalarıyla ayrıca doğrulanmalıdır.
