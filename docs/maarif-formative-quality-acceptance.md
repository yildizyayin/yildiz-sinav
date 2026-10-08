# Maarif yaklaşımı: öğrenme kanıtı ve soru kalitesi kabulü

5 Ekim 2026. Bu belge uygulanmış sözleşmeyi, içerik hazırlığı planını ve son
doğrulama kapılarını ayırır. Yeni kod henüz test edilmedi. Gerçek model kalite
pilotu, resmî rubrik içeriği ve sınıf uygulaması tamamlandı sayılmaz.

Resmî dayanak: MEB Türkiye Yüzyılı Maarif Modeli, Öğrenme Kanıtları:
https://tymm.meb.gov.tr/olcme-degerlendirme (5 Ekim 2026'da okundu).
MEB süreç bileşenlerini izleyen aşamalı araçlar, çeşitli öğrenme kanıtları,
performans görevleri, öz değerlendirme ve anlaşılır geliştirici geri bildirim
öngörür. Aşağıdaki sayısal eşikler ve pilot sayısı ANUNEX'in kabul planıdır;
MEB tarafından belirlenmiş yeterlik standardı değildir.

## Uygulanan karne sözleşmesi

`frozen-combined` ve `frozen-expanded` yetkili, seçili sabit kanıttan `outcomes`
ve `outcomeFeedback` üretir. EXAM, QUESTION_BANK, NEW MINI_TEST ve FOY kaynakları
aynı çıktı/yıl/sınıf/ders/müfredat/program sürümündeyse birleştirilir. Çıktı
başlığı ve kodu yalnız sabit kanıttan gelir; canlı programdan eski kayıt
doldurulmaz. Çelişen sabit adlar gizlenir ve `titleConflict` belirtilir.

- Her soru olayı ders toplamında bir kez sayılır; aynı sorunun birden fazla
  çıktısı varsa her çıktıya bir kez katkı verir. Çıktı satırları ders toplamı
  için toplanamaz. Kaynaklar arasında aynı sorunun ayrı olayları tekil içerik
  gibi sunulmaz. Pratikte FIRST/LATEST politikası korunur.
- Doğruluk: doğru / (doğru + yanlış + boş). INVALID ayrı sayılır, paydada yoktur.
- Yanlış varsa çözüm adımlarını karşılaştırma; boş varsa ilk çözüm adımını ve
  gereken desteği belirleme; tamamı doğruysa farklı bağlamda pekiştirme önerilir.
  Veri azsa başarı, gelişim trendi veya kalıcı ustalık çıkarımı yapılmaz.
- Geri bildirim kural tabanlıdır; öğrenci verisi modele gönderilmez. Çalışma
  sonrası öz değerlendirme sorusu sunulur. Bu soru için yanıt kaydetme yoktur.
- `competenceLevel`, `processComponentLevel`, `officialScore`, `nationalRank`
  bu sözleşmede null kalır. Mini oyun ayrı etkinlik metriğidir.
- Öğrenci ve veli kendi/bağlı öğrenciye, öğretmen yetkili branşa, rehber atanmış
  sınıflara erişir. Kurum/sınıf sınav özeti ayrı betimsel rapordur; burada dört
  kaynağın tüm kurum öğrencilerine yönelik toplu ortalaması uygulanmamıştır.

## Yeni kanıtta adın sabitlenmesi

Soru pratiği gönderiminde ve mini test başlangıcında çıktı kodu/başlığı mevcut
yetkili kaynak bağlamıyla JSON'a eklenir. 0078 FOY tetikleyicisi aynı bilgiyi
gelecekteki yanıtlarla sabitler; mevcut kanıtları değiştirmez. Eski adı olmayan
kayıtlar kimlik ve açık eksik-ad bildirimiyle okunabilir. JSON alanları eklemelidir;
mevcut bağlam/sahiplik/puanlama politikalarını değiştirmez.

## Uygulanan insan inceleme kaydı

AI onayı mevcut dört inceleme kutusu, soru revizyonu, doğrulanmış program
tanığı ve kullanım hakkına ek olarak `qualityReview` ister:

| Alan | İnceleyenin kaydettiği gerekçe |
| --- | --- |
| outcomeAlignment | Sorunun hangi çıktı bölümünü hangi çözüm adımıyla yokladığı |
| languageAndDistractors | Türkçe, yaş düzeyi, tek doğru cevap ve çeldirici incelemesi |
| duplicateDisposition | NO_REPETITION_FOUND veya DISTINCT_APPLICATION |
| duplicateRationale | Karşılaştırılan içerik ve çözüm yolu farkı |

