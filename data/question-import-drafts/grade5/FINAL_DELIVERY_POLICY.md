# ANUNEX 5. Sınıf: Nihai Dosya + Claude Code Teslim Politikası
**Karar tarihi:** 2026-11-11  
**İş sahibi talimatı:** 5. sınıftaki bütün resmî ders/öğrenme çıktıları için hedeflenen 50'şer soruyu önce dosyalar hâlinde bitir; arada Claude Code'a yükleme/prompt gönderme. Tümü hazır olduktan sonra tek nihai paket ve ayrıntılı Claude Code yükleme promptu sağla. Production deploy en son ve onaylı kontrol süreci sonrasında.

## Kaynak/ilerleme
- Repo: `yildizyayin/yildiz-sinav`
- Çalışma PR: #525 (`content/grade5-all-outcomes-bulk-20261111`).
- Kaynak envanter: `ALL_OUTCOMES_50_TARGET_MANIFEST.json`.
- Geçerli başlangıç envanteri: 343 farklı çıktı, 50'şer hedef = 17.150 içerik. 200 taslak (MAT.5.1.1–MAT.5.1.4); yayıma hazır/onaylı kabul edilmez.
- Türkiye Yüzyılı Maarif Modeli'nin uygun sınıf/ders/yıl/süreç verisi tekrar resmî kaynak üzerinden doğrulanmalı. Türkçe envanterindeki yinelenen/çatışan başlıklar çözümlenmeli.
- Soru üretim ajanları kapalı kalır. Ücretli servis veya otomatik ajan açmak için ayrı karar gerekir.
- Her soru/görev: kazanım kodu, MEB bağlantısı ve sürümü, sınıf/ders, özgün soru ve seçenekler ya da açık uçlu rubrik, çözüm, zorluk, kaynak ve telif durumu; gerekli olduğunda görsel dosyası ve hukuki kullanım bilgileri.
- Bütün 50'lik paketler farklı ve düşünme becerileri açısından çeşitli olmalı; sırf sayısal değer veya özel isim değiştirerek kota doldurulmaz.
- Görsellerin bir kısmı gerçek, güncel ve kullanım hakkı doğrulanmış fotoğraf olmalı; fotoğraflar yalnız bağlantı olarak 'varmış' gibi işaretlenmez, atıf ve yüklenebilir medya dosyasıyla sunulur.
- Türkçe, İngilizce ve beceri/performance çıktılarında yalnız çoktan seçmeli içerik MEB kapsamının tamamı değildir. Uygun görev biçimleri ayrıca modellenir.

## Nihai teslim
1. `ANUNEX_GRADE5_ALL_QUESTIONS_<version>.json` veya içe aktarma sınırına göre 500 satırlık parçalara ayrılmış sürümlü JSON dosyaları.
2. `MANIFEST.json`: ders/kazanım/kod/soru sayısı, resmî kaynak yılı, hash/tekrar kontrolü, onaylar, görsel dosyaları, eksik/istisna raporu.
3. `MEDIA/`: lisansı ve kaynağı doğrulanmış, kullanım hakkı izinli görseller. Varlığı doğrulanmayan fotoğrafı paketleme.
4. `QA_REPORT.md`: cevapların bağımsız çözümü, eşdeğer seçenekler, duplikasyon, öğrenci düzeyi, öğretmen değerlendirmesi, rubrik ve MEB süreç bileşeni kontrolü.
5. `CLAUDE_CODE_IMPORT_PROMPT.md`: repo uyumlu, dosya yollarını ve D1/staging kurallarını içeren adım adım yükleme talimatı.
6. `README.md`: tek paketin çalıştırılma sırası ve geri dönüş/rollback politikası.

## Claude Code promptunun yapacağı işlemler
- Önce staging/production ayrımını, yetkileri, migration ve canlı mevcut soru havuzu durumunu kontrol et.
- `worker/lib/question-import.ts` içindeki sabit `2027-2028` yılını önce doğrulanmış müfredat sürümüyle uyumlu hâle getir; yılını bilmediğin soruyu başka yıla atama.
- Tek seferde en fazla 500 satırlık mevcut API koşulunu dikkate al; küçük, idempotent, tekrar çalıştırılabilir partiler hâlinde **önizleme** ve geçerli kayıtlar için `REVIEW`e yükleme yap.
- Mevcut onaylı soru kayıtlarını bozma, duplikasyonları atla. `APPROVED` işaretini otomatik atama, yetkili akademik onayı bekle.
- Görsel varlıkları R2 / `question_assets` aracılığıyla izin ve bütünlük kontrolüyle bağla; telif uyarılarını kaldırma.
- Test/build, kazanım/sınıf/yıl regresyonları, staging kabulü, erişim yetkisi ve API sonuç raporu olmadan tamamlandı deme.
- Kullanıcı production deploy'u **en sona** istedi: hazırlanmış paket var diye deploy ya da `main` merge yapma; son aşama için açık onay gerekecek.

## Mevcut teslim durumu
**Henüz tamamlanmadı; bu belge nihai paket değildir.** Burada dokümante edilen koşullar gerçekleşmeden 17.150 sorunun hazır veya D1'e yüklenmiş olduğu söylenemez.

Not: Bu çalışma sohbeti dışında asistan kendi kendine üretime devam etmez. Takip eden çalışma oturumlarında mevcut PR ve manifest üzerinden sürdürülür.
