# ANUNEX 5. sınıf soru havuzu — toplu taslak kalite raporu
**Son inceleme tarihi:** 12 Kasım 2026  
**Ana dal/PR:** `content/grade5-all-outcomes-bulk-20261111` / PR #525  
**Durum:** Yalnız taslak dosyalar. **Akademik onay, D1 aktarımı ve deploy yapılmadı.**

## Hedef / ilerleme
| Ders | Resmî öğrenme çıktısı | Hedef soru | Taslak | Editoryal onay |
|---|---:|---:|---:|---:|
| Türkçe | 80 | 4.000 | 0 | 0 |
| Matematik | 23 | 1.150 | 1.150 | 0 |
| Fen Bilimleri | 27 | 1.350 | 100 | 0 |
| Sosyal Bilgiler | 18 | 900 | 0 | 0 |
| İngilizce | 178 | 8.900 | 0 | 0 |
| Din Kültürü | 18 | 900 | 0 | 0 |
| **Toplam** | **344** | **17.200** | **1.250** | **0** |

### Tam 50 taslağa ulaşan yirmi üç matematik çıktısı
- MAT.5.1.1: 50, eski PR #519.
- MAT.5.1.2: 50, eski PR #522.
- MAT.5.1.3: 50, `MAT513_part01/02_25_questions.json`.
- MAT.5.1.4: 50, `MAT514_part01/02_25_questions.json`.
- MAT.5.2.1: 50, `MAT521_part01/02_25_questions.json`.
- MAT.5.2.2: 50, `MAT522_part01/02_25_questions.json`.
- MAT.5.2.3: 50, `MAT523_part01/02_25_questions.json`.
- MAT.5.2.4: 50, `MAT524_part01/02_25_questions.json`.
- MAT.5.3.1: 50, `MAT531_part01/02_25_questions.json`, ayrıca **8 uygulamalı çizim görevi** (`MAT531_8_performance_tasks_review_only.json`, çoktan seçmeli sayıya dahil değildir).
- MAT.5.3.2: 50, `MAT532_part01/02_25_questions.json`, ayrıca **10 çizim-öz değerlendirme görevi** (kota dışında).
- MAT.5.3.3: 50, `MAT533_part01/02_25_questions.json`, ayrıca **10 açıölçer uygulama görevi** (kota dışında).
- MAT.5.3.4: 50, `MAT534_part01/02_25_questions.json`, ayrıca **10 çizim/ölçüm/gerekçe görevi** (kota dışında).
- MAT.5.3.5: 50, `MAT535_part01/02_25_questions.json`, ayrıca **10 çokgen inşa görevi** (kota dışında).
- MAT.5.3.6: 50, `MAT536_part01/02_25_questions.json`, ayrıca **10 çokgen/üçgen deney görevi** (kota dışında).
- MAT.5.3.7: 50, `MAT537_part01/02_25_questions.json`, ayrıca **10 kesişen çember ve üçgen inşa görevi** (kota dışında).
- MAT.5.4.1: 50, `MAT541_part01/02_25_questions.json`, ayrıca **10 çevre/kenar tasarım görevi** (kota dışında).
- MAT.5.4.2: 50, `MAT542_part01/02_25_questions.json`, ayrıca **10 birim kare/alan keşif görevi** (kota dışında).
- MAT.5.4.3: 50, `MAT543_part01/02_25_questions.json`, ayrıca **10 alan/çevre karşılaştırma ve piksel sanat görevi** (kota dışında).
- MAT.5.4.4: 50, `MAT544_part01/02_25_questions.json`, ayrıca **10 gerçek yaşam problem çözme görevi** (kota dışında).
- MAT.5.5.1: 50, `MAT551_part01/02_25_questions.json`, ayrıca **10 anket/veri/toplama/poster görevi** (kota dışında).
- MAT.5.5.2: 50, `MAT552_part01/02_25_questions.json`, ayrıca **10 yanlılık/hata/kanıta dayalı tartışma görevi** (kota dışında).
- MAT.5.6.1: 50, `MAT561_part01/02_25_questions.json`, ayrıca **10 olasılık spektrumu ve modelleme görevi** (kota dışında).
- MAT.5.6.2: 50, `MAT562_part01/02_25_questions.json`, ayrıca **10 adil oyun/az-çok olasılık gerekçelendirme görevi** (kota dışında).

