-- Keep 0107 immutable; private editorial reading-purpose text is no longer a student visual field.
DROP TRIGGER question_editorial_visual_insert;
CREATE TRIGGER question_editorial_visual_insert BEFORE INSERT ON question_content_blocks
WHEN NEW.placement='STEM' AND EXISTS(SELECT 1 FROM question_bank q WHERE q.id=NEW.question_id AND q.editorial_packet_json IS NOT NULL)
AND (EXISTS(SELECT 1 FROM question_content_blocks WHERE question_id=NEW.question_id AND placement='STEM')
 OR NOT EXISTS(SELECT 1 FROM question_bank q WHERE q.id=NEW.question_id AND json_extract(NEW.payload_json,'$.schemaVersion')=1
 AND json_extract(q.editorial_packet_json,'$.visual.kind') IN ('TABLE','BAR_CHART')
 AND NEW.block_type=CASE json_extract(q.editorial_packet_json,'$.visual.kind') WHEN 'TABLE' THEN 'TABLE' ELSE 'DIAGRAM' END
 AND json_remove(NEW.payload_json,'$.schemaVersion')=json_remove(json_extract(q.editorial_packet_json,'$.visual'),'$.readingPurpose')))
BEGIN SELECT RAISE(ABORT,'EDITORIAL_VISUAL_MISMATCH'); END;
