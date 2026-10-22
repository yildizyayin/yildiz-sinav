-- A039: versioned analytic rubrics for written (open-ended / short-answer) questions.
-- A version holds criteria with partial-credit levels and alternative correct solutions. It is usable for
-- grading only after a human teacher (or the Super Admin, platform-wide) approves it; an approved version
-- can never change: a correction is a new version.
CREATE TABLE question_rubrics (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES question_bank(id) ON DELETE CASCADE,
  -- NULL: platform version (AI draft or Super Admin); otherwise a school's own version, seen by that school only
  institution_id TEXT REFERENCES institutions(id),
  version INTEGER NOT NULL CHECK(version >= 1),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','ARCHIVED')),
  total_points INTEGER NOT NULL CHECK(total_points BETWEEN 1 AND 100),
  source TEXT NOT NULL CHECK(source IN ('AI_DRAFT','TEACHER')),
  change_note TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(question_id, version)
);
CREATE TABLE question_rubric_criteria (
  id TEXT PRIMARY KEY,
  rubric_id TEXT NOT NULL REFERENCES question_rubrics(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  criterion TEXT NOT NULL,
  descriptor TEXT,
  points INTEGER NOT NULL CHECK(points BETWEEN 1 AND 100),
  UNIQUE(rubric_id, sort_order)
);
CREATE TABLE question_rubric_levels (
  id TEXT PRIMARY KEY,
  criterion_id TEXT NOT NULL REFERENCES question_rubric_criteria(id) ON DELETE CASCADE,
  points INTEGER NOT NULL CHECK(points >= 0),
  descriptor TEXT NOT NULL,
  UNIQUE(criterion_id, points)
);
CREATE TABLE question_rubric_alternatives (
  id TEXT PRIMARY KEY,
  rubric_id TEXT NOT NULL REFERENCES question_rubrics(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  answer_text TEXT NOT NULL,
  note TEXT,
  UNIQUE(rubric_id, sort_order)
);
-- institution_id NULL = platform-wide approval by the Super Admin.
CREATE TABLE question_rubric_approvals (
  id TEXT PRIMARY KEY,
  rubric_id TEXT NOT NULL REFERENCES question_rubrics(id),
  institution_id TEXT REFERENCES institutions(id),
  approved_by TEXT NOT NULL REFERENCES users(id),
  approver_role TEXT NOT NULL CHECK(approver_role IN ('SUPER_ADMIN','TEACHER')),
  note TEXT,
  approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX question_rubric_approvals_scope ON question_rubric_approvals(rubric_id, coalesce(institution_id, ''));
CREATE INDEX question_rubrics_question ON question_rubrics(question_id, version DESC);

-- Only a draft's content may change.
CREATE TRIGGER question_rubric_criteria_locked_ins BEFORE INSERT ON question_rubric_criteria
WHEN (SELECT status FROM question_rubrics WHERE id=NEW.rubric_id) IS NOT 'DRAFT' BEGIN SELECT RAISE(ABORT,'RUBRIC_LOCKED'); END;
CREATE TRIGGER question_rubric_criteria_locked_upd BEFORE UPDATE ON question_rubric_criteria
WHEN (SELECT status FROM question_rubrics WHERE id=OLD.rubric_id) IS NOT 'DRAFT' BEGIN SELECT RAISE(ABORT,'RUBRIC_LOCKED'); END;
CREATE TRIGGER question_rubric_criteria_locked_del BEFORE DELETE ON question_rubric_criteria
WHEN (SELECT status FROM question_rubrics WHERE id=OLD.rubric_id) IS NOT 'DRAFT' BEGIN SELECT RAISE(ABORT,'RUBRIC_LOCKED'); END;
CREATE TRIGGER question_rubric_levels_locked_ins BEFORE INSERT ON question_rubric_levels
WHEN (SELECT r.status FROM question_rubric_criteria c JOIN question_rubrics r ON r.id=c.rubric_id WHERE c.id=NEW.criterion_id) IS NOT 'DRAFT' BEGIN SELECT RAISE(ABORT,'RUBRIC_LOCKED'); END;
CREATE TRIGGER question_rubric_levels_locked_upd BEFORE UPDATE ON question_rubric_levels
WHEN (SELECT r.status FROM question_rubric_criteria c JOIN question_rubrics r ON r.id=c.rubric_id WHERE c.id=OLD.criterion_id) IS NOT 'DRAFT' BEGIN SELECT RAISE(ABORT,'RUBRIC_LOCKED'); END;
CREATE TRIGGER question_rubric_levels_locked_del BEFORE DELETE ON question_rubric_levels
WHEN (SELECT r.status FROM question_rubric_criteria c JOIN question_rubrics r ON r.id=c.rubric_id WHERE c.id=OLD.criterion_id) IS NOT 'DRAFT' BEGIN SELECT RAISE(ABORT,'RUBRIC_LOCKED'); END;
CREATE TRIGGER question_rubric_alternatives_locked_ins BEFORE INSERT ON question_rubric_alternatives
WHEN (SELECT status FROM question_rubrics WHERE id=NEW.rubric_id) IS NOT 'DRAFT' BEGIN SELECT RAISE(ABORT,'RUBRIC_LOCKED'); END;
CREATE TRIGGER question_rubric_alternatives_locked_upd BEFORE UPDATE ON question_rubric_alternatives
WHEN (SELECT status FROM question_rubrics WHERE id=OLD.rubric_id) IS NOT 'DRAFT' BEGIN SELECT RAISE(ABORT,'RUBRIC_LOCKED'); END;
CREATE TRIGGER question_rubric_alternatives_locked_del BEFORE DELETE ON question_rubric_alternatives
WHEN (SELECT status FROM question_rubrics WHERE id=OLD.rubric_id) IS NOT 'DRAFT' BEGIN SELECT RAISE(ABORT,'RUBRIC_LOCKED'); END;
CREATE TRIGGER question_rubrics_locked_upd BEFORE UPDATE OF question_id,institution_id,version,total_points,source ON question_rubrics
WHEN OLD.status<>'DRAFT' BEGIN SELECT RAISE(ABORT,'RUBRIC_LOCKED'); END;
CREATE TRIGGER question_rubrics_no_unapprove BEFORE UPDATE OF status ON question_rubrics
WHEN OLD.status='APPROVED' AND NEW.status='DRAFT' BEGIN SELECT RAISE(ABORT,'RUBRIC_LOCKED'); END;
-- An approval requires a complete, consistent version: totals add up and every criterion has a 0 and a full level.
CREATE TRIGGER question_rubric_approval_guard BEFORE INSERT ON question_rubric_approvals
BEGIN
 SELECT RAISE(ABORT,'RUBRIC_INCONSISTENT') WHERE NOT EXISTS (
  SELECT 1 FROM question_rubrics r WHERE r.id=NEW.rubric_id AND r.status IN ('DRAFT','APPROVED')
  AND r.total_points=(SELECT coalesce(sum(points),0) FROM question_rubric_criteria WHERE rubric_id=r.id)
  AND EXISTS(SELECT 1 FROM question_rubric_criteria WHERE rubric_id=r.id)
  AND NOT EXISTS(SELECT 1 FROM question_rubric_criteria c WHERE c.rubric_id=r.id AND (
    NOT EXISTS(SELECT 1 FROM question_rubric_levels l WHERE l.criterion_id=c.id AND l.points=0)
    OR NOT EXISTS(SELECT 1 FROM question_rubric_levels l WHERE l.criterion_id=c.id AND l.points=c.points)
    OR EXISTS(SELECT 1 FROM question_rubric_levels l WHERE l.criterion_id=c.id AND l.points>c.points)))
 );
END;

-- Existing AI drafts (A038) become version 1 drafts: their criteria, with a 0 and a full-credit level.
INSERT INTO question_rubrics(id,question_id,version,status,total_points,source,change_note,created_by)
SELECT 'qr_'||q.id,q.id,1,'DRAFT',(SELECT sum(points) FROM question_rubric_items WHERE question_id=q.id),'AI_DRAFT','AI üretim taslağı',q.created_by
FROM question_bank q WHERE EXISTS(SELECT 1 FROM question_rubric_items WHERE question_id=q.id);
INSERT INTO question_rubric_criteria(id,rubric_id,sort_order,criterion,descriptor,points)
SELECT 'qrc_'||i.id,'qr_'||i.question_id,i.sort_order,i.criterion,i.descriptor,i.points FROM question_rubric_items i;
INSERT INTO question_rubric_levels(id,criterion_id,points,descriptor)
SELECT 'qrl0_'||i.id,'qrc_'||i.id,0,'Ölçüt karşılanmadı' FROM question_rubric_items i;
INSERT INTO question_rubric_levels(id,criterion_id,points,descriptor)
SELECT 'qrlf_'||i.id,'qrc_'||i.id,i.points,'Ölçüt tam karşılandı' FROM question_rubric_items i;
