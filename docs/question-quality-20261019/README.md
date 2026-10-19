# Soru havuzu — dört işin inceleme paketi

19 Ekim 2026. Çalışmanın kapsamı kod/test, insan inceleme belgeleri, boş müfredat şablonu ve kapasite hesabıdır. Gerçek model, canlı DB veya sağlayıcı çağrısı yapılmadı. İnceleme CSV'si hiçbir onay veya yayın işlemi çalıştırmaz.

## 1. Üretici doğrulaması

İncelenen production kaynak tabanı main 7d15309da7f4049f4a07a8c53ea12765aebdc23a ile bu kapsamdaki kodda aynı olan 0db2518e1 sürümüdür. Sınav aktifleştirme PR #261 bu işe dahil değildir.

`editorialSchema('TABLE')`: categories ve values için maxItems=0; sütun ve satırlarda alt sınır var. `BAR_CHART`: columns ve rows için maxItems=0. `TEXT`: görsel kind=NONE; dört dizi ve üç metin alanı boş olmak zorunda. AUTO, gerçek yürütücüde şemaya verilmeden önce TABLE/TEXT'e çözülür. NONE bir görsel türüdür; arayüz sunum seçeneğinin adı TEXT'tir. Bu kurallar yeniden yazılmadı.

`editorialIssues` çalışırken de kullanılmayan dolu alanları reddeder; şema desteği sağlayıcıda uygulanmasa bile kayıt katmanının reddi korunur. JSON okuyucu yalnız JSON.parse kullanır; kesilmiş parantezleri tamamlama veya metinden kısmi soru ayıklama yok; 65536 bayt sınırı var.

Bulunan eksik: sağlayıcı finish_reason=length bildirdiği halde içerik geçerli JSON ise okuyucu kabul edebiliyordu. Küçük düzeltme, kesilme işaretlerini ve incomplete yanıtlarını JSON ayrıştırmadan önce reddeder. Bu, üretici ve bağımsız doğrulayıcının ortak okuyucusunu daha sıkı hale getirir. Otomatik onay, insan/telif kapıları, RESTRICTED veya bütçe kodu değişmedi.

Token sınırı bütün modellerde aynı değildir: varsayılan GLM yolunda max_completion_tokens=6000; diğer model yolunda editoryal istek max_tokens=12000, legacy istek 3000. Üst sınır 12000'dir; her sağlayıcının gerçekten bu sınırda başarılı olacağı veya ücretsiz kapasitesi olduğu kanıtlanmış değildir. Sınırlar değiştirilmedi.

İki ek Vitest testi: üç sunum için şema+çalışma zamanı boş alan kuralları; geçerli JSON görünümündeki length/incomplete cevapların reddi. Sağlayıcı sahte yanıtları kullanılır; gerçek çağrı yok.

## 2. İlk on taslak için insan incelemesi

Kaynak `data/question-team-balanced-ten-20261014.json` tarihli anlık görüntüdür: 10 REVIEW, 0 APPROVED, 0 yayın, RESTRICTED. Bu güncel production sayımı değildir. 45/50 rezerv ve kalan 5, bu görev için verilen sabit plan girdisidir; canlı sayacı değiştirmez. Önceki staging çalışmaları bu pakette production başarısı sayılmaz.

CSV'de yalnız gerçek soru ID'si, kayıtlı review_revision, içerik özeti ve mevcut RESTRICTED durumu dolduruldu. Hiçbir değerlendirme UYGUN veya ONAY yapılmadı. Dosya noktalı virgüllü UTF-8 BOM CSV'dir; sisteme otomatik onay içe aktarma biçimi değildir.

Kontrol listesi:

