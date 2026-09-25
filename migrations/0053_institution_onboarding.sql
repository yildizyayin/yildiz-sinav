PRAGMA foreign_keys = ON;

-- Super Admin kurum açma akışının kurumsal kimlik ve lisans bilgileri.
ALTER TABLE institutions ADD COLUMN source_type TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE institutions ADD COLUMN meb_code TEXT;
ALTER TABLE institutions ADD COLUMN institution_type TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE institutions ADD COLUMN ownership TEXT;
ALTER TABLE institutions ADD COLUMN education_level TEXT;
ALTER TABLE institutions ADD COLUMN official_url TEXT;
ALTER TABLE institutions ADD COLUMN address TEXT;
ALTER TABLE institutions ADD COLUMN package_code TEXT NOT NULL DEFAULT 'STANDARD';
ALTER TABLE institutions ADD COLUMN user_limit INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_institutions_meb_code
  ON institutions(meb_code)
  WHERE meb_code IS NOT NULL AND trim(meb_code) <> '';

CREATE INDEX IF NOT EXISTS idx_institutions_onboarding
  ON institutions(status, source_type, package_code, city, district);

