import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {REPORT_SNAPSHOT_SQL} from '../worker/lib/report-snapshot';

/** Hotfix 30 Oct: a TYT freeze with ~3k outcomes and 13k answers ran past D1's limit. The lookup must stay mapping-driven. */
describe('frozen report payload scales with the outcome catalogue',()=>{
 it('builds payloads for 100 participants × 120 answers against 3,000 outcomes quickly',()=>{
  const db=new DatabaseSync(':memory:');
  try{
   db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE exams(id TEXT PRIMARY KEY,title TEXT,exam_date TEXT,exam_type TEXT,academic_year TEXT);
    CREATE TABLE question_bank(id TEXT PRIMARY KEY);
    CREATE TABLE subjects(id TEXT PRIMARY KEY,code TEXT,name TEXT);
    CREATE TABLE exam_questions(id TEXT PRIMARY KEY,exam_id TEXT,question_no INTEGER,global_no INTEGER);
    CREATE TABLE outcomes(id TEXT PRIMARY KEY,subject_id TEXT,curriculum_version_id TEXT,code TEXT,topic TEXT,subtopic TEXT,title TEXT);
    CREATE TABLE curriculum_versions(id TEXT PRIMARY KEY,academic_year TEXT,grade_level INTEGER,program_version TEXT,verified INTEGER);
    CREATE TABLE exam_participants(id TEXT PRIMARY KEY,exam_id TEXT,booklet_code TEXT,name_snapshot TEXT,student_number_snapshot TEXT,class_snapshot TEXT);
    CREATE TABLE exam_results(participant_id TEXT,correct_count INTEGER,wrong_count INTEGER,blank_count INTEGER,success_percent REAL);
    CREATE TABLE student_answers(participant_id TEXT,exam_question_id TEXT,status TEXT,answer TEXT);
    CREATE TABLE subject_results(participant_id TEXT,subject_id TEXT,correct_count INTEGER,wrong_count INTEGER,blank_count INTEGER,net REAL,success_percent REAL);
    CREATE TABLE exam_result_snapshots(exam_id TEXT,snapshot_version INTEGER,payload_json TEXT,participant_id TEXT,net REAL,score REAL,institution_rank INTEGER);
    CREATE TABLE question_outcomes(exam_question_id TEXT,outcome_id TEXT);
    CREATE TABLE tyt_optional_philosophy_results(participant_id TEXT,subject_id TEXT,booklet_code TEXT,correct_count INTEGER,wrong_count INTEGER,blank_count INTEGER,invalid_count INTEGER,evidence_count INTEGER,success_percent REAL);
    `);
   db.exec(readFileSync(new URL('../migrations/0101_studio_exam_booklet_outcomes.sql',import.meta.url),'utf8'));
   db.exec(`INSERT INTO exams VALUES('e','TYT',NULL,'TYT','2026-2027'); INSERT INTO subjects VALUES('s','TUR','Türkçe'); INSERT INTO curriculum_versions VALUES('v','2026-2027',12,'m',1);`);
   const o=db.prepare('INSERT INTO outcomes VALUES(?,?,?,?,?,?,?)');for(let i=0;i<3000;i++)o.run(`o${i}`,'s','v',`K${i}`,null,null,`K ${i}`);
   const q=db.prepare('INSERT INTO exam_questions VALUES(?,?,?,?)');const qo=db.prepare('INSERT INTO question_outcomes VALUES(?,?)');
   for(let i=1;i<=120;i++){q.run(`eq${i}`,'e',i,i);qo.run(`eq${i}`,`o${i*7}`)}
   const p=db.prepare('INSERT INTO exam_participants VALUES(?,?,?,?,?,?)'),r=db.prepare('INSERT INTO exam_results VALUES(?,?,?,?,?)'),a=db.prepare('INSERT INTO student_answers VALUES(?,?,?,?)'),s=db.prepare('INSERT INTO exam_result_snapshots VALUES(?,?,?,?,?,?,?)');
   db.exec('BEGIN');for(let k=0;k<100;k++){const id=`p${k}`;p.run(id,'e','A',id,String(k),'12A');r.run(id,60,40,20,50);s.run('e',1,null,id,0,0,k+1);for(let i=1;i<=120;i++)a.run(id,`eq${i}`,(i+k)%3?'CORRECT':'WRONG','A')}db.exec('COMMIT');
   const started=Date.now();db.prepare(REPORT_SNAPSHOT_SQL).run('e',1);const took=Date.now()-started;
   const one=JSON.parse((db.prepare("SELECT payload_json FROM exam_result_snapshots WHERE participant_id='p0'").get() as any).payload_json);
   expect(one.questionEvidence).toHaveLength(120);
   expect(one.questionEvidence[0].outcomeRefs[0].outcomeId).toBe('o7');
   expect(one.outcomes).toHaveLength(120);
   expect(took).toBeLessThan(5000);
  }finally{db.close()}
 });
});
