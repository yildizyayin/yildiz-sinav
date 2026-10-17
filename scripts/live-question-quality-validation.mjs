import {mkdir,writeFile} from 'node:fs/promises';
import {login,req,query} from './question-production-live-client.mjs';
const report={environment:'staging',createsQuestions:false,humanApproved:false};
try{
 await login();report.before=await query("SELECT * FROM question_agent_pilot_budget WHERE id='pilot_50'");
 let response;for(let i=0;i<40;i++){response=await req('/api/question-bank-standard/quality-validation',{});if(![404,503].includes(response.status))break;await new Promise(r=>setTimeout(r,10000));}
 report.httpStatus=response.status;report.result=response.p;
 if(response.status!==200)throw Error('Validation endpoint failed');
 const actual=response.p.reused?JSON.parse(response.p.validation.verification_json):response.p;report.passed=actual.passed;
 report.after=await query("SELECT * FROM question_agent_pilot_budget WHERE id='pilot_50'");
 if(JSON.stringify(report.before)!==JSON.stringify(report.after))throw Error('Pilot counter changed');
 if(!actual.passed)process.exitCode=1;
}catch(e){report.error=e.message;process.exitCode=1;}
await mkdir('tmp/question-quality-validation',{recursive:true});await writeFile('tmp/question-quality-validation/evidence.json',JSON.stringify(report,null,2));
console.log('QUESTION_QUALITY_VALIDATION '+JSON.stringify(report));
