Bağlam: Ajanların kritik durumlarda bana SMS/WhatsApp ile ulaşıp tek
tıkla onay alabilmesi için bir "Onay Worker" (Cloudflare Worker) ve
paylaşılan bir GitHub composite action ("sana-bildir") hazırladım.

GÖREV 1 — Onay Worker'ı deploy et
1. Ekteki onay-worker/ klasörünü (index.js + wrangler.toml) projeye ekle
   (mevcut worker'lardan ayrı, bağımsız yeni bir Cloudflare Worker olarak
   deploy edilecek - diğer worker'lara dokunmuyoruz).
2. `wrangler kv namespace create ONAY_KV` çalıştır, çıkan id'yi
   wrangler.toml'daki BURAYA_KV_NAMESPACE_ID yerine yaz.
3. Şu secret'ları worker'a ekle:
   - `wrangler secret put GITHUB_TOKEN` (repo'ya PR merge/issue kapatma
     yetkisi olan, yalnızca bu repoya erişen fine-grained token)
   - `wrangler secret put ONAY_WORKER_SECRET` (rastgele güçlü bir string)
4. `wrangler deploy` ile yayınla ve URL'i not al.

GÖREV 2 — Twilio hesabı kur
1. twilio.com'da ücretsiz deneme hesabı aç.
2. SMS gönderebilen bir numara al.
3. WhatsApp Sandbox'ı aktive et ve test telefonundan Twilio'nun verdiği
   `join <kod>` mesajını WhatsApp'ta Twilio numarasına gönder.
4. Account SID, Auth Token, SMS numarası ve WhatsApp sandbox numarasını not al.

GÖREV 3 — GitHub secret/variable'larını ekle

Secrets:
- `ONAY_WORKER_SECRET`
- `TWILIO_AUTH_TOKEN`
- `ANTHROPIC_API_KEY` (Triyaj ve Kod Yazıcı kullanılacaksa)

Variables:
- `ONAY_WORKER_URL`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_FROM_NUMBER`
- `TWILIO_WHATSAPP_FROM`
- `SAHIP_TELEFON_NUMARASI`
- İsteğe bağlı `STAGING_URL` (varsayılan: `https://demo.anunex.com`)
- İsteğe bağlı `ANTHROPIC_MODEL`

GÖREV 4 — Güvenlik ve işletim kuralları
- Hiçbir workflow production'a otomatik deploy/merge yapmaz.
- Kod Yazıcı sadece PR açar; merge yalnızca insanın Onay Worker bağlantısına
  tıklamasıyla gerçekleşir.
- Ödeme/finansal veriye dokunan otomasyon eklenmez.
- MEB/ÖSYM müfredatı, resmi eğitim verisi veya resmi kural içeren dosyalara
  otomatik yazılmaz.
- Yük testi yalnızca staging/test hedefine koşar; production hostname'leri
  workflow tarafından reddedilir.
- Onay Worker yalnızca `ALLOWED_REPO` için çalışır ve GitHub yanıtını
  doğrulamadan kaydı onaylandı durumuna geçirmez.

GÖREV 5 — Bildirim noktaları
- `agent-izleyici.yml`: sorun Issue'sundan sonra `sana-bildir`, `info_only`.
- `agent-kod-yazici.yml`: PR açıldıktan sonra `sana-bildir`, `merge_pr`.
- `agent-deploy-dogrulayici.yml`: doğrulama başarısızlığından sonra
  `sana-bildir`, `info_only`.

GÖREV 6 — Test
Önce secrets/variables ve Onay Worker'ı yapılandır; sonra ilgili workflow'ları
`workflow_dispatch` ile manuel çalıştır. WhatsApp Sandbox kullanılıyorsa
telefonun sandbox'a `join <kod>` ile katıldığını doğrula. Bildirim yapılandırması
eksikse action workflow'u kırmadan uyarı vererek bildirimi atlar.
