# Anunex Ölçme ve Değerlendirme

Cloudflare-native, çok kiracılı (multi-tenant) ölçme-değerlendirme platformunun V1 uygulaması.

Bu depo bir görsel demo değildir. Worker API, D1 veri modeli, rol/yetki kontrolleri, sınav değerlendirme akışı, lisanslı/misafir öğrenci yaşam döngüsü, eğitim yılı geçişi, optik şablon/kalibrasyon altyapısı, veri transfer staging akışı ve React arayüzü birlikte bulunur.

## V1 kapsamı

- Tek giriş ekranı; rol otomatik belirlenir.
- Roller: Super Admin, Kurum Yöneticisi, Branş Öğretmeni, Rehber Öğretmeni, Öğrenci, Veli.
- Branş öğretmeni yalnız atanmış sınıflarda kendi branşını görebilir.
- Rehber öğretmeni yalnız atanmış sınıf/öğrencilerde tüm dersleri görebilir.
- Kurum yöneticisi yalnız kendi kurumunun akademik/yönetim verilerine erişebilir.
- Öğrenci kendi sınavları, gelişimi ve **Geliştirilecek Kazanımlar** alanını görür.
- Veli yalnız bağlı çocuklarını görür.
- Super Admin herhangi bir kurumda, önceden öğrenci kaydı olmasa da sınav değerlendirebilir.
- Sınav akışı: sınav seç -> TXT/DAT/CSV yükle veya kamera -> format/eşleştirme kontrolü -> değerlendir.
- Sınav cevap anahtarı ve kitapçık yapısı sınava bağlıdır; değerlendirmede tekrar seçilmez.
- Kitapçık türleri sınava göre yapılandırılır (A, A/B, A/B/C/D vb.).
- Lisanslı öğrenci ve misafir sınav katılımcısı ayrıdır.
- Misafir öğrenci yalnız sınav sonucu için tutulur; login, veli, föy ve öğrenci hizmetleri yoktur.
- Aynı misafir öğrenci sonraki sınavlarda yeniden tanınır.
- Ödeme/onay sonrası misafir aynı kimlik korunarak aktif öğrenciye çevrilir; geçmiş sınavları otomatik görünür.
- Kurum ödeme sorunu vb. durumda Super Admin tarafından pasife alınabilir; veri silinmez.
- Yeni sezonda tarihsel kayıt korunarak sınıf yükseltme önizleme + onay akışı vardır.
- Başka sistemlerden geçiş için staging/preview/commit tabanlı Veri Transfer Merkezi vardır.
- Bilinmeyen Edesis/Okulizyon export şemaları uydurulmaz; gerçek örnek dosya gelince adapter eklenir.
- Optik şablon modeli TXT/DAT parser, kamera geometrisi ve kişiye özel baskı koordinatlarını tek sürümlü yapıda tutar.
- Gerçek Optik 129/840/3D koordinatları sağlanmadığı için demo dışında sahte koordinat kullanılmaz.
- Yazıcı + optik kombinasyonu için görsel yüklemeli kalibrasyon; 3 otomatik denemeden sonra manuel düzeltme + zorunlu son görsel doğrulaması.
- Föy V1 altyapısı: akademik yıl, sınıf, sayısal/sözel, kazanım, PDF/cevap anahtarı/video bağlantıları.
- Puanlama kuralları sürümlüdür. Doğrulanmamış MEB/ÖSYM kuralı ile hesap yapılmaz.

## Mimari

```text
React + TypeScript + Vite
          |
          v
Cloudflare Worker (REST API + static assets)
          |
    +-----+------+----------------+
    |            |                |
    v            v                v
Cloudflare D1   Cloudflare R2    Workers AI (yardımcı/opsiyonel)
```

Kritik sınav/puanlama/kimlik eşleştirme işlemleri AI'ya bağlı değildir.

## Yerel kurulum

Gereksinimler:

- Node.js 22+
- npm
- Cloudflare hesabı (gerçek Worker/D1/R2 kullanımı için)

```bash
npm install
npm run seed:generate
npm run db:migrate:local
npm run seed:local
npm run dev
```

