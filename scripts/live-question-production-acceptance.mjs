import {mkdir,writeFile} from 'node:fs/promises';
import {login,req,query,cf} from './question-production-live-client.mjs';
const report={environment:'staging',humanApproved:false,paidPlanChanged:false,productionAppActivated:false};
try{
 await login();
 const invalid=(await query("SELECT id,review_revision,review_status,options_json FROM question_bank WHERE id='q_e93ca189-206d-469c-81cd-f50ce1e6de4e'"))[0];
 if(invalid?.review_status==='REVIEW'&&invalid.options_json.includes('dörtyüz')){report.quarantine=await req('/api/question-bank-standard/'+invalid.id+'/review',{status:'REJECTED',expectedRevision:invalid.review_revision,note:'Otomatik teknik inceleme: TDK sayı yazımı kuralına göre dört yüz ayrı yazılır; anahtar yanlış seçeneği doğru saymıştır. AI yanlış olumlu sonucu reddedildi. İnsan onayı veya telif onayı verilmedi.'},'PATCH');if(report.quarantine.status!==200)throw Error('Known invalid draft quarantine failed');}
 report.activeJobs=await query("SELECT id,request_key,outcome_code,status,attempt_count,lease_until,created_at FROM question_generation_jobs WHERE status IN ('REQUESTED','RUNNING') ORDER BY created_at LIMIT 12");
 report.privateEndpoint=await cf('/workers/scripts/anunex-question-production-staging/subdomain');
 if(report.privateEndpoint.enabled!==false)throw Error('Production worker is not private');
 const rawWorkerSchedules=await cf('/workers/scripts/anunex-question-production-staging/schedules');report.workerSchedules=Array.isArray(rawWorkerSchedules)?rawWorkerSchedules:rawWorkerSchedules.schedules;
 if(report.workerSchedules.length!==0)throw Error('Unexpected extra cron');
 const rawAppSchedules=await cf('/workers/scripts/yildiz-sinav-v1/schedules');report.appSchedules=Array.isArray(rawAppSchedules)?rawAppSchedules:rawAppSchedules.schedules;
 if(!report.appSchedules.some(s=>s.cron==='* * * * *'))throw Error('Existing app cron not reused');
 report.initial=(await req('/api/question-bank-standard/production')).p;
 if(!report.initial.campaign)throw Error('Missing campaign snapshot');
 const finished=(await query("SELECT count(*) n FROM question_generation_jobs WHERE request_key IN ('e1b7adf6-31c2-4dc1-9fa1-84725d84d001','e1b7adf6-31c2-4dc1-9fa1-84725d84d002','e1b7adf6-31c2-4dc1-9fa1-84725d84d003','e1b7adf6-31c2-4dc1-9fa1-84725d84d004') AND status IN ('FAILED','REVIEW_READY') AND attempt_count=1"))[0].n;
 if(report.initial.quality.allowed&&finished===4&&report.initial.campaign.status!=='ACTIVE'){
  report.activation=await req('/api/question-bank-standard/production',{status:'ACTIVE',expectedRevision:report.initial.campaign.revision},'PATCH');
  if(report.activation.status!==200)throw Error('Bounded activation refused');
 }else if(!report.initial.quality.allowed){const denied=await req('/api/question-bank-standard/production',{status:'ACTIVE',expectedRevision:report.initial.campaign.revision},'PATCH');report.activationRefusal={status:denied.status,payload:denied.p};report.qualityRefusalVerified=denied.status===409;if(denied.status===200)throw Error('Quality gate bypassed');}
 const ticks=new Set();for(let i=0;i<24;i++){report.final=(await req('/api/question-bank-standard/production')).p;const t=report.final.campaign?.last_tick_at;if(t)ticks.add(t);if(ticks.size>=2)break;await new Promise(r=>setTimeout(r,10000));}
 if(ticks.size<2)throw Error('Two actual scheduled ticks not witnessed');report.ticks=[...ticks];
 report.storage=await query("SELECT count(*) n,avg(length(CAST(stem_text AS BLOB))+length(CAST(options_json AS BLOB))+length(CAST(solution_text AS BLOB))+length(CAST(editorial_packet_json AS BLOB))) averagePayloadBytes FROM question_bank WHERE editorial_packet_json IS NOT NULL");
 report.aiCalls=await query('SELECT day,model,status,count(*) calls,sum(charged_neurons) chargedNeurons,sum(CASE WHEN status IN (\'HELD\',\'UNKNOWN\') THEN reserved_neurons ELSE 0 END) heldNeurons FROM question_ai_budget_calls GROUP BY day,model,status');
 report.pilot=(await query("SELECT * FROM question_agent_pilot_budget WHERE id='pilot_50'"))[0];
 if(!report.initial.quality.allowed&&!report.qualityRefusalVerified)throw Error('Quality refusal contract failed: HTTP '+report.activationRefusal.status);
 report.status=report.final.quality.allowed?'SCHEDULER_AND_BOUNDED_CONTROLS_VERIFIED':'SCHEDULER_VERIFIED_QUALITY_BLOCKED';
}catch(e){report.status='BLOCKED';report.error=e.message;process.exitCode=1;}
report.asOf=new Date().toISOString();await mkdir('tmp/question-production-acceptance',{recursive:true});await writeFile('tmp/question-production-acceptance/evidence.json',JSON.stringify(report,null,2));console.log('QUESTION_PRODUCTION_ACCEPTANCE '+JSON.stringify(report));
