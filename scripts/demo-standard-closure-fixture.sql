-- SYNTHETIC STAGING ACCEPTANCE FIXTURE ONLY.
-- The linked public video is supplementary demo evidence, not an official MEB/YOK/OSYM source.
PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO worksheet_outcomes(worksheet_id,subject_id,outcome_id) VALUES
('ws_num_1','sub_mat','out_mat_1'),
('ws_num_1','sub_fen','out_fen_1');

WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<20)
INSERT OR REPLACE INTO worksheet_question_links(id,worksheet_id,subject_id,question_no,outcome_id,solution_url,topic_url)
SELECT 'wql_std_mat_'||n,'ws_num_1','sub_mat',n,'out_mat_1','https://www.youtube.com/watch?v=2fu4wiEaz6o','https://www.youtube.com/watch?v=2fu4wiEaz6o' FROM seq;

WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<20)
INSERT OR REPLACE INTO worksheet_question_links(id,worksheet_id,subject_id,question_no,outcome_id,solution_url,topic_url)
SELECT 'wql_std_fen_'||n,'ws_num_1','sub_fen',n,'out_fen_1','https://www.youtube.com/watch?v=2fu4wiEaz6o','https://www.youtube.com/watch?v=2fu4wiEaz6o' FROM seq;

INSERT OR REPLACE INTO video_links(id,exam_question_id,outcome_id,link_type,url,approved,title) VALUES
('video_std_solution_ratio','q_std_hist_mat_1','out_mat_1','SOLUTION','https://www.youtube.com/watch?v=2fu4wiEaz6o',1,'Standard staging - oran soru destegi'),
('video_std_topic_ratio',NULL,'out_mat_1','TOPIC','https://www.youtube.com/watch?v=2fu4wiEaz6o',1,'Standard staging - oran konu tekrari');
