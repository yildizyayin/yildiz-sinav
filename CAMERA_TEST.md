# Kamera OMR V1 Testi

Bu test yalnız `Demo Koleji` sentetik verisi içindir. Buradaki form hiçbir piyasa optiğinin kopyası değildir.

1. D1 migrations ve demo seed'i çalıştırın (`npm run seed:local` veya staging'de `CLOUDFLARE_LOAD_DEMO=true`).
2. Kurum yöneticisiyle giriş yapın: `manager@demo.test` / `Demo123!`.
3. Menüden **Kamera Test Optiği** açın ve formu **Actual Size / %100** ile A4 yazdırın.
4. **Sınavlar** bölümünden `Demo Merkezi Deneme 21` sınavını değerlendirmeye açın.
5. **Kameradan Optik Oku** → **Kamerayı Aç**.
6. Test formunun tamamını kadraja alın; dört siyah referans karesinin görünmesine dikkat edin.
7. **Optiği Oku**. Beklenen: sentetik şablon algılanır, öğrenci no `1001`, kitapçık `A`, MAT/TUR/FEN 10'ar cevap okunur.
8. Aynı kamera açıkken formu tekrar veya başka test formunu okutabilirsiniz. Aynı öğrenci numarası tekrar okunursa son okuma kullanılır.
9. **Okumayı Bitir ve Kontrole Geç**. Bilinen öğrenci no 1001 aktif öğrenciyle eşleşmelidir.
10. Düşük güven/çift işaret/kimlik belirsizliği varsa kayıt kontrol ekranına düşer. Kritik sınav yapısı hataları kullanıcı onayıyla atlanamaz.
11. Kontroller bittikten sonra **SINAVI DEĞERLENDİR**.
12. Öğrenci/veli/kurum raporlarında sonucu ve kazanım verisini kontrol edin.

## Gerçek piyasa optikleri

Optik129, Optik840, 3D TYT/AYT vb. için bu sentetik koordinatlar kullanılmaz. Gerçek form/FMT örneği ve geometri tanımı Optik Şablon Merkezi'ne girilip test edilmeden ilgili şablon READY yapılmamalıdır.
