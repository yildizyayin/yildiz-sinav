# Soru Havuzu ajan ekibi — uygulama kaydı

14 Ekim 2026. Kullanıcı kalan işleri sırayla tamamlamayı ve **en son Süper Admin'e soru havuzu ajan ekibini izleme / manuel yönlendirme paneli** eklemeyi istedi. Panel, mevcut20 teknik izleme ajanından ayrı olarak gerçek soru üretim işlerini göstermeli. Bağımsız çalışan ajan veya7/24 üretim varmış gibi sabit durumlar gösterilmemeli.

## Uygulama sırası

1. Taslak içerik düzenleme: metin, seçenek, cevap ve çözüm; eski içerik değiştirilemez sürüm kaydı; revision fence; yeniden inceleme; AI kaynağı korunur. Onaylı/kullanılmış soruları yerinde değiştirmeyin. Zengin medya paketi için ayrı, birlikte sürümlenen düzenleme gerekir.
2. Bilinen dil/çeldirici kusurlarını AI destekli taslak düzeltmesi olarak kaydetme; insan onayı/telif uygunluğu verme. Görev çeşitliliği ve anlamsal tekrar kontrolünü güçlendirme. İlk10 hedefi hâlâ8 REVIEW +1 REJECTED durumunda;43/50 rezervasyon korunur.
3. Özgünlük/telif ve medya/video işlerini gerçek yürütme kayıtlarına bağlama. Video çözüm senaryosu, ses, render ve oynatma ayrı kanıt ister. Sadece medya yayın kurallarının varlığı üretim kanıtı değildir.
4. En son Süper Admin paneli: üretim, bilimsel kontrol, özgünlük/telif ve medya/video ekipleri; iş kuyruğu, güncel çalışma, hata, reddedilen taslaklar, bekleyen insan incelemesi, model/kullanım ve kota. Manuel görev verme, duraklatma, uygun işi çalıştırma/iptal; onay kapılarını atlayan sınırsız serbest komut veya otomatik yayın yok.
5. Testler, demo kabulü ve son devam kaydı.

## İlk uygulama

0103 migration ve /api/question-bank-standard/:id/content: kullanılmamış metin taslağının kontrollü düzenlenmesi, değiştirilemez eski içerik ve aktör/gerekçe kaydı, kaynak/model/job korunması, AI telifini RESTRICTED'e ve durumu REVIEW'a döndürme. Kullanım son anda başlasa bile SQLite trigger düzenlemeyi durdurur. Student practice, mini-test/exposure, Studio, exam links, kitap ve assessment referansları korunur. SUPER_ADMIN + same-origin zorunlu. Zengin medya paketi kısmi güncellenmez.

UI: soru önizlemede metin/çözüm düzenleme ve sürüm geçmişi; soru veya revision değişiminde eski form ve inceleme beyanları taşınmaz.

Yerel:12 API/review testi +1 UI etkileşim testi geçti. Tüm migration'lar yerel D1'e başarıyla uygulandı. Tam test paketi ve GitHub/demo doğrulaması ayrıca takip edilir. Bu bir tamamlandı/7x24 aktif bildirimi değildir.
