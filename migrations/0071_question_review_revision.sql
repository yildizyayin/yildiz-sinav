-- Approval is tied to the content and learning-link revision that was read.
ALTER TABLE question_bank ADD COLUMN review_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE question_bank ADD COLUMN review_checks_json TEXT;
CREATE TRIGGER question_review_revision_update AFTER UPDATE ON question_bank
WHEN NEW.review_revision=OLD.review_revision
BEGIN
  UPDATE question_bank SET review_revision=OLD.review_revision+1 WHERE id=NEW.id;
END;
CREATE TRIGGER question_review_link_insert AFTER INSERT ON question_learning_links
BEGIN
  UPDATE question_bank SET review_revision=review_revision+1 WHERE id=NEW.question_id;
END;
CREATE TRIGGER question_review_link_delete AFTER DELETE ON question_learning_links
BEGIN
  UPDATE question_bank SET review_revision=review_revision+1 WHERE id=OLD.question_id;
END;
CREATE TRIGGER question_review_link_update AFTER UPDATE ON question_learning_links
BEGIN
  UPDATE question_bank SET review_revision=review_revision+1 WHERE id IN (OLD.question_id,NEW.question_id);
END;
CREATE TRIGGER question_review_asset_insert AFTER INSERT ON question_assets
BEGIN
  UPDATE question_bank SET review_revision=review_revision+1 WHERE id=NEW.question_id;
END;
CREATE TRIGGER question_review_asset_delete AFTER DELETE ON question_assets
BEGIN
  UPDATE question_bank SET review_revision=review_revision+1 WHERE id=OLD.question_id;
END;
CREATE TRIGGER question_review_asset_update AFTER UPDATE ON question_assets
BEGIN
  UPDATE question_bank SET review_revision=review_revision+1 WHERE id IN (OLD.question_id,NEW.question_id);
END;
CREATE TRIGGER question_review_block_insert AFTER INSERT ON question_content_blocks
BEGIN
  UPDATE question_bank SET review_revision=review_revision+1 WHERE id=NEW.question_id;
END;
CREATE TRIGGER question_review_block_delete AFTER DELETE ON question_content_blocks
BEGIN
  UPDATE question_bank SET review_revision=review_revision+1 WHERE id=OLD.question_id;
END;
CREATE TRIGGER question_review_block_update AFTER UPDATE ON question_content_blocks
BEGIN
  UPDATE question_bank SET review_revision=review_revision+1 WHERE id IN (OLD.question_id,NEW.question_id);
END;
