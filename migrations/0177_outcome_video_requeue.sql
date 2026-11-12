-- Kazanım videosu: the first ten searches (12 Nov 2026) used long queries with the unit heading; clear their misses so
-- they are searched again with the cleaner queries, in the new order (outcomes with questions, grades 8→5 first).
DELETE FROM outcome_video_queue WHERE status IN ('NOT_FOUND','ERROR') AND attempts<=1;
