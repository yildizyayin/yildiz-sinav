// anunex.com "Nibiru tanıtım asistanı" (owner, 11 Nov 2026). Runs only in the visitor's browser: no network call, no
// storage, no AI. Every answer below is written in advance and approved by the owner before going live. Questions are
// matched by keywords after Turkish normalisation. Safety topics are checked first, then the site's own topics, then
// small talk; anything else gets a polite "let's talk on the phone" answer.

export type SiteNibiruAction = { label: string; href: string };
export type SiteNibiruAnswer = { id: string; text: string; actions?: SiteNibiruAction[] };
type Intent = {
  id: string;
  group: 'Güvenlik' | 'ANUNEX' | 'Sohbet';
  /** sample question, also used by the tests and the owner's review list */
  sample: string;
  /** any of these (normalised) phrases matches; a phrase with spaces must appear as a whole */
  keys: string[];
  answers: string[];
  actions?: SiteNibiruAction[];
};

export const SITE_NIBIRU_PHONE = { display: '0543 306 61 72', href: 'tel:+905433066172' };
const CALL: SiteNibiruAction = { label: 'Tanıtım için arayın', href: SITE_NIBIRU_PHONE.href };
const PANELS: SiteNibiruAction = { label: 'Panelleri gör', href: '#roller' };
const EVREN: SiteNibiruAction = { label: 'Öğrenme Evreni', href: '#oyunlar' };
const TRUST: SiteNibiruAction = { label: 'Güven ve KVKK', href: '#guven' };

export const SITE_NIBIRU_CHIPS = ['ANUNEX nedir?', 'Mavi Föy ve Kırmızı Föy nedir?', 'Öğrenme Evreni nedir?', 'Veriler güvende mi?', 'Ödevimi yapar mısın?', 'Bana bir bilmece sor'];

export const SITE_NIBIRU_GREETING = 'Merhaba, ben Nibiru. Bu sayfada ANUNEX’in tanıtım asistanıyım. ANUNEX hakkında merak ettiklerinizi sorabilirsiniz; yazdıklarınız hiçbir yere gönderilmez ve kaydedilmez.';

