import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const flags=['QUESTION_GENERATION_ENABLED','QUESTION_GENERATION_VERIFICATION_ENABLED','QUESTION_GENERATION_STRUCTURED_OUTPUT_ENABLED','QUESTION_AUTOMATED_PILOT_MODE','QUESTION_AGENT_DISPATCH_PREVIEW','QUESTION_AGENT_EXECUTION_ENABLED','QUESTION_TEAM_CONTROLS_ENABLED','QUESTION_VIDEO_RENDER_ENABLED','QUESTION_PILOT_REVIEW_AVAILABLE'];
export function runtimeReadiness(input){
 const reasons=[];
 for(const key of flags.filter(k=>!['QUESTION_VIDEO_RENDER_ENABLED','QUESTION_GENERATION_STRUCTURED_OUTPUT_ENABLED'].includes(k)))if(input.flags[key]!==true)reasons.push(key+'_NOT_ENABLED');
 if(input.academicYear!=='2027-2028')reasons.push('TARGET_YEAR_MISMATCH');
 if(!input.aiBindingPresent)reasons.push('AI_BINDING_MISSING');
 if(input.actorVerified!==true)reasons.push('SERVICE_ACTOR_NOT_VERIFIED');
 if(!Number.isSafeInteger(input.remainingBudget)||input.remainingBudget<1)reasons.push('BUDGET_EXHAUSTED_OR_UNKNOWN');
 if(!Number.isSafeInteger(input.reviewCapacity)||input.reviewCapacity<=input.queuedReview)reasons.push('REVIEW_CAPACITY_REQUIRED');
 if(input.verifiedOutcomes<1)reasons.push('TARGET_CURRICULUM_REQUIRED');
 if(input.teamPaused!==false)reasons.push('TEAM_PAUSED_OR_UNKNOWN');
 return {ready:reasons.length===0,reasons};
}

