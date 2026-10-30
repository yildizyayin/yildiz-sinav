-- Föy değerlendirme (30 Ekim): one answer key per föy, used by paper optics on sonuc and the student's online optic.
-- A föy answer is identified by (föy, ders, soru no); it is not a question-bank question and never enters the pool.

CREATE TABLE IF NOT EXISTS worksheet_answer_keys (
  worksheet_id TEXT NOT NULL REFERENCES worksheets(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  question_no INTEGER NOT NULL CHECK(question_no >= 1),
  correct_answer TEXT NOT NULL CHECK(correct_answer IN ('A','B','C','D','E')),
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(worksheet_id, subject_id, question_no)
);

-- A föy response names its sheet position instead of a question-bank question.
ALTER TABLE assessment_responses ADD COLUMN worksheet_subject_id TEXT REFERENCES subjects(id);
ALTER TABLE assessment_responses ADD COLUMN worksheet_question_no INTEGER;

-- One upload of a paper föy optic on sonuc.
CREATE TABLE IF NOT EXISTS foy_scan_batches (
  id TEXT PRIMARY KEY,
  worksheet_id TEXT NOT NULL REFERENCES worksheets(id),
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  season_id TEXT NOT NULL REFERENCES institution_seasons(id),
  optical_template_version_id TEXT,
  file_name TEXT,
  file_sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'READY' CHECK(status IN ('READY','COMMITTED','DELETED')),
  total INTEGER NOT NULL DEFAULT 0,
  scored INTEGER NOT NULL DEFAULT 0,
  set_aside INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  evaluated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_foy_scan_batches_scope ON foy_scan_batches(institution_id, worksheet_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_foy_scan_batches_file ON foy_scan_batches(worksheet_id, institution_id, file_sha256) WHERE status <> 'DELETED' AND file_sha256 IS NOT NULL;

CREATE TABLE IF NOT EXISTS foy_scan_records (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES foy_scan_batches(id) ON DELETE CASCADE,
  row_no INTEGER NOT NULL,
  display_name TEXT,
  student_number TEXT,
  answers_json TEXT NOT NULL,
  matched_student_id TEXT REFERENCES student_entities(id),
  status TEXT NOT NULL CHECK(status IN ('READY','SCORED','SET_ASIDE')),
  reason TEXT,
  run_id TEXT,
  correct INTEGER, wrong INTEGER, blank INTEGER
);
CREATE INDEX IF NOT EXISTS idx_foy_scan_records_batch ON foy_scan_records(batch_id, row_no);

-- Freeze föy sheet evidence at write time, like question-bank föy evidence (0078). The outcome comes from the föy's
-- own question link and counts only when it is an active outcome of a verified curriculum for the student's grade and year.
CREATE TRIGGER IF NOT EXISTS freeze_foy_sheet_response_evidence AFTER INSERT ON assessment_responses
WHEN NEW.question_id IS NULL AND NEW.worksheet_subject_id IS NOT NULL
  AND EXISTS(SELECT 1 FROM assessment_runs r WHERE r.id=NEW.run_id AND r.source_type='FOY' AND r.student_id=NEW.student_id)
BEGIN
  INSERT OR IGNORE INTO frozen_foy_response_evidence(
    response_id,run_id,student_id,institution_id,assignment_id,enrollment_id,season_id,academic_year,grade_level,
    subject_id,curriculum_version_id,program_version,outcome_refs_json,result_status,context_valid,observed_at)
  SELECT NEW.id,r.id,NEW.student_id,r.institution_id,r.assignment_id,e.id,e.season_id,s.academic_year,e.grade_level,
    NEW.worksheet_subject_id,
    o.curriculum_version_id,
    cv.program_version,
    CASE WHEN o.id IS NOT NULL THEN json_array(json_object('outcomeId',o.id,'outcomeCode',o.code,'outcomeTitle',o.title,'curriculumVersionId',o.curriculum_version_id,'programVersion',cv.program_version,'subjectId',o.subject_id,'gradeLevel',o.grade_level,'academicYear',cv.academic_year)) ELSE '[]' END,
    CASE WHEN NEW.selected_answer IS NULL OR trim(NEW.selected_answer)='' THEN 'BLANK' WHEN NEW.is_correct=1 THEN 'CORRECT' ELSE 'WRONG' END,
    CASE WHEN o.id IS NOT NULL THEN 1 ELSE 0 END,
    COALESCE(NEW.created_at,CURRENT_TIMESTAMP)
  FROM assessment_runs r
  JOIN student_enrollments e ON e.id=(SELECT ee.id FROM student_enrollments ee WHERE ee.student_id=NEW.student_id AND ee.institution_id=r.institution_id ORDER BY CASE WHEN ee.status='ACTIVE' THEN 0 ELSE 1 END,ee.created_at DESC,ee.id DESC LIMIT 1)
  JOIN institution_seasons s ON s.id=e.season_id AND s.institution_id=e.institution_id
  LEFT JOIN worksheet_question_links l ON l.worksheet_id=r.source_id AND l.subject_id=NEW.worksheet_subject_id AND l.question_no=NEW.worksheet_question_no
  LEFT JOIN outcomes o ON o.id=l.outcome_id AND o.active=1 AND o.subject_id=NEW.worksheet_subject_id AND o.grade_level=e.grade_level
    AND EXISTS(SELECT 1 FROM curriculum_versions v WHERE v.id=o.curriculum_version_id AND v.verified=1 AND v.grade_level=e.grade_level AND v.academic_year=s.academic_year)
  LEFT JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
  WHERE r.id=NEW.run_id AND r.source_type='FOY' AND r.student_id=NEW.student_id AND r.institution_id IS NOT NULL AND e.grade_level BETWEEN 1 AND 12;
END;
