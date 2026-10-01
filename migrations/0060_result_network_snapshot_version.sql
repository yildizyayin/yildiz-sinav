-- Existing publications deliberately remain NULL: their original version cannot
-- be reconstructed safely from the newest snapshot of a different channel.
ALTER TABLE exam_administrations ADD COLUMN published_snapshot_version INTEGER;
