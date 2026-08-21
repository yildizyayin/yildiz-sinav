-- SYNTHETIC DEMO ONLY. This is not a market optical form definition.
-- Applied only by demo seed commands so camera OMR and personalized printing can be end-to-end tested safely.
UPDATE optical_template_versions
SET camera_geometry='{"regions":[{"id":"student_no","type":"bubble-grid","purpose":"student-number","xMm":20,"yMm":40,"widthMm":40,"heightMm":55,"positions":4,"values":["0","1","2","3","4","5","6","7","8","9"],"bubbleRadiusMm":2,"markThreshold":0.45,"doubleMarkDelta":0.07},{"id":"booklet","type":"bubble-grid","purpose":"booklet","xMm":75,"yMm":40,"widthMm":20,"heightMm":15,"positions":1,"values":["A","B"],"bubbleRadiusMm":2,"markThreshold":0.45,"doubleMarkDelta":0.07},{"id":"mat","type":"bubble-grid","purpose":"answers","subjectCode":"MAT","xMm":20,"yMm":105,"widthMm":50,"heightMm":100,"questionCount":10,"options":["A","B","C","D","E"],"bubbleRadiusMm":2,"markThreshold":0.45,"doubleMarkDelta":0.07},{"id":"tur","type":"bubble-grid","purpose":"answers","subjectCode":"TUR","xMm":80,"yMm":105,"widthMm":50,"heightMm":100,"questionCount":10,"options":["A","B","C","D","E"],"bubbleRadiusMm":2,"markThreshold":0.45,"doubleMarkDelta":0.07},{"id":"fen","type":"bubble-grid","purpose":"answers","subjectCode":"FEN","xMm":140,"yMm":105,"widthMm":50,"heightMm":100,"questionCount":10,"options":["A","B","C","D","E"],"bubbleRadiusMm":2,"markThreshold":0.45,"doubleMarkDelta":0.07}]}'
WHERE id='optv_demo';

INSERT INTO optical_definition_validations
(optical_template_version_id,parser_test_passed,parser_test_record_count,parser_tested_at,last_error,updated_at)
VALUES ('optv_demo',1,1,CURRENT_TIMESTAMP,NULL,CURRENT_TIMESTAMP)
ON CONFLICT(optical_template_version_id) DO UPDATE SET
 parser_test_passed=1,
 parser_test_record_count=1,
 parser_tested_at=CURRENT_TIMESTAMP,
 last_error=NULL,
 updated_at=CURRENT_TIMESTAMP;

UPDATE optical_templates SET status='READY',active=1 WHERE id='opt_demo';
UPDATE optical_template_versions SET active=1 WHERE id='optv_demo';

INSERT INTO printer_optical_calibrations
(id,printer_profile_id,optical_template_version_id,status,offset_x_mm,offset_y_mm,scale_x,scale_y,rotation_deg,attempt_count,verified_at,updated_at)
VALUES ('cal_demo_ready','printer_canon','optv_demo','READY',0.22,-0.18,1.001,0.9995,0.04,2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT(printer_profile_id,optical_template_version_id) DO UPDATE SET
 status='READY',
 offset_x_mm=0.22,
 offset_y_mm=-0.18,
 scale_x=1.001,
 scale_y=0.9995,
 rotation_deg=0.04,
 attempt_count=2,
 verified_at=CURRENT_TIMESTAMP,
 updated_at=CURRENT_TIMESTAMP;
