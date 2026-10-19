-- Preserve existing ids and evidence. A public curriculum code is not a unique
-- node key across two versions in the same year.
ALTER TABLE learning_nodes ADD COLUMN curriculum_version_id TEXT REFERENCES curriculum_versions(id);
ALTER TABLE learning_nodes ADD COLUMN official_code TEXT;
UPDATE learning_nodes SET
 curriculum_version_id=(SELECT o.curriculum_version_id FROM outcomes o WHERE 'ln_'||o.id=learning_nodes.id),
 official_code=(SELECT o.code FROM outcomes o WHERE 'ln_'||o.id=learning_nodes.id)
WHERE EXISTS(SELECT 1 FROM outcomes o WHERE 'ln_'||o.id=learning_nodes.id);

DROP TRIGGER IF EXISTS trg_outcome_learning_node_insert;
DROP TRIGGER IF EXISTS trg_outcome_learning_node_update;
CREATE TRIGGER trg_outcome_learning_node_insert AFTER INSERT ON outcomes BEGIN
 INSERT OR IGNORE INTO learning_nodes(id,academic_year,node_type,subject_id,grade_level,code,title,parent_id,official,source_url,active,curriculum_version_id,official_code)
 VALUES('ln_'||NEW.id,COALESCE((SELECT academic_year FROM curriculum_versions WHERE id=NEW.curriculum_version_id),'2026-2027'),'OUTCOME',NEW.subject_id,NEW.grade_level,
  CASE WHEN EXISTS(SELECT 1 FROM learning_nodes n WHERE n.academic_year=COALESCE((SELECT academic_year FROM curriculum_versions WHERE id=NEW.curriculum_version_id),'2026-2027') AND n.node_type='OUTCOME' AND n.code=NEW.code AND n.id<>'ln_'||NEW.id) THEN 'OUTCOME:'||NEW.id ELSE COALESCE(NULLIF(NEW.code,''),'OUTCOME:'||NEW.id) END,
  NEW.title,NULL,NEW.official,(SELECT source_url FROM curriculum_versions WHERE id=NEW.curriculum_version_id),NEW.active,NEW.curriculum_version_id,NEW.code);
END;
CREATE TRIGGER trg_outcome_learning_node_update AFTER UPDATE OF subject_id,grade_level,code,title,official,active,curriculum_version_id ON outcomes BEGIN
 UPDATE learning_nodes SET
 academic_year=COALESCE((SELECT academic_year FROM curriculum_versions WHERE id=NEW.curriculum_version_id),'2026-2027'),
 code=CASE WHEN EXISTS(SELECT 1 FROM learning_nodes n WHERE n.academic_year=COALESCE((SELECT academic_year FROM curriculum_versions WHERE id=NEW.curriculum_version_id),'2026-2027') AND n.node_type='OUTCOME' AND n.code=NEW.code AND n.id<>'ln_'||NEW.id) THEN 'OUTCOME:'||NEW.id ELSE COALESCE(NULLIF(NEW.code,''),'OUTCOME:'||NEW.id) END,
 subject_id=NEW.subject_id,grade_level=NEW.grade_level,title=NEW.title,official=NEW.official,source_url=(SELECT source_url FROM curriculum_versions WHERE id=NEW.curriculum_version_id),active=NEW.active,curriculum_version_id=NEW.curriculum_version_id,official_code=NEW.code
 WHERE id='ln_'||NEW.id;
END;
-- Repair only missing outcome nodes, including collisions previously skipped by
-- INSERT OR IGNORE. Existing node ids and their student/question links survive.
INSERT OR IGNORE INTO learning_nodes(id,academic_year,node_type,subject_id,grade_level,code,title,parent_id,official,source_url,active,curriculum_version_id,official_code)
SELECT 'ln_'||o.id,COALESCE(cv.academic_year,'2026-2027'),'OUTCOME',o.subject_id,o.grade_level,
 CASE WHEN EXISTS(SELECT 1 FROM learning_nodes n WHERE n.academic_year=COALESCE(cv.academic_year,'2026-2027') AND n.node_type='OUTCOME' AND n.code=o.code) THEN 'OUTCOME:'||o.id ELSE COALESCE(NULLIF(o.code,''),'OUTCOME:'||o.id) END,
 o.title,NULL,o.official,cv.source_url,o.active,o.curriculum_version_id,o.code
FROM outcomes o LEFT JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE NOT EXISTS(SELECT 1 FROM learning_nodes n WHERE n.id='ln_'||o.id);
CREATE INDEX idx_learning_nodes_curriculum_version ON learning_nodes(curriculum_version_id,official_code);
