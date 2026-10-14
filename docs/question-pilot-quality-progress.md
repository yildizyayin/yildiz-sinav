# Soru havuzu pilotu — 2026-10-13

Main baseline d8d23f97; staging f7554cb7. İlk üretim çalışması 38424640328 ile 10 gerçek GLM taslağı kaydedildi; bilimsel başarı sayılmıyor. İlk sekiz taslakta yedi içerik/anahtar/kazanım hatası tespit edildi. Hiçbiri otomatik onaylanmadı veya öğrenciye yayımlanmadı.

Bu değişiklik: bağımsız NVIDIA doğrulama + dar kapsamlı aritmetik ve eşdeğer seçenek kontrolü; başarısız doğrulamada kayıt yok, gerekçe/harcama audit kaydı var. Üretici Meta Scout, doğrulayıcı farklı model. Flag yalnız staging. İnsan onayı ve telif incelemesi zorunlu. 50 soru atomik bütçesi korunur, başarısız işler için iade yapılmaz. Cron kapalı.

Pilot sürücüsü sadece bilinen yedi hatalı staging taslağını mevcut revision korumalı review API ile REJECTED yapar; silmez. Yeni idempotent cohort hedefi 10 otomatik kontrolü geçmiş taslaktır. En çok 8 iş çalıştırma/16 model isteği; üretici 3000, doğrulayıcı 1500 çıkış tokenı. Sonuç kanıtı ve kullanım GitHub Actions artifact/loglarına kaydedilir. Başarı ancak gerçek kayıt sayısı 10 ve her beş işin doğrulama kanıtı geçerli ise raporlanır.

Durum: Kod GitHub PR testleriyle doğrulanacak; yeni doğrulama henüz staging üzerinde çalıştırılmadı. Yerel çalışma ortamı bağlantısı kesildi, bu yüzden yerel test geçti iddiası yok. Önce CI, sonra staging dağıtımı, sonra gerçek içerik incelemesi. 50 pilot ve Studio uçtan uca akışı, ilk 10 içerik denetimini tamamlamadan başarılı sayılmayacak.

## İkinci gerçek koşu ve sıkılaştırma

PR244 main d48cfadf, CI/preview 1011 test + typecheck/build başarılı; demo dağıtımı 38427613310 başarılı. Gerçek koşu38427918046 bounded 8 istekle 6 yeni taslak, sonra doğrulama yanıtı biçimi başarısız; pilot başarılı değil. İlk7 hatalı GLM taslağı REJECTED doğrulandı. Son GLM ikilisinde bir ek yanlış anahtar bulundu. Meta taslaklarında İngilizce sayı sözcükleri, altı basamakla sınırlı okuma soruları, programın bölünen sınırını aşan problem ve yakın tekrarlar bulundu; bunlar yayımlanmadı.

Sonraki düzeltme: yazar @cf/openai/gpt-oss-120b, bağımsız NVIDIA doğrulayıcı; resmi MEB sayfa447’deki 7–12 basamak okuma ve işlem operand sınırları açık rehberlik + deterministik kontrol. Önceki12 AI platform sorusunun sınırlı aday listesiyle yakın tekrar engeli; bu küresel anlamsal tekrar garantisi değildir. Doğrulayıcıya açık indeksler verilir, geçersiz şema yanıtı yine kabul edilmez. Bilinen toplam13 hatalı/tekrarlı taslak revision API ile reddedilecek; eski failed pilot işi iptal edilip yeni V2 cohort açılacak. Kota20/50 rezerveli; iade yok. İlk10 içerik denetimi ve insan/telif incelemesi hâlâ tamamlanmadı.

## V2 sahada ve kontrolün düzeltilmesi

PR245 main9cbbdef3, 1015 test geçti; demo38429878173 başarılı. V2 gerçek koşu38430174514 üç denemede0 taslak kaydetti; bütçe22/50. Toplam13 bilinen hatalı/tekrarlı taslak REJECTED; önceki failed iş iptal edildi. Mekanik son-eşitlik kontrolünün çok adımlı çözümlerde yanlış ret üretebileceği görüldü; GPT soru kalitesi hakkında bu sonuçtan hüküm kurulmaz. Karmaşık ifadenin son iki terimi artık bağımsız denklem diye alınmaz, cevap karşılaştırması yalnız tek basit eşitliğe daraltılır. Ret auditine gerçek taslaklar da eklenir; insan onayı yine yok. Yeni çağrı öncesi V3 profil zorunlu. V2 cohort aynı kalır; tükenen ilk iş mevcut cancel+replacement akışıyla geçmişi korunarak değiştirilebilir, rezervasyon iadesi yok.

## Gerçek içerik kanıtıyla V4 düzeltmesi