Staging deploy'da D1 ve R2 kaynakları `wrangler deploy` sırasında otomatik provision edilecek şekilde binding-only tanımlanmıştır; repository içine hesap-spesifik D1/R2 ID yazılması gerekmez.

## Demo hesapları

Demo seed çalıştırıldığında parola tüm demo hesaplarda:

`Demo123!`

Hesaplar:

- `super@demo.test` — Super Admin
- `manager@demo.test` — Kurum Yöneticisi
- `math@demo.test` — Matematik Öğretmeni
- `guidance@demo.test` — Rehber Öğretmeni
- `student1@demo.test` — Öğrenci
- `parent1@demo.test` — Veli

Demo seed yalnız development/test amaçlıdır. Production ortamında demo kullanıcılarını kullanmayın.

## Demo veri senaryosu

Seed dosyası aşağıdaki kritik kabul senaryosunu içerir:

- Demo Koleji / 2026-2027
- 65 aktif öğrenci
- 45 misafir öğrenci
- Aynı 45 misafirin tekrar kullanıldığı 20 geçmiş sınav
- Öğrencilerden biri için 8 sınavlık geçmiş
- A/B kitapçıklı aktif demo sınavı
- Örnek Matematik/Türkçe/Fen dersleri ve sentetik kazanımlar
- Gerçek piyasa optik koordinatları yerine `NEEDS_DEFINITION` durumundaki placeholder şablonlar

## Güvenlik

- Parolalar PBKDF2-SHA256 + kullanıcıya özel salt ile saklanır.
- Session token'ın kendisi D1'e yazılmaz; token hash'i tutulur.
- Production cookie: HttpOnly, Secure, SameSite=Lax.
- Turnstile token'ı Worker tarafında Siteverify ile doğrulanır.
- Brute-force/login attempt kaydı ve geçici kilit mekanizması vardır.
- Kurum, sınıf ve branş yetkileri API katmanında uygulanır.
- Pasif kurumun session'ları geçersizleştirilir.
- Hassas işlemler audit log'a yazılır.

Staging, Cloudflare'ın resmi test Turnstile anahtarlarıyla gerçek widget + server-side Siteverify akışını test eder. Production'a geçerken gerçek widget anahtarlarına geçilir.

## Resmi veri politikası

Aşağıdaki veriler kaynak sağlanmadan veya doğrulanmadan uydurulmaz:

- MEB/ODSGM resmi puanlama kuralları
- ÖSYM/YKS resmi puanlama kuralları
- Resmi kazanım kodları
- Gerçek piyasa optik koordinat/FMT şemaları
- Edesis/Okulizyon özel export şemaları

Uygulama bu durumları konfigürasyon gerektiren veri olarak işaretler.

## Test

```bash
npm run typecheck
npm test
npm run build
```

Ayrıntılı kabul senaryoları için [TEST_PLAN.md](./TEST_PLAN.md) dosyasına bakın.

Vaat edilen, teslim edilen, ertelenen ve dış girdiye bağlı kalan bütün ürün maddeleri için [PRODUCT_STATUS_2026-08-26.md](./PRODUCT_STATUS_2026-08-26.md) dosyasına bakın.

## Cloudflare deploy

Adım adım kurulum için [DEPLOY.md](./DEPLOY.md) dosyasına bakın.

GitHub Actions:

- `.github/workflows/ci.yml`: typecheck + test + build
- `.github/workflows/deploy.yml`: main push sonrası Cloudflare staging deploy + D1 migration

Deploy için GitHub Actions secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Opsiyonel staging demo verisi için repository variable:

```text
CLOUDFLARE_LOAD_DEMO=true
```

## Üretim öncesi gerçek veri gerektiren bölümler

1. Gerçek production Turnstile site/secret key
2. Doğrulanmış resmi scoring rule'lar
3. Gerçek optik şablonları/FMT örnekleri/koordinatları
4. Edesis/Okulizyon gerçek export örnekleri gerekiyorsa adapter tanımları
5. Kuruma özel marka/logo/domain bilgileri

Bu alanlar sağlanmadan sistem onları sahte biçimde “hazır” kabul etmez.
