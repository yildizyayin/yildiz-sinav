-- Editing an unused text draft must not rewrite evidence already delivered to a student.
ALTER TABLE question_bank ADD COLUMN content_edited_by TEXT REFERENCES users(id);
ALTER TABLE question_bank ADD COLUMN content_edit_note TEXT;
CREATE TABLE question_content_revisions (
 question_id TEXT NOT NULL REFERENCES question_bank(id),
 review_revision INTEGER NOT NULL,
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 edited_by TEXT NOT NULL REFERENCES users(id),
 edit_note TEXT NOT NULL,
 edited_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(question_id,review_revision)
);
CREATE TRIGGER question_content_revision_immutable_update BEFORE UPDATE ON question_content_revisions BEGIN
 SELECT RAISE(ABORT,'QUESTION_REVISION_IMMUTABLE'); END;
CREATE TRIGGER question_content_revision_immutable_delete BEFORE DELETE ON question_content_revisions BEGIN
 SELECT RAISE(ABORT,'QUESTION_REVISION_IMMUTABLE'); END;
CREATE TRIGGER question_content_edit_guard BEFORE UPDATE OF stem_text,options_json,correct_answer,solution_text ON question_bank
WHEN OLD.stem_text IS NOT NEW.stem_text OR OLD.options_json IS NOT NEW.options_json OR OLD.correct_answer IS NOT NEW.correct_answer OR OLD.solution_text IS NOT NEW.solution_text
BEGIN
 SELECT RAISE(ABORT,'QUESTION_CONTENT_LOCKED') WHERE OLD.review_status IN ('APPROVED','ARCHIVED')
 OR EXISTS(SELECT 1 FROM studio_document_items WHERE question_id=OLD.id)
 OR EXISTS(SELECT 1 FROM studio_exam_booklet_positions WHERE source_question_id=OLD.id)
 OR EXISTS(SELECT 1 FROM coach_mini_test_questions WHERE question_id=OLD.id)
 OR EXISTS(SELECT 1 FROM coach_question_exposures WHERE question_id=OLD.id)
 OR EXISTS(SELECT 1 FROM question_practice_attempts WHERE question_id=OLD.id)
 OR EXISTS(SELECT 1 FROM assessment_responses WHERE question_id=OLD.id)
 OR EXISTS(SELECT 1 FROM student_personal_book_items WHERE bank_question_id=OLD.id)
 OR EXISTS(SELECT 1 FROM zero_error_booklet_items WHERE bank_question_id=OLD.id);
 SELECT RAISE(ABORT,'QUESTION_CONTENT_REVIEW_REQUIRED') WHERE NEW.review_status<>'REVIEW'
 OR NEW.review_checks_json IS NOT NULL OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL
 OR NEW.content_edited_by IS NULL OR length(trim(NEW.content_edit_note))<10;
 SELECT RAISE(ABORT,'QUESTION_CONTENT_SOURCE_CHANGED') WHERE OLD.origin_kind IS NOT NEW.origin_kind
 OR OLD.source_model IS NOT NEW.source_model OR OLD.source_job_id IS NOT NEW.source_job_id
 OR OLD.source_label IS NOT NEW.source_label OR OLD.academic_year IS NOT NEW.academic_year
 OR OLD.grade_level IS NOT NEW.grade_level OR OLD.subject_id IS NOT NEW.subject_id;
 INSERT INTO question_content_revisions(question_id,review_revision,snapshot_json,edited_by,edit_note)
 VALUES(OLD.id,OLD.review_revision,json_object('stemText',OLD.stem_text,'optionsJson',OLD.options_json,
 'correctAnswer',OLD.correct_answer,'solutionText',OLD.solution_text,'reviewStatus',OLD.review_status,
 'copyrightStatus',OLD.copyright_status,'reviewChecks',OLD.review_checks_json,'sourceModel',OLD.source_model,
 'sourceJobId',OLD.source_job_id,'originKind',OLD.origin_kind,'sourceLabel',OLD.source_label),NEW.content_edited_by,NEW.content_edit_note);
END;
