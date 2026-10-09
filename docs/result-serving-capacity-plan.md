# Sonuç servisinin yüksek kapasiteye geçiş planı

9 Ekim 2026 ölçümleri: tek D1 üzerinde 1.000 istekte p95 2,43 saniye ve doğru yanıt; 2.000 istekte p95 5,09 saniye; 4.000 istekte 898 hata ve D1_OVERLOAD kayıtları. 10.000/1.000.000 kapasitesi onaylanmadı. Kuyrukta bir milyon sentetik kaydı işlemek, bir milyon kişinin aynı anda sonuç okumasıyla aynı kabul değildir.

## Seçilen yön

Yayımlanmış sonuç içeriği mevcut özel R2 artifact akışında tutulacak. Sık kullanılan öğrenci sonuç GET yolu, her istekte merkezi D1 sorgulamak yerine dağıtılmış erişim otoriteleri üzerinden yetkilendirilecek. Merkezi D1 sınav yönetimi, yayın iş durumu ve denetim kayıtlarını tutacak.

Öğrenci erişim otoritesi, öğrenciye göre dağıtılmış Durable Object ve kalıcı SQLite durumu olacak. İstek üzerinde doğrulanmış ve IP'ye bağlı oturum kontrolü yapılacak. Oturum iptali, kod deneme sayısı, süre aşımı ve kullanıcı kapsamı burada güncel olarak tutulacak. KV veya yanıt önbelleği bu otoritenin yerine geçmeyecek.

Kurum kodu + sınıf + HMAC arama belirtecinin dizini ayrı bölümlere dağıtılacak; açık TCKN depolanmayacak. Kod doğrulaması bir kez yapılacak; sonuç GET tekrarları kodu yeniden tüketmeyecek. Cookie imzası doğrulanmadan herhangi bir öğrenci otoritesine yönlendirme yapılmayacak.

Yayın kontrolü öğrenciye göre ayrılmış çok sayıda kontrol bölümünde tutulacak. Başlangıç bölüm sayısı yük ölçümüyle seçilecek; 64/128/512/2048 bölüm adayları otomatik olarak kapasite garantisi sayılmayacak. Aynı sınavın milyon öğrenci tarafından okunması tek yayın otoritesini darboğaza dönüştürmemeli.

## Güncellik ve kapatma kuralı

Yeni sonuç sürümünün bütün özel dosyaları hazırlanıp hash kontrolleri geçmeden yayın açılmayacak. Düzeltmede önce eski okuma kapıları durdurulacak; bütün durdurma onayları alındıktan sonra merkezi sürüm kaydı değişecek ve yeni sürüm açılacak. Eski kuyruk mesajları monotonic epoch ile reddedilecek.

Yayını geri çekme ve yetki iptali, etkilenen bütün erişim otoritelerinin onayı alınmadan tamamlandı olarak gösterilmeyecek. Uzun işlem 202/pending iş olarak izlenecek; başarı cevabından sonra eski sonuç veya eski yetki kullanılamayacak. Kısmi hata erişimi kapalı tutacak ve iş yeniden güvenle yürütülebilecek. Bu davranış kullanıcıya açık işlem durumu olarak gösterilmeli.

Süre aşımı her otoritede denetlenecek. Yanıtlar private/no-store olacak. R2 hash doğrulaması, öğrenci/kurum izolasyonu ve yayın sürümüne sabitleme korunacak. Bu plan, mevcut merkezi izin kontrolüne eklenmiş gevşek bir cache planı değildir.

## Uygulama sırası

1. Bölüm yönlendirme, oturum imzası, kalıcı otorite durumu ve replay/epoch sözleşmelerini yaz.
2. Mevcut kod verme, doğrulama, iptal, yayınlama/düzeltme/geri çekme işlemlerini iki aşamalı ve idempotent otorite işlemlerine bağla.
3. Mevcut veriyi yalıtılmış test ortamında taşı; çift okuma karşılaştırmasıyla eski ve yeni sonuçları doğrula. Taşınmamış kayıtlar güvenli biçimde mevcut yoldan okunacak; yeni yol başarısızsa yetki sınırını atlayan geri dönüş olmayacak.
4. Yeni öğrenci GET yolunu özellik bayrağı arkasında test et. Oturum iptali, yabancı IP, kurumlar arası erişim, emekli sürüm, eksik/bozuk artifact ve gecikmiş kuyruk mesajlarını test et.
5. Her katmanda gecikme/hata/otorite bölüm dağılımını ölçerek 1.000 → 2.000 → 4.000 → 10.000 doğru ve yetkili istek kabulünü kapat. Ayrı gerçek kullanıcı/oturum sayısı, süreli yük ve ağ bölgeleri raporlanmalı.
6. Bir milyon istek için hesap planı ve kullanım bütçesi kararından sonra aynı kabulü çalıştır. Örneklem sonucu bir milyon kapasitesi olarak sunulmayacak.
7. Üretim geçişinde geri dönüş planı ve metrik eşiğiyle küçük kullanıcı grubundan başla; kurum verisi ve dosya gizliliği tekrar doğrulansın.

## Kaynak kararı

Mevcut Free hesapta bir milyon dinamik istek denemesi günlük sınırı aşar. Workers Paid ve kullanılan Durable Object/R2/Queue kaynaklarının aylık maliyeti kullanıcı tarafından onaylanmadan satın alma yapılmayacak. Ücretli plana geçmek tek merkezi D1 darboğazını kendiliğinden çözmez; yukarıdaki dağıtık yol ve ölçüm yine gereklidir.

Bu dosya tasarım ve sıradaki uygulama sözleşmesidir. Dağıtık otorite kodu henüz uygulanmadı, yeni kapasite sertifikası verilmedi ve üretimde etkinleştirilmedi.
