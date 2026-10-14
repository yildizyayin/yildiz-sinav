import {editorialQuestion,editorialScores} from './fixtures/editorial-question';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { runQuestionGenerationJob, DEFAULT_QUESTION_GENERATION_MODEL,questionDraftSchema } from '../worker/lib/question-generation-runner';
import { handleQuestionGenerationJobs } from '../worker/lib/question-generation-jobs';

const admin={id:'admin',role:'SUPER_ADMIN'} as any;
const base='/api/question-bank-standard/generation-jobs';
const context={curriculumVersionId:'cv',academicYear:'2026-2027',gradeLevel:7,subjectId:'math',programVersion:'v1'};
const ddl=`CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE subjects(id TEXT PRIMARY KEY);
 CREATE TABLE curriculum_versions(id TEXT PRIMARY KEY,academic_year TEXT,grade_level INTEGER,program_version TEXT,verified INTEGER);
 CREATE TABLE outcomes(id TEXT PRIMARY KEY,curriculum_version_id TEXT,subject_id TEXT,grade_level INTEGER,code TEXT,title TEXT,active INTEGER);
 CREATE TABLE learning_nodes(id TEXT PRIMARY KEY,active INTEGER DEFAULT 1,node_type TEXT DEFAULT 'OUTCOME',academic_year TEXT DEFAULT '2026-2027',grade_level INTEGER DEFAULT 7,subject_id TEXT DEFAULT 'math');
 CREATE TABLE question_bank(id TEXT PRIMARY KEY,owner_type TEXT,academic_year TEXT,grade_level INTEGER,subject_id TEXT,question_type TEXT,difficulty INTEGER,difficulty_level INTEGER,content_mode TEXT,option_count INTEGER,stem_text TEXT,options_json TEXT,correct_answer TEXT,solution_text TEXT,source_label TEXT,copyright_status TEXT,review_status TEXT,created_by TEXT,origin_kind TEXT,review_revision INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE question_learning_links(question_id TEXT REFERENCES question_bank(id),node_id TEXT REFERENCES learning_nodes(id),PRIMARY KEY(question_id,node_id));
 CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_user_id TEXT,institution_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,details_json TEXT);
 INSERT INTO users VALUES('admin'); INSERT INTO subjects VALUES('math'); INSERT INTO learning_nodes(id) VALUES('ln_o');`;
const migration=(n:string)=>readFileSync(new URL(`../migrations/${n}`,import.meta.url),'utf8').replace(/^--.*$/gm,'').replace(/\n/g,' ');
const draft=(stemText='Synthetic arithmetic question')=>({stemText,options:['One','Two','Three','Four'].map((text,i)=>({label:String.fromCharCode(65+i),text})),correctAnswer:'B',solutionText:'Adding one and one yields two.',difficultyLevel:3});
const output=(questions:any[]=[draft()])=>({choices:[{message:{content:JSON.stringify({questions})}}]});
const request=(path=base,method='POST',body?:any)=>new Request(`https://test${path}`,{method,...(body?{body:JSON.stringify(body),headers:{'content-type':'application/json'}}:{})});
let mf:Miniflare, db:any, env:any, provider:ReturnType<typeof vi.fn>;
let beforeBatch:(()=>Promise<void>)|undefined, afterClaim:(()=>Promise<void>)|undefined;
const sqlReads:string[]=[];
function prepared(sql:string,args:any[]=[]):any{
 const stmt=()=>db.prepare(sql).bind(...args);
 return {bind:(...bound:any[])=>prepared(sql,bound),first:async(...a:any[])=>{sqlReads.push(sql);return stmt().first(...a);},all:async()=>{throw new Error('runner must not load bank rows');},run:async()=>{
  const result=await stmt().run();
  if(sql.includes("SET status='RUNNING',attempt_count=")&&afterClaim){const hook=afterClaim;afterClaim=undefined;await hook();}
  return result;
 },sql,args};
}
async function seed(){await db.exec(`UPDATE learning_nodes SET grade_level=7; INSERT INTO curriculum_versions VALUES('cv','2026-2027',7,'v1',1); INSERT INTO outcomes VALUES('o','cv','math',7,'M.7.1','Synthetic outcome',1);`);}
async function create(count=1){
 const res=await handleQuestionGenerationJobs(request(base,'POST',{outcomeId:'o',expectedContext:context,requestKey:crypto.randomUUID(),questionCount:count,qualityProfile:'LEGACY'}),env,admin)!;
 expect(res.status).toBe(201);return (await res.json() as any).job.id as string;
}
const run=(id:string,user=admin)=>runQuestionGenerationJob(request(`${base}/${id}/run`),env,user,id);
const job=(id:string)=>db.prepare('SELECT * FROM question_generation_jobs WHERE id=?').bind(id).first();
async function assertEmpty(){for(const table of ['question_bank','question_learning_links','question_generation_lineage','question_generation_commit_gates','question_generation_commit_assertions','audit_logs'])expect(await db.prepare(`SELECT COUNT(*) n FROM ${table}`).first('n'),table).toBe(0);}
function deferred(){let resolve!:(value:any)=>void;const promise=new Promise<any>(r=>{resolve=r;});return {promise,resolve};}
async function waitForProvider(){await vi.waitFor(()=>expect(provider).toHaveBeenCalledTimes(1),{timeout:10000,interval:25});}

