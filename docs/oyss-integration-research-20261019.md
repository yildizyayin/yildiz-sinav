# ANUNEX ortak yazılı sınav modeli — araştırma ve entegrasyon kararı

Tarih: 19 Ekim 2026. Durum: Araştırma ve uygulama sözleşmesi; canlı özellik değildir. Soru havuzu işi sürerken kapsamına eklenir. 2027–2028 kuralları yayımlandığında yeniden doğrulanır; 2026–2027 profili gelecek yıla otomatik kopyalanmaz.

## Doğrulanan kaynaklar

- MEB ÖDSGM, 16 Ekim 2026 tanıtımı: https://odsgm.meb.gov.tr/www/quotortak-yazili-sinav-sistemiquot-tanitim-programi-duzenlendi/icerik/1746/
- MEB ÖDSGM, 10 Eylül 2026 konu-soru tabloları duyurusu: https://odsgm.meb.gov.tr/www/birinci-donem-ortak-yazili-sinavlarinin-konu-soru-dagilim-tablolari-yayimlandi/icerik/1731/
- MEB tablo indeksi: https://odsgm.meb.gov.tr/www/1donem-konu-soru-dagilim-tablolari-2026-2027/icerik/1724
- MEB 2026 OYSS Uygulama Kılavuzu, kamuya açık üçüncü taraf kopyası: https://www.biyolojihikayesi.com/yazililar/oyss-uygulama-kilavuzu-2026.pdf (16 sayfa; resmî barındırma veya hash eşleşmesi doğrulanmadı. Ayrıntılı kuralların üretim profilini etkinleştirmesi için güncel yetkili kopya teyidi gerekir.)
- Resmî broşür bağlantısı: https://www.meb.gov.tr/meb_iys_dosyalar/2026_10/6ad2328cbf117056331499_oyss_brosur_2.pdf (33 MB; web okuyucusu boyut sınırına takıldığı için doğrudan indirilerek iki sayfasının metni çıkarıldı, süreç şeması görsel olarak da incelendi.)

Gönderilen üç görsel 4K, Eğitim Vadisi ve 3D yayınlarının tanıtım materyalidir. Tasarım veya metin kopyalama kaynağı olarak kullanılmaz. Temel süreç MEB duyurusuyla karşılaştırılmıştır.

## Resmî modelden çıkan kararlar

MEB duyurusu: Yeni EBA'daki OYSS, 2026–2027 ilk dönem ilk yazılılarda 5/6/7 ve 9/10/11 düzeylerini, temel eğitimde altı ve lisede on ders başlığını kapsıyor. Senaryo, öğrenme çıktısı ve beceri temelli açık uçlu soru esas. İki soruyu zümre hazırlıyor; diğerleri Bakanlığın havuzundan geliyor. Güçlük ve puan öğretmen kararına dayanıyor. Soru bazlı sonuçlar öğrenme çıktılarıyla ilişkilendiriliyor. Yapay zekâ destekli yazım ve puanlama planlanan çalışmalar arasında; tamamlanmış otomasyon varsayılmaz.

Kılavuz kopyası (s.4–8, 11–15): 7/11 İngilizce istisnası, okul türü/öğretim dili istisnaları, 26 Ekim açılışı, havuzun sınavdan bir gün önce açılması, gerekçeli soru değiştirme sınırı, 100 puan, dört sayfa, ayrı dil becerileri, BEP ve mazeret tedbirleri yer alıyor. Soru sırası sonuç girişinde korunuyor. Toplu sonuç listeleri ve okullar/sınıflar arası karşılaştırma öngörülmüyor. Zümre sorusu panelinde taahhüt bulunuyor; metindeki kaynak/AI koşulları resmî ekranda ayrıca teyit edilmeli. Bu ayrıntılar yıllık ve kapsamlı profil olarak tutulmalı; tüm ANUNEX sınavlarına yayılmamalı.

## Mevcut kodda görülen durum