Her gerekçe 20–1000 karakterdir. Tekrar bulunduysa onay verilmez; mevcut
REJECTED akışı kullanılır. Bu alanlar insan beyanıdır, otomatik semantik
tarama sonucu değildir. `review_checks_json.qualityReview.schemaVersion=1`
olarak inceleyen/zamanıyla saklanır ve yönetim ekranında gösterilir.
Kullanıcı/soru/revizyon/program değişimi ekrandaki eski beyanları geçersiz kılar.
Normalize edildiğinde aynı metni veren seçenekler ortak MC doğrulamasında
reddedilir. Birbirinden farklı seçeneklerin matematiksel/anlamsal olarak tek
doğru olması yine insan incelemesine bağlıdır.

## Resmî süreç bileşeni ve rubrik hazırlığı — henüz uygulanmadı

Mevcut program tablosu çıktı ve alt çıktı ilişkisini taşır; resmî süreç bileşeni
ve rubrik tanımlarını taşıyan tamamlanmış bir yapı yoktur. Çıktı başlığından bu
tanımlar türetilmeyecek. Sonraki içerik/model adımı şu zorunlu sözleşmeyle yapılır:

| Kayıt | Kaynak ve doğrulama gereği |
| --- | --- |
| Süreç bileşeni | Çıktı kimliği, resmî kod/metin, program sürümü, kaynak belge/sayfa; insan doğrulaması |
| Görev ve ölçüt | Bileşen bağlantısı, performans görevi, gözlenebilir davranış; zümre incelemesi |
| Rubrik sürümü | Ölçüt, açık düzey açıklamaları ve puanlama; resmî örnek veya açıkça öğretmen tasarımı beyanı |
| Gözlem kanıtı | Öğrenci dönem kaydı, görev/rubrik sürümü, gözlenen davranış, değerlendirici, zaman |
| Karne yorumu | Yalnız aynı bağlamdaki doğrulanmış gözlem; çoktan seçmeli netten rubrik düzeyi çıkarılmaz |

Öz değerlendirme, performans görevi ve öğretmen gözlemi çoktan seçmeli doğruluğun
ortalamasına doğrudan katılmaz; ayrı kanıt başlıklarında sunulmalıdır. MEB logosu
ve resmî karne/sertifika iddiası bu özelliğe eklenmez.

## Türkçe soru kalite pilotu — çalıştırılmadı

Yalnız mevcut doğrulanmış programı olan sınıf/ders hücreleri seçilir. Hedef
öncelik 5,6,7,9,10,11; okul programında o yıl doğrulanmış kaynak bulunmayan
hücre bloke edilir. Önerilen ilk parti: 6 uygun sınıf × 2 uygun ders × 4 taslak
= 48 soru. Önceki doğru/yanlış kişisel verileri kullanılmaz. Çalıştırıcı
varsayılan kapalı kalır; bu plan model çağrısı veya ücretli etkinleştirme değildir.

İki alan inceleyicisi cevap/çözüm, çıktı uyumu, Türkçe/yaş, çeldirici ve içerik
çeşitliliğini ayrı değerlendirsin. Sorunun yalnız isim/sayı değişmiş kopyaları,
aynı akıl yürütmenin gereksiz tekrarı ve telif şüpheleri ayrıştırılsın. Tek doğru
cevabı olmayan veya yanlış çözümü olan soru kabul edilmez. Tekrar tanımı ve
inceleyen uyuşmazlıkları kaydedilir; uygun olmayan taslaklar öğrenciye açılmaz.
İki inceleyici kuralı bu sürümde otomatik zorlanan onay kapısı değildir.

Karar kaydı: commit, model, program/çıktı sürümü, parti büyüklüğü, ilk onay oranı,
hata/tekrar türleri, inceleyen uyuşması, çağrı gecikmesi ve maliyet. Eşikler
pilot öncesi zümre tarafından belirlenir. Sınırsız kaliteli içerik ya da tüm
semantik tekrarların otomatik önlendiği iddiası yapılmaz.

## Sona bırakılan doğrulama

1. Native D1 ve API: gerçek yetki sınırları, yıl/program ayrımı, çoklu/tekrar
   çıktı bağları, INVALID, FIRST/LATEST, kaynak olayları, çelişen/eksik adlar.
2. Yeni migration/mini başlangıcı/pratik gönderimi: etiketleri dondurma ve eski
   kanıtı değiştirmeme. Tüm migrations ve tekrar seed kontrolleri.
3. AI review: eksik/kısa/uzun gerekçe, geçersiz karar, eski revizyon/program,
   aynı seçenek, medya ve kullanım hakkı kapıları. Eski test/smoke payloadları
   yeni zorunlu qualityReview alanıyla güncellenmelidir.
4. Tüm regression/typecheck/build; güncel head CI. Önceki637PASS bu değişiklikler
   için doğrulama değildir. Gerçek model pilotu ayrıca bekler.
5. Gerçek rol/browser/mobile/PDF; fiziksel optik baskı/yeniden okuma;
   Cloudflare staging erişimi ve canlı tenant/KVKK kabulü.
