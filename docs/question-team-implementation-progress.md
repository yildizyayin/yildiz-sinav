# Soru Havuzu ajan ekibi — uygulama kaydı

14 Ekim 2026. Kullanıcı kalan işleri sırayla tamamlamayı ve **en son Süper Admin'e soru havuzu ajan ekibini izleme / manuel yönlendirme paneli** eklemeyi istedi. Panel, mevcut20 teknik izleme ajanından ayrı olarak gerçek soru üretim işlerini göstermeli. Bağımsız çalışan ajan veya7/24 üretim varmış gibi sabit durumlar gösterilmemeli.

## Uygulama sırası

1. Taslak içerik düzenleme: metin, seçenek, cevap ve çözüm; eski içerik değiştirilemez sürüm kaydı; revision fence; yeniden inceleme; AI kaynağı korunur. Onaylı/kullanılmış soruları yerinde değiştirmeyin. Zengin medya paketi için ayrı, birlikte sürümlenen düzenleme gerekir.
2. Bilinen dil/çeldirici kusurlarını AI destekli taslak düzeltmesi olarak kaydetme; insan onayı/telif uygunluğu verme. Görev çeşitliliği ve anlamsal tekrar kontrolünü güçlendirme. İlk10 hedefi 10 REVIEW taslak ile karşılandı; 0 insan onayı/yayın. 45/50 rezervasyon korunur, 5 yer kalır.
3. Özgünlük/telif ve medya/video işlerini gerçek yürütme kayıtlarına bağlama. Video çözüm senaryosu, ses, render ve oynatma ayrı kanıt ister. Sadece medya yayın kurallarının varlığı üretim kanıtı değildir.
4. En son Süper Admin paneli: üretim, bilimsel kontrol, özgünlük/telif ve medya/video ekipleri; iş kuyruğu, güncel çalışma, hata, reddedilen taslaklar, bekleyen insan incelemesi, model/kullanım ve kota. Manuel görev verme, duraklatma, uygun işi çalıştırma/iptal; onay kapılarını atlayan sınırsız serbest komut veya otomatik yayın yok.
5. Testler, demo kabulü ve son devam kaydı.

## İlk uygulama

0103 migration ve /api/question-bank-standard/:id/content: kullanılmamış metin taslağının kontrollü düzenlenmesi, değiştirilemez eski içerik ve aktör/gerekçe kaydı, kaynak/model/job korunması, AI telifini RESTRICTED'e ve durumu REVIEW'a döndürme. Kullanım son anda başlasa bile SQLite trigger düzenlemeyi durdurur. Student practice, mini-test/exposure, Studio, exam links, kitap ve assessment referansları korunur. SUPER_ADMIN + same-origin zorunlu. Zengin medya paketi kısmi güncellenmez.

UI: soru önizlemede metin/çözüm düzenleme ve sürüm geçmişi; soru veya revision değişiminde eski form ve inceleme beyanları taşınmaz.

Yerel:12 API/review testi +1 UI etkileşim testi geçti. Tüm migration'lar yerel D1'e başarıyla uygulandı. Tam test paketi ve GitHub/demo doğrulaması ayrıca takip edilir. Bu bir tamamlandı/7x24 aktif bildirimi değildir.

## Üretim görevi ve tekrar düzeltmesi

0104 migration: task_focus, instruction_note, priority işe yazılır ve sonradan değiştirilemez; aynı requestKey farklı yönlendirmeyle tekrar kullanılamaz. Üç odak uygulamanın alıştırma yönlendirmesidir, resmî MEB tanımı değildir; yalnız uygun5.sınıf resmî çıktı koduyla kabul edilir. Üretici odağı görür; bağımsız denetçi de uygulama talimatını kontrol eder.

Son12 köke ek olarak son4 sorunun sınırlı çözüm metni karşılaştırılır. Gerçek kutulama sayısal-kopyası için iki tüketim sonrası tam-kutu ailesi dar kapsamlı mekanik kontrolle engellenir. Tüm havuzda kusursuz semantik tekillik iddiası yoktur. Yeni testler, çözüm adımları yeniden sıralanan kitap/kalem kopyasını ve yanlış sıfırlı-bölük odağını engeller.

## 14 Ekim — gerçek ilk on ve medya uygulaması

Staging kalite çalışması 38531527597 başarılı: dört taslak sürümlenerek düzeltildi ve bağımsız modelle yeniden kontrol edildi; iki odaklı iş ilk denemede tamamlandı. Kanıt: data/question-team-first-ten-20261014.json. Bunlar insan/telif onayı bekleyen gerçek taslaklardır. Doğru cevap dağılımı ve yeni okuma sorusunun D açıklaması için ek editoryal düzenleme planlıdır.

0105/0106, gerçek kontrol duraklatma kapıları, kaynak sürümüne bağlı medya işi, özel R2 video, süreli tek-iş render yetkisi, insan video onayı ve ekip API'si uygulanmıştır. Henüz uzak ortama dağıtılmadı. Yerel FFmpeg sentetik teknik MP4 üretimi başarılı (10 saniye, 1280x720, altyazılı); öğrenci videosu veya doğal ses kanıtı değildir. Son odaklı 53 test başarılı. Süper admin ekranı ve uzak video kabulü devam ediyor. Ücretli ses etkinleştirilmedi; otomatik soru üretimi kapalı kalır.