## Yapısal denetim (GitHub'dan dosyalar yeniden okunarak)
- 43 JSON soru içerik dosyası, toplam **1.150** taslak soru.
- 23 öğrenme çıktısına tam 50'şer kayıt.
- Her soruda 4 farklı seçenek ve dolu doğru cevap/çözüm alanı.
- Yanlış sınıf/kazanım kodu, birebir tekrarlanan soru kökü veya eksik anahtar **saptanmadı**.
- Her kazanımda cevap şıkları dengeli (A=13, B=13, C=12, D=12).
- MAT.5.2.1–5.2.4'ün toplam 200 sorusunun MEB başlıkları ve süreç bağlamları https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/450 ile karşılaştırılarak taslaklandı.
- **Bu denetim bütün matematiksel cevapların bağımsız ispatı veya müfredatın tüm süreç bileşenlerinin kanıtı değildir.**

## Açık kalite engelleri
1. **Şablon tekrarı:** Rakamları kaldıran soru-kökü taramasında farklı sayılarla kurulmuş benzer tasarımlar tespit edildi. Özellikle MAT.5.1.1'de sayı okuma/basamak değeri gibi görevler aynı kalıbı sıklıkla kullanıyor; MAT.5.2.2'de çok sayıda çıplak işlem ifadesi bulunuyor. Gerçek problem çeşitliliği, karşılaştırma ve performans bileşenleri için editör revizyonu gerekir.
2. **Zorluk dağılımı:** Yeni sorular MAT.5.2.1 için 1–5; diğer üç çıktı için ağırlıkla 1–4. **5 ve 6 düzeyleri eksik.** Etiketleri yapay olarak artırma, gerçekten yeni ve nitelikli zor sorular üret.
3. **Çözüm ayrıntısı:** Bazı yeni sayı örüntüsü ve işlem önceliği çözümleri kısadır. Öğretmen açıklaması ve yanlış seçenek gerekçesi güçlendirilmeli.
4. **Resmî süreç kanıtı:** MEB MAT.5.2.1 genelleme/gerekçe; MAT.5.2.2 problem kurma; MAT.5.2.3 bağımsız örüntü/poster; MAT.5.2.4 algoritma/şema/tablolaştırma bekler. Dört seçenekli testlerin tümü tek başına \"%100 Maarif Modeli\" uygunluğunun kanıtı değildir. Açık uçlu / uygulama görevleri ve rubrikler oluşturulmalı.
5. **Görsel eksikliği:** Hiçbir gerçek fotoğraf dosyası bu PR'a yüklenmedi. Kaynak izinleri ve `question_assets` entegre edilmeden \"görselli hazır soru\" etiketi kullanma.
6. **Müfredat yılı farkı:** İlk 100 soru `2026-2027` kaynağıyla, hedef registry `2027-2028` olarak kaydedilmiştir. Yıl eşdeğerliği resmî kayıtlarla doğrulanmadan D1 commit yok.
7. **Resmî katalog belirsizliği:** Türkçe kataloğunda dokuz tema açıklaması çatışma kaydı bulunuyor; resmî sürümle düzeltilmeli.
8. **Telif beyanı:** `OWNED` içeriğin başlangıç etiketidir, otomatik özgünlük/telif sertifikası değildir; kayıtlar incelenmeli.
9. **Onay/yükleme:** 1.150 taslağın hiçbiri bu çalışma kapsamında `APPROVED` değil. D1, staging veya production'a yazıldığı iddia edilmez.

## Sonraki kabul
Öğretmen bağımsız çözümleri ve kapsam gözden geçirmesi, benzer kalıpları özgün görevlerle değiştirme, zorluk 5–6 tamamlama, hakları belgelenmiş görsel/grafik ekleme, resmî yıl/kod eşleştirmesi, uygun soru biçimleri, toplu 500-satırlık import preview/REVIEW aşaması, staging regresyon testleri, kullanıcı tarafından onaylı **son deploy**.

### Komut
```bash
node scripts/grade5-question-bulk-audit.mjs
node scripts/grade5-question-bulk-audit.mjs --strict
```
`--strict` mevcut eksik hedefler, resmî sürüm/etiket çatışmaları ve onay engelleri nedeniyle **bilerek başarısızdır**; bu durum güvenlik koşuludur.

