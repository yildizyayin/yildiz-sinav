PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO platform_features(feature_key,label,stage,enabled_default)
VALUES('ASSIGNMENTS','Akıllı Ödevlendirme','NEXT',0);

-- Bridge the verified curriculum/outcome model already used by Standard into the new Learning Graph.
INSERT OR IGNORE INTO learning_nodes(id,academic_year,node_type,subject_id,grade_level,code,title,parent_id,official,source_url,active)
SELECT 'ln_'||o.id,
       COALESCE(cv.academic_year,'2026-2027'),
       'OUTCOME',
       o.subject_id,
       o.grade_level,
       COALESCE(NULLIF(o.code,''),'OUTCOME:'||o.id),
       o.title,
       NULL,
       o.official,
       cv.source_url,
       o.active
FROM outcomes o
LEFT JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id;

-- Existing outcome evidence immediately seeds a conservative Learning Graph state.
INSERT OR IGNORE INTO student_learning_state(student_id,node_id,mastery,confidence,evidence_count,last_evidence_at,updated_at)
SELECT r.student_id,
       'ln_'||r.outcome_id,
       ROUND(MIN(1.0,MAX(0.0,AVG(r.success_rate)/100.0)),4),
       ROUND(MIN(1.0,0.20 + (COUNT(*)*0.12)),4),
       SUM(COALESCE(r.evidence_count,0)),
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM outcome_results r
JOIN learning_nodes n ON n.id='ln_'||r.outcome_id
GROUP BY r.student_id,r.outcome_id;

-- Record the existing exam evidence in the append-only graph ledger as well.
INSERT OR IGNORE INTO learning_evidence(id,student_id,node_id,source_type,source_id,result,weight,observed_at)
SELECT 'legacy_'||r.student_id||'_'||r.exam_id||'_'||r.outcome_id,
       r.student_id,
       'ln_'||r.outcome_id,
       'EXAM',
       r.exam_id,
       MIN(1.0,MAX(0.0,r.success_rate/100.0)),
       CASE WHEN r.evidence_count>0 THEN MIN(5.0,MAX(1.0,r.evidence_count)) ELSE 1.0 END,
       CURRENT_TIMESTAMP
FROM outcome_results r
JOIN learning_nodes n ON n.id='ln_'||r.outcome_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_evidence_legacy_unique ON learning_evidence(id);
