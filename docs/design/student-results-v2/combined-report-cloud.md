# Cloud teknik görevi: Sonuç öğrenci portalında birleşik karne

Repo yildizyayin/yildiz-sinav; yalnız sonuç portalı. Tasarım hazır sayılmaz; bu dosya uygulanması gereken teknik sözleşmedir. Görünüm turu worker/lib/API/auth/tests/workflow değiştirmez.

## Mevcut engel

`worker/result-worker-entry.ts` sonuç ürününde `/api/reporting` yollarını açmaz. Lisanslı uygulamadaki frozen-combined raporu kurum/öğrenci lisans oturumunu kullanır; sonuç portalının `resultIdentity` oturumuna bağlanmış değildir. Bu sınırı kaldırma veya lisanslı API'yi genel erişime açma. `/api/public/results/student` en fazla50 satır döndürür: bunu 'tüm sınavlar' diye sunma.

## İstenen davranış

- Öğrenci yalnız kendi yayımlanmış ve o anda erişimine açık sabit snapshot sonuçlarından karne oluşturur. Ön yüzün gönderdiği kurum/öğrenci kimliğine güvenme; HttpOnly sonuç oturumu ve resultIdentity ile çöz.
- Son5: eğitim yılı ve sınav ailesi seçili uygun sınavları exam_date ve kararlı kimlik ile tarihe göre seç. Tüm sınavlar: aynı kapsamın gerçekten tamamı, sayfalı/sınırlı istek stratejisiyle. Özel seçim: her sınav için ayrı erişim/yayın/snapshot/retention kontrolü. Yayımdan kaldırılmış, süresi dolmuş, başka öğrenciye ait kayıt içeriğini döndürme.
- LGS/TYT/AYT/okul içi, eğitim yılı, sınıf ve farklı puanlama profilleri ayrı gruplar. Farklı ölçeklerdeki puanları tek ortalamaya çevirme.
- Net ortalaması hangi sınavlardan ve kaç kayıttan hesaplandığını gösterir. Farklı soru sayılarını açıklamadan ham net üzerinden gelişim karşılaştırması yapma; doğrulanmış soru sayısı ve puanlama sözleşmesi varsa normalize edilmiş göstergeyi ayrı etiketle.
- Doğrulanmış kazanım kanıtlarını outcome kimliği + müfredat sürümü ile gruplandır; kanıt sayısına göre hesapla. Kazanımı olmayan sınavın net sonucu kullanılabilir, kazanım hesabına katılmış gibi gösterilemez. Bilinmeyen kanıt/soru sayısını sıfır varsayma.
- Yeni genel Türkiye/kurum sırası üretme; eski sınavların sıralamalarının ortalamasını yeni sıra gibi sunma.
- İstek/yanıt seçili kapsamı, kullanılan/atlanmış sınavları, kaynak snapshot ve kazanım analiz sürümlerini, tarih aralığını, eksik veri uyarılarını içerir. Sabit puan sonucunu sonradan kazanım eklenince değiştirme.
- Kaynak rapor verisi PDF indirmede tekrar yetkilendirilir. Gerçek PDF desteği mevcut printSection'dan farklıysa açıkça belirt; tarayıcı yazdırmayı PDF dosyası API'si gibi tanıtma.
- Nibiru metni yalnız doğrulanmış sonuç kanıtına dayanır; bilinmeyen hedef/olasılık/karşılaştırma uydurma.

## Arayüz bağlantısı

Sınavlarım → Birleşik karne oluştur → Son5 / Tümü / Kendim seçeyim. Eğitim yılı ve sınav ailesi görünür. Hazırlanıyor/boş/yetkisiz/yayın değişti/ağ hatası durumları ayrı. Oluşan ekranda kaynak listesi, ders ortalamaları, karşılaştırılabilir gelişim, kazanım özeti ve çıktı. Teknik bağlantı bitmeden aktif sahte düğme ekleme.

## Kabul

Başka öğrenci/kurum kimliği ile istek; geri çekilen yayın; expired session; eksik artifact;50 üzeri kayıt; karışık yıl/aile/profil; eksik puan; farklı soru sayısı; doğrulanmamış kazanım; analiz revizyonu; özel seçim tekrarı; boş seçim; istek limiti ve iptal davranışı test edilir. Mevcut sınır, oturum ve gizlilik testleri gevşetilmez. Ayrı PR; npm ci/typecheck/test/build ve gerçek sonuç Worker sınırında sentetik entegrasyon kanıtı.