## Sonraki çalışma: MAT.5.3.1 çizim becerisi (50 + 8)
- Resmî süreç bileşenleri: (a) nokta/doğru/doğru parçası/ışın/açı/çember/dikme araçlarını tanıma; (b) uygun aracı belirleme; (c) aracı kullanarak çizme. Resmî kaynak: https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/448
- 50 çoktan seçmeli taslak soru, iki ayrı 25 satırlık JSON dosyasında. Ek olarak sekiz rubrikli performans görevi hazırlanmıştır. **Performans görevi sayısı 450 soru sayısına dahil değildir**, mevcut A082 MC aktarım API'si bu formatı kabul etmez.
- Şekil çizme yeteneği yalnız çoktan seçmeli soruyla kanıtlanamaz. Öğrencinin cetvel, pergel, gönye ve uygun dijital aracı gerçek kullanımına ilişkin öğretmen gözlemi gerekir.
- Fotoğraf/dijital çizim görselleri henüz sisteme bağlı değil. Telif/yaş uygunluğu/vektörel doğruluk kontrolü gerekir.
- Bu bölüm için son durumda soruların cevap anahtarı alanları ve seçenekleri yapısal olarak kontrol edildi; akademik uzman denetimi ve öğrenci kullanımı testi yapılmadı.

## MAT.5.3.2 ve MAT.5.3.3 ek çalışma (11 Kasım 2026)
- MEB resmî kaynak: https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/448 . MAT.5.3.2 süreç bileşenleri deneyimi gözden geçirme, geometrik özellik çıkarımı, çıkarımı farklı örneklerde değerlendirme; MAT.5.3.3 ise açıölçeri tanıma, uygun aracın seçimi ve fiilen kullanılmasıdır.
- Bu turda dört JSON dosyasında **100 yeni taslak soru**; ek olarak MAT.5.3.2 için **10 yansıtma/çizim**, MAT.5.3.3 için **10 ölçme/çizim** rubrikli görev. Uygulama görevleri 550 soru sayısına dâhil değildir.
- Yeni 100 soruda 4 farklı seçenek, dolu cevap/çözüm ve mükerrer-kök denetimi yapıldı, yapısal hata bulunmadı. **Bağımsız akademik/öğretmen onayı değildir.**
- Zorluk: MAT.5.3.2'de 1:4, 2:11, 3:24, 4:11; MAT.5.3.3'te 1:10, 2:24, 3:15, 4:1. 5–6 düzeyi bu çıktılarda bulunmuyor, akademik genişletme gerekir.
- Açıölçer şık/ölçek soruları henüz basıma uygun gerçek açıölçer görsellerine bağlanmadı. Doğru görsel kurulup kaynağı, ölçeği ve matematiksel doğruluğu kontrol edilmeden görsel soru olarak yayımlanamaz.

## MAT.5.3.4 ve MAT.5.3.5 ek çalışma — 11 Kasım 2026
- Resmî kaynak: https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/448 (iki/üç doğru ve açı ilişkileri; ardışık kesişerek kapanan dış bükey çokgenler).
- **100 yeni çoktan seçmeli taslak:** MAT.5.3.4 ve MAT.5.3.5 için 50'şer. Ayrıca 20 rubrikli uygulama görevi. Bu 20 görev 650 soru sayısına **dahil değildir** ve mevcut MC API ile yüklenmez.
- Yeni 100 sorunun GitHub dosyaları yeniden okunarak 4 farklı seçenek, dolu anahtar ve çözüm, birebir kök tekrarı ve kazanım eşleştirmesi denetlendi: **yapısal hata bulunmadı**. Bu kontrol uzman akademik onayı yerine geçmez.
- Zorluk dağılımı MAT.5.3.4: L1=4, L2=19, L3=21, L4=6; MAT.5.3.5: L1=9, L2=23, L3=13, L4=5. **L5 ve L6 eksik**, sırf etiketi değiştirerek tamamlama yapılamaz.
- Açılı doğru çizimleri, açıölçer grafiklerinin orijinal geometrik doğruluğu; çokgenlerin kesişim/kapalılık gösterimi ve lisanslı görseller **eklenmedi**. Şekil dosyaları olmadan resimli soru olarak yayınlama.
- Doğrudan D1 içe aktarım, 2026–27 / 2027–28 resmî müfredat sürüm eşdeğerlik doğrulaması, matematik öğretmeni kontrolü ve nihai Claude Code promptu bekliyor.

