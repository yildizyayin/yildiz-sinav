import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {login,req,query} from './question-production-live-client.mjs';
const catalog=JSON.parse(await readFile('data/question-full-math-target-2028.json','utf8'));
const report={environment:'staging',academicYear:'2027-2028',newProducerCalls:0,newEditorCalls:0};
try{
 await login();report.before={jobs:await query('SELECT count(*) n FROM question_generation_jobs'),questions:await query('SELECT count(*) n FROM question_bank'),campaigns:await query('SELECT id,academic_year,status FROM question_production_campaigns ORDER BY id')};
 let result;for(let i=0;i<15;i++){result=await req('/api/question-bank-standard/team/readiness?academicYear=2027-2028');if(result.status===200&&result.p.summary?.importedGrades===8)break;if(i<14)await new Promise(r=>setTimeout(r,12000));}
 if(result.status!==200||result.p.summary?.importedGrades!==8||result.p.summary?.expectedOutcomes!==catalog.grades.reduce((n,g)=>n+g.outcomes.length,0)||result.p.grades?.length!==8||!result.p.grades.every(g=>g.fullProgramImported)||result.p.capabilities.massProductionReady!==false||result.p.capabilities.allSubjectsVerified!==false)throw Error('READINESS_API_NOT_VERIFIED');
 report.readiness=result.p;
 const anonymous=await fetch('https://demo.anunex.com/api/question-bank-standard/team/readiness?academicYear=2027-2028',{signal:AbortSignal.timeout(30000)});if(anonymous.status!==401)throw Error('ANONYMOUS_READINESS_EXPOSED');report.anonymousStatus=anonymous.status;
 const invalid=await req('/api/question-bank-standard/team/readiness?academicYear=2027-2030');if(invalid.status!==400)throw Error('INVALID_YEAR_NOT_REJECTED');report.invalidYearStatus=invalid.status;
 const old=await req('/api/question-bank-standard/team/readiness?academicYear=2026-2027');if(old.status!==200||old.p.summary?.importedGrades!==0)throw Error('TARGET_YEAR_SCOPE_LEAK');report.oldYearIsolated=true;
 report.after={jobs:await query('SELECT count(*) n FROM question_generation_jobs'),questions:await query('SELECT count(*) n FROM question_bank'),campaigns:await query('SELECT id,academic_year,status FROM question_production_campaigns ORDER BY id')};if(JSON.stringify(report.before)!==JSON.stringify(report.after))throw Error('READINESS_INSPECTION_CHANGED_STATE');report.passed=true;
}catch(e){report.passed=false;report.error=e.message;process.exitCode=1;}
await mkdir('tmp/question-pool-closure',{recursive:true});await writeFile('tmp/question-pool-closure/evidence.json',JSON.stringify(report,null,2));console.log('QUESTION_POOL_CLOSURE '+JSON.stringify(report));
