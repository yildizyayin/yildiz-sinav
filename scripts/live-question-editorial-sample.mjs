import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='https://demo.anunex.com',account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const report={environment:'staging',humanApproved:false,published:0,job:null,questions:[],generationRunRequests:0,maximumNewGenerationReservations:1,plannedMaxReserved:46};let cookie,dbid;
async function req(path,body,method=body?'POST':'GET'){
 const r=await fetch(base+path,{method,headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(240000)});const p=await r.json().catch(()=>({}));if(!r.ok)throw Error(`${path}: ${p.error?.code??r.status}`);return {r,p};
}
async function cf(path,body){const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const p=await r.json();if(!r.ok||!p.success)throw Error(`Staging CF request failed ${r.status}`);return p.result;}
async function query(sql,params=[]){if(!dbid){const vs=await cf('/workers/scripts/yildiz-sinav-v1/versions'),v=vs.items?.[0]?.id||vs[0]?.id,d=await cf('/workers/scripts/yildiz-sinav-v1/versions/'+v);const b=d.resources.bindings.find(b=>b.name==='DB'&&b.type==='d1');if(!b)throw Error('Missing staging DB');dbid=b.id||b.database_id;}return (await cf('/d1/database/'+dbid+'/query',{sql,params}))[0].results;}
const spec=JSON.parse(await readFile('data/question-pilot-math5-curriculum.json','utf8'));
try{
 if((await req('/api/health')).p.environment!=='staging')throw Error('Staging boundary failed');
 const login=await req('/api/auth/login',{identifier:'super',password:process.env.SMOKE_DEMO_PASSWORD||'Demo123!',turnstileToken:'XXXX.DUMMY.TOKEN.XXXX',remember:false});cookie=(login.r.headers.get('set-cookie')||'').match(/(yildiz_session=[^;]+)/)?.[1];if(!cookie)throw Error('Missing staging admin session');
 const cv=(await req('/api/curriculum-admin?academicYear='+spec.academicYear)).p.versions?.find(v=>v.program_version===spec.programVersion&&v.verified===1&&v.source_url===spec.sourceUrl);if(!cv)throw Error('Verified pilot context missing');
 const detail=(await req('/api/curriculum-admin/versions/'+cv.id)).p,o=detail.outcomes.find(o=>o.code==='MAT.5.1.2'&&o.active===1&&o.official===1);if(!o)throw Error('Verified outcome missing');
 const budget=(await query("SELECT question_cap,reserved_count FROM question_agent_pilot_budget WHERE id='pilot_50'"))[0];if(budget.reserved_count>46)throw Error('Frozen sample quota changed');
 const key='79ae8693-2c5f-4984-b231-1e7f58f54c31';
 report.job=(await req('/api/question-bank-standard/generation-jobs',{requestKey:key,outcomeId:o.id,questionCount:1,qualityProfile:'EDITORIAL_V1',presentation:'TABLE',taskFocus:'GENERIC',priority:2,instructionNote:'Kullanıcı hedefi: güçlü yayınevi kalitesinde özgün beceri sorusu; tabloyla gerekçeli karar. Bu not audit kaydıdır. İnsan/telif onayı ayrıca gereklidir.',expectedContext:{curriculumVersionId:cv.id,academicYear:spec.academicYear,gradeLevel:5,subjectId:o.subject_id,programVersion:spec.programVersion}})).p.job;
 if(report.job.status!=='REVIEW_READY'){
  if(report.job.attemptCount>=2)throw Error('Frozen editorial sample exhausted; no replacement');report.generationRunRequests++;await req('/api/question-bank-standard/generation-jobs/'+report.job.id+'/run',{});
 }
 report.questions=await query('SELECT id,stem_text,options_json,correct_answer,solution_text,review_status,copyright_status,review_revision,source_model,source_job_id,editorial_packet_json FROM question_bank WHERE source_job_id=?',[report.job.id]);
 if(report.questions.length!==1||report.questions[0].review_status!=='REVIEW'||report.questions[0].copyright_status!=='RESTRICTED')throw Error('Editorial sample not in human review');
 report.verification=await query("SELECT details_json FROM audit_logs WHERE entity_id=? AND action='QUESTION_GENERATION_REVIEW_READY' ORDER BY created_at DESC LIMIT 1",[report.job.id]);
 report.budget=(await query("SELECT question_cap,reserved_count FROM question_agent_pilot_budget WHERE id='pilot_50'"))[0];if(report.budget.reserved_count>46)throw Error('Unexpected reservation increase');
 const p=JSON.parse(report.questions[0].editorial_packet_json);if(p.version!==1||p.visual.kind!=='TABLE')throw Error('Editorial packet missing');
 report.status='EDITORIAL_SAMPLE_PENDING_HUMAN_AND_RIGHTS_REVIEW';
}catch(e){report.status='BLOCKED';report.error=e.message;if(report.job){report.diagnostics=await query("SELECT action,details_json FROM audit_logs WHERE entity_id=? AND action IN ('QUESTION_GENERATION_VERIFICATION_BLOCKED','QUESTION_GENERATION_OUTPUT_BLOCKED') ORDER BY created_at DESC LIMIT 2",[report.job.id]).catch(()=>[]);}process.exitCode=1;}
await mkdir('tmp/question-editorial-proof',{recursive:true});await writeFile('tmp/question-editorial-proof/evidence.json',JSON.stringify(report,null,2));console.log('EDITORIAL_SAMPLE_EVIDENCE '+JSON.stringify(report));