## MAT.5.3.6 / MAT.5.3.7 yeni paket (11 Kasım 2026)
- Resmî 5. sınıf geometri öğrenme çıktısı ve süreç bileşenleri: https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/448.
- Bu tur iki yeni kazanım için **100 çoktan seçmeli taslak** ve ayrıca toplam **20 rubrikli uygulama görevi** hazırlandı. Uygulama görevleri 750 sayısına dahil değil ve mevcut çoktan seçmeli importer ile aktarılamaz.
- MAT.5.3.6: düzgün çokgenler (eş kenar ve eş iç açı), üçgende 180° iç açı toplamı, kenar/açıya göre üçgen türleri, köşegenleri tanıma ve yanlış genellemeye karşı örnek. Üçgen dışındaki çokgenlerin iç açı toplamı formülleri, köşegen sayıları formülleri kapsam dışında tutuldu.
- MAT.5.3.7: iki noktada kesişen farklı merkezli çemberlerin yarıçapları ve merkez uzaklığının oluşturduğu üçgenlerde kenar türü çıkarımı, eşkenar/ikizkenar/çeşitkenar inşa ve doğrulama. İleri düzey Pisagor hesabı içeren ilk taslak soru kapsam dışı görüldü ve uygun kenar karşılaştırmasıyla değiştirildi.
- Yeni 100 sorunun tamamı GitHub'dan tekrar okunarak kazanım, sınıf, 4 farklı seçenek, doğru cevap/çözüm alanı ve birebir soru kökü yönünden denetlendi. **Yapısal hata yok**, fakat bu inceleme bağımsız matematik öğretmeni onayı değildir.
- MAT.5.3.6 zorluk: 1=8, 2=17, 3=19, 4=6. MAT.5.3.7 zorluk: 1=6, 2=18, 3=22, 4=4. Zorluk 5 ve 6 yok; bunları etiket değiştirerek tamamlamayacağız.
- Geometrik çizimlerin/çember kesişimlerinin matematiksel doğruluğu uzman tarafından ayrıca teyit edilmeli. Görseller henüz lisanslı medya olarak eklenmedi. Öğrenciye yayımlama, D1 import ve deploy yapılmadı.

## MAT.5.4.1 ve MAT.5.4.2 — yeni 100 soru, 20 görev (11 Kasım 2026)
- Resmî MEB kaynak https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/451 (güncelleme 28.08.2026). MAT.5.4.1 çevresi verilen doğal sayı kenarlı farklı dikdörtgenleri oluşturma/yorumlama; MAT.5.4.2 seçilmiş eş birim kareyle alan ölçme ve satır-sütun çarpımına ulaşma.
- 100 çoktan seçmeli soru **dört ayrı 25'lik JSON dosyasında**. MAT.5.4.1 için 50; MAT.5.4.2 için 50. Ayrıca 10'ar uygulamalı görev, ayrı performans JSON'larında. **88 toplam uygulama görevi** soru sayısına dahil değildir ve mevcut çoktan seçmeli importer ile aktarılmamalıdır.
- Yeni 100 soruda GitHub yeniden okuma denetimi: geçerli 5. sınıf/kazanım kodu, 4 farklı seçenek, dolu anahtar ve çözüm, birebir tekrar yok. Yapısal kontrol geçildi; öğretmen onayı veya bağımsız matematik doğrulaması henüz yok.
- MAT.5.4.1 zorluk etiketleri: L1=7, L2=17, L3=12, L4=9, L5=4, L6=1. MAT.5.4.2: L1=7, L2=23, L3=15, L4=3, L5=2, L6=0. 6. düzey alan paketi için gerçek beceri temelli zorlu görevler hazırlanmalı; etiket yapay biçimde yükseltilmemeli.
- MEB MAT.5.4.2'nin bu bölümünde alan ölçü birimleri arası dönüşüm çalışmaları yer almıyor; dosyalara alan birimi dönüşümü sorusu konulmadı.
- Birim kare grid görselleri henüz oluşturulmadı; dolayısıyla metin tabanlı kareli modeller geometri görseli gibi gösterilemez. Hakları uygun, matematiksel olarak doğru görseller bağımsız QA sonrasında eklenmeli.
- Önceden tespit edilen 2026–27 / 2027–28 eşdeğerlik, telif ve akademik onay engelleri hâlâ geçerlidir. Staging D1/production yüklemesi ve deploy yapılmadı.

