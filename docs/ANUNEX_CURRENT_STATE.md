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

