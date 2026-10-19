# App Süper Admin branş kapsamı — 19 Ekim 2026

Hedef: https://app.anunex.com/question-team. Kullanıcı demo değil app Süper Admin istedi. Bu sürüm production main 0db2518e17e72e9ccb580261def752feb6681016 üzerine dar kapsamla hazırlanmıştır; staging dalı topluca merge edilmez.

Yeni salt okunur bölüm 2027–2028 için 77 program/tema sürümü ve 2916 bağlamlı kayıt beklentisini bu ortamın DB'sindeki gerçek kod/metin/ünite, yıl, ders ve sınıfla karşılaştırır. Onaylı soru sayımında aktif düğüm, doğru yıl/sınıf/branş, platform mülkiyeti ve kullanım hakkı filtreleri vardır. Demo sayıları production'a gösterilmez. İki kaynak sorunu ayrı gösterilir. Eğitim yılı seçeneğine 2027–2028 eklenmiştir.

Bu sürüm veri aktarmıyor, şema değiştirmiyor, kampanya başlatmıyor veya kotayı yenilemiyor. Üretim verisi henüz kontrol edilemedi: GitHub production ortamı yildizyayin hesabından deployment review istiyor. Salt okunur kontrol run 39228316312 bu kapıda bekliyor. Kontrol sonrası üretim veritabanına aktarılmamış kapsam ayrı, doğrulanmış bir aktarım olarak tamamlanmalıdır. Demo'daki 69 sürüm/2739 kayıt app'te var sayılmaz.

App-only işaretli commit, genel production workflow'unda tanıtım sitesi dağıtımını başlatmaz; sadece app dağıtımının tetikleyicisi çalışır. Her iki workflow production environment korumasını korur. Yeni yetki veya token eklenmez; mevcut production dağıtım akışı kullanılır. Yayından sonra domain health, korunan API ve yeni panel bundle'ı salt okunur olarak doğrulanır.

Yerel doğrulama: 207 test dosyası / 1072 test geçti; TypeScript ve production derlemesi geçti. Yeni testler rol/yıl izolasyonunu, resmî metin parmak izini, onaylı/hakları uygun soru sayımını ve gerçek ortam etiketini doğruluyor.