- Sürümü dondur: soru ID, review_revision, kök, seçenek, anahtar ve çözümü güncel panel kaydıyla karşılaştır. Değişiklik varsa eski CSV kararını uygulama; yeni sürümü yeniden incele. content_sha256 yalnız bu dosyadan türetilen denetim izi, sunucudaki resmî ETag değildir.
- Cevap/çözüm: anahtara bakmadan çöz; tek doğru seçenek, tüm veriler, işlem sırası, birim, alternatif yöntem ve her açıklama doğrulansın. Çözülemeyen veya birden fazla doğru seçenekli soruya ONAY verme.
- Müfredat: resmi kod, metin, sınıf/ders, program sürümü ve kaynağı doğrula. Metinden tahmin edilen bir bağlantıyı resmî doğrulama yerine koyma. Resmî veri yoksa BEKLIYOR bırak ve kaynağı iste.
- Yaş uygunluğu: okuma yükü, kullanılan kavram/işlemler, bilişsel gereklilik ve bağlam uygun olsun; zor kelime ya da uzun hikâye beceri derinliği sayılmaz.
- Çeldiriciler: her yanlış seçenek farklı, makul öğrenci hatasına dayanmalı; neden yanlış olduğu açıkça kanıtlanmalı. Sayıların rastgele +/- değiştirilmesi yeterli değildir.
- Dil: açık, tek anlamlı, doğru Türkçe; seçenek uzunluğu/dilbilgisiyle cevap ipucu olmamalı. Şekil/tablodaki çözüm için gerekli bilgi öğrenciye görünmeli.
- Özgünlük: kök, çözüm akışı, sayısal yapı ve görsel için iç havuz benzerlik adaylarını incele; bilinen kaynaklarla şüpheli benzerlikleri kaydet. Düşük benzerlik skoru tek başına özgünlük/hak kanıtı değildir.
- Haklar: aşağıdaki statüye uygun somut kayıt ve kapsam olmadan RESTRICTED'i kaldırma. Modelin özgünlük beyanı veya internette erişilebilir olmak yeterli kanıt değildir.
- Karar: bütün gerekli kontroller UYGUN, hakları belgeli ve gerekçe doluysa insan ONAY kararı verebilir. Düzeltilebilir sorun DÜZELTME, temel doğruluk/uygunluk veya giderilemeyen kaynak sorunu RET olarak işaretlenir. Karar panelde mevcut insan inceleme işlemiyle, güncel revizyon denetimiyle uygulanır; CSV tek başına APPROVED veya yayın oluşturmaz.

CSV kontrol değerleri: UYGUN / UYGUN_DEGIL / BEKLIYOR. Karar ONAY / RET / DÜZELTME; henüz verilmediyse boş. Gerekçe ve hak kanıtı referansı karar öncesi doldurulmalı. İnceleme sorumlulukları içerik, branş ve hak kontrolüdür; mevcut sistemin gerektirdiğinden fazla zorunlu kişi sayısı icat edilmez.

Operasyonel hak kuralı önerisi (hukuki görüş değildir):

| Statü | Gerekli kayıt | Kullanım kararı |
|---|---|---|
| OWNED | Oluşturma/sürüm geçmişi, kullanılan tüm varlıkların kökeni, gerekiyorsa yazar/çalışan hak belgesi | Kapsam doğrulanırsa insan incelemesinde değerlendirilebilir; AI üretimi otomatik OWNED değildir |
| LICENSED | Hak sahibi, izin/lisans belgesi, materyal sürümü, süre, coğrafya, kullanım kanalı, değişiklik/dağıtım koşulları | Sadece belgelenmiş kapsam; PDF izni video/YouTube izni sayılmaz |
| PUBLIC_DOMAIN | Kaynak, eser/varlık ve bu statünün hangi ülke/kapsam için dayanağı | Kaynak resmî veya ücretsiz diye bu statü verilmez; kapsam teyit edilir |
| RESTRICTED | Kanıt eksik, belirsiz, ihtilaflı veya mevcut kullanım izni dışı | Onay/yayın yok; belge veya uygun özgün ikame beklenir |

