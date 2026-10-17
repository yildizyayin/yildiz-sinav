# 2027–2028 hedefi ve kesir sıralama doğrulaması
## Hedef güncellemesi
Kullanıcının 17 Ekim açıklaması: soruların hedefi 2027–2028 eğitim yılıdır. 8. sınıf/LGS ve 12. sınıf dahil TYT–AYT hazırlığı bu hedefte planlanacak. TYT ve AYT yalnız 12. sınıf içeriği olarak ele alınmaz.
MEB duyurusu 2028 LGS ve YKS'de yeni müfredata uyumlu soru modeline geçişi açıklıyor:
https://www.meb.gov.tr/yks-ve-lgsde-yeni-mufredata-uyumlu-soru-modeli-2028de-hayata-gececek/haber/39265/tr
Hedef dosyası plan kaydıdır, zamanlayıcıyı veya üretimi açmaz. Yayımlanacak MEB/ÖSYM sınav belgeleriyle kapsam yeniden doğrulanmalı. Önceki 2026–2027 aktarımları yeniden etiketlenmedi. 2027–2028 için yıl/sürüm bazlı doğrulama ve aktarım ayrıca gerekli.
500.000 hedefi korunur; 8/12 veya TYT–AYT için yeni adet dağılımı henüz yapılmadı.
## Uygulanan dar doğrulama
MAT.7.1.3 kodu ve kayıtlı resmî başlığına bağlı, GENERIC görev ve görselsiz soruda üç açık kesrin küçükten büyüğe sıralanması kontrol edilir.
Yalnız payı -999999..999999, pozitif paydası 1..999999 olan açık a/b gösterimi desteklenir. BigInt çapraz çarpımlarıyla tüm seçenekler kontrol edilir. Sıfır veya negatif payda, eşit rasyonel değerler ve tanınmayan ifade/soru biçimi genel model yoluna düşmeden kapsam dışı kalır.
Kaynak yalnız öğrenciye görünen soru ve seçeneklerdir; cevap anahtarı ve çözüm ispat hesabına girmez. Anahtar sonuçla sonradan karşılaştırılır. Birden çok veya hiç doğru seçenek ayrı sonuçtur.
Bu bir üretim şablonu tavsiyesi veya yayın kalitesi kanıtı değildir. Düz sıralama sorusunun muhakeme ve çeldirici kalitesini editör ayrıca değerlendirmelidir. Diğer 7/9/10/11 matematik kapsamları için önceki ret koruması sürer.
## Doğrulama ve devam
Dört test dosyasında 28 test ve TypeScript kontrolü geçti. Testlerde negatif/sıfır/yakın kesirler, ortak payda oracle karşılaştırması, anahtar gizliliği, yanlış anahtar, çoklu/eksik doğru cevap ve son editör reddi kontrol edildi.
Çalışma dalına kaydedildi; staging/production dağıtımı ve toplu üretim yapılmadı.
Sonraki tek iş: bu dar sıralama motorunun dışındaki rasyonel karşılaştırma gerekçelerini değerlendiren kapsamı geliştirmek; 2027–2028 müfredat aktarımını ayrı iş olarak sürdürmek. Güncel bağlam kaynak/izin servisi ve animasyon halen planlıdır.
