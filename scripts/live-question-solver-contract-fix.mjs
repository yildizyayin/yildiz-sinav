import {mkdir,writeFile} from 'node:fs/promises';
import {login,req,query} from './question-production-live-client.mjs';
const report={environment:'staging',newProducerCalls:0,modelEditorCalls:0};
try{
 await login();const sourceId='editorial-pipeline-20261015-v1-glm-transport-retry-v1-strategy-assembly-v1';
 const original=(await query('SELECT verification_json FROM question_verifier_calibrations WHERE id=?',[sourceId]))[0]?.verification_json;
 report.before=await query("SELECT * FROM question_agent_pilot_budget WHERE id='pilot_50'");report.aiBefore=await query('SELECT * FROM question_ai_budget_days ORDER BY day DESC LIMIT 1');
 let response;for(let i=0;i<40;i++){response=await req('/api/question-bank-standard/solver-contract-fix',{});if(![404,503].includes(response.status))break;await new Promise(r=>setTimeout(r,10000));}
 report.httpStatus=response.status;report.response=response.p;
 report.after=await query("SELECT * FROM question_agent_pilot_budget WHERE id='pilot_50'");report.aiAfter=await query('SELECT * FROM question_ai_budget_days ORDER BY day DESC LIMIT 1');
 report.originalUnchanged=original===(await query('SELECT verification_json FROM question_verifier_calibrations WHERE id=?',[sourceId]))[0]?.verification_json;
 report.aiCalls=await query('SELECT model,status,reserved_neurons,charged_neurons FROM question_ai_budget_calls ORDER BY created_at DESC LIMIT 8');
 if(response.status!==200)throw Error('Assembly endpoint refused');
 const actual=response.p.reused?JSON.parse(response.p.diagnostic.verification_json):response.p;report.passed=actual.passed===true;
 if(!report.originalUnchanged||JSON.stringify(report.before)!==JSON.stringify(report.after)||actual.newProducerCalls!==0||actual.modelEditorCalls!==0||actual.pureLlmEditorial!==false||actual.construction!=='AI_SOURCE_WITH_DETERMINISTIC_STRATEGY_EDITOR')throw Error('Assembly bounds not proven');
 if(!report.passed)process.exitCode=1;
}catch(e){report.error=e.message;process.exitCode=1;}
await mkdir('tmp/question-solver-contract-fix',{recursive:true});await writeFile('tmp/question-solver-contract-fix/evidence.json',JSON.stringify(report,null,2));console.log('QUESTION_SOLVER_CONTRACT_FIX '+JSON.stringify(report));
