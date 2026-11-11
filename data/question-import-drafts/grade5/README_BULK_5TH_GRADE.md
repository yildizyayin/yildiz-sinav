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
- `EXISTING_100_REVIEW_ONLY.json`: MAT.5.1.1 (PR #519, 50) ve MAT.5.1.2 (PR #522, 50) taslaklarını tek dosyada toplar.
- `MAT513`–`MAT537` kazanım paketlerinin ikişer 25'lik JSON dosyaları `newDraftFiles` üzerinden takip edilir; hangi kazanımın dosyasının hazır olduğu için tek otorite `ALL_OUTCOMES_50_TARGET_MANIFEST.json` kaydıdır.
- Şimdiye kadar 17 matematik kazanımında 50'şer **850 taslak çoktan seçmeli soru** ve ayrı olarak **88 rubrikli uygulama görevi** oluşturulmuştur. 88 uygulama görevi soru kotasına dahil değildir, mevcut MC aktarımı için uyumlu değildir.
- İlk 100 taslak `2026–2027` kaynağına dayanır; envanter `2027–2028` hedef sürümüdür. Resmî yıl/kod eşdeğerliği ayrıca doğrulanmalıdır. **Öğretmen onaylı soru bu çalışma kapsamında 0'dır.**
- Genel hedef 17.150; hazırlanan 850, kalan **16.300 soru/görev henüz üretilmedi**.
- Resim/fotoğraf varlığı ya da medya hakkı onayı uydurulmaz; çizimler ve lisanslı fotoğraflar akademik ve telif incelemesinden sonra `question_assets` üzerinden bağlanır.

## Güncel kontrol kaydı
- `QA_PROGRESS_2026-11-11.md` dosyasında 850 taslağın yapısal testleri ve akademik/medya/özgünlük eksikleri kayıtlıdır.
- Sırf sayı/isim değiştirerek aynı örnek soruları çoğaltma; tekrar eden soru tasarımlarını editoryal incelemeden geçir.
- Bu iş tamamlanmadan Claude Code'a nihai aktarma dosyası ve promptu gönderilmez.

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
