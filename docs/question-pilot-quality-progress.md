# Soru havuzu — güncel durum ve devam kaydı

## Önce bu bölümü okuyun — 2026-10-14 07:15 UTC

**İlk10 hedefi tamamlanmadı.** Güncel cohort:9 gerçek kayıt,8 REVIEW,1 REJECTED,0 APPROVED/yayın. Tüm kayıtlar RESTRICTED. Son kontrol38527117768 normal review API ile bilinen anlamsal tekrarı reddetti;0 yeni model çağrısı yaptı. Önceki15 bilinen ret ayrı geçmiş kayıtlarında korunur.9 kaydı9 uygun/yayıma hazır soru diye raporlamayın.

- Gerçek D1 bütçesi:43/50 rezervasyon,7 kalan. Hatalı/iptal işlerin kotası iade edilmedi. Yeni recovery key zinciri, attempt sıfırlama veya otomatik bütçe artışı yok.
- Kanıt ve tam soru içerikleri: `data/question-pilot-review-checkpoint-20261014.json`. [Son çalışma](https://github.com/yildizyayin/yildiz-sinav/actions/runs/38527117768), [artifact](https://github.com/yildizyayin/yildiz-sinav/actions/runs/38527117768/artifacts/11876131883). Çalışmanın failure sonucu beklenendir: ilk10 kabul koşulu sağlanmadı; uygulama CI arızası değildir.
- Doğrulanmış MEB kapsamı yalnız5.sınıf Matematik MAT.5.1.1/2 ve resmi sayfa447'dir; tüm sınıfların programı tamamlandı denmez.
- Main: PR254/255 düzeltmeleri ffd4e6d8 /3faabaca. Sayı/bölme kontrolleri, tamCI/typecheck/build ve gerçek provider probe geçti. Demo Worker dağıtımı38525737724 başarılı. Otomatik üretim cron'u kapalı ve insan/telif onayı zorunlu kalır.
- Kuyruk engeli: envanter38525527633,8 geçici kuyruk+2 test Worker temizliği38525737736; yeni always cleanup gerçek38525870751 ve38526402419 testlerinde geçti. Canlı D1/R2/uygulama kuyrukları silinmedi.

### Kalan teknik iş sırası

1. İçerik/çözüm düzenleme API ve arayüzü ekleyin: mevcut PATCH yalnız metadata değiştiriyor. Beklenen review_revision zorunlu olsun; AI kökeni/kaynak geçmişi korunsun; değişiklik yeni incelemeye dönsün, onay/telif geçişi otomatik yapılmasın. Kullanılmış sorular için geçmiş değerlendirme içeriğini koruyan sürümleme gerekir.
2. JSON bulgularındaki editoryal kusurları taslak revizyonları olarak düzeltin. Özellikle q_4b5f15e1 içindeki Baklagiller/cupcake, q_bb920a81 D çeldiricisinin yanlış rakam açıklaması ve q_9e4d8bd2 D bölük açıklaması. Hiçbiri insan onaylı sayılmasın.
3. Yeni üretimden önce görev çeşitliliğini planlayın: mevcut word-to-number ve çıkarma/paylaştırma şablonları aynı düşünme yolunu tekrarlıyor. Otomatik nearRepeatedStem ve bağımsız model, q_37062d41 ile q_c3ff23af anlamsal tekrarını kaçırdı. Kontroller gevşetilmesin; kaynak kapsamındaki farklı düşünme görevleri ve daha güçlü anlamsal aday incelemesi tasarlansın.
4. Ardından kalan7 rezervasyondan, yeni sınırlandırılmış ve açık cohort planıyla eksik özgün taslakları tamamlayın. qgj_51ac7e47-5cb1-46dc-8d2a-8d31ef0269e3 FAILED/attempt3 kalır; kör rerun yeni soru üretmez. Tek izinli önceki key105 yedeği kullanıldı; ikinci yedek zinciri yok.
5. İlk10 içerik kontrolü, gerçek insan/telif incelemesi ve Studio uçtan uca akışı tamamlanmadan50 pilot/300bin ölçeğine geçmeyin. Mevcut kalan7 rezervasyonla50 uygun soru hedefi sağlanmış sayılamaz; bütçe sınırı açıkça yeniden planlanmalı, geçmiş korunmalı.

## Önceki çalışmaların kronolojik kaydı

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

### V7 ilk gerçek sonuç ve tam-kutu bölümü

PR252 main569c163a, demo38523192142 başarılı. Gerçek koşu38523452277: ilk üç tek-soruluk iş başarıyla kaydedildi; önceki iki ile hedefte5 gerçek taslak var. Yeni anahtarlar ve hesaplar içerik olarak kontrol edildi:645238791205,742356891,90. Dördüncü işte3.565÷48=74 tam kutu, kalan13 açıklaması geçerliydi; mekanik denetçi yalnız tam bölüm ifadesini tanıdığı için yanlış ret verdi. Tam+birim söz dizimi artık bölümün aşağı yuvarlanmış tam sayısını ve varsa120 karakter içindeki kalan kimliğini doğrular. Yanlış75 kutu ve yanlış12 kalan örnekleri reddedilir. Bu bir doğrulama düzeltmesidir; cevap kontrolü kaldırılmadı.

58 odaklı test, tip kontrolü ve script sözdizimi geçti. Script hata sonrası güncel DB durumunu kaydeder (REQUESTED önbelleği yerine FAILED/attemptCount/errorCode). Canlı bütçe38/50; mevcut dördüncü iş bir denemede FAILED, aynıkey ile devam edilebilir, yeni rezervasyon gerekmez. Yeni bir job/key veya kota sıfırlama yapılmayacak. İlk10 henüz tamamlanmadı; beş sorunun tümü REVIEW/RESTRICTED.

### Altı taslak ve seçenek uzunluğu sözleşmesi

PR253 main5d8a9378; test/dağıtım38523970595 başarılı. Koşu38524261451 toplam6 gerçek taslağa ulaştı; sonraki işte4832456070980 biçiminde13 basamaklı çeldirici engellendi. Bu iş bir denemede FAILED; bütçe39/50. Yeni düzenleme okuma pilotu seçeneklerine provider şemasında7–12 ASCII rakam pattern'i uygular ve provider bunu ihlal etse de sunucuda aynı kuralı doğrular; başarısız yanıt bankaya/bağımsız doğrulayıcıya gönderilmez. Diğer ders/sınıf seçenek şemaları değişmez. Canlı örnekten sınır ve ihlal regresyonları dahil60 odaklı test/typecheck/diff-check geçti. Aynı sekiz iş anahtarı ve mevcut altı taslak korunacak; kota sıfırlanmaz.

### Yedi taslak ve editoryal inceleme bulgusu

38524261451 ikinci deneme:7 gerçek REVIEW/RESTRICTED taslak,0 yayın, bütçe40/50. Okuma seçeneği sınırı çalıştı; yeni442567893 anahtarı doğru. Sonraki tiyatro sorusu625÷12=52 (52×12=624,1 koltuk artar) biçiminde geçerli tam grup açıklaması verdi; mekanik kontrol bunu hatalı reddetti. Dar düzeltme ancak parantezde bölüm, bölen, çarpım ve kalan kimliği birbiriyle tutarlı ise kabul eder. Yanlış bölüm, çarpım ve kalan regresyonları dahil61 odaklı test + typecheck geçti. Aynı başarısız job qgj_c023359e-47ad-47a2-8d55-a0a83578d480 yeniden kullanılmalı; yeni key/kota iadesi yok.

Önemli içerik bulgusu: q_4b5f15e1-7921-41f2-a16d-54e69995981b çözümünde bağlam dışı “Baklagiller” sözcüğü ve Türkçe olmayan cupcake ifadesi var. Hesap435÷15=29 doğru olsa da editoryal olarak onaya uygun değildir. Bu soru REVIEW/RESTRICTED kalır; revision korumalı yeniden inceleme gerekir. Kod taramasında mevcut PATCH yalnız metadata düzenliyor; metin/çözüm düzenleme arayüzü/API eksik ve bu kusur kapatılmadan onaya gidilmemeli. İnsan onayı veya telif uygunluğu verilmedi. Okuma sorularında aynı word-to-number şablonunun yinelenmesi de insan tarafından pedagojik çeşitlilik açısından incelenmeli;7 kayıt,7 yayıma hazır soru anlamına gelmez.

Ayrı test altyapısı engeli: PR254 isolation probe100 kuyruk sınırına takıldı. Salt-okunur envanter38525527633 ile kapanmış PR252/253'e ait8 exact isim/ID ve yalnız kendi test Worker bağımlılıkları doğrulandı. Dondurulmuş planla38525737736 cleanup8 geçici kuyruğu ve2 test Worker'ını temizledi; canlı uygulama kuyrukları/D1/R2 verileri kapsam dışı. Yeni cleanup kodu isim/ID ve eksiksiz bağımlılık sayımlarını doğrular, beklenmeyen bağlantıda durur. Probe işlerine always cleanup ve aynıPR için seri çalışma eklenir; otomatik iptal yarışından kaçınılır.

### Sınırlandırılmış son devam kaydı

38524261451 üçüncü/dördüncü workflow denemeleri: hedef hâlâ7 taslak ve0 yayın, bütçe40/50. c023359e işi son denemede yalnız sayıları değiştirilmiş defter/paylaştırma problemi üretti; NEAR_REPEATED_TASK doğru şekilde engelledi. İş3 denemede tükendi. Tek dondurulmuş yedek key(105) yalnız exact c023359e / aynıCV / grade5 / generated0 / attempts3 koşullarıyla normal cancel sonrası kullanılacak. Sonsuz replacement zinciri yok; diğer iki planlı iş ile üst rezervasyon43/50, iade/sıfırlama yok.

PR254 ffd4e6d8 ile main'e alındı; CI193 dosya + tip/build ve canlı provider probe başarılı. PR255 cleanup gerçek probe38525870751'de4 kendi geçici kuyruğunu temizledi; önceki frozen cleanup38525737736 ise8 eski kuyruğu temizledi. Demo dağıtımı38525737724 başarılı. Güncel üretim durumu ayrıca son artifact'ten doğrulanmalı; bu kayıttaki7 sayı ile ilk10 tamamlandı denmemeli.