## 5.4.3–5.4.4 / 100 yeni taslak ve 20 performans görevi (11 Kasım 2026)
- Resmî kaynak: https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/451 (28 Ağustos 2026 güncellemesi).
- MAT.5.4.3: aynı alanlı farklı dikdörtgenlerin farklı çevreleri ve aynı çevreli farklı dikdörtgenlerin farklı alanlarını sayı tabloları ve karşı örneklerle karşılaştırma; çizim bağlamlarında **alan en fazla 36 birim kare**, kenarlar pozitif doğal sayı. MAT.5.4.4: günlük yaşamda alan/çevre için problem bileşenlerini ayırt etme, modelleme, farklı çözümleri karşılaştırma, tahmin ve kontrol etme. Alan ölçü birimi dönüştürme sorusu konulmadı.
- Bu turda `MAT543_part01/02_25_questions.json` ve `MAT544_part01/02_25_questions.json`: **100 yeni MC taslağı**, ayrıca `MAT543_10_performance_tasks_review_only.json` ve `MAT544_10_performance_tasks_review_only.json`: 20 uygulama görevi. Genel uygulama görevi sayısı **108**, 950 çoktan seçmeli soruya dahil değildir ve mevcut MC importer tarafından desteklenmez.
- Yeni dört JSON dosyası GitHub'dan yeniden okunarak 100 sorunun tamamında doğru sınıf/kazanım, dört benzersiz seçenek, cevap harfi, açıklama, 1–6 zorluk aralığı ve birebir kök tekrarı denetlendi. Yapısal hata bulunmadı. **Bu, bağımsız matematiksel doğruluk, ölçme-değerlendirme uzmanı onayı veya özgünlük sertifikası değildir.**
- MAT.5.4.3 zorluk: L1=4, L2=11, L3=25, L4=6, L5=3, L6=1. MAT.5.4.4 zorluk: L1=5, L2=12, L3=16, L4=13, L5=3, L6=1. Etiketlerin pedagojik uygunluğu uzman tarafından doğrulanmalı.
- Alan/çevre görselleri ve dijital piksel sanatı çıktıları eklenmiş değil. Telif, görsel doğruluk, resmî yıl/kod uyumu ve editoryal onay kontrol edilmeden üretim ortamına yazılmayacak.

## MAT.5.5.1 ve MAT.5.5.2 / İstatistiksel Araştırma Süreci (11 Kasım 2026)
- Resmî MEB kaynak: https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/452. MAT.5.5.1'in araştırma sorusu, veri toplama planı, anket, sıklık tablosu/grafik, analiz, sonuç ve öz değerlendirme bileşenleri; MAT.5.5.2'nin eleştirel inceleme, istatistiksel gerekçe, hata-yanlılık bulma ve kabul/çürütme süreçleri kullanıldı.
- **Dört yeni JSON dosyasında 100 taslak soru**, ayrıca 20 rubrikli araştırma/rapor inceleme görevi kaydedildi. Güncel toplam **1.050 MC taslak + 128 rubrikli ayrı görev**. Uygulama görevleri 1.050 sayısına dahil değildir; mevcut MC importer ile içe aktarılamaz.
- Tüm anket sayıları ve gazete/sosyal medya örnekleri sentetiktir; gerçek öğrenci/kişisel verisi alınmadı.
- GitHub'dan 4 yeni JSON yeniden okunarak her biri 25'lik 100 satırda 5. sınıf kodu, 4 benzersiz seçenek, doğru cevap harfi, dolu açıklama, 1–6 arası zorluk ve birebir soru kökü tekrar denetimi yapıldı. **Yapısal hata yok**. Bu, cevapların bağımsız istatistik uzmanı kontrolünü, gerçek veri kaynağı uygunluğunu veya pedagojik onayı **kanıtlamaz**.
- MAT.5.5.1 zorluk dağılımı: L1=8, L2=22, L3=11, L4=8, L5=1, L6=0; yüksek zorlukta nitelikli görev eksikliği var. MAT.5.5.2: L1=0, L2=11, L3=19, L4=16, L5=3, L6=1. En az 6 düzey için 5.5.1'de uzman denetiminde özgün görev gerekir.
- Grafikler yalnız metinsel verilerle temsil edilmiştir. Geçerli eksenli, matematiksel doğruluğu kontrol edilmiş özgün SVG/vektör grafik, veri kaynağı/izin ve yaş uygunluğu onayı henüz eklenmedi. Gerçek öğrenciye yayımlama engeli sürüyor.

