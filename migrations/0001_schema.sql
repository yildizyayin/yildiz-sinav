PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS institutions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  city TEXT,
  district TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','PASSIVE')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS institution_seasons (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  academic_year TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('DRAFT','ACTIVE','CLOSED','ARCHIVED')),
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(institution_id, academic_year)
);

CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  season_id TEXT NOT NULL REFERENCES institution_seasons(id),
  grade_level INTEGER NOT NULL,
  section TEXT NOT NULL,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(season_id, grade_level, section)
);

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS student_entities (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','GUEST','ARCHIVED')),
  activated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_enrollments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES student_entities(id),
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  season_id TEXT NOT NULL REFERENCES institution_seasons(id),
  class_id TEXT REFERENCES classes(id),
  student_number TEXT,
  grade_level INTEGER,
  section TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','LEFT','GRADUATED','ARCHIVED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, season_id)
);
CREATE INDEX IF NOT EXISTS idx_enrollment_scope ON student_enrollments(institution_id, season_id, student_number);
CREATE INDEX IF NOT EXISTS idx_enrollment_class ON student_enrollments(class_id);

CREATE TABLE IF NOT EXISTS guest_profiles (
  student_id TEXT PRIMARY KEY REFERENCES student_entities(id),
  first_seen_exam_id TEXT,
  last_seen_at TEXT,
  match_notes TEXT,
  converted_by TEXT,
  converted_at TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  institution_id TEXT REFERENCES institutions(id),
  student_id TEXT REFERENCES student_entities(id),
  role TEXT NOT NULL CHECK(role IN ('SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER','STUDENT','PARENT')),
  display_name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  username TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 100000,
  password_algo TEXT NOT NULL DEFAULT 'PBKDF2-SHA256-v1',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_institution ON users(institution_id, role);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_agent TEXT,
  ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS parent_student_links (
  id TEXT PRIMARY KEY,
  parent_user_id TEXT NOT NULL REFERENCES users(id),
  student_id TEXT NOT NULL REFERENCES student_entities(id),
  relationship TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(parent_user_id, student_id)
);

CREATE TABLE IF NOT EXISTS teacher_assignments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  season_id TEXT NOT NULL REFERENCES institution_seasons(id),
  class_id TEXT REFERENCES classes(id),
  subject_id TEXT REFERENCES subjects(id),
  assignment_type TEXT NOT NULL CHECK(assignment_type IN ('SUBJECT','GUIDANCE')),
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_user ON teacher_assignments(user_id, season_id, active);

CREATE TABLE IF NOT EXISTS institution_license_state (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  season_id TEXT NOT NULL REFERENCES institution_seasons(id),
  licensed_student_limit INTEGER NOT NULL DEFAULT 0,
  licensed_student_count INTEGER NOT NULL DEFAULT 0,
  agreement_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(agreement_status IN ('PENDING','ACTIVE','SUSPENDED','CLOSED')),
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(institution_id, season_id)
);

CREATE TABLE IF NOT EXISTS scoring_rules (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  authority TEXT,
  official INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS scoring_rule_versions (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES scoring_rules(id),
  academic_year TEXT NOT NULL,
  version TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  source_url TEXT,
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(rule_id, academic_year, version)
);

CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK(owner_type IN ('CENTRAL','INSTITUTION')),
  institution_id TEXT REFERENCES institutions(id),
  academic_year TEXT NOT NULL,
  title TEXT NOT NULL,
  exam_type TEXT NOT NULL,
  grade_level INTEGER,
  exam_date TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACTIVE','CLOSED','ARCHIVED')),
  scoring_rule_version_id TEXT REFERENCES scoring_rule_versions(id),
  sponsor_mode TEXT NOT NULL DEFAULT 'INSTITUTION' CHECK(sponsor_mode IN ('INSTITUTION','ADMIN_SPONSORED')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_exams_status ON exams(academic_year, status, exam_type);

CREATE TABLE IF NOT EXISTS exam_institutions (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  enabled INTEGER NOT NULL DEFAULT 1,
  UNIQUE(exam_id, institution_id)
);

CREATE TABLE IF NOT EXISTS exam_subjects (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  question_count INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  wrong_divisor REAL NOT NULL DEFAULT 4,
  UNIQUE(exam_id, subject_id)
);

CREATE TABLE IF NOT EXISTS exam_booklets (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(exam_id, code)
);

CREATE TABLE IF NOT EXISTS curriculum_versions (
  id TEXT PRIMARY KEY,
  academic_year TEXT NOT NULL,
  grade_level INTEGER,
  program_version TEXT NOT NULL,
  authority TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  source_url TEXT,
  UNIQUE(academic_year, grade_level, program_version)
);

CREATE TABLE IF NOT EXISTS outcomes (
  id TEXT PRIMARY KEY,
  curriculum_version_id TEXT REFERENCES curriculum_versions(id),
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  grade_level INTEGER,
  code TEXT,
  topic TEXT,
  subtopic TEXT,
  title TEXT NOT NULL,
  official INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_outcomes_subject ON outcomes(subject_id, grade_level);

CREATE TABLE IF NOT EXISTS exam_questions (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  question_no INTEGER NOT NULL,
  global_no INTEGER,
  UNIQUE(exam_id, subject_id, question_no)
);

CREATE TABLE IF NOT EXISTS answer_keys (
  id TEXT PRIMARY KEY,
  exam_question_id TEXT NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
  booklet_code TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  UNIQUE(exam_question_id, booklet_code)
);

CREATE TABLE IF NOT EXISTS question_outcomes (
  exam_question_id TEXT NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
  outcome_id TEXT NOT NULL REFERENCES outcomes(id),
  PRIMARY KEY(exam_question_id, outcome_id)
);

CREATE TABLE IF NOT EXISTS optical_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  vendor TEXT,
  status TEXT NOT NULL DEFAULT 'NEEDS_DEFINITION' CHECK(status IN ('READY','NEEDS_DEFINITION','ARCHIVED')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS optical_template_versions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES optical_templates(id),
  version TEXT NOT NULL,
  page_width_mm REAL NOT NULL DEFAULT 210,
  page_height_mm REAL NOT NULL DEFAULT 297,
  parser_definition TEXT,
  camera_geometry TEXT,
  print_fields TEXT,
  fiducials TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(template_id, version)
);

CREATE TABLE IF NOT EXISTS printer_profiles (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  name TEXT NOT NULL,
  physical_printer_hint TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS printer_optical_calibrations (
  id TEXT PRIMARY KEY,
  printer_profile_id TEXT NOT NULL REFERENCES printer_profiles(id),
  optical_template_version_id TEXT NOT NULL REFERENCES optical_template_versions(id),
  status TEXT NOT NULL DEFAULT 'NEEDS_CALIBRATION' CHECK(status IN ('NEEDS_CALIBRATION','AUTO_CALIBRATING','MANUAL_REQUIRED','VERIFICATION_REQUIRED','READY')),
  offset_x_mm REAL NOT NULL DEFAULT 0,
  offset_y_mm REAL NOT NULL DEFAULT 0,
  scale_x REAL NOT NULL DEFAULT 1,
  scale_y REAL NOT NULL DEFAULT 1,
  rotation_deg REAL NOT NULL DEFAULT 0,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  verified_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(printer_profile_id, optical_template_version_id)
);

CREATE TABLE IF NOT EXISTS calibration_attempts (
  id TEXT PRIMARY KEY,
  calibration_id TEXT NOT NULL REFERENCES printer_optical_calibrations(id),
  attempt_no INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('AUTO','MANUAL_VERIFY')),
  image_key TEXT,
  offset_x_mm REAL,
  offset_y_mm REAL,
  scale_x REAL,
  scale_y REAL,
  rotation_deg REAL,
  confidence REAL,
  within_tolerance INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scan_batches (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id),
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  season_id TEXT REFERENCES institution_seasons(id),
  source_type TEXT NOT NULL CHECK(source_type IN ('TXT','DAT','CSV','CAMERA','TRANSFER')),
  optical_template_version_id TEXT REFERENCES optical_template_versions(id),
  detection_confidence REAL,
  status TEXT NOT NULL DEFAULT 'PREVIEW' CHECK(status IN ('PREVIEW','NEEDS_REVIEW','READY','COMMITTED','FAILED')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scan_records (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES scan_batches(id) ON DELETE CASCADE,
  row_no INTEGER NOT NULL,
  canonical_json TEXT NOT NULL,
  matched_student_id TEXT REFERENCES student_entities(id),
  match_status TEXT NOT NULL CHECK(match_status IN ('ACTIVE_MATCH','GUEST_MATCH','NEW_GUEST','AMBIGUOUS','INVALID')),
  match_confidence REAL NOT NULL DEFAULT 0,
  issues_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_scan_records_batch ON scan_records(batch_id, match_status);

CREATE TABLE IF NOT EXISTS exam_participants (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id),
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  season_id TEXT REFERENCES institution_seasons(id),
  student_id TEXT REFERENCES student_entities(id),
  scan_record_id TEXT REFERENCES scan_records(id),
  student_number_snapshot TEXT,
  name_snapshot TEXT NOT NULL,
  class_snapshot TEXT,
  booklet_code TEXT,
  participant_status TEXT NOT NULL CHECK(participant_status IN ('ACTIVE','GUEST','UNRESOLVED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(exam_id, institution_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_participant_exam ON exam_participants(exam_id, institution_id);
CREATE INDEX IF NOT EXISTS idx_participant_student ON exam_participants(student_id, exam_id);

CREATE TABLE IF NOT EXISTS student_answers (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES exam_participants(id) ON DELETE CASCADE,
  exam_question_id TEXT NOT NULL REFERENCES exam_questions(id),
  answer TEXT,
  status TEXT NOT NULL CHECK(status IN ('CORRECT','WRONG','BLANK','INVALID')),
  confidence REAL,
  UNIQUE(participant_id, exam_question_id)
);

CREATE TABLE IF NOT EXISTS exam_results (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL UNIQUE REFERENCES exam_participants(id) ON DELETE CASCADE,
  scoring_rule_version_id TEXT REFERENCES scoring_rule_versions(id),
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  blank_count INTEGER NOT NULL DEFAULT 0,
  net REAL NOT NULL DEFAULT 0,
  score REAL,
  success_percent REAL,
  institution_rank INTEGER,
  grade_rank INTEGER,
  class_rank INTEGER,
  general_rank INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subject_results (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES exam_participants(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  blank_count INTEGER NOT NULL DEFAULT 0,
  net REAL NOT NULL DEFAULT 0,
  success_percent REAL,
  UNIQUE(participant_id, subject_id)
);

CREATE TABLE IF NOT EXISTS outcome_results (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES student_entities(id),
  exam_id TEXT NOT NULL REFERENCES exams(id),
  outcome_id TEXT NOT NULL REFERENCES outcomes(id),
  evidence_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  success_rate REAL NOT NULL DEFAULT 0,
  mastery_status TEXT NOT NULL CHECK(mastery_status IN ('INSUFFICIENT_EVIDENCE','DEVELOPING','STRONG')),
  UNIQUE(student_id, exam_id, outcome_id)
);
CREATE INDEX IF NOT EXISTS idx_outcome_results_student ON outcome_results(student_id, outcome_id, exam_id);

CREATE TABLE IF NOT EXISTS worksheets (
  id TEXT PRIMARY KEY,
  academic_year TEXT NOT NULL,
  grade_level INTEGER,
  track TEXT NOT NULL CHECK(track IN ('NUMERIC','VERBAL')),
  sequence_no INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','REVIEW','PUBLISHED','ARCHIVED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(academic_year, grade_level, track, sequence_no)
);

CREATE TABLE IF NOT EXISTS worksheet_subjects (
  id TEXT PRIMARY KEY,
  worksheet_id TEXT NOT NULL REFERENCES worksheets(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  question_count INTEGER NOT NULL DEFAULT 20,
  UNIQUE(worksheet_id, subject_id)
);

CREATE TABLE IF NOT EXISTS worksheet_assets (
  id TEXT PRIMARY KEY,
  worksheet_id TEXT NOT NULL REFERENCES worksheets(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK(asset_type IN ('PDF','ANSWER_KEY','OTHER')),
  r2_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS video_links (
  id TEXT PRIMARY KEY,
  worksheet_id TEXT REFERENCES worksheets(id) ON DELETE CASCADE,
  exam_question_id TEXT REFERENCES exam_questions(id) ON DELETE CASCADE,
  outcome_id TEXT REFERENCES outcomes(id),
  link_type TEXT NOT NULL CHECK(link_type IN ('SOLUTION','TOPIC')),
  url TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0,
  title TEXT
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  season_id TEXT REFERENCES institution_seasons(id),
  source_system TEXT NOT NULL,
  source_file_key TEXT,
  status TEXT NOT NULL DEFAULT 'PREVIEW' CHECK(status IN ('PREVIEW','NEEDS_REVIEW','READY','COMMITTED','FAILED')),
  summary_json TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  committed_at TEXT
);

CREATE TABLE IF NOT EXISTS import_staging_rows (
  id TEXT PRIMARY KEY,
  import_job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_no INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  source_json TEXT NOT NULL,
  mapped_json TEXT,
  match_status TEXT,
  issues_json TEXT
);

CREATE TABLE IF NOT EXISTS external_identities (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  source_system TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  internal_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(institution_id, source_system, entity_type, external_id)
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id TEXT PRIMARY KEY,
  identifier_hash TEXT NOT NULL,
  success INTEGER NOT NULL,
  ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier ON login_attempts(identifier_hash, created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  institution_id TEXT REFERENCES institutions(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_scope ON audit_logs(institution_id, created_at);