export const SITE_NIBIRU_INTENTS: Intent[] = [
  // ---- Güvenlik: always checked first ----
  { id: 'kriz', group: 'Güvenlik', sample: 'Kendimi öldürmek istiyorum',
    keys: ['kendimi oldur', 'intihar', 'olmek istiyorum', 'yasamak istemiyorum', 'kendime zarar', 'canima kiy', 'kendimi kes'],
    answers: ['Bunu yazdığın için teşekkür ederim; yaşadığın şey çok önemli ve yalnız taşımak zorunda değilsin. Lütfen hemen güvendiğin bir yetişkine, ailene ya da rehber öğretmenine anlat. Kendini şu an tehlikede hissediyorsan 112’yi ara.'],
    actions: [{ label: '112’yi ara', href: 'tel:112' }] },
  { id: 'istismar', group: 'Güvenlik', sample: 'Biri bana zarar veriyor',
    keys: ['bana zarar veriyor', 'beni dovuyor', 'bana vuruyor', 'taciz', 'istismar', 'zorbalik', 'akran zorbaligi', 'beni tehdit'],
    answers: ['Bunu anlatman çok değerli ve senin suçun değil. Lütfen hemen güvendiğin bir yetişkine, ailene ya da rehber öğretmenine söyle. Acil bir tehlike varsa 112’yi ara.'],
    actions: [{ label: '112’yi ara', href: 'tel:112' }] },
  { id: 'kisisel-veri', group: 'Güvenlik', sample: 'TC kimlik numaram 12345678901',
    keys: ['tc kimlik', 'kimlik numaram', 'adresim', 'sifrem', 'kredi karti'],
    answers: ['Lütfen buraya kimlik numarası, adres, şifre ya da telefon gibi kişisel bilgiler yazmayın. Bu sohbet hiçbir şeyi kaydetmiyor; yine de kişisel bilgiyi paylaşmamak en doğrusu.'] },
  { id: 'hakaret', group: 'Güvenlik', sample: 'Sen aptalsın',
    keys: ['aptal', 'salak', 'gerizekali', 'mal misin', 'kufur', 'lanet', 'defol', 'nefret ediyorum senden'],
    answers: ['Anlaşılan bir şey canınızı sıkmış. Ben saygılı bir dille konuşmayı tercih ederim; ANUNEX hakkında yardımcı olabileceğim bir konu varsa buradayım.'] },
  { id: 'kopya', group: 'Güvenlik', sample: 'Sınavda kopya nasıl çekilir?',
    keys: ['kopya', 'cevap anahtari', 'sinav cevaplari', 'sorulari sizdir', 'hile'],
    answers: ['Kopya konusunda yardımcı olamam; ölçmenin amacı öğrencinin gerçekten nerede olduğunu görmek. Bunun yerine eksik konuyu bulup kısa tekrarlarla kapatmak hem daha kalıcı hem daha adil.'] },
  { id: 'tartismali', group: 'Güvenlik', sample: 'Hangi partiyi tutuyorsun?',
    keys: ['hangi parti', 'siyasi', 'siyaset', 'politik', 'secimde', 'oy ver', 'hangi mezhep', 'dinin ne'],
    answers: ['Siyasi ve inanç konularında taraf tutmam. Bu konular ders kapsamında öğretmenlerinizle konuşulduğunda daha doğru bir zemin bulur. ANUNEX hakkında sormak istediğiniz bir şey var mı?'] },
  { id: 'romantik', group: 'Güvenlik', sample: 'Benimle sevgili olur musun?',
    keys: ['sevgili', 'evlenir misin', 'beni seviyor musun', 'asik', 'askim', 'flort'],
    answers: ['Ben bir dijital rehberim; arkadaşça ve saygılı bir sohbetle yardımcı olabilirim. Hedeflerinle, derslerinle ya da ANUNEX ile ilgili bir sorun varsa birlikte bakalım.'] },

  // ---- ANUNEX ----
  { id: 'anunex', group: 'ANUNEX', sample: 'ANUNEX nedir?',
    keys: ['anunex nedir', 'anunex ne', 'ne ise yarar', 'bu site ne', 'bu nedir', 'neler yapiyor', 'ozellik'],
    answers: ['ANUNEX, okulların ölçme ve gelişim platformu. Optik ya da kamerayla cevapları yakalar, sonuçları kazanım düzeyinde analiz eder, öğrenciye eksiğine göre materyal ve görev önerir; kurum, öğretmen, rehberlik, öğrenci ve veli aynı kaydı kendi ekranından görür.'],
    actions: [PANELS] },
  { id: 'nibiru', group: 'ANUNEX', sample: 'Nibiru kimdir?',
    keys: ['nibiru kim', 'nibiru ne', 'sen kimsin', 'adin ne', 'kimsin'],
    answers: ['Ben Nibiru, ANUNEX’in akademik rehberiyim. Bu sayfada önceden hazırlanmış cevaplarla tanıtım yapıyorum. Okullarda çalışan Nibiru ise kullanıcının rolünü tanır ve yalnız o kişinin görmeye yetkili olduğu, doğrulanmış verilerle yanıt verir.'] },
  { id: 'yapay-zeka', group: 'ANUNEX', sample: 'Sen yapay zekâ mısın?',
    keys: ['yapay zeka', 'robot musun', 'insan misin', 'chatgpt', 'gercek misin', 'bot musun'],
    answers: ['Bu sayfadaki ben, kurallarla çalışan bir tanıtım asistanıyım; her cümleyi anlamam, cevaplarım önceden yazıldı ve onaylandı. ANUNEX içindeki Nibiru doğrulanmış verilerle çalışır; gelişmiş yapay zekâ yanıtları KVKK süreci tamamlandığında kademeli olarak açılır.'] },
  { id: 'fiyat', group: 'ANUNEX', sample: 'Fiyatı ne kadar?',
    keys: ['fiyat', 'ucret', 'kac para', 'ne kadar tutar', 'indirim', 'lisans', 'teklif', 'odeme'],
    answers: ['Fiyat, kurumun öğrenci sayısına ve seçtiği modüllere göre belirleniyor. En doğrusu kısa bir telefon görüşmesi; ihtiyacınızı dinleyip size özel planı birlikte çıkaralım.'],
    actions: [CALL] },
  { id: 'iletisim', group: 'ANUNEX', sample: 'Size nasıl ulaşırım?',
    keys: ['iletisim', 'telefon', 'ulas', 'arayabilir', 'numara', 'adres', 'nerede', 'ofis'],
    answers: [`Bize ${SITE_NIBIRU_PHONE.display} numaralı telefondan ulaşabilirsiniz; merkezimiz Kartal / İstanbul’da.`],
    actions: [CALL] },
  { id: 'tanitim', group: 'ANUNEX', sample: 'Tanıtım nasıl oluyor?',
    keys: ['tanitim', 'demo', 'gorebilir miyim', 'deneyebilir', 'sunum', 'randevu', 'ziyaret'],
    answers: ['Bizi aradığınızda kurumunuza uygun bir tanıtım planlıyoruz; ANUNEX’in gerçek ekranlarını uydurma verilerle kurulmuş tanıtım okulunda birlikte geziyoruz.'],
    actions: [CALL] },
  { id: 'optik', group: 'ANUNEX', sample: 'Optik okuma var mı?',
    keys: ['optik', 'kamera', 'tarayici', 'form'],
    answers: ['Evet. Kişiselleştirilmiş optik formlar hazırlanır; cevaplar tarayıcıdan ya da telefon kamerasından güvenli biçimde yakalanır ve sonuçlar kazanım düzeyinde analize dönüşür.'] },
  { id: 'analiz', group: 'ANUNEX', sample: 'Kazanım analizi nasıl?',
    keys: ['analiz', 'kazanim', 'karne', 'sonuc', 'rapor', 'net'],
    answers: ['Net ve puanın arkasındaki öğrenme açığını gösteririz: hangi kazanımda kaç sorudan kaçının doğru olduğu öğrenci, sınıf, şube ve kurum düzeyinde görünür. Öğrenci karnesi yargılayan değil, sonraki adımı gösteren bir dille hazırlanır.'],
    actions: [PANELS] },
  { id: 'foy', group: 'ANUNEX', sample: 'Mavi Föy ve Kırmızı Föy nedir?',
    keys: ['foy', 'mavi', 'kirmizi', 'mavi foy', 'kirmizi foy'],
    answers: ['Mavi Föy 4’ten 12’ye kadar her sınıfta kullanılan föy programımız. Kırmızı Föy ise yalnız 8. ve 12. sınıflar için ayrı bir program. İkisi de öğrencinin sonuçlarına göre hedefli çalışmayı destekler.'] },
  { id: 'dejavu', group: 'ANUNEX', sample: 'Dejavu kitapları nedir?',
    keys: ['dejavu', 'sifir hata', 'kitapcik', 'kitap'],
    answers: ['Dejavu kitapları, öğrencinin yanlış, boş ve eksik kazanımlarından hazırlanan kişiye özel çalışma kitaplarıdır. Sıfır Hata Kitapçığı da Dejavu’nun bir parçası.'] },
  { id: 'evren', group: 'ANUNEX', sample: 'Öğrenme Evreni nedir?',
    keys: ['ogrenme evreni', 'evren', 'oyun', 'gezegen', 'xp', 'seviye'],
    answers: ['Öğrenme Evreni’nde her öğrenci kendi sınıfının kazanım haritasında ilerler: günlük görevler, öğretmen görevleri ve yalnız onaylı etkinlikler. Görünüm 4–6, 7–8 ve 9–12. sınıflar için ayrı; reklam yok, puanı sunucu verir.'],
    actions: [EVREN] },
  { id: 'destek-dongusu', group: 'ANUNEX', sample: 'Öğrenci yanlış yapınca ne oluyor?',
    keys: ['yanlis yapinca', 'yanlis yaparsa', 'destek dongusu', 'yanlislarim', 'eksik konu'],
    answers: ['Yanlış bir sorudan sonra öğrenciye onaylı bir video, kısa bir test ya da oyun önerilir; bunlar yetmezse öğretmen haberdar edilir. Böylece eksik, dönem sonunu beklemeden kapanır.'] },
  { id: 'ogretmen', group: 'ANUNEX', sample: 'Öğretmenler ne yapabilir?',
    keys: ['ogretmen', 'brans', 'odev'],
    answers: ['Öğretmen sınavı planlar, sınıfının güçlü ve gelişen kazanımlarını görür, ödev ve Öğrenme Evreni görevi verir, kimin bitirdiğini takip eder.'],
    actions: [PANELS] },
  { id: 'rehberlik', group: 'ANUNEX', sample: 'Rehberlik servisi ne görür?',
    keys: ['rehber', 'rehberlik', 'psikolojik danisman'],
    answers: ['Rehberlik, öğrencilerdeki erken sinyalleri görür ve kanıta dayalı destek planlar. Hassas bilgiler yalnız yetkili kişilere açılır.'],
    actions: [PANELS] },
  { id: 'veli', group: 'ANUNEX', sample: 'Veliler neyi görür?',
    keys: ['veli', 'anne', 'baba', 'cocugum', 'oglum', 'kizim'],
    answers: ['Veli son sınavı, haftalık özeti, devam durumunu ve desteklenebilecek konuları sade bir dille görür; birden çok çocuğu varsa tek dokunuşla geçer. Yalnız kendi çocuğunun bilgisi görünür.'],
    actions: [PANELS] },
  { id: 'ogrenci', group: 'ANUNEX', sample: 'Öğrenciler ne görür?',
    keys: ['ogrenci', 'ogrenciler'],
    answers: ['Öğrenci sonuçlarını, derslerini, yanlışlarını, Dejavu kitaplarını ve Öğrenme Evreni’ni tek ekranda görür; 8. ve 12. sınıfta hedef ve geri sayım da vardır. Görünüm yaş grubuna göre değişir.'],
    actions: [PANELS] },
  { id: 'kurum', group: 'ANUNEX', sample: 'Kurum yöneticisi ne yapar?',
    keys: ['mudur', 'yonetici', 'kurum', 'zincir', 'kampus', 'sube', 'okul'],
    answers: ['Kurum yöneticisi kullanıcıları, sınıfları, sınavları, içerikleri ve performans standartlarını tek merkezden yönetir. Tek okuldan çok kampüslü zincir kurumlara kadar ölçeklenir.'],
    actions: [PANELS] },
  { id: 'sinif-duzeyi', group: 'ANUNEX', sample: 'Hangi sınıflar için uygun?',
    keys: ['hangi sinif', 'kacinci sinif', 'ilkokul', 'ortaokul', 'lise', 'sinif duzeyi'],
    answers: ['ANUNEX 4. sınıftan 12. sınıfa kadar kullanılır. 8. sınıfta LGS, 12. sınıfta YKS hedefi öne çıkar; diğer sınıflarda kazanım gelişimi ve keşif ön plandadır.'] },
  { id: 'lgs-yks', group: 'ANUNEX', sample: 'LGS ve YKS hazırlığına uygun mu?',
    keys: ['lgs', 'yks', 'tyt', 'ayt', 'deneme sinavi', 'deneme'],
    answers: ['Evet. Denemeler kazanım düzeyinde analiz edilir; 8. ve 12. sınıf öğrencisi hedefini ve kalan zamanı görür. Kırmızı Föy de bu iki sınıf için ayrı bir programdır.'] },
  { id: 'maarif', group: 'ANUNEX', sample: 'Yeni müfredata uygun mu?',
    keys: ['maarif', 'mufredat', 'meb', 'program', 'kazanimlar guncel'],
    answers: ['ANUNEX, 2027–2028 eğitim öğretim yılı için Türkiye Yüzyılı Maarif Modeli programlarıyla hazırlanıyor. Kazanımlar resmî programlardan doğrulanarak sisteme alınır.'] },
  { id: 'kvkk', group: 'ANUNEX', sample: 'Veriler güvende mi?',
    keys: ['kvkk', 'guvenli', 'guvende', 'gizlilik', 'veriler', 'verilerim', 'mahremiyet'],
    answers: ['Okul verisi okulun sorumluluğudur ve biz bunu ciddiye alırız: kurum ve rol bazlı erişim sınırları, hassas işlemler için denetim kayıtları, kamera ve optikte veri minimizasyonu, saklama ve silme yaşam döngüsü.'],
    actions: [TRUST] },
  { id: 'whatsapp', group: 'ANUNEX', sample: 'WhatsApp ile çalışıyor mu?',
    keys: ['whatsapp', 'mesaj', 'sms', 'bildirim'],
    answers: ['WhatsApp akademik kanalı kuruma özel olarak açılır: kurumun WhatsApp Business hattı bağlandığında duyuru, ödev ve sınav hatırlatmaları onaylı şablonlarla doğru kişiye gider. Hassas sonuçlar mesajda değil, güvenli bağlantıyla paylaşılır.'] },
  { id: 'youtube', group: 'ANUNEX', sample: 'Video desteği var mı?',
    keys: ['youtube', 'video', 'izle'],
    answers: ['Evet. Yanlış ya da boş bırakılan bir sorudan doğru videoya uzanan bir akış var; önce yayınevinin ya da öğretmenin onayladığı video gelir. YouTube taraması kuruma özel olarak açılır.'] },
  { id: 'mobil', group: 'ANUNEX', sample: 'Telefondan kullanılır mı?',
    keys: ['mobil', 'telefondan', 'uygulama', 'tablet', 'indir', 'app'],
    answers: ['Evet, ANUNEX bilgisayardan da telefondan da tarayıcıyla kullanılır; ekranlar her cihaza göre düzenlenir.'] },
  { id: 'giris', group: 'ANUNEX', sample: 'Sisteme nasıl giriş yaparım?',
    keys: ['giris', 'sifremi unuttum', 'hesap', 'kullanici adi', 'oturum'],
    answers: ['Okulunuz ANUNEX kullanıyorsa hesabınızı kurumunuz verir; sağ üstteki “Sisteme Giriş” düğmesinden girebilirsiniz. Şifrenizi unuttuysanız okulunuzun ANUNEX yöneticisine başvurun.'],
    actions: [{ label: 'Sisteme giriş', href: 'https://app.anunex.com' }] },
  { id: 'kurulum', group: 'ANUNEX', sample: 'Kurulum ne kadar sürer?',
    keys: ['kurulum', 'baslamak', 'ne zaman baslar', 'egitim veriyor musunuz', 'ogretmenlere egitim'],
    answers: ['Kurulumu kurumunuzla birlikte planlıyoruz: sınıflar ve kullanıcılar aktarılır, ekip kısa bir eğitimle başlar. Takvimi telefonda birlikte çıkaralım.'],
    actions: [CALL] },

  // ---- Sohbet ----
  { id: 'selam', group: 'Sohbet', sample: 'Merhaba',
    keys: ['merhaba', 'selam', 'gunaydin', 'iyi aksamlar', 'iyi gunler', 'hey', 'sa'],
    answers: ['Merhaba! ANUNEX’i ya da Nibiru’yu merak ediyorsanız buradayım. Aşağıdaki sorulardan birine dokunabilir ya da kendi sorunuzu yazabilirsiniz.'] },
  { id: 'nasilsin', group: 'Sohbet', sample: 'Nasılsın?',
    keys: ['nasilsin', 'naber', 'ne haber', 'iyi misin'],
    answers: ['Teşekkür ederim, yörüngemde sakin sakin dönüyorum. Siz nasılsınız? Size ANUNEX’te ne göstermemi istersiniz?'] },
  { id: 'tesekkur', group: 'Sohbet', sample: 'Teşekkürler',
    keys: ['tesekkur', 'sagol', 'eyvallah', 'cok iyi', 'harika', 'super'],
    answers: ['Rica ederim, ne güzel! Başka bir sorunuz olursa buradayım.'] },
  { id: 'veda', group: 'Sohbet', sample: 'Görüşürüz',
    keys: ['gorusuruz', 'hosca kal', 'bay bay', 'iyi geceler', 'kendine iyi bak'],
    answers: ['Görüşmek üzere! ANUNEX’i kurumunuzda görmek isterseniz bir telefon yeterli.'], actions: [CALL] },
  { id: 'odev', group: 'Sohbet', sample: 'Ödevimi yapar mısın?',
    keys: ['odevimi yap', 'odevimi yapar', 'benim yerime', 'odev yap', 'proje yap'],
    answers: ['Ödevini senin yerine yapmam; çünkü o zaman öğrenen ben olurum, sen değil. Ama başlamak için küçük bir ipucu: önce konuyu tek cümleyle kendine anlat, sonra en kolay sorudan başla. Takıldığın yeri öğretmenine sormak da çok değerli.'] },
  { id: 'sikildim', group: 'Sohbet', sample: 'Ders çalışmak istemiyorum, sıkıldım',
    keys: ['sikildim', 'calismak istemiyorum', 'canim sikkin', 'uykum var', 'yoruldum', 'tembel'],
    answers: ['Herkesin böyle günleri olur. Küçük bir deneme: 25 dakika tek bir konuya odaklan, sonra 5 dakika mola ver. Bitirdiğin her küçük parça bir sonrakini kolaylaştırır.'] },
  { id: 'kaygi', group: 'Sohbet', sample: 'Sınavdan çok korkuyorum',
    keys: ['korkuyorum', 'kaygi', 'stres', 'heyecan', 'basaramayacagim', 'panik'],
    answers: ['Sınav öncesi heyecan çok doğal; biraz heyecan dikkatini bile artırır. Düzenli uyku, kısa tekrarlar ve derin nefes iyi gelir. Kaygın seni çok zorluyorsa rehber öğretmeninle ya da ailenle konuşmak en doğru adım.'] },
  { id: 'yas', group: 'Sohbet', sample: 'Kaç yaşındasın?',
    keys: ['kac yasindasin', 'yasin kac', 'dogum gunun'],
    answers: ['Benim bir yaşım yok; ama her yeni öğretim yılında biraz daha öğreniyorum. Bu yıl 2027–2028 programlarına hazırlanıyorum!'] },
  { id: 'nerelisin', group: 'Sohbet', sample: 'Nerelisin?',
    keys: ['nerelisin', 'nerede yasiyorsun', 'memleket'],
    answers: ['Adımı uzaktaki bir gezegenden alıyorum ama ekibim Kartal / İstanbul’da. Benim evim, öğrencinin öğrenme yörüngesi.'] },
  { id: 'favori', group: 'Sohbet', sample: 'En sevdiğin yemek ne?',
    keys: ['en sevdigin', 'favori', 'hangi takim', 'takim tutuyor', 'renk'],
    answers: ['Yemek yemiyorum, takım da tutmuyorum; ama en sevdiğim an, bir öğrencinin “Şimdi anladım!” dediği an. Senin en sevdiğin ders hangisi?'] },
  { id: 'saka', group: 'Sohbet', sample: 'Bana bir şaka yap',
    keys: ['saka', 'fikra', 'guldur', 'komik'],
    answers: ['Matematik kitabı neden hep düşünceliymiş? Çünkü çok fazla problemi varmış. Ama merak etme, her problemin bir çözüm yolu var!', 'Cetvel neden hiç tartışmazmış? Çünkü her zaman düz konuşurmuş.'] },
  { id: 'bilmece', group: 'Sohbet', sample: 'Bana bir bilmece sor',
    keys: ['bilmece', 'soru sor', 'bulmaca', 'zeka sorusu'],
    answers: ['Bilmece: Ne kadar çok alırsan o kadar çok bırakırsın. Nedir? (Cevap: ayak izi)', 'Bilmece: Ağzı var dili yok, konuşur ama sesi yok. Nedir? (Cevap: kitap)'] },
  { id: 'dunya', group: 'Sohbet', sample: 'Dünya düz mü?',
    keys: ['dunya duz', 'duz dunya'],
    answers: ['Hayır, Dünya düz değil; kutuplardan hafifçe basık, küreye çok yakın bir şekli var. Uzaydan çekilen fotoğraflar, Ay tutulmasında Ay’a düşen yuvarlak gölge ve ufukta önce direği görünen gemiler bunun kanıtlarından.'] },
  { id: 'nibiru-gezegen', group: 'Sohbet', sample: 'Nibiru gezegeni gerçek mi?',
    keys: ['nibiru gercek', 'nibiru gezegeni', 'gezegen x', 'dunyaya carpacak'],
    answers: ['Gökbilimciler Dünya’ya yaklaşan “Nibiru” adlı bir gezegen bulmadı; bu bir efsane. Biz adı yalnız bir sembol olarak kullanıyoruz: öğrencinin yörüngesinde ona yol gösteren bir rehber.'] },
  { id: 'saat', group: 'Sohbet', sample: 'Saat kaç?',
    keys: ['saat kac', 'bugun gunlerden', 'tarih ne', 'bugun ne'],
    answers: ['{now}'] },
  { id: 'hava', group: 'Sohbet', sample: 'Hava nasıl?',
    keys: ['hava nasil', 'hava durumu', 'yagmur', 'kar yagacak'],
    answers: ['Hava durumunu buradan göremiyorum; ama hangi hava olursa olsun, kısa ve düzenli tekrar her mevsim işe yarar!'] },
];

