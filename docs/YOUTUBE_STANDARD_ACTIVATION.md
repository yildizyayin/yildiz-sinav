# Standard YouTube Mikro Öğrenme Aktivasyonu

Standard pakette yanlış/boş soru akışı önce yayınevi/sistem tarafından kayıtlı çözüm ve konu anlatımı bağlantılarını kullanır. Kayıtlı uygun konu videosu yoksa YouTube Data API üzerinden güvenli kısa-video adayları aranabilir.

## Kod tarafında hazır olanlar

- Yalnız öğrenciye ait gerçek sınav sorusu/kanıtı üzerinden arama.
- Kazanım, konu, alt konu, sınıf ve branş bağlamı.
- `safeSearch=strict` ve gömülebilir video filtresi.
- Kısa video adayları için süre, konu ilgisi ve görüntülenme sinyali.
- En fazla 5 adayın değerlendirilmesi.
- Workers AI mevcutsa verilen adaylar arasından mikro konuya en uygun videonun seçilmesi.
- 7 günlük aday önbelleği.
- API anahtarı yoksa kontrollü `YOUTUBE_NOT_CONFIGURED` sonucu; öğrenci akışı kırılmaz.

## Aktivasyon için gereken

Google Cloud projesinde YouTube Data API v3 etkinleştirilir ve yalnız sunucu kullanımına ayrılmış API anahtarı oluşturulur. Gerçek anahtar kaynak koda, GitHub dosyasına veya istemci tarafına yazılmaz.

Cloudflare Worker secret adı:

- `YOUTUBE_API_KEY`

## Kabul kriteri

1. Süper Admin → Standard Hazırlık Denetçisi ekranında `YOUTUBE_API_KEY` yeşil görünür.
2. Kayıtlı konu videosu olmayan yanlış/boş bir soruda öğrenci soru desteği açılır.
3. Sistem konu/kazanım bağlamıyla adayları getirir.
4. Seçilen video yalnız dönen adaylar arasındadır.
5. Video bulunamazsa sistem hata vermek yerine güvenli şekilde “uygun mikro video bulunamadı” durumuna döner.

## Güvenlik

YouTube araması serbest metinli genel bir öğrenci arama motoru değildir. Arama sorgusu sistemdeki ders/kazanım/konu bağlamından üretilir; öğrenci kişisel verisi sorguya eklenmez. API anahtarı yalnız Worker secret olarak tutulur.
