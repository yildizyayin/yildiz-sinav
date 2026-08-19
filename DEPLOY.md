# Cloudflare Deploy

Bu doküman V1'i Cloudflare Workers + D1 + R2 üzerinde yayınlamak içindir.

## 1. Cloudflare kimlik doğrulama

Yerelden:

```bash
npx wrangler login
npx wrangler whoami
```

CI/CD için GitHub Actions kullanılıyorsa Cloudflare API token'ı GitHub secret olarak tutulmalıdır; repository içine yazılmamalıdır.

## 2. D1 oluştur

```bash
npx wrangler d1 create yildiz-sinav-db
```

Komutun döndürdüğü `database_id` değerini `wrangler.jsonc` içindeki:

```json
"database_id": "REPLACE_WITH_D1_DATABASE_ID"
```

yerine yazın.

Migration:

```bash
npm run db:migrate:remote
```

## 3. R2 oluştur

```bash
npx wrangler r2 bucket create yildiz-sinav-files
```

`wrangler.jsonc` binding adı `FILES`, bucket adı `yildiz-sinav-files` olarak hazırdır.

## 4. Turnstile

Cloudflare Dashboard'da bir Turnstile widget oluşturun.

Public site key:

- `wrangler.jsonc` / production vars içine `TURNSTILE_SITE_KEY`

Secret key:

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Secret key hiçbir zaman frontend'e veya repository'ye yazılmamalıdır.

## 5. Session secret

Rastgele, uzun bir secret oluşturup:

```bash
npx wrangler secret put SESSION_SECRET
```

ile ekleyin.

## 6. Migration + deploy

```bash
npm install
npm run typecheck
npm test
npm run build
npm run db:migrate:remote
npm run deploy
```

İlk yayın workers.dev alan adında açılabilir. Özel domain daha sonra Worker'a bağlanabilir.

## 7. Demo seed (yalnız test ortamı)

Production müşteri veritabanına demo seed uygulamayın.

Test ortamında:

```bash
npm run seed:remote
```

Demo şifresi kaynak kod içinde değil, seed üreticisi tarafından PBKDF2 hash olarak oluşturulur; ancak bilinen demo parola nedeniyle production için uygun değildir.

## 8. GitHub Actions deploy

`.github/workflows/deploy.yml` yalnız repository variable aşağıdaki değerdeyse çalışır:

```text
CLOUDFLARE_DEPLOY_ENABLED=true
```

Gerekli GitHub değerleri:

### Repository Secrets

```text
CLOUDFLARE_API_TOKEN
```

### Repository Variables

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_DEPLOY_ENABLED=true
```

D1 `database_id` repository'deki `wrangler.jsonc` içine gerçek ID olarak yazılmalıdır veya sonraki aşamada deploy pipeline tarafından üretilen environment config'e taşınmalıdır.

## 9. Production kontrol listesi

- [ ] CI yeşil
- [ ] D1 migration başarılı
- [ ] R2 binding çalışıyor
- [ ] `SESSION_SECRET` tanımlı
- [ ] `TURNSTILE_SECRET_KEY` tanımlı
- [ ] `TURNSTILE_SITE_KEY` gerçek site key
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
