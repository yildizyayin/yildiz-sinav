-- Definitions are entered and reviewed by people; no seeded official competencies.
CREATE TABLE curriculum_process_components (
 id TEXT PRIMARY KEY,
 outcome_id TEXT NOT NULL REFERENCES outcomes(id),
 code TEXT NOT NULL,
 title TEXT NOT NULL,
 source_url TEXT NOT NULL,
 source_title TEXT NOT NULL,
 source_locator TEXT NOT NULL,
 review_note TEXT NOT NULL,
 verified_by TEXT NOT NULL REFERENCES users(id),
 verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(outcome_id,code)
);
CREATE TABLE learning_rubric_versions (
 id TEXT PRIMARY KEY,
 component_id TEXT NOT NULL REFERENCES curriculum_process_components(id),
 version_label TEXT NOT NULL,
 title TEXT NOT NULL,
 task_instructions TEXT NOT NULL,
 criteria_json TEXT NOT NULL CHECK(json_valid(criteria_json)),
 source_kind TEXT NOT NULL CHECK(source_kind IN ('OFFICIAL','TEACHER_DESIGNED')),
 source_url TEXT,
 source_title TEXT,
 source_locator TEXT,
 review_note TEXT NOT NULL,
 published_by TEXT NOT NULL REFERENCES users(id),
 published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(component_id,version_label)
);
CREATE INDEX learning_rubric_component_idx ON learning_rubric_versions(component_id);
-- Published definitions are append-only. Corrections require a new version.
CREATE TRIGGER process_component_no_update BEFORE UPDATE ON curriculum_process_components
 BEGIN SELECT RAISE(ABORT,'PROCESS_COMPONENT_IMMUTABLE'); END;
CREATE TRIGGER process_component_no_delete BEFORE DELETE ON curriculum_process_components
 BEGIN SELECT RAISE(ABORT,'PROCESS_COMPONENT_IMMUTABLE'); END;
CREATE TRIGGER rubric_version_no_update BEFORE UPDATE ON learning_rubric_versions
 BEGIN SELECT RAISE(ABORT,'RUBRIC_VERSION_IMMUTABLE'); END;
CREATE TRIGGER rubric_version_no_delete BEFORE DELETE ON learning_rubric_versions
 BEGIN SELECT RAISE(ABORT,'RUBRIC_VERSION_IMMUTABLE'); END;
CREATE TRIGGER process_component_verified_context BEFORE INSERT ON curriculum_process_components
 WHEN NOT EXISTS (SELECT 1 FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
 WHERE o.id=NEW.outcome_id AND o.active=1 AND o.official=1 AND cv.verified=1
 AND o.node_type IN ('OUTCOME','SUB_OUTCOME'))
 BEGIN SELECT RAISE(ABORT,'VERIFIED_OUTCOME_REQUIRED'); END;