Karışık içerikte kök, tablo/şekil, fotoğraf ve ses ayrı izlenir. Bir parçanın uygunluğu diğer parçaların kullanım hakkını kanıtlamaz. Ünlü kişi/fotoğraf, video kesiti, yayınevi benzeri kurgu, çalışan/yazar sözleşmesi, AI çıktı hakları, lisansın yeniden dağıtım/değişiklik sınırları, kamu malı süresi/coğrafyası veya ihtilaf için hukuk danışmanı değerlendirmesi istenir. Burada hukuki statü tayini veya yasal uygunluk garantisi verilmiyor.

## 3. Müfredat genişletme prosedürü

Boş dosya `curriculum-unverified-template.json`, mevcut pilot JSON'un aynı alanlarını kullanır; yüklenmeye hazır veri değildir. outcomes öğesinin biçimi: `{"code":"","title":"","topic":""}`. Gerçek kod/metin resmî kaynaktan birebir doğrulanmadan eklenmez.

1. Hedef sınıf, ders, eğitim yılı ve programı kullanıcıdan al. SCHOOL programı ile TYT/AYT sınav kapsamını ayır; okul kazanımı otomatik ÖSYM kapsamı değildir.
2. Resmî MEB Türkiye Yüzyılı Maarif Modeli programı için https://tymm.meb.gov.tr üzerindeki ilgili ders/sınıf sayfasını veya MEB/TTKB'nin yetkili program PDF'sini kullan. Ana sayfa tek başına kanıt değildir. İlgili doküman/tema URL'si, başlık, sürüm/yayın tarihi, erişim tarihi ve dosya hashini kayıt altına al. Resmî sayfa/PDF yoksa DOĞRULANMAMIŞ durumunda dur ve kullanıcıdan URL/doküman iste.
3. academicYear, gradeLevel, programCode, programVersion, authority, sourceUrl, sourceTitle ve scope alanlarını doğrulanmış kayıtla doldur. programVersion uygulamanın izlenebilir sürüm etiketidir; uydurulmuş MEB sürüm kodu gibi sunulmaz. 2027–2028 hedefi için önceki programın o yıla geçerliliği kanıtsız varsayılmaz.
4. outcomes: resmî code ve title birebir; topic resmî başlıksa kaynağına dayanmalı. Konu/tema bağlamını ve varsa süreç bileşenlerini ayrıca doğrula; onları kazanım başlığıyla karıştırma. Aynı resmî kod farklı temalarda farklı metinle geçiyorsa birini ezme veya koda ek uydurma; ayrı sürüm/tema kimliği kullan, belirsizliği aktarıma sokma.
5. JSON yalnız hazırlık dosyasıdır. Mevcut Müfredat/Kazanım Merkezi CSV aktarıcısına dönüştür: subject_code, grade_level, outcome_code, title, topic, unit, node_type=OUTCOME. Ders kodunu sistemdeki aktif subjects kaydından al. JSON gradeLevel → CSV grade_level, JSON code → outcome_code. Metadata formunda academicYear/programCode/gradeLevel/programVersion/authority/sourceUrl/sourceTitle kullanılır.
6. Önizlemede sıfır geçersiz satır, doğru satır sayısı, aynı bağlamda tekil kodlar ve doğru ders/sınıf kontrolünü sağla. Kaynağı insan doğrulamasıyla teyit etmeden confirmedOfficial=true onayı verme. Yeni eğitim yılı/sürüm eski kayıtların üzerine yazılmaz.
7. Commit sonrası cv.verified, gerçek outcomes sayısı/metinleri, ders/sınıf/yıl, aktif durum ve `ln_` öğrenme düğümlerini karşılaştır. Kaynak olayının/hashinin ve denetim kaydının oluştuğunu doğrula. Eski soru, sonuç ve bağlantıların korunmasını kontrol et.
8. Üretim görevi yalnız bu doğrulanmış sürüm ve outcomeId üzerinden oluşturulur. Kazanım aktarımı; model başarısı, pedagojik kalite, telif onayı veya üretim kotası oluşturmaz.

Aktarım kontrol listesi: resmî kaynak ✓; sınıf/ders/yıl/program ✓; kaynak sürümü/hash ✓; birebir kod/metin ✓; tema kimliği ✓; önizleme hata=0 ✓; commit sonrası sayı/metin/düğüm karşılaştırması ✓; eski kayıtlar korundu ✓. Eksik kalan her madde görünür bir engeldir.

