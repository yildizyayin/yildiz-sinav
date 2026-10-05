import { appendFileSync } from 'node:fs';

const BASE=(process.env.SMOKE_BASE_URL||'').replace(/\/$/,'');
const institutionCode=process.env.RESULT_LOAD_INSTITUTION_CODE||'';
const gradeLevel=Number(process.env.RESULT_LOAD_GRADE_LEVEL||0);
const fullName=process.env.RESULT_LOAD_FULL_NAME||'';
const lookupType=process.env.RESULT_LOAD_LOOKUP_TYPE==='TCKN'?'TCKN':'STUDENT_NUMBER';
const lookupValue=process.env.RESULT_LOAD_LOOKUP_VALUE||'';
const accessCode=process.env.RESULT_LOAD_ACCESS_CODE||'';
const turnstileToken=process.env.RESULT_LOAD_TURNSTILE_TOKEN||'XXXX.DUMMY.TOKEN.XXXX';
if(!/^https:\/\/(?:demo\.anunex\.com|[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev)$/i.test(BASE))throw new Error('Isolated staging URL required');
if(!/^\d{5,12}$/.test(institutionCode)||!Number.isInteger(gradeLevel)||gradeLevel<1||gradeLevel>12||fullName.trim().length<3||!lookupValue||!/^[A-Za-z0-9]{6,12}$/.test(accessCode))throw new Error('Synthetic result-load identity secrets are incomplete');
const post=async(path,body)=>{
 const response=await fetch(`${BASE}${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),redirect:'manual'});
 const raw=await response.text();let payload;try{payload=raw?JSON.parse(raw):null}catch{payload={raw}};
 if(!response.ok)throw new Error(`${path} failed with ${response.status}: ${JSON.stringify(payload)}`);return{response,payload};
};
const lookup=await post('/api/public/results/lookup',{institutionCode,gradeLevel,fullName,lookupType,lookupValue,turnstileToken});
if(!lookup.payload?.found||!lookup.payload?.challengeId)throw new Error('Synthetic result-load identity did not resolve to a published result');
const verified=await post('/api/public/results/verify',{challengeId:lookup.payload.challengeId,accessCode});
if(!verified.payload?.ok)throw new Error('Synthetic result-load access code was not accepted');
const cookie=(verified.response.headers.get('set-cookie')||'').match(/(anunex_result_session=[^;]+)/)?.[1];
if(!cookie)throw new Error('Result session cookie missing');
const check=await fetch(`${BASE}/api/public/results/student`,{headers:{cookie},redirect:'manual'});if(!check.ok)throw new Error(`Authenticated result summary preflight failed with ${check.status}`);
const body=await check.json();if(!body?.ok||!Array.isArray(body.exams))throw new Error('Authenticated result summary has unexpected shape');
if(process.env.GITHUB_ENV){console.log(`::add-mask::${cookie}`);appendFileSync(process.env.GITHUB_ENV,`RESULT_LOAD_COOKIE=${cookie}\n`)}else process.stdout.write(`${cookie}\n`);
console.log(`PASS: prepared one synthetic authenticated result session with ${body.exams.length} published exam summaries`);
