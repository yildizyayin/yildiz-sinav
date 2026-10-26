# T03 — Cevap anahtarı ve kazanım eşleştirme

26 Ekim2026. Onaylı görsel: LGS Deneme01 cevap ve kazanım eşleştirme.png / libfile_85e6c84bcfcc8191bf63d81e551066ae; orijinal reference.png olarak korunur. Önceki T02 yayını40347256477 SUCCESS doğrulanarak bu üçlü çalışmaya geçildi. Taban4d34a4ab9072caf0b8a77d859477b2d898fa5e1a; paralel teknik değişiklikler korunur.

ExamDefinitions içindeki mevcut cevap anahtarı/ders yapısı ve ExamOutcomeEditor tablosuna kompakt satırlar, alan ölçüleri, küçük durum etiketleri, okunur çoklu kazanım seçimi ve40px kapsayıcılı ders checkboxı uygulanır. Ders checkboxı aynı onChange ile etiket içine alınır.

## Referansla zorunlu farklar

Mevcut A/B kitapçıkları ve toplu cevap girişi korunur. Referanstaki seçili-soru yan çekmecesi/kitapçık sekmesi/sayfalama yeni state gerektirir; eklenmedi. Kazanımlar mevcut ayrı sekmede ve çoklu seçimle kalır. Kod/metin eşleştirme, öneri kabulü, resmî katalog kuralları ve geçmiş analiz yenileme aynıdır. Yeni kazanım/kod/olası eşleşme uydurulmaz.

## Korunanlar

API/state/effect/izin/form doğrulama/işlem koşulları ve rota değişmez. Mevcut Türkçe metinler/sınıflar korunur; yalnız import/JSX kapsayıcıları/sınıflar ve ekran CSS'i değişir. worker/migrations/src/api.ts/src/auth.tsx/src/lib/tests/github/wrangler/paketler/report-print.css/sol menü değişmez. Yeni kütüphane yok. STANDARD+SUPER_ADMIN+screen kapsamında; diğer temalar okunur kalır.

Görseller sentetik API'li gerçek React üretim çıktısıdır; örnek kurum/öğrenci/istatistik canlı verisi değildir. Resmî kazanım örneği uydurulmadı; fixture metni açıkça sentetiktir. Testteki değerlendirme dosyası yalnız yerel route interceptine gider. Gerçek sisteme yazılmaz; final değerlendirme/yayın/öğrenci çözüm kararı gönderilmez.

## Doğrulama

npm ci/typecheck/build ve ilk320 dosya/1420 test paketi geçti. Son kozmetik düzeltme sonrası doğrulama sonuçları PR'da ve verification.json'da kaydedilir. Her ekran için STANDARD1440/1180/1024/768/390/360 ve diğer4 tema1440/390 toplam14 senaryo. Sayfa taşması, rol/disabled/alan hedefleri, mevcut akış, mobil menü, print sidebar gizleme kontrol edilir. Kontrast/focus/reduced-motion/40px hedefler örneklenir; tüm uygulama AA veya PDF rapor sertifikası değildir.

Tarayıcı yeniden üretim: önce npm run build; ardından ANUNEX_DESIGN_SCREEN=outcomes ANUNEX_BROWSER_EXECUTABLE=/mevcut/chromium node scripts/design-exam-workflows-smoke.mjs. Ortak betik T03 dalındadır; T04/T05 bunu T03 merge sonrası kullanır. Her PR'ın ürün CSS/JSX dosyaları bağımsızdır.

## Elle kabul

Sınavı düzenle → Cevap anahtarı: kitapçık dizisi, soru durumu/kabul, kaydetme. Kazanımlar: ders/katalog arama, çoklu seçim, kaldırma, otomatik eşleştirme/öneri/dirty uyarısı. Mobil tablo içi kaydırma; başka tema ve rol.

### Son kabul

Son tam yerel paket320 dosya/1420 test başarılı. typecheck/build başarılı. Bu ekranın14 tarayıcı senaryosu başarılı;42 senaryo üç ekranın toplamıdır. Örneklenen minimum metin kontrastı5.9922:1; klavye focus/reduced-motion ve40px işlem hedefleri kontrol edildi. Pasif düğmeler kontrast örneklemesine dahil edilmedi; pasiflik görünümü korunur. Uzun cevap anahtarı20 soruluk örnekle, kendi içinde kaydırılan soru alanında ayrıca kontrol edilir.
