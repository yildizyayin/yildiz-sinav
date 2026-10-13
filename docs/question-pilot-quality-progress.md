# Soru havuzu pilotu — 2026-10-13

Main baseline d8d23f97; staging f7554cb7. İlk üretim çalışması 38424640328 ile 10 gerçek GLM taslağı kaydedildi; bilimsel başarı sayılmıyor. İlk sekiz taslakta yedi içerik/anahtar/kazanım hatası tespit edildi. Hiçbiri otomatik onaylanmadı veya öğrenciye yayımlanmadı.

Bu değişiklik: bağımsız NVIDIA doğrulama + dar kapsamlı aritmetik ve eşdeğer seçenek kontrolü; başarısız doğrulamada kayıt yok, gerekçe/harcama audit kaydı var. Üretici Meta Scout, doğrulayıcı farklı model. Flag yalnız staging. İnsan onayı ve telif incelemesi zorunlu. 50 soru atomik bütçesi korunur, başarısız işler için iade yapılmaz. Cron kapalı.

Pilot sürücüsü sadece bilinen yedi hatalı staging taslağını mevcut revision korumalı review API ile REJECTED yapar; silmez. Yeni idempotent cohort hedefi 10 otomatik kontrolü geçmiş taslaktır. En çok 8 iş çalıştırma/16 model isteği; üretici 3000, doğrulayıcı 1500 çıkış tokenı. Sonuç kanıtı ve kullanım GitHub Actions artifact/loglarına kaydedilir. Başarı ancak gerçek kayıt sayısı 10 ve her beş işin doğrulama kanıtı geçerli ise raporlanır.

Durum: Kod GitHub PR testleriyle doğrulanacak; yeni doğrulama henüz staging üzerinde çalıştırılmadı. Yerel çalışma ortamı bağlantısı kesildi, bu yüzden yerel test geçti iddiası yok. Önce CI, sonra staging dağıtımı, sonra gerçek içerik incelemesi. 50 pilot ve Studio uçtan uca akışı, ilk 10 içerik denetimini tamamlamadan başarılı sayılmayacak.

## İkinci gerçek koşu ve sıkılaştırma

PR244 main d48cfadf, CI/preview 1011 test + typecheck/build başarılı; demo dağıtımı 38427613310 başarılı. Gerçek koşu38427918046 bounded 8 istekle 6 yeni taslak, sonra doğrulama yanıtı biçimi başarısız; pilot başarılı değil. İlk7 hatalı GLM taslağı REJECTED doğrulandı. Son GLM ikilisinde bir ek yanlış anahtar bulundu. Meta taslaklarında İngilizce sayı sözcükleri, altı basamakla sınırlı okuma soruları, programın bölünen sınırını aşan problem ve yakın tekrarlar bulundu; bunlar yayımlanmadı.

Sonraki düzeltme: yazar @cf/openai/gpt-oss-120b, bağımsız NVIDIA doğrulayıcı; resmi MEB sayfa447’deki 7–12 basamak okuma ve işlem operand sınırları açık rehberlik + deterministik kontrol. Önceki12 AI platform sorusunun sınırlı aday listesiyle yakın tekrar engeli; bu küresel anlamsal tekrar garantisi değildir. Doğrulayıcıya açık indeksler verilir, geçersiz şema yanıtı yine kabul edilmez. Bilinen toplam13 hatalı/tekrarlı taslak revision API ile reddedilecek; eski failed pilot işi iptal edilip yeni V2 cohort açılacak. Kota20/50 rezerveli; iade yok. İlk10 içerik denetimi ve insan/telif incelemesi hâlâ tamamlanmadı.
