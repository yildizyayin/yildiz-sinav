# ANUNEX — tek sıra iş takip kaydı

Sürüm: 6 · Açılış: 19 Ekim 2026, Türkiye saati.
Kayıt yeri: yildizyayin/yildiz-sinav, `docs/ANUNEX-tek-sira-is-takibi.md`. Yeni sohbet önce bu dosyanın main'deki son sürümünü okur.
Kapsam: app.anunex.com ve sonuc.anunex.com. Demo ve tanıtım sitesi değişiklik kapsamında değil.

## Çalışma sözleşmesi

1. Aynı anda yalnız **bir aktif iş** bulunur. Tamamlanan ilk iş **A001**; güncel aktif iş aşağıda belirtilir. Diğer bütün işler sıradadır; kodları değiştirilmez ve yürütücüleri başlatılmaz.
2. Bir iş ancak kendi kabul ölçütü, ilgili güvenlik kontrolleri ve etkilenen diğer sistemin regresyon kontrolü geçince **BİTTİ** olur. Kod, test veya merge tek başına canlı kabul değildir.
3. Sıra: incele → sınırları belirle → gerekli en küçük düzeltme → ilgili test → ilgili ortama dağıt → gerçek arayüz/API akışını doğrula → kanıtı kaydet → sıradaki işi aç. Testler ayrı bir son aşamaya ertelenmez.
4. Önceden çalışan özellik yeniden yazılmaz. Önce kanıt aranır; yeterli güncel kanıt varsa değişiklik yapmadan kapatılır. Eksik kanıt, kodun olmadığı anlamına gelmez.
5. Ortak dosya/API/veritabanı değişikliğinde iki alan adının etkilenen akışları denetlenir. app, sonuc veya diğer roller bozulursa mevcut iş açık kalır; düzeltme veya kontrollü geri dönüş tamamlanmadan ilerlenmez. Sıfır hata garantisi verilmez; korunma ve geri dönüş kanıtlanır.
6. Veri silme, migration geri alma veya eski yayını değiştirme otomatik geri dönüş yöntemi değildir. Sürüm, veri koruma ve ileri düzeltme gereksinimi önce belirlenir. Gerçek öğrenciler üzerinde sentetik işlem yapılmaz.
7. İnsan onayı, telif/hak, RESTRICTED, doğrulanmış müfredat ve yetki kapıları gevşetilmez. Kota kaldırılması bu kuralları kaldırmaz.
8. Engel varsa iş **BEKLİYOR** olur; sebep, gereken kişi/ayar/veri ve son kontrol kaydedilir. Engeli atlayıp başka iş başlatılmaz. **Ek (kullanıcı kararı, 20 Ekim 17:58):** engel yalnız zaman bekleyen bir canlı ölçümse iş BEKLİYOR (ÖLÇÜM) işaretlenir ve sıradaki işe geçilir; ölçüm sonucu gelince o işe öncelikle dönülür. Hata, onay, karar veya veri bekleyen engellerde kural aynen geçerlidir.
9. Yeni hata önce aktif işe bağlı alt kayıt olarak açılır. Yeni ürün isteği ayrı değişiklik kaydıyla kuyruğun sonuna eklenir; mevcut numaralar veya kabul ölçütleri sessizce değiştirilmez.
10. Her kapanışta bu **aynı dosyanın yeni sürümü** kaydedilir. Yeni sohbetin ilk adımı bu kaydı okumaktır; yalnız sohbet hafızasına güvenilmez.

## Güncel durum — 19 Ekim 2026

