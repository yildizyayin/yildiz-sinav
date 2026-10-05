-- Freeze worksheet (FOY) and educational mini-game evidence at write time.
-- No legacy rows are backfilled from live curriculum: readers must ignore rows
-- without these native snapshots.
CREATE TABLE frozen_foy_response_evidence (
  response_id TEXT PRIMARY KEY REFERENCES assessment_responses(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  assignment_id TEXT,
  enrollment_id TEXT NOT NULL REFERENCES student_enrollments(id),
  season_id TEXT NOT NULL REFERENCES institution_seasons(id),
  academic_year TEXT NOT NULL,
  grade_level INTEGER NOT NULL CHECK(grade_level BETWEEN 1 AND 12),
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  curriculum_version_id TEXT NOT NULL REFERENCES curriculum_versions(id),
  program_version TEXT NOT NULL,
  outcome_refs_json TEXT NOT NULL,
  result_status TEXT NOT NULL CHECK(result_status IN ('CORRECT','WRONG','BLANK')),
  context_valid INTEGER NOT NULL CHECK(context_valid IN (0,1)),
  observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX frozen_foy_student_year ON frozen_foy_response_evidence(student_id,academic_year,run_id,response_id);
CREATE INDEX frozen_foy_scope ON frozen_foy_response_evidence(institution_id,season_id,subject_id,academic_year);

CREATE TRIGGER freeze_foy_response_evidence AFTER INSERT ON assessment_responses
WHEN EXISTS(SELECT 1 FROM assessment_runs r WHERE r.id=NEW.run_id AND r.source_type='FOY' AND r.student_id=NEW.student_id)
BEGIN
  INSERT OR IGNORE INTO frozen_foy_response_evidence(
    response_id,run_id,student_id,institution_id,assignment_id,enrollment_id,season_id,academic_year,grade_level,
    subject_id,curriculum_version_id,program_version,outcome_refs_json,result_status,context_valid,observed_at)
  SELECT NEW.id,r.id,NEW.student_id,r.institution_id,r.assignment_id,e.id,e.season_id,s.academic_year,e.grade_level,
    q.subject_id,
    COALESCE((SELECT MIN(o.curriculum_version_id) FROM question_learning_links l JOIN outcomes o ON l.node_id='ln_'||o.id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE l.question_id=q.id AND o.active=1 AND cv.verified=1 AND o.subject_id=q.subject_id AND o.grade_level=e.grade_level AND cv.grade_level=e.grade_level AND cv.academic_year=s.academic_year),''),
    COALESCE((SELECT MIN(cv.program_version) FROM question_learning_links l JOIN outcomes o ON l.node_id='ln_'||o.id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE l.question_id=q.id AND o.active=1 AND cv.verified=1 AND o.subject_id=q.subject_id AND o.grade_level=e.grade_level AND cv.grade_level=e.grade_level AND cv.academic_year=s.academic_year),''),
    COALESCE((SELECT json_group_array(json_object('outcomeId',x.id,'curriculumVersionId',x.curriculum_version_id,'programVersion',x.program_version,'subjectId',x.subject_id,'gradeLevel',x.grade_level,'academicYear',x.academic_year)) FROM (
      SELECT o.id,o.curriculum_version_id,cv.program_version,o.subject_id,o.grade_level,cv.academic_year
      FROM question_learning_links l JOIN outcomes o ON l.node_id='ln_'||o.id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
      WHERE l.question_id=q.id AND o.active=1 AND cv.verified=1 AND o.subject_id=q.subject_id AND o.grade_level=e.grade_level AND cv.grade_level=e.grade_level AND cv.academic_year=s.academic_year
      ORDER BY o.id
    ) x),'[]'),
    CASE WHEN NEW.selected_answer IS NULL OR trim(NEW.selected_answer)='' THEN 'BLANK' WHEN NEW.is_correct=1 THEN 'CORRECT' ELSE 'WRONG' END,
    CASE WHEN q.subject_id IS NOT NULL
      AND EXISTS(SELECT 1 FROM question_learning_links l JOIN outcomes o ON l.node_id='ln_'||o.id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE l.question_id=q.id AND o.active=1 AND cv.verified=1 AND o.subject_id=q.subject_id AND o.grade_level=e.grade_level AND cv.grade_level=e.grade_level AND cv.academic_year=s.academic_year)
      AND NOT EXISTS(SELECT 1 FROM question_learning_links l LEFT JOIN outcomes o ON l.node_id='ln_'||o.id LEFT JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE l.question_id=q.id AND (o.id IS NULL OR o.active<>1 OR cv.id IS NULL OR cv.verified<>1 OR o.subject_id<>q.subject_id OR o.grade_level<>e.grade_level OR cv.grade_level<>e.grade_level OR cv.academic_year<>s.academic_year))
      AND 1=(SELECT COUNT(DISTINCT o.curriculum_version_id||char(31)||cv.program_version) FROM question_learning_links l JOIN outcomes o ON l.node_id='ln_'||o.id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE l.question_id=q.id AND o.active=1 AND cv.verified=1 AND o.subject_id=q.subject_id AND o.grade_level=e.grade_level AND cv.grade_level=e.grade_level AND cv.academic_year=s.academic_year)
      THEN 1 ELSE 0 END,
    COALESCE(NEW.created_at,CURRENT_TIMESTAMP)
  FROM assessment_runs r
  JOIN question_bank q ON q.id=NEW.question_id
  JOIN student_enrollments e ON e.id=(SELECT ee.id FROM student_enrollments ee WHERE ee.student_id=NEW.student_id AND ee.institution_id=r.institution_id ORDER BY CASE WHEN ee.status='ACTIVE' THEN 0 ELSE 1 END,ee.created_at DESC,ee.id DESC LIMIT 1)
  JOIN institution_seasons s ON s.id=e.season_id AND s.institution_id=e.institution_id
  WHERE r.id=NEW.run_id AND r.source_type='FOY' AND r.student_id=NEW.student_id AND r.institution_id IS NOT NULL AND NEW.question_id IS NOT NULL;
END;

CREATE TABLE frozen_game_session_evidence (
  session_id TEXT PRIMARY KEY REFERENCES game_sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  enrollment_id TEXT NOT NULL REFERENCES student_enrollments(id),
  season_id TEXT NOT NULL REFERENCES institution_seasons(id),
  academic_year TEXT NOT NULL,
  grade_level INTEGER NOT NULL CHECK(grade_level BETWEEN 1 AND 12),
  game_code TEXT NOT NULL,
  node_id TEXT,
  subject_id TEXT,
  outcome_id TEXT,
  curriculum_version_id TEXT,
  program_version TEXT,
  context_valid INTEGER NOT NULL CHECK(context_valid IN (0,1)),
  score REAL NOT NULL CHECK(score BETWEEN 0 AND 100),
  xp_earned INTEGER NOT NULL,
  duration_seconds INTEGER,
  observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX frozen_game_student_year ON frozen_game_session_evidence(student_id,academic_year,session_id);
CREATE INDEX frozen_game_scope ON frozen_game_session_evidence(institution_id,season_id,subject_id,academic_year);

CREATE TRIGGER freeze_game_session_evidence AFTER INSERT ON game_sessions
BEGIN
  INSERT OR IGNORE INTO frozen_game_session_evidence(
    session_id,student_id,institution_id,enrollment_id,season_id,academic_year,grade_level,game_code,node_id,
    subject_id,outcome_id,curriculum_version_id,program_version,context_valid,score,xp_earned,duration_seconds,observed_at)
  SELECT NEW.id,NEW.student_id,e.institution_id,e.id,e.season_id,s.academic_year,e.grade_level,NEW.game_code,NEW.node_id,
    o.subject_id,o.id,o.curriculum_version_id,cv.program_version,
    CASE WHEN NEW.node_id='ln_'||o.id AND o.active=1 AND cv.verified=1 AND o.grade_level=e.grade_level AND cv.grade_level=e.grade_level AND cv.academic_year=s.academic_year THEN 1 ELSE 0 END,
    NEW.score,NEW.xp_earned,NEW.duration_seconds,COALESCE(NEW.created_at,CURRENT_TIMESTAMP)
  FROM student_enrollments e
  JOIN institution_seasons s ON s.id=e.season_id AND s.institution_id=e.institution_id
  LEFT JOIN outcomes o ON NEW.node_id='ln_'||o.id
  LEFT JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
  WHERE e.id=(SELECT ee.id FROM student_enrollments ee WHERE ee.student_id=NEW.student_id ORDER BY CASE WHEN ee.status='ACTIVE' THEN 0 ELSE 1 END,ee.created_at DESC,ee.id DESC LIMIT 1);
END;
