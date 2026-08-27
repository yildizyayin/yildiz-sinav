import { mkdirSync, writeFileSync } from 'node:fs';

const OUT='tmp/scale-100k';
const STUDENTS=100_000;
const CHUNK=1_000;
const CLASSES=100;
mkdirSync(OUT,{recursive:true});

const cleanup=`PRAGMA foreign_keys=ON;
DELETE FROM exam_participants WHERE institution_id='inst_scale100k';
DELETE FROM exam_booklets WHERE exam_id='exam_scale100k';
DELETE FROM exams WHERE id='exam_scale100k';
DELETE FROM student_enrollments WHERE institution_id='inst_scale100k';
DELETE FROM student_entities WHERE id LIKE 'scale100k_stu_%';
DELETE FROM classes WHERE institution_id='inst_scale100k';
DELETE FROM institution_seasons WHERE institution_id='inst_scale100k';
DELETE FROM institutions WHERE id='inst_scale100k';
`;

const header=`PRAGMA foreign_keys=ON;
INSERT INTO institutions(id,name,code,city,district,status,demo_mode) VALUES('inst_scale100k','Anunex 100K Staging Benchmark','SCALE100K','İstanbul','Benchmark','ACTIVE',1);
INSERT INTO institution_seasons(id,institution_id,academic_year,status,started_at) VALUES('season_scale100k','inst_scale100k','2026-2027','ACTIVE',date('now'));
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<${CLASSES})
INSERT INTO classes(id,institution_id,season_id,grade_level,section,name)
SELECT 'scale100k_class_'||printf('%03d',n),'inst_scale100k','season_scale100k',8,'B'||printf('%03d',n),'8/B'||printf('%03d',n) FROM seq;
INSERT INTO exams(id,owner_type,institution_id,academic_year,title,exam_type,grade_level,exam_date,status,sponsor_mode)
VALUES('exam_scale100k','INSTITUTION','inst_scale100k','2026-2027','Anunex 100K Benchmark Sınavı','DEMO',8,date('now'),'ACTIVE','INSTITUTION');
INSERT INTO exam_booklets(id,exam_id,code,active) VALUES('booklet_scale100k_a','exam_scale100k','A',1);
INSERT INTO exam_booklets(id,exam_id,code,active) VALUES('booklet_scale100k_b','exam_scale100k','B',1);
`;

const entityStatements=[];
const enrollmentStatements=[];
const participantStatements=[];
for(let base=1;base<=STUDENTS;base+=CHUNK){
  const end=Math.min(STUDENTS,base+CHUNK-1);
  const count=end-base;
  entityStatements.push(`WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM seq WHERE n<${count})
INSERT INTO student_entities(id,first_name,last_name,normalized_name,status,activated_at)
SELECT 'scale100k_stu_'||printf('%06d',${base}+n),'Scale',printf('Student %06d',${base}+n),printf('scale student %06d',${base}+n),'ACTIVE',CURRENT_TIMESTAMP FROM seq;`);
  enrollmentStatements.push(`WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM seq WHERE n<${count})
INSERT INTO student_enrollments(id,student_id,institution_id,season_id,class_id,student_number,grade_level,section,status)
SELECT 'scale100k_enr_'||printf('%06d',${base}+n),'scale100k_stu_'||printf('%06d',${base}+n),'inst_scale100k','season_scale100k','scale100k_class_'||printf('%03d',(((${base}+n)-1)%${CLASSES})+1),printf('%06d',${base}+n),8,'B'||printf('%03d',(((${base}+n)-1)%${CLASSES})+1),'ACTIVE' FROM seq;`);
  participantStatements.push(`WITH ranked AS (
  SELECT s.id student_id,e.season_id,e.student_number,s.first_name,s.last_name,c.name class_name,
         row_number() OVER (ORDER BY cast(e.student_number AS INTEGER),s.id) rn
  FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id JOIN classes c ON c.id=e.class_id
  WHERE e.institution_id='inst_scale100k' AND e.status='ACTIVE' AND s.status='ACTIVE'
), slice AS (SELECT * FROM ranked WHERE rn>=${base} AND rn<=${end})
INSERT OR IGNORE INTO exam_participants(id,exam_id,institution_id,season_id,student_id,student_number_snapshot,name_snapshot,class_snapshot,booklet_code,participant_status)
SELECT 'scale100k_ep_'||student_id,'exam_scale100k','inst_scale100k',season_id,student_id,student_number,trim(first_name||' '||last_name),class_name,CASE ((rn-1)%2) WHEN 0 THEN 'A' ELSE 'B' END,'ACTIVE' FROM slice;`);
}

writeFileSync(`${OUT}/cleanup.sql`,cleanup);
writeFileSync(`${OUT}/setup.sql`,cleanup+'\n'+header+'\n'+entityStatements.join('\n')+'\n'+enrollmentStatements.join('\n'));
writeFileSync(`${OUT}/participants.sql`,participantStatements.join('\n'));
writeFileSync(`${OUT}/verify.sql`,`SELECT count(*) student_count FROM student_enrollments WHERE institution_id='inst_scale100k';\nSELECT count(*) participant_count FROM exam_participants WHERE institution_id='inst_scale100k' AND exam_id='exam_scale100k';\nSELECT count(DISTINCT class_id) class_count FROM student_enrollments WHERE institution_id='inst_scale100k';\nSELECT count(DISTINCT booklet_code) booklet_count FROM exam_participants WHERE institution_id='inst_scale100k' AND exam_id='exam_scale100k';\n`);
console.log(JSON.stringify({students:STUDENTS,chunkSize:CHUNK,chunks:Math.ceil(STUDENTS/CHUNK),classes:CLASSES,out:OUT}));
