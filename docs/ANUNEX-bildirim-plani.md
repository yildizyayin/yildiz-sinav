# ANUNEX bildirim planı — taslak (13 Kasım 2026)

Amaç: Trendyol'daki "siparişiniz alındı → kargoda → teslim edildi" düzeni gibi, ANUNEX'te de önemli anlarda kullanıcıya **kısa, güvenli ve tutarlı** bildirim gitmesi. Kanallar: uygulama içi, e-posta, SMS, WhatsApp; ileride RCS (Android'de marka adı/logolu SMS).

## 1. İlkeler

1. **İçerik az:** Mesajda not, puan, sıralama, rehberlik bilgisi yok. "Sonucun hazır, panelden bak" + güvenli bağlantı (KVKK master kuralı 10).
2. **Bilgilendirme ≠ tanıtım:** Aşağıdaki iletilerin hepsi işlemsel/bilgilendirme amaçlıdır; İYS onayı gerekmez. Kampanya/tanıtım iletisi gönderilmez; gönderilecekse ayrı İYS onayı alınır.
3. **Sessiz saatler:** 22:00–08:00 arası SMS/WhatsApp gönderilmez (acil rehberlik uyarısı hariç); sabah sıraya alınır.
4. **Tercih:** Her kullanıcı kanal tercihini (e-posta / SMS / WhatsApp) panelden açıp kapatabilir; uygulama içi bildirim her zaman açık.
5. **Tekrar yok:** Aynı olay için kişi başına tek ileti; aynı gün aynı türden en fazla 1 SMS/WhatsApp.
6. **Kayıt:** Her gönderim bildirim kaydına (kanal, durum, zaman) yazılır; mesaj metni şablondan üretildiği için ayrıca saklanmaz.

## 2. Olaylar ve kanallar

| Olay | Kime | Uygulama içi | E-posta | SMS | WhatsApp | Örnek metin |
|---|---|---|---|---|---|---|
| Hesap açıldı | Öğrenci, veli, öğretmen | — | ✓ | ✓ | — | "ANUNEX hesabınız açıldı. Kullanıcı adınız: … Giriş: app.anunex.com" |
| Optik/cevap kâğıdı okundu | Öğrenci | ✓ | — | — | — | "Deneme cevapların sisteme alındı." |
| Sınav sonucu yayımlandı | Öğrenci, veli | ✓ | ✓ | ○ | ✓ | "[Sınav adı] sonucunuz hazır. Görmek için: [bağlantı]" |
| Haftalık program verildi | Öğrenci, veli | ✓ | ✓ (veli, haftalık özetle) | — | ○ | "Rehber öğretmenin bu haftanın programını hazırladı." |
| Haftalık özet (pazar akşamı) | Veli | ✓ | ✓ | — | ○ | "Bu haftanın çalışma özeti panelinizde." |
| Görüşme randevusu | Öğrenci, veli | ✓ | ✓ | ✓ (1 gün önce) | ✓ | "Yarın 10:00'da rehberlik görüşmeniz var." |
| Rehbere yazılan mesaja cevap | Öğrenci, veli | ✓ | — | — | ○ | "Rehber öğretmeniniz mesajınızı yanıtladı." |
| Acil rehberlik uyarısı | Rehber öğretmen | ✓ | ✓ | ✓ (sessiz saat yok) | — | "Bir öğrenciniz için acil görüşme talebi var. Panele bakın." |
| Pilot okul başvurusu | Süper Admin | ✓ | ✓ | — | — | "Yeni pilot okul başvurusu: [kurum], [il]." |
| Lisans bitişine 30/7 gün | Kurum yöneticisi | ✓ | ✓ | — | — | "ANUNEX lisansınızın bitmesine 7 gün kaldı." |

✓ = önerilen; ○ = kanal açılırsa isteğe bağlı.

## 3. Aşamalar ve maliyet

| Aşama | Kanal | Durum | Maliyet |
|---|---|---|---|
| 1 | Uygulama içi | Var (bildirim zili) | Ücretsiz |
| 1 | E-posta (Resend) | Kod var, anahtar yok | Ücretsiz katman: ayda 3.000, günde 100 e-posta. Pilot için yeterli; büyüyünce Pro 20 $/ay (50.000 e-posta). |
| 2 | SMS (Netgsm) | Kod var, anahtar yok | Ücretli, kredi/paket (fiyat Netgsm'den teyit edilmeli). Başlık (gönderici adı "ANUNEX") için başvuru gerekir. |
| 2 | WhatsApp (Meta resmî API) | Kod var, anahtar yok | Şablon mesajları ileti başına ücretli; Türkiye "utility" fiyatı Meta tarifesinde (1 Nisan 2026'da düşürüldü). Kullanıcı yazınca açılan pencerede ayda 1.000 servis mesajı ücretsiz. 1 Ekim 2026'dan beri pencere içindeki utility mesajları da ücretli. |
| 3 | RCS (Google, marka logolu SMS) | Yok | Google onaylı iş ortağı üzerinden, marka doğrulaması ve ücretli. Yalnız Android + RCS açık telefonlar; diğerlerine normal SMS. |

**Öneri:** Ödeme yapılmadığı sürece Aşama 1 (uygulama içi + ücretsiz e-posta). Aşama 2'ye ödeme yapılabilir olunca geçilir; SMS önce yalnız hesap açılışı, randevu ve acil rehberlik için.

## 4. Aşama 1 için gerekenler

1. Resend hesabı (ücretsiz, kart istemez) ve gönderici alanı: `bildirim@anunex.com` için anunex.com DNS'ine Resend'in verdiği kayıtlar (SPF/DKIM) eklenir — sahip yapar ya da Cloudflare DNS'te birlikte yapılır.
2. `RESEND_API_KEY` GitHub secret olarak eklenir; deploy sunucuya aktarır.
3. Kod: olay → şablon → kuyruk → gönderim; sessiz saat, tekrar engeli, kullanıcı tercihi ve günlük 100 sınırı (aşılırsa ertesi güne kalır).
4. Panelde "Bildirim tercihlerim".
5. KVKK aydınlatma metinlerindeki aktarım maddesine Resend eklenir.

## Kaynaklar

- Meta — WhatsApp Business Platform fiyatlandırması: https://developers.facebook.com/docs/whatsapp/pricing
- Resend fiyatları: https://resend.com/pricing
- Google — İşletmeler için RCS: https://developers.google.com/business-communications/rcs-business-messaging/guides/overview?hl=tr
- İYS hakkında: https://webrazzi.com/2020/07/26/markalarin-sms-gonderimi-icin-zorunlu-olan-iys-kullanimi-hakkinda-tum-detaylar
