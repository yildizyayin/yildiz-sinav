# ANUNEX: 5. sınıf tüm kazanımların toplu üretim/inceleme dosyası

## Kullanıcı kararı (11 Kasım 2026)
Kazanım kazanım onay bekleme; 5. sınıfı **tek toplu iş** olarak yönet. Hedef her resmî öğrenme çıktısına **50 özgün, pedagojik olarak uygun** içerik. **Deploy yalnız tüm işler ve canlı kabul geçtikten sonra.** Şimdilik hiçbir AI soru üretim ajanını tekrar açma.

## Kaynak ve envanter
- `ALL_OUTCOMES_50_TARGET_MANIFEST.json`: 343 tekil kod, toplam 17.150 hedef.
- Türkçe 80, Matematik 23, Fen Bilimleri 26, Sosyal Bilgiler 18, İngilizce 178, Din Kültürü 18.
- Katalog `data/question-branch-catalog-2028.json` ve `data/question-full-math-target-2028.json` kaynak dosyalarından, `2027-2028` için türetildi.
- **Türkçede dokuz kod için farklı tema anlatımları arasında başlık uyuşmazlığı var**; bunlar `sourceInventory.titleConflicts` altında açıkça işaretlendi. Düzeltme yapılmadan hiçbir birleşim resmî eşdeğerlik garantisi sayılmaz.
- Resmî 5. sınıf kaynak başlangıcı: https://tymm.meb.gov.tr/ogretim-programlari/ortaokul-matematik-dersi/6 ve MEB diğer ders sayfaları.
- Tam resmî süreç bileşenleri ile yayımlanabilir yıllık kapsam, örnek soru sayısı değil, uzman incelemesi gerektirir.

## Mevcut içerik
- `EXISTING_100_REVIEW_ONLY.json`: önceden hazırlanmış MAT.5.1.1 (PR #519, 50) ve MAT.5.1.2 (PR #522, 50) taslaklarını tek dosyada toplar. Ayrıca MAT513_part01/02 ve MAT514_part01/02 dosyalarında MAT.5.1.3 ve MAT.5.1.4 için 50'şer soru taslağı vardır.
- İlk 100 taslak `2026–2027` kaynak yılına dayanır. MAT.5.1.3 ve MAT.5.1.4 için eklenen 100 taslak, repodaki `2027–2028` katalog hedefiyle etiketlenmiştir; bu yılın resmî kaynak uygunluğu ayrıca doğrulanacaktır. Hiçbiri **öğretmen onaylı değildir**, bu nedenle inceleme yapılmadan içe aktarım/öğrenci yayını yapılamaz.
- Resmî amaç: 17.150. Hazırlanmış taslak: 200. Öğrenciye açılmış/onaylı: **0 bu paket kapsamında**. Geri kalan 16.950 içerik **üretilmedi**.
- Var olmayan fotoğraf dosyası veya görsel lisans onayı uydurulmaz. Gerçek fotoğraf seçimi, izin belgesi, atıf, yaşa uygunluk ve soru ile bağlantısı doğrulandıktan sonra `question_assets` ile saklanır.

## Toplu denetim
```sh
node scripts/grade5-question-bulk-audit.mjs
node scripts/grade5-question-bulk-audit.mjs --strict
```

İlk komut sadece kapsam/uyarı raporu basar; veritabanına erişmez. `--strict` kalite ve tamlık engelleri açıkken başarısız çıkar. Bu araç **akademik onay vermez**, yalnız yapısal kontroller ve kapsam muhasebesi yapar.

## Kalite ve yayın politikası
1. Kaynak yıl/sınıf/ders/kod/süreç eşleşmesi resmî öğretim programı ile doğrulanır.
2. Uygun soru **biçimi** seçilir: çoktan seçmeli, açık uçlu, performans, dinleme, konuşma, eşleştirme, görselle yorumlama vb. Dinleme/konuşma becerisi sırf çoktan seçmeli testle öğrenildi kabul edilmez.
3. Her çıktıya 50 **birbirinden anlamlı olarak farklı** soru/görev; yalnız sayı ve kişi ismi değiştirerek elliye tamamlama yapılmaz.
4. Her madde için yetkin uzman anahtar/çözüm/rubrik, 6 seviyeli zorluk, yanılgı-temelli seçenek kontrolü, kaynak ve telif onayı.
5. İçerikler bütün havuzdaki eski sorularla özgünlük açısından karşılaştırılır; aynı içerik birden fazla çıktıda görünürse fiziksel soru kopyalanmaz, doğru referans ilişkisi kullanılır.
6. Onaylananlar bile doğrudan `APPROVED` veya canlıya geçmez: önce yetkili `REVIEW` incelemesi, sonra staging ve rapor/öğretmen/öğrenci kabulü.
7. Üretim ajanları kapalıdır. Bu dala dosya eklemek, otomatik üretimi veya sisteme importu başlatmaz.
8. `main`, production, Cloudflare D1, mevcut soru onayları ve öğrenci verileri değiştirilmez.

## Tamamlanma kriteri
Bütün 343 kod için en az 50 kaliteli, bağımsız içerik; doğru yıl/müfredat; gerekli medya lisansları; uzman ve hak incelemesi; sistemde kontrollü içe aktarım; duplikasyon ve güvenlik denetimi; staging/perf/regresyon testleri ve son kullanıcı deploy onayı. Bu kriterler tamamlanmadan **TAMAMLANDI** denmez.

Bu dosya toplu işin **ölçekli hazırlık ve izleme aşamasıdır**, 17.150 soru üretilmiş gibi kabul edilmemelidir.
