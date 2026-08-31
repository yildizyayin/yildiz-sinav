# Anunex Production Operations

Bu belge production izleme, yayın sonrası kabul ve D1 geri kurtarma sınırlarını tanımlar. Demo verisi veya panel geliştirmesi içermez.

Production custom domain `wrangler.production.jsonc` içinde `anunex.com` olarak tanımlıdır. Worker deploy sırasında Cloudflare DNS kaydını ve sertifikayı yönetir. `www` yönlendirmesi ana site/SEO kararıyla birlikte daha sonra ele alınacaktır; şimdilik kanonik production adresi `https://anunex.com`'dur.

## Gözlemlenebilirlik

- Worker gözlemlenebilirliği `wrangler.production.jsonc` içinde etkindir ve `%10` head sampling kullanır.
- Her HTTP yanıtı `X-Request-Id` taşır.
- Yapılandırılmış `http_request` olayları yöntem, kimlikleri maskelenmiş rota, HTTP durumu, süre ve ortam içerir.
- Yakalanmamış hatalar aynı `requestId` ile `unhandled_request_error` olarak yazılır. İstek gövdesi, kimlik bilgisi, öğrenci adı veya secret loglanmaz.
- `/api/health` yalnız servis/D1 şema hazırlığını ve ortam adını döndürür; tablo sayısı, müşteri verisi veya secret döndürmez.

Bir hata araştırılırken önce kullanıcıdan `X-Request-Id` istenir; Cloudflare Worker Logs içinde bu değer aranır. Loglarda kişisel veri araması yapılmaz.

## Yayın sonrası kabul

`.github/workflows/deploy-production.yml`, deploy ve migration sonrasında `scripts/live-production-smoke.mjs` çalıştırır. Smoke testi salt okunurdur:

1. D1 ve kritik şema hazır mı?
2. Ortam gerçekten `production` mı?
3. Production Turnstile public site key tanımlı mı?
4. Anonim kullanıcı korunan API'den `401` alıyor mu?
5. SPA kabuğu açılıyor mu?

Smoke başarısızsa yayın kabul edilmiş sayılmaz. Veri değiştiren otomatik production testi yoktur.

## D1 yedek ve geri yükleme tatbikatı

Cloudflare D1 Time Travel varsayılan olarak açıktır. Saklama süresi plana göre 7 veya 30 gündür. Resmî başvuru:

- https://developers.cloudflare.com/d1/reference/time-travel/
- https://developers.cloudflare.com/d1/wrangler-commands/

`.github/workflows/production-recovery-check.yml` her pazar ve manuel olarak:

1. D1'in production storage backend kullandığını doğrular.
2. Güncel Time Travel bookmark alınabildiğini doğrular.
3. D1'i geçici GitHub runner alanına export eder.
4. Export'u izole SQLite veritabanına geri yükler, bütünlük ve kritik tabloları kontrol eder.
5. SQL export ve geri yüklenen dosyayı her koşulda siler; artifact olarak saklamaz.

Bu iş akışı production D1'i değiştirmez. Gerçek Time Travel restore işlemi production verisini yerinde ezer; yalnız planlı olay müdahalesinde, production environment onayı ve iki yetkili kontrolüyle manuel çalıştırılmalıdır.

## Gerçek olayda geri dönüş

1. Yazma trafiğini durdurun ve olay UTC zamanını kaydedin.
2. `wrangler d1 time-travel info DB --timestamp=<RFC3339> --config wrangler.production.jsonc` ile hedef bookmark'ı doğrulayın.
3. Restore öncesi mevcut bookmark'ı ayrıca kaydedin; bu geri alma noktasıdır.
4. Yetkili onayından sonra `wrangler d1 time-travel restore DB --bookmark=<BOOKMARK> --config wrangler.production.jsonc` çalıştırın.
5. `/api/health` ve production smoke testini yeniden çalıştırın.
6. Audit/log zaman çizelgesini ve kullanılan bookmark'ları olay kaydına ekleyin; secret veya kişisel veri eklemeyin.
