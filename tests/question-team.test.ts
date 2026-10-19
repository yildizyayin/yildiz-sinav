import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {handleQuestionTeam} from '../worker/lib/question-team';
import {questionTeamPaused} from '../worker/lib/question-team-policy';
const admin={id:'admin',role:'SUPER_ADMIN'} as any;
const base='https://test/api/question-bank-standard/team';
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE users(id TEXT PRIMARY KEY,active INTEGER,role TEXT);INSERT INTO users VALUES('admin',1,'SUPER_ADMIN');
 CREATE TABLE question_bank(id TEXT PRIMARY KEY,review_revision INTEGER,stem_text TEXT,grade_level INTEGER,subject_id TEXT,review_status TEXT,copyright_status TEXT,source_model TEXT,owner_type TEXT,academic_year TEXT,updated_at TEXT);
 CREATE TABLE question_assets(id TEXT PRIMARY KEY);
 CREATE TABLE question_agent_pilot_budget(id TEXT,question_cap INTEGER,reserved_count INTEGER,budget_mode TEXT DEFAULT 'LIMITED');INSERT INTO question_agent_pilot_budget(id,question_cap,reserved_count) VALUES('pilot_50',50,45);
 CREATE TABLE question_generation_jobs(id TEXT,question_count INTEGER DEFAULT 1,academic_year TEXT,status TEXT,priority INTEGER,created_at TEXT);
 CREATE TABLE audit_logs(id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,created_at TEXT,details_json TEXT);`);
 db.exec('ALTER TABLE question_bank ADD COLUMN origin_kind TEXT;');
 db.exec(readFileSync(new URL('../migrations/0105_question_team_media.sql',import.meta.url),'utf8'));
 db.exec("CREATE TABLE question_content_blocks(id TEXT,question_id TEXT,placement TEXT,block_type TEXT,payload_json TEXT);");
 db.exec(readFileSync(new URL('../migrations/0107_question_editorial_contract.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/0110_question_editorial_repair.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/0111_editorial_verification_transport_retry.sql',import.meta.url),'utf8'));
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args),all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}})});
 const env={DB:{prepare},ENVIRONMENT:'staging',QUESTION_TEAM_CONTROLS_ENABLED:'true',QUESTION_GENERATION_ENABLED:'true',QUESTION_GENERATION_VERIFICATION_ENABLED:'true',QUESTION_VIDEO_RENDER_ENABLED:'true',QUESTION_GENERATION_MODEL:'producer',QUESTION_GENERATION_VERIFIER_MODEL:'verifier',AI:{}} as any;
 const req=(body?:any,origin='https://test')=>new Request(base+(body?'/control':''),{method:body?'PATCH':'GET',headers:{Origin:origin},...(body?{body:JSON.stringify(body)}:{})});
 return {db,env,req};
}
it('shows actual reserved capacity, separate capabilities and disabled automatic execution',async()=>{
 const f=fixture();try{const r=await handleQuestionTeam(f.req(),f.env,admin),p:any=await r.json();expect(r.status).toBe(200);expect(p.budget).toMatchObject({cap:50,reserved:45,remaining:5,noRefund:true});expect(p.roster).toHaveLength(5);expect(p.roster.find((a:any)=>a.key==='ORIGINALITY').status).toBe('REVIEW_ASSIST');expect(p.scheduler.executionEnabled).toBe(false);expect(p.videoProof).toEqual({technicalVerified:false,studentVideoCount:0});expect(p.usage.billingVerified).toBe(false);}finally{f.db.close();}
});
it('gates by role and same origin, rejects stale controls and keeps an immutable event',async()=>{
 const f=fixture();try{const body={agentKey:'VERIFIER',paused:true,expectedRevision:0};expect((await handleQuestionTeam(f.req(),f.env,null)).status).toBe(401);expect((await handleQuestionTeam(f.req(body),f.env,{...admin,role:'TEACHER'})).status).toBe(403);expect((await handleQuestionTeam(f.req(body,'https://foreign'),f.env,admin)).status).toBe(403);expect((await handleQuestionTeam(f.req(body),f.env,admin)).status).toBe(200);expect((await handleQuestionTeam(f.req(body),f.env,admin)).status).toBe(409);expect(await questionTeamPaused(f.env,['VERIFIER'])).toBe(true);expect(await questionTeamPaused(f.env,['GENERATOR'])).toBe(false);expect(f.db.prepare('SELECT count(*) n FROM question_team_control_events').get()?.n).toBe(1);expect(()=>f.db.exec('DELETE FROM question_team_control_events')).toThrow(/IMMUTABLE/);expect(f.db.prepare("SELECT reserved_count FROM question_agent_pilot_budget").get()?.reserved_count).toBe(45);}finally{f.db.close();}
});
it('fails closed if controls are incomplete without enabling scheduling on resume',async()=>{
 const f=fixture();try{f.db.exec("DELETE FROM question_team_agent_control WHERE agent_key='VIDEO'");expect(await questionTeamPaused(f.env,['MEDIA','VIDEO'])).toBe(true);f.db.exec('DELETE FROM question_team_control');expect(await questionTeamPaused(f.env,['GENERATOR'])).toBe(true);expect((await handleQuestionTeam(f.req({agentKey:'TEAM',paused:false,expectedRevision:0}),f.env,admin)).status).toBe(409);}finally{f.db.close();}
});

it('reports real review queue backpressure and the configured autonomous year without pretending readiness',async()=>{
 const f=fixture();try{Object.assign(f.env,{QUESTION_AGENT_EXECUTION_ENABLED:'true',QUESTION_AGENT_DISPATCH_PREVIEW:'true',QUESTION_AUTOMATED_PILOT_MODE:'true',QUESTION_AUTOMATED_ACADEMIC_YEAR:'2027-2028',QUESTION_AGENT_SERVICE_ACTOR_ID:'admin',QUESTION_PILOT_REVIEW_SLOTS:'1',QUESTION_PILOT_REVIEW_AVAILABLE:'true'});f.db.exec("INSERT INTO question_bank(id,owner_type,origin_kind,review_status,academic_year) VALUES('q','PLATFORM','AI_GENERATED','REVIEW','2026-2027')");const p:any=await(await handleQuestionTeam(f.req(),f.env,admin)).json();expect(p.scheduler).toMatchObject({ready:false,academicYear:'2027-2028',availableReviewSlots:0,queuedReviewCount:1});expect(p.scheduler.reasons).toContain('REVIEW_QUEUE_FULL');}finally{f.db.close()}
});
it('shows unlimited honestly while preserving usage and finite dispatch capacity',async()=>{
 const f=fixture();try{f.db.exec("UPDATE question_agent_pilot_budget SET budget_mode='UNLIMITED',question_cap=NULL,reserved_count=500001");const p:any=await(await handleQuestionTeam(f.req(),f.env,admin)).json();expect(p.budget).toEqual({mode:'UNLIMITED',cap:null,reserved:500001,remaining:null,effectiveRemaining:null,dispatchCapacity:50,noRefund:true});expect(p.commonWrittenPolicy).toMatchObject({decisionStatus:'FINALIZED',targetScenarioVerified:false,officialPlatformIntegration:false});expect(p.commonWrittenPolicy.decisions.aiMayFinalizeScores).toBe(false);}finally{f.db.close();}
});
