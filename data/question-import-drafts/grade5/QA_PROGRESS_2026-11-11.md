# ANUNEX 5. sınıf soru havuzu — toplu taslak kalite raporu
**İnceleme tarihi:** 11 Kasım 2026  
**Ana dal/PR:** `content/grade5-all-outcomes-bulk-20261111` / PR #525  
**Durum:** Yalnız taslak dosyalar. **Akademik onay, D1 aktarımı ve deploy yapılmadı.**

## Hedef / ilerleme
| Ders | Resmî öğrenme çıktısı | Hedef soru | Taslak | Editoryal onay |
|---|---:|---:|---:|---:|
| Türkçe | 80 | 4.000 | 0 | 0 |
| Matematik | 23 | 1.150 | 750 | 0 |
| Fen Bilimleri | 26 | 1.300 | 0 | 0 |
| Sosyal Bilgiler | 18 | 900 | 0 | 0 |
| İngilizce | 178 | 8.900 | 0 | 0 |
| Din Kültürü | 18 | 900 | 0 | 0 |
| **Toplam** | **343** | **17.150** | **750** | **0** |

### Tam 50 taslağa ulaşan on beş matematik çıktısı
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

## Yapısal denetim (GitHub'dan dosyalar yeniden okunarak)
- 27 JSON soru içerik dosyası, toplam **750** taslak soru.
- 15 öğrenme çıktısına tam 50'şer kayıt.
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
9. **Onay/yükleme:** 750 taslağın hiçbiri bu çalışma kapsamında `APPROVED` değil. D1, staging veya production'a yazıldığı iddia edilmez.

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
