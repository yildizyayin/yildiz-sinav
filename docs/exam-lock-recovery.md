# İşlem kilidi teşhis ve güvenli kurtarma

GET /api/platform/exam-center/operation-locks yalnız SUPER_ADMIN içindir. En fazla100 kilit, sınav kimliği, işlem, alınma zamanı ve bekleme süresi döner; owner_token dönmez. hasMore liste sınırını belirtir. liveness UNKNOWN: yaş, sahibin hâlâ çalışıp çalışmadığını kanıtlamaz. recoveryAvailable false: bu sürüm güvenli zorla açma sağlamaz.

Normal tamamlanma/hata finally ile kendi kilidini bırakır. Worker iptali/crash veya release DB hatası kilidi bırakmayabilir. Böyle bir kilidin yaşına göre silinmesi, eski işlem hâlâ yazarken ikinci işlem başlatabilir. Bir milyon sonuç okuyucusu bu mutation kilidine girmemelidir; yalnız değerlendirme/yayın yazıları kilitlenir.

Kurtarma için gereken teknik kapanış: kilit sahipliğinin her sonuç yazı grubunda aynı transaction içinde doğrulanması; sahibi iptal edilmiş işlemin sonraki yazılarının reddi; iptal ve yeni sahiplik geçişinin atomikliği; kullanıcı/kurum yetkisi ve gerekçeli audit; eski işlem/snapshot geri alma ve kaldığı yerden tekrar deneme politikası. Yalnız TTL, heartbeat veya yazı öncesi ayrı SELECT kontrolü bu garantiyi vermez. Alternatif koordinatör mimarisi de eski sahibin D1 yazmasını engellemelidir.

Gerekli kabul testleri: A yavaşlar → sahiplik iptal edilir → B başlar → A devam edip yazmaya çalışır → A'nın yazısı reddedilir; B'nin kilidi A'nın finally'siyle silinmez. Crash/DB rollback ve kısmi chunk/optional failure yeniden denemeleri ayrı doğrulanır.

Kurtarma kapanmadan migration0058'in üretim işletim hazırlığı tamamlandı denmez. Diagnostic API canlıya alınmadı; güvenli unlock endpoint'i veya otomatik unlock bulunmuyor. Capacity hedefleriyle birlikte release kapısıdır.

## Implemented recovery (2026-10-01)
SuperAdmin diagnostics return a SHA-256 fingerprint, never the owner token. POST /api/platform/exam-center/operation-locks/recover requires examId, the observed fingerprint and a 10–1000 character reason. Audit and exact-owner deletion use one transaction. A changed lock returns 409. The ExamDetail control explains unknown liveness and partial completed writes; no retry is started automatically. Write fencing rejects resumed revoked owners. Migration 0059, actual D1 execution and Preview/production verification remain pending. Earlier prerequisite notes describe the design history; fencing and this endpoint now exist in branch code.
