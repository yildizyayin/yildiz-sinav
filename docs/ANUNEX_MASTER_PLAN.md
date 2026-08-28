# ANUNEX / Nibiru Ana Görev Defteri

Bu dosya yalnız ANUNEX ölçme-değerlendirme platformunun kalıcı doğruluk ve devam kaynağıdır. ERP, kurumsal satış portalı ve diğer projeler bu dosyaya dahil edilmez. Her geliştirme oturumunun başında okunur; tamamlanan iş, doğrulama kanıtı ve sıradaki tek iş aynı oturumda güncellenir.

## Değişmez ürün kararları

- Marka sahibi ve çatı ürün **ANUNEX**'tir. **Nibiru**, ayrı bir sohbet ürünü değil platformun bütün rollerine yayılan AI katmanıdır.
- Çalışan üretim sistemi bozulmadan, küçük ve test edilebilir dilimlerle ilerlenir.
- Süper Admin kurum oluştururken `STANDARD`, `PREMIUM` veya `CUSTOM` paket seçebilir.
- `CUSTOM` paket, kurumun yalnız ihtiyaç duyduğu modülleri seçebilmesini sağlar.
- Yeni kuruma 7 günlük demo tanımlanabilir. Kurum onay verirse aynı kurum ve veriler korunarak 1 yıllık lisansa dönüştürülür.
- Optik Hazırla / Optik Bas hem Süper Admin hem Kurum Yöneticisi rolünde bulunur.
- Nibiru; öğrenme grafiği, akademik analiz, yanlış/boş ve eksik kazanım, recovery, rehberlik, eğitim koçu, hedef, motivasyon, kişisel görevler, Sıfır Hata, kişisel kitap, video/kazanım köprüsü ve rol bazlı uzman AI yönlendirmelerini birleştirir.
- Kullanıcı arayüzünde ham kurum/sınıf/öğrenci ID'si istenmez; güvenli seçim bileşenleri kullanılır.
- Demo/sentetik veri production iş akışlarına sızmaz.

## Doğrulanmış mevcut durum — 28 Ağustos 2026

- Production Worker yayında: `yildiz-sinav-prod.rtsgida.workers.dev`.
- ANUNEX kozmik giriş ekranı, Turnstile ve favicon yayında.
- Production deploy iş akışı başarılı.
- Son doğrulanan test özeti: 42 test dosyası, 177 test.
- İlk Süper Admin hesabı oluşturuldu ve kullanıcı gerçek tarayıcıda giriş yaptı.
- D1, auth/RBAC/tenant izolasyonu, sınav/optik/değerlendirme çekirdeği ve çeşitli Nibiru servisleri kod tabanında bulunuyor.
- Güvenli çıkış API'si kodda mevcut; ancak uzun menü nedeniyle çıkış düğmesi görünmüyor ve istemci sunucu iptal hatasında oturumu yerelde kapatıyor. Bu davranış düzeltilmeli.
- Production boş başlangıç durumunda: kurum ve operasyon verileri henüz oluşturulmadı.

## Kesin uygulama sırası

### P0 — Güvenlik ve erişim

- [x] Çıkış düğmesini masaüstü ve mobilde her zaman görünür yap.
- [x] Çıkışta mevcut session kaydının sunucuda iptal edildiğini kod ve test paketiyle doğrula.
- [x] Sunucu iptali başarısızsa kullanıcıya açık hata göster; sessizce yerel oturumu kapatma.
- [x] Çıkış sonrası giriş sayfasına `replace` ile dönerek korumalı rotaya geri dönüşü engelle.
- [ ] Profil ekranına şifre değiştirme, aktif oturumlar ve tüm cihazlardan çıkış ekle.
- [ ] İlk kurulum tamamlandıktan sonra `PROD_INITIAL_ADMIN_PASSWORD` sırrını kaldır.

### P1 — Kurum ve lisans çekirdeği

- [x] Yeni kurum oluşturma formu ve temel onboarding profili.
- [x] İlk kurulum sihirbazının kurum → yönetici → paket/modül → sezon/demo çekirdeği.
- [x] 7 günlük demo başlangıç/bitiş, kalan gün ve durum göstergeleri.
- [x] Kurum onayı kaydı ve onay olmadan yıllık lisansa dönüşümü engelleme.
- [x] Onay sonrası mevcut yıllık lisans servisiyle verileri koruyarak 365 güne çevirme.
- [ ] Süre bitişi, yenileme, askıya alma ve erişim sınırları.
- [x] Paketler: Standard, Premium, Kendi Paketini Oluştur.
- [x] Paket/modül kataloğu ve kurum özellik yetkilerinin onboarding sırasında uygulanması.
- [x] Demo başlangıcı ve kurum onayı için lisans/denetim kaydı.
- [ ] Kurum ayrıntı sayfasında paket değiştirme, zincir/şube ve onboarding kalan adımları.
- [ ] Lisans yenileme ve bitiş bildirimleri.

