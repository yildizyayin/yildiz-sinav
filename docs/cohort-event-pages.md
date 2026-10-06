# Uzun bireysel kanıt geçmişini kurum raporunda sayfalama

Kodlanmıştır, varsayılan kapalıdır. Test/build/typecheck/migration/provider işlemleri bu aşamada çalıştırılmadı. Ana arka plan raporu sözleşmesi [private-cohort-background-report.md](private-cohort-background-report.md).

## Kayıt sayısı sınırını kaldıran devam akışı

Hızlı kurum raporu ve küçük arka plan bölümleri eski 5.000 kayıt kontrolünü korur. Arka plan işinin tek dönem kaydı da bu sınırı aşıyorsa işi başarısız saymak yerine kalıcı olay akışına geçilir. Bütün seçili kaynaklar aynı kurum/yıl/dönem ve `asOf` bağlamında yeniden okunur; hızlı denemeden kalan eksik toplam eklenmez.

Her mesaj bir kaynak, seçilmiş soru pratiği veya temizlik sayfasını işler. `pending_json` aynı öğrencinin yerel toplamını, fazı ve devam konumunu saklar. İşin ana enrollment cursor'u ancak bu öğrencinin bütün kaynakları ve geçici seçim temizliği tamamlanınca ilerler. Son bir boş dönem sayfası kurum raporunu bitirir. İşlenmiş öğrenci sayısı ile uzun geçmişte tüketilmiş kaynak kaydı sayısı panelde ayrı görünür.

Kaynak sayfaları yalnız server-to-server partition parametresidir; URL sorgusu veya tarayıcı isteği ham kanıt okuma yetkisi vermez. Tek enrollment ve seçili bilinen source zorunludur. Cursorlar SQL'e bind edilir. EXAM snapshot.id, assessment_runs.id, FOY response_id ve GAME session_id keyset kullanılır. Sıralama ve seek aynı DB karşılaştırmasına bağlıdır; 251 satır alınır, en fazla 250 tüketilir. 1 MB JSON bütçesinde adaptif prefix ile durulur; tek kayıt bu boyutu aşarsa açık hata ve hiçbir eksik rapor verilmez.

## İlk/son soru pratiği

Normal raporla aynı `selectFrozenPracticeRows` doğrulama ve repeatKey sözleşmesi kullanılır. Geçerli seçim adayları geçici `private_cohort_practice_picks` tablosunda job + enrollment + repeatKey ile tutulur. FIRST/LATEST bütün ham sayfalar arasında tamamlanır; bir sayfanın son çözümü tüm geçmişin son çözümü sayılmaz.

Önce kanıt zamanı milisaniye olarak karşılaştırılır. Eşit zamanda run ID için JavaScript UTF-16 sırasını koruyan hex `run_order` kullanılır; SQL'in Unicode byte sırası seçimi değiştirmez. Her sayfa `json_each` ile tek koşullu UPSERT yapar; 250 ayrı DB yazması yoktur. Geçici satır yalnız reducer'ın gerekli donmuş alanlarını taşır; genel metadata ve kullanıcı notları kopyalanmaz.

Ham tarama bitince seçilmiş soru pratikleri ayrıca sayfalanıp reducer'a verilir. Tekrar sayısı bütün geçerli deneme sayısı eksi seçilmiş benzersiz kayıt sayısıdır; legacy/invalid kapsamları ham taramada sayılır. Seçilmiş satırlar raw coverage'e tekrar eklenmez.

## Sayma, atomiklik ve temizlik

Aynı enrollment'ın kaynak/olay sayfaları birleşirken sınıf-ders, kazanım ve oyun katılımcısı 0/1 olarak tutulur. Akademik kanıt, kaynak dökümü, iptal, oyun puan toplamı ve süre/XP toplanır; yalnız tamamlanan enrollment kurum toplamına bir defa katılır. Kazanım etiketi çelişkileri ve tarih seçimi korunur; geri bildirim final raporda yeniden üretilir.

Geçici UPSERT/silme ve job ilerleme UPDATE'i aynı D1 batch transaction içinde, aynı sabit commitAt/lease token/eski enrollment cursor/step_no/iki kaynak revizyonu koşuluyla yapılır. Bir mesaj tekrar teslim edilirse veya eski worker geç dönerse seçim ve toplam iki kez commit edilmez. Ara toplam indirilemez. Kaynak değişimi veya yetki iptali raporun sonlandırılmasını gerektirir.

Normal bitişte seçilmiş pratikler 250 rowid'lik sayfalarda silinir, sonra enrollment toplama geçilir. FAILED/REVOKED işler için cron turunda en fazla iki işin 250'şer geçici satırı temizlenir. Expiry temizliği de bu tabloyu temizler; geçici kayıt varken cleanup_done tamamlanmaz. Özellik kapalıyken özel bucket binding'i korunursa cron temizliği devam eder. 24 saat indirilemez olma sınırı fiziksel D1 silinme süresi garantisi değildir. Çok büyük birikimde temizlik gecikebilir; R2 lifecycle D1 verisini temizlemez. Bu nedenle D1 temizlik kapasitesi/gecikmesi staging rol-retention kabulünün bir parçasıdır.

Kaynak sayfası en çok 1 MB, kompakt seçilmiş pratik satırı 30.000 bayt, repeatKey 4.096 karakter, pratik yazma paketi 450.000 bayt, bekleyen enrollment durumu 450.000 bayt. Yazma paketi büyükse tüketilen ham prefix daraltılır; seçilmiş pratik okumalarında da 1 MB prefix kullanılır. Mevcut 350.000 bayt aggregate, 500 ders/oyun ve 1.000 kazanım grubu sınırları sürer. Kayıt sayısı sınırsız kapasite garantisi anlamına gelmez; boyut, süre, kaynak değişimi veya hizmet sınırlarında eksik rapor yerine hata verilir.

## Kurulum ve son doğrulamalar

0084 migration'ı 0083 üzerine uygulanmalıdır; hiçbir ortama uygulanmadı. Yeni source page indexleri, geçici seçim tablosu ve pending/step/processed_events sütunlarını ekler. Feature flag, özel queue/DLQ/bucket aynı ana rapor yapılandırmasını kullanır; yeni canlı kaynak açılmadı.

Son testler: 5.000'den fazla tek-enrollment kanıtı; sınırları aşan ve tam sayfa boyunda kayıtlar; FIRST/LATEST'in eski/yeni sayfada farklı sıra ve aynı zamanda Unicode ID ile seçimi; invalid/legacy/duplicate kapsamlarının normal reducer ile eşitliği; çok sayfalı ders/kazanım/oyun katılımcısının bir olması; mini test ve EXAM snapshot kanıtının bölünmemesi; tarih/seçili sınav/yeniden yayınlama/rol değiştirme; crash/duplicate delivery/lease takeover/step fencing; SQL batch rollback ve json_each UPSERT; adaptive prefix; tamamlanmadan CSV'nin reddi; feature off/expiry/abandoned temizliği ve gerçek D1/queue/R2 kaynak maliyeti. Güncel head'de bu testler henüz yapılmadı.

## Rehber sınıfı

GUIDANCE_TEACHER işlerinde aynı kaydedilmiş classId/seasonId kapsamı event frame'e de aktarılır. Identity okuması ve her source page yalnız bu aktif sınıf/dönemin ACTIVE enrollment'larına bağlıdır. READ/PICKS/CLEAN girişinde etkin GUIDANCE assignment yeniden aranır; eski kurum veya eski dönem kapsamına genişleme yapılmaz. Atama revizyonu0085, pending/ready sonuçlar için mevcut generation fence'e dahildir.
