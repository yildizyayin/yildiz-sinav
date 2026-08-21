# Nibiru WhatsApp Aktivasyon Kılavuzu

Bu doküman gerçek telefon hattı aktive edilmeden önce teknik tarafı hazır tutmak için hazırlanmıştır. Telefon numarası veya erişim anahtarları kaynak koda yazılmaz.

## Hazır olan sistem parçaları

- `/api/nibiru/whatsapp/webhook` Meta webhook doğrulama ve mesaj alma endpointi.
- HMAC imza doğrulaması (`X-Hub-Signature-256`).
- WhatsApp kullanıcı eşleştirme kodu (`BAĞLA 123456`).
- Veli, branş öğretmeni, rehber öğretmeni ve kurum yöneticisi rol sınırları.
- Nibiru yapay zekâ kimlik açıklaması ve MEB/TYMM geliştirici dil politikası.
- Meta Cloud API metin cevapları.
- Kurum duyuruları için Meta onaylı template mesaj gönderimi.
- Panel bildirimi + WhatsApp + SMS fallback teslimat kayıtları.
- WhatsApp erişim anahtarları yalnız Cloudflare Secret olarak tutulur.

## Meta tarafında oluşturulacak bileşenler

1. Meta Business Portfolio / Business Manager.
2. Meta Developer uygulaması.
3. Uygulamaya WhatsApp ürünü.
4. WhatsApp Business Account (WABA).
5. Kullanılacak gerçek telefon numarasının eklenmesi ve SMS/arama koduyla doğrulanması.
6. WhatsApp iki aşamalı doğrulama PIN'i.
7. Kalıcı/system-user access token.
8. Phone Number ID.
9. App Secret.
10. Webhook verify token (biz üretiriz).
11. Webhook callback URL: `https://<canli-domain>/api/nibiru/whatsapp/webhook`.
12. `messages` webhook alanına abonelik.

## Cloudflare Secrets

Aşağıdakiler GitHub'a veya kaynak koda kesinlikle yazılmaz:

- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`

Graph API sürümü yapılandırma değişkenidir:

- `WHATSAPP_GRAPH_API_VERSION`

## Nibiru panelinde yapılacak son ayarlar

1. Süper Admin → Nibiru Yönetimi.
2. Herkese gösterilecek WhatsApp numarasını E.164 formatında gir (`+90...`).
3. Provider kartında Verify Token / App Secret / Access Token / Phone Number ID dördünün de “Hazır” olduğunu doğrula.
4. WhatsApp aktif seçeneğini aç.
5. Meta'da onaylanacak outbound duyuru template adlarını tanımla.
6. Pilot veli/öğretmen/yönetici için eşleştirme kodu üret.
7. Gerçek telefondan `BAĞLA 123456` mesajı gönder.
8. “Öğrencim nasıl?”, “7/A hangi kazanımda zorlanıyor?”, “Kurumum bugün nasıl?” testlerini çalıştır.

## Duyuru template önerileri

Meta'da önceden onaylatılacak örnek şablonlar:

- `school_general_announcement_tr`
- `school_meeting_notice_tr`
- `exam_result_ready_tr`
- `exam_reminder_tr`
- `worksheet_available_tr`

Duyuru gönderiminde öğrenci puanı/neti gibi hassas detaylar template içinde zorunlu olarak verilmez. Güvenli panel ekranına yönlendirme tercih edilir.

## SMS fallback

SMS ana kanal değildir. WhatsApp ulaştırılamazsa ve kurum ayarında SMS fallback açıksa teslimat SMS kuyruğuna düşer. SMS sağlayıcısı seçilene kadar kayıtlar `SMS_PROVIDER_NOT_CONFIGURED` durumunda tutulur. Sağlayıcı daha sonra adapter olarak bağlanır.

## Aktivasyon tamamlandı sayılma kriteri

- Meta webhook doğrulaması geçti.
- İmzalı gerçek inbound mesaj alındı.
- Test kullanıcısı güvenli şekilde eşleşti.
- Nibiru rol kapsamına uygun cevap verdi.
- Onaylı template ile outbound test mesajı gönderildi.
- Yanlış/bağlı olmayan numara öğrenci verisine erişemedi.
- Trial süresi bitmiş kurum WhatsApp üzerinden akademik veri alamadı.