| Bileşen | Kanıt | Sonuç |
|---|---|---|
| Açık uçlu kayıt türü | migrations/0012_platform_expansion.sql: question_bank OPEN_ENDED | Veri alanı var; uçtan uca yazılı desteği kanıtlamaz |
| Ajan soru üretimi | worker/lib/question-generation-runner.ts: MULTIPLE_CHOICE yazımı | Mevcut ajan üretimini açık uçlu kabul edemeyiz |
| Studio yazılı belge türü | worker/lib/studio-delivery-routing.ts: WRITTEN_EXAM | Belge adı var; yayıncı bunu çoktan seçmeli PRACTICE akışına yönlendiriyor |
| Sınava yayın | worker/lib/studio-exam-publish.ts: seçenek doğrulama, answer_keys, PRACTICE | Açık uçlu puanlama için uygun yayın hattı henüz yok |
| Müfredat/süreç/rubrik | migrations/0079, 0080; CurriculumRubricAdmin, CohortRubricSummary | Mevcut sürümleme ve gözlem altyapısı kullanılabilir; sınav madde rubriğiyle aynı sayılmamalı |
| Sonuç/karne | Kurum/rehber rubrik raporları mevcut | Yazılı madde puanı ile öğretmen gözlemini ayrı kanıt türleri olarak bağlamak gerekli |

Bunlar yerel kanonik çalışma kopyasının statik incelemesidir; production yetenek doğrulaması değildir.

## ANUNEX ürün kararı

Sınav Merkezi altında **Yazılı Sınavlar** bölümü; soru havuzunda **Açık Uçlu / Kısa Cevaplı** içerik hattı. Öğretmenin akışı: yıl, ders, sınıf, dönem, yazılı numarası, senaryo → kazanım/soru dağılımı → zümre ve havuz soruları → puanlama anahtarı → cevap alanı önizleme → zümre onayı → uygulama → soru bazlı puan → geri bildirim ve destek çalışması.

İki ayrı kullanım profili:

1. **ANUNEX yazılı hazırlık ve kurum uygulaması:** Kendi özgün sorularımız, öğretmen soruları, kurumun yetkili materyali. Resmî sınav evrakı veya Bakanlık havuzu iddiası yok.
2. **Resmî OYSS sonuçlarını destekleyen çalışma alanı:** Kurumun yetkili şekilde sağlayabildiği öğrenci/soru puanları ve yayımlanabilir kapsam bilgileriyle analiz. EBA/e-Okul bağlantısı ancak belgelenmiş yetkili entegrasyon varsa açılır. Kamuya açık dokümante bir API doğrulanmadı. Şifre alma, ekran kazıma veya otomatik not gönderme varsayılmaz.

MEB havuzunun gizli soruları ANUNEX genel havuzuna, öğrenci pratiklerine veya YouTube/video üreticisine aktarılmaz. Zümrenin resmî sisteme verdiği materyal de otomatik yeniden kullanım kaynağı sayılmaz. Kuruma özel içerik ile platform özgün içeriğinin hakları ve görünürlüğü ayrılır.

## Teknik uygulama sözleşmesi

- Senaryo kimliği: eğitim yılı + yetkili kaynak + ders + sınıf + dönem + yazılı numarası + senaryo sürümü. Ham tablo ve kaynak tarihi korunur. MEB tablosundaki her kazanım için soru sayısı ayrı doğrulanır; toplam sayının tutması tek başına yeterli olmaz.
- Kazanım kimliği: resmî kod yanında program sürümü ve tema bağlamı zorunlu. Edebiyattaki tekrarlanan kodlar birleştirilmez. Mevcut branş aktarımındaki kimlik sorunu çözülmeden yazılı senaryoları otomatik bağlanmaz.
- Soru sürümü: kök, görsel, yanıt biçimi, örnek çözüm, kabul edilebilir alternatifler, ölçütler, azami puan, süreç/kazanım bağlantısı, tahmini süre, köken ve hak bilgisi birlikte sürümlenir. Kaynak = ZUMRE / ANUNEX_OWNED / INSTITUTION_LICENSED / EXTERNAL_RESTRICTED. AI desteği ayrı alan; zümre kökeniyle karıştırılmaz.
- Puanlama: puan anahtarı sürümü ve her alt ölçüte ait puan saklanır. Kısmi puan desteklenir. Boş, sıfır puan, henüz okunmadı, mazeret, katılmadı ve kopya ayrı durumlardır. Mevzuat profili gereken gösterimi belirler; tümünü sıfır sayan genel kural yazılmaz.
- Yayın: eksik senaryo bağlantısı, anahtar veya puan toplamı kurum uygulamasında yayını engeller; taslak kaydı engellemez. Onaydan sonra kâğıt, sıra ve anahtar dondurulur. Düzeltme yeni sürüm ve izlenebilir değişikliktir.
- PDF: öğrenci kâğıdı ile cevap/puanlama anahtarı ayrı dosyalar. Cevap zeminleri çizgili/kareli/boş; alan yüksekliği, grafik ve şekil alanı; erişilebilir baskı. Dört sayfa gibi sınırlamalar yalnız doğrulanmış ilgili yıllık profile uygulanır.
- Puan girişi: öğrenci × soru tablosu; hızlı klavye geçişi, kopyala-yapıştır/CSV önizleme, aralık kontrolü, eksik hücre göstergesi, sıra eşleştirme, toplu doğrulama ve geri alınabilir taslak. Resmî sistemin içe alma biçimi doğrulanmadan e-Okul uyumlu dosya etiketi konmaz.
- Okuma desteği: tarama/fotoğraf → OCR taslağı → ölçüte göre gerekçeli puan önerisi → öğretmen düzeltmesi/onayı. OCR belirsizliği açık gösterilir. Şimdilik notu doğrudan resmî sisteme yazan veya kesinleştiren otomasyon yok.
- Rapor: kazanım bazında elde edilen/azami puan ve kanıt sayısı. Soru/ölçüt eşlemesiyle çift sayım önlenir. Yetersiz kanıt ustalık sayılmaz. Öğretmen iç analizi, öğrenci/veli kişisel raporu ve deneme sıralaması ayrı politikalardır.
- Karma karne: yazılı, deneme, mini test, föy ve oyun ayrı kaynak/ölçek olarak görünür. Seçilen kaynakların kör ortalaması alınmaz; yöntem, ağırlık ve kapsam gösterilir. Rehber gözlemi akademik madde puanına dönüştürülmez.
- Takvim: senaryo duyurusu, zümre soru teslimi, kontrol, baskı, sınav, mazeret, puan giriş ve rapor yayını için görevler; kurum/branş yetkisiyle görünürlük. 2026 tarihleri 2027–2028'e kopyalanmaz.

