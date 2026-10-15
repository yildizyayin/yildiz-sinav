import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {expect,it,vi} from 'vitest';
import {runEditorialPipelineTrial,PIPELINE_TRIAL_ID} from '../worker/lib/question-pipeline-trial';
import {editorialQuestion,editorialScores} from './fixtures/editorial-question';
import {scientificSourceNumbers} from '../worker/lib/question-blind-solve';
import curriculum from '../data/question-pilot-math5-curriculum.json';
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE question_generation_jobs(id TEXT PRIMARY KEY);CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_user_id TEXT,institution_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,details_json TEXT);
 CREATE TABLE curriculum_versions(id TEXT,grade_level INTEGER,verified INTEGER,academic_year TEXT,program_version TEXT,source_url TEXT);CREATE TABLE outcomes(id TEXT,code TEXT,title TEXT,subject_id TEXT,grade_level INTEGER,curriculum_version_id TEXT,active INTEGER);
 CREATE TABLE learning_nodes(id TEXT,active INTEGER,node_type TEXT,grade_level INTEGER,subject_id TEXT,academic_year TEXT);
 CREATE TABLE question_bank(id TEXT,stem_text TEXT,solution_text TEXT,options_json TEXT,owner_type TEXT,academic_year TEXT,grade_level INTEGER,subject_id TEXT,question_type TEXT,created_at TEXT);
 CREATE TABLE question_learning_links(question_id TEXT,node_id TEXT);CREATE VIRTUAL TABLE question_editorial_search USING fts5(question_id UNINDEXED,stem);`);
 db.exec(readFileSync(new URL('../migrations/0112_question_ai_daily_budget.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/0102_question_agent_pilot_budget.sql',import.meta.url),'utf8'));
 db.exec("UPDATE question_agent_pilot_budget SET reserved_count=49");
 db.prepare('INSERT INTO curriculum_versions VALUES(?,5,1,?,?,?)').run('cv',curriculum.academicYear,curriculum.programVersion,curriculum.sourceUrl);
 db.prepare('INSERT INTO outcomes VALUES(?,?,?,?,5,?,1)').run('o','MAT.5.1.2',curriculum.outcomes[1].title,'math','cv');
 db.prepare("INSERT INTO learning_nodes VALUES('ln_o',1,'OUTCOME',5,'math',?)").run(curriculum.academicYear);
 const writer='@cf/openai/gpt-oss-120b',reviewer='@cf/nvidia/nemotron-3-120b-a12b',editor='@cf/qwen/qwen3-30b-a3b-fp8';
 db.prepare("INSERT INTO question_verifier_calibrations(id,status,verification_json) VALUES(?,'PASS',?)").run('independent-quality-20261015-v1-distractor-proof-v1',JSON.stringify({passed:true,verifier:reviewer}));
 const q:any=editorialQuestion();q.stemText=q.stemText.replace('tabloda verilmiştir','belirtilmiştir');q.editorial.visual={kind:'NONE',title:'',unit:'',columns:[],rows:[],categories:[],values:[],readingPurpose:''};
 const provider=vi.fn(async(model:string,input:any)=>{
  if(model===writer||model===editor)return {response:JSON.stringify({questions:[q]}),usage:{neurons:1}};
  if(input.response_format.json_schema.properties.sourceNumbers)return {response:JSON.stringify({sourceNumbers:scientificSourceNumbers(q),answer:'A',optionChecks:q.options.map((o:any)=>({label:o.label,correct:o.label==='A',reason:'Seçenek verilen sayılar ve doğru maliyet hesabıyla karşılaştırıldı.'})),calculations:[{left:4,op:'MUL',right:110,result:440},{left:480,op:'SUB',right:440,result:40}]})};
  return {response:JSON.stringify({reviews:[{index:0,valid:true,issues:[],editorial:editorialScores}]})};
 });
 const prepare=(sql:string,args:any[]=[]):any=>({sql,args,bind:(...a:any[])=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args),run:async()=>({meta:{changes:db.prepare(sql).run(...args).changes}})});
 const env:any={ENVIRONMENT:'staging',QUESTION_GENERATION_ENABLED:'true',QUESTION_GENERATION_VERIFICATION_ENABLED:'true',QUESTION_AUTO_EDITOR_ENABLED:'true',QUESTION_BLIND_SOLVE_ENABLED:'true',QUESTION_AI_DAILY_NEURON_LIMIT:'10000',QUESTION_GENERATION_MODEL:writer,QUESTION_EDITOR_MODEL:editor,QUESTION_GENERATION_VERIFIER_MODEL:reviewer,AI:{run:provider},DB:{prepare,batch:async(stmts:any[])=>{db.exec('BEGIN');try{const results=stmts.map(s=>({meta:{changes:db.prepare(s.sql).run(...s.args).changes}}));db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}}};
 return {db,env,provider};
}
it('runs one shared writer/editor/blind/reviewer chain, charges the last pilot slot and reuses its result',async()=>{
 const f=fixture();try{
  const r:any=await (await runEditorialPipelineTrial(f.env,{id:'admin',role:'SUPER_ADMIN'} as any)).json();
  expect(r).toMatchObject({passed:true,producerCalls:1,editorCalls:1,questionBankWrites:0,humanApproved:false});expect(f.provider).toHaveBeenCalledTimes(4);
  expect(f.db.prepare('SELECT reserved_count FROM question_agent_pilot_budget').get()?.reserved_count).toBe(50);
  expect(f.db.prepare('SELECT count(*) n FROM question_bank').get()?.n).toBe(0);
  expect(f.db.prepare('SELECT count(*) n FROM question_generation_jobs').get()?.n).toBe(0);
  expect(f.db.prepare('SELECT status FROM question_verifier_calibrations WHERE id=?').get(PIPELINE_TRIAL_ID)?.status).toBe('PASS');
  const repeat:any=await (await runEditorialPipelineTrial(f.env,{id:'admin',role:'SUPER_ADMIN'} as any)).json();expect(repeat.reused).toBe(true);expect(f.provider).toHaveBeenCalledTimes(4);
 }finally{f.db.close();}
});
it('keeps failed author evidence and its consumed quota without invoking another role or retrying',async()=>{
 const f=fixture();try{f.provider.mockResolvedValue({response:'{}'} as any);
  const r:any=await (await runEditorialPipelineTrial(f.env,{id:'admin',role:'SUPER_ADMIN'} as any)).json();
  expect(r).toMatchObject({passed:false,error:'AUTHOR_PACKET_INVALID',producerCalls:1,editorCalls:0});expect(f.provider).toHaveBeenCalledTimes(1);
  await runEditorialPipelineTrial(f.env,{id:'admin',role:'SUPER_ADMIN'} as any);expect(f.provider).toHaveBeenCalledTimes(1);expect(f.db.prepare('SELECT reserved_count FROM question_agent_pilot_budget').get()?.reserved_count).toBe(50);
 }finally{f.db.close();}
});
it('does not reserve or invoke providers outside authorized staging or with exhausted quota',async()=>{
 const f=fixture();try{
  expect((await runEditorialPipelineTrial({...f.env,ENVIRONMENT:'production'},{role:'SUPER_ADMIN'} as any)).status).toBe(403);
  f.db.exec('UPDATE question_agent_pilot_budget SET reserved_count=50');expect((await runEditorialPipelineTrial(f.env,{role:'SUPER_ADMIN'} as any)).status).toBe(409);expect(f.provider).not.toHaveBeenCalled();
 }finally{f.db.close();}
});
it('admits only one of two overlapping requests without double charging the last slot',async()=>{
 const f=fixture();try{
  await Promise.all([runEditorialPipelineTrial(f.env,{id:'admin',role:'SUPER_ADMIN'} as any),runEditorialPipelineTrial(f.env,{id:'admin',role:'SUPER_ADMIN'} as any)]);
  expect(f.provider).toHaveBeenCalledTimes(4);expect(f.db.prepare('SELECT reserved_count FROM question_agent_pilot_budget').get()?.reserved_count).toBe(50);
 }finally{f.db.close();}
});
