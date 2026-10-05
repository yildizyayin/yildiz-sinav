-- Store video publication gates in SQLite UTC text format so every legacy
-- lexical comparison with CURRENT_TIMESTAMP remains chronologically correct.
-- ISO-8601 inputs such as 2026-09-30T17:00:00.000Z are normalized once and
-- future writes are normalized by triggers. datetime(NULL) stays NULL.
UPDATE video_links
SET publish_at = datetime(publish_at)
WHERE publish_at IS NOT NULL
  AND datetime(publish_at) IS NOT NULL
  AND publish_at <> datetime(publish_at);

CREATE TRIGGER video_links_normalize_publish_at_insert
AFTER INSERT ON video_links
WHEN NEW.publish_at IS NOT NULL
  AND datetime(NEW.publish_at) IS NOT NULL
  AND NEW.publish_at <> datetime(NEW.publish_at)
BEGIN
  UPDATE video_links SET publish_at=datetime(NEW.publish_at) WHERE id=NEW.id;
END;

CREATE TRIGGER video_links_normalize_publish_at_update
AFTER UPDATE OF publish_at ON video_links
WHEN NEW.publish_at IS NOT NULL
  AND datetime(NEW.publish_at) IS NOT NULL
  AND NEW.publish_at <> datetime(NEW.publish_at)
BEGIN
  UPDATE video_links SET publish_at=datetime(NEW.publish_at) WHERE id=NEW.id;
END;