## Ajan ekibine eklenecek görevler

Yazar ajan: açık uçlu soru + çözüm + alternatif yanıt + ölçüt taslağı. Bağımsız çözücü: sonuç, yöntem ve alternatif çözümü kontrol. Müfredat denetçisi: sürüm/tema/senaryo kapsamı. Ölçme uzmanı: tek anlamlılık, puan basamakları, güçlük ve süre. Görsel ajan: açıklayıcı özgün şekiller. Video ajanı: yalnız paylaşılabilir onaylı içerik ve dondurulmuş çözüm. İzleyici: üretim/ret/revizyon ve kapsam eksikleri. Bu görev listesi mevcut ajanların açık uçlu üretimde çalıştığı anlamına gelmez.

500.000 soru hedefi korunur; açık uçlu/çoktan seçmeli oranı kapsam ve kabul verisine göre planlanır. Araştırma yapılmadan hedefe ikinci bir 500.000 eklenmez. Üretim başlamadan önce sınıf/branş/kazanım/biçim bazlı kotalar ve kabul kapasitesi görünür olmalı.

## Sıralı teslim ve kabul

1. Tema/sürüm kimliği ve branş müfredatı aktarımını tamamla. Bu, mevcut soru havuzu işinin doğrudan devamıdır.
2. Yazılı senaryosu + açık uçlu soru/puan anahtarı veri modelini ve yetki/izolasyonu ekle. Zümre sorusu kaynağı AI içeriğinden ayrılmalı.
3. Yazılı hazırlama + cevap alanlı PDF + onay/dondurma ekranını ekle. Çoktan seçmeli yayıncıya gönderme.
4. Soru/ölçüt bazlı puan girişini, mazeret ve geri bildirim raporunu tamamla; takvim ve karma karneye bağla.
5. OCR ve AI önerilerini etiketlenmiş gerçek öğretmen puanlarıyla kalibre et; anlaşmazlık ve öğretmen müdahalesini ölç. Etkinlik ve hata oranı görülmeden otomatik puanlama iddiası yok.

Kabul örnekleri: Senaryoda iki farklı kazanım için üçer soru istenirken tek kazanıma altı soru bağlanması reddedilir; kısmi 3/5 puan doğru saklanır; okunmamış hücre 0 yapılmaz; farklı kurum erişimi reddedilir; dondurulmuş anahtar değişince geçmiş not kaybolmaz; yazılı sınavın sonuçları deneme Türkiye sıralamasına girmez; İngilizce 7/11 ve gelecek yıl kapsamı yanlış resmî etiket almaz.

Bu commit yalnız araştırma ve entegrasyon kararını kaydeder. Veritabanı, üretim kampanyası, AI bütçesi, canlı uygulama ve sınav sonuçları değişmemiştir.
