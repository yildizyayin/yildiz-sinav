# ANUNEX Karar Defteri

Durumlar: `TASLAK`, `ONAYLANDI`, `UYGULANIYOR`, `TEST EDİLDİ`, `CANLIDA DOĞRULANDI`, `İPTAL`.

Bir kararın kodlanmış olması onun canlıda çalıştığı anlamına gelmez.

| ID | Karar | Durum | Kanıt / not |
|---|---|---|---|
| ANX-D-001 | GitHub deposu `yildizyayin/yildiz-sinav` tek kaynak olarak kullanılacak. | ONAYLANDI | Yeni sohbetlerde bu klasör okunacak. |
| ANX-D-002 | `app` gerçek sistem, `demo` izole demo, `sonuc` bağımsız sonuç sistemi, `anunex.com` tanıtım sitesidir. | ONAYLANDI | Domain sınırları ürün sözleşmesinde. |
| ANX-D-003 | Tek merkezî sınav/optik altyapısı kullanılacak; modüller aynı auth, tenant ve veri omurgasına bağlanacak. | ONAYLANDI | Sınav ve optik akışı tek sistemdir. |
| ANX-D-004 | Sınav Ekle ile oluşturulan sınavlar yükleme ekranında görünür; sınav adı ve Görüntüle eylemi detay ekranını açar. | ONAYLANDI | Canlı kabul testi henüz geçmedi. |
| ANX-D-005 | Sınav satırı ve detay ekranında Görüntüle/Düzenle, Kopyala, Arşivle ve Sil işlemleri gerçek API işlemlerine bağlı olur. | ONAYLANDI | Her eylem için canlı test gerekli. |
| ANX-D-006 | Sınav silme iki taraflı senkron davranır; silme öncesi kullanıcıdan onay alınır. | ONAYLANDI | `app` ve `sonuc` birlikte doğrulanacak. |
| ANX-D-007 | Yayınevi kazanımı korunur; resmî MEB kazanımı ayrı alan olarak eşleştirilir. Eşleşmeyen kayıt uydurulmaz, incelemeye bırakılır. | ONAYLANDI | Gerçek MEB katalog verisi gerekir. |
| ANX-D-008 | Phobos optik form ağacı/tanımlama, Deimos optik basma alanıdır. | ONAYLANDI | Arayüz ve işlemler bağımsız olmalı. |
| ANX-D-009 | Optik form modalı Form Adı, Sıra, Form Türü, Yayınevi, Optik Kodu, Kullanıcı ve 3 kolonlu Baş./Uz. parametre tablosunu içerir. | ONAYLANDI | Gerçek koordinat uydurulmayacak. |
| ANX-D-010 | Kurum optikleri ana havuza yayınlanmaz; ana havuz yalnız Süper Admin yayınlarıdır. | ONAYLANDI | Yetki/API testi gerekir. |
| ANX-D-011 | FMT, DAT, TXT ve telefon kamerası okuma akışı aynı değerlendirme omurgasına bağlanır; belirsiz okumalar manuel incelemeye gider. | ONAYLANDI | Gerçek optik örnekleriyle test gerekir. |
| ANX-D-012 | Kod, typecheck, test, build ve canlı smoke test geçmeden iş tamamlandı denmez. | ONAYLANDI | Deploy raporunda ayrı ayrı gösterilecek. |
| ANX-D-013 | Kullanıcı tarafından paylaşılmayan veri, özellik veya entegrasyon sonucu uydurulmaz. | ONAYLANDI | Eksik veri açıkça blokaj olarak yazılır. |
| ANX-D-014 | Nibiru’nun yeni yetenekleri temel sınav/optik omurgası doğrulanmadan genişletilmez. | ONAYLANDI | Nibiru işlevi şimdilik dondurulmuş kapsamdır. |

## Karar ekleme biçimi

Yeni kararlar `ANX-D-015` sırasından devam eder. Her kayıt şu alanları içermelidir:

- Karar
- Neden
- Etkilenen domain/modül
- Kabul kriteri
- Durum
- Tarih