Bu görevde sonraki sınıf/ders seçilmedi ve yeni resmî veri sağlanmadı. İçerik doldurulmadı. Genişletmeye geçmek için kullanıcıdan hedef sınıf/ders ve ilgili resmî URL/PDF istenecek.

## 4. Gerçekçi hedef hesabı

Sabit girdiler: 10 inceleme bekleyen taslak; 45/50 rezerve → 5 yeni soru rezervasyonu; başarısız/iptal rezervasyon iade edilmez. 3 editoryal denemede 0 kayıt yalnız 0/3 gözlemidir. Şema düzeltmesi sonrası başarı oranı veya gerçek model üretimi kanıtlanmış değildir. Bu çalışmada gerçek çağrı yapılmadı.

Değişkenler:

- X: insanın tamamlayabileceği soru incelemesi/gün (kullanıcı girecek).
- p: bir yeni rezervasyonun bütün otomatik kapılardan geçip REVIEW taslağına dönüşme olasılığı; bilinmiyor. Ham model JSON başarısı ile karıştırılmaz.
- a: insan incelemesinden sonra içerik ve kullanım haklarıyla kabul edilen oran; bilinmiyor.
- G: izinli günlük yeni soru rezervasyonu kapasitesi; sağlayıcı kapasitesi ölçülmedi.
- D: kalan takvim günleri; başlangıçta 50. Geçmiş günler hedef yeniden hesaplanınca yok sayılmaz.

Yeni kayıt beklentisi 5p; kesin yeni kayıt aralığı 0–5. Mevcut pilot kapsamında toplam aday üst sınırı 10+5=15; bunların hepsi kabul edilecek değildir. Sabit p/a ve yeterli zaman varsayımıyla beklenen kabul için üst sınır `a × min(DX, 10+5p)`; bu bir başarı taahhüdü değil kapasite hesabıdır. X=0 ise kabul=0. İnsan kararları olmadan APPROVED=0 kalır.

500000/50 = 10000 kabul/gün. Gerekli koşullar `aX ≥ 10000` ve sürekli üretimde `paG ≥ 10000` olur. Bu koşullar yeterlilik kanıtı değildir. Mevcut beş yeni rezervasyonla 500000 hedefi hiçbir senaryoda karşılanamaz. Bütçeyi, key zincirini, deneme sayacını veya rezervasyonu sıfırlama önerilmez. Daha büyük üretim ancak ayrı, açıkça kararlaştırılmış kapasite ve bütçe kapsamında değerlendirilebilir.

| Senaryo | Bilinmeyen girdiler | 50 günlük beklenen kabul üst sınırı | Anlam |
|---|---|---|---|
| Kötümser | p_k, a_k | a_k × min(50X, 10+5p_k) | Başarı veya kabul oranına sayı atanmamıştır |
| Gerçekçi/ölçüm bekleyen | p_g, a_g | a_g × min(50X, 10+5p_g) | Ölçüm yokken merkezi tahmin üretilemez |
| İyimser | p_i, a_i | a_i × min(50X, 10+5p_i) | Matematiksel tavan bile en fazla 15 kabul |

Koşullar: 0≤p_k≤p_g≤p_i≤1; 0≤a_k≤a_g≤a_i≤1. Bunlar ölçülmüş oranlar değildir. İyimser sınır p_i=a_i=1 alınsa dahi bu yalnız teorik tavandır, modelin başardığı iddiası değildir. 3 Aralık hedefi korunacaksa o günkü D üzerinden gerekli hız `(500000−gerçek onaylı sayı)/D` hesaplanır; başlangıçtaki 10000/gün geç kalan günleri karşılamaz.

