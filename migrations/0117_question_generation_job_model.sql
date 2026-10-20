-- A081: record which producer model each generation job actually used, so the
-- Super Admin panel can compare yield and human acceptance per model.
ALTER TABLE question_generation_jobs ADD COLUMN generator_model TEXT;
