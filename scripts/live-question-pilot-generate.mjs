import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='https://demo.anunex.com',account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const report={environment:'staging',target:10,providerAttemptLimit:8,maxCompletionTokensPerAttempt:3000,maxVerifierTokensPerAttempt:2500,maximumModelRequests:16,generatedQuestions:0,publishedQuestions:0,jobs:[],questions:[]};let cookie,calls=0;
async function req(path,body,method=body?'POST':'GET'){const r=await fetch(base+path,{method,headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(120000)});const p=await r.json().catch(()=>({}));return {r,p};}
async function cf(path,body){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const p=await r.json();if(!r.ok||!p.success)throw Error('Cloudflare verification failed HTTP '+r.status);return p.result;}
function key(i){let h=createHash('sha256').update('ANUNEX-MAT5-SINGLE-20261014-'+i).digest('hex').slice(0,32);h=h.slice(0,12)+'4'+h.slice(13,16)+'8'+h.slice(17);return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');}
let pilotDatabaseId;
async function query(sql,params=[]){
 if(!pilotDatabaseId){const vs=await cf('/workers/scripts/yildiz-sinav-v1/versions');const version=vs.items?.[0]?.id||vs[0]?.id;const detail=await cf('/workers/scripts/yildiz-sinav-v1/versions/'+version);const db=detail.resources.bindings.find(b=>b.name==='DB'&&b.type==='d1');if(!db)throw Error('Staging D1 binding missing');pilotDatabaseId=db.id||db.database_id;}
 return (await cf('/d1/database/'+pilotDatabaseId+'/query',{sql,params}))[0].results;
}
async function exportEvidence(){
 const ids=report.jobs.map(j=>j.id);if(ids.length){const marks=ids.map(()=>'?').join(',');report.questions=await query(`SELECT q.id,q.grade_level,q.subject_id,q.option_count,q.stem_text,q.options_json,q.correct_answer,q.solution_text,q.difficulty_level,q.review_status,q.copyright_status,q.source_model,q.source_job_id,o.code outcome_code,o.title outcome_title,cv.verified,cv.source_url FROM question_bank q JOIN question_learning_links l ON l.question_id=q.id JOIN outcomes o ON l.node_id='ln_'||o.id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE q.source_job_id IN (${marks}) ORDER BY q.source_job_id,q.id`,ids);report.usage=await query(`SELECT entity_id job_id,json_extract(details_json,'$.providerUsage') usage_json,json_extract(details_json,'$.verification') verification_json FROM audit_logs WHERE action='QUESTION_GENERATION_REVIEW_READY' AND entity_id IN (${marks}) ORDER BY created_at`,ids);}
 report.previousLastBatch=await query("SELECT id,stem_text,options_json,correct_answer,solution_text,review_status FROM question_bank WHERE source_job_id=? AND grade_level=5 AND source_model='@cf/zai-org/glm-4.7-flash'",['qgj_3567ea5d-c0b8-4a26-aa8c-ff4be7a5d2ec']);
 report.verificationBlocks=await query("SELECT entity_id,details_json FROM audit_logs WHERE action IN ('QUESTION_GENERATION_VERIFICATION_BLOCKED','QUESTION_GENERATION_OUTPUT_BLOCKED') ORDER BY created_at DESC LIMIT 8");
 report.budget=await query("SELECT question_cap,reserved_count FROM question_agent_pilot_budget WHERE id='pilot_50'");report.generatedQuestions=new Set(report.questions.map(q=>q.id)).size;report.publishedQuestions=report.questions.filter(q=>q.review_status==='APPROVED').length;
}
try{
 const health=await req('/api/health');if(health.p.environment!=='staging')throw Error('Staging boundary failed');
 const login=await req('/api/auth/login',{identifier:'super',password:process.env.SMOKE_DEMO_PASSWORD||'Demo123!',turnstileToken:'XXXX.DUMMY.TOKEN.XXXX',remember:false});if(!login.r.ok||!login.p.ok)throw Error('Staging admin session unavailable');cookie=(login.r.headers.get('set-cookie')||'').match(/(yildiz_session=[^;]+)/)?.[1];if(!cookie)throw Error('Staging session missing');
 const readiness=(await req('/api/question-bank-standard/agent-pilot/readiness')).p;report.readiness=readiness;if(readiness.manualPilot?.requestProfile!=='VALIDATED_QUESTION_DRAFT_V7')throw Error('Structured single-question profile is not deployed');
 const spec=JSON.parse(await readFile('data/question-pilot-math5-curriculum.json','utf8'));const versions=(await req('/api/curriculum-admin?academicYear='+spec.academicYear)).p;const cv=versions.versions?.find(v=>v.program_version===spec.programVersion&&v.verified===1&&v.authority==='MEB'&&v.source_url===spec.sourceUrl);if(!cv)throw Error('Verified official pilot curriculum missing');
 const detail=(await req('/api/curriculum-admin/versions/'+cv.id)).p;const outcomes=detail.outcomes.filter(o=>spec.outcomes.some(s=>s.code===o.code&&s.title===o.title)&&o.official===1&&o.active===1&&o.grade_level===5).sort((a,b)=>a.code.localeCompare(b.code));if(outcomes.length!==2)throw Error('Official learning outcomes mismatch');
 const priorId='qgj_0ee4601e-8e21-4248-bddb-f4e97caf99ea';
 const prior=await query("SELECT id,status,question_count,generated_count FROM question_generation_jobs WHERE id=? AND curriculum_version_id=? AND grade_level=5",[priorId,cv.id]);
 const priorQuestions=await query("SELECT id,review_status,copyright_status,source_model FROM question_bank WHERE source_job_id=?",[priorId]);
 if(prior.length!==1||prior[0].status!=='REVIEW_READY'||prior[0].generated_count!==2||priorQuestions.length!==2||priorQuestions.some(q=>q.review_status!=='REVIEW'||q.copyright_status!=='RESTRICTED'||q.source_model!=='@cf/openai/gpt-oss-120b'))throw Error('Previously verified draft pair changed');
 report.jobs.push(prior[0]);
 const budget=(await query("SELECT question_cap,reserved_count FROM question_agent_pilot_budget WHERE id='pilot_50'"))[0];report.preflightBudget=budget;
 // Retire only the two exhausted jobs explicitly identified in the prior pilot evidence.
 for(const id of ['qgj_e5dde4e2-47e6-4728-b88f-c385354c21eb','qgj_5c920c5c-76ae-4f1f-9218-1cc8f9bb0031']){
  const rows=await query("SELECT status,generated_count,attempt_count FROM question_generation_jobs WHERE id=? AND curriculum_version_id=? AND grade_level=5",[id,cv.id]);
  if(rows.length!==1)throw Error('Prior failed-job scope mismatch');const j=rows[0];if(j.status==='CANCELLED')continue;
  if(j.status!=='FAILED'||j.generated_count!==0||j.attempt_count!==3)throw Error('Prior pilot job changed');
  const cancelled=await req('/api/question-bank-standard/generation-jobs/'+id+'/cancel',{},'PATCH');if(!cancelled.r.ok)throw Error('Cannot retire exhausted pilot job');
 }
 for(let i=0;i<8;i++){
  const o=outcomes[i%2];let requestKey=key(i);
  // One evidence-based replacement only; never reset attempts or refund reservations.
  if(i===5){
   const exhausted=await query('SELECT id,status,attempt_count,generated_count FROM question_generation_jobs WHERE request_key=? AND curriculum_version_id=? AND grade_level=5',[requestKey,cv.id]);
   if(exhausted.length!==1||exhausted[0].id!=='qgj_c023359e-47ad-47a2-8d55-a0a83578d480'||exhausted[0].generated_count!==0||exhausted[0].attempt_count!==3||!['FAILED','CANCELLED'].includes(exhausted[0].status))throw Error('Frozen replacement scope mismatch');
   if(exhausted[0].status!=='CANCELLED'){
    const retired=await req('/api/question-bank-standard/generation-jobs/'+exhausted[0].id+'/cancel',{},'PATCH');if(!retired.r.ok)throw Error('Cannot retire exhausted single question');
   }
   report.retiredSingle=exhausted[0];requestKey=key(105);
  }
  const existing=await query("SELECT id,status,attempt_count FROM question_generation_jobs WHERE request_key=?",[requestKey]);
  if(!existing.length){const b=(await query("SELECT question_cap,reserved_count FROM question_agent_pilot_budget WHERE id='pilot_50'"))[0];if(!b||b.question_cap-b.reserved_count<1)throw Error('Atomic pilot budget has no remaining reservation');}
  const created=await req('/api/question-bank-standard/generation-jobs',{requestKey,outcomeId:o.id,questionCount:1,expectedContext:{curriculumVersionId:cv.id,academicYear:spec.academicYear,gradeLevel:5,subjectId:o.subject_id,programVersion:spec.programVersion}});if(!created.r.ok)throw Error('Job creation failed '+(created.p.error?.code||created.r.status));
  const job=created.p.job;report.jobs.push(job);if(job.status==='REVIEW_READY')continue;
  if(job.attemptCount>=3){
   // This reviewed failure must not hide the last independent, already-planned job.
   // Keep it FAILED and in the evidence; no replacement, reset or refund.
   if(i===6&&job.id==='qgj_51ac7e47-5cb1-46dc-8d2a-8d31ef0269e3'&&job.status==='FAILED'){
    report.exhaustedJobs=[{id:job.id,reason:'Repeated reading task; three attempts exhausted'}];continue;
   }
   throw Error('Single-question job exhausted; inspect evidence before replacement');
  }
  calls++;console.log('PILOT_BATCH_PROGRESS '+JSON.stringify({batch:i+1,jobId:job.id,runRequests:calls}));
  const run=await req('/api/question-bank-standard/generation-jobs/'+job.id+'/run',{});if(!run.r.ok){const state=(await query('SELECT status,attempt_count,error_code FROM question_generation_jobs WHERE id=?',[job.id]))[0];report.jobs[report.jobs.length-1]={...job,status:state?.status??job.status,attemptCount:state?.attempt_count??job.attemptCount,errorCode:state?.error_code??run.p.error?.code};throw Error('Single-question generation blocked '+(run.p.error?.code||run.r.status));}
  report.jobs[report.jobs.length-1]=run.p.job;if(run.p.job?.status!=='REVIEW_READY')throw Error('Pilot job incomplete');
 }
 // Exact, evidence-reviewed semantic duplicate; retain history, never approve it.
 const duplicate=await query("SELECT id,review_status,review_revision,stem_text,options_json,correct_answer,solution_text FROM question_bank WHERE id=? AND source_job_id=? AND grade_level=5 AND source_model='@cf/openai/gpt-oss-120b' AND copyright_status='RESTRICTED'",['q_37062d41-71ce-41c9-b720-dd1074d1dc09','qgj_43889427-fdba-4a11-9763-1abc902a6bd1']);
 const original=await query("SELECT id,stem_text,options_json,correct_answer,solution_text FROM question_bank WHERE id=? AND source_job_id=? AND review_status='REVIEW' AND grade_level=5",['q_c3ff23af-f411-4d0c-9d6b-415c39047f09','qgj_1a0cbf77-b888-4e16-a0d2-1cc8fce0ba27']);
 if(duplicate.length!==1||original.length!==1||!['REVIEW','REJECTED'].includes(duplicate[0].review_status))throw Error('Known semantic duplicate changed; inspect before mutation');
 const snapshotHash=q=>createHash('sha256').update(JSON.stringify([q.stem_text,q.options_json,q.correct_answer,q.solution_text])).digest('hex');
 if(snapshotHash(duplicate[0])!=='f46ee330979718c2305d8dfb515110e6cdba01f85ae1ba0024d08640c7fc2c9c'||snapshotHash(original[0])!=='603374a53ed960c02c3e6f16c1c330f6e0e2718100609458bc8f9c49ab8c10e7')throw Error('Reviewed duplicate content changed; do not reuse the old rejection');
 if(duplicate[0].review_status==='REVIEW'){
  const rejected=await req('/api/question-bank-standard/'+duplicate[0].id+'/review',{status:'REJECTED',expectedRevision:duplicate[0].review_revision,note:'AI destekli içerik incelemesi: q_c3ff23af ile aynı iki dönem tüketim/dağıtım çıkarma ve kalanları kutulara tam bölme görevi; yalnız sayılar ve nesne değişmiş. Anlamsal tekrar. İnsan onayı veya telif uygunluğu verilmedi.'},'PATCH');
  if(!rejected.r.ok)throw Error('Could not quarantine known semantic duplicate');
 }
 report.semanticRejection={id:duplicate[0].id,duplicateOf:original[0].id};
 await exportEvidence();
 report.reviewQuestionCount=report.questions.filter(q=>q.review_status==='REVIEW').length;
 report.rejectedQuestionCount=report.questions.filter(q=>q.review_status==='REJECTED').length;
 if(report.generatedQuestions!==10||report.publishedQuestions!==0||report.questions.some(q=>q.option_count!==4||q.review_status!=='REVIEW'||q.copyright_status!=='RESTRICTED'||q.verified!==1))throw Error('Real draft evidence incomplete');
 if(report.usage.length!==9||report.usage.some(u=>JSON.parse(u.verification_json||'null')?.ok!==true))throw Error('Independent verification evidence missing');
 report.status='TEN_AUTOMATICALLY_SCREENED_DRAFTS_PENDING_HUMAN_REVIEW';
}catch(e){report.status='BLOCKED';report.error=e.message;try{await exportEvidence()}catch{}process.exitCode=1;}
report.runRequests=calls;await mkdir('tmp/question-pilot',{recursive:true});await writeFile('tmp/question-pilot/first-ten.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,questions:report.questions.map(({stem_text,options_json,solution_text,correct_answer,...q})=>q)},null,2));
console.log('PILOT_CONTENT_EVIDENCE '+JSON.stringify(report.questions));
