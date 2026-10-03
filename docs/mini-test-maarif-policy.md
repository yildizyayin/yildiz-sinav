# Mini test: öğrenme çıktısı, yeni sorular ve isteğe bağlı tekrar

Resmî dayanak: https://tymm.meb.gov.tr/olcme-degerlendirme (3 Ekim 2026).
MEB aşamalı süreç bileşenlerini yoklama, biçimlendirici geri bildirim ve farklı
öğrenme kanıtlarıyla değerlendirme ister. Çoktan seçmeli mini test bunlardan
biridir; performans görevi, açık uçlu yanıt, öz değerlendirme ve rubrikler ayrıca
sürüm bazında hazırlanmalıdır. Bu değişiklik tüm Maarif becerilerini ölçtüğünü
iddia etmez. Mevcut %80 eşiği uygulamanın çalışma eşiğidir, MEB yeterlik standardı
olarak sunulamaz.

## Uygulanan politika

- Öğrenci kendi aktif kurum/dönem/sınıfındaki doğrulanmış programın her aktif
  öğrenme çıktısını Nibiru kataloğunda görebilir ve test başlatabilir. Yeni test
  oluşturmak için günlük eksik kazanım planı gerekmez.
- Test başlatırken aynı sınıf/yıl/ders/öğrenme çıktısı için onaylı, telif uygun,
  erişilebilir sorular seçilir. Yeni modda önceki mini test, soru pratiği ve
  assessment yanıt kayıtlarında bulunan sorular seçilmez. Hazır test devam
  ettirilebilir; bu yeni test olarak sunulmaz.
- Aynı metin ve seçeneklerin farklı kimlik/erişilebilir sahip ile kopyalanması
  yeni soru sayılmaz. Bu kontrol semantik benzerlik veya görsel byte benzerliği
  garantisi değildir. Dijital soru pratiği listesindeki sunuma hazırlanan sorular da exposure
  kaydına alınır; yanıt verilmemiş olsa bile yeni mini testte dışlanır. Başka
  kanallardaki yalnız görüntüleme ve dış baskı olayları için ayrıca kayıt gerekir.
- Test 5–10 sorudur, toplam test sayısında sabit sınır yoktur. En az 5 yeni soru
  yoksa NEW_QUESTIONS_REQUIRED ve kullanılabilir/gerekli sayılar döner; sessiz
  tekrar yapılmaz. Onaylı içerik yokken sınırsız farklı soru iddiası yapılmaz.
- REPEAT açık öğrenci seçimi ve onay ister, yalnız görülmüş uygun soruları
  kullanır. Tekrar sonucu practiceOnly olarak saklanır; standart öğrenme kanıtı,
  kazanım ustalığı veya görev tamamlama yükseltilmez. Legacy testler yeni olarak
  etiketlenmez.
- 0068 migration selection_mode ve öğrenci/soru tekil rezervasyonu ekler.
  NEW test soruları aynı atomik batch'te rezerve edilir; çakışan rezervasyon tüm
  testi geri alır. Eski mini test soruları rezervasyona aktarılır.

## Kalan içerik işleri

Her resmî öğrenme çıktısı/süreç bileşeni için doğrulanmış soru bankası kapsamı,
zorluk/bağlam çeşitliliği ve beceri rubrikleri hazırlanmalı. Nibiru soru taslakları
üretebilir, fakat kaynak, cevap/çözüm, yaş/sınıf, telif ve pedagojik inceleme
onayından geçmeden öğrenciye otomatik sunulmamalıdır. Üretim pipeline'ı ve sınırsız
onaylı soru içeriği bu değişiklikte tamamlanmış değildir. Soru/içerik ve cevap anahtarı 0069 ile test başlangıcında saklanır.
Gösterim ve puanlama bu sürümü kullanır; eski eksik READY sürümleri
SNAPSHOT_REQUIRED ile engellenir. Görsel URL referansları saklanır; dosya
baytlarının değişmez arşivi henüz yoktur. Eşzamanlı çift gönderim idempotansı
ayrıca tamamlanmalıdır. Yeni testlerin native kanıtı frozen-mini-tests API üzerinden öğrenci/veli ve
yetkili kurum/branş kapsamıyla okunur; birleşik API miniTestIds seçimini destekler.
Tekrar çalışmaları akademik kanıta eklenmez. Karne ekranı tamamlanan yeni mini testleri eğitim yılına göre listeler;
öğrenci/veli veya yetkili branş/kurum kapsamıyla en fazla 20 mini test seçilir.
Mini testler tek başına ya da seçili sınav/soru pratiğiyle birleştirilir.
Tekrar ve sabit kanıtı eksik eski testler listeye katılmaz.
