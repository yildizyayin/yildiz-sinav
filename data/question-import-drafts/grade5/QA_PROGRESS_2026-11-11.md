# ANUNEX 5. sınıf soru havuzu — toplu taslak kalite raporu
**İnceleme tarihi:** 11 Kasım 2026  
**Ana dal/PR:** `content/grade5-all-outcomes-bulk-20261111` / PR #525  
**Durum:** Yalnız taslak dosyalar. **Akademik onay, D1 aktarımı ve deploy yapılmadı.**

## Hedef / ilerleme
| Ders | Resmî öğrenme çıktısı | Hedef soru | Taslak | Editoryal onay |
|---|---:|---:|---:|---:|
| Türkçe | 80 | 4.000 | 0 | 0 |
| Matematik | 23 | 1.150 | 450 | 0 |
| Fen Bilimleri | 26 | 1.300 | 0 | 0 |
| Sosyal Bilgiler | 18 | 900 | 0 | 0 |
| İngilizce | 178 | 8.900 | 0 | 0 |
| Din Kültürü | 18 | 900 | 0 | 0 |
| **Toplam** | **343** | **17.150** | **450** | **0** |

### Tam 50 taslağa ulaşan dokuz matematik çıktısı
- MAT.5.1.1: 50, eski PR #519.
- MAT.5.1.2: 50, eski PR #522.
- MAT.5.1.3: 50, `MAT513_part01/02_25_questions.json`.
- MAT.5.1.4: 50, `MAT514_part01/02_25_questions.json`.
- MAT.5.2.1: 50, `MAT521_part01/02_25_questions.json`.
- MAT.5.2.2: 50, `MAT522_part01/02_25_questions.json`.
- MAT.5.2.3: 50, `MAT523_part01/02_25_questions.json`.
- MAT.5.2.4: 50, `MAT524_part01/02_25_questions.json`.
- MAT.5.3.1: 50, `MAT531_part01/02_25_questions.json`, ayrıca **8 uygulamalı çizim görevi** (`MAT531_8_performance_tasks_review_only.json`, çoktan seçmeli sayıya dahil değildir).

## Yapısal denetim (GitHub'dan dosyalar yeniden okunarak)
- 15 JSON soru içerik dosyası, toplam **450** taslak soru.
- 8 öğrenme çıktısına tam 50'şer kayıt.
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
9. **Onay/yükleme:** 450 taslağın hiçbiri bu çalışma kapsamında `APPROVED` değil. D1, staging veya production'a yazıldığı iddia edilmez.

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
