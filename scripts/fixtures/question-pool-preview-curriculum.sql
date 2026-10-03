-- Isolated PR preview only. Structural acceptance fixtures, not MEB content.
INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,authority,verified,source_kind)
VALUES('cv_question_pool_preview','2026-2027',7,'SYNTHETIC_PREVIEW','SYNTHETIC_TEST',1,'PREVIEW_FIXTURE')
ON CONFLICT(id) DO UPDATE SET verified=1;
UPDATE outcomes SET curriculum_version_id='cv_question_pool_preview'
WHERE grade_level=7 AND official=0 AND id IN ('out_mat_1','out_mat_2','out_tur_1','out_tur_2','out_fen_1','out_fen_2');