beforeAll(async()=>{
 mf=new Miniflare(convertV4MiniflareOptions({name:'generation-runner',modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-09-01',d1Databases:['DB']}));
 db=await mf.getD1Database('DB');await db.exec(ddl);
 await db.exec(migration('0072_question_generation_jobs.sql'));
 await db.exec(migration('0073_question_generation_runner.sql'));
 await db.exec(migration('0104_question_generation_focus.sql'));
 await db.exec("CREATE TABLE question_content_blocks(id TEXT PRIMARY KEY,question_id TEXT,block_type TEXT,placement TEXT,sort_order INTEGER,payload_json TEXT,alt_text TEXT);");
 await db.exec(migration('0107_question_editorial_contract.sql'));
 await db.exec(migration('0108_question_originality_search.sql'));
 await db.exec(migration('0106_question_team_execution_stage.sql'));
 await db.exec(migration('0102_question_agent_pilot_budget.sql'));
},20_000);
afterAll(async()=>{await mf?.dispose();});
beforeEach(async()=>{
 await db.exec(`DROP TRIGGER IF EXISTS reject_generation_audit;
 DELETE FROM question_generation_commit_assertions; DELETE FROM question_generation_commit_gates;
 DELETE FROM question_generation_lineage; DELETE FROM question_learning_links; DELETE FROM question_bank; DELETE FROM question_content_blocks;
 DELETE FROM question_agent_pilot_reservations;UPDATE question_agent_pilot_budget SET reserved_count=0;
 DELETE FROM question_generation_jobs; DELETE FROM outcomes; DELETE FROM curriculum_versions; DELETE FROM audit_logs;`);
 await seed();beforeBatch=undefined;afterClaim=undefined;sqlReads.length=0;
 provider=vi.fn(async()=>output());
 env={DB:{prepare:prepared,batch:async(stmts:any[])=>{if(beforeBatch){const hook=beforeBatch;beforeBatch=undefined;await hook();}return db.batch(stmts.map(s=>db.prepare(s.sql).bind(...s.args)));}},AI:{run:provider},QUESTION_GENERATION_ENABLED:'true'};
});

it('commits only review drafts, links, lineage, job and audit; reuses a completed job without another provider call',async()=>{
 const id=await create(2);provider.mockResolvedValueOnce(output([draft(),draft('Second question')]));
 const result=await run(id);expect(result.status).toBe(200);
 const body:any=await result.json();expect(body).toMatchObject({ok:true,reused:false,job:{status:'REVIEW_READY',questionCount:2,generatedCount:2,attemptCount:1}});
 expect(JSON.stringify(body)).not.toMatch(/lease_token|request_key|correctAnswer/);
 expect(provider).toHaveBeenCalledWith(DEFAULT_QUESTION_GENERATION_MODEL,expect.objectContaining({max_completion_tokens:6000,response_format:{type:'json_object'},stream:false,chat_template_kwargs:{enable_thinking:false}}));
 const questions=(await db.prepare('SELECT * FROM question_bank').all()).results;expect(questions).toHaveLength(2);
 for(const q of questions){expect(q).toMatchObject({review_status:'REVIEW',origin_kind:'AI_GENERATED',copyright_status:'RESTRICTED',correct_answer:'B',source_model:DEFAULT_QUESTION_GENERATION_MODEL,source_job_id:id,created_by:'admin'});expect(q.source_label).toContain('rights pending human verification');}
 expect(await db.prepare('SELECT count(*) n FROM question_generation_lineage').first('n')).toBe(2);
 expect(await db.prepare("SELECT count(*) n FROM question_learning_links WHERE node_id='ln_o'").first('n')).toBe(2);
 expect(await db.prepare("SELECT count(*) n FROM audit_logs WHERE action='QUESTION_GENERATION_REVIEW_READY'").first('n')).toBe(1);
 expect(await (await run(id)).json()).toMatchObject({reused:true,job:{id,status:'REVIEW_READY'}});expect(provider).toHaveBeenCalledTimes(1);
 expect(sqlReads.some(sql=>sql.includes('SELECT EXISTS')&&sql.includes('lower(trim(q.stem_text)) IN'))).toBe(true);
});

it('allows only one provider call under simultaneous claims',async()=>{
 const id=await create(),gate=deferred();provider.mockReturnValue(gate.promise);
 const a=run(id),b=run(id);await waitForProvider();gate.resolve(output());
 const responses=await Promise.all([a,b]);expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
 expect(provider).toHaveBeenCalledTimes(1);expect((await job(id)).attempt_count).toBe(1);
},20_000);

it.each([
 ['malformed JSON',{choices:[{message:{content:'{"questions":['}}]}],
 ['wrong count',output([])],
 ['invalid key',output([{...draft(),correctAnswer:'E'}])],
 ['missing solution',output([{...draft(),solutionText:''}])],
 ['unexpected property',output([{...draft(),answer:'B'}])],
 ['invalid option shape',output([{...draft(),options:[null,...draft().options.slice(1)]}])],
 ['oversized output',{response:' '.repeat(65537)}],
])('rejects %s with zero drafts',async(_name,raw)=>{
 const id=await create();provider.mockResolvedValueOnce(raw);
 expect(await (await run(id)).json()).toMatchObject({error:{code:'GENERATION_OUTPUT_INVALID'}});
 expect(await job(id)).toMatchObject({status:'FAILED',error_code:'GENERATION_OUTPUT_INVALID',lease_token:null});await assertEmpty();
});

it('rejects duplicate questions in a single batch using SQLite stem identity and exact options',async()=>{
 const id=await create(2);provider.mockResolvedValueOnce(output([draft('Same stem'),draft(' SAME STEM ')]));
 expect(await (await run(id)).json()).toMatchObject({error:{code:'GENERATION_DUPLICATE'}});await assertEmpty();
});

it.each(['object','string','null','invalid','null-element'])('blocks a matching legacy bank candidate with %s options',async(kind)=>{
 const options=kind==='object'?JSON.stringify(draft().options):kind==='string'?JSON.stringify(draft().options.map(o=>o.text)):kind==='null'?null:kind==='invalid'?'{bad':JSON.stringify([null,'Two','Three','Four']);
 await db.prepare(`INSERT INTO question_bank(id,academic_year,grade_level,subject_id,question_type,stem_text,options_json) VALUES('legacy','2026-2027',7,'math','MULTIPLE_CHOICE','  SYNTHETIC ARITHMETIC QUESTION  ',?)`).bind(options).run();
 const id=await create();expect(await (await run(id)).json()).toMatchObject({error:{code:'GENERATION_DUPLICATE'}});
 expect(await db.prepare('SELECT count(*) n FROM question_bank').first('n')).toBe(1);
 expect(await db.prepare('SELECT count(*) n FROM question_generation_lineage').first('n')).toBe(0);
});

it('ignores unrelated malformed records and distinguishes exact option text',async()=>{
 await db.exec(`INSERT INTO question_bank(id,academic_year,grade_level,subject_id,question_type,stem_text,options_json) VALUES('unrelated','2026-2027',7,'math','MULTIPLE_CHOICE','Other stem','broken');`);
 const choices=draft().options.map(o=>({...o,text:o.text.toUpperCase()}));
 await db.prepare(`INSERT INTO question_bank(id,academic_year,grade_level,subject_id,question_type,stem_text,options_json) VALUES('different','2026-2027',7,'math','MULTIPLE_CHOICE',?,?)`).bind(draft().stemText,JSON.stringify(choices)).run();
 expect((await run(await create())).status).toBe(200);
});

it.each(['cancel','context'])('fences late %s after the provider starts',async(action)=>{
 const id=await create(),gate=deferred();provider.mockReturnValueOnce(gate.promise);
 const running=run(id);await waitForProvider();
 if(action==='cancel')await handleQuestionGenerationJobs(request(`${base}/${id}/cancel`,'PATCH'),env,admin);
 else await db.exec('UPDATE curriculum_versions SET verified=0');
 gate.resolve(output());expect(await (await running).json()).toMatchObject({error:{code:action==='cancel'?'GENERATION_CANCELLED':'GENERATION_CONTEXT_CHANGED'}});
 expect((await job(id)).status).toBe(action==='cancel'?'CANCELLED':'FAILED');await assertEmpty();
});

it.each(['cancel','context','lease'])('atomically fences %s immediately before the commit batch',async(action)=>{
 const id=await create();beforeBatch=async()=>{
  if(action==='cancel')await handleQuestionGenerationJobs(request(`${base}/${id}/cancel`,'PATCH'),env,admin);
  else if(action==='context')await db.exec('UPDATE outcomes SET title=\'Revoked\'');
  else await db.prepare('UPDATE question_generation_jobs SET lease_token=? WHERE id=?').bind('new-owner',id).run();
 };
 expect(await (await run(id)).json()).toMatchObject({error:{code:action==='cancel'?'GENERATION_CANCELLED':action==='context'?'GENERATION_CONTEXT_CHANGED':'GENERATION_JOB_ACTIVE'}});await assertEmpty();
});

it('does not call the provider after another owner replaces the claimed token',async()=>{
 const id=await create();afterClaim=async()=>{await db.prepare('UPDATE question_generation_jobs SET lease_token=? WHERE id=?').bind('new-owner',id).run();};
 expect(await (await run(id)).json()).toMatchObject({error:{code:'GENERATION_JOB_ACTIVE'}});expect(provider).not.toHaveBeenCalled();await assertEmpty();
});

it('lets a new token reclaim expiry and prevents the stale provider from overwriting the winner',async()=>{
 const id=await create(),gate=deferred();provider.mockReturnValueOnce(gate.promise);
 const stale=run(id);await waitForProvider();
 await db.prepare('UPDATE question_generation_jobs SET lease_until=? WHERE id=?').bind('2000-01-01T00:00:00.000Z',id).run();
 const current=await run(id);expect(current.status).toBe(200);gate.resolve(output([draft('Stale question')]));
 expect((await stale).status).toBe(409);expect(await job(id)).toMatchObject({status:'REVIEW_READY',attempt_count:2});
 expect(await db.prepare('SELECT count(*) n FROM question_bank').first('n')).toBe(1);
 expect(await db.prepare('SELECT stem_text FROM question_bank').first('stem_text')).toBe(draft().stemText);
});

it('rolls back drafts, links, lineage, final status and gates when the final audit insert fails',async()=>{
 await db.exec(`CREATE TRIGGER reject_generation_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;`);
 const id=await create();expect(await (await run(id)).json()).toMatchObject({error:{code:'GENERATION_COMMIT_FAILED'}});
 expect(await job(id)).toMatchObject({status:'FAILED',generated_count:0,completed_at:null});await assertEmpty();
});

it('sanitizes provider errors, stops at three attempts and cancels failed jobs',async()=>{
 const id=await create();provider.mockRejectedValue(new Error('secret API_KEY=do-not-leak'));
 for(let attempt=1;attempt<=3;attempt++){
  const response=await run(id);expect(response.status).toBe(502);const text=await response.text();expect(text).toContain('GENERATION_PROVIDER_FAILED');expect(text).not.toContain('secret');
  expect(await job(id)).toMatchObject({status:'FAILED',attempt_count:attempt});
 }
 expect(await (await run(id)).json()).toMatchObject({error:{code:'GENERATION_RETRY_EXHAUSTED'}});expect(provider).toHaveBeenCalledTimes(3);
 await handleQuestionGenerationJobs(request(`${base}/${id}/cancel`,'PATCH'),env,admin);
 expect(await (await run(id)).json()).toMatchObject({error:{code:'GENERATION_CANCELLED'}});await assertEmpty();
});

it('rejects absent or unauthorized users and defaults to disabled without both explicit flag and AI binding',async()=>{
 const id=await create();expect((await run(id,null)).status).toBe(401);expect((await run(id,{id:'t',role:'TEACHER'} as any)).status).toBe(403);
 for(const flag of [undefined,'false','TRUE']){env.QUESTION_GENERATION_ENABLED=flag;expect((await run(id)).status).toBe(503);}
 env.QUESTION_GENERATION_ENABLED='true';delete env.AI;expect((await run(id)).status).toBe(503);
 expect(provider).not.toHaveBeenCalled();expect((await job(id)).attempt_count).toBe(0);await assertEmpty();
});

it.each(['inactive-node','missing-node','misaligned-node','oversized-context'])('fails closed before provider for %s',async(kind)=>{
 if(kind==='oversized-context')await db.prepare('UPDATE outcomes SET title=?').bind('x'.repeat(17*1024)).run();
 const id=await create();
 if(kind==='inactive-node')await db.exec('UPDATE learning_nodes SET active=0');
 if(kind==='misaligned-node')await db.exec('UPDATE learning_nodes SET grade_level=8');
 if(kind==='missing-node')await db.exec("DELETE FROM learning_nodes WHERE id='ln_o'");
 try{expect(await (await run(id)).json()).toMatchObject({error:{code:'GENERATION_CONTEXT_CHANGED'}});expect(provider).not.toHaveBeenCalled();await assertEmpty();}
 finally{await db.exec("INSERT OR IGNORE INTO learning_nodes(id) VALUES('ln_o'); UPDATE learning_nodes SET active=1,grade_level=7;");}
});

it('times out a hanging provider with an allowlisted error and clears the timer',async()=>{
 const id=await create();provider.mockReturnValueOnce(new Promise(()=>{}));
 const realSetTimeout=globalThis.setTimeout;
 const timerSpy=vi.spyOn(globalThis,'setTimeout').mockImplementation(((fn:any,ms:any,...args:any[])=>realSetTimeout(fn,ms===45_000?1:ms,...args)) as any);
 const clearSpy=vi.spyOn(globalThis,'clearTimeout');
 try{
  expect(await (await run(id)).json()).toMatchObject({error:{code:'GENERATION_TIMEOUT'}});
  const index=timerSpy.mock.calls.findIndex(call=>call[1]===45_000);expect(index).toBeGreaterThanOrEqual(0);
  expect(clearSpy).toHaveBeenCalledWith(timerSpy.mock.results[index].value);
  expect(await job(id)).toMatchObject({status:'FAILED',error_code:'GENERATION_TIMEOUT'});await assertEmpty();
 }finally{timerSpy.mockRestore();clearSpy.mockRestore();}
});

it('clears the provider timeout on success and honors an explicit model override',async()=>{
 const id=await create();env.QUESTION_GENERATION_MODEL=' @cf/zai-org/glm-4.7-flash ';
 const timerSpy=vi.spyOn(globalThis,'setTimeout'),clearSpy=vi.spyOn(globalThis,'clearTimeout');
 try{
  expect((await run(id)).status).toBe(200);
  const index=timerSpy.mock.calls.findIndex(call=>call[1]===45_000);expect(index).toBeGreaterThanOrEqual(0);
  expect(clearSpy).toHaveBeenCalledWith(timerSpy.mock.results[index].value);
  expect(provider.mock.calls[0][0]).toBe('@cf/zai-org/glm-4.7-flash');
 }finally{timerSpy.mockRestore();clearSpy.mockRestore();}
});

it('preserves old REQUESTED and CANCELLED jobs while applying 0072 to 0073',async()=>{
 const oldMf=new Miniflare(convertV4MiniflareOptions({name:'generation-migration',modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-09-01',d1Databases:['DB']}));
 try{
  const old:any=await oldMf.getD1Database('DB');await old.exec(ddl);await old.exec(migration('0072_question_generation_jobs.sql'));
  await old.exec(`INSERT INTO curriculum_versions VALUES('cv','2026-2027',7,'v1',1); INSERT INTO outcomes VALUES('o','cv','math',7,'M.7.1','Synthetic outcome',1);
   INSERT INTO question_generation_jobs(id,request_key,outcome_id,curriculum_version_id,academic_year,grade_level,subject_id,program_version,outcome_title,question_count,requested_by,status,cancelled_at,cancelled_by)
   VALUES('old-cancelled','key-c','o','cv','2026-2027',7,'math','v1','Synthetic outcome',2,'admin','CANCELLED','2026-01-01','admin'),
    ('old-requested','key-r','o','cv','2026-2027',7,'math','v1','Synthetic outcome',3,'admin','REQUESTED',NULL,NULL);`.replace(/\n/g,' '));
  const before=(await old.prepare('SELECT * FROM question_generation_jobs ORDER BY id').all()).results;
  await old.exec(migration('0073_question_generation_runner.sql'));
  await old.exec(migration('0104_question_generation_focus.sql'));
  await old.exec(migration('0106_question_team_execution_stage.sql'));
  const after=(await old.prepare('SELECT * FROM question_generation_jobs ORDER BY id').all()).results;
  expect(after).toHaveLength(2);after.forEach((row:any,i:number)=>{expect(row).toMatchObject(before[i]);expect(row).toMatchObject({attempt_count:0,generated_count:0,lease_token:null,completed_at:null});});
 }finally{await oldMf.dispose();}
},20_000);

it('rejects five choices at grade 7 without storing an invalid draft',async()=>{
 const id=await create();provider.mockResolvedValueOnce(output([{...draft(),options:[...draft().options,{label:'E',text:'Five'}]}]));
 expect((await run(id)).status).toBe(422);await assertEmpty();
});
it('requires five choices at grade 9 and preserves the human review gate',async()=>{
 await db.exec("UPDATE curriculum_versions SET grade_level=9;UPDATE outcomes SET grade_level=9;UPDATE learning_nodes SET grade_level=9;");
 try{
 const res=await handleQuestionGenerationJobs(request(base,'POST',{outcomeId:'o',expectedContext:{...context,gradeLevel:9},requestKey:crypto.randomUUID(),questionCount:1,qualityProfile:'LEGACY'}),env,admin)!;expect(res.status).toBe(201);const id=(await res.json() as any).job.id;
 expect((await run(id)).status).toBe(422);await assertEmpty();
 provider.mockResolvedValueOnce(output([{...draft(),options:[...draft().options,{label:'E',text:'Five'}]}]));expect((await run(id)).status).toBe(200);
 expect(await db.prepare('SELECT option_count,review_status,copyright_status FROM question_bank').first()).toMatchObject({option_count:5,review_status:'REVIEW',copyright_status:'RESTRICTED'});
 expect(provider.mock.calls.at(-1)![1].messages[0].content).toContain('5 distinct nonempty options labeled A-E');
 }finally{await db.exec('UPDATE learning_nodes SET grade_level=7;');}
});

it('reserves manual pilot quota before inference and does not charge retries twice',async()=>{
 env.QUESTION_AUTOMATED_PILOT_MODE='true';env.QUESTION_PILOT_BUDGET_REMAINING='50';env.QUESTION_PILOT_REVIEW_AVAILABLE='true';
 const id=await create();provider.mockResolvedValueOnce(output([]));expect((await run(id)).status).toBe(422);expect(await db.prepare("SELECT reserved_count FROM question_agent_pilot_budget").first('reserved_count')).toBe(1);
 provider.mockResolvedValueOnce(output());expect((await run(id)).status).toBe(200);expect(await db.prepare("SELECT reserved_count FROM question_agent_pilot_budget").first('reserved_count')).toBe(1);
});
it('blocks a manual pilot at persisted quota exhaustion before any provider call',async()=>{
 env.QUESTION_AUTOMATED_PILOT_MODE='true';env.QUESTION_PILOT_BUDGET_REMAINING='50';env.QUESTION_PILOT_REVIEW_AVAILABLE='true';await db.exec('UPDATE question_agent_pilot_budget SET reserved_count=50;');
 const id=await create();expect(await (await run(id)).json()).toMatchObject({error:{code:'GENERATION_PILOT_LIMIT'}});expect(provider).not.toHaveBeenCalled();await assertEmpty();
});


it('independently validates before storing drafts and preserves mandatory human review',async()=>{
 env.QUESTION_GENERATION_VERIFICATION_ENABLED='true';
 provider.mockResolvedValueOnce(output()).mockResolvedValueOnce({response:JSON.stringify({reviews:[{index:0,valid:true,issues:[]}]}),usage:{total_tokens:100}});
 const id=await create();expect((await run(id)).status).toBe(200);expect(provider).toHaveBeenCalledTimes(2);
 expect(await db.prepare('SELECT review_status,copyright_status FROM question_bank').first()).toEqual({review_status:'REVIEW',copyright_status:'RESTRICTED'});
 const audit:any=await db.prepare("SELECT details_json FROM audit_logs WHERE action='QUESTION_GENERATION_REVIEW_READY'").first();
 expect(JSON.parse(audit.details_json)).toMatchObject({verification:{ok:true,usage:{total_tokens:100}},humanReviewRequired:true});
});
it('failed independent validation creates no bank rows or lineage and records the reason',async()=>{
 env.QUESTION_GENERATION_VERIFICATION_ENABLED='true';
 provider.mockResolvedValueOnce(output()).mockResolvedValueOnce({response:JSON.stringify({reviews:[{index:0,valid:false,issues:['Wrong official outcome']}]})});
 const id=await create();expect((await run(id)).status).toBe(422);
 expect(await job(id)).toMatchObject({status:'FAILED',error_code:'GENERATION_QUALITY_REJECTED',generated_count:0});
 for(const table of ['question_bank','question_learning_links','question_generation_lineage','question_generation_commit_gates'])expect(await db.prepare('SELECT COUNT(*) n FROM '+table).first('n')).toBe(0);
 expect(await db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='QUESTION_GENERATION_VERIFICATION_BLOCKED'").first('n')).toBe(1);
});
it('a cancellation during independent validation cannot commit drafts',async()=>{
 env.QUESTION_GENERATION_VERIFICATION_ENABLED='true';
 const id=await create();
 provider.mockResolvedValueOnce(output()).mockImplementationOnce(async()=>{
  const cancelled=await handleQuestionGenerationJobs(request(base+'/'+id+'/cancel','PATCH'),env,admin);
  expect(cancelled?.status).toBe(200);
  return {response:JSON.stringify({reviews:[{index:0,valid:true,issues:[]}]})};
 });
 expect((await run(id)).status).toBe(409);await assertEmpty();
});

it('gives grade-five reading pilot a concrete valid-integer output contract',async()=>{
 await db.exec("UPDATE outcomes SET code='MAT.5.1.1',title='Altı basamaklı sayıları okuma ve yazmayı çok basamaklı sayılara genelleyebilme',grade_level=5; UPDATE curriculum_versions SET grade_level=5; UPDATE learning_nodes SET grade_level=5;");
 const res=await handleQuestionGenerationJobs(request(base,'POST',{outcomeId:'o',expectedContext:{...context,gradeLevel:5},requestKey:crypto.randomUUID(),questionCount:1,qualityProfile:'LEGACY'}),env,admin)!;const id=(await res.json() as any).job.id;
 expect((await run(id)).status).toBe(200);
 expect(provider.mock.calls[0][1].messages[0].content).toContain('EVERY option must be a different plain ASCII digit string');
});

it('requests a bounded strict schema and persists a single independently checked draft',async()=>{
 env.QUESTION_GENERATION_STRUCTURED_OUTPUT_ENABLED='true';env.QUESTION_GENERATION_VERIFICATION_ENABLED='true';env.QUESTION_GENERATION_MODEL='@cf/openai/gpt-oss-120b';
 provider.mockResolvedValueOnce(output()).mockResolvedValueOnce({response:JSON.stringify({reviews:[{index:0,valid:true,issues:[]}]})});
 const id=await create();expect((await run(id)).status).toBe(200);
 const input=provider.mock.calls[0][1] as any;
 expect(input.response_format).toMatchObject({type:'json_schema',json_schema:{additionalProperties:false,properties:{questions:{minItems:1,maxItems:1,items:{additionalProperties:false,properties:{options:{minItems:4,maxItems:4},correctAnswer:{enum:['A','B','C','D']}}}}}}});
 expect(await db.prepare('SELECT review_status,copyright_status FROM question_bank').first()).toEqual({review_status:'REVIEW',copyright_status:'RESTRICTED'});
});
it('keeps bounded output-error evidence without writing questions or invoking the verifier',async()=>{
 env.QUESTION_GENERATION_STRUCTURED_OUTPUT_ENABLED='true';env.QUESTION_GENERATION_VERIFICATION_ENABLED='true';
 provider.mockResolvedValueOnce({choices:[{finish_reason:'length',message:{content:'{"questions":['}}],usage:{completion_tokens:3000}});
 const id=await create();expect((await run(id)).status).toBe(422);expect(provider).toHaveBeenCalledTimes(1);
 expect(await db.prepare('SELECT COUNT(*) n FROM question_bank').first('n')).toBe(0);
 const row:any=await db.prepare("SELECT details_json FROM audit_logs WHERE action='QUESTION_GENERATION_OUTPUT_BLOCKED'").first();
 expect(JSON.parse(row.details_json)).toMatchObject({finishReason:'length',providerUsage:{completion_tokens:3000},sample:'{"questions":['});
});

it('restricts reading-pilot numeric choices to the verified seven-to-twelve-digit range',()=>{
 const schema:any=questionDraftSchema(1,5,true);const pattern=schema.properties.questions.items.properties.options.items.properties.text.pattern;
 const rule=new RegExp(pattern);expect(rule.test('483245607098')).toBe(true);expect(rule.test('4832456070980')).toBe(false);expect(rule.test('123456')).toBe(false);expect(rule.test('01234567')).toBe(false);
 expect((questionDraftSchema(1,9) as any).properties.questions.items.properties.options.items.properties.text.pattern).toBeUndefined();
});

it('rejects a provider that ignores the live reading choice range before verifier or persistence',async()=>{
 await db.exec("UPDATE outcomes SET code='MAT.5.1.1',title='Altı basamaklı sayıları okuma ve yazmayı çok basamaklı sayılara genelleyebilme',grade_level=5; UPDATE curriculum_versions SET grade_level=5; UPDATE learning_nodes SET grade_level=5;");
 env.QUESTION_GENERATION_STRUCTURED_OUTPUT_ENABLED='true';env.QUESTION_GENERATION_VERIFICATION_ENABLED='true';
 const candidate=draft('“dört yüz seksen üç milyar iki yüz kırk beş milyon altı yüz yedi bin doksan sekiz” hangi sayıdır?');
 candidate.options=['483245607098','728607098','4832456070980','483245607198'].map((text,i)=>({label:String.fromCharCode(65+i),text}));candidate.correctAnswer='A';
 provider.mockResolvedValueOnce(output([candidate]));
 const res=await handleQuestionGenerationJobs(request(base,'POST',{outcomeId:'o',expectedContext:{...context,gradeLevel:5},requestKey:crypto.randomUUID(),questionCount:1,qualityProfile:'LEGACY'}),env,admin)!;const id=(await res.json() as any).job.id;
 expect((await run(id)).status).toBe(422);expect(provider).toHaveBeenCalledTimes(1);expect(await db.prepare('SELECT COUNT(*) n FROM question_bank').first('n')).toBe(0);
 expect(await job(id)).toMatchObject({status:'FAILED',error_code:'GENERATION_OUTPUT_INVALID'});
});
it('does not consume a provider attempt when paused and fences a pause racing the commit',async()=>{
 await db.exec(`CREATE TABLE IF NOT EXISTS question_team_control(id INTEGER PRIMARY KEY,paused INTEGER);CREATE TABLE IF NOT EXISTS question_team_agent_control(agent_key TEXT,paused INTEGER);INSERT OR REPLACE INTO question_team_control VALUES(1,1);DELETE FROM question_team_agent_control;INSERT INTO question_team_agent_control VALUES('GENERATOR',0),('VERIFIER',0),('ORIGINALITY',0);`);
 env.QUESTION_TEAM_CONTROLS_ENABLED='true';const id=await create();
 expect((await run(id)).status).toBe(409);expect(provider).not.toHaveBeenCalled();expect((await job(id)).attempt_count).toBe(0);
 await db.exec('UPDATE question_team_control SET paused=0');beforeBatch=async()=>{await db.exec('UPDATE question_team_control SET paused=1')};
 expect((await run(id)).status).toBe(409);expect(provider).toHaveBeenCalledTimes(1);
 expect((await job(id)).error_code).toBe('GENERATION_TEAM_PAUSED');
 expect(await db.prepare('SELECT count(*) n FROM question_bank').first('n')).toBe(0);
});
it('commits a complete editorial table packet only after independent dimension review',async()=>{
 const response=await handleQuestionGenerationJobs(request(base,'POST',{outcomeId:'o',expectedContext:context,requestKey:crypto.randomUUID(),questionCount:1,qualityProfile:'EDITORIAL_V1',presentation:'TABLE'}),env,admin)!;expect(response.status).toBe(201);const id=(await response.json() as any).job.id;
 env.QUESTION_GENERATION_VERIFIER_MODEL='independent-editorial-verifier';
 provider.mockImplementation(async(model:string)=>model==='independent-editorial-verifier'?{response:JSON.stringify({reviews:[{index:0,valid:true,issues:[],editorial:editorialScores}]})}:output([editorialQuestion()]));
 const result=await run(id);expect(result.status).toBe(200);expect(provider).toHaveBeenCalledTimes(2);
 const q:any=await db.prepare('SELECT * FROM question_bank').first();expect(q.content_mode).toBe('MIXED');expect(q.review_status).toBe('REVIEW');expect(q.copyright_status).toBe('RESTRICTED');expect(JSON.parse(q.editorial_packet_json).visual.kind).toBe('TABLE');
 const block:any=await db.prepare('SELECT * FROM question_content_blocks').first();expect(JSON.parse(block.payload_json).rows[1]).toEqual(['İkinci','4','Araç başına','110']);
 await expect(db.prepare("UPDATE question_content_blocks SET payload_json='{}'").run()).rejects.toThrow(/EDITORIAL_VISUAL_IMMUTABLE/);
 await expect(db.prepare("UPDATE question_bank SET stem_text='Mutated without packet'").run()).rejects.toThrow(/EDITORIAL_ATOMIC_REVISION_REQUIRED/);
 const audit:any=await db.prepare("SELECT details_json FROM audit_logs WHERE action='QUESTION_GENERATION_REVIEW_READY'").first();expect(JSON.parse(audit.details_json).qualityProfile).toBe('EDITORIAL_V1');
});
it('does not downgrade an editorial task when the producer omits its packet',async()=>{
 const response=await handleQuestionGenerationJobs(request(base,'POST',{outcomeId:'o',expectedContext:context,requestKey:crypto.randomUUID(),questionCount:1,qualityProfile:'EDITORIAL_V1',presentation:'TABLE'}),env,admin)!;const id=(await response.json() as any).job.id;
 provider.mockResolvedValue(output());expect((await run(id)).status).toBe(422);expect(await db.prepare('SELECT count(*) n FROM question_bank').first('n')).toBe(0);expect((await job(id)).error_code).toBe('GENERATION_OUTPUT_INVALID');
});
