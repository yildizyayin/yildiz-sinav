# Anunex — Nibiru Faz 2–3 Durum Kaydı

Tarih: 11 Eylül 2026

Bu dosya, aynı tarihli Faz 1 durum kaydını tamamlar; önceki ürün durum dosyaları silinmemiştir.

## Teslim edilenler

| Alan | Durum | Production sınırı |
|---|---|---|
| Cloudflare DeepSeek V4 Flash / Qwen3 30B A3B routing | Opt-in olarak eklendi | `NIBIRU_EXPERIMENTAL_MODELS=ON` ve erişim/billing doğrulaması gerekir |
| Groq reasoning fallback | Kod ve OpenAI-compatible endpoint eklendi | Yalnız iki ağır iş yükü; Groq KVKK kaydı inactive/PENDING |
| Groq privacy gate | Production kapısı eklendi | Legal review, DPA ve transfer kaydı onaylanmadan çağrı engellenir |
| Ses provider readiness | Configured/live-verified ayrımı eklendi | Gerçek provider secret ve Super Admin canlı probe gerekir |

## Teknik doğrulama

- Faz 2 CI: başarılı.
- Faz 3 CI: başarılı.
- Yerel doğrulama: typecheck, 288 test ve build başarılı.
- PR preview: izole Cloudflare D1/R2 kaynak oluşturma aşamasında HTTP 403; kod doğrulamasından bağımsız altyapı yetki sorunu.

## Henüz yapılmayanlar

- Cloudflare/Groq production secret kurulumu.
- Groq hukuk onayı ve processor/international transfer kayıtlarının APPROVED/ACTIVE yapılması.
- Google/OpenAI TTS gerçek secret kurulumu ve `/api/nibiru/voice/probe` canlı kabulü.
- Production deploy ve canlı müşteri kabul testi.

## Sonraki dış bağımlılık

Production secret/configuration ve hukuk onayı tamamlandıktan sonra staging smoke, gerçek provider probe ve yalnızca kullanıcı onayıyla production deploy yapılacaktır.
