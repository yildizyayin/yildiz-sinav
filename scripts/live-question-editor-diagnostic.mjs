import {mkdir,writeFile} from 'node:fs/promises';
import {login,req} from './question-production-live-client.mjs';
await login();let response;
for(let i=0;i<40;i++){
 response=await req('/api/question-bank-standard/editor-diagnostic',{});
 if(![404,503].includes(response.status))break;
 await new Promise(r=>setTimeout(r,10000));
}
const report={environment:'staging',diagnosticOnly:true,status:response.status,payload:response.p};
await mkdir('tmp/question-editor-diagnostic',{recursive:true});
await writeFile('tmp/question-editor-diagnostic/evidence.json',JSON.stringify(report,null,2));
console.log('QUESTION_EDITOR_DIAGNOSTIC '+JSON.stringify(report));
if(response.status!==200)process.exitCode=1;