| Zaman | Kilometre taşı | Ölçülebilir çıktı |
|---|---|---|
| 1. hafta | X'i belirle, ilk on taslağı dondur ve incelemeyi başlat | En çok min(10,7X) tam inceleme; karar/gerekçe/hak kanıtı |
| 2. hafta | Ayrı talimat ve gerekli teknik koşullar sağlanırsa kalan en fazla 5 rezervasyon içinde düzeltme sonrası gerçek üretimi gözlemle | Gözlenen deneme/kayıt sayısı; gerçek p hâlâ belirsizliğiyle raporlanır |
| 3. hafta | Ret/düzeltme nedenlerini sınıflandır; boş müfredat prosedürünü resmî kaynakla tamamla | Doğrulanmış kayıt veya açık kaynak engeli; onay garantisi yok |
| 4. hafta | Yeni adayları ve düzeltmeleri incele | İnsan kabul oranı a ve süre ölçümü; aynı adayların tekrar sayılmaması |
| 5. hafta | Kazanım, hata türü, yaş ve hak kapsamı boşluklarını kontrol et | Doldurulmuş inceleme kayıtları ve kaynak eksikleri |
| 6. hafta | Ölçülmüş X, p, a ve güncel D ile devam edilebilirliği hesapla | 500000 hedefiyle kanıtlı kapasite farkı; yeni bütçe varsayımı yok |
| 7. hafta | Kapanış: onay, ret, düzeltme ve bekleyen hak dosyalarını raporla | Toplam aday sayısı mevcut pilotta en fazla 15; otomatik yayın yok |
| 50. gün | Gerçekleşen kabulü hedefle karşılaştır | Tahminler değil gerçek insan onayları |

Haftalık sınırlar birikimlidir: ilk on taslak her hafta yeniden on aday sayılmaz. Tüm haftalardaki yeni rezervasyonların toplamı en fazla 5'tir; her hafta beş yeni hak doğmaz. X düşükse görevler sonraki haftaya taşar. Gerçek model gözlemi bu görevin parçası değildir ve şimdi çalıştırılmaz. Haftalar zorunlu bekleme süreleri değildir; önceki koşullar sağlanırsa sonraki adım daha erken tamamlanabilir.

Repoda cron ve pilot yürütücü kodu vardır; bunların varlığı etkin 7/24 üretim kanıtı değildir. Bu pakette zamanlayıcı/Queue/kampanya etkinleştirilmedi.

## Uyguladıktan sonra elle yapacağım doğrulama adımları

1. İlgili testleri, TypeScript ve derlemeyi çalıştır; gerçek AI anahtarı/bağlantısı kullanma.
2. TABLE şemasında categories/values; BAR_CHART'ta columns/rows; TEXT/NONE'da bütün görsel dizilerin sıfır uzunluk sınırını kontrol et.
3. Sahte finish_reason=length yanıtında geçerli JSON olsa bile null döndüğünü; kesik JSON'un da reddedildiğini doğrula. Tam, geçerli stop yanıtı okunabilmeli.
4. CSV'yi Excel'de aç; on farklı soru ID'si, orijinal revizyon, BEKLIYOR alanları ve RESTRICTED durumlarını doğrula. Kararların boş olduğuna bak.
5. Bir taslağı panelde aç; CSV revizyonu güncel değilse o inceleme kararını kullanma. İçerik ve hakları insan kontrolünden geçmeden onay/yayın yapma.
6. Boş JSON'un kazanım ve kaynak alanları tamamlanmadan içe aktarılamayacağını doğrula. Bu dosyayı canlı sisteme boş haliyle yükleme.
7. X'i belirle; p/a'yı bilinmiyor bırak. Formüllerde beş yeni rezervasyonun her hafta yenilenmediğini ve başarısız işlerin iade edilmediğini kontrol et.

Yerel doğrulama: tüm testlerde 206 dosya ve 1070 test geçti; editoryal şema/validasyon/yürütücü alt kümesinde 3 dosya ve 77 test geçti; TypeScript ve Vite derlemesi başarılı. CSV'de 10 tekil soru, boş kararlar ve RESTRICTED statüleri; JSON'da boş outcomes doğrulandı.