## MAT.5.6.1 ve MAT.5.6.2: Matematik kazanım sayısı taslakta 23/23 (11 Kasım 2026)
- Resmî kaynak https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/455 (28 Ağustos 2026 güncellemesi). MAT.5.6.1: 0–1 spektrumunda imkânsız/kesin ve ara olasılık tahminlerini yüzde, kesir ve ondalıkla yorumlama. MAT.5.6.2: olaylar arasındaki neden-sonuç ilişkisine dayanarak az/çok olasılıklı ayrımı; adil oyun ve öznel tahmini gerekçelendirme.
- Bu bölümde **100 yeni MC soru**, dört ayrı 25 soruluk dosyada; iki kazanım için **20 ayrı rubrikli performans görevi**. Güncel matematik toplamı **1.150 MC taslağı**, **23 resmî çıktı × 50**, **148 ayrı görev** (MC sayısına dahil değildir). Diğer derslerde bu PR kapsamında soru taslakları hâlâ sıfırdır.
- Yeni 8 dosyadan (MAT551/552/561/562 part01/02) **200 soru** GitHub üzerinden tekrar okunarak dörder şık, geçerli anahtar, açıklama, 5. sınıf/kod, 1–6 zorluk ve birebir kök tekrarı kontrol edildi: yapısal hata tespit edilmedi. Bu denetim **akademik doğruluk veya telif/özgünlük onayı değildir**.
- MAT.5.6.1 zorluk etiketleri: L1=6, L2=31, L3=13, L4–L6=0. MAT.5.6.2: L1=2, L2=14, L3=19, L4=12, L5=3, L6=0. Her öğrenme çıktısında tüm altı zorluk düzeyinin nitelikli temsilini sağlama ve soru şablonu çeşitliliği ayrıca gerekli; yalnız etiketi yükseltme kabul edilmez.
- Olasılık spektrumunun özgün SVG çizimleri ve çark/dart/torba modellerinin uygun görselleri henüz eklenmedi. Oyun/rastgelelik varsayımlarının pedagojik ve matematiksel öğretmen kontrolü, hassasiyet/kavram geçerliği, resmî yıl/kod eşleştirmesi ve yayımlama onayı beklenmektedir.
- Matematikte hedef sayı **taslak olarak tamamlandı**, ancak öğretmen onaylı soru **0**. 5. sınıfın tüm altı dersi bitmiş gibi işaretlenmemeli. D1 import, main merge ve deploy yok.

## MATEMATİK TASLAK KAPSAM KAPISI — 11 Kasım 2026, son doğrulama
- **23/23 öğrenme çıktısı × 50 = 1.150 taslak soru** matematik için ana envanter ve GitHub taslak dosyalarında bulunuyor.
- **43 soru JSON dosyasının tamamı** GitHub'dan 4 grupta yeniden okundu. Parti kayıtları: 350 + 275 + 275 + 250 = **1.150**; her çıktı toplamında **50** soru. Her partide dört farklı seçenek, cevap harfi ve dolu çözüm, sınıf seviyesi, birebir tekrar kontrolü yapıldı. Bu yapısal taramada hata tespit edilmedi.
- **15 ek performans JSON dosyası**, toplam **148** görev. İlk hatalı kod-karşılaştırma kontrolündeki nokta ayırıcı sorunu düzeltildikten sonra tekrar kontrol edildi; kazanım kodu ve dosya içi görev sayısı uyuşmazlığı saptanmadı.
- 1.150 taslağın **0'ı öğretmen tarafından onaylanmış**, 0'ı canlı D1 veritabanına aktarılmıştır. `--strict` kabul kapısı hedef 17.150 ve öğretmen/telif onayı sağlanmadığı için geçmemelidir.
- **Bu, 5. sınıf Matematik için yalnız soru adedi ve yapısal formatın tamamlandığını ifade eder.** Ayrıntılı bağımsız konu uzmanı çözüm incelemesi, benzer soru kalıplarının iyileştirilmesi, 6 düzeyin her kazanımda nitelikli temsili, süreç bileşenlerini kapsayan uygulama kanıtı, SVG/vektör/gerçek görsel hakları ve kaynak yılı eşdeğerliği tamamlanmadı. MC sayısındaki tamlık otomatik kalite geçişi değildir.
- Sonraki 5. sınıf dersleri: Fen Bilimleri (26 çıktı/1.300 hedef), Sosyal Bilgiler (18/900), Din Kültürü (18/900), Türkçe (80/4.000), İngilizce (178/8.900). Bu derslerde henüz toplu soru dosyası yok; toplam **16.000** taslak hedefi kalıyor. Türkçe katalog çatışmaları çözülmeden resmî eşdeğerlik iddiası yok.

