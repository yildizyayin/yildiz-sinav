-- Kazanım videosu: Gemini calls failed on 12 Nov 2026 (the default model was retired for new keys, every answer read
-- "yanıt yok" or HTTP 404). Those misses were Gemini's failure, not a missing segment: search them again.
DELETE FROM outcome_video_queue WHERE status='NOT_FOUND' AND (last_reason LIKE '%yanıt yok%' OR last_reason LIKE '%HTTP 404%');
