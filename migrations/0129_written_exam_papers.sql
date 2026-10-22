-- A040: written exam papers built from the school's chosen scenario of a verified (or school committee)
-- distribution table. Slots follow the scenario rows; an item comes from the approved written bank with an
-- approved rubric, or is written by the school committee (zümre) in the paper itself. On finalisation the
-- rubric versions are pinned and the paper can no longer change.
CREATE TABLE written_papers (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  table_id TEXT NOT NULL REFERENCES written_exam_tables(id),
  scenario_id TEXT NOT NULL REFERENCES written_exam_scenarios(id),
  title TEXT NOT NULL,
  class_label TEXT,
  exam_date TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','FINAL','ARCHIVED')),
  zumre_rule TEXT NOT NULL CHECK(zumre_rule IN ('REQUIRED_2','NOT_APPLICABLE','UNVERIFIED')),
  total_points INTEGER,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finalized_by TEXT REFERENCES users(id),
  finalized_at TEXT,
  CHECK((status='FINAL' AND finalized_at IS NOT NULL AND total_points=100) OR status<>'FINAL')
);
CREATE INDEX written_papers_institution ON written_papers(institution_id, created_at DESC);
CREATE TABLE written_paper_items (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES written_papers(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  scenario_row_id TEXT NOT NULL REFERENCES written_exam_scenario_rows(id),
  source TEXT NOT NULL CHECK(source IN ('BANK','ZUMRE')),
  question_id TEXT REFERENCES question_bank(id),
  rubric_id TEXT REFERENCES question_rubrics(id),
  zumre_stem TEXT,
  zumre_model_answer TEXT,
  zumre_rubric_json TEXT CHECK(zumre_rubric_json IS NULL OR json_valid(zumre_rubric_json)),
  points INTEGER,
  UNIQUE(paper_id, sort_order),
  CHECK((source='BANK' AND question_id IS NOT NULL AND zumre_stem IS NULL) OR (source='ZUMRE' AND question_id IS NULL AND zumre_stem IS NOT NULL AND zumre_rubric_json IS NOT NULL))
);
CREATE UNIQUE INDEX written_paper_items_unique_question ON written_paper_items(paper_id, question_id) WHERE question_id IS NOT NULL;

CREATE TRIGGER written_paper_items_locked_ins BEFORE INSERT ON written_paper_items
WHEN (SELECT status FROM written_papers WHERE id=NEW.paper_id) IS NOT 'DRAFT' BEGIN SELECT RAISE(ABORT,'PAPER_LOCKED'); END;
CREATE TRIGGER written_paper_items_locked_upd BEFORE UPDATE ON written_paper_items
WHEN (SELECT status FROM written_papers WHERE id=OLD.paper_id) IS NOT 'DRAFT' BEGIN SELECT RAISE(ABORT,'PAPER_LOCKED'); END;
CREATE TRIGGER written_paper_items_locked_del BEFORE DELETE ON written_paper_items
WHEN (SELECT status FROM written_papers WHERE id=OLD.paper_id) IS NOT 'DRAFT' BEGIN SELECT RAISE(ABORT,'PAPER_LOCKED'); END;
CREATE TRIGGER written_papers_locked_upd BEFORE UPDATE OF table_id,scenario_id,title,class_label,exam_date,zumre_rule,total_points,institution_id ON written_papers
WHEN OLD.status<>'DRAFT' BEGIN SELECT RAISE(ABORT,'PAPER_LOCKED'); END;
CREATE TRIGGER written_papers_no_reopen BEFORE UPDATE OF status ON written_papers
WHEN OLD.status='FINAL' AND NEW.status='DRAFT' BEGIN SELECT RAISE(ABORT,'PAPER_LOCKED'); END;
-- A final paper pins an approved rubric for every bank item and a total of exactly 100.
CREATE TRIGGER written_papers_final_guard BEFORE UPDATE OF status ON written_papers
WHEN NEW.status='FINAL' AND OLD.status='DRAFT' BEGIN
 SELECT RAISE(ABORT,'PAPER_INCOMPLETE') WHERE
  EXISTS(SELECT 1 FROM written_paper_items i WHERE i.paper_id=NEW.id AND (i.points IS NULL OR (i.source='BANK' AND (i.rubric_id IS NULL OR NOT EXISTS(SELECT 1 FROM question_rubrics r WHERE r.id=i.rubric_id AND r.status='APPROVED' AND r.question_id=i.question_id AND r.total_points=i.points)))))
  OR (SELECT coalesce(sum(points),0) FROM written_paper_items WHERE paper_id=NEW.id)<>100
  OR EXISTS(SELECT 1 FROM written_exam_scenario_rows sr WHERE sr.scenario_id=NEW.scenario_id AND sr.question_count<>(SELECT count(*) FROM written_paper_items i WHERE i.paper_id=NEW.id AND i.scenario_row_id=sr.id))
  OR EXISTS(SELECT 1 FROM written_paper_items i WHERE i.paper_id=NEW.id AND NOT EXISTS(SELECT 1 FROM written_exam_scenario_rows sr WHERE sr.id=i.scenario_row_id AND sr.scenario_id=NEW.scenario_id))
  OR (NEW.zumre_rule='REQUIRED_2' AND (SELECT count(*) FROM written_paper_items WHERE paper_id=NEW.id AND source='ZUMRE')<>2);
END;
