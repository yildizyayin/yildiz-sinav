PRAGMA foreign_keys = ON;

UPDATE platform_features
SET stage='STANDARD', enabled_default=1
WHERE feature_key='QUESTION_BANK';

-- Question-bank governance metadata for Standard.
ALTER TABLE question_bank ADD COLUMN origin_kind TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE question_bank ADD COLUMN reviewed_by TEXT REFERENCES users(id);
ALTER TABLE question_bank ADD COLUMN reviewed_at TEXT;
ALTER TABLE question_bank ADD COLUMN rejection_note TEXT;

CREATE INDEX IF NOT EXISTS idx_question_bank_review_queue
  ON question_bank(review_status,owner_type,grade_level,subject_id,created_at DESC);
