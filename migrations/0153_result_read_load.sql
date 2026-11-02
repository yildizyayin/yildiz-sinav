-- Sonuç sayfası okuma yükü (2 Kasım ölçümü): il listesi her açılışta okul rehberinin tamamını (46.803 satır),
-- ilçe listesi il başına ~3.000 satır okuyordu; öğrenci arama/sonuç sorguları öğrenci kayıtlarını tarıyordu.
-- 1) İl/ilçe özet tablosu (~1.000 satır), rehberdeki her değişiklikte tetikleyicilerle güncel tutulur.
CREATE TABLE IF NOT EXISTS national_institution_locations (
  city TEXT NOT NULL,
  district TEXT NOT NULL,
  institution_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(city,district)
);
DELETE FROM national_institution_locations;
INSERT INTO national_institution_locations(city,district,institution_count)
  SELECT city,district,COUNT(*) FROM national_institution_directory
  WHERE status='ACTIVE' AND city<>'' AND district<>'' GROUP BY city,district;
CREATE TRIGGER IF NOT EXISTS national_location_insert AFTER INSERT ON national_institution_directory
WHEN NEW.status='ACTIVE' AND NEW.city<>'' AND NEW.district<>'' BEGIN
  INSERT INTO national_institution_locations(city,district,institution_count) VALUES(NEW.city,NEW.district,1)
  ON CONFLICT(city,district) DO UPDATE SET institution_count=institution_count+1;
END;
CREATE TRIGGER IF NOT EXISTS national_location_delete AFTER DELETE ON national_institution_directory
WHEN OLD.status='ACTIVE' AND OLD.city<>'' AND OLD.district<>'' BEGIN
  UPDATE national_institution_locations SET institution_count=MAX(0,institution_count-1) WHERE city=OLD.city AND district=OLD.district;
END;
CREATE TRIGGER IF NOT EXISTS national_location_update AFTER UPDATE OF city,district,status ON national_institution_directory
WHEN OLD.status IS NOT NEW.status OR OLD.city IS NOT NEW.city OR OLD.district IS NOT NEW.district BEGIN
  UPDATE national_institution_locations SET institution_count=MAX(0,institution_count-1)
    WHERE OLD.status='ACTIVE' AND city=OLD.city AND district=OLD.district;
  INSERT INTO national_institution_locations(city,district,institution_count)
    SELECT NEW.city,NEW.district,1 WHERE NEW.status='ACTIVE' AND NEW.city<>'' AND NEW.district<>''
  ON CONFLICT(city,district) DO UPDATE SET institution_count=institution_count+1;
END;
-- 2) Öğrenci arama ve sonuç sorguları: kurum koduyla ve ad+sınıfla doğrudan bulunur (tarama yok).
CREATE INDEX IF NOT EXISTS idx_result_network_institution_meb ON result_network_institutions(meb_code);
CREATE INDEX IF NOT EXISTS idx_result_identity_name_grade ON result_access_identities(normalized_name,grade_level);
