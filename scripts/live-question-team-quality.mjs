import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='https://demo.anunex.com',account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const report={environment:'staging',humanApproved:false,published:0,edits:[],jobs:[],questions:[],generationRunRequests:0,verificationRequests:0,maximumNewGenerationReservations:2,plannedMaxReserved:45};let cookie,dbid;
async function req(path,body,method=body?'POST':'GET'){
 const r=await fetch(base+path,{method,headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(120000)});const p=await r.json().catch(()=>({}));if(!r.ok)throw Error(`${path}: ${p.error?.code??r.status}`);return {r,p};
}
async function cf(path,body){const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const p=await r.json();if(!r.ok||!p.success)throw Error(`Staging CF request failed ${r.status}`);return p.result;}
async function query(sql,params=[]){if(!dbid){const vs=await cf('/workers/scripts/yildiz-sinav-v1/versions'),v=vs.items?.[0]?.id||vs[0]?.id,d=await cf('/workers/scripts/yildiz-sinav-v1/versions/'+v);const b=d.resources.bindings.find(b=>b.name==='DB'&&b.type==='d1');if(!b)throw Error('Missing staging DB');dbid=b.id||b.database_id;}return (await cf('/d1/database/'+dbid+'/query',{sql,params}))[0].results;}
const digest=q=>createHash('sha256').update(JSON.stringify([q.stem_text,q.options_json,q.correct_answer,q.solution_text])).digest('hex');
const uuid=label=>{let h=createHash('sha256').update('ANUNEX-FOCUSED-QUALITY-20261014-'+label).digest('hex').slice(0,32);h=h.slice(0,12)+'4'+h.slice(13,16)+'8'+h.slice(17);return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');};
const snapshot=JSON.parse(await readFile('data/question-pilot-review-checkpoint-20261014.json','utf8'));
const retainedIds=snapshot.questions.filter(q=>q.review_status==='REVIEW').map(q=>q.id);
async function exportEvidence(){const ids=[...retainedIds,...report.jobs.flatMap(j=>j.questionIds??[])];report.questions=await query(`SELECT id,stem_text,options_json,correct_answer,solution_text,review_status,copyright_status,review_revision,source_model,source_job_id FROM question_bank WHERE id IN (${ids.map(()=>'?').join(',')})`,ids);report.budget=(await query("SELECT question_cap,reserved_count FROM question_agent_pilot_budget WHERE id='pilot_50'"))[0];report.published=report.questions.filter(q=>q.review_status==='APPROVED').length;}
try{
 if((await req('/api/health')).p.environment!=='staging')throw Error('Staging boundary failed');
 const login=await req('/api/auth/login',{identifier:'super',password:process.env.SMOKE_DEMO_PASSWORD||'Demo123!',turnstileToken:'XXXX.DUMMY.TOKEN.XXXX',remember:false});cookie=(login.r.headers.get('set-cookie')||'').match(/(yildiz_session=[^;]+)/)?.[1];if(!cookie)throw Error('Missing staging admin session');
 const fixes=JSON.parse(await readFile('data/question-pilot-editorial-corrections-20261014.json','utf8'));
 for(const fix of fixes){
  const q=(await query('SELECT * FROM question_bank WHERE id=?',[fix.questionId]))[0];
  if(!q||q.owner_type!=='PLATFORM'||q.source_job_id!==fix.sourceJobId||q.origin_kind!=='AI_GENERATED'||q.review_status!=='REVIEW'||q.copyright_status!=='RESTRICTED')throw Error('Frozen editorial scope changed');
  const wanted={stem_text:fix.patch.stemText,options_json:JSON.stringify(fix.patch.options),correct_answer:fix.patch.correctAnswer,solution_text:fix.patch.solutionText};
  if(digest(q)!==digest(wanted)){
   if(digest(q)!==fix.expectedOldHash)throw Error('Draft changed since editorial review');
   await req(`/api/question-bank-standard/${q.id}/content`,{...fix.patch,expectedRevision:q.review_revision},'PATCH');
  }
  const updated=(await query('SELECT review_revision FROM question_bank WHERE id=?',[q.id]))[0];
  const currentContext=await query("SELECT o.id,o.code,o.title,o.active,o.grade_level,o.subject_id,o.curriculum_version_id,cv.program_version,cv.verified,cv.academic_year FROM question_learning_links l JOIN outcomes o ON l.node_id='ln_'||o.id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE l.question_id=? ORDER BY o.id LIMIT 16",[q.id]);
  const priorProof=(await query("SELECT details_json FROM audit_logs WHERE action='QUESTION_DRAFT_VERIFIED' AND entity_id=? AND json_extract(details_json,'$.reviewRevision')=? AND json_extract(details_json,'$.ok')=1 ORDER BY created_at DESC,id DESC LIMIT 1",[q.id,updated.review_revision]))[0];
  const proof=priorProof?JSON.parse(priorProof.details_json):null;
  let checked;if(proof&&JSON.stringify(proof.officialContext)===JSON.stringify(currentContext))checked={p:{verification:proof},reused:true};
  else{report.verificationRequests++;checked=await req(`/api/question-bank-standard/${q.id}/content/verify`,{expectedRevision:updated.review_revision});}
  report.edits.push({id:q.id,reviewRevision:updated.review_revision,verification:checked.p.verification,reused:checked.reused??false});
  if(!checked.p.verification?.ok)throw Error('Edited draft failed independent verification');
 }
 const spec=JSON.parse(await readFile('data/question-pilot-math5-curriculum.json','utf8'));
 const cv=(await req('/api/curriculum-admin?academicYear='+spec.academicYear)).p.versions?.find(v=>v.program_version===spec.programVersion&&v.verified===1&&v.source_url===spec.sourceUrl);if(!cv)throw Error('Official pilot curriculum missing');
 const detail=(await req('/api/curriculum-admin/versions/'+cv.id)).p;
 const exhausted=(await query("SELECT * FROM question_generation_jobs WHERE id=? AND curriculum_version_id=? AND grade_level=5",['qgj_51ac7e47-5cb1-46dc-8d2a-8d31ef0269e3',cv.id]))[0];
 if(!exhausted||!['FAILED','CANCELLED'].includes(exhausted.status)||exhausted.attempt_count!==3||exhausted.generated_count!==0)throw Error('Exhausted reading job changed');
 if(exhausted.status!=='CANCELLED')await req('/api/question-bank-standard/generation-jobs/'+exhausted.id+'/cancel',{},'PATCH');
 for(const [code,taskFocus] of [['MAT.5.1.1','READ_ZERO_PERIODS'],['MAT.5.1.2','NAT_COMPARE_OFFERS']]){
  const o=detail.outcomes.find(o=>o.code===code&&o.active===1&&o.official===1);if(!o)throw Error('Verified outcome missing');
  const requestKey=uuid(taskFocus),existing=(await query('SELECT id FROM question_generation_jobs WHERE request_key=?',[requestKey]))[0];
  const b=(await query("SELECT question_cap,reserved_count FROM question_agent_pilot_budget WHERE id='pilot_50'"))[0];if(b.reserved_count>45||(!existing&&b.reserved_count>=45))throw Error('Frozen focused cohort reservation limit reached');
  const created=await req('/api/question-bank-standard/generation-jobs',{requestKey,questionCount:1,outcomeId:o.id,taskFocus,instructionNote:'Kullanıcı talimatı: önce özgün görev çeşitliliği; insan onayı ve telif incelemesi ayrıca.',priority:2,expectedContext:{curriculumVersionId:cv.id,academicYear:spec.academicYear,gradeLevel:5,subjectId:o.subject_id,programVersion:spec.programVersion}});
  let job=created.p.job;report.jobs.push(job);
  if(job.status!=='REVIEW_READY'){if(job.attemptCount>=3)throw Error('Focused job exhausted; no replacement');report.generationRunRequests++;job=(await req('/api/question-bank-standard/generation-jobs/'+job.id+'/run',{})).p.job;}
  const rows=await query('SELECT id FROM question_bank WHERE source_job_id=?',[job.id]);report.jobs[report.jobs.length-1]={...job,questionIds:rows.map(q=>q.id)};
 }
 await exportEvidence();
 if(report.questions.length!==10||report.questions.some(q=>q.review_status!=='REVIEW'||q.copyright_status!=='RESTRICTED')||report.published!==0||report.budget.reserved_count>45)throw Error('Ten screened drafts incomplete');
 report.status='TEN_DRAFTS_PENDING_HUMAN_AND_RIGHTS_REVIEW';
}catch(e){report.status='BLOCKED';report.error=e.message;try{await exportEvidence()}catch{}process.exitCode=1;}
await mkdir('tmp/question-team-quality',{recursive:true});await writeFile('tmp/question-team-quality/evidence.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,questions:report.questions.map(({stem_text,options_json,solution_text,...q})=>q)},null,2));console.log('QUALITY_CONTENT_EVIDENCE '+JSON.stringify(report.questions));
