import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {login,req,query} from './question-production-live-client.mjs';
const report={environment:'staging',startedAt:new Date().toISOString(),humanApproved:false,questionsPublished:0,maximumNewReservations:4,maximumProducerCalls:4,automaticRetries:false,jobs:[]};
try{
 await login();
 const budget=(await query("SELECT * FROM question_agent_pilot_budget WHERE id='pilot_50'"))[0];if(budget.reserved_count<46||budget.reserved_count>50)throw Error('Pilot witness changed');
 let ready=false;for(let i=0;i<40;i++){const state=await req('/api/question-bank-standard/verifier-calibration');if(state.p.contractVersion==='BLIND_V2_EDITORIAL_READING_V1'){ready=true;break;}await new Promise(r=>setTimeout(r,10000));}if(!ready)throw Error('Expected deployed quality contract not ready');
 report.calibration=await req('/api/question-bank-standard/verifier-calibration',{});
 const gold=(await query('SELECT * FROM question_verifier_calibrations WHERE id=?',['editorial-verifier-20261015-v2']))[0];report.gold=gold;
 if(gold?.status!=='PASS')throw Error('Independent verifier failed frozen positive/negative calibration');
 const spec=JSON.parse(await readFile('data/question-pilot-math5-curriculum.json','utf8'));
 const cv=(await req('/api/curriculum-admin?academicYear='+spec.academicYear)).p.versions?.find(v=>v.program_version===spec.programVersion&&v.verified===1&&v.source_url===spec.sourceUrl);if(!cv)throw Error('Verified curriculum missing');
 const detail=(await req('/api/curriculum-admin/versions/'+cv.id)).p;
 const directions=[
  ['e1b7adf6-31c2-4dc1-9fa1-84725d84d001','MAT.5.1.1','GENERIC','TEXT'],
  ['e1b7adf6-31c2-4dc1-9fa1-84725d84d002','MAT.5.1.1','READ_ZERO_PERIODS','TEXT'],
  ['e1b7adf6-31c2-4dc1-9fa1-84725d84d003','MAT.5.1.2','NAT_COMPARE_OFFERS','TABLE'],
  ['e1b7adf6-31c2-4dc1-9fa1-84725d84d004','MAT.5.1.2','NAT_INVERSE_STEPS','TEXT'],
 ];
 for(const [key,code,taskFocus,presentation] of directions){
  const o=detail.outcomes.find(o=>o.code===code&&o.active===1&&o.official===1);if(!o)throw Error('Official outcome missing');
  const created=await req('/api/question-bank-standard/generation-jobs',{requestKey:key,outcomeId:o.id,questionCount:1,qualityProfile:'EDITORIAL_V1',presentation,taskFocus,priority:2,instructionNote:'15 Ekim bağımsız otonom kalite ölçümü; dört farklı yönlendirme, iş başına tek deneme; insan düzenlemesi veya onayı yok.',expectedContext:{curriculumVersionId:cv.id,academicYear:spec.academicYear,gradeLevel:5,subjectId:o.subject_id,programVersion:spec.programVersion}});
  if(![200,201].includes(created.status))throw Error('Job creation failed '+JSON.stringify(created.p));
  const job=created.p.job,item={id:job.id,code,taskFocus,presentation,reused:created.p.reused};report.jobs.push(item);
  if(job.status==='REQUESTED'&&job.attemptCount===0)item.run=await req('/api/question-bank-standard/generation-jobs/'+job.id+'/run',{});
  item.state=(await query('SELECT id,status,attempt_count,generated_count,error_code FROM question_generation_jobs WHERE id=?',[job.id]))[0];
  item.questions=await query('SELECT id,stem_text,options_json,correct_answer,solution_text,editorial_packet_json,review_status,copyright_status FROM question_bank WHERE source_job_id=?',[job.id]);
  item.evidence=await query("SELECT action,details_json FROM audit_logs WHERE entity_id=? AND action IN ('QUESTION_GENERATION_REVIEW_READY','QUESTION_GENERATION_OUTPUT_BLOCKED','QUESTION_GENERATION_VERIFICATION_BLOCKED') ORDER BY created_at DESC,id DESC",[job.id]);
 }
 const success=report.jobs.filter(j=>j.state.status==='REVIEW_READY'&&j.state.attempt_count===1&&j.questions.length===1&&j.questions[0].review_status==='REVIEW'&&j.questions[0].copyright_status==='RESTRICTED'&&j.evidence.some(e=>{const d=JSON.parse(e.details_json);return e.action==='QUESTION_GENERATION_REVIEW_READY'&&d.producerCalled===true&&d.verification?.ok===true}));
 report.autonomous={attempts:report.jobs.length,screened:success.length,successfulOutcomes:[...new Set(success.map(j=>j.code))],successfulPresentations:[...new Set(success.map(j=>j.presentation))],humanAccepted:0};
 report.qualityGate=success.length>=3&&report.autonomous.successfulOutcomes.length>=2&&report.autonomous.successfulPresentations.length>=2;
 report.status=report.qualityGate?'BOUNDED_AUTONOMOUS_QUALITY_PASS':'QUALITY_BLOCKED';if(!report.qualityGate)process.exitCode=1;
}catch(e){report.status='BLOCKED';report.error=e.message;process.exitCode=1;}
report.finishedAt=new Date().toISOString();report.budget=await query("SELECT * FROM question_agent_pilot_budget WHERE id='pilot_50'").catch(()=>[]);report.aiDays=await query('SELECT * FROM question_ai_budget_days ORDER BY day DESC LIMIT 2').catch(()=>[]);report.aiCalls=await query('SELECT day,model,status,reserved_neurons,charged_neurons FROM question_ai_budget_calls ORDER BY created_at DESC LIMIT 20').catch(()=>[]);
await mkdir('tmp/question-production-calibration',{recursive:true});await writeFile('tmp/question-production-calibration/evidence.json',JSON.stringify(report,null,2));console.log('QUESTION_PRODUCTION_CALIBRATION '+JSON.stringify(report));
