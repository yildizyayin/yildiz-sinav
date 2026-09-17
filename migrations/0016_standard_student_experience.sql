PRAGMA foreign_keys = ON;

-- Standard Friday core: multi-target YKS goals, student personalization/countdown,
-- micro-learning video cache and grade-aware educational game catalog.

DROP INDEX IF EXISTS idx_student_one_active_target;

ALTER TABLE student_academic_targets ADD COLUMN priority INTEGER NOT NULL DEFAULT 1;
ALTER TABLE student_academic_targets ADD COLUMN motivation_label TEXT;
ALTER TABLE student_academic_targets ADD COLUMN motivation_enabled INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_one_active_lgs_target
  ON student_academic_targets(student_id)
  WHERE status='ACTIVE' AND target_type='LGS_SCHOOL';

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_active_target_priority
  ON student_academic_targets(student_id,target_type,priority)
  WHERE status='ACTIVE';

CREATE INDEX IF NOT EXISTS idx_student_active_yks_targets
  ON student_academic_targets(student_id,status,target_type,priority,created_at DESC);

CREATE TABLE IF NOT EXISTS student_experience_preferences (
  student_id TEXT PRIMARY KEY REFERENCES student_entities(id) ON DELETE CASCADE,
  theme_key TEXT NOT NULL DEFAULT 'AUTO',
  appearance TEXT NOT NULL DEFAULT 'AUTO' CHECK(appearance IN ('AUTO','LIGHT','DARK')),
  font_key TEXT NOT NULL DEFAULT 'SYSTEM',
  font_scale REAL NOT NULL DEFAULT 1.0 CHECK(font_scale BETWEEN 0.85 AND 1.30),
  animation_level TEXT NOT NULL DEFAULT 'NORMAL' CHECK(animation_level IN ('OFF','REDUCED','NORMAL')),
  countdown_enabled INTEGER NOT NULL DEFAULT 1,
  countdown_label TEXT,
  countdown_target_date TEXT,
  countdown_flip_clock INTEGER NOT NULL DEFAULT 1,
  motivation_identity TEXT,
  motivation_enabled INTEGER NOT NULL DEFAULT 1,
  voice_motivation_enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS youtube_micro_video_candidates (
  id TEXT PRIMARY KEY,
  exam_question_id TEXT REFERENCES exam_questions(id) ON DELETE CASCADE,
  outcome_id TEXT REFERENCES outcomes(id) ON DELETE CASCADE,
  grade_level INTEGER,
  subject_id TEXT REFERENCES subjects(id),
  search_query TEXT NOT NULL,
  youtube_video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  channel_title TEXT,
  url TEXT NOT NULL,
  duration_seconds INTEGER,
  view_count INTEGER,
  relevance_score REAL NOT NULL DEFAULT 0,
  popularity_score REAL NOT NULL DEFAULT 0,
  ai_selected INTEGER NOT NULL DEFAULT 0,
  safe_search INTEGER NOT NULL DEFAULT 1,
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  UNIQUE(exam_question_id,youtube_video_id)
);
CREATE INDEX IF NOT EXISTS idx_micro_video_question
  ON youtube_micro_video_candidates(exam_question_id,ai_selected DESC,relevance_score DESC,popularity_score DESC);
CREATE INDEX IF NOT EXISTS idx_micro_video_outcome
  ON youtube_micro_video_candidates(outcome_id,ai_selected DESC,relevance_score DESC,popularity_score DESC);

CREATE TABLE IF NOT EXISTS educational_game_catalog (
  id TEXT PRIMARY KEY,
  game_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  min_grade INTEGER NOT NULL DEFAULT 5,
  max_grade INTEGER NOT NULL DEFAULT 6,
  subject_code TEXT,
  game_type TEXT NOT NULL CHECK(game_type IN ('QUIZ','MEMORY','SPEED','MATCH','PUZZLE')),
  icon_key TEXT,
  xp_enabled INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO educational_game_catalog(id,game_code,title,description,min_grade,max_grade,subject_code,game_type,icon_key,sort_order) VALUES
 ('game_math_speed','MATH_SPEED','İşlem Yarışı','Kısa matematik işlemlerini hız ve doğrulukla pekiştirir.',5,6,'MAT','SPEED','calculator',10),
 ('game_turkish_word','TURKISH_WORD_HUNT','Kelime Avı','Türkçe sözcük, anlam ve kavram bilgisini eğlenceli tekrarlarla pekiştirir.',5,6,'TR','QUIZ','letters',20),
 ('game_science_planet','SCIENCE_PLANET','Doğru Gezegeni Bul','Fen kavramlarını kısa seçim görevleriyle tekrar ettirir.',5,6,'FEN','MATCH','orbit',30),
 ('game_memory_cards','MEMORY_CARDS','Hafıza Kartları','Ders kavramlarını eşleştirme ve hafıza kartlarıyla tekrar ettirir.',5,6,NULL,'MEMORY','cards',40),
 ('game_sixty_seconds','SIXTY_SECONDS','60 Saniye Meydan Okuması','Bir kazanımı 60 saniyelik kısa akademik meydan okumayla pekiştirir.',5,6,NULL,'SPEED','timer',50);

INSERT OR IGNORE INTO platform_features(feature_key,label,stage,enabled_default) VALUES
 ('STUDENT_PERSONALIZATION','Öğrenci Kişiselleştirme','STANDARD',1),
 ('STUDENT_COUNTDOWN','Sınav Geri Sayımı','STANDARD',1),
 ('MICRO_LEARNING_VIDEO','Mikro Konu Videosu','STANDARD',1),
 ('MULTI_ACADEMIC_TARGET','Çoklu Akademik Hedef','STANDARD',1);