## Kullanıcı kalite geri bildirimi: görsel ve güncel olay açığı (11 Kasım 2026)
- Kullanıcı, matematikten seçilen 20 soruluk PDF'de görsel okuma ve güncel olay temelli içerik bulunmadığını belirtti. Bu tespit geçerlidir; PDF yalnız metin tabanlı taslak sorulardan seçilmiş olup **premium yayınevi soru örneklemi kalite kriterini karşılamaz**.
- Standart ve ölçümler: `VISUAL_CURRENT_CONTEXT_QUALITY_GATE.md`. Nihai 50 soruluk matematik/fen setlerinde, pedagojik olarak uygun olduğunda, **en az 15 görsele bağımlı** soru; konuya uygun gerçek olaylarda **en az 5 doğrulanmış ve tarihlenmiş bağlam** hedefi. Bu hedefler soru kotasına sayılmaz ve henüz karşılandı denmez.
- Fen ünitesi için doğrulanmış **12 Ağustos 2026 tam Güneş tutulması** örneği: `https://www.nasa.gov/image-article/2026-total-solar-eclipse-in-spain/`. Bu olayın hareket/konum kazanımıyla eşleştirilmesi gerekir; Güneş'in kendi ekseninde dönüşünü kanıtlayan olgu gibi kullanılmaz. NASA görseli bile yayınlanmadan önce hak/kredi kontrolünden geçecek.
- Mevcut 1.150 Matematik taslağına görüntü `assetId` eklenmedi, görsele bağımlı ve güncel gerçek haber içeren içerikler yeterince yok. **Matematik akademik/görsel kalite kapısı açık**; konu başına 50 kayıt bulunması bitmiş soru bankası anlamına gelmez.
- Fen soruları görsel/dönem verisi olmadan yüksek kalite diye pazarlanmayacak. Kaynağı, tarihi ve lisansı açık, kullanımı doğrulanmış gerçek görseller veya denetlenmiş özgün SVG/vektör grafiklerle tamamlanacak. İlk PDF tekrar gözden geçirilerek yeni basıma uygun V2 seçkide bu eksikler giderilmeli.

