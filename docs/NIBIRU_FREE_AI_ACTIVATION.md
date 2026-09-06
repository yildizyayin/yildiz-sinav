# Nibiru ücretsiz çoklu-AI aktivasyonu

Bu staging kurulumu Nibiru'yu tek bir kullanıcı kimliği olarak tutar; sağlayıcı ve model adları son kullanıcıya açılmaz.

## Aktif rota

| İş yükü | Birincil | Yedekler |
|---|---|---|
| Hızlı bilgi / kısa özet | GLM 4.7 Flash | Llama 4 Scout |
| Eğitim Koçu | GLM 4.7 Flash | Llama 4 Scout → Nemotron |
| Rehberlik | Llama 4 Scout | Nemotron → GLM |
| Matematik/fen çok adımlı çözüm | Nemotron 3 | Llama → GLM |
| Konu anlatımı | Llama 4 Scout | Nemotron → GLM |
| Veli açıklaması | Llama 4 Scout | GLM |
| Kurum/sınıf analizi | Nemotron 3 | GLM → Llama |

Model kimlikleri:

- @cf/zai-org/glm-4.7-flash
- @cf/meta/llama-4-scout-17b-16e-instruct
- @cf/nvidia/nemotron-3-120b-a12b

## Staging kontrolü

Super Admin oturumu ile yalnız staging'de çalışır:

POST /api/nibiru/ai/probe

Probe:

- Cloudflare AI binding'ini kontrol eder.
- FAST, META ve NVIDIA modelini ayrı ayrı kısa istekle dener.
- Gateway bağlantısını dener; Gateway erişilemiyorsa aynı modeli doğrudan Workers AI üzerinden staging fallback ile tekrar dener.
- Veritabanına probe kaydı yazmaz.
- ok, transport, gatewayFallback, preview ve kısaltılmış hata alanlarını döndürür.

Canlı deploy kontrolü:

    node scripts/live-nibiru-ai-probe.mjs

## Ücretsiz sınır

Bu aktivasyon ücretli model sağlayıcısı veya ücretli paket açmaz. Workers AI'nin Free plan günlük Neurons tahsisi dolarsa istekler 00:00 UTC'ye kadar durabilir; bu durum model arızası değildir. Ayrıntı: https://developers.cloudflare.com/workers-ai/platform/pricing/

D1 Free günlük yazma sınırı da ayrı bir konudur. Staging sohbeti bu sınırla karşılaşırsa yanıtı koruyup STAGING_D1_WRITE_SKIPPED uyarısı üretir; production'da aynı hata gizlenmez.

## Aralık sonrası değerlendirme

Aralık sonrasına kadar:

1. SMART router ve mevcut üç Workers AI modeli korunur.
2. OpenAI, Gemini, Anthropic veya ücretli Workers AI modeline geçiş yapılmaz.
3. Önce gerçek probe sonuçları, günlük Neurons kullanımı, yanıt kalitesi ve fallback oranı ölçülür.
4. Ancak bu ölçümlerden sonra ücretli paket kararı verilir.

Voice/WhatsApp sağlayıcıları bu metin-AI probe'undan ayrı aktivasyon ve secret gerektirir.
