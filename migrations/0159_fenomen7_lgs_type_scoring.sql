-- Owner (4 Nov): '7.SINIF FENOMEN DENEME SINAVI-1' is scored with the 5–7. sınıf LGS-type profile (100–500) instead of
-- the MEB LGS rule. Applies only while the exam has no evaluated student; otherwise nothing changes.
UPDATE exams SET scoring_rule_version_id='srv_anunex_lgs_type_2627',updated_at=CURRENT_TIMESTAMP
WHERE id='exam_888040b1-f4d4-4523-960b-4b8ce3b67f4d' AND scoring_rule_version_id='srv_meb_lgs_2627'
  AND EXISTS (SELECT 1 FROM scoring_rule_versions WHERE id='srv_anunex_lgs_type_2627' AND verified=1)
  AND NOT EXISTS (SELECT 1 FROM exam_participants WHERE exam_id='exam_888040b1-f4d4-4523-960b-4b8ce3b67f4d');
INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json)
SELECT 'aud_mig0159_fenomen7',NULL,NULL,'EXAM_SCORING_PROFILE_CORRECTED','exam',id,'{"from":"srv_meb_lgs_2627","to":"srv_anunex_lgs_type_2627","reason":"Sahip kararı 4 Kasım: 5–7. sınıf LGS tipi puan","migration":"0159"}'
FROM exams WHERE id='exam_888040b1-f4d4-4523-960b-4b8ce3b67f4d' AND scoring_rule_version_id='srv_anunex_lgs_type_2627'
  AND NOT EXISTS (SELECT 1 FROM audit_logs WHERE id='aud_mig0159_fenomen7');
