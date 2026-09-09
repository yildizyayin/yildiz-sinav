---
name: Ajan görevi
about: app.anunex.com veya sonuc.anunex.com için yapılandırılmış geliştirme görevi
title: "[AJAN] "
labels: "ajan-gorevi"
assignees: ""
---

## Hedef

<!-- Kullanıcıya ne kazandıracağını tek cümlede yazın. -->

## Etkilenen ürün

- [ ] app.anunex.com
- [ ] sonuc.anunex.com
- [ ] Her ikisi
- [ ] Ortak altyapı / CI

## Görev

<!-- İstenen davranışı ve iş kurallarını açıkça yazın. -->

## Kabul kriterleri

<!-- Tamamlandı sayılması için ölçülebilir maddeler. -->
- [ ] 
- [ ] 
- [ ] 

## Veri, güvenlik ve kapsam sınırları

- Gerçek repo yapısı incelenmeli; tahmini dosya yolu kullanılmamalı.
- Mevcut auth, rol, tenant izolasyonu, KVKK, audit ve retention kuralları korunmalı.
- `app.anunex.com` ile `sonuc.anunex.com` sorumlulukları birbirine karıştırılmamalı.
- Ödeme, kimlik doğrulama, veri silme veya güvenlik sınırları etkileniyorsa insan incelemesi zorunludur.
- Production'a doğrudan deploy edilmemeli; PR açılmalı ve CI geçmelidir.

## Test planı

<!-- Hangi testler staging üzerinde çalışacak? -->
- [ ] Typecheck / build
- [ ] İlgili testler
- [ ] Mobil ve masaüstü smoke kontrolü
- [ ] Gerekirse staging smoke / yük testi

## Ajan çalıştırma notu

- Issue açıldığında Triyaj Ajanı sınıflandırmayı dener.
- Yalnız düşük riskli, geri alınabilir düzeltmeler için `ajan-fix-dene` etiketi eklenir; bu etiket Kod Yazıcı Ajanı'nı tetikler.
- Manuel çalıştırma gerekiyorsa Actions > ilgili workflow > Run workflow bölümünden bu Issue numarası girilir.
- Hiçbir ajan otomatik merge veya production deploy yapmaz.