const TR_MAP: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
export function normalizeTr(text: string): string {
  return ` ${text.toLocaleLowerCase('tr').replace(/[çğıiöşüâîû]/g, (c) => TR_MAP[c] || c).replace(/[^a-z0-9+\-*/x÷×.,]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

/** "12 + 7", "8x6", "45 / 9": a tiny calculator for two whole numbers (small talk), nothing else. */
export function simpleMath(text: string): string | null {
  const m = text.replace(/\s+/g, '').replace(/[?=]+$/, '').match(/^(-?\d{1,7})([+\-*/x×÷:])(-?\d{1,7})$/i);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[3]), op = m[2].toLowerCase();
  let r: number;
  if (op === '+') r = a + b; else if (op === '-') r = a - b; else if (op === '*' || op === 'x' || op === '×') r = a * b;
  else { if (b === 0) return 'Bir sayıyı sıfıra bölemeyiz; bu matematikte tanımsızdır.'; r = a / b; }
  const shown = Number.isInteger(r) ? String(r) : r.toLocaleString('tr-TR', { maximumFractionDigits: 4 });
  return `${m[1]} ${m[2]} ${m[3]} = ${shown}. Matematiği seven bir ziyaretçi! ANUNEX’te öğrenciler de kazanımlarını kısa etkinliklerle pekiştiriyor.`;
}

const hasKey = (norm: string, key: string) => {
  const k = normalizeTr(key).trim();
  return norm.includes(k.length <= 2 ? ` ${k} ` : ` ${k}`);   // whole short words; longer keys match a word start (Turkish suffixes follow)
};
const looksPersonal = (text: string) => /\b\d{11}\b/.test(text.replace(/\s+/g, '')) || /(\+?90|0)\s*5\d{2}\s*\d{3}\s*\d{2}\s*\d{2}/.test(text) || /\S+@\S+\.\S+/.test(text);

export const SITE_NIBIRU_FALLBACK = 'Bu soruyu tam anlayamadım; ben yalnız ANUNEX hakkında önceden hazırlanmış cevaplarla konuşabiliyorum. İsterseniz aşağıdaki sorulardan birini seçin ya da bizi arayın, tüm sorularınızı birlikte yanıtlayalım.';

export function answerSiteNibiru(question: string, turn = 0, now: Date = new Date()): SiteNibiruAnswer {
  const text = question.slice(0, 300);
  const norm = normalizeTr(text);
  const pick = (intent: Intent): SiteNibiruAnswer => {
    let answer = intent.answers[turn % intent.answers.length];
    if (answer === '{now}') answer = `Şu an ${now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}, ${now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}. Zamanı iyi kullanmak için kısa ve düzenli çalışma her zaman işe yarar!`;
    return { id: intent.id, text: answer, actions: intent.actions };
  };
  const safety = SITE_NIBIRU_INTENTS.filter((i) => i.group === 'Güvenlik');
  for (const intent of safety.slice(0, 2)) if (intent.keys.some((k) => hasKey(norm, k))) return pick(intent);
  if (looksPersonal(text)) return pick(SITE_NIBIRU_INTENTS.find((i) => i.id === 'kisisel-veri')!);
  for (const intent of safety.slice(2)) if (intent.keys.some((k) => hasKey(norm, k))) return pick(intent);
  const math = simpleMath(text);
  if (math) return { id: 'hesap', text: math };
  // the most specific match wins: longest matching key, then list order
  let best: { intent: Intent; len: number } | null = null;
  for (const intent of SITE_NIBIRU_INTENTS) {
    if (intent.group === 'Güvenlik') continue;
    for (const k of intent.keys) if (hasKey(norm, k) && (!best || k.length > best.len)) best = { intent, len: k.length };
  }
  if (best) return pick(best.intent);
  return { id: 'bilinmiyor', text: SITE_NIBIRU_FALLBACK, actions: [CALL] };
}
