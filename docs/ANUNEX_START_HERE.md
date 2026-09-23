# ANUNEX Proje Başlangıç Noktası

Bu dosya, ANUNEX üzerinde yeni bir çalışma sohbeti başladığında ilk okunacak dosyadır.

## Okuma sırası

1. `docs/ANUNEX_PRODUCT_CONTRACT.md`
2. `docs/ANUNEX_DECISIONS.md`
3. `docs/ANUNEX_CURRENT_STATE.md`
4. `docs/ANUNEX_MASTER_CHECKLIST.md`
5. `docs/ANUNEX_ACCEPTANCE_TESTS.md`
6. `docs/ANUNEX_CHANGELOG.md`

## Çalışma protokolü

- Önce mevcut durumu raporla; kod değiştirmeye hemen başlama.
- `TASLAK` veya `ONAYLANDI` durumundaki kararları uygulanmış kabul etme.
- Bir özellik ancak test edilip gerçek canlı akışta doğrulanınca `CANLIDA DOĞRULANDI` olur.
- Kullanıcı tarafından paylaşılmamış optik koordinatı, MEB kazanımını, puanlama kuralını, API sonucunu veya canlı erişimi uydurma.
- Çelişen iki karar varsa sessizce seçim yapma; çelişkiyi göster ve kullanıcıdan karar iste.
- Bir görev tamamlanmadan sonraki ana modüle geçme.
- İlgisiz domain, veri tabanı, tenant veya modülü değiştirme.
- Deploy yalnızca master checklist içindeki kabul testleri geçtikten ve kullanıcı onayından sonra yapılır.
- Her çalışma sonunda bu dosyalar güncellenir ve değişiklik commit ile kaydedilir.

## Yeni sohbet başlangıç metni

> ANUNEX projesinde önce `docs/ANUNEX_START_HERE.md`, `docs/ANUNEX_PRODUCT_CONTRACT.md`, `docs/ANUNEX_DECISIONS.md`, `docs/ANUNEX_CURRENT_STATE.md` ve `docs/ANUNEX_MASTER_CHECKLIST.md` dosyalarını oku. Kod değiştirme. Önce gerçek mevcut durumu, açık çelişkileri ve sıradaki tek işi raporla.

