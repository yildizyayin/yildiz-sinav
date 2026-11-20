# ANUNEX 5. SINIF — GÖRSELLİ VE GÜNCEL BAĞLAMLI SORU KALİTE KAPISI
Tarih: 2026-11-11
Durum: BAĞLAYICI TASLAK KALİTE KRİTERİ; akademik kabul değildir.

## Sorun ve açık durum
- 5. sınıf Matematik için 23 kazanım × 50 = 1.150 MC soru taslağının ve kullanıcıya sunulan 20 soruluk ilk PDF seçkisinin tamamı ağırlıklı metinlidir. Sorulara bağlı gerçek/özgün görsel dosyaları henüz sağlanmamıştır. "Matematiğin tamamı hazır" diye akademik ürün kabulü yapılamaz.
- Güncel olaylı gerçek kaynaklara dayalı sorular yeterince üretilmemiştir. Eski PDF'ye "en iyi 20" başlığı konulması görsel odak ve güncellik beklentisini karşılamamaktadır.
- Nitelikli soruda yalnız fotoğraf süsü değil, fotoğraf, grafik, şema, kroki, tablo veya modelin bizzat çözüm için gerekli olması hedeflenir.

## Hazırlama ölçütleri
1. **Görsel gerçek bir soru bileşeni olmalı.** Sadece kökün yanına resim eklemek yeterli sayılmaz. Öğrenci soruyu yanıtlamak için görselden bilgi okumalı, yorumlamalı, karşılaştırmalı veya bir çıkarımda bulunmalıdır. Görsel soru köküyle, seçeneklerle ve çözümle matematiksel/bilimsel olarak tutarlı olmalıdır.
2. **Ders türüne uyum.** Fen'de gerçek bilimsel fotoğraf + bilimsel/deney düzeneği modeli, grafik, gözlem kaydı; matematikte ölçekli grafik, tablo, kareli kâğıt, geometri şekli; sosyalde zaman çizelgesi/harita/gerçek veri; Türkçede görsel okuma, afiş ve grafik. Sadece metinle çözülebilecek sorular da olur, fakat tek tip olamaz.
3. **Nitelik hedefi ve QA:** Fen ve Matematik için kazanmaya uygun 50 soruluk *nihai* set başına hedef en az 15 gerçek görseli çözümün zorunlu parçası yapan soru (~%30). İlgisiz kazanımlara zorla görsel eklenmez; öğretmen gerekçesi yazılır. Gerçek olay/güncel veri bulunan temalarda en az 5 kaynağı doğrulanmış ve tarihli bağlam (olay, haber, bilimsel gözlem veya istatistik) hedeflenir. Bu sayılar **üretildi sayılmaz**; dosya bağları ve QA kanıtı olmadan hedef gerçekleştirildi yazılmaz.
4. **Güncel olay uydurulmayacak.** Geçmiş 12–24 ay içinden anlamlı olaylar tercih edilir. Her olay için `eventDate`, `sourceUrl`, `accessedAt`, `verifiedFact`, `curriculumRelevance` ve gerekiyorsa `sourceExcerpt` alanları ayrı bağlam envanterinde tutulur. Veriye dayalı sorunun bilgi ve rakamları kaynakla karşılaştırılır. Yanlış, tarihsiz veya konu kazanımı dışındaki hikâye kullanılamaz.
5. **Görsel kökeni ve lisans:** `assetId`, `assetType` (PHOTO/DIAGRAM/CHART/TABLE/MAP), `sourceUrl`, `creatorCredit`, `licenseEvidence`, `rightsStatus`, `altText`, `educationalRationale` ve `questionId` kaydı olmadan yayımlanmaz. NASA gibi kaynaklar için bile ilgili görselin üçüncü taraf içermediği ve ticari kullanım kısıtları kontrol edilir. ANUNEX'e ait özgün vektör/şema ise kaynak dosyası ve doğrulama kontrolü saklanır.
6. **Gerçek fotoğraf ve gerçek tablo** istenen yerde sentetik görsel veya uydurulmuş haber gerçek diye sunulmaz. Simüle edilmiş şema açıkça "temsili" diye etiketlenir. Sütun, eksen ve şekil geometrisi verilere tam uymalıdır.
7. **Fen ilk ünite örneği:** NASA, 12 Ağustos 2026 tarihli tam Güneş tutulmasının İspanya fotoğrafını yayımladı. Bu *FB.5.1.4 veya ilgili hareket/konum kazanımı* için görselden çıkarım sorusuna dönüştürülebilir, FB.5.1.1'in Güneş'in dönmesine ilişkin kanıtı diye sunulamaz. Kaynak https://www.nasa.gov/image-article/2026-total-solar-eclipse-in-spain/ ; kullanım şartları https://www.nasa.gov/nasa-brand-center/images-and-media/ . FB.5.1.1 için ise kaynak ve tarih bilgili Güneş lekesi gözlem serisi tercih edilir.
8. **PDF kalite testi:** "En iyi sorular" seçkisi, en az birkaç gerçek görselden zorunlu bilgi okuma sorusu, kaynağı kontrol edilmiş güncel bağlam, kazanım çeşitliliği, doğru cevap/çözüm, görsel kredisi ve basıma uygun okunabilir boyutta şema içeriyorsa yayımlanabilir. Metin ağırlıklı ilk 20 soruluk PDF **V1 / taslak seçki** olarak değerlendirilmeli; "premium nihai örnek" olarak tanıtılmamalı.
9. **Bu kapı geçilmeden:** Matematik için 1.150/1.150 *taslak kayıt* sayısı doğru olabilir; ama görselliği, bilimsel/güncel bağlamı, bağımsız akademik kabulü tamamlandı denilemez. Her kazanımın asset takibi ve öğretmen onayı gerekli. Fen yeni sorularında görseller sonradan eklenmek üzere sahte "eklendi" işaretleri kullanılmaz.

## Doğrudan izlenecek durum
- `textDraftCount`: mevcut soru JSON'larından sayılır.
- `visualDependentCount`: yalnız doğrulanmış varlık/asset bağlantısı ve görsel-destekli çözüme sahip kayıtlar sayılır.
- `verifiedCurrentContextCount`: kaynak + olay tarihi + kanıt + kazanım uyumu doğrulananlar sayılır.
- `teacherApprovedCount`: yetkili gerçek öğretmenin onayından geçenler sayılır.
- `readyForPublishing`: bütün akademik, telif, görsel, teknik ve yıl-kodu koşulları sağlanmadıkça `false`.

**Mevcut repo: soru dosyaları ve izleme. Main, API, Workers, production deploy veya D1 import işlemi yapılmaz.**
