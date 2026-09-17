# AI Ajan Görev Protokolü

Bu repo: `yildizyayin/yildiz-sinav`

## Ürün sınırları

- `app.anunex.com`: lisanslı kurum, öğretmen, rehber, öğrenci ve yönetim panelleri.
- `sonuc.anunex.com`: lisanssız/public sonuç görüntüleme ve sonuç ağı akışları.
- `anunex.com`: tanıtım/marketing yüzü.
- `demo.anunex.com`: staging/demo hedefi; yük testi yalnızca burada veya açıkça tanımlanmış staging hedefinde yapılır.

## Görev verme akışı

1. GitHub Issues > New issue > **Ajan görevi** şablonunu kullan.
2. Hedefi, etkilenen ürünü, kabul kriterlerini ve test planını doldur.
3. Issue açıldığında Triyaj Ajanı sınıflandırır; `ANTHROPIC_API_KEY` yoksa işlem hata vererek durur ve insan müdahalesi gerekir.
4. Yalnız düşük riskli ve geri alınabilir düzeltmeler için Issue'ya `ajan-fix-dene` etiketi ekle. Bu etiket Kod Yazıcı Ajanı'nı tetikler.
5. Ajan gerçek checkout edilmiş repo yapısını okuyarak branch ve PR açar. Otomatik merge yapmaz.
6. PR; CI, güvenlik ve insan incelemesinden geçmeden production'a alınmaz.

## Manuel çalıştırma

- Triyaj: Actions > **Ajan 3 - Triyaj** > Run workflow > Issue numarası.
- Kod yazıcı: Actions > **Ajan 4 - Kod Yazıcı** > Run workflow > Issue numarası.
- Yük testi: Actions > **Ajan 5 - Yük Testi** > Run workflow > sanal kullanıcı sayısı. Production hostname'leri koruma nedeniyle reddedilir.
- Deploy doğrulayıcı: Actions > **Ajan 6 - Deploy/Domain Doğrulayıcı** > Run workflow.
- İzleyici ve içerik tarama ajanları zamanlanmış çalışır; ikisinde de workflow_dispatch bulunur.

## Sabit güvenlik kuralları

- Dosya yolu uydurulmaz; önce `src/`, `worker/`, `migrations/` ve ilgili testler incelenir.
- Auth, rol, tenant izolasyonu, KVKK, audit ve retention davranışı korunur.
- `app.anunex.com` ve `sonuc.anunex.com` kod sınırları birbirine karıştırılmaz.
- Ödeme, kimlik doğrulama, veri silme, kişisel veri veya production deploy değişiklikleri düşük riskli otomasyon kapsamına alınmaz.
- Secret değerleri Issue, PR, log veya sohbet içine yazılmaz.
- Production deploy manuel ve `production` environment onayına tabidir.
- Hiçbir ajan doğrudan main'e otomatik merge etmez.

## Ajanların görevleri

| Ajan | Görev | Çıktı |
| --- | --- | --- |
| İzleyici | Domain uptime ve HTTP erişim kontrolü | Issue; kritik durumda `acil` etiketi |
| İçerik tarama | `NEEDS_DEFINITION`, `CONTENT_REQUIRED` ve resmi veri işaretlerini tarama | Haftalık rapor Issue'su |
| Triyaj | Yeni Issue'yu aciliyet/kategori bakımından sınıflandırma | Etiket ve kısa yorum |
| Kod yazıcı | Yalnız `ajan-fix-dene` ile düşük riskli fix önerisi | Branch + PR |
| Yük testi | Staging/demo kapasite ölçümü | Yük testi raporu Issue'su |
| Deploy doğrulayıcı | Cloudflare zone ve production anahtar kontrolü | Deploy ön koşul doğrulaması |

## Eksik entegrasyonlar

Aşağıdaki değerler tanımlanmadan AI sınıflandırma/kod üretimi ve SMS/WhatsApp bildirimleri tam çalışmaz:

- Secret: `ANTHROPIC_API_KEY`
- Onay Worker: `ONAY_WORKER_URL`, `ONAY_WORKER_SECRET`
- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_WHATSAPP_FROM`, `SAHIP_TELEFON_NUMARASI`

Bu değerler boş placeholder olarak eklenmez.