### P2 — Süper Admin Panel V2

- [ ] ANUNEX marka kimliğini giriş sonrası panele taşı.
- [ ] Menüyü Genel, Kurum, Akademik, Sınav/Optik, İçerik, Nibiru AI, Lisans/Finans, Rapor ve Sistem gruplarına ayır.
- [ ] Menü arama, daraltma, favori ve durum rozetleri.
- [ ] Geliştirici araçlarını normal production menüsünden kaldır veya Sistem altında sınırla.
- [ ] İlk kurulum/boş durum rehberi.
- [ ] Bekleyen işlemler, kurum/lisans durumu, aktif sınavlar, optik kuyruğu, Nibiru uyarıları, son işlemler ve servis sağlığı göstergeleri.
- [ ] İç teknik adları kullanıcı diline çevir; tekrar eden/eski sınav menülerini birleştir.

### P3 — Operasyonel kullanım boşlukları

- [ ] Kurum, sınıf, öğrenci ve sınav için ham ID alanlarını güvenli seçicilere dönüştür.
- [ ] Kurum yaşam döngüsü, iletişim, logo, alan adı, şube ve zincir kurum yönetimi.
- [ ] Yoklama/devamsızlık.
- [ ] Fiziksel ve dijital kitaptan ödev verme/takip.
- [ ] Soru Havuzu & Studio.
- [ ] Kişiye özel kitap üretimi.
- [ ] Sıfır Hata kitabı/kitapçığı.
- [ ] Föy Merkezi ve yıllık kazanım planı.
- [ ] Toplu işlemler ve veri transferleri.
- [ ] Zincir kurum merkezi yönetim ve üst yönetim raporları.
- [ ] Tercih robotu.
- [ ] Anlayarak hızlı okuma.
- [ ] Akıllı Tahta içerik seçme, oynatma ve canlı oturum deneyimi.
- [ ] Resmî MEB/ÖSYM verileri için dosya yükleme, eşleme ve doğrulama arayüzü.

### P4 — Nibiru AI bütünleştirmesi

- [ ] Sesli komut izin, kayıt, yükleme, tanıma, yanıt ve hata durumlarını uçtan uca doğrula.
- [ ] Desteklenmeyen tarayıcı ve mikrofon reddi için anlaşılır geri dönüş.
- [ ] Nibiru uzman AI yönlendiricisini tüm rol deneyimlerinde görünür ve bağlamsal yap.
- [ ] Öğrenme grafiği, Recovery, RBA, rehberlik, koçluk, hedef/motivasyon, kişisel görev, Sıfır Hata ve video köprüsünü tek öğrenci profiline bağla.
- [ ] Doğru/yanlış/boş sorular için yayınevi çözüm videosu ve konu anlatımı seçeneklerini uygula.
- [ ] YouTube aday seçiminde güvenlik, yaş uygunluğu, kazanım eşleşmesi ve kısa video politikalarını doğrula.
- [ ] WhatsApp Nibiru kanalını Meta production bilgileri geldiğinde aktive et.

### P5 — Rol bazlı kabul ve production kapanışı

- [ ] Süper Admin.
- [ ] Kurum Yöneticisi.
- [ ] Branş Öğretmeni.
- [ ] Rehber Öğretmeni.
- [ ] Öğrenci.
- [ ] Veli.
- [ ] Her modülde: görünürlük, yetki, tenant izolasyonu, boş durum, hata durumu, mobil kullanım, pratiklik, yazdırma/PDF/CSV ve denetim kaydı.
- [ ] Typecheck, unit/integration test, build, migration dry-run/doğrulama.
- [ ] Staging smoke, production deploy, production smoke ve geri dönüş planı.

## Dış girdiye bağlı işler

- Meta/WhatsApp production doğrulamaları ve secret'lar.
- Gerçek MEB müfredat ve ÖSYM/LGS/YKS hedef/veri dosyaları.
- Gerçek optik/FMT örnekleri ve fiziksel yazıcı kalibrasyonu.
- Edesis/Okulizyon gerçek export örnekleri.
- Canlı görüşme sağlayıcısı.
- `anunex.com` alan adı ve ileride `@anunex.com` yönetici e-postası.

## Oturum kapanış kaydı

Her oturum sonunda aşağıdaki dört satır güncellenir:

- **Son tamamlanan:** Kurum onboarding, 7 günlük demo, kurum yıllık lisans onayı ve Standard/Premium/Custom paket çekirdeği tamamlandı.
- **Son doğrulama:** Typecheck ve production build başarılı; 43/43 test dosyası, 182/182 test başarılı; 0001–0027 migration zinciri boş SQLite veritabanında başarılı.
- **Production durumu:** `b34e0ea` tabanlı sürüm canlı; bu çalışma henüz yayınlanmadı.
- **Sıradaki tek iş:** Süper Admin Panel V2 ve menü gruplandırması.
