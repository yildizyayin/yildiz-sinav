# Ortak yazılı sınav kararları — 19 Ekim 2026

Kararlar tamamlandı. Bu belge yazılı sınavların uçtan uca uygulandığı veya resmî EBA/OYSS/e-Okul bağlantısının kurulduğu anlamına gelmez. Canlı ekip API'si ve Süper Admin paneli karar durumunu gösterir.

## Kaynak ve kapsam ayrımı

ÖDSGM'nin 16 Ekim 2026 tarihli duyurusu:
https://odsgm.meb.gov.tr/www/quotortak-yazili-sinav-sistemiquot-tanitim-programi-duzenlendi/icerik/1746/tr

Duyuru 2026–2027 birinci dönem birinci yazılıdan başlayan OYSS'yi anlatır: 5/6/7 için altı ders, 9/10/11 için on ders; açık uçlu sorular, zümrenin seçtiği senaryo, iki ortak zümre sorusu, öğretmence belirlenen güçlük ve puanlar, soru bazlı sonuçlar ve öğrenci/sınıf/şube/öğrenme çıktısı geri bildirimi. AI puanlaması duyuruda gelecek çalışma olarak anlatılır; tamamlanmış veya zorunlu resmî özellik gibi sunulmaz.

2027–2028 yıllık senaryoları, takvimleri ve il bazlı konu-soru tabloları doğrulanmadı. Mevcut TYMM programlarının hedef yıla aktarılması bunları doğrulamaz. 8 ve 12 bu duyurunun sınıf kapsamına eklenmez. Hazırlık denemeleri ayrı üründür. İl tablosu ülke geneli tablo sayılmaz.

## Kesin ürün kararları

1. **COMMON_WRITTEN**: Çoktan seçmeli deneme ve mini testlerden ayrı süreç. Açık uçlu/kısa cevaplı soru; net hesaplama ve otomatik çoktan seçmeli puanlama kullanılmaz. SHORT_ANSWER mevcut veritabanına izinsiz yeni enum değeri olarak yazılmaz; uygulama adaptasyonu ayrıca yapılır.
2. **Senaryo**: Yıl, dönem, sınav numarası, sınıf, ders, ülke/il/okul kapsamı, gerekiyorsa il, senaryo kimliği, resmî URL ve belge özeti, açık seçilmiş müfredat sürümü ve kazanım başına soru sayısı. Eksik resmî senaryo ile resmî uyumluluk etiketi veya resmî yazılı yayını yoktur. Hazırlık taslağı kaydedilebilir.
3. **Zümre**: İki ortak soru kuralı yalnız doğrulanmış yıl/kapsama uygulanır; bütün özel sınavlara zorlanmaz. Kalan sorular kendi onaylı ve hakları uygun ANUNEX havuzundan gelir. MEB'in özel havuzuna erişimimiz varmış gibi davranılmaz; yayınevi soruları kopyalanmaz.
4. **Soru paketi**: Soru, cevap örnekleri, alternatif doğru yaklaşımlar, analitik rubrik ölçütleri, her ölçüt için puan ve kısmi başarı açıklaması, sık hata/yanılgı, doğrulanmış kazanım ve sürüm, güçlük gerekçesi, kaynak/hak incelemesi. Havuz yetersizse eksik açık gösterilir, dolgu veya doğrulanmamış kazanım üretilmez.
5. **Puan**: Soru puanları öğretmence belirlenir. ANUNEX tasarım kararı olarak toplam 100; rubrik toplamı soru puanına eşit, negatif/aşan puan reddedilir. Bu duyuruda 100 puan kuralı bulunduğu iddia edilmez. Zümre/öğretmen onayı sonrası yayımlanan soru ve rubrik sürümü dondurulur.
6. **Değerlendirme**: Soru bazlı öğretmen girişi ve kısmi puan. OCR/AI yalnız yardımcı okuma ve gerekçeli puan önerisi; son kararı öğretmen verir. Düzeltmeler önceki notu, gerekçeyi ve aktörü koruyan sürüm oluşturur. İnsan onayı, telif, RESTRICTED ve bağımsız doğrulama kapıları korunur.
7. **Çıktı**: Sınav kâğıdı, cevap anahtarı, analitik rubrik ve puan çizelgesi; öğrenci, sınıf, şube, kazanım ve veli geri bildirimi. Yazılı puanı ile deneme neti aynı birim gibi ortalanmaz. Birleştirilmiş karnede ölçüm türü ve ağırlık açık olur. E-okul'a otomatik veri gönderimi bu kapsamda yoktur.
8. **Erişim**: Süper Admin kaynak/politika; kurum ve zümre senaryo/onay; öğretmen hazırlama/puanlama; öğrenci ve veli yalnız kendi yayımlanan sonuçları; rehberlik kendi yetkili öğrenci grubunun gelişim analizi. Özel öğrenci cevapları açık sohbet robotuna verilmez.

## Uygulama sırası ve kabul

A. Resmî senaryo dosyası ve sürümlü doğrulama → B. Açık uçlu editoryal şema/rubrik ve insan/hak incelemesi → C. Senaryo dağılımını doğrulayan derleyici ve baskı → D. Öğretmen puanlama ve değişmez not geçmişi → E. Yetkili raporlar ve karne bağlantısı.

Bunlar tamamlanıp öğretmen onaylı pilotla kanıtlanmadan `openEndedProductionQualified`, `targetScenarioVerified` veya resmî entegrasyon bayrağı açılmaz. Güncel kod çoktan seçmeli editoryal üretim yapar; bu karar kaydı onu açık uçlu üretime dönüştürmez.
