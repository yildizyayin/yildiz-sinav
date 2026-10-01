# İşlem kilidi teşhis ve güvenli kurtarma

GET /api/platform/exam-center/operation-locks yalnız SUPER_ADMIN içindir. En fazla100 kilit, sınav kimliği, işlem, alınma zamanı ve bekleme süresi döner; owner_token dönmez. hasMore liste sınırını belirtir. liveness UNKNOWN: yaş, sahibin hâlâ çalışıp çalışmadığını kanıtlamaz. recoveryAvailable false: bu sürüm güvenli zorla açma sağlamaz.

Normal tamamlanma/hata finally ile kendi kilidini bırakır. Worker iptali/crash veya release DB hatası kilidi bırakmayabilir. Böyle bir kilidin yaşına göre silinmesi, eski işlem hâlâ yazarken ikinci işlem başlatabilir. Bir milyon sonuç okuyucusu bu mutation kilidine girmemelidir; yalnız değerlendirme/yayın yazıları kilitlenir.

Kurtarma için gereken teknik kapanış: kilit sahipliğinin her sonuç yazı grubunda aynı transaction içinde doğrulanması; sahibi iptal edilmiş işlemin sonraki yazılarının reddi; iptal ve yeni sahiplik geçişinin atomikliği; kullanıcı/kurum yetkisi ve gerekçeli audit; eski işlem/snapshot geri alma ve kaldığı yerden tekrar deneme politikası. Yalnız TTL, heartbeat veya yazı öncesi ayrı SELECT kontrolü bu garantiyi vermez. Alternatif koordinatör mimarisi de eski sahibin D1 yazmasını engellemelidir.

Gerekli kabul testleri: A yavaşlar → sahiplik iptal edilir → B başlar → A devam edip yazmaya çalışır → A'nın yazısı reddedilir; B'nin kilidi A'nın finally'siyle silinmez. Crash/DB rollback ve kısmi chunk/optional failure yeniden denemeleri ayrı doğrulanır.

Kurtarma kapanmadan migration0058'in üretim işletim hazırlığı tamamlandı denmez. Diagnostic API canlıya alınmadı; güvenli unlock endpoint'i veya otomatik unlock bulunmuyor. Capacity hedefleriyle birlikte release kapısıdır.
