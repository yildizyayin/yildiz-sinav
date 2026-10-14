ALTER TABLE question_generation_jobs ADD COLUMN quality_profile TEXT NOT NULL DEFAULT 'LEGACY' CHECK(quality_profile IN ('LEGACY','EDITORIAL_V1'));
ALTER TABLE question_generation_jobs ADD COLUMN presentation TEXT NOT NULL DEFAULT 'AUTO' CHECK(presentation IN ('AUTO','TEXT','TABLE','BAR_CHART'));
ALTER TABLE question_bank ADD COLUMN editorial_packet_json TEXT CHECK(editorial_packet_json IS NULL OR json_valid(editorial_packet_json));
CREATE TRIGGER question_generation_editorial_immutable BEFORE UPDATE OF quality_profile,presentation ON question_generation_jobs
WHEN OLD.quality_profile IS NOT NEW.quality_profile OR OLD.presentation IS NOT NEW.presentation
BEGIN SELECT RAISE(ABORT,'GENERATION_DIRECTION_IMMUTABLE'); END;
CREATE TRIGGER question_editorial_packet_immutable BEFORE UPDATE OF editorial_packet_json ON question_bank
WHEN OLD.editorial_packet_json IS NOT NEW.editorial_packet_json
BEGIN SELECT RAISE(ABORT,'EDITORIAL_PACKET_IMMUTABLE'); END;
CREATE TRIGGER question_editorial_atomic_revision BEFORE UPDATE OF stem_text,options_json,correct_answer,solution_text ON question_bank
WHEN OLD.editorial_packet_json IS NOT NULL AND (OLD.stem_text IS NOT NEW.stem_text OR OLD.options_json IS NOT NEW.options_json OR OLD.correct_answer IS NOT NEW.correct_answer OR OLD.solution_text IS NOT NEW.solution_text)
BEGIN SELECT RAISE(ABORT,'EDITORIAL_ATOMIC_REVISION_REQUIRED'); END;
CREATE TRIGGER question_editorial_visual_insert BEFORE INSERT ON question_content_blocks
WHEN NEW.placement='STEM' AND EXISTS(SELECT 1 FROM question_bank q WHERE q.id=NEW.question_id AND q.editorial_packet_json IS NOT NULL)
AND (EXISTS(SELECT 1 FROM question_content_blocks WHERE question_id=NEW.question_id AND placement='STEM')
 OR NOT EXISTS(SELECT 1 FROM question_bank q WHERE q.id=NEW.question_id AND json_extract(NEW.payload_json,'$.schemaVersion')=1
 AND json_extract(q.editorial_packet_json,'$.visual.kind') IN ('TABLE','BAR_CHART')
 AND NEW.block_type=CASE json_extract(q.editorial_packet_json,'$.visual.kind') WHEN 'TABLE' THEN 'TABLE' ELSE 'DIAGRAM' END
 AND json_remove(NEW.payload_json,'$.schemaVersion')=json_extract(q.editorial_packet_json,'$.visual')))
BEGIN SELECT RAISE(ABORT,'EDITORIAL_VISUAL_MISMATCH'); END;
CREATE TRIGGER question_editorial_visual_update BEFORE UPDATE ON question_content_blocks
WHEN OLD.placement='STEM' AND EXISTS(SELECT 1 FROM question_bank WHERE id=OLD.question_id AND editorial_packet_json IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'EDITORIAL_VISUAL_IMMUTABLE'); END;
CREATE TRIGGER question_editorial_visual_delete BEFORE DELETE ON question_content_blocks
WHEN OLD.placement='STEM' AND EXISTS(SELECT 1 FROM question_bank WHERE id=OLD.question_id AND editorial_packet_json IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'EDITORIAL_VISUAL_IMMUTABLE'); END;
