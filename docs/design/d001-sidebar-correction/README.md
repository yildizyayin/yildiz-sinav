# D001 — Sol panel düzeltmesi

24 Ekim 2026. D001 production görünümü kullanıcı tarafından kabul edilmediği için D003 ve sonraki yayınlar bekletildi.

## Değişiklik

- Onaylı `docs/design/anunex-super-admin-astra-prototype.html` sol panel hiyerarşisi esas alındı: 240 px panel, üstte hesap/çalışma alanı, altta orijinal Nibiru ve mevcut çıkış işlemi.
- Küçük ve kopuk grup başlıkları yerine okunabilir 44 px grup satırları, küçük modül rengi/yörünge işaretleri; aktif sayfada ince şerit ve hafif zemin.
- Alt bağlantılarda tutarlı girinti ve çizgi; uzun metinler kesilmeden sarılır.
- Eski simge şeridi kurallarının 1024/1180 px aralığında yazıları gizlemesi engellendi. Telefon menüsü mevcut aç/kapat davranışını korur.
- Yalnız ANUNEX_STANDARD için ekran CSS'i. Diğer temaların renk kuralları değiştirilmedi. JSX'te aynı hesap kartı yukarı, aynı Nibiru kartı aşağı taşındı; yeni işlev eklenmedi.

## Bilerek korunan farklar

Referans prototipindeki hayali logo ve Nibiru yerine mevcut orijinal marka varlıkları kullanıldı. Referansın 208 px ölçüsü yerine görevde belirtilen 240 px kullanıldı. Mevcut Türkçe grup/bağlantı adları, sıralama, rol/yetki kontrolleri, bağlantılar ve açık grup hesaplaması korunmuştur. Menü araması, kişisel kısayollar veya yeni modüller eklenmedi; bunlar yeni state/işleyiş gerektirir ve görünüm kapsamını aşar. `/exam-definitions` mevcut grupların rota listesinde doğrudan yer almadığından o sayfada grupların otomatik açılma davranışı da değiştirilmedi. Nibiru alt kartı mevcut bilgilendirici karttır; yeni tıklama eylemi eklenmedi.

## Doğrulama

- npm ci: geçti. Manifest/lock değişmedi.
- npm run typecheck: geçti.
- npm test: 315 dosya / 1407 test geçti. Testler değiştirilmedi.
- npm run build: geçti.
- Yerel üretim çıktısında 14 tema/genişlik senaryosu: STANDARD 1440, 1180, 1024, 768, 390, 360; FOCUS/STUDIO/COSMIC/NEON 1440 ve 390. Konsol JS render hatası veya sayfa taşması yok.
- STANDARD senaryolarında ana sayfa, sınav merkezi ve sınav ekle görünümü kontrol edildi. Grup açma, mevcut Sınav Merkezi bağlantısı, mobil bağlantı seçince kapanma ve kapat düğmesi kontrol edildi. Menü açıkken panelin gerçekten ekran içinde olduğu ayrıca doğrulandı.
- Ekran görüntüleri sentetik kullanıcı ve API verileriyle gerçek React üretim çıktısından alınmıştır. Sınav Merkezi listesi için 503 fixture kullanılarak hata ve boş durum da görünür tutuldu; bu gerçek sınav işlevi kabulü değildir. Gerçek hesap veya üretim verisine giriş yapılmadı.
- worker/, migrations/, src/api.ts, src/auth.tsx, src/lib/, tests/, .github/, wrangler*, report-print.css değişmedi.

## Görsel kanıtlar

- [Masaüstü 1440](home-1440.png)
- [Telefon 390, menü açık](home-390.png)
- [Sınav ekle 1440](exam-add-1440.png)
- [Sınav ekle 1024](exam-add-1024.png)
- [Sınav ekle 360](exam-add-360.png)
- [Tarayıcı sonuçları](verification.json)

## Production sonrası kullanıcı kontrolü

STANDARD temasında sayfayı yenile: üstte hesap, altta Nibiru; grup aç/kapat; Sınav Merkezi ve Sınav Ekle sayfaları; dar ekranda menü aç/kapat. Yayın GitHub production ortamının mevcut hesap onayını gerektirir. Bu kayıttaki testler production yayını veya gerçek hesap görsel kabulü tamamlandı anlamına gelmez.
