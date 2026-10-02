CREATE TABLE IF NOT EXISTS result_artifact_manifest (
 administration_id TEXT NOT NULL REFERENCES exam_administrations(id) ON DELETE CASCADE,
 participant_id TEXT NOT NULL REFERENCES exam_participants(id) ON DELETE CASCADE,
 snapshot_version INTEGER NOT NULL,
 object_key TEXT NOT NULL,
 content_sha256 TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(administration_id,snapshot_version,participant_id)
);
