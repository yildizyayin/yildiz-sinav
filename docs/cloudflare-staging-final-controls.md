# Cloudflare staging son kontrolü

5 Ekim 2026. Önceki Question Pool PR Preview 37342321651 kaynak kontrolünden
geçip izole kaynak hazırlamada HTTP403 verdi. Yeni kodun testleri henüz
çalıştırılmadı. Aşağıdaki kontrol hesabın mevcut ayarını bildirmez; kullanıcı
tarafından doğrulanacak somut listedir. Domainlerin kapalı olduğu sonucu yoktur.

## Önce doğru kapsam

1. GitHub yildizyayin/yildiz-sinav → Settings → Environments → staging.
   CLOUDFLARE_API_TOKEN ve CLOUDFLARE_ACCOUNT_ID staging kapsamına çözülmeli.
   Repo ve environment aynı isimli farklı değerler taşıyorsa workflow'un
   kullandığı environment değerleri esas alınır. Değerleri sohbet/loga kopyalamayın.
2. Token Cloudflare'daki hedef hesapla aynı kapsamda, etkin ve süresi geçmemiş
   olmalı. Cloudflare hesap kimliğini kullanın; zone kimliği değildir. IP veya
   kaynak kapsamı kısıtı varsa GitHub runner erişimiyle uyumunu kontrol edin.
3. Kaynak hazırlama D1 listeleme/oluşturma ve R2 bucket listeleme/oluşturma
   yapar. Resmî API izinleri D1 Read/Write ve Workers R2 Storage Read/Write'tır;
   oluşturma için yazma yetkisi gerekir. Token'a yalnız hedef hesap kapsamında
   gereken yetkileri verin. Sonraki Worker deploy/secret adımı için ilgili
   Workers script yazma yetkisi de ayrı gereklidir.

Resmî endpoint başvuruları (5 Ekim 2026'da okundu):
- https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/list/
- https://developers.cloudflare.com/api/resources/r2/subresources/buckets/methods/list/

## Kaynaklar ve beklenen çıktı

| Aşama | Beklenen kanıt |
| --- | --- |
| Kaynak kontrolü | Güncel head typecheck/test/build başarılı |
| Kaynak hazırlama | İzole PR D1 ve özel R2 bucket kimliği çözüldü; 403 yok |
| Migration | 0078 dahil tüm migrationlar izole D1'e uygulandı |
| Worker yayın | İzole PR Worker yayınlandı; production domaini değişmedi |
| Synthetic assessment | Gerçek HTTP akışı ve yeni inceleme sözleşmesi başarılı |
| Tenant/KVKK | Mandatory live gate çalıştı; SKIPPED başarı sayılmaz |

PR227 için kaynak adları: yildiz-sinav-qpool-pr-227-generation-v2 (D1),
yildiz-sinav-qpool-pr-227 (bucket/Worker). workflow_dispatch PR_NUMBER yerine
run_id kullandığından farklı izole ad üretir; bunu mevcut PR önizlemesi sanmayın.
Testler source aşamasında kapanmadan Preview yeniden dispatch edilmeyecek.

## R2 keşif düzeltmesi

Güncel liste API'si `name_contains` filtresi ve `result.buckets` dizisi kullanır.
İki workflow'un filtre adı düzeltildi; Question Pool Preview diziyi güncel
şekliyle okur ve eski dizi yanıtını da kabul eder. Beklenmedik/başarısız yanıt
boş bucket listesi gibi yorumlanmaz. Tam isim eşleşmesi aranır. Liste filtresi
en fazla1000 aday getirir; bulunamazsa mevcut 409-toleranslı oluşturma yolu
aynı özel kaynak adını yeniden kullanır. Bu düzeltme önceki403'ün nedeninin
R2 şekli olduğunu kanıtlamaz; önceki çağrı yetki aşamasında başarısızdı.

## Daha sonra kapanacak kapılar

Demo6rol mevcut oturumlarla read-only kabul; browser/mobile/PDF; fiziksel optik
baskı/yeniden okuma; production imza ve binding preflight; dağıtılmış gerçek
authenticated10k/1m yük ölçümü. Bu kontrollerin hiçbiri GitHub bağlantısı veya
başarılı bir deploy ile kendiliğinden tamamlanmaz. Yeni varsayılan kapalı AI
üretim ayarı değiştirilmez; token yetkisi düzeltmek AI pilotunu başlatmaz.
