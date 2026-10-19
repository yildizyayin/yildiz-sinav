# Production çalışma zamanı — 19 Ekim 2026

Önceki sürüm main 19eb241c7484381a118bf73d475776765df1a18a, app-only run 39260584220 ile başarıyla yayımlandı. Sağlık, erişim ve soru ekibi bundle kontrolleri geçti. Dağıtım kaydında otonom anahtarlar açık, video render false; üretici/verifier anahtarları yapılandırma çıktısında görünmüyordu. Secret değerler incelenmedi.

Bu devam paketi:

- `keep_vars=true` ile Cloudflare panelinde ayrıca tanımlanmış metin ayarları sonraki dağıtımlarda korunur. Kaynak: https://developers.cloudflare.com/workers/wrangler/configuration/ . Bu ayar eksik/eski bir değeri doğru kabul etmez; rapor gerçek durumu kontrol eder.
- Production config'te mevcut üretici modeli ve bağımsız doğrulayıcıyla üretim/structured-output/verification anahtarlarını açıkça tanımlar; video render açılır. Yinelenen ekip kontrol anahtarı tekilleştirildi.
- Ek bir ortam bütçesi verilmemişse gerçek D1 rezervasyon defteri kullanılır. Verilmiş bir tavan yalnız daraltabilir; 0, bozuk veya negatif değer üretim hakkı oluşturmaz.
- Bir işin önceden ödenmiş rezervasyonu son hakkı tüketmişse aynı iş yürütülebilir. Başka işe yeni hak verilmez; DB sayacı yazılmaz/azaltılmaz; başarısız iş iade edilmez. Deneme sınırları değişmez.
- Hazırlık API'si seçili eğitim yılını kullanır; eski yıl kazanımı 2027–2028 için hazır sayılmaz. Panel ve zamanlayıcı aynı etkin bütçe hesabını kullanır.
- Aynı app dağıtımının sonunda salt okunur runtime raporu çalışır: yalnız aggregate SELECT sorguları ve binding metadata. Gerçek AI çağrısı, bütçe/rol/kullanıcı kaydı veya onay yok; öğrenci/veli verisi ya da secret değeri raporlanmaz.
- Rapor gerçek kota, inceleme kapasitesi, doğrulanmış hedef kazanımları, hizmet aktörü ve duraklatma durumunu belirtir. Secret olarak saklanan bir ayarın değeri metadata'dan okunamıyorsa UNKNOWN kalır; var olduğu için hazır kabul edilmez.

İnceleme kapasitesi X, hizmet aktörü veya eğitim yılı kazanımları uydurulmadı. Kota yükseltilmedi, yeni key zinciri önerilmedi, ücretli ses izni açılmadı. Bunlar hazır değilse üretim yine durur; raporda gerekçesi görünür.

Kaynaklı ön öğrenmeler, güncel olay bankası, genel branş illüstrasyonları, gerçek sesli video kanıtı ve 500.000 soru kapasitesi önceki STATUS.md dosyasında açık kalan işlerdir.
