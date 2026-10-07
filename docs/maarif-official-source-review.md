# Ortaokul matematiği: resmî kaynak inceleme paketi

Durum (2026-10-07): kaynak keşfi tamamlandı; içerik aktarımı, uzman onayı ve eğitim yılı uygulanabilirliği bekliyor. Bu dosya yayın izni veya canlı müfredat tanımı değildir.

## Kapsam ve sürüm

`data/maarif/middle-school-mathematics-source-review.json` resmî ders sayfasından açılan sınıf dizinlerini ve bu dizinlerden tek tek açılan 30 tema adresini içerir: 5. sınıf 7, 6. sınıf 7, 7. sınıf 9, 8. sınıf 7. Tema URL kimlikleri sıralı varsayılmamıştır; örneğin 5. sınıfın ilk iki bağlantısı 447 ve 449, geometrik şekiller bağlantısı 448'dir.

[Ders sayfası](https://tymm.meb.gov.tr/ogretim-programlari/ders/ortaokul-matematik-dersi) üzerindeki “Programı Görüntüle” bağlantısı inceleme tarihinde [2026 kapak tarihli, 222 sayfalık PDF](https://tymm.meb.gov.tr/assets/pdf/ortaokul-matematik-dersi_20260902_111111_630.pdf) açmaktadır. Aramada bulunan [2024 PDF](https://tymm.meb.gov.tr/upload/program/2024programmat5678Onayli.pdf) ayrı bir sürümdür; güncel ders bağlantısı yerine sessizce kullanılamaz.

Tema sayfalarının 2026 PDF ile satır satır örtüşmesi henüz incelenmedi. PDF dosya baytları arşivlenmedi ve SHA-256 üretilmedi. Web erişimi dönemsel hata verebilir; doğrudan PDF açma bir kez hata verdi, resmî ders bağlantısından açma başarılı oldu. Kontrol tarihi kalıcı içerik garantisi değildir.

## Aktarım öncesindeki işler

1. İlgili eğitim yılı ve sınıf için uygulanacak sürümü resmî uygulama takvimiyle belirle. Sitede 5–8. sınıfların bulunması tüm sınıflarda aynı yıl uygulandığını kanıtlamaz.
2. Seçilen belgenin asıl dosyasını arşivle, içerik özeti ve değişmez dosya hash'i kaydet; tema sayfalarıyla karşılaştır.
3. Öğrenme çıktısı ve süreç bileşeni kodlarını, ilişkilerini ve kaynak konumlarını çıkar; branş uzmanı her tanımı belgeyle karşılaştırsın. Bu katalog öğrenme çıktısı metinlerini veya ölçütleri içermez.
4. Resmî rubrik için ayrı ölçüt/seviye kaynağı ve uzman onayı sağla. Genel değerlendirme açıklamalarından üretilen öğretmen rubriğini OFFICIAL olarak kaydetme.
5. Onaylanan veriyi mevcut staging/import akışına gönder; yayın öncesi önizleme ve sürüm kapsamını kontrol et. Kaynak URL'sinin resmî alan adı olması içerik doğrulaması değildir.

Katalogdaki `publicationAllowed=false`, `contentImported=false`, `expertReview=pending` ve `academicYearApplicability=unverified` alanları bu açık işleri görünür tutar. Dosya çalışma zamanı tarafından okunmaz; API doğrulamalarını veya yayın kurallarını değiştirmez.

## Doğrulama

JSON ayrıştırma, 30 benzersiz tema URL'si, sınıf başına 7/7/9/7 dağılımı, HTTPS/resmî alan adı ve yayın bekleme alanları yerel olarak kontrol edildi. Sınıf dizinindeki bütün tema bağlantıları resmî web kaynağında açıldı. Üretim kodu, migration, test fixture, feature flag ve canlı ortam değiştirilmedi.

İlgili teknik sözleşmeler: [müfredat aktarımı](curriculum-import-atomic-publication.md) ve [süreç/rubrik kayıtları](maarif-rubric-registry.md). Kaynak listesi tamamlanmış olması bu sözleşmelerdeki içerik onayını tamamlamaz.
