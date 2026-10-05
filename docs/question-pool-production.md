# Kazanım kapsamı ve üretim talepleri

5 Ekim 2026. Bu sürüm, ortak platform havuzunun doğrulanmış aktif çıktıları
ne kadar karşıladığını ölçer ve eksikler için kalıcı üretim talepleri tutar.
0073 ile manuel çalıştırılan kontrollü taslak yürütücüsü eklenmiştir. Cloudflare
Queue tüketicisi veya arka plan cron üretimi yoktur; yürütücü varsayılan kapalıdır.

## Kapsam hesabı

Süper Admin, İçerik Merkezi > Kazanım kapsamı ekranından yıl, sınıf ve ders
seçer. Her çıktı, sıfır sorulu olsa da listelenir. Sayfa başına en fazla 50
çıktı ve kimlik imleci kullanılır. Hedef, çıktı başına 10 onaylı farklı sorudur;
bu bir başlangıç havuzu hedefidir, sınırsız soru veya öğrenciye yeni test garantisi
vermez. Öğrencinin gördüğü sorular ayrıca mini test başlatırken elenir.

Yalnız PLATFORM sahipli ortak sorular sayılır. Kurum/user havuzları genel
kapsama eklenmez. Soru yıl, sınıf, ders ve çıktı bağlantısıyla eşleşmelidir.
Kullanılabilir onaylı soruda OWNED/LICENSED/PUBLIC_DOMAIN hakkı, dolu soru metni,
4/5 geçerli seçenek ve tutarlı A-E anahtar aranır. İncelemedeki/taslak ham
kayıt sayıları ayrı gösterilir; onaylı sayıya katkı yapmaz.

Metnin SQLite lower(trim()) değeri ve seçenek JSON'unun tam eşitliğiyle
kopyalar bir kez sayılır. Bu, semantik özgünlük veya görsel bayt eşsizliği
kontrolü değildir. Geçerlilikte JSON ve boş metin/seçenek güvenle reddedilir.
Sayım ve gruplama D1 içinde yapılır; Worker ham havuz içeriklerini yüklemez.

GET /api/question-bank-standard/coverage academicYear zorunlu; gradeLevel,
subjectId, limit1..50 ve cursor isteğe bağlıdır. Bu endpoint yalnız Süper Admin
kapsamındadır, öğrenci verisi döndürmez.

## Kalıcı talep

0072 question_generation_jobs tablosunu oluşturur; 0073 üretim durumlarını
REQUESTED/RUNNING/REVIEW_READY/FAILED/CANCELLED olarak genişletir.
POST /api/question-bank-standard/generation-jobs, çıktı kimliği, ekranda görülen
CV/yıl/sınıf/ders/program bağlamı, 1..10 soru hedefi ve UUID requestKey ister.
Doğrulanmış aktif bağlam hem okunurken hem koşullu INSERT sırasında kontrol
edilir; çıktı başlığı/kodu da yakalanan kaynak bilgisi olarak korunur.

Aynı anahtar ve aynı içerik aynı talebi döndürür. Anahtar başka içerikle
kullanılırsa 409 olur. Çıktı/CV başına aynı anda tek REQUESTED talep vardır;
başka anahtarla çoğaltma 409 olur, miktar sessizce değişmez. İptal tekrarı ilk
aktör/zamanı korur. İptal edilmiş anahtarın yeniden gönderimi aynı CANCELLED
kaydı döndürür; yeni talep için yeni anahtar gerekir.

GET aynı adres academicYear ve isteğe bağlı outcomeId/status/limit/cursor ile
liste sağlar. PATCH /api/question-bank-standard/generation-jobs/:id/cancel
iptal eder. Bütün işlemler Süper Admin içindir. Talep, üretilmiş veya onaylanmış
soru değildir; ekran bunu açıkça belirtir.

## Kontrollü yürütücü

POST /api/question-bank-standard/generation-jobs/:id/run, etkinleştirme açıkken
Süper Admin tarafından çalıştırılır. Talebi kiralar, kaynak bağlamını yeniden
doğrular, sınırlı sayıda taslak üretir ve geçerli çıktıları kaynak talebi/modeli
ile ilişkilendirerek AI_GENERATED + REVIEW olarak atomik kaydeder. Sonra mevcut
revizyon/bağlam tanıklı insan incelemesi kapısından geçilir. Otomatik onay yoktur.

Başlangıç modeli GLM-4.7-Flash seçilmiştir. Kodun eklenmesi canlı üretim ayarını
etkinleştirmez. Ayrıntılar: question-generation-runner.md. Türkçe içerik kalite
pilotu, anlamsal tekrar kontrolü, süreç/rubrik görevleri ve arka plan otomasyonu
ayrı işlerdir.