## 12 Kasım 2026 – Fen Bilimleri FB.5.1.1 yeni ilk gerçek paket
- Resmî MEB: https://tymm.meb.gov.tr/fen-bilimleri-dersi/unite/367; çıktı 'Güneş’in yapısı ve dönme hareketi ile ilgili bilgi toplayabilme'. Araç seçme, veri bulma, doğrulama ve kaydetme süreç bileşenlerinin hepsi için sorular bulunuyor.
- **50 soru taslağı**, `FB511_part01_25_questions.json` + `FB511_part02_25_questions.json`. **22 tanesi** altı gerçek dosyaya bağlanmış özgün SVG eğitim görseline dayanıyor. `assets/FEN111_01..06` dosyaları; altText ve kullanım gerekçeleri `FB511_visual_asset_manifest.json` içinde. **Gerçek NASA fotoğrafı yüklenmedi**, SVG'ler temsili diye etiketli. Orijinal çizimlerin matematiksel/bilimsel doğruluğu ve baskı okunabilirliği inceleme bekliyor.
- **10 ek bilimsel araştırma/gözlem görevi** `FB511_10_performance_tasks_review_only.json`; çoktan seçmeli soru kotası dışında. Matematiğin 148 ek göreviyle toplam **158** ek görev vardır.
- GitHub'daki 50 soru ve 6 görsel dosyası yeniden okunarak kazanım, 5. sınıf, 4 farklı seçenek, cevap anahtarı, çözüm, özgün soru kökü ve görsel linklerinin varlığı tarandı. **0 yapısal hata**. Cevap dağılımı A=13 B=13 C=12 D=12. Zorluk 1=3, 2=13, 3=19, 4=13, 5=2, 6=0; üst düzey beceri ve öğretmen kontrolü eksik.
- MEB resmi 7. ünite: https://tymm.meb.gov.tr/fen-bilimleri-dersi/unite/408. Katalogdan eksik `FB.5.7.1` (evsel atık sınıflandırma) bulundu ve hem ana manifest hem `data/question-branch-catalog-2028.json` güncellendi. Fen çıktısı **26 -> 27**, toplam **343 -> 344**, planlanan tüm 50'lik hedef **17.150 -> 17.200** olarak düzeltildi. Bu hedef İngilizce için karar verilen azaltılmış içerik modeli uygulanmadan önceki **geçici üst hedef**tir.
- Güncel taslak sayısı: Matematik 1.150 + Fen 50 = **1.200 / 17.200**. Onay 0. Başka öğrenme çıktısı Fen'de bitmiş gösterilmedi. Gerçek olaylı NASA arşiv sayfası ve kullanım şartları kaynak adayları arasında, fakat hak/teknik entegrasyon tamamlanmadan fotoğraflı nihai soru olarak sayılmayacak.

## 12 Kasım 2026 – İkinci Fen kazanımı FB.5.1.2 (Ay)
- `FB512_part01_25_questions.json` ve `FB512_part02_25_questions.json` içinde **50 soru taslağı**, bunların **23'ü görsele dayalı**. `assets/FEN112_01..05` içinde **5 özgün temsili SVG**. `FB512_visual_asset_manifest.json` içinde soru bağlantıları ve görsel hak/kalite durumları. Fotoğraflar yüklenmedi: **0 gerçek NASA fotoğrafı**.
- Ay'ın kayalık/kraterli yüzeyi, doğal uydu oluşu, kendi dönüşü ve Dünya çevresinde dolanması ile yaklaşık aynı yüzünü göstermesi MEB FB.5.1.2 süreçlerine göre işlendi. Ay evrelerinin ayrı modellemesi FB.5.1.3 kazanımına bırakıldı. Resmî kaynak: https://tymm.meb.gov.tr/fen-bilimleri-dersi/unite/367. Bilimsel kaynak: https://science.nasa.gov/moon/facts/.
- 2026 güncel olay kaynağı https://science.nasa.gov/solar-system/moon/nasas-lro-images-falcon-9-crater-on-moon-learns-new-details/ (5 Ağustos 2026 olay, 11–12 Ağustos gözlem). Eşleşen SVG yalnız **temsili önce/sonra**, gerçek olay fotoğrafı diye sunulmaz. Görsel hakları doğrulanmadan gerçek fotoğraf eklenmez.
- `FB512_10_performance_tasks_review_only.json` içinde 10 uygulamalı bilimsel gözlem/model görevi, kota dışıdır. Fen iki kazanım **100 soru + 20 görev**, matematik 1.150 + 148 görev ile toplam **1.250 taslak ve 168 ek görev**.
- Fen iki kazanımının 100 soru kaydı ve **11 SVG varlığı** GitHub'dan kontrol edildi: 50+50, görsel bağımlı soru 22+23=**45**, geçerli şık/cevap/çözüm, birbiriyle aynı soru kökü yok, **0 yapısal hata**. FB.5.1.2 cevap dengesi A13/B13/C12/D12. Zorluk dağılımı 1=6, 2=15, 3=15, 4=13, 5=1, 6=0; bilimsel ve öğretmen incelemesi bekler.
- **Sayı doğrulama:** `ALL_OUTCOMES_50_TARGET_MANIFEST.json` içinde 25 öğrenme çıktısında 50 taslak (23 MAT+2 FEN). Fen resmi 27 çıktıdan 2'si taslak içerikle dolu. Toplam hedef **344 × 50 = 17.200** (İngilizce azaltılmış hedefi uygulamadan önce); kalan **15.950**. Öğretmen onayı 0, D1/production/deploy 0.
