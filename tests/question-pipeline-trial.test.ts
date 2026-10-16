import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {expect,it,vi} from 'vitest';
import {runEditorialPipelineTrial,PIPELINE_TRIAL_ID} from '../worker/lib/question-pipeline-trial';
import {preparePipelineCorrection,verifyPipelineCorrection,PIPELINE_CORRECTION_ID,PIPELINE_EDITOR_COMPARISON_ID,PIPELINE_REASONED_EDITOR_ID,PIPELINE_EDITOR_TRANSPORT_RETRY_ID} from '../worker/lib/question-pipeline-correction';
import {editorialQuestion,editorialScores} from './fixtures/editorial-question';
import {scientificSourceNumbers} from '../worker/lib/question-blind-solve';
import curriculum from '../data/question-pilot-math5-curriculum.json';
function requestedSchema(input:any){
 const schema=input.response_format.json_schema;if(schema)return schema.schema??schema;
 const system=input.messages.find((m:any)=>m.role==='system'&&m.content.includes('\nJSON_SCHEMA\n'));
 return JSON.parse(system.content.split('\nJSON_SCHEMA\n')[1]);
}
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
 const q:any=editorialQuestion();q.stemText='Bir atölyede başlangıçtaki kart sayısı önce 3 katına çıkarılıyor, sonra 24 kart ekleniyor ve 132 kart oluyor. Başlangıcı bulmak için I. yöntem 132 den 24 çıkarıp 3 e bölüyor; II. yöntem 132 yi 3 e bölüp 24 çıkarıyor. Hangi yöntem doğru başlangıç sayısını verir?';q.options=[{label:'A',text:'20'},{label:'B',text:'52'},{label:'C',text:'36'},{label:'D',text:'44'}];q.correctAnswer='C';q.solutionText='132 − 24 = 108; 108 ÷ 3 = 36. Kontrol:36 × 3 = 108;108 + 24 = 132. I. yöntem doğrudur. Doğru seçenek C)36.';
 q.editorial.visual={kind:'NONE',title:'',unit:'',columns:[],rows:[],categories:[],values:[],readingPurpose:''};q.editorial.distractors=[{label:'A',misconception:'İşlemleri ters sırada geri almama yanılgısı.',whyIncorrect:'Yanılgı hesabı:132 ÷ 3 = 44;44 − 24 = 20. Son eklemeyi önce geri almak gerektiğinden bu yöntem yanlıştır.'},{label:'B',misconception:'Son eklenen miktarı çıkarmak yerine tekrar ekleme.',whyIncorrect:'Yanılgı hesabı:132 + 24 = 156;156 ÷ 3 = 52. Son eklemeyi geri almak için24 çıkarmak gerekir.'},{label:'D',misconception:'Son ekleme miktarını geri almadan bölme yapma.',whyIncorrect:'Yanılgı hesabı:132 ÷ 3 = 44. Bu hesap son eklenen24 kartı başlangıca aitmiş gibi ele alır.'}];
 const provider=vi.fn(async(model:string,input:any)=>{
  if(model===writer||model===editor)return {response:JSON.stringify({questions:[q]}),usage:{neurons:1}};
  if(requestedSchema(input).properties.sourceNumbers)return {response:JSON.stringify({sourceNumbers:scientificSourceNumbers(q),answer:'C',optionChecks:q.options.map((o:any)=>({label:o.label,correct:o.label==='C',reason:'Seçenek verilen sayılar ve doğru maliyet hesabıyla karşılaştırıldı.'})),calculations:[{left:132,op:'SUB',right:24,result:108},{left:108,op:'DIV',right:3,result:36}]})};
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
it('corrects the same source once and verifies in a separate invocation without another writer or quota',async()=>{
 const f=fixture();try{
  const original=f.provider.getMockImplementation()!,reviewer='@cf/nvidia/nemotron-3-120b-a12b';let failReview=true,editorCalls=0;
  f.provider.mockImplementation(async(model:string,input:any)=>{
   if(model===reviewer&&requestedSchema(input).properties.reviews&&failReview){failReview=false;throw Error('Temporary provider error');}
   const raw:any=await original(model,input);
   if(model==='@cf/qwen/qwen3-30b-a3b-fp8'&&++editorCalls===2){const packet=JSON.parse(raw.response);packet.questions[0].stemText+=' Yöntemleri işlem sırasına göre karşılaştırınız.';raw.response=JSON.stringify(packet);}
   return raw;
  });
  const first:any=await (await runEditorialPipelineTrial(f.env,{id:'admin',role:'SUPER_ADMIN'} as any)).json();expect(first.passed).toBe(false);
  const old=f.db.prepare('SELECT verification_json FROM question_verifier_calibrations WHERE id=?').get(PIPELINE_TRIAL_ID)?.verification_json;
  expect(await (await preparePipelineCorrection(f.env,{id:'admin',role:'SUPER_ADMIN'} as any)).json()).toMatchObject({prepared:true});
  const final:any=await (await verifyPipelineCorrection(f.env,{id:'admin',role:'SUPER_ADMIN'} as any)).json();expect(final).toMatchObject({passed:true,newProducerCalls:0,additionalEditorPasses:1,cumulativeEditorPasses:2});
  await preparePipelineCorrection(f.env,{id:'admin',role:'SUPER_ADMIN'} as any);await verifyPipelineCorrection(f.env,{id:'admin',role:'SUPER_ADMIN'} as any);
  expect(f.provider.mock.calls.filter(c=>c[0]==='@cf/openai/gpt-oss-120b')).toHaveLength(1);expect(editorCalls).toBe(2);
  expect(f.db.prepare('SELECT reserved_count FROM question_agent_pilot_budget').get()?.reserved_count).toBe(50);expect(f.db.prepare('SELECT verification_json FROM question_verifier_calibrations WHERE id=?').get(PIPELINE_TRIAL_ID)?.verification_json).toBe(old);
  expect(f.db.prepare('SELECT status FROM question_verifier_calibrations WHERE id=?').get(PIPELINE_CORRECTION_ID)?.status).toBe('PASS');
 }finally{f.db.close();}
});
it('allows one alternative editor only after the recorded editor failed; keeps the reviewer independent',async()=>{
 const f=fixture();try{
  expect((await preparePipelineCorrection(f.env,{id:'admin',role:'SUPER_ADMIN'} as any,true)).status).toBe(409);expect(f.provider).not.toHaveBeenCalled();
  const original=f.provider.getMockImplementation()!;let fail=true;
  f.provider.mockImplementation(async(model:string,input:any)=>{if(model==='@cf/nvidia/nemotron-3-120b-a12b'&&requestedSchema(input).properties.reviews&&fail){fail=false;throw Error('Unavailable');}return original(model,input);});
  await runEditorialPipelineTrial(f.env,{id:'admin',role:'SUPER_ADMIN'} as any);
  f.db.prepare("INSERT INTO question_verifier_calibrations(id,status,verification_json) VALUES(?,'BLOCKED',?)").run(PIPELINE_CORRECTION_ID,JSON.stringify({error:'EDITOR_OUTPUT_INVALID'}));
  f.provider.mockImplementation(async(model:string,input:any)=>{if(model==='@cf/zai-org/glm-4.7-flash'){expect(input.max_completion_tokens).toBe(8000);expect(input.response_format.json_schema.schema.properties.questions).toBeTruthy();const r:any=await original('@cf/qwen/qwen3-30b-a3b-fp8',input),p=JSON.parse(r.response);p.questions[0].stemText+=' Yöntemleri karşılaştırınız.';return {response:JSON.stringify(p)};}return original(model,input);});
  expect(await (await preparePipelineCorrection(f.env,{id:'admin',role:'SUPER_ADMIN'} as any,true)).json()).toMatchObject({prepared:true});
  expect(await (await verifyPipelineCorrection(f.env,{id:'admin',role:'SUPER_ADMIN'} as any,true)).json()).toMatchObject({passed:true,editorModel:'@cf/zai-org/glm-4.7-flash',cumulativeEditorPasses:3,newProducerCalls:0});
  await preparePipelineCorrection(f.env,{id:'admin',role:'SUPER_ADMIN'} as any,true);expect(f.provider.mock.calls.filter(c=>c[0]==='@cf/zai-org/glm-4.7-flash')).toHaveLength(1);expect(f.db.prepare('SELECT status FROM question_verifier_calibrations WHERE id=?').get(PIPELINE_EDITOR_COMPARISON_ID)?.status).toBe('PASS');
  f.db.prepare("UPDATE question_verifier_calibrations SET status='BLOCKED',verification_json=? WHERE id=?").run(JSON.stringify({error:'EDITOR_OUTPUT_INVALID'}),PIPELINE_EDITOR_COMPARISON_ID);
  const alternative=f.provider.getMockImplementation()!;f.provider.mockImplementation(async(model:string,input:any)=>{if(model==='@cf/zai-org/glm-4.7-flash'){expect(input.chat_template_kwargs.enable_thinking).toBe(true);expect(input.messages[0].role).toBe('system');expect(input.messages[0].content).toContain('Required application task:');expect(JSON.parse(input.messages[1].content).questions).toHaveLength(1);}return alternative(model,input);});
  expect(await (await preparePipelineCorrection(f.env,{id:'admin',role:'SUPER_ADMIN'} as any,true,true)).json()).toMatchObject({prepared:true});
  expect(await (await verifyPipelineCorrection(f.env,{id:'admin',role:'SUPER_ADMIN'} as any,true,true)).json()).toMatchObject({passed:true,cumulativeEditorPasses:4,reasonedEditor:true});expect(f.db.prepare('SELECT status FROM question_verifier_calibrations WHERE id=?').get(PIPELINE_REASONED_EDITOR_ID)?.status).toBe('PASS');
  const requestBeforeRetry=f.provider.mock.calls.filter(c=>c[0]==='@cf/zai-org/glm-4.7-flash').at(-1)![1];
  f.db.prepare("UPDATE question_verifier_calibrations SET status='BLOCKED',verification_json=? WHERE id=?").run(JSON.stringify({error:'EDITOR_TIMEOUT'}),PIPELINE_REASONED_EDITOR_ID);
  expect(await (await preparePipelineCorrection(f.env,{id:'admin',role:'SUPER_ADMIN'} as any,true,true,true)).json()).toMatchObject({prepared:true});
  expect(f.provider.mock.calls.filter(c=>c[0]==='@cf/zai-org/glm-4.7-flash').at(-1)![1]).toEqual(requestBeforeRetry);
  expect(await (await verifyPipelineCorrection(f.env,{id:'admin',role:'SUPER_ADMIN'} as any,true,true,true)).json()).toMatchObject({passed:true,transportRetry:true,newProducerCalls:0,cumulativeEditorPasses:5});
  await preparePipelineCorrection(f.env,{id:'admin',role:'SUPER_ADMIN'} as any,true,true,true);expect(f.db.prepare('SELECT status FROM question_verifier_calibrations WHERE id=?').get(PIPELINE_EDITOR_TRANSPORT_RETRY_ID)?.status).toBe('PASS');
 }finally{f.db.close();}
});

import {verifyStrategyAssembly,STRATEGY_ASSEMBLY_ID} from '../worker/lib/question-pipeline-strategy-verification';
import {assembleInverseStrategies} from '../worker/lib/question-strategy-assembly';
function seedAssembly(f:ReturnType<typeof fixture>){
 const q=JSON.parse(readFileSync(new URL('./fixtures/pipeline-reasoned-math-candidate.json',import.meta.url),'utf8'));
 const source={grade_level:5,outcome_id:'o',outcome_code:'MAT.5.1.2',outcome_title:curriculum.outcomes[1].title,subject_id:'math',curriculum_version_id:'cv',academic_year:curriculum.academicYear,program_version:curriculum.programVersion,source_url:curriculum.sourceUrl};
 const text=JSON.stringify({error:'EDITOR_OUTPUT_INVALID',source,editorObserved:{packet:{questions:[q]}}});
 f.db.prepare("INSERT INTO question_verifier_calibrations(id,status,verification_json) VALUES(?,'BLOCKED',?)").run(PIPELINE_EDITOR_TRANSPORT_RETRY_ID,text);
 f.db.exec('UPDATE question_agent_pilot_budget SET reserved_count=50');
 return {q,text};
}
it('assembles a recorded source once, keeps its provenance and cap, and only calls independent roles',async()=>{
 const f=fixture();try{
  const {q,text}=seedAssembly(f),assembled=assembleInverseStrategies(q)!.question;
  f.provider.mockImplementation(async(model:string,input:any)=>{
   expect(model).toBe('@cf/nvidia/nemotron-3-120b-a12b');
   if(requestedSchema(input).properties.sourceNumbers)return {response:JSON.stringify({sourceNumbers:scientificSourceNumbers(assembled),answer:'C',optionChecks:assembled.options.map(o=>({label:o.label,correct:o.label==='C',reason:'İşlem sonuçları ve yöntem açıklaması verilen başlangıç koşuluna göre kontrol edildi.'})),calculations:[{left:632,op:'ADD',right:275,result:907},{left:907,op:'SUB',right:148,result:759}]})};
   return {response:JSON.stringify({reviews:[{index:0,valid:true,issues:[],editorial:editorialScores}]})};
  });
  const result:any=await (await verifyStrategyAssembly(f.env,{id:'admin',role:'SUPER_ADMIN'} as any)).json();
  expect(result).toMatchObject({passed:true,modelEditorCalls:0,newProducerCalls:0,pureLlmEditorial:false,sourceUnchanged:true,construction:'AI_SOURCE_WITH_DETERMINISTIC_STRATEGY_EDITOR'});
  expect(f.provider).toHaveBeenCalledTimes(2);
  expect(await (await verifyStrategyAssembly(f.env,{id:'admin',role:'SUPER_ADMIN'} as any)).json()).toMatchObject({reused:true});expect(f.provider).toHaveBeenCalledTimes(2);
  expect(f.db.prepare('SELECT reserved_count FROM question_agent_pilot_budget').get()?.reserved_count).toBe(50);
  expect(f.db.prepare('SELECT verification_json FROM question_verifier_calibrations WHERE id=?').get(PIPELINE_EDITOR_TRANSPORT_RETRY_ID)?.verification_json).toBe(text);
  expect(f.db.prepare('SELECT count(*) n FROM question_bank').get()?.n).toBe(0);
 }finally{f.db.close();}
});
it('refuses unauthorized or arithmetically invalid assembly sources without any model call',async()=>{
 const f=fixture();try{
  const {q}=seedAssembly(f),user:any={id:'admin',role:'SUPER_ADMIN'};
  expect((await verifyStrategyAssembly({...f.env,ENVIRONMENT:'production'},user)).status).toBe(409);
  expect((await verifyStrategyAssembly(f.env,{...user,role:'TEACHER'})).status).toBe(409);
  q.solutionText=q.solutionText.replace('= 907','= 908');
  f.db.prepare('UPDATE question_verifier_calibrations SET verification_json=json_set(verification_json,\'$.editorObserved.packet.questions[0]\',json(?)) WHERE id=?').run(JSON.stringify(q),PIPELINE_EDITOR_TRANSPORT_RETRY_ID);
  expect((await verifyStrategyAssembly(f.env,user)).status).toBe(409);expect(f.provider).not.toHaveBeenCalled();
  expect(f.db.prepare('SELECT count(*) n FROM question_verifier_calibrations WHERE id=?').get(STRATEGY_ASSEMBLY_ID)?.n).toBe(0);
 }finally{f.db.close();}
});
it('preserves a real verifier failure and never retries a claimed assembly',async()=>{
 const f=fixture();try{
  seedAssembly(f);f.provider.mockRejectedValue(Error('Unavailable'));
  expect(await (await verifyStrategyAssembly(f.env,{id:'admin',role:'SUPER_ADMIN'} as any)).json()).toMatchObject({passed:false,stage:'REJECTED_CANDIDATE'});
  await verifyStrategyAssembly(f.env,{id:'admin',role:'SUPER_ADMIN'} as any);expect(f.provider).toHaveBeenCalledTimes(1);
  expect(f.db.prepare('SELECT status FROM question_verifier_calibrations WHERE id=?').get(STRATEGY_ASSEMBLY_ID)?.status).toBe('BLOCKED');
 }finally{f.db.close();}
});

import {diagnoseIndependentSolver,SOLVER_DIAGNOSTIC_ID} from '../worker/lib/question-solver-diagnostic';
import {sha256} from '../worker/lib/question-team-policy';
async function seedSolverDiagnostic(f:ReturnType<typeof fixture>){
 const {q,text}=seedAssembly(f),question=assembleInverseStrategies(q)!.question;
 const report={passed:false,verification:{unavailable:true},sourceUnchanged:true,pureLlmEditorial:false,construction:'AI_SOURCE_WITH_DETERMINISTIC_STRATEGY_EDITOR',candidateHash:await sha256(JSON.stringify(question)),question,source:JSON.parse(text).source};
 const old=JSON.stringify(report);f.db.prepare("INSERT INTO question_verifier_calibrations(id,status,verification_json) VALUES(?,'BLOCKED',?)").run(STRATEGY_ASSEMBLY_ID,old);
 return {question,old};
}
it('records a safe live-path error once without changing the previous failure or the exhausted pilot',async()=>{
 const f=fixture();try{
  const {old}=await seedSolverDiagnostic(f);f.provider.mockRejectedValue(Error('3045: Unknown internal error; private-do-not-copy'));
  const user:any={id:'admin',role:'SUPER_ADMIN'};
  const r:any=await (await diagnoseIndependentSolver(f.env,user)).json();
  expect(r).toMatchObject({passed:false,stage:'BLOCKED_DEPENDENCY',sourceUnchanged:true,newProducerCalls:0,modelEditorCalls:0});
  expect(r.verification.blindSolves[0]).toMatchObject({diagnosticCode:'PROVIDER_INTERNAL_ERROR',providerCode:3045});
  await diagnoseIndependentSolver(f.env,user);expect(f.provider).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(r)).not.toContain('private-do-not-copy');
  expect(f.db.prepare('SELECT verification_json FROM question_verifier_calibrations WHERE id=?').get(STRATEGY_ASSEMBLY_ID)?.verification_json).toBe(old);
  expect(f.db.prepare('SELECT reserved_count FROM question_agent_pilot_budget').get()?.reserved_count).toBe(50);
  expect(f.db.prepare('SELECT count(*) n FROM question_bank').get()?.n).toBe(0);
 }finally{f.db.close();}
});
it('forbids solver diagnostics outside staging, after semantic rejection, or after candidate alteration',async()=>{
 const f=fixture();try{
  await seedSolverDiagnostic(f);const user:any={id:'admin',role:'SUPER_ADMIN'};
  expect((await diagnoseIndependentSolver({...f.env,ENVIRONMENT:'production'},user)).status).toBe(409);
  expect((await diagnoseIndependentSolver(f.env,{...user,role:'TEACHER'})).status).toBe(409);
  f.db.prepare("UPDATE question_verifier_calibrations SET verification_json=json_set(verification_json,'$.verification.unavailable',json('false')) WHERE id=?").run(STRATEGY_ASSEMBLY_ID);
  expect((await diagnoseIndependentSolver(f.env,user)).status).toBe(409);
  f.db.prepare("UPDATE question_verifier_calibrations SET verification_json=json_set(verification_json,'$.verification.unavailable',json('true'),'$.question.correctAnswer','B') WHERE id=?").run(STRATEGY_ASSEMBLY_ID);
  expect((await diagnoseIndependentSolver(f.env,user)).status).toBe(409);expect(f.provider).not.toHaveBeenCalled();
  expect(f.db.prepare('SELECT count(*) n FROM question_verifier_calibrations WHERE id=?').get(SOLVER_DIAGNOSTIC_ID)?.n).toBe(0);
 }finally{f.db.close();}
});
it('requires both independent stages before passing a fixed candidate',async()=>{
 const f=fixture();try{
  const {question}=await seedSolverDiagnostic(f);
  f.provider.mockImplementation(async(model:string,input:any)=>{
   expect(model).toBe('@cf/nvidia/nemotron-3-120b-a12b');
   if(requestedSchema(input).properties.sourceNumbers)return {response:JSON.stringify({sourceNumbers:scientificSourceNumbers(question),answer:'C',optionChecks:question.options.map(o=>({label:o.label,correct:o.label==='C',reason:'Yöntemdeki işlemler ve sonuç başlangıç koşuluna göre ayrı ayrı kontrol edildi.'})),calculations:[{left:632,op:'ADD',right:275,result:907},{left:907,op:'SUB',right:148,result:759}]})};
   return {response:JSON.stringify({reviews:[{index:0,valid:true,issues:[],editorial:editorialScores}]})};
  });
  expect(await (await diagnoseIndependentSolver(f.env,{id:'admin',role:'SUPER_ADMIN'} as any)).json()).toMatchObject({passed:true,stage:'VERIFIED_CANDIDATE',sourceUnchanged:true});expect(f.provider).toHaveBeenCalledTimes(2);
 }finally{f.db.close();}
});

import {SOLVER_CONTRACT_FIX_ID} from '../worker/lib/question-solver-diagnostic';
it('only validates the new chat contract after the recorded operational failure and preserves that failure',async()=>{
 const f=fixture();try{
  const {question}=await seedSolverDiagnostic(f),user:any={id:'admin',role:'SUPER_ADMIN'};
  expect((await diagnoseIndependentSolver(f.env,user,true)).status).toBe(409);expect(f.provider).not.toHaveBeenCalled();
  f.provider.mockRejectedValue(Error('BLIND_SOLVER_TIMEOUT'));await diagnoseIndependentSolver(f.env,user);
  const previous=f.db.prepare('SELECT verification_json FROM question_verifier_calibrations WHERE id=?').get(SOLVER_DIAGNOSTIC_ID)?.verification_json;
  f.provider.mockImplementation(async(model:string,input:any)=>{
   expect(model).toBe('@cf/nvidia/nemotron-3-120b-a12b');expect(input.response_format.type).toBe('json_object');
   const schema=requestedSchema(input);expect(schema.type).toBe('object');
   if(schema.properties.sourceNumbers){expect(input.messages[0].content).toContain('anunex_blind_solution');return {response:JSON.stringify({sourceNumbers:scientificSourceNumbers(question),answer:'C',optionChecks:question.options.map(o=>({label:o.label,correct:o.label==='C',reason:'Yöntem hesabının kaynak verilerle tutarlılığı ayrı ayrı kontrol edildi.'})),calculations:[{left:632,op:'ADD',right:275,result:907},{left:907,op:'SUB',right:148,result:759}]})};}
   expect(input.messages[0].content).toContain('anunex_independent_review');return {response:JSON.stringify({reviews:[{index:0,valid:true,issues:[],editorial:editorialScores}]})};
  });
  expect(await (await diagnoseIndependentSolver(f.env,user,true)).json()).toMatchObject({passed:true,protocolFix:true,diagnosticId:SOLVER_CONTRACT_FIX_ID,previousDiagnosticId:SOLVER_DIAGNOSTIC_ID});
  await diagnoseIndependentSolver(f.env,user,true);expect(f.provider).toHaveBeenCalledTimes(3);
  expect(f.db.prepare('SELECT verification_json FROM question_verifier_calibrations WHERE id=?').get(SOLVER_DIAGNOSTIC_ID)?.verification_json).toBe(previous);
  expect(f.db.prepare('SELECT reserved_count FROM question_agent_pilot_budget').get()?.reserved_count).toBe(50);
 }finally{f.db.close();}
});

import {SOLVER_JSON_TRANSPORT_ID} from '../worker/lib/question-solver-diagnostic';
it('only permits the JSON transport comparison after the same candidate has a recorded provider3046 failure',async()=>{
 const f=fixture();try{
  await seedSolverDiagnostic(f);const user:any={id:'admin',role:'SUPER_ADMIN'};
  expect((await diagnoseIndependentSolver(f.env,user,false,true)).status).toBe(409);
  f.provider.mockRejectedValue(Error('BLIND_SOLVER_TIMEOUT'));await diagnoseIndependentSolver(f.env,user);
  f.provider.mockRejectedValue(Error('3046: Request timeout'));await diagnoseIndependentSolver(f.env,user,true);
  const old=f.db.prepare('SELECT verification_json FROM question_verifier_calibrations WHERE id=?').get(SOLVER_CONTRACT_FIX_ID)?.verification_json;
  const result:any=await (await diagnoseIndependentSolver(f.env,user,false,true)).json();expect(result).toMatchObject({passed:false,objectTransport:true,diagnosticId:SOLVER_JSON_TRANSPORT_ID,previousDiagnosticId:SOLVER_CONTRACT_FIX_ID});
  await diagnoseIndependentSolver(f.env,user,false,true);expect(f.provider).toHaveBeenCalledTimes(3);
  expect(f.db.prepare('SELECT verification_json FROM question_verifier_calibrations WHERE id=?').get(SOLVER_CONTRACT_FIX_ID)?.verification_json).toBe(old);
 }finally{f.db.close();}
});

import {verifyQuestionDrafts} from '../worker/lib/question-generation-validation';
const backupModel='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
function independentReply(input:any,question:any,semantic=false){
 if(requestedSchema(input).properties.sourceNumbers)return {response:JSON.stringify({sourceNumbers:scientificSourceNumbers(question),answer:'C',optionChecks:question.options.map((o:any)=>({label:o.label,correct:o.label==='C',reason:'İşlemler ve her seçenek verilen kaynak sayılardan bağımsız hesaplandı.'})),calculations:[{left:632,op:'ADD',right:275,result:907},{left:907,op:'SUB',right:148,result:759}]})};
 return {response:JSON.stringify({reviews:[{index:0,valid:!semantic,issues:semantic?['Akıl yürütme düzeyi yetersiz.']:[],editorial:{...editorialScores,...(semantic?{reasoningDemand:2}:{})}}]})};
}
it.each(['availability','scientific-rejection','editorial-rejection','quota','author-conflict','backup-unavailable'])('bounds operational backup and preserves independence: %s',async(scenario)=>{
 const f=fixture();try{
  const {question}=await seedSolverDiagnostic(f);f.env.QUESTION_GENERATION_FALLBACK_VERIFIER_MODEL=backupModel;
  const context={producerModel:'author',authorModels:scenario==='author-conflict'?[backupModel]:['author'],gradeLevel:5,qualityProfile:'EDITORIAL_V1',presentation:'TEXT',taskFocus:'NAT_INVERSE_STEPS',outcomeCode:'MAT.5.1.2'};
  f.provider.mockImplementation(async(model:string,input:any)=>{
   if(model===backupModel){expect(input.chat_template_kwargs).toBeUndefined();if(scenario==='backup-unavailable')throw Error('3046: Request timeout');return independentReply(input,question);}
   if(scenario==='scientific-rejection'){const raw=independentReply(input,question),p=JSON.parse(raw.response);p.answer='A';return {response:JSON.stringify(p)};}
   if(scenario==='editorial-rejection')return independentReply(input,question,true);
   throw Error(scenario==='quota'?'QUESTION_DAILY_AI_BUDGET_EXHAUSTED':'3046: Request timeout');
  });
  const result:any=await verifyQuestionDrafts(f.env,context,[question]);
  expect(result.ok).toBe(scenario==='availability');
  expect(f.provider.mock.calls.filter(c=>c[0]===backupModel)).toHaveLength(scenario==='availability'?2:scenario==='backup-unavailable'?1:0);
  if(scenario==='availability')expect(result).toMatchObject({fallbackUsed:true,model:backupModel,primaryFailure:{unavailable:true}});
  if(scenario==='author-conflict')expect(result.fallbackBlocked).toBe('MODEL_NOT_INDEPENDENT');
  if(scenario==='scientific-rejection'||scenario==='editorial-rejection')expect(result.unavailable).toBe(false);
  if(scenario==='backup-unavailable')expect(f.provider).toHaveBeenCalledTimes(2);
 }finally{f.db.close();}
});
import {SOLVER_BACKUP_ID} from '../worker/lib/question-solver-diagnostic';
it('uses the independent backup directly after the recorded3046 without calling the failed primary again',async()=>{
 const f=fixture();try{
  const {question}=await seedSolverDiagnostic(f),user:any={id:'admin',role:'SUPER_ADMIN'};
  expect((await diagnoseIndependentSolver(f.env,user,false,false,true)).status).toBe(409);
  f.provider.mockRejectedValue(Error('BLIND_SOLVER_TIMEOUT'));await diagnoseIndependentSolver(f.env,user);
  f.provider.mockRejectedValue(Error('3046: Request timeout'));await diagnoseIndependentSolver(f.env,user,true);await diagnoseIndependentSolver(f.env,user,false,true);
  f.provider.mockImplementation(async(model:string,input:any)=>{expect(model).toBe(backupModel);return independentReply(input,question);});
  expect(await (await diagnoseIndependentSolver(f.env,user,false,false,true)).json()).toMatchObject({passed:true,backup:true,diagnosticId:SOLVER_BACKUP_ID,selectedVerifier:backupModel});
  await diagnoseIndependentSolver(f.env,user,false,false,true);expect(f.provider).toHaveBeenCalledTimes(5);
  expect(f.db.prepare('SELECT reserved_count FROM question_agent_pilot_budget').get()?.reserved_count).toBe(50);
 }finally{f.db.close();}
});
