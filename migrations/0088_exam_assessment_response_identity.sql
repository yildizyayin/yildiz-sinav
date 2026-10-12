-- Exam questions and question-bank questions have distinct identities.
-- Keep existing question-bank references intact; preserve exam response evidence separately.
ALTER TABLE assessment_responses ADD COLUMN exam_question_id TEXT REFERENCES exam_questions(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX assessment_responses_exam_question ON assessment_responses(run_id,exam_question_id) WHERE exam_question_id IS NOT NULL;
