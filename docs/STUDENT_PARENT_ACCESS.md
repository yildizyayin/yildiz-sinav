# Öğrenci / Veli Erişim Hesapları

- Yalnız `student_entities.status = ACTIVE` olan öğrenciler için `STUDENT` hesabı açılır.
- `GUEST` ve `ARCHIVED` öğrenciler için giriş hesabı oluşturulmaz.
- Öğrenci hesabı mevcut öğrenci kimliğine (`student_id`) bağlanır; geçmiş sınavlar yeni bir öğrenci kaydına kopyalanmaz.
- Bir öğrenci için yalnız bir `STUDENT` hesabına izin verilir.
- `PARENT` hesabı aynı kurum içindeki bir veya daha fazla aktif öğrenciye bağlanabilir.
- Veli bağlantısı `parent_student_links` üzerinden tutulur; bağlantı pasife alınabilir.
- Öğrenci/veli hesabı pasife alındığında açık session kayıtları revoke edilir.
- Super Admin tüm kurumlarda, Kurum Yöneticisi yalnız kendi kurumunda bu hesapları yönetebilir.
- Branş öğretmeni, rehber öğretmeni, öğrenci ve veli hesap yönetimi API'lerine erişemez.
