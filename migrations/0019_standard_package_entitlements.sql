PRAGMA foreign_keys = ON;

-- Standard package must match the features actually delivered in the Standard student/institution flows.
UPDATE platform_features
SET stage='STANDARD', enabled_default=1
WHERE feature_key='GAMES';

INSERT OR IGNORE INTO platform_features(feature_key,label,stage,enabled_default) VALUES
 ('PERSONAL_BOOKS','Kişiye Özel Kitap','STANDARD',1),
 ('ZERO_ERROR_BOOKLET','Sıfır Hata Kitapçığı','STANDARD',1),
 ('STANDARD_READINESS','Standard Hazırlık Denetçisi','STANDARD',1);

UPDATE membership_plans
SET entitlement_json='{"basic_results":true,"basic_target":true,"basic_nibiru":true,"worksheets":true,"question_review":true,"micro_learning_video":true,"student_personalization":true,"student_countdown":true,"multi_academic_target":true,"personal_books":true,"zero_error_booklet":true,"games_grade_5_6":true}'
WHERE code='STANDARD';
