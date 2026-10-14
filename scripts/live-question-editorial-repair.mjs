import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='https://demo.anunex.com',account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const report={environment:'staging',humanApproved:false,published:0,producerCalls:0,newReservations:0,questions:[]};let cookie,dbid;
async function req(path,body,method=body?'POST':'GET'){
 const r=await fetch(base+path,{method,headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(240000)});const p=await r.json().catch(()=>({}));if(!r.ok)throw Error(`${path}: ${p.error?.code??r.status}`);return {r,p};
}
async function cf(path,body){const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const p=await r.json();if(!r.ok||!p.success)throw Error(`Staging CF request failed ${r.status}`);return p.result;}
async function query(sql,params=[]){if(!dbid){const vs=await cf('/workers/scripts/yildiz-sinav-v1/versions'),v=vs.items?.[0]?.id||vs[0]?.id,d=await cf('/workers/scripts/yildiz-sinav-v1/versions/'+v);const b=d.resources.bindings.find(b=>b.name==='DB'&&b.type==='d1');if(!b)throw Error('Missing staging DB');dbid=b.id||b.database_id;}return (await cf('/d1/database/'+dbid+'/query',{sql,params}))[0].results;}
const correction=JSON.parse(await readFile('data/question-editorial-repair-20261014.json','utf8'));
try{
 if((await req('/api/health')).p.environment!=='staging')throw Error('Staging boundary failed');
 const login=await req('/api/auth/login',{identifier:'super',password:process.env.SMOKE_DEMO_PASSWORD||'Demo123!',turnstileToken:'XXXX.DUMMY.TOKEN.XXXX',remember:false});cookie=(login.r.headers.get('set-cookie')||'').match(/(yildiz_session=[^;]+)/)?.[1];if(!cookie)throw Error('Missing staging session');
 const before=(await query("SELECT reserved_count FROM question_agent_pilot_budget WHERE id='pilot_50'"))[0];if(before.reserved_count!==46)throw Error('Frozen sample budget changed');
 const source=(await req('/api/question-bank-standard/generation-jobs/'+correction.jobId+'/repair')).p;if(source.sourceHash!==correction.expectedSourceHash||source.attemptCount!==3)throw Error('Actual model source changed');
 report.result=(await req('/api/question-bank-standard/generation-jobs/'+correction.jobId+'/repair',{expectedSourceAuditId:source.sourceAuditId,expectedSourceHash:source.sourceHash,drafts:correction.drafts,reason:correction.reason})).p;
 report.questions=await query('SELECT id,stem_text,options_json,correct_answer,solution_text,editorial_packet_json,review_status,copyright_status,source_model,source_job_id,review_revision FROM question_bank WHERE source_job_id=?',[correction.jobId]);
 report.job=(await query('SELECT status,attempt_count,editorial_repair_count,generated_count,repair_source_hash FROM question_generation_jobs WHERE id=?',[correction.jobId]))[0];
 report.audit=await query("SELECT action,details_json FROM audit_logs WHERE entity_id=? AND action IN ('QUESTION_GENERATION_REVIEW_READY','QUESTION_GENERATION_VERIFICATION_BLOCKED','QUESTION_EDITORIAL_REPAIR_REQUESTED') ORDER BY created_at DESC,id DESC LIMIT 3",[correction.jobId]);
 report.budget=(await query("SELECT question_cap,reserved_count FROM question_agent_pilot_budget WHERE id='pilot_50'"))[0];
 if(report.budget.reserved_count!==46||report.job.attempt_count!==3||report.job.editorial_repair_count!==1||report.questions.length!==1||report.questions[0].review_status!=='REVIEW'||report.questions[0].copyright_status!=='RESTRICTED')throw Error('Repair provenance/approval boundary failed');
 const proof=report.audit.find(a=>a.action==='QUESTION_GENERATION_REVIEW_READY');const detail=JSON.parse(proof?.details_json||'null');if(!detail||detail.producerCalled!==false||!detail.verification.ok||!detail.editorialRepair||detail.editorialRepair.sourceHash!==source.sourceHash)throw Error('Independent repaired-packet proof missing');
 report.status='AI_ASSISTED_REVISED_DRAFT_PENDING_HUMAN_AND_RIGHTS_REVIEW';
}catch(e){report.status='BLOCKED';report.error=e.message;report.diagnostics=await query("SELECT action,details_json FROM audit_logs WHERE entity_id=? AND action IN ('QUESTION_GENERATION_VERIFICATION_BLOCKED','QUESTION_GENERATION_OUTPUT_BLOCKED','QUESTION_EDITORIAL_REPAIR_REQUESTED') ORDER BY created_at DESC,id DESC LIMIT 3",[correction.jobId]).catch(()=>[]);process.exitCode=1;}
await mkdir('tmp/question-editorial-repair-proof',{recursive:true});await writeFile('tmp/question-editorial-repair-proof/evidence.json',JSON.stringify(report,null,2));console.log('EDITORIAL_REPAIR_EVIDENCE '+JSON.stringify(report));
