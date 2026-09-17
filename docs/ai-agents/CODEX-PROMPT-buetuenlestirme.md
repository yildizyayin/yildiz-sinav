BAĞLAM

yildiz-sinav projesine kademeli olarak bir "AI ajan ekibi" ekliyoruz:
GitHub Actions üzerinde 7/24 çalışan, izleme/test/kod-yazma/bildirim
görevlerini üstlenen otonom işçiler. Şimdiye kadar tasarlanan ve
kodlanan parçalar ekli dosyalarda. Senden istediğim, bunları tek tek
elle anlatmak yerine, kendi başına bütünleştirip production-ready hale
getirmen.

EKLİ DOSYALAR NELERİ İÇERİYOR (özet)

- 6 adet GitHub Actions workflow'u (izleyici, içerik-tarama, triyaj,
  kod-yazıcı, yük-testi, deploy-doğrulayıcı)
- Bir Cloudflare Worker (onay-worker) + wrangler config: SMS/WhatsApp
  üzerinden tek-tık onay akışı için
- Bir composite action (sana-bildir): diğer workflow'ların onay-worker'ı
  tetikleyip Twilio ile bildirim göndermesini sağlıyor
- Bildirim sistemi kurulumu için ayrı bir görev listesi
- (Varsa) diğer karar/durum dosyaları

GÖREVİN

1. Ekli tüm dosyaları oku, birbirleriyle tutarlı olup olmadığını
   kontrol et (env değişken isimleri, secret isimleri, action_type
   değerleri gibi noktalarda uyuşmazlık olabilir - varsa düzelt).
2. Bunları mevcut repo yapısına (.github/workflows/, .github/actions/,
   ve onay-worker/ için ayrı bir dizin) entegre et.
3. Placeholder olarak bırakılmış yerleri (ZONE_ID, KV_NAMESPACE_ID,
   domain listeleri vb.) projenin gerçek değerleriyle doldur - bu
   değerleri repo içinde veya Cloudflare hesabında bulabiliyorsan kendin
   bul, bulamıyorsan net bir liste halinde bana sor.
4. Gerekli tüm GitHub Secrets/Variables ve Cloudflare kaynaklarının
   (KV namespace, worker deploy) kurulumunu uçtan uca tamamla veya
   tamamlanması için bana adım adım ne yapmam gerektiğini söyle
   (özellikle hesap oluşturma gibi benim yapmam gereken adımlarda).
5. Her workflow için bir kere test/deneme çalıştırması yap
   (workflow_dispatch ile), sonuçları doğrula.
6. Mevcut ci.yml / deploy.yml ile çakışma olup olmadığını kontrol et,
   varsa çöz.

RİSK VE KISITLAR

- Hiçbir workflow production'a otomatik deploy/merge YAPMAMALI - kod
  yazıcı ajanı sadece PR açar, onay-worker sadece benim onayımla
  merge eder.
- Ödeme/finansal veriye dokunan hiçbir otomasyon EKLEME - o kısım
  bilinçli olarak bekletiliyor.
- MEB/ÖSYM müfredat verisi veya resmi kural içeren dosyalara otomatik
  yazma YAPMA.
- Emin olmadığın bir entegrasyon noktasında (özellikle claude-code-action
  gibi üçüncü parti action'ların güncel kullanım şeklinde) varsayımda
  bulunmak yerine güncel dokümantasyonu kontrol et.

ÇIKTI OLARAK BENDEN BEKLENEN

İşin sonunda bana şunları raporla:
1. Hangi ajanların tam çalışır durumda olduğu, hangilerinin hâlâ benim
   bir aksiyonumu (hesap açma, onay verme vb.) beklediği
2. worker/ ve src/ klasörlerinin güncel gerçek yapısı (bir sonraki
   fazda Nibiru AI personalarını - Rehber Öğretmen, Branş Öğretmen,
   Öğrenci Koçu - bu gerçek yapıya göre entegre edeceğiz)
3. Varsa, tasarım kararlarımızla çelişen ya da net olmayan noktalar

[BURAYA DOSYALARI EKLE]
