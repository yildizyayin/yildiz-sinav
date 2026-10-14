# Soru üretim kalitesi ve 500.000/50 gün — devam kaydı

14 Ekim 2026. Kullanıcı kalan üretim işlerini tamamlamamızı, basit metin yerine güçlü yayınevi düzeyinde soru tasarlayan bir ekip kurmamızı istedi. Ardından sınav merkezi güncellenecek. Başlangıç main623d0c60e / PR257 prod dağıtımı38596578880 ve prod doğrulaması38597468655 başarılıdır. Önceki prod bekleme bilgisi artık tarihsel.

Bu çalışma: `/workspace/scratch/b484842228bb/question-quality-scale`, feat/question-quality-scale-20261014. 0107/0108 henüz dağıtılmadı; mevcut0103-0106 değiştirilmedi.

Uygulanan: EDITORIAL_V1 varsayılan yeni iş profili, değiştirilemez sunum/kalite yönlendirmesi; beceri hedefi,2–6 düşünme adımı, her yanlış şık için ayrı hata tanısı/gerekçe ve özgün tasarım gerekçesi; yapılandırılmış TABLE/BAR_CHART/NONE. Serbest HTML/SVG/URL üretimi yok. Ayrı model altı boyutta0–4 puan ve gerekçe verir; her boyutta en az3 gerekir. Bu otomatik puan insan/telif onayı değildir. Eski iş profilleri korunur.

Havuz geneli FTS5 benzerlik aday indeksi: canonical soru deposu question_bank; indeks türetilmiş aramadır. Üst adaylar bağımsız modele gönderilir. Küresel semantik tekillik/telif garantisi yok. Son12/4 karşılaştırması da korunur.

Yeni paket ve STEM görseli aynı D1 transaction içinde saklanır; içerik/metadata/görsel kısmi değişikliği DB trigger ile durdurulur. Soru kontrolü güncel immutable paketi görür. Admin, öğrenci pratik ve Nibiru mini-test tablo/grafik gösterimi eklendi. Türkçe ve erişilebilir veri tablosu; sıfır başlangıçlı grafik. Editorial JSON cevap ipuçları öğrenci DTO'suna eklenmez.

Panel hedef göstergesi:500000/50 gün, günlük10000 kabul, %80 uçtan uca kabul varsayımında12500 taslak. Varsayım/ölçüm/insan onayı ayrıdır; kampanya başlatılmış sayılmaz. Gerçek7x24 yürütme/ham rezervasyon/daily budget/çoklu işçi ve resmî kapsam henüz tamamlanmış değildir. Eski pilot45/50 sıfırlanmadı, otomatik üretim/ücretli ses açılmadı.

Şu ana kadar63 odaklı test geçti (yeni2 native D1 editorial transaction dahil). Henüz tam test/typecheck/build/CI ve gerçek model editorial örneği yok. Sonraki: veri görseli UI testleri, eksik görseli düşüren eski PDF yoluna güvenli engel veya tam baskı desteği; sağlayıcı kapasite/maliyet ve ücretsiz tercihine uygun bütçe planı; demo gerçek sınırlı editorial kalite kabulü; GitHub checkpoint/PR, testler ve dağıtım. Sınav merkezine bu aşama tamamlanmadan geçilmez.
