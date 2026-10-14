ALTER TABLE question_generation_jobs ADD COLUMN editorial_repair_count INTEGER NOT NULL DEFAULT 0 CHECK(editorial_repair_count BETWEEN 0 AND 1);
ALTER TABLE question_generation_jobs ADD COLUMN repair_source_hash TEXT;
CREATE INDEX question_editorial_year_status ON question_bank(academic_year,review_status) WHERE owner_type='PLATFORM' AND editorial_packet_json IS NOT NULL;
CREATE INDEX question_editorial_job_year ON question_generation_jobs(quality_profile,academic_year,id);
ALTER TABLE question_generation_jobs ADD COLUMN repair_payload_hash TEXT;
