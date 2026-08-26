# Nibiru Voice Activation

Nibiru Voice, web ve gelecekteki mobil kanallarda aynı Nibiru yetki/veri motorunun ses katmanıdır. Ses modeli akademik karar vermez; STT yalnız konuşmayı metne çevirir, TTS yalnız Nibiru'nun zaten yetkilendirilmiş ve doğrulanmış metnini seslendirir.

## Akış

1. Kullanıcı **Konuş** düğmesine basar. Sürekli açık mikrofon yoktur.
2. Tarayıcı en fazla 45 saniyelik ses kaydı alır.
3. Cloudflare Workers AI `@cf/openai/whisper-large-v3-turbo` Türkçe STT ile metne çevirir.
4. Metin önce input alanına gelir; kullanıcı isterse gönderir.
5. Normal Nibiru yetki → kurum → doğrulanmış akademik bağlam → uzman → multi-AI router zinciri çalışır.
6. Kullanıcı **Dinle** dediğinde yalnız üretilmiş Nibiru metni TTS'ye gider.

## Provider politikası

### Standard

1. `GOOGLE_WAVENET` — `GOOGLE_TTS_SERVICE_ACCOUNT_JSON` secret tanımlıysa ana rota.
2. `OPENAI_UNIFIED_TTS` — Cloudflare AI Gateway Unified Billing üzerinden `openai/tts-1` yedeği.
3. `OPENAI_GPT4O_MINI_TTS` — direct OpenAI secret tanımlıysa son yedek.

Amaç: Türkçe kurumsal ses + düşük maliyet.

### Premium

1. `OPENAI_GPT4O_MINI_TTS` — `OPENAI_TTS_API_KEY` varsa daha yönlendirilebilir doğal ses.
2. `OPENAI_UNIFIED_TTS_HD` — Cloudflare Unified Billing üzerinden `openai/tts-1-hd`.
3. `GOOGLE_WAVENET` — kurumsal yedek.

## Staging non-secret vars

```text
NIBIRU_AI_GATEWAY_ID=default
NIBIRU_STT_MODEL=@cf/openai/whisper-large-v3-turbo
NIBIRU_GOOGLE_TTS_VOICE=tr-TR-Wavenet-E
NIBIRU_OPENAI_TTS_MODEL=openai/tts-1
NIBIRU_OPENAI_TTS_HD_MODEL=openai/tts-1-hd
NIBIRU_OPENAI_DIRECT_TTS_MODEL=gpt-4o-mini-tts
NIBIRU_OPENAI_TTS_VOICE=alloy
```

## Secrets

Gerçek değerleri repo veya `wrangler.jsonc` içine yazmayın.

### Google WaveNet

```bash
npx wrangler secret put GOOGLE_TTS_SERVICE_ACCOUNT_JSON
```

Google Cloud service account için Text-to-Speech erişimi etkin olmalıdır. JSON içindeki `client_email`, `private_key` ve `project_id` kullanılır.

### Direct OpenAI Premium TTS — opsiyonel

```bash
npx wrangler secret put OPENAI_TTS_API_KEY
```

Bu secret olmadan Premium ses tamamen kapalı değildir; Cloudflare AI Gateway Unified Billing `openai/tts-1-hd` yedeği kullanılabilir.

## API

- `GET /api/nibiru/voice/status` — güvenli sağlayıcı durumu; secret değeri dönmez.
- `POST /api/nibiru/voice/transcribe` — raw audio body; maksimum 8 MB.
- `POST /api/nibiru/voice/speak` — `{ "text": "...", "mode": "STANDARD" | "PREMIUM" }`.
- `POST /api/nibiru/voice/probe?mode=standard` — yalnız Süper Admin; gerçek TTS sağlayıcısını kısa sentezle doğrular.

TTS cevaplarında `Cache-Control: private, no-store` kullanılır. Kişiselleştirilmiş ses cevapları ortak response cache'e alınmaz.

## Öğretmen dil politikası

TTS sağlayıcısı öğretim içeriğini belirlemez. Metin önce Nibiru tarafından üretilir ve şu ilkelere tabidir:

- sakin, açık, profesyonel ve yaşa uygun Türkçe,
- geliştirici ve süreç odaklı dil,
- öğrenciye etiket koymama,
- argo/aşırı samimiyet kullanmama,
- psikolojik/tıbbi tanı üretmeme,
- MEB ürünü veya temsilcisi olduğunu iddia etmeme,
- doğrulanmış veri yoksa sayı/başarı/sonuç uydurmama.

## Aktivasyon kriteri

Kodun hazır olması ile provider'ın gerçek aktive olması ayrıdır.

- STT aktif: Workers AI binding + gerçek kısa ses transkripsiyon testi başarılı.
- Standard TTS aktif: `/api/nibiru/voice/probe?mode=standard` başarılı ve audio bytes > 0.
- Google maliyet optimizasyonu aktif: Google secret tanımlı ve probe provider=`GOOGLE_WAVENET`.
- Premium direct aktif: OpenAI secret tanımlı ve premium probe provider=`OPENAI_GPT4O_MINI_TTS`.

Production aktivasyonu staging canlı kabulü tamamlanmadan yapılmaz.
