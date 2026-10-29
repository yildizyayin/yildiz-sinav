PRAGMA foreign_keys = ON;

-- S042 / D-S039, D-S041: exams and optics a school or a dealer adds on sonuc.anunex.com for itself.
-- A school's exam is used only by that school. A dealer's exam is used by the dealer and the schools in its scope.
-- Such an exam is never "open to every institution" and has no Türkiye rank.
CREATE TABLE IF NOT EXISTS result_network_own_exams (
  exam_id TEXT PRIMARY KEY REFERENCES exams(id) ON DELETE CASCADE,
  owner_kind TEXT NOT NULL CHECK(owner_kind IN ('INSTITUTION','DEALER')),
  institution_id TEXT REFERENCES institutions(id),
  dealer_id TEXT REFERENCES result_network_dealers(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK((owner_kind='INSTITUTION' AND institution_id IS NOT NULL AND dealer_id IS NULL) OR (owner_kind='DEALER' AND dealer_id IS NOT NULL AND institution_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_own_exams_institution ON result_network_own_exams(institution_id);
CREATE INDEX IF NOT EXISTS idx_own_exams_dealer ON result_network_own_exams(dealer_id);

-- A dealer's own optic (a school's own optic already has optical_templates.owner_type='INSTITUTION').
CREATE TABLE IF NOT EXISTS result_network_own_opticals (
  template_id TEXT PRIMARY KEY REFERENCES optical_templates(id) ON DELETE CASCADE,
  dealer_id TEXT NOT NULL REFERENCES result_network_dealers(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_own_opticals_dealer ON result_network_own_opticals(dealer_id);
