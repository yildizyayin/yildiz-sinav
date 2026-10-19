import {mkdir,writeFile} from 'node:fs/promises';
import {login,req,query} from './question-production-live-client.mjs';
const report={environment:'staging',maximumFreshQuestions:1,studentPublication:false};
try{
 await login();report.before=await query("SELECT * FROM question_agent_pilot_budget WHERE id='pilot_50'");
 report.oldJobsBefore=await query("SELECT id,status,attempt_count,editorial_repair_count FROM question_generation_jobs WHERE request_key LIKE 'e1b7adf6-31c2-4dc1-9fa1-84725d84d00%' ORDER BY id");
 let response;for(let i=0;i<40;i++){response=await req('/api/question-bank-standard/pipeline-trial',{});if(![404,503].includes(response.status))break;await new Promise(r=>setTimeout(r,10000));}
 report.httpStatus=response.status;report.response=response.p;
 report.after=await query("SELECT * FROM question_agent_pilot_budget WHERE id='pilot_50'");
 report.oldJobsAfter=await query("SELECT id,status,attempt_count,editorial_repair_count FROM question_generation_jobs WHERE request_key LIKE 'e1b7adf6-31c2-4dc1-9fa1-84725d84d00%' ORDER BY id");
 if(response.status!==200)throw Error('Pipeline trial endpoint refused');
 const actual=response.p.reused?JSON.parse(response.p.trial.verification_json):response.p;report.passed=actual.passed===true;
 if(JSON.stringify(report.oldJobsBefore)!==JSON.stringify(report.oldJobsAfter))throw Error('Old job evidence changed');
 if(report.after[0]?.reserved_count!==50||actual.producerCalls!==1||actual.editorCalls!==1||actual.questionBankWrites!==0)throw Error('Trial bounds not proven');
 if(!report.passed)process.exitCode=1;
}catch(e){report.error=e.message;process.exitCode=1;}
await mkdir('tmp/question-pipeline-trial',{recursive:true});await writeFile('tmp/question-pipeline-trial/evidence.json',JSON.stringify(report,null,2));
console.log('QUESTION_PIPELINE_TRIAL '+JSON.stringify(report));