- **A001: BİTTİ. A002: BİTTİ (kullanıcı kabulü, 19:49; rol kanıtı K002'de). A003: BİTTİ (19:51; panel ekranı K002'de). A004: BİTTİ (19:55; panel ekranı K002'de). A005: BİTTİ (20:55; panel ekranı K002'de). A006: BİTTİ (20 Ekim 10:12). A007: BİTTİ (10:20). A008: BİTTİ (10:59; canlı toplu onay K002'de). A009: BİTTİ (16:36). A081: BEKLİYOR (ÖLÇÜM — model karşılaştırması, 21 Ekim sabahı). A010: BİTTİ (18:05; canlı duraklat denemesi K002'de). A011: BİTTİ (18:10). A012: BİTTİ (18:10). A013: BEKLİYOR (VERİ — gerçek görselli soru örneği). A014: BEKLİYOR (VERİ+KARAR). A015: BİTTİ (18:15; canlı öğrenci denemesi K002'de). A016: BİTTİ (18:45; canlı belge oluşturma K002'de). A017: BİTTİ (20:25). A018: BEKLİYOR (MERGE+FİZİKSEL KANIT — PR #278, yeni PDF'in telefonla okutulması). A083: BEKLİYOR (DAĞITIM+CANLI KANIT — dört aşama PR'da/merge'de; 03:00 sonrası tek dağıtım). Aktif iş A019.** Diğer bütün işler sırada.
- Repo yildizyayin/yildiz-sinav, PR #265, merge `fae0a48f346499363a07e2e9b56dbd9a5a48ff5a`.
- Production run https://github.com/yildizyayin/yildiz-sinav/actions/runs/39277304492 ; deploy job `118145237158`: SUCCESS. Worker sürümü `02b56366-49c0-4174-8b7c-5b3622b8dc91`.
- Deployment günlükleri 19 Ekim 18:29 Türkiye saatinde 388 resmî kaynağın yeniden doğrulandığını, 77 kapsam / 2.916 çıktının production'a aktarıldığını gösteriyor. UNLIMITED, cap null, rezervasyon 0, tarihsel cap 50. Model çağrısı yapılmadı.
- Son runtime ölçümü: otomatik üretime uygun sınıflarda 2.192 doğrulanmış çıktı; servis aktörü doğrulanmadı; inceleme kapasitesi 0; inceleme kullanılabilirliği false. Bu nedenle ajan üretimi hazır değildir. A005/A006 sırası geldiğinde ele alınacak; mevcut işe paralel başlatılmaz.
- Yerel son kaynak kanıtı: 213 dosya / 1.101 test, tip kontrolü ve build geçti. A001'in kapsamı dağıtım ve temel erişimdir; giriş veya gerçek soru üretimi kabulü değildir.
- app ve sonuc temel erişim kontrollerinin sonucu A001 kapanışında aşağıda tutulur. Tam işlev regresyonu ilgili sonraki işlerde ayrıca yapılır.
- Ayrı sonuç sağlayıcı probunda hesap 100 Queue sınırı görüldü. İlgisiz kaynaklar silinmedi.
- 9 Ekim envanteri ve çalışma kaydı v63 tarihsel kaynaklardır; bugünkü canlı başarı kanıtı sayılmaz. Bu dosya güncel yürütme sırasının ana kaydıdır.

## Onaylanan kapsam ve nihai yürütme sırası

Kullanıcı 19 Ekim 18:45'te Süper Admin kapsamını onayladı. Teknik işler kapanmadan tasarım uygulanmayacak. Sonrasında veli, kurum/zincir, öğrenci, öğretmen, rehber ve sonuc tasarımları ayrı ayrı tamamlanacak.

**Tek sıra:** A001–A009 → A081 (ölçüm bekliyor) → A010–A018 → A083 → A019–A036 → A084 → A037–A041 → A085 → A042–A079 → A082 → S001–S018 → K001 → K002 → A080 → D001–D007 → K003. (A081 kullanıcı kararıyla 19 Ekim 21:06'da, A082 20 Ekim 10:41'de B kararıyla A081'in arkasına alındı; 20 Ekim 17:58 A kararıyla genel işlerden sonraya, ihtiyaç olunca öne alınmak üzere taşındı.)

A080 kimliği korunmuştur fakat tasarım aşamasına ertelenmiştir. Bu açık sıra değişikliği, önceki dosyanın A080'den sonra sonuc'a geçiş kuralını değiştirir. Hiçbir teknik iş tasarım aşamasına ertelenmez. İş kapanırken test ve geri dönüş hazırlığı her zaman zorunludur; K001/K002 yalnız son kapsamlı tekrar kabulüdür.

Onaylı menü kapsamı: Yönetim; Nibiru; Sınav Merkezi (ekle/yükle/optik tanımla); ayrı Deimos optik baskı; Soru Havuzu/Studio ve üretim ekibi; Föy; Ders Programı; Yoklama; Kişiye Özel Kitap; Sıfır Hata Kitapçığı; Mini Oyunlar; Kullanıcılar (kurum/öğretmen/öğrenci/veli/personel/lisans hakları); Rehberlik/RBA; Ödev; Raporlar/Karneler; Takvim/Bildirimler; önceki planlı diğer alanlar.

## app.anunex.com — sabit sıra

Her satır ayrı iştir. Güncel istisnalar: A001 BİTTİ, A002 AKTİF. Diğerleri **SIRADA / canlı kabul yeniden doğrulanacak**. Aşağıdaki ölçütler planlanan kapanış koşullarıdır; tamamlanmış özellik iddiası değildir.

| ID | Yapılacak tek iş | Kapanış ölçütü |
|---|---|---|
| A001 | Bekleyen production paketini sonuçlandır | Dağıtım sonucu, başarısız adım varsa nedeni, çalışan sürüm ve iki alan adının temel sağlık durumu kaydedilir. |
| A002 | Giriş ve oturum akışını kapat | Süper admin, kurum, öğretmen, rehber, öğrenci, veli doğru panele girer; çıkış ve yetkisiz erişim kontrolleri geçer. |
| A003 | Production sınırsız kotayı doğrula | UNLIMITED görünür; eski tüketim korunur; iptal iade etmez; görev ve inceleme sınırları sürer. |
| A004 | Production müfredat aktarımını kapat | 77 hedef kapsam / 2.916 bağlamlı çıktı kaynak ve öğrenme düğümüyle doğrulanır; engelli kapsamlar açık gösterilir. |
| A005 | Ajan servis aktörünü doğrula | Zamanlayıcı gerçek ve yetkili servis kimliği kullanır; insan oturumunun taklidi yapılmaz. |
| A006 | İnsan inceleme kapasitesini tanımla | Gerçek sorumlu ve sürdürülebilir kapasite belirlenir; sıfır/dolu kuyruk üretimi durdurur. Kapasite uydurulmaz. |
| A007 | Tek gerçek soru üretimini kanıtla | Süper admin doğrulanmış çıktı seçer; model ve bağımsız kontrol sonrası soru kalıcı inceleme listesinde görünür; hata varsa gerekçesi görünür. |
| A008 | Soru inceleme kararını kapat | İnsan ONAY/RET/DÜZELTME verir; çözüm ve hak denetimi kaydedilir; RESTRICTED soru öğrenciye açılmaz. **Ek (kullanıcı isteği, 19 Ekim 20:58):** tek tek ve hızlı toplu onay; toplu onayda her soruya ayrı onaylayan/zaman kaydı düşer, RESTRICTED sorular toplu onaya giremez. ("Şüpheli sorular üstte" 20 Ekim 10:41 kullanıcı kararıyla A081'e taşındı.) |
| A009 | Otonom zamanlayıcıyı kanıtla | Gerçek zamanlayıcı çağrısı yeni işi işler; tekrar çağrı kopya üretmez; kapasite/duraklatma kuralları uygulanır. |
| A010 | Ajan yönetim panelini kapat | Gerçek işler/sayılar/hatalar görünür; durdur-sürdür ve izinli manuel görev, kayıt geçmişiyle çalışır. |
| A011 | Soru kartı akademik bağlarını tamamla | Güncel kazanım, sınıf, sürüm ve doğrulanabilen ön öğrenmeler görünür; olmayan veri açıkça bilinmiyor gösterilir. |
| A012 | Çıkmış soru istatistiğini doğrula | Son beş yıl sayısı yalnız doğrulanmış veriyle hesaplanır; veri yoksa sıfır/olasılık uydurulmaz; tahmin resmî olasılık diye sunulmaz. |
| A013 | Soru görsel kalitesini kapat | Branşa uygun gerçek örneklerde yazı/veri/ölçek okunur ve çözümle tutarlıdır; güncel olay ve kişi görsellerinin hakları doğrulanır. |
| A014 | Gerçek soru video çözümünü kapat | Kaynak sürümüne bağlı video üretilir, açılır, insan/hak incelemesi kaydedilir; teknik test öğrenci videosu sayılmaz. **Ek (kullanıcı onayı, 20 Ekim 19:20):** basılı kitapçıkta soru başına karekod; karekod herkese açık video adresine değil, yetki ve izlenme kaydı tutan güvenli soru sayfasına gider. |
| A015 | Mini test tekrar politikasını kapat | Daha önce çözülen soru yeni testte engellenir; öğrenci açıkça tekrar seçerse bilgilendirilir; kazanım yetersizliği görünür. |
| A016 | Studio soru seçimini kapat | Yalnız uygun hak ve onaya sahip sorular seçilir; sınıf/branş/kazanım kapsamı ve eksik stok korunur. |
| A017 | Studio A/B PDF çıktısını kapat | PDF gerçekten indirilir; A/B sırası ve anahtarı tutarlıdır; kayıt tekrar açılır. |
| A018 | Studio kitapçık-optik bağını kapat | PDF alt optiği, kitapçık kimliği ve değerlendirme aynı sorulara bağlanır; yanlış kitapçık reddedilir. |
| A019 | Sınav kartının kalıcı kaydını kapat | Sınav oluşturulup sayfa/oturum yenilendiğinde bilgiler korunur; zorunlu alanlar açık belirtilir. |
| A020 | Cevap anahtarı girişini kapat | Elle ve dosyadan kazanımlı/kazanımsız anahtar, seçilen A/B/C/D kapsamıyla doğru saklanır; şablon tek hücreye düşmez. |
| A021 | Otomatik kazanım eşleştirmesini kapat | Önce resmî kod, yoksa metin adayları bulunur; belirsiz eşleşme kesinmiş gibi kaydedilmez. |
| A022 | Manuel kazanım seçimini kapat | Yıl/sınıf/ders kapsamında resmî çıktılar listelenir; kullanıcı eşleştirip tekrar açabilir. |
| A023 | Taslaktan aktife geçişi kapat | Butona basınca eksikler yanında ve Düzelt bağlantısıyla görünür; eski readiness için sunucu hatası kaybolmaz; izinli sınav etkinleşir. |
| A024 | Sınav puanlama profilini doğrula | Doğrulanmış MEB/ÖSYM veya açık özel profil; yanlış götürme, katsayı, seçmeli TYT felsefe ve toplam puan örnek hesaplarla tutar. |
| A025 | TXT/DAT/FMT değerlendirmesini kapat | Gerçek izinli örnek dosya okunur; soru/branş/kitapçık sayıları ve hesaplanan sonuçlar beklenenle aynıdır. |
| A026 | Öğrenci otomatik eşleşmesini kapat | TCKN → öğrenci no → adsoyad sırası ve belirsizlik kontrolü çalışır; başka öğrenciye sessiz bağlanmaz. |
| A027 | Eksik/hatalı kitapçık çözümünü kapat | Uygun kitapçıklara göre net karşılaştırması gösterilir; kullanıcı kararı kalıcı ve denetlenebilirdir. |
| A028 | Eşleşmeyen öğrenci kuyruğunu kapat | Eşleştir/misafir/iptal kararları çalışır; bekleyen kayıt kaybolmaz ve sonuç doğru öğrenciye gider. |
| A029 | Sonradan kazanım bağlantısını kapat | Yetkili yeniden analiz ile geçmiş sonuçta kazanımlar görünür; eski yayın sürümü sessizce değiştirilmez. |
| A030 | app sınav sonucu yayınını kapat | Şimdi/sonra yayın ve dondurulmuş sürüm çalışır; öğrenci/veli yalnız yayımlanmış sonucu görür. |
| A031 | Sınav silme/arşiv/kopyalama akışını kapat | Hatalı sınav kaldırılır, ilişkili sonuç ve kanal etkisi açık gösterilir; kopya kayıt bağları karışmaz. |
| A032 | Sınav kataloğunun işlevlerini kapat | Liste/filtre/detaya giriş ve mevcut işlem düğmeleri çalışır. Görsel yeniden tasarım D001 kapsamındadır. |
| A033 | Sınav belge arşivini kapat | Anahtar/PDF/video ve ekler doğru sınavda açılır; yetkisiz dosya erişimi engellenir. |
| A034 | Phobos optik tanımlamayı kapat | Optik ekle/düzenle/sil ve FMT alanları kaydedilir; kurum kendi kapsamıyla sınırlıdır. |
| A035 | Deimos optik basmayı kapat | Tanımlamadan ayrı modülde öğrenciye özel çıktı ve kalibrasyon alınır; basılan kimlik/kitapçık tutarlıdır. |
| A036 | Fiziksel telefon optik okumasını kapat | Gerçek basılı örnek telefonla okunur; belirsiz işaretler manuel düzeltilir; sentetik test fiziksel kanıt sayılmaz. |
| A037 | Ortak yazılı resmî senaryo girişini kapat | Yıl/dönem/il/kapsam/kaynak ve dağılım doğrulanır; 2027–2028 belgesi yoksa resmî doğrulama kapalı kalır. |
| A038 | Açık uçlu soru üretimini kapat | Yazılıya özgü soru/cevap paketi üretim ve bağımsız kontrolden geçer; çoktan seçmeli otomatik notlandırmaya karışmaz. |
| A039 | Analitik rubrik kaydını kapat | Ölçütler, alternatif çözümler ve kısmi puanlar saklanır; toplamlar tutar; öğretmen onayı zorunludur. |
| A040 | Yazılı sınav kâğıdını kapat | Doğrulanmış senaryoya göre soru dağılımı, uygulanabilir zümre kuralı, kâğıt ve anahtar oluşur. |
| A041 | Yazılı öğretmen puanlamasını kapat | Soru bazlı puan ve düzeltme gerekçesi sürümlenir; AI tek başına kesin not vermez. |
| A042 | Yazılı kazanım raporunu kapat | Öğrenci/sınıf/şube geri bildirimi doğru puan ve kazanımlara dayanır; yazılı puanı deneme neti gibi işlenmez. |
| A043 | Kurum kartı yönetimini kapat | Kurum ekle/görüntüle/düzelt/pasifleştir ve MEB kodu doğrulaması çalışır; bağlı öğrenciler korunur. |
| A044 | Zincir kurum kapsamını kapat | Üst yönetim yalnız bağlı kurumları görür; kurumlar arası karşılaştırma ve alt yönetim izinleri tutarlıdır. |
| A045 | Öğrenci aktarımını kapat | Toplu ekleme, sınıf/şube ve mükerrer kontrolü çalışır; kurumlar arası veri sızıntısı olmaz. |
| A046 | Personel ve branş atamasını kapat | Öğretmen/rehber kullanıcıları doğru sınıf, branş ve kurumla çalışır; yetki kaldırma anında uygulanır. |
| A047 | Veli-öğrenci bağlantısını kapat | Doğru çocuk görünür; bağlantı kaldırılınca erişim kesilir; telefon tek başına hassas veri yetkisi sayılmaz. |
| A048 | Yıllık koltuk lisansı kararını kapat | Önceki yalnız analiz sınırı korunarak mevcut modelle karşılaştırma ve kabul edilmiş sözleşme kaydedilir; fiyat sistemde gösterilmez. Uygulama bu satırın kapsamı değildir. |
| A049 | Eğitim yılı geçişini doğrula | Öğrenci kimliği korunur; sınıf atlama sonrası eski sonuçlar eski döneminde kalır; lisans uygulaması için ayrı kabul edilmiş kapsam gerekir. |
| A050 | Öğrenci bireysel karnesini kapat | Kendi yayımlanmış sonuçları, güçlü/gelişecek kazanımları ve seçilen dönem doğru görünür; PDF açılır. |
| A051 | Branş öğretmeni karnesini kapat | Yalnız yetkili branş ve öğrenciler görünür; ilgisiz ders sonuçları sızmaz. |
| A052 | Kurum/zincir karnesini kapat | İzinli sınıf/şube/kurum özetleri ve karşılaştırmalar aynı veriyle tutar. |
| A053 | Rehberlik karnesini kapat | Yetkili öğrenci grubunun gelişim ve destek planı görünür; özel rehberlik kayıtları ayrılır. |
| A054 | Seçilebilir birleşik karneyi kapat | Sınav/föy/havuz/mini test/oyun yalnız güvenilir tarihsel kanıtla birleşir; farklı ölçüler ve tekrar politikası açıktır. |
| A055 | Maarif süreç gözlemini kapat | Resmî sürümle ilişkili rubrik/gözlem kaydedilir; doğrulanmayan yeterlik kesin hüküm gibi sunulmaz. |
| A056 | Özel rapor indirmesini kapat | Asenkron PDF/CSV doğru kullanıcıya açılır; süre/iptal/yetki/temizlik davranışı doğrulanır. |
| A057 | 32 haftalık föy yayınını kapat | Öncelikli sınıf ve sayısal/sözel içerik, seri ve hafta takvimiyle atanıp öğrenciye ulaşır. |
| A058 | Kişiye özel kitap / Dejavu akışını kapat | Öğrencinin kanıtlı eksiklerine göre uygun sorularla kitap oluşur ve kullanılabilir PDF alınır. |
| A059 | Sıfır hata kitapçığını kapat | Yanlış/boş geçmişinden izinli, sürümü sabit soru seçilir; tekrar sonrası gelişim kaydedilir. |
| A060 | Ödev takip akışını kapat | Öğretmen atar, öğrenci çözer/teslim eder, durum ve son tarih doğru görünür. **Ek (kullanıcı onayı, 20 Ekim 19:29):** öğrenci ödev sorularını çevrimiçi işaretler (ara kayıtla devam edebilir) ve teslim eder; teslimden önce cevap/çözüm/video asla görünmez; teslimden sonra soru soru kendi cevabı, doğru cevap, çözüm, video çözüm (A014) ve kazanım videosu (A067); yanlışlar "Yanlışlarım"a düşer (A059 girdisi); cevapların açılma zamanı varsayılan **son teslim tarihinden sonra**, öğretmen ödev bazında "teslimden hemen sonra" seçebilir; kâğıt+optik ödevde aynı inceleme optik okuma sonrası; öğretmen soru/kazanım bazında sınıf sonucu görür. Bulgu: sunucuda `/api/platform/foy/attempts` puanlama ucu var ama öğrenci çözme ekranı yok; teslim yalnız puan döndürüyor; sınav sonrası soru inceleme ekranı (StudentQuestionReview) yeniden kullanılabilir. |
| A061 | Yoklama akışını kapat | Yetkili kişi yoklama girer/düzeltir; öğrenci/veli kendi kaydını görür; geçmiş korunur. |
| A062 | Mini oyun öğrenme kaydını kapat | Oyun çalışır; istemcinin yolladığı keyfî skor akademik başarı sayılmaz; güvenilir kazanım kanıtı ayrılır. |
| A063 | Panel takvimini kapat | Rolün kendi sınav/ödev/föy/randevu/görevleri tarih ve yetkiyle görünür; saat dilimi ve çakışma açıktır. |
| A064 | Rehberlik RBA akışını kapat | Yetkili rehber test/yanıt/değerlendirme sürecini tamamlar; hassas kayıt ve veli görünürlüğü sınırlandırılır. |
| A065 | Nibiru rol tabanlı yardımını kapat | Öğrenci/veli/öğretmen/kurum kendi kapsamındaki veriyle yanıt alır; veri olmayan yerde uydurma cevap verilmez. |
| A066 | Nibiru ses akışını kapat | Mikrofon/yazı/sesli yanıt gerçek örnekte çalışır; sağlayıcı hatası görünür; ücretli ses izinsiz açılmaz. |
| A067 | YouTube kaynak bağını kapat | Kazanım/soruya uygun yetkili video bağlantısı açılır; bağlantı ve içerik kaynağı kontrol edilir. **Ek (20 Ekim 19:20):** kazanım videosu soru/kazanım sayfasından ve karekod sayfasından açılabilir. |
| A068 | WhatsApp uygulanabilir bağlantısını kapat | Kullanılan Business numarası/telefon birlikte kullanım yolu ve ücret koşulları doğrulanır; izinsiz mesaj gönderilmez; kimlik doğrulama sınırı uygulanır. |
| A069 | Bildirim teslimini kapat | Yayın/ödev/takvim olayı doğru alıcıya bir kez iletilir; tekrar/iptal/başarısızlık görünür. |
| A070 | Ders programı karar ve kapsamını kapat | Mevcut uygulama ile istenen yapı karşılaştırılır; varsa eksik iş ayrı ve ölçülebilir kabul ölçütüyle kaydedilir. |
| A071 | Canlı ders kapsamını kapat | Yetkili rol oturumu açar/katılır; kullanılan sağlayıcı ve kayıt izinleri açıktır; mevcut olmayan entegrasyon var sayılmaz. |
| A072 | Tercih robotu resmî veri kapsamını kapat | Yıl/kaynak doğrulanmış hedef verisi ve filtreler çalışır; yerleşme garantisi verilmez. |
| A073 | Üyelik/aktivasyon ve modül haklarını kapat | Talep/onay/özellik kapısı ilgili panelde tutarlı çalışır; kapalı hak menüden veya API'den aşılamaz. |
| A074 | Veri transferi/toplu işlemleri kapat | Önizleme, hata listesi ve tekrar çalıştırma kopya/kayıp üretmez; kurum kapsamı korunur. |
| A075 | Yayınevi/bursluluk/kabul kapsamını doğrula | Envanterdeki etkin akışlar doğru rol ve kurumla tamamlanır; planlı Campus parçaları çalışan diye gösterilmez. |
| A076 | Profil ve görünüm ayarlarını kapat | İzinli ayarlar korunur; tema, menü ve logo bütünlüğü diğer paneli etkilemez. |
| A077 | Yönetim ve izleyici ekranlarını kapat | Süper admin gerçek sağlık/iş/hata özetini görür; ajan serbest ve denetimsiz komut çalıştıramaz. |
| A078 | Mobil/PWA/tahta erişimini kapat | Ana iş akışları hedef cihazlarda okunur/tıklanır; fiziksel kitap bağlantıları doğru içeriğe gider. **Ek (20 Ekim 19:20):** etkileşimli akıllı tahta / z-kitap modu — soru soru tam ekran, kalem, şıkları ve cevabı göster/gizle, çözüm videosunu tahtada oynatma; yazdırılan kitapçıkla aynı soru verisi. |
| A079 | app güvenlik ve veri yaşam döngüsünü kapat | Rol/tenant izolasyonu, oturum iptali, dosya erişimi ve süreli veri temizliği kanıtlanır; gerekli kalıcı kimlikler silinmez. |
| A081 | Ölçekli soru üretimini kapat (değişiklik kaydı, 19 Ekim 21:04; 20 Ekim 10:09 güncelleme: hedef sabit sayı değil, kalite kapısı gevşetilmeden sürdürülebilen azami hız; bağımsız kontrol geçiş oranı ve insan onay oranı düşerse hız düşer; yalnız 2027–2028 resmî MEB kazanımı) | İlk hedef: günde 5.000–10.000 soru, 31 Aralık 2026'ya kadar 300.000–500.000 soru, 2027–2028 Maarif 5–12. sınıf. Paralel üretim, Queue sınırı (S015 ile ortak) çözümü, kazanım başına sınırın kontrollü yükseltilmesi ve benzer-soru filtresi; A007'de ölçülen soru başına maliyetle onaylı bütçe. Ölçüm yoksa hazır denmez; insan onayı otomatik verilmez. **Ek (20 Ekim 10:41, A008'den taşındı):** bağımsız kontrol bulguları saklanır ve toplu onay ekranında şüpheli sorular üstte gösterilir; A007'deki kaçırılmış bilimsel hata sınıfı için olgusal doğruluk kontrolü. |
| A082 | Dışarıdan toplu soru aktarımını kapat (değişiklik kaydı, 20 Ekim 10:09) | Süper Admin Excel/CSV/JSON ile toplu yükler; önizleme ve satır bazlı hata listesi; her soru 2027–2028 resmî kazanım koduna bağlanmak zorunda (bulunamayan/yanlış sınıf reddedilir); kaynak etiketi zorunlu (ör. Claude, yayınevi, öğretmen); dışarıdan gelen her soru REVIEW kuyruğuna düşer ve A008 toplu onay ekranında görünür; tekrar yükleme kopya üretmez; benzer soru uyarısı. Sıra: kullanıcı kararı B (20 Ekim 10:41) → A009 → A081 → A082. |
| A083 | Studio test oluşturma deneyimini kapat (değişiklik kaydı, kullanıcı onayı 20 Ekim 19:20) | MEB/Maarif seçimi; sınıf → ders → ünite → konu → kazanım aşamalı seçim (kod yazmadan); her kazanımda onaylı soru stoku görünür ve yetersizlik oluşturmadan önce uyarılır; zorluk karışımı yüzde olarak (ölçülmüş zorluk varsa onunla, yoksa editoryal tahmin olduğu açıkça yazılır); şablonlar (konu tarama, deneme, ödev, telafi) kaydedilebilir; önizlemede soru değiştirme aynı kazanımdan yapılır; test kütüphanesi kart görünümü, Testlerim/Favoriler ve ders filtreleri; optik okuma soru sınırı açıkça gösterilir. Görsel tasarım D001'de. |
| A084 | Deneme optiklerini kamerayla okutup TXT'ye çevirmeyi kapat (değişiklik kaydı, kullanıcı isteği 20 Ekim 20:47) | Tek okuma motoru ve **ANUNEX kamera standardı** (4 büyük düz siyah köşe karesi + yön işareti; baloncuk ≥ 4 mm; köşeler sayfa dışına taşmaz) Phobos/Deimos optiklerinde de kullanılır. Seri okutma: canlı kamerada sayfa sabitlenince otomatik çekim, öğrenci no + kitapçık + ders blokları okunur; boş/çift/soluk işaretler düzeltme ekranında tek tek onaylanır. Çıktı A025'in okuduğu sabit sütunlu FMT/TXT biçiminde indirilir ve **aynı dosya A025 değerlendirmesinden geçince sonuçlar birebir aynıdır** (gidiş-dönüş testi). Gerçek basılı deneme optiği telefonla okutulmadan kapanmaz. Sıra: A036'dan sonra. |
| A085 | Açık uçlu cevapları kamerayla okutup değerlendirmeyi kapat (değişiklik kaydı, kullanıcı isteği 20 Ekim 20:47) | Yazılı kâğıdında her soru için çerçeveli cevap alanı + öğretmen puan kutusu; fotoğraftan alanlar kırpılır ve öğrenciye bağlanır. Sayısal/kısa cevaplarda rakam baloncuk ızgarası (kesin, AI'sız). Serbest yazıda AI el yazısını metne çevirir, A039 rubriğine göre **önerilen** puan + ölçüt bazlı gerekçe + güven verir; düşük güven ve okunamayan yazı işaretlenir. Öğretmen her puanı onaylar/değiştirir (A041: AI tek başına kesin not vermez); öğretmen–AI uyumu ölçülüp gösterilir. Sıra: A041'den sonra. |
| A080 | Ortak tasarım planını onaylat | Teknik sıra bittikten sonra açık/ferah içerik, sol menü, modül renkleri, uzay ilişkisi, ANUNEX/Nibiru ve mobil davranış örneklerle planlanır; kullanıcı tasarım yönünü onaylar. |

## sonuc.anunex.com — A079 sonrasında teknik sıra

Sonuç portalına app'in öğretmen, rehber ve veli panelleri eklenmez. Amaç lisanssız sonuç, öğrenci/kurum/bayi ve izinli yönetimdir. Çalışan mevcut akışlar önce doğrulanır; gereksiz yeniden yapım yoktur.

| ID | Yapılacak tek iş | Kapanış ölçütü |
|---|---|---|
| S001 | Sonuç portalının canlı temelini doğrula | Doğru production sürümü, sonuç config'i ve sağlık çalışır; app API sınırıyla karışmaz. |
| S002 | Öğrenci sonuç girişini kapat | Kabul edilmiş öğrenci no/sınıf/adsoyad/kurum ve güvenli erişim yöntemiyle yalnız kendi sonuçları açılır; tahminle başkasına erişilmez. |
| S003 | Kurum girişini kapat | Yalnız kendi kurumunun yayımlanmış katılımcı/sonuçları görünür; erişim iptali uygulanır. |
| S004 | Bayi girişini kapat | Yalnız bağlı kurumlar görünür; başka bayinin kurum/verisi sızmaz. |
| S005 | Sonuç ağı kurum ve erişim yönetimini kapat | app Süper Admin yetkili kurum/erişim kodu yönetir; tek seferlik kod ve iptal akışı güvenlidir. |
| S006 | app-sonuc yayın farkı uyarısını kapat | app değişikliğinde sonuc sürüm farkı görünür; otomatik ve izinsiz yeniden yayın yapılmaz. |
| S007 | Sonuç kanalında yayın kararını kapat | app yönetiminden şimdi/sonra yayın ve kaldırma çalışır; yayınlanmayan sınav portalda görünmez. |
| S008 | Sonuç özetini kapat | Doğru/yanlış/boş/net/puan doğru yayın sürümünden gelir; yeniden değerlendirme öncesi/sonrası tutarlıdır. |
| S009 | Sonuç sıralamasını kapat | İzin verilen sınıf/okul/ilçe/il/Türkiye ve zincir kapsamı doğru katılımcılarla hesaplanır; eksik evrende yanıltıcı sıralama gösterilmez. |
| S010 | Sonuç kazanım görünümünü kapat | Doğrulanmış kazanımlar ve sonradan analizin yayımlanan sürümü görünür; veri yoksa açık belirtilir. |
| S011 | Sonuç video erişimini kapat | İlgili soru videosu izinli kullanıcıya açılır; başka sorunun veya özel dosyanın bağlantısı sızmaz. |
| S012 | Sonuç düzeltme/silme eşzamanlılığını kapat | app yayın/güncelleme/kaldırma sırasında eski ve yeni sonuçlar karışmaz; ilişkili erişimler doğru kapanır. |
| S013 | Sonuç belge çıktısını kapat | İzinli öğrenci/kurum çıktısı doğru sürümle alınır; PDF/CSV ve indirme süresi korunur. |
| S014 | Dönem sonu lisanssız temizliği kapat | Kabul edilmiş süre sonunda yalnız hedef lisanssız kayıt/dosyalar temizlenir; lisanslı öğrenci geçmişi silinmez. |
| S015 | Sonuç kaynak kotası engelini kapat | 100 Queue engelinin gerekli akışa etkisi belirlenir; yalnız sahipliği doğrulanmış ve kullanılmayan kaynaklar kapsamlı incelemeyle ele alınır. |
| S016 | Gerçek 10.000 sonuç isteğini ölç | İzole yetkili ortamda önceden belirlenmiş hata/gecikme eşikleri geçilir; istek sayısı farklı öğrenci sayısı diye sunulmaz. |
| S017 | 1.000.000 yoğun istek planını doğrula | Gerçek yük tanımı, süre, eşzamanlılık ve sağlayıcı sınırları belirlenir; izinli bütçe ve ortam olmadan pahalı yük başlatılmaz; ölçüm yoksa hazır denmez. |
| S018 | Sonuç mobil işlev kabulünü kapat | Öğrenci/kurum/bayi akışları telefon/masaüstünde çalışır. Görsel yeniden tasarım D007 kapsamındadır. |

## İki sistem için son kabul — sıradaki tek işler

| ID | İş | Kapanış ölçütü |
|---|---|---|
| K001 | Yedek ve geri dönüş kanıtı | Uygulama sürümü, veri yedeği ve veri kaybetmeden geri dönüş/ileri düzeltme izolasyonda doğrulanır. |
| K002 | Alanlar arası son regresyon | Altı app rolünün kendi temel işlemleri ile sonuc öğrenci/kurum/bayi akışları doğrulanır. Sınav oluştur → değerlendir → kanala göre yayın → düzelt → kaldır zinciri tutarlıdır. |
| K004 | Sistem check-up: kapasite ve yük (kullanıcı talebi 22 Ekim, tüm işler bittikten sonra) | Gerçek kullanım senaryosuyla (veli, öğrenci, öğretmen, kurum istekleri + toplu değerlendirme + zamanlanmış işler) günlük/aylık D1 okuma-yazma, Worker istek/CPU, kuyruk ve R2 tüketimi ölçülür. Workers Paid (aylık 5 $) planında tıkanma olup olmadığı hesaplanır. Hiçbir istek bir sonraki güne kalmaz; limit, kuyruk birikmesi ve gecikme için eşik, alarm ve plan çıkar. Zamanlanmış işler ve ajanlar ölçülerek yeniden açılır. |
| K003 | Son kullanıcı kabulü ve devir | Rol bazlı kullanım adımları teslim edilir, kullanıcı kabulü kaydedilir; açık engeller sıfırlanmadan genel hazır beyanı verilmez. |

## Teknik kabulden sonra tasarım — A080 onayından sonra

Her tasarım işi de kendi işlev regresyonu bitmeden kapanmaz. Tasarım çalışırken yeni özellik eklenmez; eksik keşfedilirse mevcut işte hata kaydıyla çözülür. Mor renk kullanılmaz; büyük dekoratif görseller yerine okunabilir, kaliteli ve tutarlı yerleşim hedeflenir. Her modülün renk kimliği olur; içerik alanı açık/ferah kalır. Sonuç portalına app'in diğer rol panelleri taşınmaz.

| ID | Tasarım işi | Kapanış ölçütü |
|---|---|---|
| D001 | Süper Admin paneli ve bütün onaylı modül ekranları | Onaylı ortak sistem bütün ekranlarda uygulanır; menüler/işlemler ve mobil görünüm tek tek çalışır. |
| D002 | Veli paneli | Kendi çocukları, sonuç/gelişim, ödev/yoklama/takvim ve bildirimler erişilebilir; veri sınırı ve çalışan akışlar korunur. |
| D003 | Kurum ve zincir kurum paneli | Yönetim, alt kurum kapsamı, sınav, personel/öğrenci ve rapor akışları tasarım sonrası tekrar doğrulanır. |
| D004 | Öğrenci paneli | Sonuç, mini test, kitap/föy/oyun, ödev/takvim ve Nibiru akışları yaşa uygun ve kullanılabilirdir. |
| D005 | Öğretmen paneli | Kendi branş/sınıfı, soru/ödev/sınav, yoklama/program ve rapor akışları çalışır. |
| D006 | Rehber paneli | RBA, görüşme/takip, destek planı, takvim ve rehberlik raporları çalışır; hassas kayıtlar ayrıdır. |
| D007 | sonuc.anunex.com | Öğrenci, kurum ve bayi ekranları tutarlı markayla yenilenir; bütün sonuç ve yayın akışları korunur. |

## Kapanış kaydı şablonu

ID / başlık:
Durum: SIRADA → AKTİF → [BEKLİYOR | CANLIDA DOĞRULANDI] → BİTTİ
Başlangıç ve bitiş zamanı:
Kabul ölçütü:
Önceki durum ve tekrar üretim adımları:
Değişen dosya/ayarlar; etkilenmemesi gereken alanlar:
PR / commit / deployment / ortam:
İlgili test ve canlı arayüz/API kanıtı:
Diğer alan adı ve rol regresyon kanıtı:
Geri dönüş / veri koruma bilgisi:
Kullanıcıya görünen sonuç:
Engel varsa somut neden / ihtiyaç / sorumlu:
Sıradaki ID (yalnız kapanış sonrası):

## Günlük — değiştirilmeyen geçmiş

- 19.10.2026: Kullanıcı iki sistemi tek tek, kayıtlı ve birbirini bozmadan bitirme kuralını belirledi. Bu ana kayıt açıldı. A001 aktif; A002–A080, S001–S018 ve K001–K003 sırada. İlk sürüm toplamı **101 kabul işi**; bu sayı 101 eksik özellik veya 101 yeniden geliştirme değildir. Mevcut özellikler kanıtla değişikliksiz kapatılabilir. Bu oturumda uygulama kodu veya üretim ayarı değiştirilmedi.

- 19.10.2026 18:45 sonrası: Kullanıcı bütün kapsamı onayladı; teknik işleri önce, tüm tasarımları en sona aldı. D001–D007 eklendi; toplam **108 ayrı kabul kaydı**. Bu sayı eksik özellik sayısı değildir. Kimlikler korunarak A080 tasarım aşamasına taşındı. Yeni yürütme sırası yukarıda açıklandı.

### A001 kapanışı

Durum: BİTTİ. Production job 118145237158 SUCCESS; çalışan sürüm 02b56366-49c0-4174-8b7c-5b3622b8dc91. Dağıtım içinde release test/build ve production smoke adımları çalıştı. Kaynak ve çalışma kanıtı deployment günlüğündedir. Sınırsız kota/müfredat aktarımı gözlendi; bunların panel/API kabulü A003/A004 kapsamıdır. Başka ürün kodu bu oturumda değiştirilmedi. Sonraki tek iş A002.

A001 ek canlı kanıt: Bu oturumda cloud tarayıcıda app `/login` ve sonuc `/` açıldı. Her iki `/api/health` yanıtı `{"ok":true,"status":"ready","environment":"production"}` olarak görüldü. Yerel HTTP istemcisi 403 verdi; bu sonuç site kesintisi sayılmadı, aynı anda tarayıcı erişimi ve production deployment smoke başarılıydı. Diğer sistemin temel erişimi doğrulandı; tam rol regresyonu A002 ve sonraki işlerin kapsamıdır.

### A002 başlangıcı

Durum: AKTİF — güvenli oturum bekleniyor. app giriş ekranında kullanıcı adı/e-posta/telefon ve şifre alanları görüldü. Mevcut kullanıcı oturumu yok. Önce güvenli girişle Süper Admin akışı; ardından yetkili ve kişisel veri içermeyen rol testleri planlanacak. Gerçek kullanıcı şifresi sohbetten istenmez, şifre değiştirilmez ve sıradaki iş açılmaz.

### A002 doğrulama sonucu — aynı aktif iş

Durum: BEKLİYOR / KAPANMADI. Kullanıcı güvenli browserAuth formunu tamamladı; request submitted döndü, ancak site `/login` ekranında `Robot doğrulaması başarısız.` gösterdi. Bu bir başarılı oturum veya yanlış şifre kanıtı değildir. Hesap/şifre değiştirilmedi; Turnstile kapatılmadı; alternatif kimlik veya yeni hesap açılmadı. Sonraki iş başlatılmadı.

Kaynak incelemesi: Login.tsx gönderim düğmesi token yokken de etkinleşebiliyor; backend verifyTurnstile eksik tokenı reddediyor ve sağlayıcı hata kodlarını döndürüyor. Bu gözlem robot hatasının kesin nedeni değildir; eksik token / süresi dolma / widget yapılandırması / bu tarayıcının kabul edilmemesi ayrımı henüz kanıtlanmadı. Nedeni kanıtlamadan production güvenlik ayarı değiştirilmez.

Bulut tarayıcı, güvenli kimlik tesliminden sonra ek komutta retained-data restriction bildirdi. Gizli giriş değerleri okunmadı veya kaydedilmedi. Yeni şifre istenmedi, aynı giriş tekrar denenmedi. A002'de sıradaki adım: izinli tanılama ile Turnstile hata sınıfını belirlemek; gerekli düzeltmenin kendi testi ve canlı kabulü bitmeden A003 açılmaz.

### A002 — doğrulanmış istemci düzeltmesi, 19 Ekim 18:51 sonrası

PR: https://github.com/yildizyayin/yildiz-sinav/pull/266
Branch: codex/a002-login-challenge-lifecycle
Head: 9d82358da62e473b37176f941a069b1a52f54266
Base main: fae0a48f346499363a07e2e9b56dbd9a5a48ff5a

Koddan ve gerçek React form testinden doğrulanan iki eksik: doğrulama yanıtı yokken form gönderilebiliyor; başarısız girişten sonra tek kullanımlık yanıt yeniden kullanılabiliyor. Yalnız Login.tsx değişti: buton ve submit koruması, tek gönderim kilidi, yanıtın bir kez tüketilmesi, hatadan sonra yeni widget ve kısa bekleme mesajı. İlgili iki UI testi ve app dağıtım tetikleyicisi eklendi. Backend/anahtar/izin/sonuc kaynakları değiştirilmedi.

Yerel kanıt: 214 dosya / 1.103 test PASS; typecheck PASS; build PASS. Eksik/sona ermiş yanıt, submit koruması, çift gönderim ve yeni yanıtla tekrar deneme çalıştırıldı. Cloudflare belgesi tek kullanımlık yanıtın 300 saniyede dolduğunu doğruluyor: https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/

GitHub kaynak kontrolleri açıldı. Henüz merge/production deploy yok. Bu kod eksikleri önceki canlı robot hatasının kesin nedeni olarak sunulmaz. A002 KAPANMADI; A003 açılmadı. Sıradaki adım kaynak CI → normal merge → korumalı production dağıtımı → gerçek giriş/çıkış ve rol kanıtı. Koruma veya CAPTCHA atlanmayacak.

Son kontrol: PR266 için CI run39281386949, Question Pool PR Preview run39281386991 ve sonuç sağlayıcı probu run39281386962 QUEUED; işler başlamadı. Bu bir kaynak test başarısızlığı veya production dağıtım onayı değildir. Kontrolleri atlayarak merge edilmedi. A002 açık kaldı.

### A002 — merge ve dağıtım, 19 Ekim 19:30 sonrası

PR #266 kontrolleri: CI run 39281386949 SUCCESS; Question Pool PR Preview run 39281386991 SUCCESS. Sonuç sağlayıcı probu run 39281386962 "Provision isolated R2 and Queue resources" adımında FAILURE. Aynı adım #265 ve öncesindeki PR'larda da başarısızdır; bilinen 100 Queue sınırına (S015) bağlıdır, A002 değişikliğiyle ilgisi yoktur. Kaynak silinmedi.

Elenen hipotez: `wrangler.production.jsonc` içinde Turnstile test site anahtarı (`1x00000000000000000000BB`) bulunuyor. Canlı `app.anunex.com/api/config` gerçek anahtar (`0x4AAA…`) sunduğundan production robot hatasının nedeni bu değildir. Repodaki test değeri not edildi, değiştirilmedi.

Kod incelemesi: site anahtarı boşsa Login düğmesi kilitli kalır; production'da `TURNSTILE_SECRET_KEY` yoksa backend zaten `TURNSTILE_NOT_CONFIGURED` döndürdüğünden bu davranış production için yeni bir engel değildir.

PR #266 `[app-only]` başlığıyla squash merge edildi: `84e93b88e0a2def1f9318cc3605d8dad1d56c0b4`. Main CI run 39286473789 SUCCESS. Deploy App Production Only run 39286473459, production ortam onayı kullanıcı (yildizyayin) tarafından 19:40 civarı verildi. Deploy Production Cloudflare Worker run 39286473576 `[app-only]` nedeniyle iş atlamalıdır.

A002 KAPANMADI. Sıradaki adım: dağıtım sonucu → çalışan sürüm → iki alan adının health kontrolü → gerçek giriş/çıkış ve altı rol kanıtı. A003 açılmadı.

Dağıtım sonucu: run 39286473459 — `dogrula` SUCCESS, `deploy-app-production` SUCCESS (başlangıç 16:39:30 UTC). Worker `yildiz-sinav-prod`. Sürüm kimliği deployment günlüğünde; bu oturumdan günlük indirme 403 verdiği için kayda alınamadı. 19:45 sonrası `app.anunex.com/api/health` ve `sonuc.anunex.com/api/health` → `{"ok":true,"status":"ready","environment":"production"}`.

Çalışma şekli kararı (19:43): kullanıcı sözleşmenin değişmeden sürmesini seçti — her iş production'da kapanmadan sıradakine geçilmez; testler ertelenmez.

Sıradaki adım: kullanıcının güvenli girişiyle altı rol için giriş → doğru panel → çıkış → yetkisiz URL denemesi. Şifre sohbette istenmez.

### A002 kapanışı — 19 Ekim 19:49

Durum: BİTTİ — **kullanıcı kabulüyle**. Kullanıcı "A002 bitmiş olmalı, A003'e geç" kararını verdi. Kod, test, merge ve production dağıtımı kanıtlı; iki alan adının health'i ready. Altı rolün tek tek giriş/panel/yetkisiz URL/çıkış kanıtı bu kayıtta **yoktur**; K002 son regresyonunda zorunlu olarak yeniden doğrulanacak.
Not: Production D1 okuması bu oturumda güvenlik sınıflandırıcısınca engellendi; engelden önce geçen tek salt-okuma toplam sorgusu `yildiz-sinav-v1-db` içinde altı rolün her birinde aktif hesap olduğunu gösterdi (kişisel alan okunmadı). Canlı Worker'ın bağlı olduğu D1'in hangisi olduğu doğrulanmadı.
Sıradaki ID: A003 — AKTİF.

### A003 kapanışı — 19 Ekim 19:51

Durum: BİTTİ — değişikliksiz, madde 4'e göre mevcut güncel kanıtla; kullanıcı canlı panel kontrolünü beklemeden ilerleme talimatı verdi.
Kanıt: main `84e93b8` üzerinde ilgili 4 test dosyası / 47 test PASS (`question-agent-dispatch-plan`, `question-agent-pilot-budget`, `question-runtime-readiness`, `question-team`).
- UNLIMITED görünür: `worker/lib/question-team.ts` `budget.mode=UNLIMITED, cap=null`; `QuestionTeam.tsx` "Sınırsız" gösterir.
- Eski tüketim korunur: migration testi tüketimi değiştirmeden taşır; sınırsız mod ömür boyu tüketimi sıfırlamaz.
- İptal iade etmez: `noRefund:true`; başarısız işler iade edilmez testi.
- Görev/inceleme sınırları: iş başına 10, sınırsız modda dağıtım başına 50; inceleme kapasitesi yoksa dağıtım reddedilir.
Canlı kanıt: 19 Ekim 18:29 production dağıtım günlüğü UNLIMITED, cap null, rezervasyon 0, tarihsel cap 50 (A001 kaydı).
Eksik: Süper Admin `/question-team` canlı ekran kanıtı alınmadı → K002 kontrol listesine eklendi.
Kod/ayar değişmedi; diğer alan adı etkilenmedi.
Sıradaki ID: A004 — AKTİF.

### A004 kapanışı — 19 Ekim 19:55

Durum: BİTTİ — değişikliksiz, madde 4'e göre mevcut güncel kanıtla.
Kaynak kaydı: `data/app-question-scope-2028.json` → 2027–2028, 77 program, 2.916 çıktı, 2 engelli kapsam: TUR 5. sınıf `CONFLICTING_THEME_CODE:T.O.5.20`; DİN 12. sınıf `EMPTY_OUTCOME_SECTION`. Engelliler `sourceIssues` olarak panelde ayrı gösterilir.
Doğrulama kuralı: `worker/lib/question-branch-readiness.ts` her program için yıl/sınıf/program sürümü, MEB yetkisi, `verified=1` ve aynı kaynak URL'si; her çıktı için ders/sınıf, `active`, `official` ve aynı yıl/sınıftaki aktif öğrenme düğümü eşleşmesini arar; sayı birebir tutmazsa "aktarılmadı" der.
Test: `question-branch-readiness`, `curriculum-import`, `curriculum-publication-acceptance` 3 dosya / 28 test PASS; kaynak parmak izi node testi PASS.
Canlı kanıt: 19 Ekim 18:29 production dağıtım günlüğü 388 resmî kaynağın yeniden doğrulandığını ve 77 kapsam / 2.916 çıktının aktarıldığını gösterir (A001 kaydı).
Eksik: Süper Admin branş kapsamı ekranının canlı görüntüsü alınmadı → K002 kontrol listesi.
Kod/ayar değişmedi.
Sıradaki ID: A005 — AKTİF.

### A005 kapanışı — 19 Ekim 20:55

Durum: BİTTİ. Kullanıcı 19:58'de önerilen A seçeneğini ("devam edelim") onayladı.
Önceki durum: production'da `QUESTION_AGENT_SERVICE_ACTOR_ID` tanımlı değildi; panel "servis aktörü doğrulanmadı" gösteriyordu.
Değişiklik — PR #268, merge `ffbc8f95b5bb01e0ad57eb444c290faacd59a255` (kullanıcı tarafından squash merge; otomatik merge sınıflandırıcıca engellendi):
- `migrations/0115_question_agent_service_actor.sql`: `svc-soru-ajani` SUPER_ADMIN servis hesabı; rastgele, bilinmeyen şifre malzemesi; `INSERT OR IGNORE` (sonradan pasifleştirme korunur).
- `worker/lib/auth.ts`, `worker/index.ts`: `svc-` önekli hesaplar login, `createSession` ve `getAuthUser` katmanlarında reddedilir (genel INVALID_CREDENTIALS). app ve sonuc aynı yolu kullanır.
- `wrangler.production.jsonc`: `QUESTION_AGENT_SERVICE_ACTOR_ID=svc-soru-ajani`.
Etkilenmemesi gerekenler: insan girişleri (sentetik insan admin testi geçer), sonuc akışları, kota/inceleme sınırları. İnceleme kapasitesi 0 olduğundan üretim başlamaz.
Test: 4 yeni test, mutasyon kontrollü (koruma kaldırılınca 2 test kırıldı). Tüm paket 215 dosya / 1.107 test PASS; typecheck ve build PASS. PR CI run 39290996606 SUCCESS.
Dağıtım: Deploy App Production Only run 39291874533 SUCCESS — "Apply production D1 migrations", "Read-only production smoke acceptance", "Verify super admin question scope deployment" SUCCESS. Genel production akışı 39291874590 `[app-only]` nedeniyle SKIPPED. Main CI 39291874514 SUCCESS.
Canlı: 20:55 sonrası app ve sonuc `/api/health` → ready/production.
Bilinen ilgisiz: Result Provider Isolation Probe (staging ortamı kaydı) Queue sınırı nedeniyle FAILURE — S015.
Geri dönüş: Kullanıcılar ekranından `svc-soru-ajani` pasifleştirilir (zamanlayıcı anında durur) veya ayar kaldırılıp yeniden dağıtılır; migration veri silmez.
Eksik: Süper Admin `/question-team` ekranında "servis aktörü doğrulandı" görüntüsü alınmadı → K002 kontrol listesi.
Sıradaki ID: A006 — AKTİF.

### A006 — BEKLİYOR, 19 Ekim 20:56

Kabul ölçütü: gerçek sorumlu ve sürdürülebilir kapasite belirlenir; sıfır/dolu kuyruk üretimi durdurur; kapasite uydurulmaz.
Mevcut durum (kod): kapasite `QUESTION_PILOT_REVIEW_AVAILABLE` (true/false) ve `QUESTION_PILOT_REVIEW_SLOTS` (kuyrukta aynı anda bekleyebilecek soru) ile yönetilir; production'da ikisi de tanımsız → inceleme kapalı, kapasite 0, ajan üretmez (doğru davranış). Paket 10 soru olduğundan hazır olma için en az 10 slot gerekir; kuyruk dolunca `REVIEW_QUEUE_FULL` ile durur.
Engel: inceleyici kişi/rol, haftalık gerçekçi inceleme sayısı ve başlangıç branş/sınıf kapsamı kullanıcıdan gelmedi. Kullanıcı "devam" dedi; değerler uydurulmadı.
Önerilen varsayılan (kullanıcı onayı bekliyor): inceleyici yildizyayin (Süper Admin), 10 slot, başlangıç 8. sınıf matematik.
Not: kapasite açılınca model maliyeti başlar; bütçe UNLIMITED olduğundan tek fren inceleme kapasitesidir.
Sıradaki iş açılmadı.

### A006 — kararlar, 19 Ekim 20:58–21:06

Kullanıcı kararları: inceleyici yildizyayin; toplu + tek tek onay (A008'e eklendi); kuyruk sınırı 10.000; kapsam 2027–2028 yeni Maarif, 5–12. sınıfların tamamı (LGS 8, YKS 12 dahil; 1–4. sınıf kayıtta yok); hedef günde 5–10 bin / aralık sonuna 300–500 bin soru → A081 olarak A009'un arkasına alındı.
Kontrol: `data/app-question-scope-2028.json` 8. sınıf 6 ders / 391 çıktı, 12. sınıf 11 ders / 333 çıktı içerir (A004'te aktarıldı). 8 ve 12'yi dışlayan tek neden koddaki sabit sınıf listesiydi.
Uyarı kaydı: kullanıcıya günde binlerce sorunun bir saatte incelenmesinin soru başına ~1 saniye ettiği ve kalite riski açıkça bildirildi; kullanıcı onay sorumluluğunu üstlendi. Soru başına onay kaydı ve RESTRICTED kapısı korunur.
PR #269: `QUESTION_PILOT_REVIEW_AVAILABLE=true`, `QUESTION_PILOT_REVIEW_SLOTS=10000`; pilot sınıflar `PILOT_GRADES` 5–12 tek sabitte. 1.110 test, typecheck, build PASS. Dağıtım sonrası zamanlayıcı 15 dakikada 1 soru üretir; otomatik onay yok.

### A006 — dağıtım, 20 Ekim 09:54

PR #269 merge `f7bfcafa8fbcd710465ea302466c798884f3eaed` (kullanıcı, 19 Ekim 21:24). Deploy App Production Only run 39302449287: kullanıcı onayı 20 Ekim sabahı; SUCCESS 06:54 UTC. Adımlar: migrations, read-only smoke, Süper Admin kapsam doğrulaması, müfredat/kota adımı, "Inspect question runtime without provider calls or data changes" SUCCESS. Genel akış 39302449185 SKIPPED (`[app-only]`). 09:57 sonrası app ve sonuc health ready/production.
Kapanış için eksik: Süper Admin `/question-team` ekranında inceleme açık, kapasite 10.000, servis aktörü doğrulandı ve zamanlayıcı hazır görüntüsü; ilk 15 dakikalık zamanlayıcı turunda kuyruğa giren soru. Bu oturumdan dağıtım günlüğü indirme ve production D1 okuması engelli olduğundan kanıt kullanıcı ekranından alınacak.

### A006 kapanışı — 20 Ekim 10:12

Durum: BİTTİ. Kullanıcı Süper Admin `/question-team` ekranı (10:12): "Otomatik soru yürütme · 2027-2028: Açık. Zamanlayıcı koşulları uygun. İncelemede 0 soru; kalan kuyruk kapasitesi 10000." Engel nedeni yok (servis aktörü doğrulandı → A005 eksik panel kanıtı da tamamlandı). Görev tablosu: Soru üretimi `@cf/zai-org/glm-4.7-flash` Çalışıyor, 1 aktif iş; Bilimsel/editoryal kontrol `@cf/nvidia/nemotron-3-120b-a12b` Hazır; özgünlük/hak kontrolü insan incelemesine destek.
10:00 ekranı: Üretim kotası Sınırsız, 0 rezerve → A003 eksik panel kanıtı tamamlandı.
Kod bulgusu: zamanlayıcı bir turda iş açar, sonraki turda çalıştırır → 30 dakikada 1 soru, günde ~48. A081 için temel ölçüm.
Mevcut manuel ekleme bulgusu (A082 gerekçesi): Studio'da tekil ekleme var; toplu aktarım yok; kazanım bağlantısı zorunlu değil; OWNED telifli manuel soru incelemesiz APPROVED oluyor.
Sıradaki ID: A007 — AKTİF (ilk soru üretimde).

### A007 kapanışı — 20 Ekim 10:20

Durum: BİTTİ. Kanıt kullanıcı ekranlarından (10:16, 10:19):
- Otonom zamanlayıcı (servis aktörü `svc-soru-ajani`) 2027–2028 doğrulanmış çıktı seçti: iş `qgj_d06865a7-d4b4-4beb-96f0-594a8964f188`, DKAB.5.1.3 "Allah'ın (cc) güzel isimleri hakkında bilgi toplayabilme", Editoryal V1, 1/1 taslak, 1/3 deneme → "Taslaklar hazır".
- Soru `q_0c622500-5d9e-4466-8eee-eb658a8f5563` kalıcı inceleme listesinde (content-center), 4 seçenekli, cevap işaretli, kazanım ve sürüm geçmişi paneliyle.
- Sonraki iş `qgj_4d984341-…` DKAB.5.5.3 kuyrukta (zamanlayıcı bir turda açar, sonraki turda çalıştırır).
Not: madde 7 gereği kabul ölçütündeki "Süper Admin seçer" adımı otonom akışta servis aktörüyle karşılandı; manuel görev ekranı (Görevi kaydet) mevcut, ayrıca kullanılmadı.

**Kalite bulgusu (A008 ve A081 girdisi):** soru kökü "ağaçtan düşen yaprağın her zaman belirli bir açıyla ve belirli bir noktada yere indiği" gözlemine dayanıyor — bilimsel olarak yanlış (yaprak düşüşü düzensizdir) ve Fen ile çelişir. Kazanım "bilgi toplayabilme" iken soru yorumlatıyor (kısmi uyum). Hata bağımsız kontrol modelinden (`nemotron-3-120b-a12b`) geçti → otomatik kontrol bilimsel doğruluk hatasını kaçırabiliyor. Öneri: RET veya DÜZELTME (ör. mevsimlerin düzenli döngüsü). İnsan kararı A008'de verilecek. A081'de ölçekleme öncesi bu tür hatalar için ek kontrol (alanlar arası olgusal doğruluk) değerlendirilecek.
Ekran ölçeği nedeniyle seçenek metinleri ve kontrol notları okunamadı.
Sıradaki ID: A008 — AKTİF.

### A008 — PR hazır, 20 Ekim

Önceki durum: tekil onay var ve sağlam (sürüm/kazanım bağlamı fence, RESTRICTED engeli, şık/cevap ve medya bütünlüğü); her AI onayı için 3 gerekçe (20–1000 karakter) soru başına zorunlu → yavaş. Toplu seçim yok.
PR #270 (CI run 39387246365 SUCCESS): `POST /api/question-bank-standard/review-batch` (Süper Admin, istek başına ≤50; APPROVED/REJECTED(not zorunlu)/DRAFT). Her öğe değişmemiş tekil kapıdan geçer; her soruya `reviewed_by/reviewed_at` ve `review_checks_json.review={mode:BATCH,batchId}` yazılır. Soru listesinde seçim kutusu, tümünü seç, toplu işlem başına bir kez kontrol listesi/gerekçe, 50'lik parçalı gönderim, işlenmeyenler nedenleriyle. Tekil ekran değişmedi.
Test: 5 API + 4 UI (mutasyon kontrollü); 217 dosya / 1.119 test, typecheck, build PASS.
Açık karar: "şüpheli sorular üstte" — bağımsız kontrol geçen sorular için bulgu saklamıyor; kullanıcıya A008 alt kaydı mı, A081'e taşıma mı soruldu.
Kapanış için kalan: merge → production dağıtımı → kullanıcının gerçek ekranda toplu ve tekil karar kanıtı (ör. A007 sorusu `q_0c622500-…` RET/DÜZELTME).

### Kullanıcı kararları — 20 Ekim 10:41

"B DEVAM ET": (1) "şüpheli sorular üstte" A008'den A081'e taşındı; A008 kabul ölçütü buna göre güncellendi. (2) Sıra A009 → A081 → A082.

### A008 — dağıtım, 20 Ekim 10:55

PR #270 merge `92e570e4c5bcf030b2363a20b87a19563ad5992c` (kullanıcı). Deploy App Production Only run 39389265147 SUCCESS 07:55 UTC (Verify release, Deploy, D1 migrations, read-only smoke, Süper Admin kapsam doğrulaması). 10:56 sonrası app ve sonuc health ready/production.
Kapanış için kalan: kullanıcının gerçek ekranda tekil/toplu RET veya DÜZELTME (A007 sorusu) ve toplu ONAY kanıtı.
Açık öneri (kullanıcı kararı bekliyor): A009 → A081 sonrası genel işlere (A010…) geçmek; A082 ihtiyaç olunca öne alınır.

### A008 kapanışı — 20 Ekim 10:59

Durum: BİTTİ. Kullanıcı ekranı (10:58, content-center): "Hızlı inceleme" paneli canlıda; A007 sorusu `q_0c622500-…` insan kararıyla **Reddedildi** (RESTRICTED değil; öğrenciye açılmaz). Sayaçlar: toplam 13, onaylı 12, kitapta kullanılabilir 12.
Seçenekler okundu: A "rastgele oluştuğunu…", B "yaprağın düşüşünü sadece rüzgârın etkisiyle açıklamak", C (doğru) "en doğru, en faydalı ve en güzel şekilde yaratıldığını…", D "tamamen tesadüfe atıf". **Ek bulgu (A081):** B bilimsel olarak doğru bir açıklama olduğu hâlde çeldirici yapılmış; din-fen alanları arası çelişki. Olgusal doğruluk kontrolüne örnek vaka.
Toplu işlemler API+UI testleriyle kanıtlı; canlı toplu ONAY incelemede soru olmadığından yapılamadı → K002 kontrol listesi.
**A009 girdisi:** 10:15–10:58 arasında yeni AI sorusu görünmüyor (toplam 13 = 12 eski onaylı + 1 reddedilen). Kuyruktaki DKAB.5.5.3 işi 10:45'e kadar üretilmiş olmalıydı.
Sıradaki ID: A009 — AKTİF.

### A009 — hata kaydı ve düzeltme PR'ı, 20 Ekim 11:01–11:20

Gözlem (kullanıcı ekranı 11:01): DKAB.5.5.3 işi `qgj_4d984341-…` 45+ dakikadır "Kuyrukta", 0/3 deneme; 10:15'ten beri yeni AI sorusu yok.
Kök neden (koddan; production günlüğü/D1 okunamadı): (1) zamanlayıcı rezervasyonu yazıp iş üstlenilmeden dönerse sonraki turlarda `INSERT OR IGNORE` 0 satır → "skipped" → kalıcı duruş, kuyrukta iş olduğu için yeni iş de açılmaz; (2) süresi dolmuş RUNNING iş kuyruk tamamlayıcısını kalıcı engeller; (3) tur sonucu görünmediği için duruş sessizdi.
PR #271 (CI run 39391258185 SUCCESS): `reserveScheduledJob` (rezerve edilmiş ama üstlenilmemiş iş mevcut rezervasyonla devam eder; tetikleyici çift saymaz; claim çift çalıştırmayı önler); `PENDING_JOB_SQL` (yalnız kuyruktaki/canlı kiralı iş bekleyen sayılır); runner istisnası yakalanır; migration 0116 `question_scheduler_status` ve panelde "Son tur" satırı. 5 yeni test (mutasyon kontrollü), 218 dosya / 1.124 test, typecheck, build PASS.
Kapanış için kalan: merge → dağıtım → panelde "Son tur … bir soru üretim işi çalıştırıldı" ve DKAB.5.5.3'ün "Taslaklar hazır" olması; ardından birkaç turda yeni işlerin kopyasız ilerlediğinin görülmesi.

### A009 — ara gözlem ve dağıtım, 20 Ekim 11:24–16:19

Düzeltme öncesi kullanıcı ekranı (11:24): DKAB.5.5.3 sonunda çalıştı → 1/3 deneme, **Hata GENERATION_OUTPUT_INVALID** (model çıktısı doğrulamadan geçmedi; kalite kapısı çalışıyor). Yeni iş DKAB.5.5.2 `qgj_dc5db16f-…` kuyrukta. Yani o gecikme kalıcı kilitlenme değildi; gecikmenin kesin nedeni kanıtlanamadı. Koddaki iki kilitlenme açığı yine de gerçektir ve düzeltildi; "Son tur" satırı bundan sonra nedeni gösterecek.
A081 girdisi: başarısız iş (FAILED) kazanımı otomatik yeniden denenmez (kuyruk tamamlayıcı FAILED kazanımları dışlar); ölçekte başarısızlık oranı ve yeniden deneme politikası ele alınmalı.
PR #271 merge `618caf3e0ac8418e152787e5d9fa3f9b02bedc0f` (08:24 UTC). Deploy App Production Only run 39393190947: kullanıcı onayı 16:16 civarı; SUCCESS 13:18 UTC (Deploy, D1 migrations — 0116 dahil, read-only smoke). 16:20 app ve sonuc health ready/production.
Kapanış için kalan: panelde "Son tur" satırı ve birkaç tur boyunca işlerin kopyasız ilerlediği.

### A009 kapanışı — 20 Ekim 16:36

Durum: BİTTİ. Kanıt (kullanıcı ekranları): 16:20'de (düzeltme 16:18'de canlı) DKAB.5.5.2 `qgj_dc5db16f-…` ~5 saattir Kuyrukta, 0/3 deneme → kilitlenme production'da yaşandı. Düzeltme sonrası ilk tur (16:30) işi çalıştırdı: 16:36'da 1/3 deneme, **Hata GENERATION_QUALITY_REJECTED** (bağımsız kalite kontrolü reddetti). Her işte tek deneme; kopya iş/soru yok. Kapasite/duraklatma kuralları testlerle (A005/A006/A009) kanıtlı.
**A081 girdisi — verim:** ilk 3 otonom iş: 1 taslak (insan incelemesinde bilimsel hata nedeniyle RET), 1 GENERATION_OUTPUT_INVALID, 1 GENERATION_QUALITY_REJECTED → kabul edilen soru 0/3. Üretici `@cf/zai-org/glm-4.7-flash`, kontrol `@cf/nvidia/nemotron-3-120b-a12b`. Ölçeklemeden önce üretici kalitesi/verimi iyileştirilmeli; başarısız kazanımlar otomatik yeniden denenmiyor.
Sıradaki ID: A081 — AKTİF.

### A081 — 1. aşama PR'ı, 20 Ekim 16:38–17:20

Kullanıcı kararı (16:38 "devam"): güçlü modelle karşılaştırma ve model başına ~20 iş onaylandı.
PR #272 (CI run 39434454267 SUCCESS): işler `glm-4.7-flash` ve `gpt-oss-120b` arasında belirlenimli bölünür (izin listesi; kontrol modeli kendini değerlendiremez); kullanılan model işe yazılır (migration 0117; dağıtım Worker'ı migration'dan önce yayınladığı için kayıt hatası üretimi durdurmaz); üretici ve kontrol modeline alanlar arası olgusal doğruluk kuralı (yaprak örneği); zamanlayıcı yeni işi aynı turda çalıştırır (15 dakikada 1); panelde model karşılaştırma tablosu. 219 dosya / 1.129 test, typecheck, build PASS.
Ölçüt (kullanıcıya sunulacak): model başına ~20 biten iş sonrası kontrol geçme oranı, insan onay oranı ve gerçekleşen maliyet; seçilen model ile 2. aşamaya (paralel üretim, kuyruk altyapısı, S015) geçilir. Şüpheli sıralama ve başarısız kazanımları yeniden deneme bu aşamada henüz yok.

### A081 — 1. aşama canlıda, 20 Ekim 17:19

PR #272 merge `1086e4e1466f8b33403605aa0c7130be177cd732` (kullanıcı, 17:01). Deploy App Production Only run 39435511265 SUCCESS 14:19 UTC (Deploy, D1 migrations — 0117 dahil, read-only smoke). 17:42 app ve sonuc health ready/production.
Ölçüm dönemi başladı: 15 dakikada 1 iş, modeller sırayla. Karar noktası: model başına ~20 biten iş (yaklaşık 21 Ekim sabahı) → kullanıcı panel tablosu ve gerçekleşen maliyetle model seçimi → 2. aşama.

### A081 — inceleme sinyalleri ve yeniden deneme PR'ı, 20 Ekim 18:10

PR #273 (CI run 39442757663 SUCCESS): denetim kaydında zaten saklanan bağımsız kontrol puanları (6 boyut × 0–4) Süper Admin soru listesine taşındı; incelemedeki sorular en zayıftan güçlüye sıralanır (kapatılabilir), 3+ puan eksikte "şüpheli" etiketi; başarısız kazanım 3 başarısızlığa kadar yeni işle yeniden denenir, denenmemiş kazanımlar önce gelir. 9 yeni test; 221 dosya / 1.134 test, typecheck, build PASS. Şema değişikliği yok.
A081'de kalan: model seçimi (ölçüm sonucu, kullanıcı kararı) → 2. aşama paralel üretim ve kuyruk altyapısı (S015 Queue sınırı) → hedef hız ölçümü.

### Kullanıcı kararı — 20 Ekim 17:58 (A)

Madde 8'e zaman bekleyen ölçüm istisnası eklendi. A081 BEKLİYOR (ÖLÇÜM): PR #272 karşılaştırması 17:19'da başladı, PR #273 (inceleme sinyalleri/yeniden deneme) merge edildi, dağıtım onayı bekliyor. Ölçüm sonucu gelince A081'e öncelikle dönülür (model seçimi → paralel üretim). A082 genel işlerden sonraya alındı (ihtiyaç olunca öne alınabilir). Aktif iş: A010.

### A010 kapanışı — 20 Ekim 18:05

Durum: BİTTİ — değişikliksiz, madde 4 (yeterli güncel kanıt).
Canlı kanıt (kullanıcı ekranları 20 Ekim 10:12–16:36): `/question-team` görev tablosu (model, durum, aktif iş, Duraklat), "Otomatik soru yürütme" satırı, Son 50 üretim işi tablosu gerçek durum/hata kodlarıyla (GENERATION_OUTPUT_INVALID, GENERATION_QUALITY_REJECTED), deneme sayıları, Çalıştır/İptal/Paketi düzelt işlemleri, Görevi kaydet formu.
Test kanıtı (main `735eabe`): `question-team` (sürüme bağlı duraklatma, eski kontrol reddi, değiştirilemez olay kaydı, eksik kontrolde kapalı başarısızlık, sürdürmenin otomatik yürütmeyi açmaması, gerçek kapasite/kuyruk), `question-team-ui` (rol kapısı, sürüme bağlı duraklat), `question-generation-jobs` (değiştirilemez manuel istek, idempotent tekrar, odak/öncelik bağlama, rol reddi), `question-task-focus` → 5 dosya / 17 test PASS. A009 ile "Son tur" satırı, A081 ile model karşılaştırması eklendi.
Eksik: canlı duraklat→sürdür denemesi (model ölçümünü bölmemek için) → K002.
Sıradaki ID: A011 — AKTİF.

### A011 kapanışı — 20 Ekim 18:10

Durum: BİTTİ — değişikliksiz, madde 4. `QuestionCardIntelligence` + `worker/lib/question-card-intelligence.ts`: doğrulanmış kazanım kodu/başlığı, sınıf, program sürümü ve resmî kaynak bağlantısı; ön öğrenme yoksa "henüz eklenmemiş" + not; zorluk "editoryal tahmin, ölçülmüş zorluk yok"; "Boş alanlar tahminle doldurulmaz". Canlı: kullanıcı ekranı 20 Ekim 10:19 (`content-center?questionId=q_0c622500-…`) bölümler görünür. Test: `question-card-intelligence` (doğrulanmış bağlamı tam okur, yokluk/sıfır ayrımı), `question-card-intelligence-ui` (eski yanıt gösterilmez, hata açık) → 3 test PASS.
Sıradaki ID: A012.

### A012 kapanışı — 20 Ekim 18:10

Durum: BİTTİ — değişikliksiz, madde 4. Aynı kart: son beş yıl yalnız doğrulanmış ve pencere içi kayıtlardan; açık doğrulanmış yıllar arası eşdeğerlik dışında eşleştirme yok; kayıt yoksa "Veri yok"/"doğrulanmış kayıt yok" (sıfır değil); olasılık için yüzde üretilmez, eski manuel olasılık iddiaları tahmin sayılmaz. Canlı: 10:19 ekranında LGS/YKS "Veri yok". Test: "counts only in-window verified facts and explicit verified cross-year equivalences; enforces role" PASS.
Sıradaki ID: A013 — AKTİF.

### A013 — BEKLİYOR (VERİ), 20 Ekim 18:15

Kabul ölçütü "branşa uygun gerçek örnekler" gerektirir. Kod/test: tablo/sütun grafik vektör, sıfır tabanlı, tam etiketli (`question-data-visual` 3 test); kontrol modeli görsel tutarlılığı puanlar. Gerçek görselli soru örneği henüz yok (bugünkü AI soruları metin; 12 eski onaylı sorunun görsel durumu bilinmiyor, kullanıcıdan ekran istendi). Genel fotoğraf/kişi/olay görseli üretimi yok; bu tür görseller yalnız manuel yüklemeyle gelir ve telif alanına bağlıdır — hak doğrulama örneği de bekleniyor.
Kullanıcı talimatı (18:03 "sıradaki işi yap") ile madde 8 için açık onay: A013 bekletildi, A014'e geçildi. Gerçek görselli örnek gelince A013'e dönülür.

### A014 — BEKLİYOR (VERİ+KARAR), 20 Ekim 18:06

Bulgu: otonom video `prepareAutonomousQuestionVideo` üç nedenle çalışmıyor: (1) seslendirme ücretli sağlayıcıya bağlı, `NIBIRU_PAID_VOICE_ENABLED` production'da açık değil → NARRATION_PROVIDER_NOT_ENABLED; (2) 2027–2028 onaylı AI kaynağı yok → NO_APPROVED_SOURCE; (3) "Question video render production" iş akışı `vars.QUESTION_PRODUCTION_VIDEO_AUTOMATION` kapalı olduğu için zamanlanmış çalışmalarda SKIPPED (workflow_dispatch ile elle çalışabilir). Ücretsiz CAPTIONS (altyazılı) mod manuel istekte mevcut.
Kullanıcı kararı (18:06 "B"): A014 bekletildi; kanıt için onaylı 2027–2028 sorusu ve ses/ücret kararı beklenir (ücretli ses kararı A066 ile ortak). Önerilen ücretsiz kanıt yolu: onaylı bir soru için altyazılı video + render iş akışını elle çalıştırma.
Sıradaki ID: A015 — AKTİF.

### A015 kapanışı — 20 Ekim 18:15

Durum: BİTTİ — değişikliksiz, madde 4.
- Görülen soru engeli: `eligibleCoachMiniTestQuestions(...,'NEW')` yalnız yeni, doğrulanmış, kendi kurum kapsamındaki soruları seçer; görülenler yalnız 'REPEAT' modunda (test "selects only new verified current tenant questions and permits seen questions only in repeat mode").
- Açık tekrar ve bilgilendirme: `CoachPlanCard`/`OutcomeMiniTestCatalog` tekrar için onay kutusu zorunlu; "Bu test daha önce gördüğün soruları içerir. Sonuç tekrar çalışması olarak kaydedilir."; tekrar puanı ustalık/ödev tamamlamaya sayılmaz (test).
- Yetersizlik: "Yeni soru bekleniyor / Tekrar için yeterli soru yok — N uygun soru bulundu; en az M gerekiyor" (`NEW_QUESTIONS_REQUIRED`).
Test: coach-mini-test-selection, mini-test-catalog, mini-test-list, mini-test-novelty-migration, coach-mini-frozen-evidence, coach-mini-atomic-submission → 6 dosya / 14 test PASS.
Eksik: canlı öğrenci hesabıyla deneme (test öğrencisi yok) → K002.
Sıradaki ID: A016 — AKTİF.

### A016 — güvenlik açığı ve düzeltme PR'ı, 20 Ekim 18:40

Önceki durum: onay+telif filtresi, sınıf/ders filtresi, eksik stokta belge oluşturmama vardı. Bulgu: **Studio seçimi sorunun sahibine bakmıyordu** — kurum X kitapçığı kurum Y'nin özel sorularını içerebiliyor, soru kimliğiyle doğrudan istenebiliyordu (soru listesinde filtre var, Studio'da yok). Kazanım kapsamı ve yıl filtresi yoktu; Studio seçimi için test yoktu.
PR #274 (CI run 39446697639 SUCCESS): seçim her zaman platform + yalnız ilgili kurumun soruları; isteğe bağlı eğitim yılı ve ≤30 doğrulanmış kazanım kodu (bilinmeyen kodlar hata mesajında); Studio formuna alanlar. 3 yeni test (kurum filtresi mutasyon kontrollü), 222 dosya / 1.137 test, typecheck, build PASS.
Not (ayrı alt kayıt adayı): `questionIds` ile 200'e kadar kimlik tek sorguda bağlanabiliyor; D1 100 parametre sınırını aşabilir — önceden var olan risk, A016 kapsamında değiştirilmedi.
Kapanış için kalan: merge → dağıtım → canlı Studio belgesi oluşturma kanıtı.

### Kayıt ve dağıtım notları — 20 Ekim 18:34–18:45

PR #267 (takip kaydı v5) main'e squash merge `ee611e624707c24968b71c3a25911ad92fc5cce8`; bu sürüm (v6) main üzerinden yeni dalda tutulur. PR #273 (inceleme sinyalleri/yeniden deneme) Deploy App Production Only run 39443428526 SUCCESS.

### A016 kapanışı — 20 Ekim 18:45

Durum: BİTTİ. PR #274 merge `63d6c00bd3dfaed738057759ea76490dd4fd5475` (kullanıcı). Deploy App Production Only run 39449611468 SUCCESS 15:37 UTC (Deploy, D1 migrations, read-only smoke). 18:45 app ve sonuc health ready/production. Kurum izolasyonu, yıl ve kazanım kapsamı 3 testle (kurum filtresi mutasyon kontrollü); onay/telif ve eksik stok davranışı korunur.
Eksik: canlı Studio belgesi oluşturma ekranı → K002.
Sıradaki ID: A017 — AKTİF.

### A017 — PDF motoru ve markalama, 20 Ekim 18:44–19:20

Bulgu: eski Studio PDF Türkçe harfleri bozuyor, kökü 3 satırda ve şıkları ~25 karakterde sessizce kesiyor, sayfa geçmiyor (8. sorudan sonra üst üste), görsel basmıyor, AI sorularını reddediyor, cevap anahtarı ve arayüzde indirme düğmesi yok. Kullanıcı yeniden yapımı onayladı (A, 18:44).
Kullanıcı kararları (19:01): kurum logosu+adı sol üst, ANUNEX sağ üst (kurum kaldırabilir), AI sorularının yanında Nibiru işareti (kapatılabilir). Örnek PDF'ler gönderildi; kullanıcı onayladı (19:20).
PR #275: pdf-lib + gömülü DejaVu alt kümesi; iki sütun gerçek sayfalama; tam kök/şık; PNG/JPEG görsel, TABLE ve BAR_CHART; basılamayan durumda soru numarası+nedenle 409; optik sayfa komut ve geometri birebir; ayrı personel cevap anahtarı; kurum baskı logosu yükleme; indirme düğmeleri. 224 dosya / 1.143 test, typecheck, build PASS; Worker 1,28 MiB gzip.
Bilinen sınır: optik sayfa başlığındaki Türkçe karakterler A035'te.

### Değişiklik kayıtları — 20 Ekim 19:20 (kullanıcı onayı)

A083 eklendi (Studio test oluşturma deneyimi); Studio işleriyle birlikte A018'in hemen arkasında ele alınır. A014'e karekod, A067'ye karekod/kazanım sayfası, A078'e etkileşimli tahta modu ekleri yazıldı. Kaynak: kullanıcının paylaştığı örnek soru havuzu ekranlarıyla karşılaştırma.

### A017 — dağıtım ve alt kayıt, 20 Ekim 19:20–19:50

PR #275 merge `348c1c8cb239b7a5ec227e4c78939c25e12dfd48`; Deploy App Production Only run 39457513276 SUCCESS 16:35 UTC.
**Alt kayıt A017.1 (canlı hata, kullanıcı ekranı 19:38):** Süper Admin Studio'da "Taslak oluştur"a bastığında yalnız sayfa üstünde "Kurum kapsamı gereklidir." çıktı; formda kurum seçimi ve düğme yanında geri bildirim yoktu. PR #276 (CI run 39460247056 SUCCESS): Süper Admin için zorunlu kurum seçimi; düğme pasifken nedeni; oluşturuluyor/başarı/sunucu hatası düğmenin altında; logo yükleme seçilen kuruma göre ve yerinde onaylı. 3 yeni UI testi; 225 dosya / 1.146 test, typecheck, build PASS.
A018 ön incelemesi (kod değiştirilmedi): Studio optik şablon/gönderim uçları var ama arayüzde okutma ekranı yok; kitapçık balonu sunucuda doğrulanmıyor; cevaplar soru kimliğiyle bekleniyor (sıra eşlemesi istemciye bırakılmış); aynı öğrencinin ikinci okutması `INSERT OR IGNORE` ile sessizce yok sayılırken yanıt yeni puanı döndürüyor; optik sayfa ~42 soruyu taşıyor, Studio 200'e kadar izin veriyor.
Kapanış için kalan: #276 merge+dağıtım → kullanıcının Studio'dan belge oluşturup Kitapçık A ve Cevap anahtarı PDF'ini indirdiği ekran.

### A017 — BEKLİYOR, 20 Ekim 19:53

PR #276 merge `ef9918611069a618100e2c8f6bbbb3d2079645b6` (kullanıcı); Deploy App Production Only run 39460942171 production onayı bekliyor — kullanıcının "yine aynı" gözlemi bu nedenle. Kullanıcı talimatı ("sıradaki işleme geçelim") ile madde 8 için açık onay: A017 bekletildi, A018 başladı. Kapanış: dağıtım onayı + Studio'dan belge oluşturma ve Kitapçık A / Cevap anahtarı PDF ekranı.

### A018 — bulgular ve PR, 20 Ekim 19:55–20:40

Studio optik zinciri hiç kullanılmamıştı (arayüzde okutma ekranı yoktu). Okutma ekranı yapılırken ölçümle bulunan kusurlar:
1. Kamera köşe kareleri sayfa dolgusu rengindeydi (render: RGB 240,245,255) → okuyucu bulamıyordu; Studio optiği hiç okunamazdı. Düz siyah yapıldı.
2. Şablon alt köşe hedefleri 274,3 mm, çizim 280,1 mm → alt satırlarda kayma. Hedefler çizimden hesaplanıyor.
3. Kalın başlık sol üst karenin arama kutusuna giriyordu → aşağı alındı.
4. A/B kitapçık balonları şablonda yoktu → okunabilir bölge eklendi.
5. Optik sayfa 44 soru; Studio 200'e izin veriyordu → optikli belgede >44 reddedilir; optiksiz PDF'te optik sayfa yok.
6. Kitapçık istemciden alınıyor, cevaplar soru kimliğiyle bekleniyordu → sıra numarasıyla, sunucuda eşleme; okunan kitapçık uyuşmazsa 409; boş/çift işarette öğretmen onayı.
7. İkinci okutma sessizce üzerine yazıyordu (kitapçık kodu güncellenmeden) → ALREADY_SCANNED; gerekçeli değiştirme ve denetim kaydı.
8. Süper Admin okutmasında öğrencinin belge kurumuna aidiyeti kontrol edilmiyordu → tüm rollerde aktif kayıt zorunlu.
Doğrulama: gerçek PDF optik sayfası 150 dpi'da işaretlenip uygulamanın okuma motoruyla okutuldu: 14/14 + boş + kitapçık B birebir; eğik/bulanık/küçük-karanlık/kenar boşluklu görüntülerde de birebir.
PR #277 (CI run 39463280222 SUCCESS): 12 yeni test (gerçek motorla sentetik 44 soruluk okuma, eski hedeflerle kırıldığı doğrulandı); 228 dosya / 1.158 test, typecheck, build PASS.
Not: önceden üretilmiş PDF şablonları eski geometride; dağıtım sonrası PDF yeniden indirilince güncellenir.
Kapanış için kalan: merge+dağıtım → gerçek basılı optiğin telefonla okutulması (A036 fiziksel kanıtıyla ortak; sentetik test fiziksel kanıt sayılmaz).

### A017.1 canlı kanıt ve A083 girdisi — 20 Ekim 20:20

Kullanıcı ekranı (20:20): Studio formunda Süper Admin için "Kurum (zorunlu)" seçimi ve "Baskı görünümü" bölümü canlıda; "Taslak oluştur" sonrası düğme altında "İstenen 2 soruya uygun soru havuzu bulunamadı; yalnız 0 soru seçilebildi." → A017.1 düzeltmesi canlıda doğrulandı.
Neden 0: "Ders kodu" serbest metin alanına `00001` girilmiş (iç kimlik bekleniyor, ör. `sub_math`); sınıf 5. Havuzda 19 soru, 12 onaylı; AI soruları REVIEW'da. **A083 girdisi:** ders serbest metin olmamalı (listeden seçim); seçim sırasında onaylı stok sayısı gösterilmeli; 0 sonuçta hangi filtrenin daralttığı söylenmeli.
A017 hâlâ: Studio'dan gerçek belge + PDF indirme kanıtı (kullanıcıya sınıf/ders boş bırakarak deneme önerildi).

### A017 kapanışı — 20 Ekim 20:25

Durum: BİTTİ. Canlı kanıt: kullanıcının production'dan indirdiği `örnneksınav1 - Kitapçık A` PDF'i (Creator: ANUNEX Studio, 2 sayfa): sol üst kurum adı "ANUNEX Nibiru Yetenek Laboratuvarı" + başlık, sağ üst ANUNEX logosu ve "Kitapçık A", Ad/Sınıf/Numara satırı, Türkçe karakterler ve tipografik tırnaklar eksiksiz, iki sorunun kök ve dört şıkkı tam, "Sayfa 1 / 1", ikinci sayfa optik. Belge Studio listesinde yeniden indirilebilir. A/B sıra ve anahtar tutarlılığı ile içerik kesilmemesi testlerle (PR #275).
Gözlem: onaylı 12 soru 5. sınıf Türkçe (zaman kipleri). Canlı optik sayfa A018 öncesi geometride (soluk köşe kareleri) — beklenen; A018 dağıtımından sonra PDF yeniden indirilmeli.
Sıradaki ID: A018 — AKTİF (PR #277).

### A018 — dağıtım ve alt kayıt A018.2, 20 Ekim 20:28–21:10

PR #277 merge `821dbb8`; Deploy App Production Only run 39464252312 SUCCESS 17:28 UTC.
**Alt kayıt A018.2 (canlı hata, kullanıcı telefon ekranı 20:38):** basılı 5 soruluk optik telefonla okutuldu → "Güven %33 · 5 boş · kitapçık okunamadı · Optik açısı fazla eğik veya referans işaretleri belirsiz". Neden (kodla doğrulandı): okuyucu fotoğrafın tam olarak sayfa olduğunu varsayıyordu; köşe karelerini fotoğraf köşesinde ~%6'lık kutuda arıyor, yalnız afin düzeltme yapıyor ve baloncuğu sabit mutlak karanlık eşiğiyle ölçüyordu. Masa görünen, açılı, gölgeli gerçek fotoğrafta referanslar kutunun dışında kalır. A018 yerel testleri sayfanın kendisi olan sentetik görüntülerdi — bu yüzden geçti; fiziksel kanıt yerine geçmediği bir kez daha doğrulandı.
Kullanıcı isteği (20:47): optik tek sayfada büyük olsun (testin son sayfası), standart kamera okutma görevleri kurulsun, deneme optikleri de kamerayla okunup TXT'ye çevrilsin, açık uçlu cevaplar da değerlendirilsin.
Düzeltme (PR #278, dal `claude/a018-camera-reader`):
1. Okuyucu: kâğıt fotoğrafın neresinde olursa olsun yerel eşikleme + bağlı bileşenlerle düz kare işaretler bulunur (dönmeden bağımsız şekil ölçüsü), en büyük tutarlı dörtgen seçilir, 4 noktadan **perspektif (homografi)** dönüşümü hesaplanır; yön işaretiyle ters/yan çekim düzeltilir. Bulunamazsa eski yönteme düşer, o da olmazsa okumaz (tahmin etmez).
2. Baloncuk ölçümü yakın çevresindeki kâğıda göre (gri/gölgeli kâğıt beyaz gibi); belirgin ama soluk işaret okunur ve "soluk işaret, kontrol edin" uyarısı verir; belirsiz soluk işaret boş sayılır ve uyarılır.
3. Optik sayfa v2 (`ANUNEX-OPTICAL-2`): testin son sayfası, tam A4; 10,6 mm köşe kareleri + yön işareti; Türkçe başlık; Ad/Sınıf, büyük A/B kitapçık balonları; soru sayısına göre 1–3 sütun, ≤15 soruda 7,8 mm çaplı harfli baloncuklar; yönerge satırı.
4. Okutma ekranı: çekim ipucu; eski geometriyle üretilmiş PDF'de "yeniden indirip yazdırın" uyarısı.
Doğrulama: gerçek Studio PDF'i (5/20/44 soru) 200 dpi'da basılıp kurşun kalem benzeri işaretlerle doldurulup 21 farklı telefon fotoğrafı benzetildi (masa arka planı, %5–22 perspektif, ±12° dönme, ters çekim, yatay çekim, gölge, JPEG, bulanıklık, soluk kalem): **21/21 cevap + kitapçık birebir** (biri "soluk işaret" uyarısıyla). 228 dosya / 1.161 test, typecheck, build PASS. Kalıcı testlerde çizimden boyanan sayfa masa/çöp nesneleri/perspektif/ters/soluk mürekkeple okunur; köşe kadraj dışındaysa okumaz. Mutasyon: perspektif yolu ve yön kontrolü kapatılınca testler kırılıyor.
Kapanış için kalan: PR → merge → dağıtım → **yeni PDF indirilip basılan optiğin telefonla okutulması** (fiziksel kanıt).

### Değişiklik kayıtları — 20 Ekim 20:47 (kullanıcı isteği), araştırma özeti

A084 (deneme optiği kamera → TXT) ve A085 (açık uçlu cevapların kamerayla okunup değerlendirilmesi) eklendi; A036'ya kamera standardı bağlandı. Dayanak: (1) telefon optik okumasında yaygın ve güvenilir yaklaşım belirgin köşe işaretleri + perspektif düzeltme + yerel eşiklemedir (açık kaynak OMRChecker vb.); (2) el yazısı/kısa cevap puanlamasında güncel çalışmalar rubrikli LLM puanlamanın insanla uyumunu artırdığını, ancak belirsiz durumlarda insan onayıyla en iyi sonuç verdiğini gösteriyor — bu yüzden A085'te AI yalnız önerir, öğretmen onaylar (A041 kuralı değişmedi). Sayısal cevaplarda AI'sız rakam baloncuk ızgarası önerildi.

### A018 — BEKLİYOR, A083 başladı — 20 Ekim 21:04–21:40

Kullanıcı "devam edelim" (21:04); PR #278 merge/dağıtım ve fiziksel okutma bekliyor → madde 8 kapsamında A017'deki gibi A018 bekletildi, sıradaki A083 başladı.
A083 sınırları (bu kayıtta aşamalara bölündü, her aşama ayrı PR): **A083.1** müfredattan aşamalı seçim + stok + daraltan filtre + optik sınırı; **A083.2** zorluk karışımı; **A083.3** önizleme ve aynı kazanımdan soru değiştirme; **A083.4** şablonlar, test kütüphanesi kart görünümü, Testlerim/Favoriler, ders filtreleri.
**A083.1 — PR #279 (dal `claude/a083-studio-scope`):** `GET /api/platform/studio/catalog` (ders listesi + sınıf için onaylı stok, doğrulanmış ünite › konu › kazanım ağacı ve kazanım başına stok, filtre hunisi). Oluşturma ve katalog tek filtre tanımını paylaşır (`worker/lib/studio-selection.ts`) → gösterilen sayı oluşturmanın kullanabildiği sayıdır; onay/telif/kurum kapıları her zaman açık. Bulgu ve düzeltme: açık uçlu sorular basılı/optikli kitapçığa seçilebiliyordu (şıkları yok) → artık seçilmez. Form: varsayılan Maarif 2027–2028, sınıf listesi (8 LGS, 12 YKS), stoklu ders listesi, katlanır kazanım ağacı (ünite tamamı seçimi, en fazla 30), yetersizlikte oluşturma pasif ve "Havuzu en çok daraltan: … (12 → 3)" açıklaması, 44 soru optik sınırı. Testler: katalog sayısı = oluşturma sınırı, huni mesajı, öğretmen ders kapsamı, açık uçlu ret (tür ve kurum kapıları mutasyon kontrollü), seçici ve form UI testleri. 230 dosya / 1.164 test, typecheck, build PASS.
Not: #278 ve #279 aynı tetik dosyasına ve CSS sonuna yazıyor; #278 önce merge edilirse #279 yeniden tabanlanacak.

### Canlı olay — D1 günlük okuma sınırı, 21 Ekim 11:37

PR #278 (A018.2) kullanıcı talimatıyla merge `a1567b5`; dağıtım onayı 11:35 → Worker yüklendi, "Apply production D1 migrations" adımı Cloudflare 7500 hatasıyla düştü: **ücretsiz plan günlük 5 milyon satır okuma sınırı aşıldı** (sıfırlanma 03:00 TR). Sınır süresince canlı uygulamanın D1 okumaları da hata verir. PR #279 (A083.1) kullanıcı tarafından merge edildi; dağıtımı eşzamanlılık nedeniyle iptal oldu, yeniden başlatıldı (onay bekliyor; sınır sıfırlanmadan onaylanmamalı).
Neden (ölçümle): tüm göçlerle kurulan şema üzerinde 15 dakikalık zamanlayıcı sorgusunun planı — kazanım seçimi her aday kazanım için `question_generation_jobs`'ı 3 kez baştan sona tarıyor, sınıf/dersteki her soruyu dolaşıyordu (`outcome_id` ve `node_id` indeksleri yok). A009 düzeltmesiyle zamanlayıcı her turda çalışınca tüketim katlandı.
Kullanıcı kararı (11:41): Aralık'a kadar ek maliyet yok (ücretli plan yok).
Düzeltme PR #282: göç 0118 (iki indeks), sorgu sabit ve planı yalnız indeks okuması; şema tüm göçlerden kurulup tam tarama olursa test kırılır. 231 dosya / 1.168 test PASS. Dağıtım 03:00 sonrası onaylanmalı (göç adımı okuma gerektirir).

### A083.2 — zorluk karışımı, 21 Ekim 12:15–12:40

PR #282 (okuma indeksleri) ve #279 (A083.1) merge edildi; tek dağıtım 03:00 sonrası onaylanacak.
**A083.2 — PR #283:** Studio'da zorluk karışımı (Dengeli %30/50/20, Kolay ağırlıklı %50/40/10, Zor ağırlıklı %15/45/40, Özel). Hedef sayılar en büyük kalan yöntemiyle (toplam her zaman soru sayısı); her zorluk aynı kapılı havuzdan ayrı çekilip karıştırılır; karşılanamayan zorluk adıyla reddedilir. Katalog zorluk başına stok döndürür; belge ayarında karışım ve `difficultySource: EDITORIAL_ESTIMATE`.
**Dürüstlük notu:** Ölçülmüş madde zorluğu (öğrenci doğru oranı) için saklanan istatistik yok; formda "editoryal tahmin" yazıyor. Ölçülmüş zorluk, cevap verisi biriktiğinde sonuç analitiği işlerinde ele alınacak (okuma bütçesi nedeniyle canlı hesaplanmayacak, saklanan istatistik olarak).
Testler: hedef toplamı, geçersiz karışım, sunucu karışımı ve eksik zorluk (mutasyon kontrollü), form. 231 dosya / 1.171 test, build PASS.
Sıradaki: A083.3 önizleme ve aynı kazanımdan soru değiştirme.

### A083.3 — önizleme ve aynı kazanımdan soru değiştirme, 21 Ekim 12:30–13:00

PR #283 (A083.2) merge edildi. **A083.3 — PR #284:** belge başına "Önizle": kitapçık sırasıyla kök, şıklar, doğru şık, kazanım kodu, zorluk; PDF üretilmiş mi, sonuç var mı. "Değiştir": aynı kapılı havuzdan (kurum/telif/çoktan seçmeli/sınıf-ders-yıl-şık düzeni), aynı kazanımdan (kazanım bağı yoksa aynı ders/sınıf) ve varsayılan olarak aynı zorluktan rastgele onaylı soru; tüm kitapçıklarda aynı sırada. Değişiklik eski PDF ve optik şablonlarını siler, belge DRAFT'a döner — eski basılı kâğıt yeni anahtarla okunamaz. Öğrenci sonucu olan belgede değişiklik reddedilir (STUDIO_LOCKED). Denetim kaydı STUDIO_QUESTION_SWAPPED.
Testler: önizleme, iki kitapçıkta değiştirme, havuz tükenmesi, kilit (mutasyon kontrollü), yetki; UI. 233 dosya / 1.176 test, build PASS.
Sıradaki: A083.4 şablonlar, test kütüphanesi kart görünümü, Testlerim/Favoriler, ders filtreleri.

### A083.4 — şablonlar ve test kütüphanesi, 21 Ekim 12:45–13:30

PR #284 (A083.3) merge edildi. **A083.4 — PR #285:** göç 0119 (`studio_templates`, `studio_document_favorites`). Şablon yalnız form seçimlerini saklar (soru saklamaz; oluşturma her kapıyı yeniden işletir); öğretmen şablonu özel, yönetici kurumla paylaşabilir; kişi başı 50. Hazır şablonlar: konu tarama, deneme, ödev, telafi. Kütüphane kart görünümü: tür, sınıf, ders adı, soru sayısı, kitapçık, durum, yıl, tarih; Tümü/Testlerim/Favoriler (sayılı), ders filtresi, arama, yıldız. Değişiklik: öğretmen listede yalnız kendi belgelerini görür (başkasınınkini zaten açamıyordu).
Görsel kontrol: bileşenler 1200 px ve 390 px'de render edilip incelendi; indirme düğmeleri kart içine sığacak şekilde düzeltildi. 235 dosya / 1.180 test, build PASS.
**A083 durumu:** dört aşama tamam; kapanış için dağıtım (03:00 sonrası) + canlı Studio ekranı (kazanım ağacı, zorluk, önizleme/değiştirme, kütüphane) → BEKLİYOR. Madde 8 kapsamında sıradaki A019 başlar.

### A019 — sınav kartının kalıcı kaydı, 21 Ekim 13:00–13:40

PR #285 (A083.4) merge edildi. A019 incelemesi: sunucu tarafında oluşturma/okuma alanları birebir (POST/PATCH/GET aynı alanlar). Kusurlar:
1. **Canlı hata:** 19 Ekim 19:34'ten beri (PR #266) yeni sınav kartında "Devam" ile cevap anahtarı adımına geçince `detail.correctionOpen` boş kayıtta okunuyor → sayfa çöküyordu; oluşturucu ile yeni sınav açılamıyordu. UI testiyle yeniden üretildi, düzeltildi.
2. Açık sınav adreste tutulmuyordu → yenileyince kart kayboluyordu. Artık `?examId=`; kapatınca silinir, açılış başına tek yükleme.
3. Kaydedilmemiş kart yenilemede kayboluyordu → kullanıcı başına tarayıcıda taslak (alanlar, tür, dersler, anahtar metni/girdileri, puanlama ve sonuç ayarları, adım); geri yükleme bildirimi; dosyaların saklanamadığı açıkça yazılır; "Taslağı temizle"; oluşturunca silinir.
4. Zorunlu alan uyarısı yalnız iki alanı söylüyordu → eksikler adıyla (eğitim yılı biçimi, Süper Admin için kurum dahil) ve alanlar işaretli.
PR #286: 4 UI testi (çökme düzeltmesiz kırılıyor). 236 dosya / 1.184 test, build PASS.
Kapanış için: dağıtım + canlıda yeni sınav kartı → cevap anahtarı adımı → sayfa yenileme ekranı.

### A020 — cevap anahtarı girişi, 21 Ekim 16:45–17:20

PR #286 (A019) merge edildi. A020 incelemesi ve düzeltmeler — PR #287:
1. İndirilen şablonda yalnız A ve B soru no sütunu vardı → C/D kitapçıklı sınavın anahtarı şablona girilemiyordu. Şablon `src/lib`'e taşındı; seçilen her kitapçık için ayrı sütun, her hücrede tek değer.
2. Şablon Türkçe Excel'de CSV olarak kaydedilince (`;`, başlık 35. satırda) serbest metin ayrıştırıcısına düşüp okunamıyordu → tablo olarak okunur.
3. Kitapçık sütunu kısmen boşsa veya numara tekrar ediyorsa uyarı yoktu → test/kitapçık adıyla uyarı.
4. Sunucu: sınavda olmayan kitapçığın anahtarı sessizce atılıyordu → 400 INVALID_BOOKLET; testin aralığı dışındaki basılı soru numarası kabul ediliyordu → 400 BOOKLET_QUESTION_OUT_OF_RANGE.
Doğrulama: şablon doldurulup .xlsx ve `;` CSV olarak geri okunduğunda A/B/C/D anahtarları ve basılı sıraları birebir; gerçek göç şeması üzerinde sunucu her kitapçığı basılı sırasıyla saklıyor; retler mutasyon kontrollü. 237 dosya / 1.188 test, build PASS.
Kapanış için: dağıtım + gerçek izinli bir cevap anahtarı dosyasıyla canlı yükleme ekranı (A025 ile ortak örnek kullanılabilir).

### A021 — otomatik kazanım eşleştirmesi, 21 Ekim 17:00–17:30

PR #287 (A020) merge edildi. İnceleme: sıra doğruydu (önce resmî kod, sonra birebir metin, sonra kelime benzerliği adayları); doğrulanmamış/başka yıl/başka program satırları dışarıda, kopya kodlar zaten belirsiz. Belirsizken kesin kaydedilen iki durum bulundu ve düzeltildi — PR #288:
1. Kod bir kazanımı, yayınevi başlığı birebir başka doğrulanmış kazanımı gösterdiğinde kod sessizce kazanıyordu → artık AMBIGUOUS (ikisi aday), soru REVIEW_REQUIRED kalır; sunucu ve form aynı kuralı uygular.
2. Cevap anahtarı kaydında otomatik eşleştirme, kişinin elle seçtiği (veya korunan) kazanımın yanına ikinci kazanım ekliyordu → eşlenmiş soruya dokunulmaz, yalnız boş sorular doldurulur.
Testler: sunucu ve form için ortak örnekler; gerçek göç şemasında kayıt yalnız kesin eşleşmeyi ve kişinin seçimini saklar, çelişki incelemede kalır (mutasyon kontrollü). 238 dosya / 1.190 test, build PASS.
Kapanış için: dağıtım + kazanımlı gerçek bir anahtarla canlı eşleştirme özeti ekranı.

### A022 — manuel kazanım seçimi, 21 Ekim 17:10–17:35

PR #288 (A021) merge edildi. İnceleme: resmî katalog sunucuda sınavın yıl/sınıf/program/ders kapsamıyla sınırlı, kapsam dışı kayıt reddediliyor, kayıt sürüm kontrollü ve yeniden açınca kaydedilen görünüyor — doğru. Düzenleyicideki eksikler — PR #290: katalog tek uzun çoklu liste → üniteye göre gruplu; seçilen kazanım yalnız Ctrl-tıkla kaldırılabiliyordu → kaldırılabilir etiket; öneriler yalnız kod → kod + başlık; kaydedilmemiş seçim sessizce kayboluyordu → değişen soru sayısı ve sayfadan çıkışta tarayıcı uyarısı. UI testi kaydet → yeniden aç döngüsünü doğrular. 238 dosya / 1.191 test, build PASS.
Kapanış için: dağıtım + canlı eşleştirme ekranı.

### A023 — Codex'te; kullanıcı kararı 21 Ekim 17:40

GitHub'da başka bir ajanın (Codex) taslak PR'ı #289 (`codex/activation-feedback-20261021`) A023'ü kapsıyor: taslakta "Sınavı aktifleştir" eksikleri sekmeden bağımsız gösterir, her eksiğe "Düzelt" ilgili bölümü açar, eski readiness'e sunucunun 409'u gelirse güncel eksikler görünür, çift tıklama tek istek gönderir. Kullanıcı kararı: **A023 Codex'te kalır**; bu oturum A023'e kod yazmaz, A024'e geçer.
İnceleme (kod değiştirilmedi): dal main ile çakışmasız birleşiyor; typecheck PASS; `exam-activation-ui`, `exam-card-persistence-ui`, `exam-outcome-editor-ui` 17/17 test PASS; sunucu 409'u eksik listesini `details` olarak zaten döndürüyor. Kapanış: #289 merge + dağıtım + canlı aktifleştirme ekranı.
Sıradaki ID: A024 — AKTİF.

### A024 — puanlama profili, 21 Ekim 17:45–18:40

PR #290 (A022) bekliyor. İnceleme bulguları: (1) `exam_results.score` her zaman NULL — yalnız net ve başarı yüzdesi hesaplanıyordu; LGS/ÖSYM profilleri "resmî, standart puan" olarak işaretli ama bu hesap yoktu (resmî puan ülke geneli ortalama/sapma ister). (2) Yanlış böleni 0 ("yanlış götürmez") motor tarafından sessizce 4'e çevriliyor, yapı API'si 0'ı reddediyordu. (3) Özel profilin kuralı (yanlış, ölçek, ağırlık) saklanıyor ama değerlendirmede kullanılmıyordu. (4) **A019.1:** formda "isteğe bağlı" açıklama sunucuda zorunluydu → sınav son adımda reddediliyordu.
Kullanıcı kararı (17:50): **tahmini puan + kurum sıralaması.** PR #291: 0 = yanlış götürmez; özel sınavın yanlış kuralı geçerli; puan modeli profile göre — okul: en yüksek nete oran ×100; özel: kurum ölçeği × ağırlıklı net oranı; LGS: 100 + 400 × ağırlıklı net oranı (MEB ağırlıkları 4/4/4/1/1/1), "tahmini, MEB standart puanı değildir" etiketli; ÖSYM profilleri tahmini katsayılar onaylanana dek puansız (sıralama nete göre). Kurum ve sınıf sıralaması puan → net → doğru sırasıyla. Göç 0120 her profile puan modeli ve açıklama yazar; formda "Puan nasıl hesaplanır". Açıklama sunucuda isteğe bağlı.
Doğrulama: örnek hesaplar (LGS tam net 500, hiç 100, ağırlıklı 172/270 → 354,81; 1 Türkçe neti = 4 İnkılap neti), özel ölçek ve ağırlık; tam HTTP akışında (doğrudan ve parçalı) yanlış götürmez net, özel ölçekli puan ve puana göre sıra (mutasyon kontrollü). 238 dosya / 1.196 test, build PASS.
**Bekleyen karar (A024 kapanışı için):** ÖSYM tahmini puanı. Öneri: ÖSYM kılavuzundaki test ağırlıklarından türetilen doğrusal tahmin (TYT: Türkçe %33, Sosyal %17, Matematik %33, Fen %17 → net başına ≈3,3 / 3,4 / 3,3 / 3,4, taban 100). Web'deki hesaplayıcılar birbirini tutmuyor (ör. 3,22/3,57/3,38/2,63; 2,83/2,99/3,28/2,53 + 145,47) — bu yüzden kullanıcı onayı ve kılavuz doğrulaması gerekli.

### 21 Ekim 18:35 — #291 çakışması giderildi; A024 BEKLİYOR (KARAR), A025 VERİ bekliyor

#290 (A022) merge sonrası #291 `exam-workspace.css` ve tetik dosyasında çakışıyordu; main dala birleştirildi (zorla itme yok), 238 dosya / 1.197 test PASS, PR temiz. A024: ÖSYM tahmini puan yöntemi kullanıcı onayı bekliyor → BEKLİYOR (KARAR). A025 (TXT/DAT/FMT) kabul ölçütü gerçek izinli örnek dosya istiyor; ön inceleme: Windows-1254/UTF-8 kod çözme, FMT ayrıştırıcı ve uçtan uca testler mevcut. Kullanıcıdan istenen: bir FMT tanımı + aynı optikten TXT/DAT çıktısı + cevap anahtarı + eski sistemin sonuç raporu (karşılaştırma için; kişisel veri maskelenebilir).

### A025 — gerçek dosyalarla TXT/DAT/FMT değerlendirmesi, 21 Ekim 19:01–20:10

PR #291 (A024) merge edildi. Kullanıcı gerçek izinli dosyaları gönderdi (ÇAP TYT Deneme 0): `OPT_K-129_SEKONIC.fmt`, okuyucu çıktısı `cap_tyt0.txt` (6 öğrenci), yayınevi kazanımlı cevap tablosu (.xls/xlsx) ve cevap anahtarı PDF'i.
Bulgular (gerçek veriyle, sentetik testler bunları yakalamamıştı):
1. FMT reddediliyordu: dosyadaki Türkçe harfler U+FFFD olarak gelmiş ("��RENC� NO"); hiçbir etiket eşleşmiyordu.
2. Yayınevi cevap tablosu (Kitapçık;Test;Ders;A Soru;B Soru;Cevap;Kazanım Kodu) hiç okunmuyordu: 125/125 satır tanınmadı.
3. Sekonic 129 yerleşiminde seçmeli felsefe (Sosyal 21–25) ve TC/telefon alanı hiç alınmıyordu → seçmeli felsefe hiç puanlanamazdı.
4. Belirsiz yüklemede bütün şablonlar listeleniyordu.
PR #292: etiketlerde kayıp harf toleransı; yayınevi satır tablosu ayrıştırıcısı (Test → ders eşlemesi, kitapçık basılı sırası, "Felsefe (Seçmeli)" → TYT_FEL seçmeli anahtar, kendi kitapçık sırasıyla; `;` CSV de); 129 tanımına TYT_FEL ve TC alanı (yüklenen FMT + yerleşik tanım, göç 0121); belirsizlikte yalnız uyan şablonlar.
Doğrulama: kişisel veriler değiştirilmiş TXT (cevaplar/kitapçık/yerleşim aynen) tam HTTP akışında (sınav, yapı, anahtar, aktifleştirme, yükleme, değerlendirme; doğrudan ve parçalı; yüklenen FMT ve yerleşik tanım) 6 öğrenci × 4 test D/Y/B/net ve toplamlar, yayınevi anahtarından **bağımsız Python hesabıyla birebir**; seçmeli felsefe sonuçları (hepsi 5 boş) kaydedildi. Mutasyon kontrollü. 239 dosya / 1.202 test, build PASS.
Not: eski sistemin sonuç raporu gelmedi; beklenen sonuçlar yayınevi anahtarından bağımsız hesaplandı. Ad alanındaki kayıp Türkçe harfler isim eşleştirmesini etkiler → A026'da ele alınacak.
Kapanış için: dağıtım + aynı dosyaların canlıda yüklenip sonuç ekranı.

### A024 — ÖSYM tahmini puan, kullanıcı onayı 21 Ekim 19:17

PR #292 (A025) merge edildi. Onaylanan yöntem uygulandı — PR #293: 100 + 400 × Σ ağırlık × (net / soru sayısı), OBP eklenmez, "tahmini, resmî puan değildir" etiketli. Ağırlıklar (ÖSYM test ağırlıkları; iki ayrı kaynakla karşılaştırıldı): TYT Türkçe 33 / Sosyal 17 / Temel Mat 33 / Fen 17; SAY = TYT 40 + AYT Mat 30, Fiz 10, Kim 10, Biy 10; EA = TYT 40 + Mat 30, Edebiyat 18, Tarih-1 7, Coğrafya-1 5; SÖZ = TYT 40 + Edebiyat 18, Tarih-1 7, Coğrafya-1 5, Tarih-2 8, Coğrafya-2 8, Felsefe 9, Din 5; DİL = TYT 40 + YDT 60. Puan türünün bütün testleri yoksa (yalnız AYT/YDT) puan verilmez ve nedeni yazılır. Göç 0122.
Doğrulama: örnek hesaplar (tam 500, hiç 100, 333; 1 Türkçe neti ≈ 3,3, 1 Sosyal neti ≈ 3,4); gerçek ÇAP TYT 0 verisinde her öğrencinin saklanan puanı bağımsız hesaplanan tahminle aynı (en yüksek 410,78, sıra 1). 239 dosya / 1.205 test, build PASS.
A024 kapanışı: dağıtım + canlı sonuç ekranında puan ve açıklama.

### A026 — öğrenci otomatik eşleşmesi, 21 Ekim 19:30–20:00

PR #293 (A024 ÖSYM tahmini) merge edildi. İnceleme: T.C. → okul no → ad soyad+sınıf sırası, kopyalarda belirsizlik ve bilinmeyende yeni misafir doğruydu. Eksikler — PR #294:
1. Okul numarası eşleşirken optikteki geçerli T.C. numarası başka öğrenciye ait olsa bile bağlanıyordu (bir çocuğun sonucu diğerine gidebilirdi) → AMBIGUOUS, kişi seçer. Gerçek optiklerde TC/TEL alanında telefon numarası olduğu için yalnız sağlama hanesi geçerli T.C. numaraları dikkate alınır.
2. Gerçek dosyalarda Türkçe harfler U+FFFD olarak kayboluyor; ad normalleştirmesi bunları boşluğa çevirdiği için ad hiç eşleşmiyor, öğrenci yeni misafir oluyordu; numara eşleşmelerinde yanlış "ad soyad farklı" uyarısı çıkıyordu → kayıp harf tam bir harfe karşılık gelir; tek uyan öğrenci kontrol için önerilir, iki uyan belirsiz kalır.
Testler: T.C. sağlaması, sıra, çakışma reddi (mutasyon kontrollü), telefon numarası, kayıp harf eşleşmesi ve sınırları; test verisinde gerçek kimlik/telefon numarası yok. 239 dosya / 1.209 test PASS.
Kapanış için: dağıtım + gerçek dosya yüklemesinde eşleşme ekranı (A025 dosyaları + kayıtlı öğrenciler).

### Kullanıcı notu — 21 Ekim 19:39

Sistem henüz aktif değil (örnek veriler var, gerçek değerlendirme yok); öğrenci sonucu gönderilemediği için canlı test şu an yapılamıyor. Talimat: çalışmalar en doğru şekilde hazırlansın, **canlı kabul testleri sistem canlıya alındıktan sonra manuel yapılacak.** Bu nedenle A018–A027 kapanışlarındaki "canlı kanıt" maddeleri K002 kapsamına toplanır; işler kod/test tarafı tamamlandıkça sıradakine geçilir.

### A027 — eksik/hatalı kitapçık çözümü, 21 Ekim 19:40–20:05

PR #294 (A026) merge edildi. Mevcut: kitapçığı boş/geçersiz optikte kitapçık başına karşılaştırma, sınavın kitapçıklarıyla sınırlı seçim, karar kaydı. Eksikler — PR #295: (1) karşılaştırma anahtarı 1..n numarasıyla arıyordu → 1'den başlamayan testlerde (ör. 41–44) bütün kitapçıklar "cevap anahtarı eksik" görünüyor, seçilemiyordu; artık değerlendirme gibi her kitapçığın n'inci basılı sorusunu okur. (2) Özel sınavın yanlış kuralı (A024) karşılaştırmada yoktu. (3) Denetim kaydı yalnız seçilen kodu tutuyordu → önceki kod ve karar anında görülen tüm seçeneklerin D/Y/net'i. Testler: birim + göç şemasında HTTP akışı (mutasyon kontrollü). 240 dosya / 1.211 test PASS.

### A028 — eşleşmeyen öğrenci kuyruğu, 21 Ekim 19:50–20:25

PR #295 (A027) merge edildi. Mevcut: eşleştir/misafir/iptal kararları, bekleyen satırın değerlendirmeyi durdurması, kararların denetim kaydı, satırların silinmemesi doğru. Bulgu: aynı öğrenciye aynı testler için iki optik bağlanınca (iki kez okutma veya yanlış elle eşleştirme) doğrudan değerlendirme **iki katılımcı/iki sonuç** üretiyor, parçalı değerlendirme sonrakini **sessizce üstüne yazıyordu**. PR #296: ortak kural (aynı öğrenci + ortak test = çakışma; ortak testi olmayan sözel/sayısal oturumlar birleşir; iptal satırlar sayılmaz); toplu görünümde çakışan satırlar ve kuyrukta uyarı; elle eşleştirmede 409 STUDENT_ALREADY_IN_BATCH; iki değerlendirme yolunda DUPLICATE_STUDENT_IN_BATCH. Testler: kural + HTTP akışı (doğrudan ve parçalı; mutasyon kontrollü). 241 dosya / 1.214 test, build PASS.

### A028b — çift oturum (sayısal + sözel) optik, 21–22 Ekim (kullanıcı talebi, A029'dan önce)

Soru: ortaokulda sayısal ve sözel ayrı optiğe (ör. 7108 + 840) kodlanıp tek TXT ya da iki TXT olarak yüklenince sonuç doğru mu? **Hayır, değildi.** Bulgular:
1. İkinci dosya ilk oturumun derslerini boş cevaplarla eziyordu, çünkü 7108'de sözel blokları boş da olsa vardı. Sonuç yükleme sırasına bağlıydı.
2. Hazır 7108 SOS/ING okuyor, LGS sınavı INK/YAB bekliyor. İnkılap ve İngilizce sessizce puanlanmıyordu.
3. İki formlu tek TXT okunamıyordu (satır uzunlukları farklı).
4. Yüklenen Sekonic FMT yalnız 129 düzenini biliyordu.
5. Öğrencinin iki oturumda farklı kitapçık alması desteklenmiyordu.
6. Alt kayıt **A028b.1**: parçalı değerlendirme yeni misafirde FOREIGN KEY hatasıyla düşüyordu (tarama satırı, öğrenci satırından önce bağlanıyordu).
7. Alt kayıt **A028b.2**: hazır 129 tanımında TC alanı 36–48 idi; 47. sütun ALAN olduğu için 36–47 olmalı (0123).

PR #297 ile yapılanlar:
- FMT yerleşimi formun kendi satırlarından çıkarılıyor; KOD sütunları form imzası oluyor.
- Karışık TXT'de her satır kendi uzunluğundaki formla okunuyor; belirsizlikte tahmin yapılmıyor.
- Ders kodu sınava hizalanıyor.
- Bir formun tüm kağıtlarında boş olan test yüklemeye dahil sayılmıyor.
- Aynı öğrencinin iki oturum kağıdı tek kayıtta birleşiyor; her oturum kendi kitapçığıyla puanlanıyor.
- Birleşemeyen kağıtlar ayrı parçalarda yazılıyor ve boş test dolu testi ezmiyor.
- Oturumu eksik öğrenci net alıyor ama puan almıyor (ÖSYM tahminiyle aynı kural).
- Önizlemede dosya notları gösteriliyor.

Testler:
- LGS uçtan uca, doğrudan ve parçalı değerlendirmede: iki dosya her iki sırada, karışık TXT, birleşemeyen kağıt, iki oturumun aynı 7108 formunda olması, farklı oturum kitapçığı, misafir öğrenci.
- Birim testleri ve migration kontrolü; mutasyon kontrollü.
- 243 dosya / 1.239 test, build PASS.

Bilinen sınır: iki oturum aynı formdaysa ve öğrencinin ikinci kağıdı yoksa, boş sözel blokları "boş bıraktı" sayılır.

Karar notu (kullanıcı değiştirebilir): eksik oturumda puan boş bırakılıyor; net ve sıralama gösteriliyor.

Kapanış için: dağıtım ve canlıya geçince gerçek 7108 + 840 dosyalarıyla elle kabul (K002).

### A029 — sonradan kazanım bağlantısı, 21 Ekim 20:35–

PR #297 (A028b) merge edildi; dağıtım onay bekliyor.

Mevcut durum doğruydu:
- Yetkili (Süper Admin ya da kendi kurum sınavının yöneticisi) kazanımları sürüm kontrolüyle bağlayabiliyor; kazanım eski yıla aitse reddediliyor.
- Yeniden analiz yeni bir analiz sürümü oluşturuyor; puan, sıralama ve dondurulmuş sonuç değişmiyor.
- Sonuç ağı, açık yayına kadar eski analizi gösteriyor.

Bulgular:
1. Yeniden analiz misafir katılımcıların kazanım verisini siliyor, yeniden kurmuyordu.
2. Alt kayıt **A029.1**: sınav tanımlama ekranında oluşturulan sınavlarda yayın profili yoktu. "Dondur" snapshot yazıyor ama sınav dondurulmuş duruma geçmiyordu, bu yüzden sonuç hiç yayınlanamıyordu (A030 akışını da engelliyordu).
3. Sonuçlu sınavda kaydetmek kullanıcıya yalnız "kaydedildi" diyordu; yeniden analiz edildiği söylenmiyordu.

PR #298 ile yapılanlar:
- Yeniden analiz misafirleri de kapsıyor.
- Dondurma işlemi eksik profili oluşturuyor.
- Kazanım ekranı kaydetmeden önce uyarıyor, kaydettikten sonra kaç katılımcının yeniden analiz edildiğini ve yeni sürümü gösteriyor.

Testler:
- Gerçek şemada uçtan uca, doğrudan ve parçalı: değerlendir → dondur → yayınla → sonradan bağla → personel ve öğrenci görünümü; puan ve snapshot değişmiyor; yetki, yıl kapsamı ve sürüm çakışması kontrolleri.
- Arayüz testleri; mutasyon kontrollü.
- 244 dosya / 1.244 test, build PASS.

Kapanış için: dağıtım + canlıda elle kabul (K002).

### A030 — uygulamada sonuç yayını, 21 Ekim 20:50–

PR #298 (A029) merge edildi.

Mevcut durum: dondurma, şimdi/sonra yayın (zamanlı otomatik yayın), düzeltmeye açma ve ana sonuç ekranlarının yayın kontrolü doğruydu.

Bulgu: uygulamanın çağırdığı tüm API yolları (≈490) öğrenci ve veli hesabıyla, üretim zinciri üzerinden ve bütün özellikler açıkken tarandı. Yayından önce sonucu gösteren 10 ekran çıktı:
- ana sayfa;
- `my-results`, `my-outcomes`;
- yanlışlarım;
- sınav inceleme;
- bildirimler;
- veli haftalık özeti;
- ölçme akışı;
- katalog ve istatistik.

Alt kayıt **A028b.3**: üretim yükleme politikası tek optik seçtirdiği için karışık sayısal + sözel TXT okunamıyordu. A028b testleri politikayı atlıyordu.

PR #299 ile yapılanlar:
- Öğrenci ve veli okumaları yalnız yayımlanmış sınavları gösteriyor; katalog ve istatistik personele kapalı.
- Politika, kurumun izinli optiklerini isteğe ekliyor; seçilen optik ile izinli diğeri karışık dosyayı birlikte okuyor.
- Kalıcı tarama testi eklendi: yol listesi kaynak koddan okunuyor, yeni ekranlar da otomatik taranıyor.
- 246 dosya test ve build PASS.

Not: öğrenme durumu ve telafi gibi türetilmiş sinyaller yayınlanmamış cevaplardan beslenebilir; ilgili işlerde ele alınacak.

Kapanış için: dağıtım + canlıda elle kabul (K002).

### A031 — sınav silme / arşiv / kopyalama, 21 Ekim 21:25–

PR #299 (A030) merge edildi.

Bulgular:
1. Uygulamadan kaldırılan (çöp kutusu) sınavın sonucunu öğrenci ve veli 7 ekranda görmeye devam ediyordu.
2. Çöp kutusundaki sınav planlı zamanında otomatik yayınlanabiliyordu; dondurma ve yayınlama da çalışıyordu.
3. Kaldırma penceresi etkiyi (sonuç sayısı, yayın durumu, kanallar) göstermiyordu.

PR #300 ile yapılanlar:
- Kaldırma, öğrenci ve veli yayınını kapatıyor ve planlı yayını iptal ediyor; sonuçlar ve donmuş sürüm saklanıyor, denetim kaydına yazılıyor.
- Çöp kutusundaki sınav dondurulamıyor ve yayınlanamıyor.
- Geri alma yayını kendiliğinden açmıyor ve bunu söylüyor.
- Kaldırma penceresi etkiyi gösteriyor.
- Arşiv (sonuç korunur) ve kopya (bağımsız taslak) davranışları testle güvenceye alındı.
- 247 dosya / 1.254 test, build PASS.

Kapanış için: dağıtım + canlıda elle kabul (K002).

### A032 — sınav kataloğu işlevleri, 22 Ekim 16:05–

PR #300 (A031) merge edildi.

Doğru çalışanlar: liste, arama, filtre, detaya giriş, işlem düğmeleri ve rol kapsamı.

Bulgular:
1. Çöp kutusundan geri alınan aktif sınav katalogdan herkes için kayboluyordu (uygulama kanalı kapalı kalıyordu). Kurum kendi sınavına bir daha ulaşamıyordu.
2. Kurum yöneticisi katılım sayısını tüm kurumlar için görüyordu.
3. Tanımlama ekranında oluşturulan merkezi sınavlar "kurum" diye etiketleniyordu.
4. Arşivlenen sınava ulaşılamıyordu; "CLOSED" etiketi Türkçe değildi ve filtrede yoktu.

PR #302 ile yapılanlar:
- Geri alınan sınav Süper Admin'e ve sahibi kuruma görünüyor; sunulduğu diğer kurumlar kanal yeniden yayınlanana kadar görmüyor ve satır bunu belirtiyor.
- Kurum yöneticisi yalnız kendi kurumunun katılım sayısını görüyor.
- Kapsam etiketi sınavın sahibine göre doğru.
- Arşiv ve Kapandı filtreleri eklendi.
- 248 dosya / 1.258 test, build PASS. Görsel tasarım D001'de.

Kapanış için: dağıtım + canlıda elle kabul (K002).

### Kullanıcı notu — 22 Ekim 16:19

Süper Admin sistemin tek sahibidir. Kendi hesabı bir kuruma bağlı olsun ya da olmasın, tüm kurumların tüm katılımlarını görür; her şeyi düzeltir, yükler, siler ve kısıtlar. Bir kurumla anlaşmazlıkta kurumu ve bağlı tüm hesapları dondurabilir, askıya alabilir, yeniden aktif edebilir ve silebilir.

Kararlar (soruldu, 22 Ekim):
- İş A033'ten önce yapılacak.
- Silme geri alınabilir olacak; kalıcı imha ayrı ve onaylı bir adım.

### A032b — Süper Admin kurum yaşam döngüsü, 22 Ekim 16:20–

Bulgular:
1. Uygulamada yalnız aktif/pasif vardı; sonuç ağı yaşam döngüsü ayrıydı ve ikisi tutarsızdı.
2. Hesabı askıya alınan kuruma bağlı Süper Admin kilitleniyordu: oturumu kapatılıyordu; Nibiru, akademik gelişim, passkey ve lisans kontrolleri engelliyordu.
3. Askıdaki kurumda Süper Admin değerlendirme yapamıyordu.

PR #303 ile yapılanlar:
- Tek yaşam döngüsü: Aktif / Askıda / Dondurulmuş / Silinmiş (geri alınabilir).
- Aktif olmayan her durumda kuruma bağlı tüm hesaplar kapanıyor.
- Silme gerekçe istiyor ve veriyi saklıyor; silinen kurum "Silinenler"den geri alınabiliyor.
- Süper Admin hiçbir durumda kilitlenmiyor.
- Kurumlar ekranı etkiyi gösteriyor.
- 250 dosya / 1.262 test, build PASS.

Bekleyen: kalıcı imha (ayrı onaylı iş). Kapanış için: dağıtım + canlıda elle kabul (K002).

### A033 — sınav belge arşivi, 22 Ekim 16:50–

PR #302 (A032) ve #303 (A032b) merge edildi.

Bulgular (arşiv fiilen çalışmıyordu):
1. Liste herkes için 500 veriyordu: kod okuduğu `description` sütununu hiçbir migration oluşturmuyordu.
2. Video ekleme her zaman başarısızdı: INSERT'te bir fazla yer tutucu vardı.
3. Sınav geneli (EXAM) videolar tablo CHECK kısıtına takılıyordu.
4. Öğretmen kitapçık PDF'ini göremiyordu.
5. Öğrenci ve veli, yayından önce dosya ve videolara erişebiliyordu.
6. Çöp kutusundaki sınav kuruma açıktı.

PR #304 ile yapılanlar:
- 0124 ile `video_links` yeniden kuruldu.
- Görünürlük kuralları ve erişim kapıları düzeltildi.
- 251 dosya / 1.263 test, build PASS.

**Üretim uyarısı (22 Ekim):** D1 günlük okuma limiti bugün yine doldu. Sebep: 20 Ekim'deki A018 dağıtımından bu yana üretime hiçbir dağıtım ulaşmadı. Bekleyen her dağıtım, bir sonraki merge onu iptal ettiği için onaysız kaldı. Bu yüzden #282 (zamanlayıcı okuma indeksleri) dahil 22 commit henüz üretimde değil. Yapılması gereken: 03:00'ten (UTC gece yarısı) sonra en son "Deploy Production Cloudflare Worker" çalışmasını onaylamak.

Kapanış için: dağıtım + canlıda elle kabul (K002).

### D1 bütçesi — ajanlar durduruldu, 22 Ekim 17:15 (kullanıcı talebi)

Talep: D1 limitini dolduran ajanlar geçici olarak çalışmasın; alternatif yöntemler değerlendirilsin; sorun şimdi çözülsün.

Hemen yapılanlar:
- 20 zamanlanmış GitHub ajanı devre dışı bırakıldı (geri alınabilir). Aralarında 15 dakikada bir video işleme ve izleyici, 30 dakikada bir API sağlık kontrolü ve haftalık yük testi var.

PR #305 ile yapılanlar:
- `SCHEDULED_JOBS_PAUSED="true"`: üç worker'ın 15 dakikalık zamanlanmış işleri veritabanına dokunmadan dönüyor.
- Üretimde soru ajanı, soru üretimi ve video işleme kapalı.
- Dağıtım 03:00'ten sonra onaylanmalı.

Kullanıcının hemen yapabileceği (dağıtım beklemeden): Cloudflare panelinde üç worker'ın Cron Trigger'larını silmek.

Canlıya geçince yeniden açma planı:
- Yalnız gerekli işler (planlı sonuç/video yayını) açılacak, saatlik çalışacak.
- Ağır taramalar "iş var mı" kontrolüyle tetiklenecek.
- Ajanlar tek tek ve ölçülerek açılacak.

### Kullanıcı notu — 22 Ekim 17:28

Sıradaki işlere devam edilecek; diğer çalışmalar sistem tamamen bittikten sonra yapılacak. Kapasite sorusu (5 $'lık planda tıkanma olur mu; veli/öğrenci/öğretmen/kurum isteklerinin ertesi güne kalmaması) **K004 sistem check-up** olarak son test modülüne eklendi.

Ön bilgi (Cloudflare D1 fiyat sayfası, 22 Ekim):
- Workers Paid: aylık 25 milyar satır okuma ve 50 milyon satır yazma dahil.
- Aşımda okuma 1 milyon satır başına 0,001 $, yazma 1 milyon satır başına 1 $.
- Ücretli planda günlük kesinti yok; aşım faturalanıyor.

### A034 — Phobos optik tanımlama, 22 Ekim 17:30–

PR #304 (A033) merge edildi. PR #305 (D1 bütçesi) merge bekliyor.

Uçtan uca doğrulama (gerçek 129 FMT ve anonim TXT ile) temel işlerin doğru çalıştığını gösterdi:
- ekleme, FMT içe aktarma, örnek testi, yayın;
- yayındaki sürümün kilitlenmesi ve kopya sürüm;
- benzersiz kod;
- sürüm silme (dosyalarıyla) ve arşiv;
- kurum kapsamı ve merkezi optiklerin salt okunur olması.

PR #306 ile yapılanlar:
- Süper Admin kurum adına optik tanımlayabiliyor.
- Denetim kayıtları sahibi olan kurumla yazılıyor.
- Testler ve build PASS.

Kapanış için: dağıtım + canlıda elle kabul (K002).

### A035 — Deimos optik basma, 22 Ekim 17:45–

PR #306 (A034) merge edildi. #305 (D1 bütçesi) hâlâ merge bekliyor.

Bulgular:
1. Öğrencinin basılı kitapçığı her baskıda sınıf sırasından yeniden hesaplanıyordu. Ada göre sıralama ya da yeni öğrenci eklemek kitapçıkları değiştiriyordu.
2. Merkezi sınav kuruma atanmamış olsa da basılabiliyordu; çöp kutusundaki ve arşivlenmiş sınavlar da basılabiliyordu.

PR #307 ile yapılanlar:
- 0125 ile ilk basılan kitapçık saklanıyor; optikten okunan kitapçık önce geliyor; yeni öğrenciye sınıfta en az kullanılan kitapçık veriliyor.
- Yalnız kuruma ait ya da kuruma atanmış aktif sınavlar basılabiliyor.
- 253 dosya / 1.268 test, build PASS.

A017'deki Türkçe başlık sınırı A018'den beri çözülmüş (kodla doğrulandı).

Kapanış için: fiziksel yazıcı kalibrasyonu ve basılı formun okunması elle (K002).

### A036 — telefon optik okuması, 22 Ekim 18:00–

PR #307 (A035) merge edildi. #305 (D1 bütçesi) hâlâ merge bekliyor.

Bulgu: çift ya da soluk işaret boş sayılıyordu. Kâğıtta görülen cevabı girmenin yolu yoktu; yalnız "bu şekilde kabul et" seçeneği vardı.

PR #308 ile yapılanlar:
- Soru bazında cevap düzeltme eklendi (şık sınırı, denetim kaydı, değerlendirilmiş kayıtta kilit).
- Kontrol ekranında A–E / Boş düğmeleri var.
- 254 dosya / 1.269 test, build PASS.

Kapanış için: gerçek basılı optiğin telefonla okunması elle (K002). Sentetik test kanıt sayılmaz.

### A084 — deneme optiği kamera → TXT, 22 Ekim 18:35–

Kullanıcı kararı (18:32): merge işlemlerini artık Claude yapacak; her işe geçişte bilgi verilecek ve kalan işler sıralanacak. #305 ve #309 Claude tarafından merge edildi. CI'daki "Result Provider Isolation Probe" bütün PR'larda başarısız: canlı sağlayıcıyı yokluyor ve D1 limiti nedeniyle şu an canlı yanıt vermiyor. Bu, kod kaynaklı değil.

PR #309 ile yapılanlar:
- Kamera toplu kaydı bağlı optiğin sabit sütunlu TXT'si olarak indiriliyor. Form numarası yerinde; belirsiz işaret onaylanmadan indirilemiyor.
- Gidiş-dönüş kanıtı:
  - kamera değerlendirmesi ile aynı TXT'nin normal yükleme ve değerlendirmesi birebir aynı sonucu veriyor;
  - gerçek 129 kayıtları yazılıp yeniden okununca aynı çıkıyor.
- Sayfa sabitlenince otomatik çekim: dört köşe, üç sabit kare; her sayfa bir kez okunuyor.
- 257 dosya / 1.278 test, build PASS.

Kapanış için: gerçek basılı deneme optiğinin telefonla okunması elle (K002). Optiğin Phobos'ta kamera geometrisi tanımlı olmalı.

### A037 — ortak yazılı resmî senaryo girişi, 22 Ekim (19:15'ten önce bitti)

Durum: KOD TAMAM, merge edildi (PR #310, `4b18489`). Canlıda doğrulama dağıtımdan sonra (K002).

Dayanak: MEB duyurusu "Birinci dönem ortak yazılı sınavlarının konu-soru dağılım tabloları yayımlandı" (2026-2027). Listelenen dersler için tabloyu ÖDSGM hazırlar, diğerleri için il zümreleri. Her tabloda birden çok senaryo vardır ve okul zümresi birini seçer.

Yapılanlar:
- Migration 0126 ile dört yeni tablo: dağılım tablosu, senaryo, satır, okulun seçimi.
- Giriş sırasında doğrulananlar:
  - eğitim yılı, dönem (1–2), sınav (1–3), sınıf ve ders;
  - kapsam: ÖDSGM ülke geneli, il zümresi için il zorunlu, okul zümresi bir okula bağlı;
  - kaynak bağlantısı https olmalı;
  - satır başına 1–20 soru, senaryo toplamı en çok 50.
- Resmî doğrulamayı yalnız Süper Admin yapar. Şartlar:
  - kaynak meb.gov.tr üzerinde olmalı (il zümresi için *.meb.gov.tr);
  - kaynağın eğitim yılı tablonun yılıyla aynı olmalı;
  - tüm kazanım kodları o yılın doğrulanmış programında bulunmalı.
  Doğrulanan tablo kilitlenir; değişiklik için yeni tablo girilir, eskisi arşivlenir.
- **2027–2028:** bu yılın belgesi yayımlanmadığı için 2027–2028 tablosu taslak kalır, okullara görünmez ve seçilemez (testle kanıtlı).
- Okul yöneticisi kendi zümre tablosunu girebilir; bu tablo resmî sayılmaz. Senaryoyu okul yöneticisi seçer.
- İl tablosunu yalnız o ilin okulları görür. Öğretmen yalnız okur. Öğrenci ve veli erişemez.
- Her işlem denetim kaydına yazılır.
- Sayfa: `/written-scenarios`, menüde "Ortak Yazılı Senaryoları".

Testin bulduğu hata: tablo düzenlenince okulun seçimi silinmiş senaryoya bağlı kalıyordu (FK hatası). Düzeltildi.

Kanıt:
- `tests/a037-written-scenarios.test.ts`: 5 test, gerçek şema, production giriş zinciri.
- Mutasyon kontrolü: aynı yıl kuralı kaldırılınca 2 test düştü.
- Tam paket 258 dosya / 1.283 test geçti, build geçti.

Sınır: tablo satırları resmî belgeden elle girilir. Otomatik PDF aktarımı onaysız eklenmedi.

Sonraki iş: A038.

### A038 — açık uçlu soru üretimi, 22 Ekim (19:15 sonrası)

Durum: KOD TAMAM, merge edildi (PR #311, `eb0e839`). Canlıda üretim, ajanlar yeniden açılınca ve dağıtımdan sonra denenecek (şu an D1 bütçesi nedeniyle kapalı; K002).

Yapılanlar:
- Migration 0127 ile açık uçlu ve kısa cevaplı üretim işleri, soru başına analitik rubrik ve `question_bank.written_format` eklendi.
- Paket: soru, model cevap ve puanları soru puanına tam eşit rubrik (1–6 ölçüt; kısa cevaplıda 1–3). Seçenek, harf cevap ya da çoktan seçmeli görünümlü soru gelirse çıktı reddedilir.
- Bağımsız kontrol:
  - üreticiden farklı bir model her taslağı kendisi çözer;
  - aynı model denetçi olarak kullanılamaz;
  - kontrol reddederse ya da yanıt vermezse hiçbir şey kaydedilmez ve gerekçe denetim kaydına yazılır.
- Kayıt tek toplu yazımla yapılır; paket eksik kalırsa tetikleyici bütün yazımı geri alır. İptal edilen iş hiçbir şey yazmaz. En çok 3 deneme yapılır.
- Kazanım o yılın doğrulanmış programında değilse istek açılmaz. 2027–2028 programı doğrulanmadığı için o yıl için üretim yapılamaz.
- Yalnız Süper Admin elle başlatır; otonom açık uçlu üretim açılmadı (politika gereği).
- Taslaklar AI_GENERATED / REVIEW / RESTRICTED olarak kalır. AI açık uçlu onayı, rubrik kontrol kutusu işaretlenmeden reddedilir.
- Çoktan seçmeli otomatik notlandırmaya karışmama:
  - pratik, koç ve deneme stüdyosu zaten yalnız çoktan seçmeli soru alıyordu;
  - kişisel kitap (öğretmen ve öğrenci) ve sıfır hata kitapçığı seçimlerinde bu filtre yoktu, eklendi.
- Arayüz: inceleme ekranı rubriği ve rubrik onay kutusunu gösteriyor; Soru Havuzu Ekibi sayfasına üretim paneli eklendi.

Kanıt:
- `tests/a038-open-ended-generation.test.ts`: 5 test, gerçek şema, production giriş zinciri, sahte modeller.
- İlk yazımda pratik kontrolü boşa geçiyordu (imzalama anahtarı yoktu, uç 503 dönüyordu). Düzeltildi: çoktan seçmeli kontrol sorusu servis ediliyor, açık uçlu soru edilmiyor.
- Mutasyon kontrolü: aşağıdaki 5 değişikliğin her biri testlerce yakalandı:
  - rubrik kontrolünü kaldırmak;
  - aynı model engelini kaldırmak;
  - denetçi kararını yok saymak;
  - öğrenci kitap filtresini kaldırmak;
  - çoktan seçmeli biçim kontrolünü kaldırmak.
- Tam paket 259 dosya / 1.288 test geçti, build geçti.

Sonraki iş: A039.

### A039 — analitik rubrik kaydı, 22 Ekim (A038'den sonra)

Durum: KOD TAMAM, merge edildi (PR #312). Canlı doğrulama dağıtımdan sonra (K002).

Yapılanlar:
- Migration 0128: sürümlü rubrik. Her sürümde ölçütler, kısmi puan düzeyleri (0 ve tam puan zorunlu) ve kabul edilen alternatif çözümler var. Sürüm platforma ya da bir okula ait olabilir.
- Toplamlar tutar:
  - ölçüt puanlarının toplamı rubriğin toplam puanına eşit olmalı;
  - üretimden gelen soruda toplam, soru puanına da eşit olmalı;
  - kısmi puanlar 0 ile ölçüt puanı arasında tam sayı olmalı.
- A038'in AI rubriği soru için v1 taslak olur. Taslak notlandırmada kullanılmaz.
- Öğretmen onayı zorunlu:
  - branş öğretmeni kendi okulu için, Süper Admin platform geneli için onaylar;
  - onay kutusu açıkça işaretlenmeli ve soru içerik/telif onayından geçmiş olmalı;
  - onay sırasında kayıtlı sürüm yeniden denetlenir, ayrıca veritabanı tetikleyicisi tutarsız sürümü reddeder.
- Onaylı sürüm veritabanı tetikleyicileriyle kilitlidir; düzeltme yeni sürümle yapılır.
- Bir okulun sürümünü başka okul görmez. Notlandırma için geçerli sürüm seçilirken önce okul onayına, sonra platform onayına bakılır.
- Sayfa: `/written-rubrics` (Süper Admin ve branş öğretmeni).

Kanıt:
- `tests/a039-analytic-rubrics.test.ts` (3 test) ve ortak yardımcı `tests/helpers/written-item.ts` (A040/A041'de de kullanılacak).
- Mutasyon kontrolü: branş kontrolü, toplam kontrolü, onaysız sorunun görünmesi ve okul sürümünün sızması testlerce yakalandı. Tutarlılık iki katmanlı olduğu için tek katmanı kaldırmak testi düşürmüyor; ikisi birlikte kaldırılınca düşüyor.
- Tam paket 260 dosya / 1.291 test geçti, build geçti.

Sonraki iş: A040.

### A040 — yazılı sınav kâğıdı, 22 Ekim (20:19'da merge edildi)

Durum: KOD TAMAM, merge edildi (PR #313). Canlı doğrulama ve gerçek kâğıt baskısı dağıtımdan sonra (K002).

Yapılanlar:
- Migration 0129: yazılı kâğıdı ve kâğıt maddeleri. Kesinleşen kâğıt kilitlenir. Kesinleştirmede veritabanı tetikleyicisi şunları yeniden denetler:
  - satır başına soru sayıları;
  - toplamın 100 olması;
  - sabitlenen rubriklerin onaylı olması;
  - zümre kuralı.
- Dağılım: okulun zümre kararıyla seçtiği senaryodan (A037) yapılır.
  - Satırda kazanım kodu varsa yalnız o kazanımın soruları alınır.
  - Yalnız okul için onaylı rubriği (A039) olan onaylı yazılı sorular kullanılabilir.
  - Zümre soruları kâğıdın içinde yazılır; çoktan seçmeli biçimde ya da tutarsız rubrikle yazılamaz.
  - "Otomatik doldur" boş yerleri uygun sorularla doldurur.
- Zümre kuralı yalnız politika dosyasındaki doğrulanmış kapsamda uygulanır: 2026-2027, ÖDSGM, 5–7 ve 9–11. sınıfların listelenen dersleri için tam 2 zümre sorusu. Doğrulanmamış yıl ve kapsamda (ör. 2027-2028) kural zorunlu değildir, yalnız uyarı gösterilir.
- Okul senaryo seçimini değiştirirse bitmemiş kâğıt kesinleştirilemez; yeniden kurulması gerekir.
- Kesinleştirmeyi öğretmen ya da okul yöneticisi, açık onay kutusuyla yapar. O anda geçerli rubrik sürümleri kâğıda sabitlenir; sonradan onaylanan yeni rubrik sürümü kâğıdı değiştirmez.
- Kâğıt ve cevap anahtarı yalnız kesinleşince yazdırılabilir HTML olarak açılır.
  - Kâğıtta model cevap yer almaz.
  - Anahtarda model cevap, kısmi puan düzeyleri, alternatif çözümler ve sabitlenen rubrik sürümü yer alır.
  - Öğrenci ve veli bu bölüme erişemez. Kâğıdın ve anahtarın her açılışı denetim kaydına yazılır.
- Kullanıcıya bildirilen karar: soru puanı öğretmenin kararıdır (politikada pointsSetByTeacher). Bu yüzden A039'daki "rubrik toplamı üretimdeki soru puanına eşit olmalı" kısıtı kaldırıldı; kâğıt toplamı 100 olmalıdır.
- Sayfa: `/written-papers`.

Kanıt:
- `tests/a040-written-paper.test.ts` (3 test).
- Mutasyon kontrolü: aşağıdaki 7 değişikliğin her biri testlerce yakalandı:
  - kazanım filtresini kaldırmak;
  - zümre kuralını kaldırmak;
  - 100 toplam kontrolünü kaldırmak;
  - senaryo değişikliğini yok saymak;
  - kesinleşmeden basmaya izin vermek;
  - doğrulanmamış yıla kuralı dayatmak;
  - rubrik onayını gerektirmemek.
- Tam paket 261 dosya / 1.294 test geçti, build geçti.

Sınır: Word/PDF dosyası yerine tarayıcıdan yazdırılan sayfa üretildi; PDF/Word aktarımı onaysız eklenmedi.

Sonraki iş: A041.

> Düzeltme (22 Ekim 20:20): A037–A040 başlıklarındaki saat aralıkları saate bakılmadan yazılmıştı ve yanlıştı (ör. "21:40"). Gerçek saat bilinmediği için kesin aralıklar kaldırıldı.

### A041 — yazılı öğretmen puanlaması, 22 Ekim (A040'tan sonra)

Durum: KOD TAMAM, merge edildi (PR #314). Canlı doğrulama dağıtımdan sonra (K002).

Yapılanlar:
- Migration 0130 üç kayıt ekledi:
  - puan sürümleri: yalnız eklenir, değiştirilemez ve silinemez;
  - AI önerileri: puanlardan ayrı tutulur;
  - not kesinleştirmeleri: sürümlüdür.
- Öğretmen her ölçüt için, kâğıda sabitlenen rubrikteki (A040) kısmi puan düzeylerinden birini seçer; soru puanı bunların toplamıdır. Puan soru puanını aşamaz.
- İlk sürümden sonra her düzeltme gerekçe ister. Bu kural hem API'de hem veritabanında uygulanır.
- AI tek başına kesin not vermez:
  - öneri yalnız yazıya dökülmüş cevaptan alınır ve ayrı saklanır; puan sayılmaz;
  - rubrik düzeylerine uymayan öneri atılır;
  - öğretmen öneriye bakıp kendi puanını girer ve kayıt öneriye bağlanır;
  - veritabanı puanlayanı yalnız TEACHER ya da SUPER_ADMIN olarak kabul eder;
  - AI kapalıyken öneri istenemez.
- Not öğretmenin açık kesinleştirmesiyle oluşur ve sürümlüdür. Notun toplamı son insan puanlarının toplamına eşit olmalı ve her soru puanlanmış olmalıdır (veritabanı tetikleyicisi). Kesinleşmiş notun değişmesi gerekçe ister. Arada yapılan düzeltme ekranda "değişti, yeniden kesinleştirin" olarak görünür.
- Puanlamayı yalnız branş öğretmeni ve Süper Admin yapar; yalnız o okulun o sınıf düzeyindeki etkin öğrencileri puanlanabilir.
- Arayüz: yazılı kâğıdı ekranında puanlama paneli (geçmiş, AI önerisi, kesinleştirme).

Kanıt:
- `tests/a041-written-grading.test.ts` (3 test).
- Yakalanan mutasyonlar: gerekçe kontrolü, düzey kontrolü, kesinleşmiş notun gerekçesi ve AI önerisinin puan sayılması.
- Hayatta kalan iki mutasyon gerekçeli:
  - API'deki tamlık kontrolü kaldırılınca veritabanı aynı hatayı verdiği için test geçiyor;
  - erişim satırı gereksiz, çünkü branş sorgusu zaten kâğıdın okuluna bağlı.
- Testlerde bulunan ve düzeltilen boşluk: "AI kapalı" durumu, yardımcı AI'yı açtığı için hiç sınanmıyordu.
- Tam paket 262 dosya / 1.297 test geçti, build geçti.

Sınır: Notlar öğrenciye ve veliye yayımlanmıyor, e-Okul'a otomatik gönderim yok (politika: automaticEokulSubmission false). El yazısının kamerayla okunması A085'te.

Sonraki iş: A085.

### A085 — açık uçlu cevapların kamerayla okunup değerlendirilmesi, 22 Ekim (A041'den sonra)

Durum: KOD TAMAM, merge edildi (PR #315). **Fiziksel kabul BEKLİYOR (K002):** gerçek basılı kâğıdın telefonla okunması ve gerçek el yazısında AI kalitesi ölçülmedi. Testlerdeki AI modeli sahtedir. Görüntü modelinin Türkçe el yazısındaki başarısı bilinmiyor; canlıda öğretmen–AI uyumu ölçülerek görülecek.

Yapılanlar:
- **Kamera cevap kâğıdı.** ANUNEX kamera standardına uyar: 4 düz köşe karesi sayfa içinde, yön noktası, en az 4 mm baloncuk.
  - Her sayfada öğrenci numarası ızgarası ve basılı sayfa kodu var.
  - Her soruda çerçeveli cevap alanı ve öğretmen puan kutusu var.
  - Tam sayı cevaplı sorularda rakam baloncuk ızgarası var; ızgara en az 4 hanelidir, böylece cevabın uzunluğunu ele vermez.
  - Kâğıt düzeni ilk kullanımda sabitlenir ve değiştirilemez (migration 0131).
- **Telefonda okuma.** Tarayıcıda, mevcut OMR motoruyla yapılır:
  - perspektif düzeltilir;
  - sayfa, öğrenci numarası ve rakamlar okunur;
  - cevap kutuları düz görüntü olarak kırpılır.
  Çift işaret ya da araya giren boşluk sayıya çevrilmez. Köşe görünmüyorsa hiçbir şey okunmaz. Okunan numara eşleşmezse öğretmen öğrenciyi elle seçer.
- **Sunucu.**
  - Kırpılan görüntüler R2'de öğrenciye bağlı saklanır; görüntü boyutu ve türü denetlenir.
  - Rakam ızgarası AI kullanmadan kesin öneri üretir: okunan sayı model cevaba ya da kabul edilen alternatife eşitse tam puan önerilir.
  - Serbest yazıda görüntü modeli (`WRITTEN_VISION_MODEL`, varsayılan `@cf/meta/llama-4-scout-17b-16e-instruct`) yazıyı metne çevirir, rubrik düzeyine göre puan önerir, gerekçe ve güven değeri verir. Okunamayan yazı ILLEGIBLE, düşük güven (0,6'nın altı) LOW_CONFIDENCE olarak işaretlenir. Rubriğe uymayan AI çıktısı atılır.
  - Öneri puan sayılmaz (A041); öğretmen fotoğrafa bakarak puanı girer.
- **Öğretmen–AI uyumu.** Aynı puan oranı, ortalama fark ve kaynağa göre (rakam ızgarası / el yazısı AI) dağılım puanlama ekranında gösterilir.
- **A039 düzeltmesi.** Kısa sayısal alternatif cevaplar (ör. "40") artık kabul ediliyor; eskiden en az 3 karakter isteniyordu.

Kanıt:
- `tests/a085-written-camera-reader.test.ts`: yamuk sentetik "telefon fotoğrafından" sayfa, numara, rakam ve kırpım okunuyor; çift işaret ve kesik köşe tahmin edilmiyor.
- `tests/a085-written-camera-e2e.test.ts`: düzen → fotoğraf → okuma → yükleme → rakam ve AI önerileri → öğretmen puanı → uyum, uçtan uca.
- Testlerde bulunan ve düzeltilen hatalar: "?" içeren rakam NaN dönüyordu; kısa alternatif cevap reddediliyordu; "AI kapalı" testi yanlışlıkla açık AI ile çalışıyordu.
- Mutasyon kontrolü: aşağıdaki 7 değişikliğin her biri testlerce yakalandı:
  - düşük güven işaretini kaldırmak;
  - öğrenciyi tahmin etmek;
  - rakamı her zaman doğru saymak;
  - AI çıktısında rubrik düzeyini denetlememek;
  - uyum oranını şişirmek;
  - çift işareti tahmin etmek;
  - görüntü boyutunu denetlememek.
  ("AI çıktısında rubrik düzeyini denetlememek" ilk turda yakalanmamıştı; bunun için test eklendi, sonra yakalandı. PR #315 açıklamasında "8 mutasyon" yazıyor; doğrusu 7.)
- Tam paket 264 dosya / 1.302 test geçti, build geçti.

Sonraki iş: A042.

### A042 — yazılı kazanım raporu, 22 Ekim (21:07'den sonra merge edildi)

Durum: KOD TAMAM, merge edildi (PR #316). Canlı doğrulama dağıtımdan sonra (K002).

Yapılanlar:
- Rapor ucu: `/api/written-papers/:id/report`. Öğrenci, şube ve sınıf düzeyinde kazanım bazlı puan/olası puan ve yüzde verir.
- Rapor yalnız kesinleşmiş notların kendi soru puanlarından hesaplanır; kesinleşmemiş sonraki düzeltme yansımaz. Notu kesinleşmemiş öğrenciler "bekleyen" olarak ayrı listelenir.
- Kazanım eşleşmesi:
  - banka sorusunda doğrulanmış soru-kazanım bağından yapılır;
  - zümre sorusunda senaryo satırının kazanım kodu kullanılır;
  - kodsuz satır "ünite · konu" başlığıyla gösterilir.
  - Birden çok kazanıma bağlı bir soru, her kazanımda tam puanla sayılır.
- Rapor puan ve yüzde verir; net hesaplanmaz. Deneme sonuç ve cevap tablolarına hiçbir şey yazılmaz (test sayımla doğrular).
- Güçlü (%70 ve üzeri) ve gelişecek (%50 altı) eşikleri ANUNEX önerisidir; resmî MEB düzeyi değildir ve ekranda böyle etiketlenir.
- Okul yöneticisi ve branş öğretmeni görür. Öğrenci ve veli göremez; yayımlama kararı verilmedi.
- Kâğıt ekranında rapor paneli eklendi.

Kanıt:
- `tests/a042-written-report.test.ts` ve ortak hazır kâğıt yardımcısı `finalWrittenPaper`.
- Mutasyon kontrolü: bekleyen öğrencileri yok saymak, herhangi bir öğretmene erişim vermek ve olası puanı yanlış hesaplamak testlerce yakalandı. "Kesinleşmemiş puanı kullanmak" ilk turda yakalanmamıştı; test sıkılaştırıldı, sonra yakalandı.
- Tam paket 265 dosya / 1.303 test geçti, build geçti.

Sonraki iş: A043.

### A043 — kurum kartı yönetimi, 22 Ekim

Durum: KOD TAMAM, merge edildi (PR #317). Canlı doğrulama dağıtımdan sonra (K002).

Yapılanlar:
- **Ekle:** mevcut kurum açma akışı kullanılıyor; aynı MEB koduyla ikinci kayıt 409 döner (testli).
- **Görüntüle:** yeni uç `GET /api/institutions/:id` kartı döner: durum, öğrenci (aktif/misafir) ve hesap sayıları, sezonlar, yaşam döngüsü geçmişi. Okul yöneticisi yalnız kendi kartını görür; Süper Admin hepsini görür.
- **Düzelt:** `PATCH /api/institutions/:id`, yalnız Süper Admin.
  - Kurum kodu değiştirilemez.
  - MEB kodu yalnız rakamdan oluşur (5–12 hane, mevcut kuralla aynı), MEB kaynağında zorunludur ve başka kurumda kayıtlı olamaz.
  - Değişiklikler önce/sonra değerleriyle denetim kaydına yazılır.
- **Pasifleştir:** A032b yaşam döngüsüyle yapılır. Testte öğrenci, kayıt ve katılım sayıları düzeltme ve pasifleştirmeden önce ve sonra aynı.
- **Arayüz:** Kurumlar ekranında her satırda "Kart" düğmesi ve kart penceresi.

Not: MEB kurum kodunun kaç haneli olduğuna dair resmî kaynak aramada bulunamadı. Bu yüzden hane kuralı sıkılaştırılmadı.

Kanıt:
- `tests/a043-institution-card.test.ts` (2 test).
- Mutasyon kontrolü: tekillik kontrolünü kaldırmak, görüntüleme kapsamını gevşetmek ve kurum kodunu değiştirilebilir yapmak testlerce yakalandı.
- Tam paket 266 dosya / 1.305 test geçti.

Sonraki iş: A044.

### A044 — zincir kurum kapsamı, 22 Ekim

Durum: KOD TAMAM, merge edildi (PR #318). Canlı doğrulama dağıtımdan sonra (K002).

Bulunan ve kapatılan güvenlik açıkları:
- Zincir dashboard'u, üye kurumun her kullanıcısına zincirdeki bütün kurumların tam satırlarını iletişim bilgileriyle döndürüyordu. Buna öğretmen, öğrenci ve veli de dahildi.
- Zincir yöneticisi istediği kurumu zincire ekleyerek görüş alanını genişletebiliyordu.

Yapılanlar:
- **Erişim:** Zincir görünümü yalnız Süper Admin'e ve aktif zincir rolü olan, merkezin ya da üye kurumun kurum yöneticisine açık.
  - Kurum zincirden çıkarılınca o kurumun yöneticisinin zincir erişimi de düşer.
  - Kurum listesinde iletişim bilgisi dönmez.
- **Üye ekleme ve çıkarma:** yalnız Süper Admin yapar; çıkarma ucu yeni eklendi.
- **Zincir rolü (yönetici / izleyici):** yalnız Süper Admin verir ve kaldırır; yalnız merkezin ya da üye kurumun kurum yöneticisine verilebilir. Öğretmene ya da dış kuruma rol verilemez.
- **Karşılaştırma:** okul okul katılımcı, ortalama puan ve ortalama net; dondurulmuş sonuçtan alınır. Yalnız üye kurumlar sayılır, zincir toplamı üyelerin toplamına eşittir, dış kurum karışmaz. Dondurulmamış sınavda karşılaştırma yapılmaz.
- Her değişiklik denetim kaydına yazılır. Enterprise ekranına zincir paneli eklendi.

Kanıt:
- `tests/a044-network-scope.test.ts`.
- Mutasyon kontrolü: aşağıdaki 4 değişikliğin her biri testlerce yakalandı:
  - zincir yöneticisinin görüş alanını genişletmesine izin vermek;
  - çıkarılan kurumun rolünü korumak;
  - iletişim bilgisini sızdırmak;
  - dış kurumu toplama katmak.
- Tam paket 267 dosya / 1.306 test geçti.

Sonraki iş: A045.

### A045 — öğrenci aktarımı, 22 Ekim

Durum: KOD TAMAM, merge edildi (PR #319). Canlı doğrulama dağıtımdan sonra (K002).

Bulunan ve kapatılan açık: önizlemede gönderilen eğitim yılı (`seasonId`) kuruma ait mi diye doğrulanmıyordu. Bu yüzden öğrenciler başka bir kurumun eğitim yılına kaydedilebiliyordu.

Yapılanlar:
- **Kurum dışı eğitim yılı:** başka kurumun eğitim yılı reddedilir.
- **Mükerrer kontrolü:**
  - dosya içinde aynı numara, ya da numarasız satırlarda aynı ad ve sınıf, kontrol gerektirir;
  - okulda zaten kayıtlı numara mevcut öğrenciyle eşleşir;
  - önizlemeden sonra başka öğrenciye verilmiş numara aktarımda ikinci kez kullanılmaz ve çakışma olarak raporlanır.
- **Sınıf düzeyi:** 1–12 dışındaysa satır kontrole düşer ve yeni öğrenci olarak eklenemez.
- **Satır çözümü:** kontrol gereken satırları bir kişi tek tek karara bağlar (yeni uç). Seçenekler:
  - eşle (yalnız aynı kurum ve eğitim yılındaki öğrenciyle);
  - yeni öğrenci;
  - atla.
  Her karar denetim kaydına yazılır.
- **Aktarım:** kontrol bekleyen satır varken başlamaz; her satır tek toplu yazımla yazılır; ikinci kez çalıştırılırsa hiçbir şey değişmez.
- **Arayüz:** Veri Transfer ekranına kontrol satırları paneli eklendi.

Kanıt:
- `tests/a045-student-import.test.ts` (2 test).
- Mutasyon kontrolü: aşağıdaki 4 değişikliğin her biri testlerce yakalandı:
  - başka kurumun eğitim yılını kabul etmek;
  - dosya içi mükerreri görmezden gelmek;
  - aktarımda numarayı yeniden denetlememek;
  - başka kurumun öğrencisiyle eşlemeye izin vermek.
- Tam paket 268 dosya / 1.308 test geçti.

Sonraki iş: A046.

### A046 — personel ve branş ataması, 22 Ekim

Durum: KOD TAMAM, merge edildi (PR #320). Canlı doğrulama dağıtımdan sonra (K002).

İnceleme sonucu: mevcut atama API'si büyük ölçüde sağlamdı. Şunlar zaten çalışıyordu:
- başka kurumun sınıfı ya da öğretmeni atanamıyor;
- branş atamasında ders zorunlu;
- mükerrer atama engelleniyor;
- atama kaldırma bir sonraki istekte uygulanıyor;
- hesap pasifleşince açık oturum kapanıyor.

Düzeltme: yetki kapsamı (`loadPermissionScope`) öğretmenin şu anki kurumuyla sınırlandı. Başka okula geçen öğretmenin eski okul atamaları artık sayılmıyor. Uç noktalar ayrıca kurum filtresi kullandığı için doğrudan bir sızıntı gözlenmedi; bu savunma amaçlı bir düzeltme.

Kanıt:
- `tests/a046-staff-assignments.test.ts` (2 test): atanan sınıf ve branş görünür; rehberlik sınıfı görünür; kaldırma anında etkilidir; pasif hesabın oturumu kapanır; kurumlar arası atama yapılamaz; taşınan öğretmen eski sınıfları göremez.
- Mutasyon kontrolü: kurum filtresini kaldırmak ve pasif atamayı saymak testlerce yakalandı.
- Eski 4 test dosyasındaki elle yazılmış şemalara `institution_id` sütunu eklendi.
- Not: PR ilk açıldığında bunlardan biri atlanmıştı ve tam paket kırmızıydı; merge'den önce düzeltildi.
- Tam paket 269 dosya / 1.310 test geçti.

Sonraki iş: A047.

### A047 — veli-öğrenci bağlantısı, 22 Ekim

Durum: KOD TAMAM, merge edildi (PR #321). Canlı doğrulama dağıtımdan sonra (K002).

Bulunan ve düzeltilen hata: telefonla girişte sorgu `LIMIT 1` ile ilk satırı alıyordu. Aynı telefon iki hesapta kayıtlıysa (ör. hem öğretmen hem veli olan biri), hangi hesaba girileceği sorgu sırasına kalıyordu. Artık:
- e-posta ya da kullanıcı adı tek bir hesabı tanımlar;
- telefonla girişte şifre karar verir;
- şifre birden fazla hesaba uyuyorsa giriş reddedilir ve kullanıcı adı istenir (PHONE_AMBIGUOUS).

İncelendi ve doğru bulundu:
- veli bağlantı sorguları `active=1` denetliyor;
- WhatsApp (Nibiru) eşleşmesi, oturum açmış kullanıcının ürettiği tek kullanımlık kodu istiyor; telefon tek başına yetki vermiyor;
- aktivasyon talepleri yalnız öğrenci için ve yönetici onaylı; telefonla bir yol açmıyor.

Kanıt:
- `tests/a047-parent-links.test.ts` (2 test). Doğrulananlar:
  - veli yalnız bağlı çocuğunu görür;
  - yeni bağlantı kurulunca çocuk görünür;
  - bağlantı kaldırılınca bir sonraki istekte liste, sonuç ve rapor erişimi kesilir;
  - telefon ve yanlış şifreyle giriş yapılamaz.
- Mutasyon kontrolü: aşağıdaki 3 değişikliğin her biri testlerce yakalandı:
  - belirsiz telefona izin vermek;
  - telefonda yalnız ilk satırı almak;
  - pasif bağlantıyı listelemek.
- Tam paket 270 dosya / 1.312 test geçti.

Sonraki iş: A048.

### A048 — yıllık koltuk lisansı kararı, 22 Ekim

Durum: **BEKLİYOR (kullanıcı kararı).** Bu satır kod işi değil, bir iş kararıdır. Kabul ölçütü "kabul edilmiş sözleşme kaydedilir" diyor. Sözleşmeyi Claude kabul edemez ve fiyat yazamaz; bu yüzden karar kullanıcıya soruldu.

Sistemde bugün olan:
- `institution_license_state`: eğitim yılına göre lisanslı öğrenci sınırı.
- `institution_licenses.plan_code`: TRIAL_7_DAY / ANNUAL / PILOT / CUSTOM.
- Kurum açılışında öğrenci lisans sınırı ve 7 günlük deneme.

Gerekenler:
1. Mevcut model ile yıllık koltuk modelinin karşılaştırmasının kullanıcıyla kararlaştırılması (fiyat sistemde gösterilmeyecek).
2. Kabul edilen sözleşme metninin ya da kararın kaydedilmesi.

Uygulama (kod) bu satırın kapsamında değil. Sıradaki iş A049.

### A049 — eğitim yılı geçişi, 22 Ekim

Durum: KOD TAMAM, merge edildi (PR #322). Canlı doğrulama dağıtımdan sonra (K002).

Doğrulamada bulunan ve düzeltilen hatalar:
- Geçişten sonra eski kayıt ACTIVE kalıyordu; öğrenci aynı anda iki sınıfta görünüyordu (ör. yazılı puanlamada hem 7. hem 8. sınıf listesinde).
- Ortaokulun 8. sınıf öğrencileri aynı kurumda "9. sınıfa" taşınıyordu; son sınıf kavramı yoktu.
- Yeni eğitim yılı serbest metindi; doğrulanmıyordu.
- Kaynak sezonun kuruma ait olup olmadığı açıkça denetlenmiyordu.

Yeni davranış:
- Kaynak sezon kurumun aktif sezonu olmalı ve yeni yıl tam olarak bir sonraki yıl olmalı.
- Kurumun son sınıfı açıkça seçilir; o sınıftaki öğrenciler mezun (GRADUATED) olur.
- Terfi eden öğrenci aynı kimlikle yeni sezonda bir üst sınıfa kaydolur, şubesi korunur; eski kaydı arşivlenir (ARCHIVED).
- Sınıfı belirsiz öğrenci tahmin edilmez: eski sezon o öğrenci yerleştirilene kadar açık kalır. Belirsiz öğrenci yoksa eski sezon kapanır (CLOSED). İkinci kez çalıştırılırsa reddedilir.
- Eski sonuçlar eski sezon ve sınıfında kalır; öğrenci eski sonucunu görmeye devam eder.
- Yeni sezona lisans kaydı açılmaz; bu ayrı kabul edilmiş kapsam gerektirir. Ekranda bu not gösterilir.

Kanıt:
- `tests/a049-season-rollover.test.ts` (3 test).
- Mutasyon kontrolü: aşağıdaki 4 değişikliğin her biri testlerce yakalandı:
  - mezuniyeti kaldırmak;
  - eski kaydı aktif bırakmak;
  - herhangi bir sonraki yılı kabul etmek;
  - belirsiz öğrenci varken eski sezonu kapatmak.
- Tam paket 271 dosya / 1.315 test geçti.

Sonraki iş: A050.

### A050 — öğrenci bireysel karnesi, 22 Ekim

Durum: KOD TAMAM, merge edildi (PR #323). PDF'in gerçek cihazda açılması K002'de kontrol edilecek.

İnceleme sonucu: öğrencinin "Bireysel gelişim karnem" görünümü zaten vardı. Mevcut olanlar:
- yalnız yayımlanmış sonuçlar (A030 filtresi);
- güçlü ve gelişecek kazanımlar;
- "Yazdır / PDF" düğmesi.

Eksik olan ve eklenen: dönem (eğitim yılı) seçimi.
- Dönem listesi öğrencinin kendi sınavlarından oluşur.
- Seçilen dönemin dışındaki sınav kimlikleri yok sayılır.
- Bilinmeyen bir dönem verilirse tüm dönemler gösterilir.
- Rapor ekranına dönem seçici eklendi.

Kanıt:
- `tests/a050-student-report-card.test.ts`. Doğrulananlar: iki dönem ayrı görünür; seçilen dönemde yalnız o dönemin sınavı gelir; güçlü ve gelişecek kazanımlar oluşur; yayımlanmamış sınav görünmez; başka öğrencinin karnesi 403 döner.
- Mutasyon kontrolü: dönemi yok saymak ve bilinmeyen dönemi kabul etmek testlerce yakalandı.
- Tam paket 272 dosya / 1.316 test geçti.

Sonraki iş: A051.

### A051 — branş öğretmeni karnesi, 22 Ekim

Durum: KOD TAMAM (doğrulama), merge edildi (PR #324). Kod değişikliği gerekmedi.

Uçtan uca testle doğrulananlar:
- Türkçe öğretmeni yalnız Türkçeyi, matematik öğretmeni yalnız matematiği görür.
- Branş öğretmeni toplam net, puan ve sıralamayı göremez; başka dersin kazanım kodları yanıtta hiç geçmez.
- Rehber öğretmen sınıfının tüm derslerini görür.
- Başka şubenin öğretmeni ve ataması olmayan öğretmen 403 alır; öğrenci listesinde de sınıf dışı öğrenci yer almaz.
- Atama kaldırılınca rapor bir sonraki istekte 403 döner.
- Donmuş sınav raporu da branşla kısıtlıdır.

Kanıt:
- `tests/a051-teacher-report.test.ts` (2 test).
- Mutasyon kontrolü: branş filtresini düşürmek ve her öğretmene tam erişim vermek testlerce yakalandı.
- Tam paket 273 dosya / 1.318 test geçti.

Sonraki iş: A052.

### A052 — kurum/zincir karnesi, 22 Ekim

Durum: KOD TAMAM, merge edildi (PR #325).

Doğrulananlar:
- Kurum karnesinde sınıf gruplarının katılımcı toplamı, kurumun yayımlanmış anlık görüntüsüne eşit.
- Ağırlıklı ortalama net, kurumun ortalamasına eşit.
- Aynı sınavın zincir karşılaştırmasındaki okul satırı da aynı katılımcı sayısını ve aynı ortalamayı veriyor.
- Kurum karnesini yalnız okul yöneticisi ve Süper Admin okur.
- Geçersiz dönem 400 döner; yayımlanmamış sürüm özetlenmez.

Düzeltme: zincir karşılaştırması (A044) yalnız dondurulmuş sonucu da kabul ediyordu. Bu durumda zincir merkezi bir okulun sonucunu, okul yöneticisi kendi karnesinde göremeden görebiliyordu. Artık iki taraf da yalnız yayımlanmış veriyi kullanıyor; A044 testi buna göre güncellendi.

Kanıt:
- `tests/a052-institution-network-report.test.ts` (2 test).
- Mutasyon kontrolü: dondurulmuş sonuca yeniden izin vermek testlerce yakalandı.
- Tam paket 274 dosya / 1.320 test geçti.

Sonraki iş: A053.

### A053 — rehberlik karnesi, 23 Ekim 00:02

Durum: KOD TAMAM, merge edildi (PR #326).

Doğrulananlar:
- Rehber öğretmen yalnız atandığı sınıfların öğrencilerini görür. Görünenler: incelenmiş rehberlik sinyalleri, yayımlanmış deneme netleri, destek planı durumu ve özel kayıtların yalnız sayısı. Diğer sınıfın ve diğer okulun rehber öğretmeni bu öğrencileri görmez.
- Özel rehberlik kayıtları ayrı bir tabloda tutulur (migration 0132). Kayıtlar yalnız eklenebilir; değiştirme ve silme tetikleyiciyle engellenir.
- Özel kayıtları yalnız sınıfın rehber öğretmeni ve Süper Admin okur. Her okuma denetim kaydına yazılır. Süper Admin kayıt yazamaz.
- Branş öğretmeni, müdür, öğrenci ve veli özel kayıtları göremez (403). Karne yanıtında kaydın metni geçmez.
- Destek planını rehber öğretmen yazar; her kayıtta sürüm artar.
- Öğrenci ve veli planı yalnız paylaşıldığında görür. Paylaşım geri alınınca erişim de kapanır.
- Dondurulmuş ama yayımlanmamış deneme sonucu karnede görünmez.
- Öğrenciye giden mevcut not alanının adı "Öğrenciye görünen geri bildirim" oldu, böylece özel notla karışmaz.

Kanıt:
- `tests/a053-guidance-report.test.ts` (3 test).
- 9 mutasyon denendi, hepsi testlerce yakalandı.
- Tam paket 275 dosya / 1.323 test geçti; build temiz.

Dürüst not: mutasyonların ilk turu, test kurulumu hatalıyken koştu (sonuç anlık görüntüsü yoktu). Kurulum düzeltildi, hepsi yeniden koşturuldu. Yayımlanma kapısı mutasyonu ilk denemede kaldı, çünkü tek koşul kaldırılmıştı ve ikinci koşul aynı işi görüyordu. İki koşul birlikte kaldırılınca ve "dondurulmuş da sayılsın" mutasyonu denenince ikisi de yakalandı.

Sınır: planın veli tarafı API'de hazır, ama veli ana sayfasında ayrı bir kart yok. Canlı el testi K002'de yapılacak.

Sonraki iş: A054.

### A054 — seçilebilir birleşik karne, 23 Ekim 00:16

Durum: KOD TAMAM, merge edildi (PR #327).

İncelemede zaten çalışan kurallar:
- Birleşik karne yalnız dondurulmuş veya yayımlanmış kanıtı birleştiriyor.
- Eski ve bağlamsız kayıtlar kapsam dışında tutuluyor.
- Mini oyun puanı doğruluğa katılmıyor.
- Farklı program sürümleri ayrı gösteriliyor.

Bulunan eksik 1: tekrar kuralı raporda açık değildi.
- Düzeltme: her birleşik raporda `repeatPolicies` alanı eklendi. Bu alan her kaynak için ölçüyü, kuralı ve bir açıklamayı verir.
- Kaynaklara göre kurallar:
  - Sınav: yayımlanmış sonuç, sınav başına bir kez sayılır.
  - Soru pratiği: seçilen ilk ya da son çözüm sayılır.
  - Mini test: yalnız yeni soru mini testleri sayılır.
  - Föy: ilk gönderim sayılır.
  - Mini oyun: doğruluğa katılmaz; her oturum ayrı gösterilir.
- Kurallar iki rapor ekranında da gösteriliyor.

Bulunan eksik 2: föy kanıtı güvenilir değildi.
- Sorun: `/api/platform/foy/attempts` aynı föyün yeniden gönderilmesine izin veriyordu. Yeni gönderim, dondurulmuş cevap kanıtını sessizce silip yeniden yazıyordu.
- Düzeltme: föyün ilk gönderimi kanıt olarak kalır. Yeniden gönderim 409 `FOY_ALREADY_SUBMITTED` döner. Deneme kayıtları (assignment_attempts) ayrıca tutulmaya devam eder.
- Not: bu uç şu an arayüzden çağrılmıyor. Föyün öğrenciye ulaşması A057'nin işi.

Kanıt:
- `tests/a054-combined-report.test.ts` (2 test). Föy testi gerçek şema ve production girişiyle çalışıyor.
- 5 mutasyon denendi, hepsi yakalandı.
- Tam paket 276 dosya / 1.325 test geçti.

Karar notu: föy için "ilk gönderim sayılır" kuralını ben seçtim. Optik yüklemedeki "gerekçeyle değiştir" akışı gibi bir yeniden gönderim isterseniz, bu kural değiştirilebilir.

Sonraki iş: A055.

### A055 — Maarif süreç gözlemi, 23 Ekim 00:29

Durum: KOD TAMAM, merge edildi (PR #328).

İncelemede zaten tamam olanlar (75 mevcut test kapsıyor):
- Süreç bileşeni, doğrulanmış resmî öğrenme çıktısına bağlı.
- Rubrikler sürümlü ve değiştirilemez.
- Gözlem kaydedildiği anda rubrik dondurulur ve kayıt bir daha değiştirilemez.
- Gözlemi yalnız ilgili branş öğretmeni yazar.
- Geri çekme ayrı bir kayıt olarak tutulur; asıl gözlem silinmez.
- Toplu rapor "resmî beceri puanı değildir" diyor.

Eksik olan: tek öğrenci görünümünde ve iki CSV dışa aktarımında gözlenen düzey, kesin bir hüküm gibi duruyordu.

Düzeltmeler:
- API'ye `interpretation` alanı eklendi: "öğretmen gözlemi; kesin yeterlik hükmü değil".
- Her gözleme `verifiedOfficialRubric` alanı eklendi.
- Ekranda açıklama kutusu var. Öğretmen tasarımı rubrik "resmî kaynakla doğrulanmamış" diye yazılıyor.
- İki CSV'ye "Niteliği" sütunu eklendi.

Kanıt:
- `tests/a055-process-observation.test.ts`; özel dışa aktarım testine de yeni bir kontrol eklendi.
- 5 mutasyon denendi, hepsi yakalandı.
- Tam paket: 277 dosya, 1.326 test geçti.

Sınır: canlı el testi K002'de yapılacak.

Sonraki iş: A056.

### A056 — özel rapor indirmesi, 23 Ekim 00:50

Durum: KOD TAMAM, merge edildi (PR #329).

İncelemede zaten testli olanlar (rubrik CSV çıktısı ve sınıf/kurum arka plan raporu):
- Rapor yalnız sahibine açılıyor.
- İndirme anında güncel yetki ve kaynak sürümü yeniden kontrol ediliyor.
- Rapor 24 saat sonra kapanıyor (410).
- Dosyalar küçük partiler halinde temizleniyor.
- Kira mekanizması ve yeniden deneme çift kayıt üretmiyor.

Eksik olan: iptal yoktu.

Eklenenler:
- `POST …/:id/cancel` ucu iki rapor türü için de eklendi. Yalnız raporun sahibi iptal edebilir ve istek yalnız ANUNEX'in kendi sayfasından gelebilir.
- İptal edilen iş REVOKED + CANCELLED_BY_USER olarak işaretleniyor; süresi hemen doluyor. Şema değişmedi.
- İptalden sonra:
  - İndirme 410 dönüyor ve depoya hiç dokunulmuyor.
  - Kuyruktaki iş işlenmiyor.
  - O sırada çalışan işçi, yazdığı parçayı kaydedemiyor ve siliyor.
  - Kalan dosyalar mevcut süre sonu temizliğiyle siliniyor.
- Arayüzdeki iki panele, onay soran bir "İptal et" düğmesi eklendi.

Kanıt:
- Rapor testlerine 3 yeni test eklendi.
- 9 mutasyonun 8'i yakalandı. Yakalanmayan, "kirayı temizleme" mutasyonu. Kayıt koşulundaki süre kontrolü aynı işi gördüğü için bu değişiklik etkisiz kalıyor; kira temizliği yedek bir savunma.
- Tam paket 277 dosya / 1.329 test geçti.

Not: bu iki raporda arka plan PDF çıktısı yok. Sonuç PDF'leri ayrı bir akış (result artifacts); onların kendi saklama ve temizlik testleri var.

Sonraki iş: A057.

### A057 — 32 haftalık föy yayını, 23 Ekim 01:00

Durum: **BEKLİYOR**. Bu iş içerik ve ürün kararı gerektiriyor.

İncelemede bulunanlar:
- Yazılım tarafında temel parçalar var:
  - föy tablosu: yıl, program, sınıf, sayısal/sözel, sıra no, PDF ve cevap anahtarı dosyası;
  - kazanım ve soru bağlantıları;
  - Süper Admin föy yönetimi ve slot üretimi;
  - sınıf bazlı hafta takvimi;
  - yıllık içerik planı (hafta × ders × kazanım).
- Öğrencinin bugün ne gördüğü:
  - Sınıf düzeyindeki **bütün yayımlanmış** föyleri görüyor. Takvimde haftası gelmemiş föyler de buna dahil.
  - Cevap anahtarı dosyası da aynı ekranda listeleniyor.
- Föy cevaplarını çevrimiçi gönderme ucu (`/api/platform/foy/attempts`) arayüzden çağrılmıyor. Çevrimiçi çözme ekranı A060'ın işi.
- Canlı veritabanında kaç föy olduğunu sayamadım. D1 ücretsiz günlük okuma kotası doldu; sayaç 03:00'te (TR) sıfırlanıyor.

Kullanıcıya sorulanlar:
1. Öncelikli sınıf hangisi?
2. Föy PDF'leri hazır mı? Sisteme yükleme için onay var mı? (PDF içe aktarma onaysız yapılmaz.)
3. Öğrenci föyü ne zaman görsün: takvimde haftası gelince mi, yoksa yayımlanan bütün seriyi mi?
4. Cevap anahtarı öğrenciye ne zaman açılsın?

Sonraki iş: A058 (A057 cevap bekliyor).

### A058 — kişiye özel kitap, 23 Ekim 01:07

Durum: KOD TAMAM, merge edildi (PR #330).

Bulunan sorunlar ve düzeltmeler:
- Eksik kazanımlar yayımlanmamış sınav sonuçlarından da geliyordu. Artık yalnız öğrenciye açılmış sonuçlar kullanılıyor.
- Sorular konu adının metniyle seçiliyordu ve konu boşsa her soru eşleşiyordu. Artık soru kazanım bağlantısıyla seçiliyor ve aynı soru iki kez girmiyor.
- PDF yoktu. Artık Studio baskı motoruyla PDF alınabiliyor:
  - kazanım başlıkları ve iki sütun düzeni var,
  - cevap anahtarı son sayfada,
  - basım anında onay ve telif yeniden kontrol ediliyor,
  - PDF'i yalnız kitabın sahibi indirebiliyor.

Kanıt:
- `tests/a058-personal-book.test.ts`
- 7 mutasyonun hepsi yakalandı. Biri ilk turda kaçtı; bunun için "başka öğrenci indiremez" testi eklendi.
- Tam paket: 278 dosya / 1.330 test geçti.

### A059 — sıfır hata kitapçığı, 23 Ekim 01:23

Durum: KOD TAMAM, merge edildi (PR #331).

Bulunan sorunlar ve düzeltmeler:
- Yayımlanmamış bir sınavdan kitapçık oluşturulabiliyordu; bu, sonuç açılmadan yanlışların görülmesi demekti. Artık sonuç yayımlanmadan istek 409 ile reddediliyor.
- Birden çok kazanıma bağlı bir soru kitapçığa birden çok kez giriyordu. Artık her kaynak soru bir kez giriyor.
- Benzer sorular konu metniyle seçiliyordu. Artık kazanım bağlantısıyla seçiliyor ve aynı soru tekrar gelmiyor.
- Kitapçığı çözecek bir ekran yoktu. Eklendi:
  - her deneme kaydediliyor,
  - madde durumu güncelleniyor,
  - geçersiz cevap 400 dönüyor.

Sürüm sabitliği zaten veritabanı tetikleyicisiyle sağlanıyormuş. Kullanılan bir sorunun içeriği, onayı geri alınsa bile değiştirilemiyor; bunu testle doğruladım. Ben önce kayıt anı kopyası eklemiştim; gereksiz olduğu için geri aldım.

Kanıt:
- `tests/a059-zero-error.test.ts`
- 5 mutasyonun hepsi yakalandı. İkisi ilk turda kaçtı; test güçlendirildi.
- Tam paket: 279 dosya / 1.331 test geçti.

Sonraki iş: A060.

### A060 — ödev takip akışı, 23 Ekim 01:50

Durum: KOD TAMAM. Merge edildi: PR #332 ve düzeltme PR #333.

Yapılanlar (20 Ekim'de onaylanan genişletilmiş kapsam):
- Öğrenci ödevi çevrimiçi çözüyor:
  - cevaplar ara kayıtla saklanıyor ("Başladı" durumu);
  - ödev bir kez gönderilebiliyor;
  - geç teslim mümkün ve "geç" olarak işaretleniyor.
- Teslimden önce yanıtta doğru cevap, çözüm, video ya da sonuç alanı hiç bulunmuyor.
- Cevapların açılma zamanı:
  - varsayılan olarak son teslim tarihinden sonra açılıyor; yalnız gün verilmişse o günün TR saatiyle 23:59'u sayılıyor;
  - öğretmen ödev bazında "gönderir göndermez" seçeneğini seçebiliyor ve bunu sonradan değiştirebiliyor;
  - teslim tarihi yoksa cevaplar gönderimden hemen sonra açılıyor.
- Cevaplar açıldıktan sonra öğrenci her soru için şunları görüyor: kendi cevabı, doğru cevap, sonuç, çözüm, onaylı video çözüm ve kazanım.
- "Yanlışlarım" ekranı, yalnız cevapları açılmış ödevlerdeki yanlış ve boş soruları gösteriyor.
- Öğretmen sonuçları görüyor: gönderen ve bekleyen öğrenciler, soru bazında D/Y/B, kazanım bazında başarı. Bu görünüm yalnız ödevi oluşturan öğretmene, okul yöneticisine ve Süper Admin'e açık.
- Studio kütüphanesinde "Ödev olarak ata" var: sınıf, son tarih ve açılma zamanı seçiliyor.
- Taslak ödevler öğrenci listesinde görünüyordu; artık görünmüyor.
- Foy uç noktası artık aynı gönderim kodunu kullanıyor.
- Migration 0133 eklendi.

Kanıt:
- `tests/a060-homework.test.ts` dosyasında 4 test var.
- 12 mutasyonun hepsi yakalandı.
- Tam paket 280 dosya / 1.335 test geçti.

**Olay (dürüst kayıt):**
- PR #332, CI typecheck başarısızken merge edildi.
- Neden: merge adımım verify'ın yalnız bitmesini bekliyordu, sonucunu kontrol etmiyordu. Yerelde de `npm run typecheck` yerine `vite build` koşmuştum; vite build tip denetimi yapmıyor.
- Hata: ödev kartındaki "Çöz/Sonuçlar" düğmesi tanımsız `setOpen` kullanıyordu ve tıklanınca hata veriyordu.
- Hata, PR #333 ile 10 dakika içinde kapatıldı.
- Production deploy yapılmadığı için canlı ortam etkilenmedi.
- Süreç düzeltildi: merge yalnız iki verify da `success` ise yapılıyor ve yerelde `npm run typecheck` da koşuluyor.

Sınır:
- Kâğıt + optik ödevde aynı inceleme henüz yok. Studio optik okuma ödev kaydına bağlı değil; ayrı iş olarak not edildi.
- Video çözüm içeriği A014'e, kazanım videosu A067'ye bağlı.

Sonraki iş: A061.

### A061 — yoklama, 23 Ekim 01:58

Durum: KOD TAMAM, merge edildi (PR #334).

Bulunan sorunlar:
- Bir yoklama kaydı düzeltilince eski değer siliniyordu; geçmiş tutulmuyordu.
- Öğrenci ve veli kendi yoklamasını göremiyordu.
- "Gelmedi" kaydı düzeltildikten sonra veliye gidecek devamsızlık bildirimi kuyrukta kalıyordu.

Yapılan düzeltmeler:
- Yeni geçmiş tablosu (migration 0134). Kayda yalnız ekleme yapılabiliyor. Bir değişiklikte tetikleyici şunları yazıyor: önceki değer, değiştiren kişi, zaman ve gerekçe.
- Kaydedilmiş bir yoklamayı değiştirmek için gerekçe zorunlu.
- Aynı yoklama değişmeden yeniden kaydedilirse hiçbir şey değişmiyor.
- Düzeltme yapılınca bekleyen devamsızlık bildirimi atlanıyor.
- Öğrenci ve veli için yeni görünüm eklendi:
  - Uç nokta: `/api/school/attendance/my`
  - Öğretmen notu bu görünümde gösterilmiyor.
  - Düzeltilmiş kayıtlar işaretli.
  - Menüye "Yoklama" eklendi.
- Öğretmen ekranına gerekçe alanı ve düzeltme geçmişi eklendi.

Kanıt:
- `tests/a061-attendance.test.ts`
- 6 mutasyon denendi, hepsi yakalandı. Biri ilk turda yakalanmadı; test güçlendirildi.
- typecheck temiz.
- Tam paket: 281 dosya / 1.336 test geçti.

Sonraki iş: A062.

### A062 — mini oyun öğrenme kaydı, 23 Ekim 02:11

Durum: KOD TAMAM, merge edildi (PR #335).

Zaten doğru olanlar:
- Oyunlar çalışıyor: 5 hazır oyun, 5. ve 6. sınıf için.
- Oyun puanı doğruluk hesabına zaten katılmıyordu.

Kapatılan açıklar:
- Veli, öğretmen ve yönetici bir öğrencinin adına oyun oturumu ve XP kaydedebiliyordu. Artık oturumu yalnız öğrencinin kendisi kaydedebiliyor.
- İstemcinin gönderdiği `nodeId`, oyun kanıtını "kazanıma bağlı" gösterebiliyordu. Oysa oyun içeriği sunucuda bir kazanıma bağlı değil. Artık bu alan yok sayılıyor; oyun oturumu kazanım kanıtı sayılmıyor.
- Oyunun gönderdiği ek veri 2 KB ile sınırlandı.

Not: gerçek kazanım kanıtı için oyun içeriğinin sunucuda doğrulanan, kazanıma bağlı sorulara taşınması gerekiyor. Bu ayrı bir içerik işi.

Kanıt:
- `tests/a062-mini-games.test.ts`
- 3 mutasyon denendi, hepsi yakalandı.
- Tam paket 282 dosya / 1.337 test geçti.

### A063 — panel takvimi, 23 Ekim 02:23

Durum: KOD TAMAM, merge edildi (PR #336).

Zaten doğru olanlar:
- Takvim her rolün kendi kayıtlarını gösteriyor; bu `calendar-access-runtime` testleriyle doğrulanmış.
- Sınav, ödev, föy, randevu ve görevler aynı görünümde.
- Saat dilimi açıkça Europe/Istanbul.

Düzeltilen eksikler:
- Ödev teslim saati yanlış görünüyordu: yalnız tarih girilen bir ödev TR saatiyle 03:00'e düşüyordu. Artık yalnız tarih girilmişse o günün 23:59'u (TR) kullanılıyor. Saat dilimi verilmemiş değerler de TR saati sayılıyor.
- Çakışmalar artık işaretleniyor ve ekranda uyarı çıkıyor. Teslim anları, saati belli olmayan kayıtlar ve uç uca gelen kayıtlar çakışma sayılmıyor.

Kanıt:
- `tests/a063-calendar.test.ts`
- 4 mutasyon denendi, hepsi yakalandı.
- Tam paket 283 dosya / 1.339 test geçti.

Sonraki iş: A064.

### A064 — rehberlik RBA akışı, 23 Ekim 02:38

Durum: KOD TAMAM, merge edildi (PR #337).

Zaten var olan: rehberin onayladığı akış. Öğrenci veya Nibiru testi önerir, rehber onaylar, öğrenci cevaplar, rehber inceler. İnceleme sonunda gelişim sinyalleri ve RBA profili oluşur.

Bulunan açıklar ve düzeltmeler:
- Eski `POST /api/platform/rba` ucu açıktı:
  - Öğrenci, veli, öğretmen ve müdür bu uçla "öz bildirim" RBA profili yazabiliyordu.
  - Bu yazım, rehberin incelediği profilin üzerine yazıyordu.
  - Düzeltme: uç artık 410 dönüyor. Öğrenci ekranı rehber akışına yönlendiriyor.
- `GET` ile veli, branş öğretmeni ve müdür RBA puanlarını okuyabiliyordu.
  - Düzeltme: artık yalnız öğrencinin kendisi, öğrencinin rehber öğretmeni ve Süper Admin okuyabiliyor.
  - Öğrenci başka bir öğrencinin kimliğini gönderse bile yalnız kendi profilini alıyor.
- Rehber testi kendisi başlatamıyordu.
  - Düzeltme: yeni `counselor-assign` ucu eklendi. Rehber, yalnız kendi sınıfındaki bir öğrenciye testi doğrudan açabiliyor. Ekranda "Öğrenciye test aç" düğmesi var.

Kanıt:
- `tests/a064-guidance-rba.test.ts` (uçtan uca akış).
- 7 mutasyon denendi, hepsi yakalandı.
- Tam paket 284 dosya / 1.341 test geçti.

Sonraki iş: A065.

### A065 — Nibiru rol tabanlı yardım, 23 Ekim 02:51

Durum: KOD TAMAM, merge edildi (PR #338).

Zaten doğru olanlar:
- Rol kapsamı doğruydu. Öğrenci yalnız kendi verisini, veli yalnız bağlı çocuğunun verisini görüyor; veli bağlantısı her istekte yeniden kontrol ediliyor. Öğretmen kendi sınıf ve derslerini, kurum yöneticisi kendi kurumunu görüyor.
- Cevap süzgeci vardı: tanı koyma, öğrenciyi etiketleme ve kimlik numarası paylaşma engelleniyordu.

Bulunan açık:
- Öğrenci ve veli bağlamı, yayımlanmamış sınav sonucunu, netleri ve zayıf kazanımları da okuyordu.
- A030'da diğer uçları kapatmıştık, ancak Nibiru sohbeti o çalışmanın kapsamı dışında kalmıştı.
- Düzeltme: öğrenci ve veli artık yalnız yayımlanmış sonuçlarla yanıt alıyor.

Ek düzeltme:
- "Son sınavım", "eksik kazanımlarım" ve "sınıf özeti" sorularında doğrulanmış veri yoksa model artık çağrılmıyor. Kullanıcıya düz bir "veri yok" cevabı veriliyor; böylece uydurma bir sayı üretilemiyor.

Kanıt:
- `tests/a065-nibiru-scope.test.ts`
- 5 mutasyon denendi, hepsi yakalandı.
- Tam paket: 285 dosya / 1.343 test geçti.

Sonraki iş: A066.

### A066 — Nibiru ses akışı, 23 Ekim 03:12

Durum: KOD TAMAM, merge edildi (PR #339). Gerçek cihazda mikrofon testi BEKLİYOR (K002).

Zaten doğru olanlar:
- Ücretli ses yalnız açık bir ayarla etkinleşiyor.
- Sağlayıcı hataları adlandırılmış kodla dönüyor.
- Ham ses saklanmıyor.

Kapatılan maliyet riskleri:
- Sesli yanıt herkese sınırsız açıktı. Artık kullanıcı başına günlük sınır var: seslendirme 40, ses tanıma 60. Süper Admin bu sınırın dışında. Sınır aşılırsa sağlayıcı çağrılmıyor ve 429 dönüyor.
- Premium sesi herkes seçebiliyordu. Artık yalnız Süper Admin seçebiliyor.
- Herkese açık tanıtım sesi her ziyarette ücretli bir çağrı yapıyordu. Artık her senaryo bir kez üretilip önbellekte tutuluyor. Önbellek yoksa ücretli çağrı hiç yapılmıyor.

Kanıt:
- `tests/a066-voice-limits.test.ts`
- 6 mutasyon denendi, hepsi yakalandı.
- Tam paket 286 dosya / 1.346 test geçti.

**Dağıtım notu (03:12):** "Deploy Production Cloudflare Worker" çalışması 39876760146 (main `ad30cef`, PR #326–#339 dahil) kullanıcı onayı bekliyor. Yeni bir merge bu çalışmayı iptal ettiği için çalışma onaylanıp tamamlanana kadar merge yapılmıyor. Sonraki işler dalda hazırlanıp onaydan sonra merge edilecek.

Sonraki iş: A067.

### A067 — YouTube kaynak bağı, 23 Ekim

Durum: KOD HAZIR. PR #340 açık; production dağıtımı tamamlanınca merge edilecek. Karekod sayfası kısmı BEKLİYOR (A078).

Bulunan ve düzeltilen açıklar:
- Otomatik seçilen YouTube videosu, hiç kimse incelemeden öğrenciye gösteriliyordu. Bu, insan onayı kapısını aşıyordu. Artık otomatik bulunan video yalnız aday olarak kayda geçiyor.
- `question-support` yayımlanmamış sınav sorusu için de cevap veriyordu. Bu cevap doğru/yanlış/boş durumunu da açığa çıkarıyordu.
- Kırık ya da ileri tarihe planlanmış videolar da sunulabiliyordu. Artık hangi videonun sunulacağına tek bir kural karar veriyor: video onaylı, yayında, yayın saati gelmiş ve kırık değilse sunuluyor.

Sınırlar:
- Ürün içinde karekod sayfası henüz yok. Bu kısım A078'deki fiziksel kitap bağlantılarıyla birlikte yapılacak.
- Otomatik adayları onaylayacak bir Süper Admin ekranı yok.

Kanıt:
- `tests/a067-video-links.test.ts`
- 6 mutasyon, hepsi yakalandı.
- Tam paket 287 dosya / 1.347 test geçti.

### A068 — WhatsApp uygulanabilir bağlantı, 23 Ekim

Durum: kod kısmı hazır (PR #341 açık, dağıtım sonrası merge). Kalan kısım BEKLİYOR: kullanıcının kararı ve Meta doğrulaması.

Zaten doğru çalışanlar:
- Gelen mesajların imzası doğrulanıyor.
- Kendiliğinden giden mesajlar yalnız sahibinin eşleştirdiği numaraya gidiyor.
- Eşleşmemiş, şablonu olmayan ya da sağlayıcısı olmayan gönderimler "atlandı" olarak kaydediliyor.
- Yoklama bildirimi kuyruğu henüz gönderilmiyor.

Bulunan açık:
- 6 haneli eşleştirme kodu için deneme sınırı yoktu.
- Artık bir numara saatte 5 hatalı denemeden sonra kod kontrol edemiyor (migration 0136).

Kullanıcıya sorulacaklar:
- Hangi Business numarası kullanılacak?
- Numara telefon uygulamasıyla birlikte kullanılacak mı (coexistence)?
- Meta ücret koşulları neler?
- Sınırsız WhatsApp duyurusunu kimin gönderebileceği (yalnız yönetici mi?) bir maliyet kararı.

Kanıt:
- `tests/a068-whatsapp-pairing.test.ts`
- 3 mutasyon, hepsi yakalandı.

### A069 — bildirim teslimi, 23 Ekim

Durum: KOD HAZIR. PR #342 açık; dağıtım sonrası merge edilecek.

Bulunan ve düzeltilen açıklar:
- Duyurular yeniden gönderilebiliyordu; gönderilmiş ya da iptal edilmiş duyurular bile. Bu, WhatsApp şablonlarının tekrar gitmesi demekti. Artık taslak veya planlı bir duyuru tek seferde alınıp gönderiliyor; diğer durumlarda 409 dönüyor.
- Zamanlayıcı, kendi almadığı duyuruyu da dağıtıyordu. Artık yalnız kendi aldığını dağıtıyor.
- Yarıda kalmış bir gönderim tekrar edildiğinde WhatsApp mesajı ikinci kez gidiyordu. Artık gitmiyor.
- Duyuruyu iptal etmenin yolu yoktu. İptal eklendi; gönderilmiş duyuru geri çağrılamıyor.
- Başarısız ve atlanan gönderimler görünmüyordu. Artık listede sayıları, ayrıntı ucunda da kanal, durum ve neden görünüyor.

Kanıt:
- `tests/a069-notification-delivery.test.ts`
- 5 mutasyonun 4'ü yakalandı. Kalan, zamanlayıcının sahiplenme kontrolü. Diğer tekillik korumaları aynı işi gördüğü için bu kontrol yedek savunma niteliğinde.
- Tam paket 287 dosya / 1.348 test geçti.

Sonraki iş: A070.

### A070 — ders programı karar ve kapsamı, 23 Ekim

Durum: KARŞILAŞTIRMA TAMAM. Eksik iş, ölçütleriyle birlikte aşağıda A070.1 olarak kaydedildi. Uygulanması kullanıcının kararını bekliyor (BEKLİYOR).

Bugün olan (Ders Programı menüsü onaylı kapsamda):
- Takvimde ders tipi kayıt var: "LESSON". Sınıfa ve derse bağlanabiliyor, haftalık tekrarlanabiliyor ve bir yıl içinde bitiyor.
- Yetki kuralları geçerli: öğretmen yalnız kendi sınıf ve dersine kayıt açabiliyor. Öğrenci ve veli kendi sınıfının derslerini görüyor.
- Aynı görünümde çakışan saatler işaretleniyor (A063).

Bugün olmayan:
- Okulun ders saatleri (zil saatleri) tanımlanamıyor.
- Sınıf × gün × ders saati ızgarası yok.
- Aynı öğretmenin aynı saatte iki sınıfa yazılması kayıt sırasında engellenmiyor.
- Derslerin haftalık saat yükü MEB çizelgesiyle karşılaştırılmıyor.
- Nöbet ve ders değişikliği (yerine ders) yok.
- Programın dosyadan (e-Okul/Excel) aktarılması yok.

Önerilen iş A070.1 "Ders programı ızgarası" ve ölçülebilir kabul ölçütleri:
1. Okul ders saatlerini tanımlar: başlangıç–bitiş saati ve gün sayısı.
2. Okul yöneticisi sınıf × gün × saat hücresine ders ve öğretmen atar.
3. Aynı öğretmen aynı saate ikinci kez atanırsa kayıt reddedilir (409).
4. Aynı sınıfın aynı saatine ikinci ders atanırsa kayıt reddedilir.
5. Öğrenci, veli ve öğretmen kendi haftalık programını görür. Program takvimde ders kaydı olarak çıkar.
6. Değişiklikler sürümlü tutulur. Eski hafta sonradan değişmez.
7. (İsteğe bağlı) MEB haftalık ders saati çizelgesiyle karşılaştırmalı uyarı verilir. Çizelge resmî kaynaktan gelmelidir.

Kullanıcıya sorulanlar:
- Izgara yapılsın mı?
- Kapsamda e-Okul/Excel aktarımı ve nöbet/ders değişikliği olsun mu?
- MEB saat çizelgesi kontrolü istenir mi?

### A071 — canlı ders kapsamı, 23 Ekim

Durum: kod kısmı hazır (PR #343 açık; dağıtımdan sonra merge edilecek). Sağlayıcı seçimi BEKLİYOR.

Bugünkü kapsam: yalnız rezervasyon ve kredi var. Görüşme sağlayıcısı bağlı değil ve uygulama bunu açıkça söylüyor; olmayan bir entegrasyon varmış gibi davranılmıyor.

Bulunan açıklar ve düzeltmeler:
- Kredi bedelini istemci belirliyordu. Artık sunucu belirliyor: 20 dakika = 1 kredi.
- Bakiye kontrolü atomik değildi, bu yüzden bakiye eksiye düşebiliyordu. Artık kontrol ve düşüm tek adımda yapılıyor.
- Personel öğrencinin kredisini harcayabiliyordu. Artık yalnız öğrenci veya velisi harcayabiliyor.
- Geçmiş bir zamana rezervasyon yapılabiliyordu. Bu artık engelleniyor.

Kanıt:
- `tests/a071-live-reservation.test.ts`
- 4 mutasyon denendi, hepsi yakalandı.
- Tam paket: 288 dosya / 1.349 test geçti.

Kullanıcıya sorulanlar:
- Görüşme sağlayıcısı hangisi olacak: Zoom, Google Meet, Jitsi ya da başkası?
- Görüşme kaydı yapılacak mı? Yapılacaksa KVKK açık rızası nasıl alınacak?
- Oturumu kim açacak, kim katılacak?

Sonraki iş: A072.

### A072 — tercih robotu resmî veri kapsamı, 23 Ekim

Durum: KOD HAZIR. PR #344 açık; dağıtımdan sonra merge edilecek.

Zaten doğru olanlar (testle doğrulandı):
- Hedef verisi yalnız resmî kaynağın kendi alan adından, https üzerinden ve doğrulama tarihiyle içe aktarılabiliyor.
- Yıl, il ve ilçe filtreleri çalışıyor.
- Analiz, verinin kaynağını ve yılını gösteriyor.
- Ekranda ve Nibiru'da "yerleşme garantisi vermez" uyarısı var.

Bulunan açık:
- Hedef analizi, okulun henüz yayımlamadığı sınav sonuçlarını da kullanıyordu. Bu hem öğrenci analizinde (v2) hem velinin gördüğü analizde oluyordu.
- Düzeltme: analiz artık yalnız yayımlanmış sonuçları kullanıyor.

Kanıt:
- Test dosyası: `tests/a072-target-data.test.ts`.
- 4 mutasyon denendi; hepsi yakalandı.

### A073 — üyelik/aktivasyon ve modül hakları, 23 Ekim

Durum: KOD HAZIR. PR #345 açık; dağıtımdan sonra merge edilecek.

Bulunan sorun:
- Bazı ekranlarda menünün bağlı olduğu anahtar ile API'nin bağlı olduğu anahtar aynı değildi.
- Rehberlik testleri ve "Soru Çöz" ekranlarında menü kapalıyken API yine de çalışıyordu.
- Ödev listesinde ters durum vardı: menü görünüyordu ama API 403 dönüyordu.
- Kitap, sıfır hata ve öğrenci oyun listesi API'lerinde hiç anahtar yoktu.

Yapılan düzeltme:
- Bu yollar için tek bir kapı eklendi. Mevcut özellik anahtarları kullanılıyor.
- Kurum bazlı ayar, varsayılanın önüne geçiyor. Süper Admin kapıdan muaf.
- Ödev menüsü artık ASSIGNMENTS anahtarına bağlı.

Kullanıcı kararı: ASSIGNMENTS varsayılanı kapalı. Ödev her kurumda varsayılan olarak açık olsun mu?

Kanıt:
- Test dosyası: `tests/a073-feature-gates.test.ts`.
- 5 mutasyon denendi; hepsi yakalandı.
- A064 testi yanlış anahtarla özellik açıyordu; düzeltildi.

Sonraki iş: A074.

### A074 — veri transferi / toplu işlemler, 23 Ekim

Durum: KANIT EKLENDİ. Kod değişmedi. PR #346 açık; dağıtımdan sonra merge edilecek.

- Önizleme, hata listesi, kişi kararı, kurum kapsamı ve iki kez aktarım A045'te kapatılmıştı.
- Bu işte yalnız eksik kanıt eklendi:
  - Aynı dosya yeniden yüklenince mevcut kayıtlarla eşleşiyor; yeni kopya oluşmuyor, kayıt kaybolmuyor.
  - İki onay aynı anda gelirse öğrenci çoğalmıyor.
  - Başka bir okul işi göremiyor ve onaylayamıyor.
- Not: aynı anda onayı iki koruma yedekliyor. İkisi birlikte kaldırılınca test kırılıyor; biri kaldırılınca diğeri koruyor.

### A075 — yayınevi / bursluluk / Campus, 23 Ekim

Durum: KOD HAZIR. PR #347 açık; dağıtımdan sonra merge edilecek.

Zaten doğru olanlar:
- Yayınevi analitiğini yalnız yetkili kullanıcılar görüyor.
- Bursluluk kampanyasını yalnız yönetici açabiliyor.

Düzeltilen:
- Campus ekranı yönlendirmesi olmayan alt alan adı ve özel alan adını "hazır" gösteriyordu ve etkinleştirme anahtarı sunuyordu. Ekran artık "Planlı — henüz çalışmıyor" diyor. API bu alanı hiç etkin olarak kaydetmiyor.
- Bursluluk ekranı artık aday akışının planlı olduğunu söylüyor.

Kanıt: `tests/a075-planned-flows.test.ts`.

### A076 — profil ve görünüm ayarları, 23 Ekim

Durum: KOD HAZIR. PR #348 açık; dağıtımdan sonra merge edilecek.

- Sorun: tema seçimi cihaz genelinde saklanıyordu. Paylaşılan bir cihazda bir hesabın teması başka bir hesabın paneline geçiyordu.
- Düzeltme: tema artık hesap başına saklanıyor. Eski ortak anahtar siliniyor. İzin dışı kalan tema standarda dönüyor. Depolama kapalıysa panel bozulmuyor.
- Ek düzeltme: Layout'ta erken dönüşten sonra çağrılan bir hook kaldırıldı.

Kanıt: `tests/a076-theme-per-user.test.ts`. 3 mutasyon yakalandı.

Sonraki iş: A077.

### A077 — yönetim ve izleyici ekranları, 23 Ekim

Durum: KOD HAZIR. PR #349 açık; dağıtımdan sonra merge edilecek.

- Yeni: `/api/admin/operations-summary` ve Süper Admin paneli. Gönderilemeyen bildirimler ve takılı duyurular gibi gerçek hata sayılarını veritabanından okur; sorun varsa durumu "ATTENTION" yapar. Öğretmen, öğrenci ve veli göremez.
- Ajan yük testi artık yalnız `AGENT_LOAD_TEST_ENABLED='true'` ise başlatılabiliyor. Kullanıcı sayısı en çok 200, varsayılan 50. Workflow varsayılanı da 50'ye indi.
- Ajan dispatch yalnız Süper Admin içindir; öğretmen 403 alır (testte). Serbest komut yolu olmadığı kod okumasıyla görüldü; bunun için ayrı test yazılmadı.

Kanıt: `tests/a077-operations.test.ts`.

### A078 — mobil/PWA/tahta ve kitap bağlantıları, 23 Ekim

Durum: KOD HAZIR. PR #350 açık; dağıtımdan sonra merge edilecek.

- Tahta modu (`/board/:belge`): yazdırılan kitapçıkla aynı soru verisi; tam ekran, soru soru, kalem, şıkları ve cevabı göster/gizle, çözüm metni ve çözüm videosu. Video yalnız onaylı ve https ise gösteriliyor.
- Kitap karekodu (`/k/:anahtar`): yalnız bilinen türler (çalışma kâğıdı, ödev, test, video) ilgili sayfaya gidiyor. Bilinmeyen tür veya eksik kayıt tahmin edilmiyor. Video bağlantısı https değilse açılmıyor.
- Çalışma kâğıdı ve ödev sayfaları `?open=` ile doğrudan açılıyor. Studio kütüphanesine "Tahtada aç" eklendi.

Kanıt: `tests/a078-board-qr.test.ts`; 9 mutasyon yakalandı. `studio-preview-swap` testinin kısa şeması yeni alanlarla güncellendi.

Açık kalanlar:
- Gerçek telefon, tablet ve akıllı tahtada kabul K002'de yapılacak.
- Tahta modunda soru görselleri henüz çizilmiyor; yalnız metin ve şıklar var.
- A067'nin karekod sayfası kısmı bu bağlantıyla karşılandı; basılı karekod üretimi A014 kararına bağlı.

Sonraki iş: A079.

### A079 — app güvenlik ve veri yaşam döngüsü, 23 Ekim

Durum: KOD HAZIR. PR #351 açık; dağıtımdan sonra merge edilecek.

Zaten doğru olanlar (kodda doğrulandı):
- Pasifleştirilen hesabın ve pasif kurumun oturumları kapanıyor (A032b).
- Rapor ve rubrik dışa aktarma dosyaları süre dolunca siliniyor.
- Ödev taslağı teslimde siliniyor.
- Hesap silme kişiyi anonimleştiriyor; kalıcı kimlik satırı kalıyor.
- Optik baskı tabanı kurum kontrolünden geçiyor.

Düzeltilenler:
- Şifre değişince hesabın diğer oturumları açık kalıyordu. Artık kapanıyor; değiştiren oturum açık kalıyor.
- Soru medyası:
  - Bir kurumun onaylı sorusunun medyası başka kurumdan açılabiliyordu.
  - Öğrenci ve veli, kendi kurumunun taslak soru medyasını açabiliyordu.
  - Onayı kaldırılmış medya hâlâ veriliyordu.
  - Artık öğrenci ve veli yalnız onaylı sorunun onaylı medyasını görüyor. Kurum medyası kurum içinde kalıyor. Kişisel soru yalnız sahibinde.

Kanıt: `tests/a079-security-lifecycle.test.ts`; 9 mutasyon yakalandı.

Karar bekleyen (kapı gevşetilmedi):
- Süreli temizlik, KVKK hukuk onayı verilmiş politikalarla çalışıyor.
- Yeni tablolar için saklama süresi tanımlı değil:
  - `nibiru_voice_daily_usage`
  - `nibiru_pairing_attempts` (A068)
- Bu süreler hukuk onayıyla politika listesine eklenmeli.

Sonraki iş: A082.

### A082 — dışarıdan toplu soru aktarımı, 23 Ekim

Durum: KOD HAZIR. PR #352 açık; dağıtımdan sonra merge edilecek.

- İçerik merkezinde yalnız Süper Admin için "Toplu soru aktar" bölümü var. Excel, CSV ve JSON kabul ediliyor; sütun adları Türkçe veya İngilizce olabilir.
- Önizleme satır satır hata listesi veriyor ve hiçbir şey yazmıyor.
- Her satırda şunlar zorunlu:
  - kaynak etiketi;
  - telif durumu;
  - aynı sınıfa ait, doğrulanmış, resmî ve aktif bir 2027–2028 kazanım kodu.
- Bulunamayan, eski yıla ait, taslak müfredattaki veya yanlış sınıfa ait kazanım reddediliyor.
- Geçerli satırlar REVIEW durumunda ve kazanıma bağlı olarak ekleniyor; otomatik onay yok. A008 toplu onay listesinde görünüyorlar. Normal onay kapısından geçebildikleri testte gösterildi.
- Aynı dosya tekrar yüklenince kopya oluşmuyor; kontrol kayıt anında da yapılıyor. Çok benzer soru kökü uyarı olarak gösteriliyor.
- PDF ve Word aktarımı yok, çünkü onay gerekiyor.

Kanıt: `tests/a082-question-import.test.ts`; 19 mutasyon yakalandı.

Not: kayıt anındaki kopya kontrolü, aynı anda gelen iki yükleme taklit edilerek test edildi. Test ortamı istekleri sırayla işliyor; bu yüzden gerçek eşzamanlılık bu oturumda gösterilemedi.

Sonraki iş: S001.

### S001 — sonuç portalının canlı temeli, 23 Ekim

Durum: BEKLİYOR (canlı doğrulama ve dağıtım onayı kullanıcıda).

Kodda doğrulananlar:
- `anunex-result-prod` ayrı bir Worker. API yalnız izin listesindeki yollara açık (`resultApiPathAllowed`); geri kalan yollar 404 RESULT_NETWORK_ROUTE_NOT_AVAILABLE döner. Kanıt: `tests/result-worker-boundary.test.ts`.
- Yeni app yolları (toplu soru aktarımı, operasyon özeti, ödev vb.) sonuç alanından erişilemez.
- Production Turnstile anahtarı dağıtım workflow'unda gerçek anahtarla değiştiriliyor. Config'teki `1x…BB` yalnız yer tutucu.

Bulgular:
- Sonuç Worker'ının son başarılı dağıtımı **8 Ekim** (`c5d45c30`).
- 13 Ekim'deki push dağıtımı (run 38415127532) hâlâ onay bekliyor ve eski bir commit'e ait.
- Sonuç Worker'ı app kodunu paylaşıyor, ama yalnız `.github/deploy-result-network.trigger` değişince ya da elle başlatılınca dağıtılıyor. Bu yüzden 8 Ekim'den sonraki app düzeltmeleri (yayın kapıları, A079 oturum ve medya düzeltmesi dahil) sonuç alanında **yok**. Bu fark S006 kapsamında ele alınacak.
- Her PR'da çalışan "Result Provider Isolation Probe" "Provision isolated R2 and Queue resources" adımında kırılıyor. Log bu oturumdan indirilemedi; muhtemel neden hesaptaki 100 Queue sınırı (S015).

Kullanıcıdan gereken:
1. Eski bekleyen 38415127532 run'ını reddetmek. App dağıtımı bittikten sonra güncel main'den "Deploy ANUNEX Result Network" çalıştırılıp onaylanacak.
2. `https://sonuc.anunex.com/api/health` yanıtı ve sürüm. Bu oturum sonuç alanını açamıyor; web erişimi izin bekledi ve zaman aşımına uğradı.

Sonraki iş: S002 (kod tarafı).

### S002 — öğrenci sonuç girişi, 23 Ekim

Durum: KOD HAZIR. PR #353 açık. Sonuç Worker'ı dağıtılınca canlıya çıkacak (bkz. S001).

Zaten doğru olanlar:
- Arama için Turnstile, MEB kurum kodu, sınıf, ad soyad ve öğrenci no/TCKN birlikte gerekiyor.
- Eşleşme olsa da olmasa da yanıt aynı biçimde; hesap tahmin edilemiyor.
- Sonuç yalnız yayımlanmış ve kanalı aktif sınavlarda açılıyor.
- Kişisel kod HMAC ile saklanıyor; arama, aramayı yapan IP adresine bağlı.
- Oturum 6 saat sürüyor, IP adresine bağlı ve her istekte yeniden kontrol ediliyor.
- Sınav detayı yalnız bu kimliğin kendi katılımından geliyor.

Düzeltilenler:
- Kod denemesi önce okunup sonra sayılıyordu. Aynı anda gönderilen denemeler arama başına 5 sınırını aşabiliyor ve 8 hata kilidinden kaçabiliyordu (hata sayacı tek artıyordu). Artık her deneme kod kontrolünden önce SQL'de atomik sayılıyor.
- Kilitlenen kimlik, kilitten önce açılmış bir aramada denemeye devam edebiliyordu. Artık reddediliyor.
- Doğru kod aynı anda iki kez gelirse tek oturum açılıyor.
- Süre ve kilit karşılaştırması SQL'e taşındı. Eski kod SQLite saatini JavaScript ile yerel saat sanarak okuyordu. Bu yalnız UTC dışı ortamda hata veriyor; Workers UTC olduğu için canlıda etkisi yoktu.

Kanıt: `tests/s002-result-verify.test.ts`. Eski kodla 3 test kırılıyor; 8 mutasyon yakalandı.

Sonraki iş: S003.

### S003 — sonuç portalı kurum girişi, 23 Ekim

Durum: KOD HAZIR (yalnız kanıt). PR #354 açık.

Kodda değişiklik gerekmedi. Testler sonuç Worker'ı üzerinden çalıştırıldı ve şunları gösteriyor:
- Kurum yöneticisi yalnız kendi kurumunu ve kendi katılımcılarını görüyor.
- Başka kurumun değerlendirme grubu, raporu ve satır araması 403 dönüyor.
- Öğretmen ve öğrenci 403 alıyor.
- Dondurulan kurum 409, pasif kurumun oturumu 401 dönüyor. Diğer kurum etkilenmiyor.

Kanıt: `tests/s003-result-institution.test.ts`; 5 mutasyon yakalandı.

Not: kurum yöneticisi kendi değerlendirmesini yayından önce "LIVE_PREVIEW" olarak görüyor. Değerlendirmeyi kendisi yaptığı için bu tasarım gereği. Yayından sonra sabit yayın sürümünü görüyor.

### S004 — sonuç portalı bayi girişi, 23 Ekim

Durum: KOD HAZIR (yalnız kanıt). PR #355 açık.

Kodda değişiklik gerekmedi. Testler şunları gösteriyor:
- Bayi yalnız kapsamındaki kurumlara erişiyor (kurum kodu veya il/ilçe kapsamı). Başka bayinin kurumu 403 dönüyor.
- Askıya alınan bayi ve kaldırılan kapsam hemen kapanıyor; diğer bayi etkilenmiyor.
- Ağ yönetimi, bayi kapsamı ve kurum yaşam döngüsü yalnız Süper Admin'de.
- Bayi hesabı app'te kurumsuz yönetici olarak duruyor ve hiçbir sınav tanımı görmüyor.

Kanıt: `tests/s004-result-dealer.test.ts`; 7 mutasyon yakalandı.

Sonraki iş: S005.

### S005 — sonuç ağı kurum ve erişim yönetimi, 23 Ekim

Durum: KOD HAZIR. PR #356 açık.

Zaten doğru olanlar:
- Erişim kodunu, ağ kurumunu, bayiyi ve yaşam döngüsünü yalnız Süper Admin yönetiyor.
- Kod 8 haneli ve güvenli rastgele üretiliyor. Yalnız bir kez gösteriliyor (`oneTimeDisplay`). Veritabanında ve audit kaydında açık metin olarak yok.
- Yayınlanmış sınava yeni öğrenci erişimi eklenemiyor.

Düzeltilen:
- Kod yeniden verildiğinde (kayıp veya sızıntı) eski kodla açılmış 6 saatlik portal oturumları açık kalıyordu.
- Artık yeniden verme aynı işlemde açık oturumları iptal ediyor ve bitmemiş aramaları siliyor.

Kanıt: `tests/s005-result-access-reissue.test.ts`; 3 mutasyon yakalandı.

Dürüst not: ilk commit'i tam test paketi sonucunu beklemeden attım ve PR açıldı. `result-access-publication-lock` testinin kısa şeması yeni tablolar yüzünden kırıldı. Hemen ikinci commit'le düzelttim; tam paket geçiyor. Bundan sonra commit yalnız tam paket geçtikten sonra atılacak.

Sonraki iş: S006.

### S006 — app–sonuç yayın farkı uyarısı, 23 Ekim

Durum: KOD HAZIR. PR #357 açık.

- Üç production dağıtım workflow'u Worker'a dağıtılan commit'i `RELEASE_SHA` olarak veriyor. Yalnız `--var` eklendi; tetikleyiciler ve onay ortamı değişmedi.
- `/api/health` iki Worker'da da 12 karakterlik sürümü döndürüyor. Bu bilgi herkese açık yanıtta görünüyor; risk düşük.
- `/api/admin/release-drift` yalnız Süper Admin'e ve yalnız app tarafında açık. sonuc.anunex.com'un health yanıtıyla karşılaştırıp şu sonuçlardan birini veriyor:
  - SAME (aynı);
  - DIFFERENT (farklı);
  - UNKNOWN (sürüm eksik, geçersiz ya da sonuç alanına erişilemedi).
- Endpoint yalnız okuyor; hiçbir dağıtım başlatmıyor.
- Sonuç Ağı yönetim ekranının üstünde uyarı kutusu var.
- İlk iki dağıtım sürüm bilgisi taşımadığı için ilk karşılaştırma UNKNOWN çıkacak. Gerçek karşılaştırma iki Worker da bu sürümle dağıtıldıktan sonra başlayacak.

Kanıt: `tests/s006-release-drift.test.ts`; 6 mutasyon yakalandı.

Sonraki iş: S007.

### S007 — sonuç kanalında yayın kararı, 23 Ekim

Durum: KOD HAZIR. PR #358 açık. "Sonra yayın" kısmı kullanıcı kararını bekliyor.

Zaten doğru olanlar:
- Sonuç kanalında yayın, güncelleme ve kaldırma yalnız Süper Admin'de ve yalnız production'da.
- İşlem revizyon kontrolüyle ve operasyon kilidi altında yapılıyor.
- Portal yalnız yayımlanmış yönetimin sabit sürümünü gösteriyor.

Düzeltilen:
- Portal, kanal satırı hiç olmayan sınavı "kaldırılmamış" sayıyor. app'teki "kaldır" ve çöp kutusundaki "sonuç portalından kaldır" yalnız var olan satırı güncelliyordu. Bu yüzden kanal satırı olmadan yayımlanmış (eski) bir sınav kaldırıldığında portalda görünmeye devam ediyordu.
- Artık iki yol da ARCHIVED satırı ekliyor ya da güncelliyor.

Kanıt (`tests/s007-result-channel.test.ts`; 2 mutasyon yakalandı):
- Kaldırılan sınav aramada bulunmuyor; açık oturumda liste boş, detay 404 dönüyor.
- Kurum yöneticisi yeniden yayınlayamıyor; sınav ancak açık bir yeniden yayınla geri geliyor.
- Yayımlanmamış yönetim (DRAFT, UPLOADING, READY, ARCHIVED) kanal aktif olsa da görünmüyor.

Karar bekleyen:
- Sonuç kanalında zamanlanmış ("sonra") yayın yok. Bugün "sonra" ancak Süper Admin'in daha sonra elle yayınlamasıyla oluyor.
- Zamanlanmış yayın için sonuç Worker'ının cron'unun çalışması gerekiyor. Cron şu an D1 bütçesi için kapalı (`SCHEDULED_JOBS_PAUSED`).
- Seçenekler:
  - (a) elle yayın yeterli;
  - (b) zamanlanmış yayın eklensin; cron bütçesi buna göre açılır.

Sonraki iş: S008.

### S008 — sonuç özeti, 23 Ekim

Durum: KOD HAZIR (yalnız kanıt). PR #359 açık.

Kodda değişiklik gerekmedi. Uçtan uca test gerçek migration'larla, sonuç Worker'ı üzerinden çalıştırıldı ve şunları gösteriyor:
- Yayından sonra doğru/yanlış/boş/net, yayımlanan sabit sürümden geliyor.
- Canlı yeniden değerlendirme portalı değiştirmiyor.
- Düzeltme için yönetim yeniden açılınca portal sonucu geri çekiyor.
- Yeniden yayında yeni sürüm (v+1) ve yeni değerler görünüyor.

Kanıt: `tests/s008-result-summary.test.ts`; 3 mutasyon yakalandı.

### S009 — sonuç sıralaması, 23 Ekim

Durum: BEKLİYOR (kullanıcı kararı). Kod değiştirilmedi.

Bulgular:
- Sıralamalar yayında bir kez hesaplanıp sabitleniyor: sınıf, sınıf düzeyi, kurum, ilçe, il, zincir ve "Türkiye".
- Sıralama evreni yalnız **sonuç erişim kodu verilmiş** katılımcılar (`result_access_identities`). Değerlendirilmiş ama kodu olmayan katılımcı, örneğin öğrenci numarası boş olan, sıralamaya girmiyor.
- Portal "Türkiye 3 / 120" biçiminde paydayı gösteriyor. Ancak payda yalnız bu yönetime katılan kurumlar. "Türkiye" etiketi, az kurum katıldığında yanıltıcı olabilir.

Sorular:
1. Sıralama evreni ne olmalı?
   - (a) Yalnız kodu verilen öğrenciler (bugünkü durum).
   - (b) Sınavın bu yönetimdeki tüm değerlendirilmiş katılımcıları; kodu olmayanlar da sayılır ama kendileri göremez.
2. İl, ilçe ve "Türkiye" sıralaması ne zaman gösterilmeli?
   - (a) Her zaman, etiket "Katılımcılar arasında" olarak değişsin.
   - (b) Kapsamdaki kurum sayısı belli bir eşiğin altındaysa gizlensin. Eşik ne olmalı?

Sonraki iş: S010.

### S010 — sonuç kazanım görünümü, 23 Ekim

Durum: KOD HAZIR. PR #360 açık.

Düzeltilenler:
- Sonuç detayındaki kazanım listesi, doğrulanmamış müfredata bağlı kazanımları da gösteriyordu. Artık yalnız doğrulanmış müfredat kazanımları dönüyor.
- Veri yokken "Kazanım rotası" başlığı boş kalıyordu. Artık `outcomesStatus` alanı durumu açıkça veriyor:
  - AVAILABLE: kazanım var;
  - NOT_VERIFIED: kazanım var ama müfredat doğrulanmamış;
  - NO_OUTCOME_DATA: kazanım verisi yok.
- Portal boş durumda nedenini yazıyor.

Sonradan yayımlanan kazanım analizinin sonuç kanalına yansıması (`published_result_at`) değişmedi ve mevcut testlerle korunuyor.

Kanıt: `tests/s010-result-outcomes.test.ts` (gerçek migration, uçtan uca); 3 mutasyon yakalandı. `result-network-snapshot` fikstürü outcome_id ve doğrulanmış müfredatla güncellendi.

Sonraki iş: S011.

### S011 — sonuç video erişimi, 23 Ekim

Durum: KOD HAZIR. PR #361 açık.

Sorun: portal, öğrencinin yanlış yaptığı soruların videolarını yalnız "onaylı" koşuluyla gösteriyordu. Bu yüzden şunlar da görünüyordu:
- taslak ve ileri tarihli videolar;
- kırık bağlantılar;
- yalnız öğretmene ya da Süper Admin'e açık videolar;
- http bağlantılar.

Düzeltme: artık A067'deki kuralın aynısı uygulanıyor (onaylı, yayımlanmış, zamanı gelmiş, kırık değil). Buna ek olarak görünürlük STUDENT_TEACHER ya da PUBLIC olmalı, bağlantı https olmalı ve video aynı sınava ait olmalı. Onay sonradan geri çekilirse video kayboluyor; hangi soruların gösterileceği (yayındaki yanlışlar) sabit kalıyor.

Kanıt: `tests/s011-result-videos.test.ts` (uçtan uca); 8 mutasyon yakalandı.

Not: A067 (#340) merge edilince bu kural ortak `SERVABLE_VIDEO_SQL`'e bağlanacak. #360 ve #361 aynı test fikstürünün farklı satırlarına dokunuyor; merge sırasında birleştirilecek.

Sonraki iş: S012.

### S012 — sonuç düzeltme/kaldırma eşzamanlılığı, 23 Ekim

Durum: KOD HAZIR (yalnız kanıt). PR #362 açık.

Kodda değişiklik gerekmedi. Sınav başına tek işlem kilidi ve yazma çiti zaten var. Test şunları gösteriyor:
- Başka bir işlem sürerken düzeltmeye açma ve kod yeniden verme 409 dönüyor.
- Bu sırada hiçbir veri değişmiyor; portal aynı yayın sürümünü göstermeye devam ediyor.
- Kilit bitince düzeltme tek adımda geçiyor.
- Aynı sürüm için gelen ikinci (bayat) düzeltme 409 dönüyor.

Kaldırılan sınavda açık oturumlar sonuç göremiyor (S007).

Kanıt: `tests/s012-result-concurrency.test.ts`.

### S013 — sonuç belge çıktısı, 23 Ekim

Durum: KOD HAZIR. PR #363 açık.

Sorun: kurum sonuç listesinin CSV'si ve yazdırma görünümü, verinin yayımlanmış sabit sürüm mü yoksa yayımlanmamış canlı ön izleme mi olduğunu yazmıyordu. Bu yüzden ön izleme kesin sonuç gibi dağıtılabilirdi.

Düzeltme:
- CSV'nin ilk satırı ve dosya adı kaynağı belirtiyor:
  - "Yayımlanmış sonuç · sürüm N";
  - "ÖN İZLEME — yayımlanmamış".
- Rapor ekranında da aynı not var; yazdırmada da görünüyor.

Öğrenci karnesi zaten yayın sürümünden geliyor. Sunucu tarafı dışa aktarma süreleri A056'da kapatılmıştı.

Kanıt: `tests/s013-result-documents.test.ts`.

Not: bu sırada tam test paketi bir kez bellek yetersizliğinden durdu (exit 137). `--maxWorkers=4` ile yeniden koşuldu ve geçti.

Sonraki iş: S014.

### S014 — dönem sonu lisanssız temizliği, 23 Ekim

Durum: BEKLİYOR (kullanıcı kararı). Kod değiştirilmedi; geri alınamaz silme kuralı tahminle değiştirilmez.

Şu an nasıl çalışıyor:
- Süre: yayın tarihine 90 gün eklenir; bu tarih ile bir sonraki yılın 30 Eylül'ünden hangisi daha geçse o kullanılır.
- Süre dolunca sonuç ağı yönetimi 80'erli sayfalarla temizleniyor:
  - katılımcı satırları siliniyor;
  - sonuç dosyaları önce emekliye ayrılıyor;
  - sınav tanımı, cevap anahtarı, kazanımlar ve videolar korunuyor.
- Korunanlar:
  - başka bir yönetimde erişimi olan katılımcı;
  - sınavı app'te yayımlanmış (snapshot_version > 0) olan ya da LICENSED yönetimi olan sınavın katılımcıları.
- Kapsamlı testler var: `result-artifact-retention`, `result-retention-queue`.
- Cron şu an kapalı (`SCHEDULED_JOBS_PAUSED`). Yani bugün hiçbir silme çalışmıyor.

Açık nokta: "lisanslı öğrenci" bugün **sınav düzeyinde** korunuyor, **kurum lisansına** bakılmıyor.
- Lisanslı bir kurumun öğrencisi, sınav app'te hiç yayımlanmadıysa temizlenebilir.
- app'in lisans kuralında `institution_licenses` satırı olmayan kurum LEGACY_ACTIVE (lisanslı) sayılıyor. "Lisanslı kurum korunur" kuralı doğrudan eklenirse neredeyse hiçbir şey temizlenmez.

Soru: temizlikte "lisanssız" kimdir?
- (a) Bugünkü kural (sınav düzeyinde koruma).
- (b) Aktif ücretli lisansı (ANNUAL/PILOT/CUSTOM) olan kurumun öğrencileri hiç silinmez.
- (c) Yalnız app'e hiç erişimi olmayan, sonuç ağıyla eklenmiş kurumlar temizlenir.

Ayrıca süre kuralı (90 gün / 30 Eylül) onaylanmalı.

Sonraki iş: S015.

### S015 — sonuç kaynak kotası engeli, 23 Ekim

Durum: KOD HAZIR (#364). Kaynak temizliği kullanıcı onayı bekliyor; hiçbir kaynak silinmedi.

Bulgular:
- "Result Provider Isolation Probe" her PR'da gerçek hesapta önce sentetik bir R2 bucket (`anunex-result-probe-<PR>`) açıyor, sonra 4 Queue açmaya çalışıyor.
- Hesap 100 Queue sınırında olduğu için Queue adımı her PR'da kırılıyor. Bucket'lar hiç silinmiyor; şu an **128** adet var (227–363). Bu oturumdaki PR'lar da yaklaşık 24 tane ekledi.
- Probe, gerekli bir kontrol değil (merge'leri engellemedi). Ama her PR'da kaynak harcıyor ve hiçbir şey test etmiyor.
- Production sonuç akışının Queue'ları (artifact/retention) bu oturumdan listelenemedi; Cloudflare aracında Queue listeleme yok. Bu yüzden 100 sınırının production akışına etkisi henüz ölçülmedi.

Değişiklik (#364): probe artık yalnız sağlayıcıya dönük sonuç kodu ya da probe dosyaları değişince çalışıyor; elle çalıştırma korunuyor.

Kullanıcıdan gereken:
1. Kapanmış PR'ların sentetik bucket'larının ve kalan probe Queue'larının denetimli temizliği için onay. Mevcut audit/cleanup script'i yalnız PR252/253 için kilitli; genişletilmesi gerekecek.
2. Hesaptaki Queue listesi; Cloudflare panelinden ya da audit workflow'undan alınabilir.

### S016 / S017 — 10.000 ve 1.000.000 istek ölçümü, 23 Ekim

Durum: BEKLİYOR. Ölçüm başlatılmadı.

Sözleşme gereği yetkili, izole ortam ve bütçe olmadan pahalı yük başlatılmaz. Ücretli plan Aralık'tan önce yok. Ölçüm yokken "hazır" denmez. Eşikler (hata oranı, p95 gecikme) ve ortam kullanıcıyla belirlenecek; K004 ile birlikte ele alınabilir.

### S018 — sonuç mobil işlev kabulü

Durum: BEKLİYOR. Gerçek telefon ve masaüstü kabulü K002'de yapılacak.

### K001 — yedek ve geri dönüş kanıtı, 23 Ekim

Durum: BEKLİYOR (production onayı).

Araç hazır: "Verify Production D1 Recovery" workflow'u haftalık çalışıyor. Şunları yapıyor:
- Time Travel bookmark'ını doğruluyor;
- veritabanını izole runner'a dışa aktarıyor;
- sqlite'a geri yüklüyor, bütünlük ve tablo kontrolü yapıyor;
- dosyaları siliyor.

11 ve 18 Ekim çalıştırmaları production ortam onayı bekliyor ve hiç çalışmadı.

Not: tam D1 dışa aktarma bütün satırları okur. Ücretsiz plandaki günlük 5M okuma kotasından pay yer; düşük trafikli bir saatte onaylanmalı.

Uygulama sürümü geri dönüşü Cloudflare Worker sürümleriyle yapılabiliyor. S006 ile her dağıtım commit'ini taşıyacak.

### Bu turun sonu — kalan işler

- K002, A080, D001–D007, K004 ve K003, kullanıcı onayına ya da canlı/fiziksel teste bağlı.
- Açık PR'lar: #340–#364. App dağıtımı (run 39876760146) onaylanıp bittikten sonra sırayla merge edilecek.

### Sürüm 23 Ekim — #365, 23 Ekim 10:30

- Kullanıcı "yapılanları canlıya al" dedi.
- #340–#364 PR'ları tek sürüm dalında sırayla birleştirildi.
  - Çakışmalar giriş zincirindeydi; her iki handler korunarak çözüldü.
  - Yerelde typecheck, build ve tam test paketi (311 dosya, 1396 test) geçti.
  - CI verify geçti. Probe beklendiği gibi kırıldı (S015).
- #365 merge commit ile main'e alındı (`59eeec18`). 25 PR "merged" durumunda.
- Production dağıtımı run 39916896234 kuyrukta. "production-deploy" grubunu 21 Ekim'den beri onay bekleyen eski bir "Deploy App Production Only" çalışması (39570510411, `ab658f79`) tutuyor.
- Eski çalışmaları reddetme denemem oturum güvenlik kuralınca engellendi. Onay ve red kullanıcıda.

### Canlıya alma — 23 Ekim 11:50

- Kullanıcı Workers Paid planını (aylık 5 $) aldı. D1 günlük kota engeli kalktı.
- App: "Deploy Production Cloudflare Worker" run 39916896234, ikinci denemede başarılı.
  - 19 bekleyen veritabanı geçişi (0118–0136) uygulandı.
  - `app.anunex.com/api/health` → ready, release `59eeec1818b0`.
- Sonuç: "Deploy ANUNEX Result Network" run 39927045437 başarılı (attach kapalı).
  - `sonuc.anunex.com/api/health` → ready, release `59eeec1818b0`.
- İki alan da aynı sürümde. S001'deki "sonuç portalı 8 Ekim'den beri dağıtılmadı" farkı kapandı.
- Küçük bulgu: sonuc.anunex.com'un `/api/health` yanıtı kenarda önbelleğe alınıyor. İlk okumada eski yanıt geldi, sorgu parametresiyle güncel yanıt alındı. S006 sürüm karşılaştırması bu yüzden bayat sonuç verebilir; health yanıtına `no-store` eklenmeli.

### Sınav modeli ve geri bildirim incelemesi — 23 Ekim 12:10–12:50 (kullanıcı talebi)

İncelenen akış: sınav ekleme, dosya yükleme ve değerlendirme.

Kodda ve testte ek hata bulunmadı. Akışın özellikleri:
- Değerlendirme küçük parçalarla ve döngüyle yapılıyor.
- Kitapçık kararları, eşleştirme, mükerrer öğrenci ve dondurma/yayın kapıları korunuyor.
- Uçtan uca API testi (`evaluatedExam`) geçiyor.

Bir yan bulgu: ExamCenter'daki eski yükleme paneli tek istekle değerlendiriyordu, ama ölü kod. Satırlar ExamEvaluate'e yönleniyor. Bu yüzden dokunulmadı.

Düzeltilenler (PR #366, merge edildi):
- Sunucu tarafı:
  - Her API hatası JSON dönüyor; çıplak Cloudflare hata sayfası yok.
  - D1 günlük sınırı ve yoğunluk 503 ve açık Türkçe mesajla dönüyor.
  - Bilinmeyen hata kısa bir hata koduyla dönüyor ve loglanıyor.
- İstemci tarafı: bağlantı kopması, HTML ya da boş yanıt, düz metin hata ve HTTP durum kodları Türkçe mesaja çevriliyor.
- Butonlar: değişiklik başlatan buton istek sürerken meşgul görünüyor ve tekrar tıklamayı yok sayıyor. Çift gönderim önleniyor; Safari dahil.
- `/api/health` artık `no-store` gönderiyor.

Tasarım değiştirilmedi. Tasarım işi en sona bırakıldı; kullanıcı başka bir araçla yaptıracak.

Dağıtım: run 184 production onayı bekliyor. Sonuç Worker'ı için ayrıca "Deploy ANUNEX Result Network" çalıştırılmalı.

### S019–S022 — MEB kurum rehberi, kurum PIN'i, kurum kartı, app'e geçiş — 23 Ekim 17:30–19:00

Kullanıcı talebi ve kararları. Kullanıcı "en doğru kararları sen ver" dedi; verilen kararlar:
- PIN tek kullanımlıktır ve kurumun kendi yönetici hesabını açmasına yarar.
- Rehber, MEB'in herkese açık okul listesidir: ilkokuldan liseye, yalnız sınava giren okullar.
- Telefon ve adresi kurum kendisi girer.
- App'e geçen ya da geçmesi planlanan kurum dönem sonu temizliğinden muaftır.

**S019 (PR #373, merge edildi)**
- `scripts/meb-directory-csv.mjs`, MEB okul listesini Süper Admin'in "Kurum rehberi içe aktar" şablonuna çeviriyor.
- 31 Ağustos 2026 listesinden 46.802 okul çıktı: 22.747 ilkokul, 15.545 ortaokul, 8.510 lise.
- Canlı rehber şu an boş (0 kayıt). Hazır CSV kullanıcıya verildi.
- Özel okullar ve kurslar bu listede yok (12 kayıt hariç). OOKGM listesi gerekiyor. Bu sayfalar otomatik okumaya kapalı; kullanıcının indirmesi gerekiyor.
- Aylık güncelleme: aynı betikle yeni liste üretilip tekrar yüklenir. Yükleme mevcut kayıtları günceller (upsert), kopya oluşmaz.

**S020 ve S021 (PR #375, merge edildi)**
- Göç 0137: `institution_claim_pins`.
- PIN'i Süper Admin ya da kapsamındaki bayi veriyor. Kurum kaydı gerektiğinde rehberden otomatik açılıyor.
- Kurum, MEB ya da ANX kodu + PIN + yetkili e-posta/telefon/şifre ile hesabını bir kez açıyor.
- PIN denemeleri atomik sayılıyor. 5 hatada PIN kilitleniyor ve yeni PIN gerekiyor.
- Kurum kartı alanları: yetkili, telefon, e-posta, adres.
- Elle kurum açma ve düzenleme bu iletişim alanlarıyla çalışıyor.

**S022 (PR #375, merge edildi)**
- Göç 0138: `institution_app_conversions`.
- Temizlik, işaretli kurumu atlıyor.
- Süper Admin geçişi işaretleyebiliyor, iptal edebiliyor (yalnız planlı durumdayken) ve tamamlayabiliyor.
- Tamamlama, ödeme onayıyla misafir öğrencileri lisans limiti içinde app öğrencisine çeviriyor. Sınav geçmişi aynen kalıyor; veri kopyalanmıyor.

Kanıt: `s019`, `s020` (5 test), `s022` testleri; retention testine iki koruma modu eklendi. Tam test paketi 314 dosya / 1405 test.

Not: 4 işçide çalışırken `question-generation-jobs` testi yük nedeniyle 5 sn zaman aşımına düşebiliyor. 2 işçide geçiyor; bu değişikliklerle ilgili değil.

**Tasarım PR'ları (#367–#372, ChatGPT) incelendi**
- Değişiklikler yalnız CSS, belge ve ekran görüntülerinden oluşuyor.
- #372'de `GuidanceReportPanel.tsx` içinde yalnız sarmalayıcı `className` eklenmiş; iş mantığı değişmemiş.
- CI verify geçiyor.
- Mor renk yok. #367'deki `--content-violet` değişkeninin değeri mavi-gri (#3d627f).
- Merge oturum kuralınca bana kapalı; kullanıcı merge edecek.

**Dağıtım**
- Run 185 (S019) kuyruğu tutuyor. Reddedilmeli; yerine run 186 (S020–S022) onaylanmalı.
- Sonuç Worker'ı ayrıca dağıtılmalı.

### S023 — Kurum rehberi CSV aktarımı: ilerleme, hata ve onay mesajları — 26 Ekim

**Sorun (canlı veriden):** 13 aktarım çalışmasının ilk 9'u 500'er satırla tamamlandı. 10. çalışma 159 satırdan sonra 3. D1 yazımında (≈4.659. satır) düştü ve `RUNNING` olarak asılı kaldı. Rehberde 46.802 okuldan 4.684'ü var. Hata yalnız sayfanın en üstünde gösterildiği için kullanıcı hiçbir şey görmedi.

**Düzeltme (PR #377, merge edildi):**
- 250 satırlık paketler; geçici hatada 3 yeniden deneme (1/2/4 sn). 4xx hatalar (429 hariç) denenmez.
- Yükleme alanının hemen altında ilerleme çubuğu; bitince "N kurum kaydedildi, M satır geçersiz" onayı.
- Hata olursa neden ve hangi satırda durduğu yazılır; "Kaldığı yerden devam et" butonu.
- Rehberdeki güncel kurum sayısı gösterilir.
- Sunucu: paket yazılamazsa çalışma `FAILED` olur ve `DIRECTORY_IMPORT_FAILED` (503) döner. Doğrulama hataları ayrı kodlarla: `DIRECTORY_SOURCE_INVALID`, `DIRECTORY_SOURCE_URL_REQUIRED`, `DIRECTORY_ROWS_INVALID`.
- Aynı paket yeniden gönderilince kayıt çoğalmaz (upsert).
- Test: `tests/directory-import-feedback.test.ts` (5). Tüm paket 1412/1412, typecheck ve build temiz.

**Bekleyen:** app deploy'u (main push ile başladı) ve sonuc deploy'u (`Deploy ANUNEX Result Network`, attach_domain=false) kullanıcı onayında. Deploy sonrası `anunex-kurum-rehberi-meb.csv` yeniden yüklenecek.

### S024 — Rehberdeki kurumların listelenmesi — 26 Ekim

**Sorun:** 46.803 MEB okulu rehbere yüklendi, ama "Kurum listesi" yalnız kartı açılmış kurumları (`institutions`) gösteriyordu. Kullanıcı kurumları göremedi. Ayrıca rehberdeki bir okulun kartı, PIN verilmeden açılamıyordu (404).

**Düzeltme (PR #379, merge edildi):**
- `GET /api/admin/result-network/institution-directory` (yalnız Süper Admin): ad/kod arama, il/ilçe filtresi, 50'lik sayfa, durum (Rehberde kayıtlı / Kurum kartı açık / Hesabını açtı).
- Rehberdeki okulun kartı ilk açılışta oluşur: Süper Admin her okul için, bayi yalnız kendi kapsamında. Okul yöneticisi başka okulun kartını açamaz.
- Yeni "Rehberdeki kurumlar" paneli. "Kurum listesi" açıklaması: kartı açılmış ve elle açılan kurumlar.
- Kararlar: 46 bin okul `institutions` tablosuna toplu kopyalanmadı (app'teki kurum listeleri, lisans ve sayımları şişirmemek için); kart ihtiyaç anında oluşur.
- Test: `tests/s024-directory-browser.test.ts`; tüm paket 1413/1413.

**Bekleyen:** app deploy onayı; sonuc deploy'u (`Deploy ANUNEX Result Network`) kullanıcıda.

### S025 — Rehber satırı işlemleri ve app'te tablo görünümü — 26 Ekim

- Takılı aktarım kaydı (24 Ekim, RUNNING) kullanıcı onayıyla FAILED olarak kapatıldı.
- PR #380 (merge edildi): okul adına tıklayınca kart satır altında açılır; satırda Düzenle / Pasife al / Etkinleştir / Dondur. Kart ilk kullanımda oluşur, mevcut durum akışı (gerekçe istenir) çalışır.
- MEB okulları için "Sil" konmadı: rehber kaydı MEB'den geldiği için silinse bile sonraki aktarımda geri gelir; doğru karşılığı "Pasife al". Kartı açılmış kurumlarda mevcut "Sil / arşivle" Kurum listesinde duruyor.
- App'te Kurum listesi bozuk görünüyordu: stiller yalnız sonuc'ta yükleniyordu. Yapısal kurallar `src/pages/result-network-admin.css`'e alındı.
- sonuc.anunex.com'da görünmemesinin nedeni: sonuc 24 Ekim sürümünde; `Deploy ANUNEX Result Network` kullanıcı tarafından çalıştırılmalı.

### S026 — sonuc.anunex.com: oturum, değerlendirme, kurum seçimi, geçmiş — 26 Ekim

- PR #382 (merge edildi). Yenilemede operatör ve öğrenci ekranı mevcut oturumdan geri yüklenir; öğrenciye "Güvenli çıkış" (`POST /api/public/results/logout`, oturumu iptal eder).
- Sınav İşlemleri: işlevsiz kutular kaldırıldı; değerlendirme ekranı bölümün içinde. App'te sonuc bağlantısı (operasyon API'si yalnız sonuc worker'ında).
- Kurum seçimi: `GET /api/admin/result-network/operations/institutions` — yetki kapsamındaki MEB rehberinde arama; kartı olmayan okul yüklemede açılır (`mebCode`), bayi kapsamı dışı 403.
- Değerlendirme geçmişi: `GET /api/admin/result-network/operations/history`; önceki değerlendirme açılır.
- Test: `tests/s026-sonuc-evaluation.test.ts`.

### S027 — Merkezi sınav tüm kurumlara açık — 26 Ekim

- Kullanıcı kararı: Süper Admin'in tanımladığı merkezi sınav kurum seçmeden tüm kurumlarda kullanılır; kurumun kendi sınavını yalnız o kurum görür; kurum seçimi zorunlu değil.
- PR #383 (merge edildi): `exam_institutions` boşsa sınav herkese açık, liste yalnız daraltır (`worker/lib/exam-audience.ts`). Aktifleştirmede kurum zorunluluğu kalktı. Kurum paneli aktif sınavda da düzenlenir; "Tüm kurumlara aç". Sonucu olan kurum listeden çıkarılamaz (409).
- Eski zorunlu atamayı doğrulayan 3 test yeni kurala göre güncellendi.
- Bekleyen (kullanıcı onayı): il/ilçe/okul türü kapsamı, hariç tutma, CSV okul listesi, tarih aralığı vb.

### S028 — Kazanımlı cevap anahtarı MEB eşleşmesi — 26 Ekim (BEKLİYOR: kullanıcı kararı)

Canlı veriden teşhis:
- Doğrulanmış MEB kataloğunun tamamı 2027-2028 / SCHOOL (TYMM). Sınavlar 2026-2027 → katalog boş geliyor, hiçbir soru eşleşmiyor.
- TYT/AYT için katalog yok; TYT dersleri (`sub_tyt_mat` vb.) katalog derslerine (`sub_mat`, `sub_fiz`…) bağlı değil.
- Yayınevi anahtarındaki kodlar (21.4.5, 10.3.2) MEB kodu değil; başlıklar konu adı ("Aralık Kavramı ve Basit Eşitsizlikler"), MEB kazanım cümlesi değil → birebir eşleşme zaten tutmaz.
- 4K TYT taslağında "kazanım zorunlu" işaretli (OFFICIAL_REQUIRED), 0 eşleşme → aktifleştirme kilitli. Kazanım varsayılanda isteğe bağlı.
