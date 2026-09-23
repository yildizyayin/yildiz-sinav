# ANUNEX Ürün Sözleşmesi

Durum: `ONAYLI ÇERÇEVE`

Bu belge ürünün ne olduğunu ve ne olmadığını tanımlar. Yeni bir özellik bu belgeyle çelişiyorsa uygulanmadan önce kullanıcı kararı gerekir.

## Ürün

ANUNEX, kurumların sınav tanımladığı, optik veya dosya üzerinden değerlendirme yaptığı, sonuçları ve kazanım analizlerini yönettiği gerçek bir ölçme-değerlendirme platformudur. Demo ekranı, görsel maket veya yalnızca tanıtım paneli değildir.

Nibiru, ANUNEX’in canlı yapay zekâ çekirdeğidir. Ancak Nibiru özellikleri ilk çalışan sınav-değerlendirme omurgasının önüne geçmez.

## Domain sınırları

| Domain | Kesin görev |
|---|---|
| `anunex.com` | Tanıtım ve marka sitesi |
| `app.anunex.com` | Gerçek sistem, kurum işlemleri ve Süper Admin paneli |
| `demo.anunex.com` | İzole demo kurum/öğretmen/öğrenci/veli deneyimi |
| `sonuc.anunex.com` | Bağımsız sonuç sistemi; agent paneli bulunmaz |

Demo verisi production’a kendiliğinden aktarılmaz. `app` ve `sonuc` ortak sınav/sonuç omurgasını kullanabilir; demo izolasyonu korunur.

## Merkezi sınav omurgası

Tek merkezî akış:

`Sınav Ekle → Sınav Kaydı → Cevap Anahtarı → Kazanım Eşleştirme → Optik/FMT/TXT/DAT → Yükleme → Değerlendirme → Sonuç/Rapor`

Yeni oluşturulan sınav merkezî katalogda saklanır. Kurumun yükleme ekranında görünmeyen veya adı tıklanınca açılmayan sınav kabul edilemez.

## Optik sınırları

- Optik tanımlama ve optik basma birbirinden bağımsızdır.
- Phobos: Optik Form Ağacı ve optik form tanımlama alanıdır.
- Deimos: Optik basma/yazdırma alanıdır.
- Kurumun kendi optiği kurum alanında kalır; ana havuzda yalnız Süper Admin tarafından yayınlanan optikler bulunur.
- Gerçek fiziksel form koordinatları ve FMT/DAT/TXT parametreleri gerçek örnek veya üretici verisi olmadan uydurulamaz.
- Belirsiz, çift veya okunamayan işaretler otomatik sonuç olarak kabul edilmez; manuel incelemeye gider.

## Tasarım dili

- ANUNEX ana marka, Nibiru canlı yapay zekâ çekirdeğidir.
- Panel işlevleri tanıtım/reklam metinleriyle doldurulmaz.
- Sınav Merkezi Mars tonlarında; Optik Merkezi Mars’ın uyduları olan Phobos/Deimos atmosferinde tasarlanır.
- Tema farklılaşsa da logo, tipografi, gezinme ve genel marka kimliği korunur.
- Küçük yazılar, tutarsız tablolar, çalışmayan butonlar ve maket gibi klasörler kabul edilmez.

## Güvenilirlik ve veri kuralları

- GitHub deposu tek teknik kaynak ve kayıt defteridir.
- Mevcut veriler silinmeden önce yedek, migration ve geri dönüş yolu bulunur.
- Tenant ve rol sınırları API tarafında uygulanır; yalnızca arayüz gizlemesine güvenilmez.
- Öğrenci kişisel verileri, saklama ve silme kurallarına göre yönetilir; PII loglara yazılmaz.
- AI özellikleri ilk sürümün temel sınav akışını geciktirmez.

