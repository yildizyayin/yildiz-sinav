# ANUNEX Gerçek Mevcut Durum

Son güncelleme: `2026-09-23`

Bu belge, planı değil doğrulanmış durumu tutar. Kullanıcı bildirimi ile görülen canlı hata, bağımsız canlı doğrulama yapılana kadar başarısız kabul edilir.

## Genel durum

| Alan | Durum | Açıklama |
|---|---|---|
| GitHub/CI/build altyapısı | Kısmen doğrulandı | Üretim workflow’ları çalışıyor; bu tek başına kullanıcı akışının çalıştığını kanıtlamaz. |
| `app.anunex.com` erişimi | Erişilebilirlik ayrı, işlev kabulü başarısız | Yetkili canlı akışta Sınav Merkezi yeniden doğrulanmalı. |
| Sınav Ekle → Sınav Yükle görünürlüğü | BAŞARISIZ | Kullanıcı, eklenen sınavların yükleme ekranında görünmediğini bildirdi; kod düzeltmesi yapılmış olsa da canlı kabul testi yapılmadı. |
| Sınav “Aç/Görüntüle” | BAŞARISIZ | Kullanıcı, tıklayınca sınavın açılmadığını bildirdi. |
| Sınav yükleme klasörü/dosya seçimi | BAŞARISIZ | Kullanıcı, alanı işlevsiz klasör gibi gördüğünü bildirdi. |
| Sınav düzenle/kopyala/arşivle/sil | KABUL EDİLMEDİ | Butonların gerçek API ve onay akışıyla canlı test edilmesi gerekiyor. |
| Optik Phobos | KABUL EDİLMEDİ | Tasarım kararları belgeli; işlevsel uçtan uca kabul yok. |
| Optik Deimos | KABUL EDİLMEDİ | Basma/yazdırma bağımsız akışı canlı kabulden geçmedi. |
| `sonuc.anunex.com` senkronu | KABUL EDİLMEDİ | Sınav silme/yayınlama iki taraflı gerçek test edilmedi. |
| MEB kazanım eşleştirme | KABUL EDİLMEDİ | Gerçek resmi katalog ve eşleşmeyen kayıt inceleme akışı doğrulanmalı. |

## Şu an güvenle söylenebilenler

- Depoda sınav ve optik modüllerine ait kod bulunmaktadır.
- Bazı otomatik testler ve üretim workflow’ları başarılı olabilir.
- Bu durum, kurum kullanıcısının canlıda sınav açabildiği veya dosya yükleyebildiği anlamına gelmez.
- Sınav Merkezi şu an satışa hazır kabul edilmeyecektir.

## Açık blokajlar

1. Yetkili kullanıcıyla canlı Sınav Merkezi smoke testi.
2. Gerçek sınav kaydıyla `Aç/Görüntüle` detay akışı.
3. Gerçek dosya seçimi ve yükleme akışı.
4. API hata kayıtlarının kullanıcıya görünür ve anlamlı gösterilmesi.
5. Optik form parametrelerinin gerçek örnekle doğrulanması.
## 2026-09-23 salt-okuma denetimi bulguları

- Sınav Merkezi içindeki Aç eylemi ExamCenter bileşeninde yalnızca satırı seçiyor; ExamDefinitions içindeki gerçek detay çalışma alanına yönlendirme yapmıyor. Bu nedenle kullanıcı sınav açılmadı sanıyor.
- Dosya yükleme kartı ExamCenter içinde yalnızca INSTITUTION_MANAGER rolü için oluşturuluyor. Rota SUPER_ADMIN rolünü kabul etse de Süper Admin için upload kartı görünmüyor.
- Sınav Yükle bağlantısı aynı ExamCenter bileşenini mode=upload parametresiyle açıyor; bağımsız bir yükleme çalışma alanı değil. Bu yapı, butonun klasör gibi görünüp işlevsiz algılanmasına neden olabiliyor.
- Katalog, sınav detay ve dosya önizleme API rotaları kaynak kodda mevcut; fakat yetkili canlı kullanıcıyla uçtan uca doğrulanmadıkları için çalışan kabul edilmiyor.
- Yetkili canlı oturum bulunmadığından anonim canlı kontrol yalnızca giriş ekranına yönlendirmeyi doğruladı. Canlı kullanıcı akışı hâlâ açık kabul testidir.
