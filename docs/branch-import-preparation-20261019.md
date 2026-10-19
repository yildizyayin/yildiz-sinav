# Branş aktarımı — tema kimliği hazırlığı

19 Ekim 2026. Hedef 2027–2028, okul programı kapsamı.

`branch-import-plan.mjs` resmî kodları değiştirmeden kaynak bağlamını müfredat sürümüne taşır. Tema arasında aynı kod farklı metinle kullanılıyorsa her temaya ayrı, deterministik sürüm adı verir. Kodlar mevcut CSV aktarıcısındaki tekillik denetimine uyar; importer gevşetilmemiştir. Aynı temada çelişen kodlar bu yöntemle kabul edilmez.

Hazırlanan kapsam: 69 aktarım birimi; 47 ders/sınıf programı ve 22 tema sürümü. Toplam 2.739 bağlama bağlı kayıt. Bu sayı benzersiz resmî kazanım sayısı değildir; farklı temaların aynı kodu ayrı bağlamda kullanması sayıyı artırır. Türkçe 5 ve Din Kültürü 12, kaynak tutarsızlıkları nedeniyle dışarıda kalır. 8/12 kaynakları okul müfredatı olarak kalır, 2028 sınav kapsamı etiketi almaz.

Çalıştırma: `node scripts/prepare-branch-imports.mjs`. CSV dosyaları `tmp/branch-imports-2028` altında yeniden üretilebilir; manifest `data/question-branch-import-plan-2028.json` dosyasına yazılır. Her birim kaynak tema hashlerini ve kod/metin/ünite parmak izini taşır. İçe aktarmadan önce kaynak indeksleri ve içerikler yeniden karşılaştırılmalıdır.

Doğrulama: 69 CSV'nin tamamı gerçek `parseCurriculumCsv` üzerinden geçirildi; toplam 19 ilgili test ve TypeScript kontrolü geçti. Edebiyat 9'da TDE1.1 farklı tema metinleriyle ayrı sürümlerde korunuyor. Aynı temada kod çakışmasını kabul eden bir değişiklik yapılmadı.

Canlı aktarım yapılmadı. `generateAnnualContentPlan` yıl/sınıf için son doğrulanmış sürümü seçiyor; çok sayıda branş/tema sürümü eklendiğinde yalnız son branşı seçebilir. Dolayısıyla manifest otomatik yıllık plan seçimini güvenli saymaz. Sonraki uygulama: tüm branş ve temaları kapsayan açık müfredat sürümü seçimi/sürüm kümesi; ardından kaynakları yeniden doğrulayan, eski veriyi koruyan toplu staging aktarımı. Bu hazırlık üretim kampanyasını veya soru üretimini başlatmaz.

Önceki OYSS araştırması `docs/oyss-integration-research-20261019.md` dosyasında kayıtlıdır. Yazılı senaryoları da aynı kaynak/tema/sürüm kimliğini kullanacaktır.
