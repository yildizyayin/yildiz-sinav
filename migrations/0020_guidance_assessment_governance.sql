PRAGMA foreign_keys = ON;

-- Counselor-governed educational guidance assessments.
-- Legacy guidance_instruments/guidance_responses remain intact for backward compatibility.
-- These instruments are educational self-assessments, never medical/psychological diagnosis tools.
CREATE TABLE IF NOT EXISTS guidance_assessment_instruments (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('RBA','STUDY_HABITS','GOAL_MOTIVATION','EXAM_READINESS','STUDY_PREFERENCES','CUSTOM_EDUCATIONAL')),
  version TEXT NOT NULL,
  description TEXT,
  question_schema_json TEXT NOT NULL,
  requires_counselor_approval INTEGER NOT NULL DEFAULT 1 CHECK(requires_counselor_approval=1),
  clinical_use INTEGER NOT NULL DEFAULT 0 CHECK(clinical_use=0),
  evidence_level TEXT NOT NULL DEFAULT 'INTERNAL_EDUCATIONAL',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS guidance_assessment_sessions (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  instrument_id TEXT NOT NULL REFERENCES guidance_assessment_instruments(id),
  proposed_by TEXT NOT NULL DEFAULT 'NIBIRU' CHECK(proposed_by IN ('NIBIRU','GUIDANCE_TEACHER')),
  proposed_by_user_id TEXT REFERENCES users(id),
  proposal_reason TEXT,
  proposal_evidence_json TEXT,
  status TEXT NOT NULL DEFAULT 'PROPOSED' CHECK(status IN ('PROPOSED','APPROVED','IN_PROGRESS','SUBMITTED','REVIEWED','REJECTED','CANCELLED')),
  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  approval_note TEXT,
  response_json TEXT,
  scored_result_json TEXT,
  submitted_at TEXT,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  counselor_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_guidance_session_student ON guidance_assessment_sessions(student_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guidance_session_counselor ON guidance_assessment_sessions(institution_id,status,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_guidance_one_open_instrument
  ON guidance_assessment_sessions(student_id,instrument_id)
  WHERE status IN ('PROPOSED','APPROVED','IN_PROGRESS','SUBMITTED');

CREATE TABLE IF NOT EXISTS guidance_development_signals (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  source_session_id TEXT NOT NULL REFERENCES guidance_assessment_sessions(id) ON DELETE CASCADE,
  signal_key TEXT NOT NULL,
  score REAL NOT NULL CHECK(score BETWEEN 0 AND 100),
  confidence REAL NOT NULL DEFAULT 1 CHECK(confidence BETWEEN 0 AND 1),
  summary TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_session_id,signal_key)
);
CREATE INDEX IF NOT EXISTS idx_guidance_signal_student ON guidance_development_signals(student_id,signal_key,created_at DESC);

INSERT OR IGNORE INTO guidance_assessment_instruments(id,code,title,category,version,description,question_schema_json,evidence_level) VALUES
('gi_rba_v1','RBA_EDU_V1','RBA Öğrenme ve Çalışma Profili','RBA','1.0','Öğrencinin çalışma davranışı ve akademik öz-düzenleme sinyallerini eğitim amaçlı değerlendirir. Tıbbi/psikolojik tanı değildir.','{"scale":{"min":1,"max":5},"items":[{"id":"r1","dimension":"analytical","text":"Bir soruda çözüm yolunu adımlara ayırırım."},{"id":"r2","dimension":"verbal_processing","text":"Okuduğum bilgiyi kendi cümlelerimle açıklayabilirim."},{"id":"r3","dimension":"numeric_processing","text":"Sayısal bilgileri karşılaştırırken düzenli bir yöntem kullanırım."},{"id":"r4","dimension":"consistency","text":"Çalışma planımı çoğu gün benzer düzende sürdürebilirim."},{"id":"r5","dimension":"error_review","text":"Aynı hatayı tekrar etmemek için yanlışlarımı yeniden incelerim."},{"id":"r6","dimension":"pace","text":"Çalışırken hızımı sorunun zorluğuna göre ayarlayabilirim."},{"id":"r7","dimension":"plan_adherence","text":"Belirlediğim günlük çalışma görevlerini tamamlarım."},{"id":"r8","dimension":"persistence","text":"Zorlandığım sorularda hemen bırakmak yerine farklı bir yol denerim."},{"id":"r9","dimension":"performance_stability","text":"Deneme performansımı etkileyen çalışma alışkanlıklarını takip ederim."}]}','INTERNAL_EDUCATIONAL'),
('gi_study_v1','STUDY_HABITS_V1','Çalışma Alışkanlıkları Öz-Değerlendirmesi','STUDY_HABITS','1.0','Planlama, odak, tekrar ve görev tamamlama davranışlarını eğitim amacıyla değerlendirir.','{"scale":{"min":1,"max":5},"items":[{"id":"s1","dimension":"planning","text":"Haftalık çalışma planımı önceden belirlerim."},{"id":"s2","dimension":"focus","text":"Çalışma sırasında dikkat dağıtıcıları sınırlarım."},{"id":"s3","dimension":"review","text":"Yanlış yaptığım konulara tekrar dönerim."},{"id":"s4","dimension":"completion","text":"Başladığım akademik görevleri tamamlarım."}]}','INTERNAL_EDUCATIONAL'),
('gi_goal_v1','GOAL_MOTIVATION_V1','Hedef ve Motivasyon Öz-Değerlendirmesi','GOAL_MOTIVATION','1.0','Akademik hedef netliği, ilerleme takibi ve sürdürme davranışlarını eğitim amacıyla değerlendirir.','{"scale":{"min":1,"max":5},"items":[{"id":"g1","dimension":"goal_clarity","text":"Ulaşmak istediğim akademik hedefi net biçimde biliyorum."},{"id":"g2","dimension":"progress_tracking","text":"Hedefime ne kadar yaklaştığımı düzenli takip ederim."},{"id":"g3","dimension":"persistence","text":"Kısa süreli düşüşlerde çalışmayı tamamen bırakmam."},{"id":"g4","dimension":"self_adjustment","text":"Sonuçlarıma göre çalışma planımı değiştirebilirim."}]}','INTERNAL_EDUCATIONAL'),
('gi_exam_v1','EXAM_READINESS_V1','Sınav Hazırlık Öz-Değerlendirmesi','EXAM_READINESS','1.0','Sınav hazırlık düzeni, zaman kullanımı ve deneme sonrası değerlendirme davranışlarını eğitim amacıyla değerlendirir.','{"scale":{"min":1,"max":5},"items":[{"id":"e1","dimension":"time_management","text":"Denemelerde süreyi bölümlere ayırarak yönetebilirim."},{"id":"e2","dimension":"preparation_consistency","text":"Sınava hazırlık çalışmalarımı son güne bırakmam."},{"id":"e3","dimension":"post_exam_review","text":"Deneme sonrası yanlış ve boşlarımı incelerim."},{"id":"e4","dimension":"strategy_awareness","text":"Hangi soru türlerinde daha çok zaman kaybettiğimi bilirim."}]}','INTERNAL_EDUCATIONAL');

INSERT OR IGNORE INTO platform_features(feature_key,label,stage,enabled_default) VALUES
('GUIDANCE_APPROVED_ASSESSMENTS','Rehber Öğretmen Onaylı RBA / Rehberlik Testleri','NEXT',0);
