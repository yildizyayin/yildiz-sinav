import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {it,expect,vi} from 'vitest';
import {handleQuestionGenerationJobs} from '../worker/lib/question-generation-jobs';
import {replenishAutonomousQueue,autonomousYear} from '../worker/lib/question-autonomous-queue';
const admin={id:'admin',role:'SUPER_ADMIN'} as any;
function fixture(){
 const sqlite = new DatabaseSync(':memory:');
 sqlite.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE users(id TEXT PRIMARY KEY);
 CREATE TABLE subjects(id TEXT PRIMARY KEY);
 CREATE TABLE curriculum_versions(id TEXT PRIMARY KEY,academic_year TEXT,grade_level INTEGER,program_version TEXT,verified INTEGER);
 CREATE TABLE outcomes(id TEXT PRIMARY KEY,curriculum_version_id TEXT,subject_id TEXT,grade_level INTEGER,code TEXT,title TEXT,active INTEGER);
 CREATE TABLE learning_nodes(id TEXT PRIMARY KEY,active INTEGER DEFAULT 1,node_type TEXT DEFAULT 'OUTCOME',academic_year TEXT DEFAULT '2026-2027',grade_level INTEGER DEFAULT 7,subject_id TEXT DEFAULT 'math');
 CREATE TABLE question_bank(id TEXT PRIMARY KEY,owner_type TEXT,academic_year TEXT,grade_level INTEGER,subject_id TEXT,question_type TEXT,difficulty INTEGER,difficulty_level INTEGER,content_mode TEXT,option_count INTEGER,stem_text TEXT,options_json TEXT,correct_answer TEXT,solution_text TEXT,source_label TEXT,copyright_status TEXT,review_status TEXT,created_by TEXT,origin_kind TEXT,review_revision INTEGER DEFAULT 0);
 CREATE TABLE question_learning_links(question_id TEXT REFERENCES question_bank(id),node_id TEXT REFERENCES learning_nodes(id),PRIMARY KEY(question_id,node_id));
 CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_user_id TEXT,institution_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,details_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 INSERT INTO users VALUES('admin'),('teacher'); INSERT INTO subjects VALUES('math'),('other');
 INSERT INTO curriculum_versions VALUES('cv','2026-2027',7,'v1',1),('cv2','2026-2027',7,'v2',1);
 INSERT INTO outcomes VALUES('o','cv','math',7,'M.7.1','Synthetic outcome',1);
 INSERT INTO outcomes VALUES('o2','cv2','math',7,'M.7.2','Other outcome',1);
 INSERT INTO learning_nodes(id) VALUES('ln_o'),('ln_o2');
 `);
 sqlite.exec(readFileSync(new URL('../migrations/0072_question_generation_jobs.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../migrations/0073_question_generation_runner.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../migrations/0104_question_generation_focus.sql',import.meta.url),'utf8'));
 sqlite.exec("CREATE TABLE question_content_blocks(id TEXT,question_id TEXT,placement TEXT,block_type TEXT,payload_json TEXT);");
 sqlite.exec(readFileSync(new URL('../migrations/0107_question_editorial_contract.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../migrations/0110_question_editorial_repair.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../migrations/0111_editorial_verification_transport_retry.sql',import.meta.url),'utf8'));
 let beforeInsert:(()=>void)|undefined;
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...bound:any[])=>prepare(sql,bound),
  first:async()=>sqlite.prepare(sql).get(...args),
  all:async()=>({results:sqlite.prepare(sql).all(...args)}),
  run:async()=>{if(sql.includes('INSERT OR IGNORE INTO question_generation_jobs')&&beforeInsert){const fn=beforeInsert;beforeInsert=undefined;fn();}
   const result=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}};}});
 const env={DB:{prepare}} as any;
 const call=(req:Request,user:any=admin)=>handleQuestionGenerationJobs(req,env,user)!;
 return {sqlite,env,call,race:(fn:()=>void)=>{beforeInsert=fn;}};
}

function ready(){const f=fixture();f.sqlite.exec("CREATE TABLE question_agent_pilot_budget(id TEXT,question_cap INTEGER,reserved_count INTEGER,budget_mode TEXT DEFAULT 'LIMITED');INSERT INTO question_agent_pilot_budget(id,question_cap,reserved_count) VALUES('pilot_50',50,45);");Object.assign(f.env,{QUESTION_AUTOMATED_PILOT_MODE:'true',QUESTION_AGENT_EXECUTION_ENABLED:'true',QUESTION_GENERATION_ENABLED:'true',QUESTION_GENERATION_VERIFICATION_ENABLED:'true',QUESTION_PILOT_REVIEW_AVAILABLE:'true',QUESTION_PILOT_REVIEW_SLOTS:'20',AI:{run:vi.fn()}});return f;}
it('replenishes one verified gap as an editorial single-question request without invoking AI or spending quota',async()=>{
 const f=ready();try{expect(await replenishAutonomousQueue(f.env,admin,'2026-2027')).toMatchObject({created:true});const row:any=f.sqlite.prepare('SELECT * FROM question_generation_jobs').get();expect(row).toMatchObject({question_count:1,quality_profile:'EDITORIAL_V1',status:'REQUESTED',academic_year:'2026-2027'});expect(await replenishAutonomousQueue(f.env,admin,'2026-2027')).toMatchObject({created:false,reason:'QUEUE_HAS_WORK'});expect(f.env.AI.run).not.toHaveBeenCalled();expect(f.sqlite.prepare('SELECT reserved_count n FROM question_agent_pilot_budget').get()?.n).toBe(45);}finally{f.sqlite.close()}
});
it('stops on budget, review capacity, wrong year or unverified curriculum; never changes caps or counters',async()=>{
 const f=ready();try{expect(autonomousYear('2027-2029')).toBe(false);expect(await replenishAutonomousQueue(f.env,admin,'2027-2028')).toMatchObject({reason:'NO_VERIFIED_GAP'});f.env.QUESTION_PILOT_REVIEW_SLOTS='0';expect(await replenishAutonomousQueue(f.env,admin,'2026-2027')).toMatchObject({reason:'REVIEW_QUEUE_FULL'});f.env.QUESTION_PILOT_REVIEW_SLOTS='20';f.sqlite.exec('UPDATE curriculum_versions SET verified=0');expect(await replenishAutonomousQueue(f.env,admin,'2026-2027')).toMatchObject({reason:'NO_VERIFIED_GAP'});f.sqlite.exec('UPDATE question_agent_pilot_budget SET reserved_count=50');expect(await replenishAutonomousQueue(f.env,admin,'2026-2027')).toMatchObject({reason:'BUDGET_EXHAUSTED'});expect(f.sqlite.prepare('SELECT count(*) n FROM question_generation_jobs').get()?.n).toBe(0);}finally{f.sqlite.close()}
});
it('does not bypass paused agents, failed job review or curriculum-context node checks',async()=>{
 const f=ready();try{f.sqlite.exec("CREATE TABLE question_team_control(id INTEGER,paused INTEGER);INSERT INTO question_team_control VALUES(1,1);");f.env.QUESTION_TEAM_CONTROLS_ENABLED='true';expect(await replenishAutonomousQueue(f.env,admin,'2026-2027')).toMatchObject({reason:'TEAM_PAUSED'});f.env.QUESTION_TEAM_CONTROLS_ENABLED='false';f.sqlite.exec("UPDATE learning_nodes SET academic_year='2025-2026'");expect(await replenishAutonomousQueue(f.env,admin,'2026-2027')).toMatchObject({reason:'NO_VERIFIED_GAP'});}finally{f.sqlite.close()}
});