PR246 mainc0035919; 1016 test/typecheck/build ve demo38430846438 başarılı. Gerçek koşu38431181602 iki GPT taslağı üretti (q_58ebc86b: (3250−1845)/5=281, q_e46a6bcf:48×23+150=1254); iki soru REVIEW/RESTRICTED, bağımsız doğrulama geçti ve içerik hesapları kontrol edildi. Okuma işinin ret auditindeki12 basamaklı seçenekler doğruydu; seçeneklerin boşlukla birleştirilmesiyle komşu sayıların tek13+ basamaklı sayı gibi algılandığı görüldü. Seçenekler satırla ayrılır, NBSP/narrow-NBSP binlik gruplaması desteklenir; gerçek örnekle regresyon eklenir. Pilot10 tamamlandı denmiyor. Bütçe26/50; ikinci iş üç denemede tükenmiş, kayıt yok. Cohort aynı kalır, geçmiş ve rezervasyonlar silinmez; V4 profilinden sonra normal replacement ile devam.

## V5 bilimsel sayı dönüşümü ve kalanlı bölme

PR247 main3d317a48; 1017 test geçti. V4 koşu38432172464 dört taslak kaydetti ancak iki yeni okuma taslağı içerik olarak uygun değil: q_a7093e39 iki yüz bir bin ifadesini211.000 yaptı; q_0ffc29db geçersiz92.345.6780 biçimi ve iki haneli gruba ilk üç hane açıklaması kullandı. Bunlar V5 sürücüsünde REJECTED yapılacak; toplam15 ret. Önceki iki GPT problem taslağı bilimsel olarak geçerli ve REVIEW/RESTRICTED kalır. Bütçe30/50.

Doğrudan Türkçe kardinal çözümleyiciyle sayı sözcükleri hesaplanır, belirgin okuma/yazma soru tiplerinde doğru seçenek sayısal hedefle karşılaştırılır, yanlış bölük biçimi engellenir. Mekanik kontrol sonuçları artık ara eşitlikten cevap tahmin etmez; yalnız açık son cevap cümlesini karşılaştırır. En-dash eksi ve Euclidean bölüm/kalan kimliği desteklenir. NVIDIA düşük eforlu akıl yürütme açık,2500 token sınırı; üretici3000, en çok8 run/16 model isteği. İnsan onayı ve telif gate’i korunur. Reddedilen tamamlanmış işler iptal/silinmez; tek bounded9000+i replacement key kullanılır. Aynı cohort’un iki geçerli sorusu korunur; kalan8 için devam. İlk10 henüz tamamlanmış sayılmıyor.

## V6 üretim sözleşmesi

PR248 main2a811277; 1020 test/typecheck/build/demo başarılı. GerçekV5 koşu38434560210 başarısız: yalnız önceki iki geçerli taslak korundu, yeni okuma grubu kaydedilmedi. Sayı ayracı hataları, geçersiz sayı sözcük dizileri ve yakın tekrarlar artık gerçekten engellendi; bu kez kontrol hatası değil, üretim sözleşmesi sorunu. Toplam15 bilinen ret doğrulandı, bütçe32/50. İlkpilot MAT.5.1.1 yazarı yalnız tırnaklı Türkçe kardinalden 7–12 basamaklı tam sayıya dönüşüm üretir; tüm seçenekler saf ASCII rakamları, anlamlı farklı tam sayılar olur. Bozuk ayraç/sözcük dizisi çeldiricileri istenmez. Yanlış sayı anahtarı deterministik kontrolü ve bağımsız akıl yürütme korunur. Tükenen9001 replacement işi normalcancel ve tek19001 stable replacement ile yeniden ele alınır; sınırsız key/kota iadesi yok. İlk10 hâlâ tamamlandı denmiyor.

## 2026-10-14 — tek soruluk, şemalı üretim

Sabah doğrulaması: main 2a811277, staging32e98717; staging deploy38445381336 başarılı ancak gerçek pilot38445381314 OUTPUT_INVALID ile durdu. İki geçerli GPT taslağı korunuyor, 15 ret kayıtlı, bütçe34/50. PR249 testleri başarılı olduğu için main'e6534e3fe ile alındı. PR250/251 staging'deki son5yıl kaynak-kapsama çalışması korunur; bu işlem onu üretime taşımıyor.

YeniV7: provider JSON-schema sözleşmesi (staging flag), tek soruluk8 iş + önceki iki doğrulanmış taslak. Her çağrı en çok1 üretici/1 bağımsız doğrulayıcı; en çok8 run/16 model çağrısı. Başarısız işte otomatik üç tekrar veya sürekli yeni recovery key yok. Hatalı model çıktısının finishReason, kullanım ve en çok12000 karakter son-yanıt örneği OUTPUT_BLOCKED auditine kaydedilir. Hiçbir invalid çıktı banka yazılmaz. Önceki iki açık FAILED iş, yalnız bilinen id/kazanım ve sıfır üretim/üç deneme koşullarıyla normal API'den iptal edilir; kota iadesi/silme yok. Sonraki8 yeni rezervasyon başarılı olursa toplam42/50 olur. İlk10 henüz tamamlandı denmiyor.

Yerel çalışma bağlantısı geri geldi. İzole question-resume worktree; mevcut question-pilot değişiklikleri korunur. Yeni şema kabulü ve invalid-output audit regresyonları dahil57 odaklı test, typecheck ve diff-check geçti. Eski grade5 testinin learning_nodes grade değişikliği sonraki testlere taşınıyordu; seed artık grade7 bağlamını her testte yeniden kurar.
