# Ortaokul matematiği: resmî kaynak inceleme paketi

Durum (2026-10-07): kaynak keşfi tamamlandı; içerik aktarımı, uzman onayı ve eğitim yılı uygulanabilirliği bekliyor. Bu dosya yayın izni veya canlı müfredat tanımı değildir.

## Kapsam ve sürüm

`data/maarif/middle-school-mathematics-source-review.json` resmî ders sayfasından açılan sınıf dizinlerini ve bu dizinlerden tek tek açılan 30 tema adresini içerir: 5. sınıf 7, 6. sınıf 7, 7. sınıf 9, 8. sınıf 7. Tema URL kimlikleri sıralı varsayılmamıştır; örneğin 5. sınıfın ilk iki bağlantısı 447 ve 449, geometrik şekiller bağlantısı 448'dir.

[Ders sayfası](https://tymm.meb.gov.tr/ogretim-programlari/ders/ortaokul-matematik-dersi) üzerindeki “Programı Görüntüle” bağlantısı inceleme tarihinde [2026 kapak tarihli, 222 sayfalık PDF](https://tymm.meb.gov.tr/assets/pdf/ortaokul-matematik-dersi_20260902_111111_630.pdf) açmaktadır. Aramada bulunan [2024 PDF](https://tymm.meb.gov.tr/upload/program/2024programmat5678Onayli.pdf) ayrı bir sürümdür; güncel ders bağlantısı yerine sessizce kullanılamaz.

Tema sayfalarının 2026 PDF ile satır satır örtüşmesi henüz incelenmedi. PDF dosya baytları 2026-10-07T17:56:00.258Z tarihinde indirildi ve PDF + inceleme JSON dosyasından oluşan ZIP paketinde arşivlendi. Dosya 3.916.466 bayt; SHA-256 `75f52f93672c8991eabe102adb37ab4d16de63f35fe8488fc29cdedae9155734`. ZIP içinden okunan PDF özeti özgün dosya ile aynı çıktı. `pdfinfo` dosyayı 222 sayfalık, şifresiz PDF 1.7 olarak okuyabildi; bu tam yapı veya içerik doğrulaması değildir. Web erişimi dönemsel hata verebilir; doğrudan PDF açma bir kez hata verdi, resmî ders bağlantısından açma başarılı oldu. Kontrol tarihi kalıcı içerik garantisi değildir.

## Aktarım öncesindeki işler

1. İlgili eğitim yılı ve sınıf için uygulanacak sürümü resmî uygulama takvimiyle belirle. Sitede 5–8. sınıfların bulunması tüm sınıflarda aynı yıl uygulandığını kanıtlamaz.
2. Seçilen belgenin asıl dosyasını arşivle, içerik özeti ve değişmez dosya hash'i kaydet; tema sayfalarıyla karşılaştır.
3. Öğrenme çıktısı ve süreç bileşeni kodlarını, ilişkilerini ve kaynak konumlarını çıkar; branş uzmanı her tanımı belgeyle karşılaştırsın. Bu katalog öğrenme çıktısı metinlerini veya ölçütleri içermez.
4. Resmî rubrik için ayrı ölçüt/seviye kaynağı ve uzman onayı sağla. Genel değerlendirme açıklamalarından üretilen öğretmen rubriğini OFFICIAL olarak kaydetme.
5. Onaylanan veriyi mevcut staging/import akışına gönder; yayın öncesi önizleme ve sürüm kapsamını kontrol et. Kaynak URL'sinin resmî alan adı olması içerik doğrulaması değildir.

Katalogdaki `publicationAllowed=false`, `contentImported=false`, `expertReview=pending` ve `academicYearApplicability=unverified` alanları bu açık işleri görünür tutar. Dosya çalışma zamanı tarafından okunmaz; API doğrulamalarını veya yayın kurallarını değiştirmez.

## Doğrulama

### Belge baytlarını kaydetme

`worker/curriculum-admin-entry.ts` içindeki `sourceHash`, yüklenen kazanım CSV'sinin SHA-256 özetidir. MEB/ÖSYM PDF'sinin özeti veya kaynağın doğruluğuna ilişkin bir tasdik değildir. Bu alanı PDF hash'i ile değiştirmeyin; CSV izlenebilirliği korunmalıdır.

İndirilen dayanak PDF için ayrı yerel inceleme kaydı üretilebilir:

```bash
node scripts/fingerprint-curriculum-source.mjs /absolute/path/programme.pdf \
  https://tymm.meb.gov.tr/assets/pdf/ortaokul-matematik-dersi_20260902_111111_630.pdf \
  'Ortaokul matematik programı 2026' 'Kapak ve ilgili tema bölümü' \
  '2026-10-07T20:50:35+03:00' > /absolute/path/programme.evidence.json
```

Tarih, örnekteki değeri kopyalamak yerine gerçek indirme zamanı olmalıdır. Araç ağ isteği yapmaz; kullanıcı dosyasının kaynağa ait olduğunu doğrulamaz. Resmî HTTPS belge adresi, zorunlu kaynak konumu, PDF başlangıç imzası, 50 MiB sınırı ve okuma sırasında dosya değişimi kontrol edilir. İmza kontrolü tam PDF yapı doğrulaması değildir. Hash bütün baytlardan hesaplanır; dosya adı/yerel dizin sonuçta yayımlanmaz. JSON standart çıktıya gelir; hata durumunda çıktı yoktur ve çıkış kodu 1'dir. Shell yönlendirmesi hatada boş çıktı dosyası oluşturabilir; çıkış kodunu kontrol etmeden kanıt dosyasını kullanmayın.

`originAttested`, `pdfStructureValidated`, `contentReviewed` ve `publicationAllowed` false kalır. JSON yalnız inceleme dosyasıdır; mevcut import API tarafından tüketilmez. Araç çalıştırılması tek başına kaynak arşivi değildir. Bu program için gerçek indirme ve ZIP arşivi yukarıda ayrıca kaydedildi. PDF sunumu ile özgün bayt arşivi ayrıdır; hash doğrulaması ZIP içindeki özgün PDF üzerinden yapılmalıdır. Yerel kabul: `node --test tests/curriculum-source-fingerprint.node.test.mjs`; sentetik dosya, değişen baytlar, HTML hata gövdesi, boyut sınırı, sahte alan adı ve eksik metadata kontrol edilir.

JSON ayrıştırma, 30 benzersiz tema URL'si, sınıf başına 7/7/9/7 dağılımı, HTTPS/resmî alan adı ve yayın bekleme alanları yerel olarak kontrol edildi. Sınıf dizinindeki bütün tema bağlantıları resmî web kaynağında açıldı. Üretim kodu, migration, test fixture, feature flag ve canlı ortam değiştirilmedi.

İlgili teknik sözleşmeler: [müfredat aktarımı](curriculum-import-atomic-publication.md) ve [süreç/rubrik kayıtları](maarif-rubric-registry.md). Kaynak listesi tamamlanmış olması bu sözleşmelerdeki içerik onayını tamamlamaz.
