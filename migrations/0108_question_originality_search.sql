-- Derived search index only; question_bank remains the canonical content store.
CREATE VIRTUAL TABLE question_editorial_search USING fts5(question_id UNINDEXED,search_text,tokenize='unicode61 remove_diacritics 2');
INSERT INTO question_editorial_search(question_id,search_text) SELECT id,COALESCE(stem_text,'')||' '||COALESCE(solution_text,'') FROM question_bank WHERE owner_type='PLATFORM';
CREATE TRIGGER question_editorial_search_insert AFTER INSERT ON question_bank WHEN NEW.owner_type='PLATFORM' BEGIN
 INSERT INTO question_editorial_search(question_id,search_text) VALUES(NEW.id,COALESCE(NEW.stem_text,'')||' '||COALESCE(NEW.solution_text,'')); END;
CREATE TRIGGER question_editorial_search_update AFTER UPDATE OF stem_text,solution_text ON question_bank
WHEN OLD.stem_text IS NOT NEW.stem_text OR OLD.solution_text IS NOT NEW.solution_text BEGIN
 DELETE FROM question_editorial_search WHERE question_id=OLD.id;
 INSERT INTO question_editorial_search(question_id,search_text) SELECT NEW.id,COALESCE(NEW.stem_text,'')||' '||COALESCE(NEW.solution_text,'') WHERE NEW.owner_type='PLATFORM'; END;
CREATE TRIGGER question_editorial_search_delete AFTER DELETE ON question_bank BEGIN DELETE FROM question_editorial_search WHERE question_id=OLD.id; END;
