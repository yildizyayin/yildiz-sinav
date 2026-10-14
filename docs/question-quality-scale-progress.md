# Soru üretim kalitesi ve 500.000/50 gün — devam kaydı

14 Ekim 2026. Kullanıcı kalan üretim işlerini tamamlamamızı, basit metin yerine güçlü yayınevi düzeyinde soru tasarlayan bir ekip kurmamızı istedi. Ardından sınav merkezi güncellenecek. Başlangıç main623d0c60e / PR257 prod dağıtımı38596578880 ve prod doğrulaması38597468655 başarılıdır. Önceki prod bekleme bilgisi artık tarihsel.

Bu çalışma: `/workspace/scratch/b484842228bb/question-quality-scale`, feat/question-quality-scale-20261014. 0107–0110 staging üzerinde dağıtıldı ve değiştirilmeyecek; mevcut0103-0106 da değiştirilmedi. 0111 protokol tekrarı bu güncellemede eklendi.

Uygulanan: EDITORIAL_V1 varsayılan yeni iş profili, değiştirilemez sunum/kalite yönlendirmesi; beceri hedefi,2–6 düşünme adımı, her yanlış şık için ayrı hata tanısı/gerekçe ve özgün tasarım gerekçesi; yapılandırılmış TABLE/BAR_CHART/NONE. Serbest HTML/SVG/URL üretimi yok. Ayrı model altı boyutta0–4 puan ve gerekçe verir; her boyutta en az3 gerekir. Bu otomatik puan insan/telif onayı değildir. Eski iş profilleri korunur.

Havuz geneli FTS5 benzerlik aday indeksi: canonical soru deposu question_bank; indeks türetilmiş aramadır. Üst adaylar bağımsız modele gönderilir. Küresel semantik tekillik/telif garantisi yok. Son12/4 karşılaştırması da korunur.

Yeni paket ve STEM görseli aynı D1 transaction içinde saklanır; içerik/metadata/görsel kısmi değişikliği DB trigger ile durdurulur. Soru kontrolü güncel immutable paketi görür. Admin, öğrenci pratik ve Nibiru mini-test tablo/grafik gösterimi eklendi. Türkçe ve erişilebilir veri tablosu; sıfır başlangıçlı grafik. Editorial JSON cevap ipuçları öğrenci DTO'suna eklenmez.

Panel hedef göstergesi:500000/50 gün, günlük10000 kabul, %80 uçtan uca kabul varsayımında12500 taslak. Varsayım/ölçüm/insan onayı ayrıdır; kampanya başlatılmış sayılmaz. Gerçek7x24 yürütme/ham rezervasyon/daily budget/çoklu işçi ve resmî kapsam henüz tamamlanmış değildir. Eski pilot45/50 sıfırlanmadı, otomatik üretim/ücretli ses açılmadı.

Şu ana kadar63 odaklı test geçti (yeni2 native D1 editorial transaction dahil). Henüz tam test/typecheck/build/CI ve gerçek model editorial örneği yok. Sonraki: veri görseli UI testleri, eksik görseli düşüren eski PDF yoluna güvenli engel veya tam baskı desteği; sağlayıcı kapasite/maliyet ve ücretsiz tercihine uygun bütçe planı; demo gerçek sınırlı editorial kalite kabulü; GitHub checkpoint/PR, testler ve dağıtım. Sınav merkezine bu aşama tamamlanmadan geçilmez.

## İlk gerçek editoryal deneme

Run38601238833: tek sabit iş qgj_ced623dd-7354-43d5-8cad-fc854b837f08, kaliteEDITORIAL_V1, TABLE. Üretici tabloyla birlikte categories/values doldurdu; katı veri sözleşmesi doğru biçimde GENERATION_OUTPUT_INVALID döndürdü,0 soru kaydedildi. Taslak ayrıca kalem-stok-kutu temasına geri döndü ve çeldiriciler keyfi yanlış miktarlara dayanıyordu. Kalite eşiği gevşetilmez. Talimat TABLE/BAR alan ayrımı, gerçek karar/ters işlem/iddia incelemesi ve hesaplanabilir kavram yanılgılarını açıklaştıracak. Aynı işte en fazla bir ek deneme; yeni key zinciri yok. Rezervasyon artık46/50 olabilir, işbütçe D1'den doğrulanmalı. İlk başarısız çağrı2839 giriş,2339 çıkış,249.8085 raporlanan nöron; üretici GPT-OSS120b.

50 günlük hedef14 Ekim2026'dan sayılır; hazırlık süresi dahil,3 Aralık2026 hedefidir. Otomatik yürütmenin henüz başlamaması süreyi ileriye taşımaz; panel kalan güne göre gerekli günlük kabulü yeniden hesaplar. Basılı editorial PDF için eski3-satır/ASCII/görsel-placeholder yoluna409 engeli eklendi; veri kaybeden sözde kaliteli PDF üretilmez. Baskı tasarımı sınav merkezi aşamasında tam Türkçe font ve görsel yerleşimle ele alınmalıdır.

