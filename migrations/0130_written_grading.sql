-- A041: teacher grading of written papers. Per student and question every score is a new, append-only
-- version holding the points chosen for each rubric criterion; every correction after the first needs a
-- reason. AI may only suggest: a suggestion is stored apart and never counts unless a teacher enters it as
-- their own version. A student's grade is final only through a teacher's finalisation, itself versioned.
CREATE TABLE written_score_versions (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES written_papers(id),
  student_id TEXT NOT NULL REFERENCES student_entities(id),
  item_id TEXT NOT NULL REFERENCES written_paper_items(id),
  version INTEGER NOT NULL CHECK(version >= 1),
  criterion_points_json TEXT NOT NULL CHECK(json_valid(criterion_points_json)),
  item_points INTEGER NOT NULL CHECK(item_points >= 0),
  reason TEXT,
  entered_by TEXT NOT NULL REFERENCES users(id),
  entered_role TEXT NOT NULL CHECK(entered_role IN ('TEACHER','SUPER_ADMIN')),
  ai_suggestion_id TEXT REFERENCES written_score_suggestions(id),
  entered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(paper_id, student_id, item_id, version),
  CHECK(version = 1 OR length(trim(coalesce(reason,''))) >= 5)
);
CREATE INDEX written_score_versions_student ON written_score_versions(paper_id, student_id, item_id, version DESC);
CREATE TABLE written_score_suggestions (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES written_papers(id),
  student_id TEXT NOT NULL REFERENCES student_entities(id),
  item_id TEXT NOT NULL REFERENCES written_paper_items(id),
  answer_text TEXT NOT NULL,
  criterion_points_json TEXT NOT NULL CHECK(json_valid(criterion_points_json)),
  item_points INTEGER NOT NULL,
  rationale TEXT,
  model TEXT NOT NULL,
  requested_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE written_grade_finalizations (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES written_papers(id),
  student_id TEXT NOT NULL REFERENCES student_entities(id),
  version INTEGER NOT NULL CHECK(version >= 1),
  total_points INTEGER NOT NULL CHECK(total_points BETWEEN 0 AND 100),
  scores_json TEXT NOT NULL CHECK(json_valid(scores_json)),
  reason TEXT,
  finalized_by TEXT NOT NULL REFERENCES users(id),
  finalized_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(paper_id, student_id, version),
  CHECK(version = 1 OR length(trim(coalesce(reason,''))) >= 5)
);
-- history is never rewritten
CREATE TRIGGER written_score_versions_no_update BEFORE UPDATE ON written_score_versions BEGIN SELECT RAISE(ABORT,'SCORE_HISTORY_IMMUTABLE'); END;
CREATE TRIGGER written_score_versions_no_delete BEFORE DELETE ON written_score_versions BEGIN SELECT RAISE(ABORT,'SCORE_HISTORY_IMMUTABLE'); END;
CREATE TRIGGER written_grade_finalizations_no_update BEFORE UPDATE ON written_grade_finalizations BEGIN SELECT RAISE(ABORT,'SCORE_HISTORY_IMMUTABLE'); END;
CREATE TRIGGER written_grade_finalizations_no_delete BEFORE DELETE ON written_grade_finalizations BEGIN SELECT RAISE(ABORT,'SCORE_HISTORY_IMMUTABLE'); END;
-- scores only on a final paper, never above the item's points, never by a suggestion that belongs elsewhere
CREATE TRIGGER written_score_versions_guard BEFORE INSERT ON written_score_versions BEGIN
 SELECT RAISE(ABORT,'SCORE_INVALID') WHERE NOT EXISTS(SELECT 1 FROM written_papers p JOIN written_paper_items i ON i.paper_id=p.id WHERE p.id=NEW.paper_id AND i.id=NEW.item_id AND p.status='FINAL' AND NEW.item_points<=i.points)
  OR (NEW.ai_suggestion_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM written_score_suggestions s WHERE s.id=NEW.ai_suggestion_id AND s.paper_id=NEW.paper_id AND s.student_id=NEW.student_id AND s.item_id=NEW.item_id))
  OR (NEW.version>1 AND NOT EXISTS(SELECT 1 FROM written_score_versions v WHERE v.paper_id=NEW.paper_id AND v.student_id=NEW.student_id AND v.item_id=NEW.item_id AND v.version=NEW.version-1));
END;
-- a final grade equals the sum of the latest human score of every item of the paper
CREATE TRIGGER written_grade_finalizations_guard BEFORE INSERT ON written_grade_finalizations BEGIN
 SELECT RAISE(ABORT,'GRADE_INCOMPLETE') WHERE
  EXISTS(SELECT 1 FROM written_paper_items i WHERE i.paper_id=NEW.paper_id AND NOT EXISTS(SELECT 1 FROM written_score_versions v WHERE v.paper_id=NEW.paper_id AND v.student_id=NEW.student_id AND v.item_id=i.id))
  OR NEW.total_points<>(SELECT coalesce(sum(v.item_points),0) FROM written_score_versions v WHERE v.paper_id=NEW.paper_id AND v.student_id=NEW.student_id
     AND v.version=(SELECT max(x.version) FROM written_score_versions x WHERE x.paper_id=v.paper_id AND x.student_id=v.student_id AND x.item_id=v.item_id));
END;
