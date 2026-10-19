# Müfredat aktarımı ve yıllık plan seçimi — 19 Ekim 2026

Durum: staging/demo dağıtıldı ve doğrulandı; production/app değiştirilmedi.

- Staging kod commit: cbb114756603efa57f207909710b840c53134f73.
- Deploy run: 39222657344 / job 117961368459, success; 248 test dosyası / 1267 test. Typecheck ve build geçti. Migration 0117 uygulandı.
- Planlayıcı tüm seçilmiş sürümleri annual_content_plan_curricula tablosunda tutar; tek kaynak varsa önceki seçim davranışı korunur. Çoklu kaynakta açık seçim gerekir; son yüklenen branş otomatik seçilmez. Yıl/sınıf/program/verified kapsamı ve çakışan kazanım/ünite doğrulanır. Yayımlanmış slotlar yenilemeyle silinmez. Mevcut planlar anchor ve kaynak setiyle geriye uyumludur.
- Demo API testleri: var olmayan sürüm, boş sürüm ve belirsiz çoklu kaynak reddedildi; mevcut plan listesi değişmedi. Başlangıçta mevcut yıllık plan sayısı 0. Canlı başarılı çoklu kaynak plan üretimi bu testte yapılmadı; seçim ve migration sözleşmeleri testlerle doğrulandı.
- Branş import run: 39222927556 / job 117962250219, success. Kaynak indeksleri ve tüm dahil tema metinleri her yazımdan önce yeniden doğrulandı.
- 69 sürüm, 2739 tema bağlamlı kayıt ve 2739 öğrenme düğümü doğrulandı. Bu benzersiz kazanım sayısı değildir. Önceden aktarılan matematik 177 kaydı korundu.
- Aktarım dışı: Türkçe 5 (aynı temada T.O.5.20 metin çakışması), Din Kültürü 12 (bir temada kod ön eki eksik). Resmî kod uydurulmadı.
- Koruma kontrolü başarılı: eski müfredat/düğümler, planlar/slotlar, pilot bütçesi, kampanya, 32 üretim işi ve 165 soru değişmedi. Yeni AI yazar/editör çağrısı 0. Kampanya editorial-20261015, 2026–2027, PAUSED. 2027–2028 kitlesel üretimi açılmadı.

Sıradaki iş: ajan paneline canlı branş/tema kapsamını ve kaynak sorunlarını eklemek; ardından açık uçlu yazılı modelini mevcut OYSS araştırma kararları doğrultusunda uygulamak. 2028 LGS/TYT/AYT kapsamı, açık uçlu kalite/kanıt kontrolleri, gerçek kabul edilmiş soru üretimi ve 500000/50 gün kapasite doğrulaması hâlâ tamamlanmış değildir.
