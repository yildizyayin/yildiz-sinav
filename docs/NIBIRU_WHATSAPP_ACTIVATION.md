# Nibiru WhatsApp Aktivasyon Kılavuzu

Bu doküman gerçek telefon hattı aktive edilmeden önce teknik tarafı hazır tutar. Telefon numarası veya erişim anahtarları kaynak koda yazılmaz.

## Hazır olan sistem parçaları

- `/api/nibiru/whatsapp/webhook` Meta webhook doğrulama ve mesaj alma endpointi.
- HMAC imza doğrulaması (`X-Hub-Signature-256`) ve sabit-süreli token karşılaştırması.
- WhatsApp kullanıcı eşleştirme kodu (`BAĞLA 123456`).
- Veli, branş öğretmeni, rehber öğretmeni ve kurum yöneticisi rol sınırları.
- Meta Cloud API metin cevapları ve onaylı template gönderimi.
- Panel bildirimi + WhatsApp + SMS fallback teslimat kayıtları.
- Meta `sent`, `delivered`, `read` ve `failed` webhook durumlarının içeriksiz teslimat ledger'ına ve mevcut duyuru teslimat durumuna işlenmesi.
- 1 MB webhook gövde sınırı; production'da App Secret yoksa fail-closed davranış.
- WhatsApp erişim anahtarları Cloudflare Secret olarak tutulur.
- `scripts/live-whatsapp-webhook-smoke.mjs` doğru/yanlış verify token ve doğru/yanlış imza canlı kontrolünü yapar.

## Meta tarafında oluşturulacak bileşenler

1. Meta Business Portfolio / Business Manager.
2. Meta Developer uygulaması ve WhatsApp ürünü.
3. WhatsApp Business Account (WABA).
4. Gerçek telefon numarası ve SMS/arama doğrulaması.
5. WhatsApp iki aşamalı doğrulama PIN'i.
6. Kalıcı/system-user access token.
7. Phone Number ID, App Secret ve webhook verify token.
8. Callback: `https://<canli-domain>/api/nibiru/whatsapp/webhook`.
9. `messages` webhook alanı aboneliği.

Staging callback örneği: `https://yildiz-sinav-v1.rtsgida.workers.dev/api/nibiru/whatsapp/webhook`.
Production Worker örneği: `https://yildiz-sinav-prod.rtsgida.workers.dev/api/nibiru/whatsapp/webhook`.

## Secret kapısı

Kaynak koda veya loglara yazılmaz:

- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`

Graph API sürümü `WHATSAPP_GRAPH_API_VERSION` yapılandırma değişkenidir. GitHub production environment için read-only preflight şu secretların varlığını bekler: `PROD_WHATSAPP_VERIFY_TOKEN`, `PROD_WHATSAPP_APP_SECRET`, `PROD_WHATSAPP_ACCESS_TOKEN`, `PROD_WHATSAPP_PHONE_NUMBER_ID`.

`Production Readiness Preflight` yalnız varlık/binding kontrolü yapar; deploy veya secret mutation yapmaz. Gerçek Cloudflare Worker secret provision işlemi final release sırasında kullanıcı yetkili hesabıyla kontrollü olarak yapılmalıdır. Secret değerleri raporlanmaz.

## Nibiru panelinde son aktivasyon

1. Süper Admin → Nibiru Yönetimi.
2. Herkese gösterilecek WhatsApp numarasını E.164 (`+90...`) gir.
3. Verify Token / App Secret / Access Token / Phone Number ID dördünün de hazır olduğunu doğrula.
4. WhatsApp aktif seçeneğini aç.
5. Meta'da onaylanacak outbound duyuru template adlarını tanımla.
6. Pilot veli/öğretmen/yönetici için eşleştirme kodu üret.
7. Gerçek telefondan `BAĞLA 123456` gönder.
8. Rol kapsamı ve trial/lisans kapılarını gerçek mesajla doğrula.

## Template güvenliği

Örnek şablonlar: `school_general_announcement_tr`, `school_meeting_notice_tr`, `exam_result_ready_tr`, `exam_reminder_tr`, `worksheet_available_tr`.

Template içinde öğrenci puanı/neti gibi ayrıntıları zorunlu taşımak yerine güvenli panel ekranına yönlendirme tercih edilir. Dış sağlayıcıya giden metin KVKK minimizasyon kapısından geçer.

## Aktivasyon tamamlandı sayılma kriteri

- Meta webhook doğrulaması geçti; yanlış verify token `403`, geçersiz imza `401`.
- İmzalı gerçek inbound mesaj alındı ve kullanıcı güvenli eşleşti.
- Nibiru rol/kurum/öğrenci kapsamına uygun cevap verdi.
- Onaylı template ile outbound test mesajı gönderildi.
- `delivered`/`read` teslimat kaydına işlendi; `failed` hata kodu içerik saklamadan kaydedildi.
- Yanlış veya bağlı olmayan numara öğrenci verisine erişemedi.
- Trial/lisans süresi bitmiş kurum akademik veriye ulaşamadı.
- Production secret/binding preflight geçti; fiziksel telefon/WABA doğrulaması tamamlandı.