## İkinci örnek ve son düzeltme

Run38601989581 ikinci deneme0 kayıt: GPT-OSS yanıtı finishReason:length ile7000 completion token sınırında JSON ortasında kesildi. Paket tedarik kombinasyonunu maksimize eden, yeterli optimalite kanıtı olmayan ve sınıf için gereksiz karmaşık bir probleme yöneldi. Üretici2972 giriş/7000 çıkış/571.8357 nöron bildirdi. Çözüm: en fazla3 açık alternatif ve2 kısıt; açık uçlu tam sayılı optimizasyon veya kanıtsız greedy optimalite yok; yanıt üst sınırı12000. Native işin kalan3. ve son denemesi aynı anahtarla kullanılacak; rezervasyon46/50 korunur. Önceki örnek scriptinin2 sınırı bu somut truncation bulgusuyla3 native sınırına çıkarıldı; daha fazla deneme veya yeni key zinciri yok.

## Gerçek üçüncü çıktı ve editoryal onarım

Run38603136906 üçüncü ve son üretim0 kayıt: model yine TABLE içinde values doldurdu. Kök sorun JSON schema'nın TABLE alanında maxItems0 kuralını taşımamasıydı; editorialSchema artık işin sunum biçimini alıp TABLE için categories/values maxItems0, BAR için columns/rows maxItems0, TEXT için boş görsel alanlarını uygular. Üretim işi3 denemeyle kapalı; yeni anahtar veya sayaç reseti yok. Source audit details SHA256 d2c774bb386d3f1f83f37d94ee738460db926fcbac5adbc21db3e95293ce8b95.

Yeni0110 ve /generation-jobs/:id/repair: kayıtlı gerçek model paketinin kaynak audit/hash tanığıyla tek seferlik AI destekli editoryal düzeltmesi; üretici çağrılmaz, attempt_count korunur, 1 repair cap, payload hash ile idempotency, ayrı bilimsel/6-boyutlu denetçi ve aynı D1 atomik commit/source/paused guards. Sıfırdan yeni üretim veya insan onayı değildir. UI tam paket/şık/tanı/veri alanlarını düzenler. Düzeltilen model3 taslağı data/question-editorial-repair-20261014.json; enaz280 etkinlik kartı, üçtedarikçi, tamkutu/maliyet ve Mert'in iddiasını değerlendirme. Gerçek fiyat/yaş sınırları ve açıklamalar AI destekli düzeltilmiştir; kaynağı model üretimi olarak korunur fakat otonom başarı diye raporlanmaz.

66 odaklı native/API testi geçti. Önceki tam pakette1062 test geçti; 0110/repair/UI son tam doğrulaması ve gerçek repair denetimi henüz yapılmadı. Yapılacak:0110 stage'e dağıt → .github/question-editorial-repair.execute ile tek onarım denetimi → hiçbir4. üretim veya yeni rezervasyon yok → başarılıysa demo UI kabulü, CI ve PR259 finalleştirme. Üretim7x24 hâlâ kapalı; kapasite/bütçe/resmî kapsam ve baskı renderer kalan konulardır. Sınav merkezi henüz ele alınmadı.

## Denetçi protokol düzeltmesi — güncel durum

38606378294 gerçek onarım denemesi kayıt yapmadı. Üretici çağrısı0, yeni rezervasyon0, attempt_count3, editorial_repair_count1. Bağımsız model eski örnek nedeniyle altı puanı üretmek yerine missing editorial scores verdi. İçerik için olumlu kalite sonucu yoktur. Yeni zorunlu EDITORIAL_REVIEW_V1 JSON schema ve denetçinin kendi puanlarını vermesi gerektiğini açıkça belirten talimat eklendi; legacy yanıt sözleşmesi korunur.

0111 yalnız aynı kaynak hash'i ve aynı düzeltilmiş paket/reason hash'i için bir protokol tekrarı sağlar. Soru değiştirilemez, yeni üretici çağrısı yapılmaz, onarım/üretim sayacı sıfırlanmaz. Bilimsel hata/3 altı puan gibi esaslı retler bu yolla tekrarlanamaz. Kaynak audit ID önceki gerçek onarım kaydından geri doldurulur. Gerçek protokol tekrarının sonucu henüz yok.

AUTO sunum sağlayıcı çağrısından önce doğrulanmış pilot kapsamına göre somut TABLE/TEXT şemasına çözülür. Editorial işler bağımsız denetçi kapalıysa üreticiyi çağırmadan durur. İnsan/telif onayı hâlâ bekler; 7x24 ve ücretli üretim açılmadı. Rezervasyon46/50. Son önceki tam test1066 geçti; son protokol katmanı için tam test yeniden çalışıyor. Typecheck ve build geçti.
