# Sonuç portalı — öğrenci öncelikli tasarım

Kapsam: sonuc.anunex.com öğrenci çalışma alanı. app, kurum ve bayi iş kuralları değişmez. Temel kaynak 0deb2b20f45f12cb4e40ada9d2be77f5a7a23f4c; mevcut aktif puanlama profili düzeltmesi korunur.

- Puan birinci, net ikinci görsel öncelikte. Sunucu puan vermiyorsa çizgi ve açık durum mesajı; netten puan hesaplanmaz.
- Son sınav kartı, geçmiş sınavlar, mevcut birleşik karne (son 5/tümü/seçim) ve mevcut resmî tarihli sayaç korunur. Tarih yoksa açıklama gösterilir, tarih uydurulmaz.
- Mevcut alt dersler, yayımlanmış/doğrulanmış kazanımlar ve Nibiru inceleme paneli korunur.
- Başarılı yeni öğrenci girişinde 1,3 saniyelik, sessiz ve atlanabilir orijinal marka geçişi. 5–7 açık, 8–12/mezun koyu; bilinmeyen sınıf nötr. Esc/Atla, yerel modal odak yönetimi ve azaltılmış hareket desteği. Oturum yenilemede tekrarlanmaz; kimlik doğrulama değiştirilmez.
- Tek sınav için Sonuç karnesi düğmesi mevcut PDF indiricisine yalnız ayrı A4 karne sayfalarını verir. Portal menüleri, düğmeler, filtreler ve sayfa altlığı aktarılmaz. Alt dersler kapalı olsa da karneye girer; uzun kazanımlar devam sayfalarına bölünür. Puan ve ana/alt testler yeniden hesaplanmaz. Alternatif felsefe ayrıca etiketlenir.
- PDF görüntü tabanlıdır; seçilebilir metin içermez. Birleşik karne kendi mevcut yazdırma akışını korur; bu değişiklik tek sınav PDF düğmesini düzeltir.

## Bilinen veri sınırı

Kurum listesi canlı sonuçları, öğrenci portalı yayımlanmış sabit sonuç kaydını okuyabilir. Bu değişiklik yayımlanmış kayıtta olmayan puanı/kazanımı üretmez, doğrulama şartını kaldırmaz ve kurumdaki özel veriye geçiş yapmaz. Gerçek sınavdaki farkı kapatmak için sınav kimliğiyle yayın kaydı ve kurum raporu karşılaştırılmalıdır. Mevcut ekran ve sentetik testler bu gerçek veri eşitliğini kanıtlamaz.

## Doğrulama

`npm ci`, `npm run typecheck`, `npm test`, `npm run build`.

`ANUNEX_BROWSER_EXECUTABLE=/path/to/chromium node scripts/design-result-student-priority-smoke.mjs`

Tarayıcı kontrolü yalnız sentetik API yanıtları kullanır; gerçek öğrenci/kimlik/veri/ücretli model çağrısı içermez. 1440/768/390/360 px; öğrenci giriş/hata/boş/meşgul/geri dönüş, alt ders/kazanım filtreleri/Nibiru; genç/yetişkin geçişi, Esc/Atla/yenileme; kurum/bayi giriş ve app CSS yalıtımı. Mevcut PDF indirme akışında A4 PDF, puan ve 25 uzun kazanımın kaybolmaması; portal arayüzünün PDF'ye girmemesi. Yerel kontrol sırasında oluşturulan `sample-report.pdf` yalnız test verisi içerir.

## Kabul için canlı kontrol

1. Yayından sonra yeni öğrenci oturumu açın; Atla/Esc ve azaltılmış hareketi deneyin.
2. Aynı sınavda puan/net değerlerini kurum raporuyla karşılaştırın; boşsa sınav kimliğini paylaşın.
3. Sınavı açın; alt dersleri ve doğrulanmış kazanımları kontrol edin.
4. Sonuç karnesi ile indirilen dosyanın A4 olduğunu ve yalnız karne içerdiğini kontrol edin.
5. Birleşik karne/sayaç/Nibiru ve 390 px görünümü kontrol edin.

## Referanstan bilinçli ayrılıklar

Resmî tarih/puan/kazanım bulunmadığında örnek değer gösterilmez. Üretilmiş mockup logoları yerine mevcut kanonik ANUNEX/Nibiru kullanılır. Giriş animasyonu veri yüklemeyi veya yetkilendirmeyi geciktiren yeni bir kapı değildir. Bu teslim öğrenci önceliğidir; kurum/bayi panelinin yeniden tasarlandığı iddia edilmez.

357 test dosyası / 1.526 test geçti. Ana tarayıcı kontrolünde 45 senaryo geçti; son PDF yerleşimi 1440/390/360 px alt kümesinde ayrıca tekrarlandı. A4 sayfalarının başlık bölgeleri ayrıca piksel karşılaştırmasıyla kontrol edilir; her sayfada aynı marka ve öğrenci bilgileri korunur. Genel rapor/PDF yardımcısı değişmez.
