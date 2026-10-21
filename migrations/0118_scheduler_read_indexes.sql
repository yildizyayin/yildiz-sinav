-- D1 daily row-read limit was exhausted on 2026-10-21. The question scheduler picks the next
-- outcome every 15 minutes; for each candidate outcome it counted generation jobs and linked
-- questions without a usable index, so every tick scanned question_generation_jobs three times
-- per outcome and walked every question of the grade/subject. These indexes turn each of those
-- lookups into an index range read.
CREATE INDEX IF NOT EXISTS question_generation_jobs_outcome_status ON question_generation_jobs(outcome_id,curriculum_version_id,status);
CREATE INDEX IF NOT EXISTS question_learning_links_node ON question_learning_links(node_id,question_id);
