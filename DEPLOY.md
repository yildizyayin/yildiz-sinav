# Cloudflare Deploy

Bu doküman V1'i Cloudflare Workers + D1 + R2 üzerinde önce **staging/workers.dev**, sonra production olarak yayınlamak içindir.

## GitHub üzerinden staging deploy

Repository ana dalına gelen her değişiklik `.github/workflows/deploy.yml` ile Cloudflare deploy denemesi yapar.

GitHub Repository Settings > Secrets and variables > Actions bölümünde iki repository secret gerekir:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Cloudflare API token'ını repository dosyasına veya sohbet mesajına yazmayın. GitHub Actions secret olarak saklayın.

Staging demo verisinin otomatik yüklenmesini istiyorsanız ayrıca repository variable ekleyin:

```text
CLOUDFLARE_LOAD_DEMO=true
```

Bu variable yalnız staging/test için kullanılmalıdır.

## Otomatik D1 ve R2 provisioning

`wrangler.jsonc` V1 staging'de account-specific D1/R2 ID taşımıyor:

```jsonc
"d1_databases": [{ "binding": "DB", "migrations_dir": "migrations" }],
"r2_buckets": [{ "binding": "FILES" }]
```

Güncel Wrangler automatic provisioning özelliği ilk `wrangler deploy` sırasında D1 ve R2 kaynağını oluşturup Worker'a bağlayabilir. CI checkout'u geçici olduğu için oluşan resource ID'lerin repository'ye geri yazılması beklenmez; Cloudflare tarafındaki bağ korunur.

Deploy sırası:

1. `npm install`
2. typecheck + unit tests + production build
3. `wrangler deploy` — Worker + D1/R2 provisioning
4. `wrangler d1 migrations apply DB --remote --yes`
5. `CLOUDFLARE_LOAD_DEMO=true` ise synthetic demo seed

## Staging Turnstile

Staging yapılandırması Cloudflare'ın resmi **always-pass test Turnstile** çiftini kullanır. Bu sayede widget ve Worker-side Siteverify akışı gerçek entegrasyon yolundan test edilir fakat gerçek kullanıcı challenge'ı oluşturmaz.

Staging anahtarları production için kullanılamaz.

Production'a geçerken:

1. Cloudflare Turnstile'da gerçek widget oluşturun.
2. Public site key'i production config'e verin.
3. Secret key'i Cloudflare secret/GitHub secret olarak saklayın.
4. `ENVIRONMENT=production` kullanın.
5. Test key'lerini production config'ten tamamen kaldırın.

## Yerelden çalıştırma

```bash
npm install
npm run seed:generate
npm run db:migrate:local
npm run seed:local
npm run dev
```

## Yerelden Cloudflare kimlik doğrulama

```bash
npx wrangler login
npx wrangler whoami
```

## Manuel deploy gerekirse

```bash
npm install
npm run typecheck
npm test
npm run build
npx wrangler deploy
npx wrangler d1 migrations apply DB --remote --yes
```

İlk yayın workers.dev alan adında açılabilir. Özel domain daha sonra Worker'a bağlanabilir.

## Demo seed

Sadece test/staging ortamında:

```bash
npm run seed:generate
npx wrangler d1 execute DB --remote --file=tmp/demo-seed.sql --yes
```

Demo hesap parolası bilinen bir test parolasıdır ve production müşteri ortamında kullanılmamalıdır.

## Production kontrol listesi

- [ ] CI yeşil
- [ ] D1 migration başarılı
- [ ] R2 binding çalışıyor
- [ ] `ENVIRONMENT=production`
- [ ] Gerçek `TURNSTILE_SITE_KEY` tanımlı
- [ ] Gerçek `TURNSTILE_SECRET_KEY` güvenli secret olarak tanımlı
- [ ] Staging test Turnstile anahtarları kaldırıldı
- [ ] Demo kullanıcıları production'da yok
- [ ] Doğrulanmış scoring rule mevcut
- [ ] Tenant isolation testleri başarılı
- [ ] Pasif kurum erişim testi başarılı
- [ ] Misafir -> aktif dönüşüm testi başarılı
- [ ] Optik gerçek template testleri tamamlandı
- [ ] Kalibrasyon gerçek yazıcı/optik üzerinde doğrulandı
- [ ] Veri transferi gerçek örnek dosyalarla doğrulandı

## Not: Yazıcı seçimi

Web uygulaması “Canon Öğretmenler Odası” gibi bir kalibrasyon profili seçer. Fiziksel işletim sistemi yazıcısının seçimi browser/OS yazdırma penceresinde kullanıcı tarafından yapılır. Kullanıcıya kalibre ettiği fiziksel yazıcıyı seçmesi ve `Actual Size / %100` ile yazdırması hatırlatılır.
