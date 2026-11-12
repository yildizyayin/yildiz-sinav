# 5. sınıf MAT.5.1.2 — 50 soru, editoryal inceleme paketi

## Kapsam ve durum
- **Resmî öğrenme çıktısı:** MAT.5.1.2 — Doğal sayılar ve işlemler içeren gerçek yaşam problemlerini çözebilme.
- **Resmî kaynak:** https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/447
- **Kaynak öğretim yılı:** 2026–2027 (güncel resmî çıktı kaynağına göre).
- **Dosyalar:** MAT512_part01_10_questions.json … MAT512_part05_10_questions.json
- **Adet:** 50 çoktan seçmeli, dört şıklı özgün taslak soru.
- **Durum:** DRAFT / NOT_APPROVED / NOT_DEPLOYED.
- **Mevcut A082 toplu aktarımı yalnız 2027–2028 yılını kabul ediyor:** Yıl uyuşmazlığını düzeltmeden bu taslakları import etme.

## Kontrol edilenler
- Dosyalar tekrar okunarak her dosyada 10 soru ve toplam 50 soru doğrulandı.
- 50 soru kökü tekil; her sorunun 4 seçeneği farklı.
- Her sorunun doğru cevap harfi mevcut, çözümleri yazılı.
- Anahtar harflerinin dağılımı: A=13, B=13, C=12, D=12.
- Her satırın sınıfı 5; kodu MAT.5.1.2.
- Veri tabanına yazma, merge, production deploy ve canlı öğrenci testi yapılmadı.

## Şart olan editoryal incelemeler
1. **MEB beceri/süreç uyumu:** Problem çözme adımlarının (tahmin, temsil, strateji, kontrol) yeterli çeşitliliği; tümü çoktan seçmeli olduğundan açık uçlu ve performans görevlerini ayrıca planla.
2. **Hata analizi:** Öğretmen tüm soruları bağımsız çözerek doğru anahtar, dil, çeldirici mantığı, birim ve bağlamı doğrulamalı.
3. **Zorluk dağılımı:** Taslaklar ağırlıkla 1–4 düzeyindedir; 5 ve 6 düzeyi kaliteli non-rutin sorular henüz hazırlanmadı. Bu eksikliği kalite onayı olmadan etiket değiştirerek kapatma.
4. **Özgünlük/telif:** Benzer soruları tüm mevcut ANUNEX havuzuyla karşılaştır; hak/üretim kaydını incele. Metin için OWNED beyanının kurumsal olarak doğrulanması gerekir.
5. **Gerçek görsel:** Bu partide henüz gerçek fotoğraf dosyası yok. Uygun haklı fotoğraflı sorular `question_assets` üzerinde ayrı inceleme ve güvenli mühürleme sonrasında eklenmeli.
6. **Çözümler ve seçenekler:** Otomatik seçenek üretimi bazı çeldiricilerde yalnız sayı farkına dayanıyor; öğrencinin gerçek işlem hatalarına karşılık gelen seçeneklerle editör iyileştirmesi gerekli.
7. **Yıl/kazanım güvenliği:** 2026–2027 sürümüne ait kazanımı 2027–2028 için kontrolsüz eşdeğer sayma. Her eğitim yılı için kayıtlı, doğrulanmış MEB sürümünü kullan.
8. **Kabul:** Öğretmen ve Süper Admin incelemesi tamamlanmadan APPROVED yapılmayacak; ana dala merge/deploy yok.

## Üretim önceliği
1. 5. sınıf tüm resmî ders/öğrenme çıktıları için kapsam envanteri ve onaylı kaynak kodları.
2. Her çıktıya 50 kaliteli soru; doğruluk, zorluk, görsel ve özgünlük kalite kapıları.
3. Toplu yükleme sözleşmesini doğru eğitim yılıyla uyumlu hale getirme.
4. Tüm sınıf/kazanım/öğrenci erişim ve performans testleri.
5. **Yalnız en sonunda, açık kullanıcı onayıyla production deploy.**

Not: Bu paket kalite bakımından nihai 50 soruluk yayımlanabilir havuz olarak değil, öğretmen onayına sunulacak taslak içerik olarak değerlendirilmelidir.