export async function inspectQuestionRuntime({fetcher=fetch,account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN}={}){
 const healthResponse=await fetcher('https://app.anunex.com/api/health',{signal:AbortSignal.timeout(30000)});
 if(!healthResponse.ok||(await healthResponse.json()).environment!=='production')throw Error('PRODUCTION_DOMAIN_REQUIRED');
 const cf=async(path,body)=>{
  const r=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`,{method:body?'POST':'GET',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const p=await r.json();if(!r.ok||!p.success)throw Error('PRODUCTION_READ_FAILED');return p.result;
 };
 const versions=await cf('/workers/scripts/yildiz-sinav-prod/versions'),version=versions.items?.[0]?.id||versions[0]?.id;
 if(!version)throw Error('PRODUCTION_VERSION_MISSING');
 const metadata=await cf('/workers/scripts/yildiz-sinav-prod/versions/'+version),bindings=metadata.resources.bindings;
 const binding=name=>bindings.find(b=>b.name===name);
 const plain=name=>{const b=binding(name);return b?.type==='plain_text'?b.text??b.value:undefined;};
 const db=binding('DB');if(db?.type!=='d1')throw Error('PRODUCTION_DB_MISSING');
 const query=async(sql,params=[])=>{if(!/^SELECT\s/i.test(sql))throw Error('READ_ONLY_QUERY_REQUIRED');return (await cf(`/d1/database/${db.id||db.database_id}/query`,{sql,params}))[0].results;};
 const year=plain('QUESTION_AUTOMATED_ACADEMIC_YEAR')??null;
 const tables=new Set((await query("SELECT name FROM sqlite_master WHERE type='table'")).map(r=>r.name));
 const missing=['question_bank','question_agent_pilot_budget','question_team_control','question_team_agent_control','curriculum_versions','outcomes','question_generation_jobs'].filter(t=>!tables.has(t));
 if(missing.length)return {environment:'production',readOnly:true,ready:false,reasons:['SCHEMA_MISSING'],missingTables:missing};
 const quota=(await query("SELECT question_cap,reserved_count FROM question_agent_pilot_budget WHERE id='pilot_50'"))[0]??null;
 const review=(await query("SELECT count(*) n FROM question_bank WHERE owner_type='PLATFORM' AND origin_kind IN ('AI','AI_GENERATED','AI_DRAFT','NIBIRU','NIBIRU_AI') AND review_status='REVIEW'"))[0];
 const control=(await query('SELECT paused FROM question_team_control WHERE id=1'))[0];
 const agents=await query("SELECT agent_key,paused FROM question_team_agent_control WHERE agent_key IN ('GENERATOR','VERIFIER','ORIGINALITY')");
 const verified=(await query("SELECT count(*) n FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE cv.verified=1 AND o.active=1 AND o.grade_level=cv.grade_level AND o.grade_level IN (5,6,7,9,10,11) AND cv.academic_year=?",[year]))[0];
 const actor=plain('QUESTION_AGENT_SERVICE_ACTOR_ID');
 const actorVerified=actor?!!(await query("SELECT 1 ok FROM users WHERE id=? AND role='SUPER_ADMIN' AND active=1",[actor]))[0]:binding('QUESTION_AGENT_SERVICE_ACTOR_ID')?null:false;
 const actualRemaining=quota&&[quota.question_cap,quota.reserved_count].every(v=>Number.isSafeInteger(v)&&v>=0)?Math.max(0,quota.question_cap-quota.reserved_count):null;
 const ceiling=plain('QUESTION_PILOT_BUDGET_REMAINING');
 // Unknown secret ceilings cannot be read through metadata; never claim runtime readiness in that case.
 const remainingBudget=binding('QUESTION_PILOT_BUDGET_REMAINING')&&ceiling===undefined?null:ceiling===undefined?actualRemaining:/^\d+$/.test(ceiling)&&Number.isSafeInteger(Number(ceiling))&&actualRemaining!==null?Math.min(actualRemaining,Number(ceiling)):0;
 const reviewText=plain('QUESTION_PILOT_REVIEW_SLOTS'),reviewCapacity=binding('QUESTION_PILOT_REVIEW_SLOTS')&&reviewText===undefined?null:reviewText!==undefined&&/^\d+$/.test(reviewText)?Number(reviewText):0;
 const input={academicYear:year,flags:Object.fromEntries(flags.map(k=>[k,plain(k)==='true'])),aiBindingPresent:binding('AI')?.type==='ai',actorVerified,remainingBudget,reviewCapacity,queuedReview:Number(review?.n??0),verifiedOutcomes:Number(verified?.n??0),teamPaused:!control||control.paused!==0||agents.length!==3||agents.some(a=>a.paused!==0)};
 const decisions=await query("SELECT review_status,copyright_status,count(*) n FROM question_bank GROUP BY review_status,copyright_status");
 const jobCounts=await query('SELECT status,count(*) n FROM question_generation_jobs WHERE academic_year=? GROUP BY status',[year]);
 return {environment:'production',readOnly:true,asOf:new Date().toISOString(),version,...input,...runtimeReadiness(input),budget:quota?{cap:quota.question_cap,reserved:quota.reserved_count,noRefund:true}:null,questionCounts:decisions,jobCounts,videoRendererEnabled:plain('QUESTION_VIDEO_RENDER_ENABLED')==='true',paidVoiceEnabled:plain('NIBIRU_PAID_VOICE_ENABLED')==='ON',note:'Aggregate read-only metadata and SELECT queries. No provider call, user/student details, secret values, quota updates or approvals. Missing or unreadable settings are not proof of readiness.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=await inspectQuestionRuntime();await mkdir('tmp/question-runtime',{recursive:true});await writeFile('tmp/question-runtime/readiness.json',JSON.stringify(report,null,2));console.log('QUESTION_RUNTIME_READINESS '+JSON.stringify(report));
}
