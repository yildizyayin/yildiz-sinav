import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='https://demo.anunex.com',account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const report={environment:'staging',target:10,providerAttemptLimit:8,maxCompletionTokensPerAttempt:3000,maxVerifierTokensPerAttempt:1500,maximumModelRequests:16,generatedQuestions:0,publishedQuestions:0,jobs:[],questions:[]};let cookie,calls=0;
async function req(path,body,method=body?'POST':'GET'){const r=await fetch(base+path,{method,headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(120000)});const p=await r.json().catch(()=>({}));return {r,p};}
async function cf(path,body){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const p=await r.json();if(!r.ok||!p.success)throw Error('Cloudflare verification failed HTTP '+r.status);return p.result;}
function key(i){let h=createHash('sha256').update('ANUNEX-MAT5-GPT-VALIDATED-V2-20261013-'+i).digest('hex').slice(0,32);h=h.slice(0,12)+'4'+h.slice(13,16)+'8'+h.slice(17);return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');}
async function query(sql,params=[]){
 const vs=await cf('/workers/scripts/yildiz-sinav-v1/versions');const version=vs.items?.[0]?.id||vs[0]?.id;const detail=await cf('/workers/scripts/yildiz-sinav-v1/versions/'+version);const db=detail.resources.bindings.find(b=>b.name==='DB'&&b.type==='d1');return (await cf('/d1/database/'+(db.id||db.database_id)+'/query',{sql,params}))[0].results;
}
async function exportEvidence(){
 const ids=report.jobs.map(j=>j.id);if(ids.length){const marks=ids.map(()=>'?').join(',');report.questions=await query(`SELECT q.id,q.grade_level,q.subject_id,q.option_count,q.stem_text,q.options_json,q.correct_answer,q.solution_text,q.difficulty_level,q.review_status,q.copyright_status,q.source_model,q.source_job_id,o.code outcome_code,o.title outcome_title,cv.verified,cv.source_url FROM question_bank q JOIN question_learning_links l ON l.question_id=q.id JOIN outcomes o ON l.node_id='ln_'||o.id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE q.source_job_id IN (${marks}) ORDER BY q.source_job_id,q.id`,ids);report.usage=await query(`SELECT entity_id job_id,json_extract(details_json,'$.providerUsage') usage_json,json_extract(details_json,'$.verification') verification_json FROM audit_logs WHERE action='QUESTION_GENERATION_REVIEW_READY' AND entity_id IN (${marks}) ORDER BY created_at`,ids);}
 report.previousLastBatch=await query("SELECT id,stem_text,options_json,correct_answer,solution_text,review_status FROM question_bank WHERE source_job_id=? AND grade_level=5 AND source_model='@cf/zai-org/glm-4.7-flash'",['qgj_3567ea5d-c0b8-4a26-aa8c-ff4be7a5d2ec']);
 report.verificationBlocks=await query("SELECT entity_id,details_json FROM audit_logs WHERE action='QUESTION_GENERATION_VERIFICATION_BLOCKED' ORDER BY created_at DESC LIMIT 8");
 report.budget=await query("SELECT question_cap,reserved_count FROM question_agent_pilot_budget WHERE id='pilot_50'");report.generatedQuestions=new Set(report.questions.map(q=>q.id)).size;report.publishedQuestions=report.questions.filter(q=>q.review_status==='APPROVED').length;
}
async function retirePriorBoundedFailure(){
 const id='qgj_06debc93-d457-44c8-8d0e-99f9475572d4';
 const rows=await query("SELECT status,generated_count FROM question_generation_jobs WHERE id=?",[id]);
 if(!rows.length||rows[0].generated_count!==0)throw Error('Prior failed pilot scope changed');
 if(rows[0].status==='CANCELLED')return;
 if(rows[0].status!=='FAILED')throw Error('Prior pilot is active or changed');
 const cancelled=await req('/api/question-bank-standard/generation-jobs/'+id+'/cancel',{},'PATCH');
 if(!cancelled.r.ok)throw Error('Prior bounded failure could not be retired');
 report.retiredPriorJob={id,quotaRefunded:false};
}
async function quarantineKnownInvalidDrafts(){
 const known=[["q_0ae8bce4-b07a-4f7d-a540-372c79cb9006","Cevap anahtarı C/840; hesaplanan doğru değer A/420 kg.","@cf/zai-org/glm-4.7-flash"],["q_3d3e8cff-173b-4e12-ab5e-acde0a8b7544","Cevap anahtarı C/40; 240 ÷ 8 = 30, doğru seçenek A.","@cf/zai-org/glm-4.7-flash"],["q_db6a9030-cac5-4ea6-8c68-fbaddbff6abf","Türkçe sayı okunuşları hatalı ve bağlam gerçekçi değil.","@cf/zai-org/glm-4.7-flash"],["q_ea8a9876-fb14-4388-bd5e-49194f524bfc","456.789 ve 456789 sayısal olarak eşdeğer seçenekler; sayı okunuşu hatalı.","@cf/zai-org/glm-4.7-flash"],["q_5924a444-576d-4a6f-ae3b-01892d4562e1","Aritmetik problem MAT.5.1.1 çok basamaklı sayıları okuma/yazma çıktısını değerlendirmiyor.","@cf/zai-org/glm-4.7-flash"],["q_6eb5a7d3-bcf3-4091-83a2-9ee4a1e61202","543210 + 12560 = 555770; anahtar ve çözüm yanlış, kazanım uyumsuz.","@cf/zai-org/glm-4.7-flash"],["q_689cf407-2997-433a-91ba-af0deedbe717","Kaç katı sorusunun karşılaştırma temeli belirsiz; toplam kitap sayısı seçeneklere yansımıyor.","@cf/zai-org/glm-4.7-flash"],["q_a141ae22-0679-4ecd-a98e-2f5f33a1ec20","200 × 5 = 1000; doğru seçenek C, kayıtlı anahtar B/400 yanlış.","@cf/zai-org/glm-4.7-flash"],["q_05589c2b-9f42-4978-8101-0236afa77f48","15.000 / 5 işlemi MAT.5.1.2 dört basamaklı bölünen sınırını aşıyor.","@cf/meta/llama-4-scout-17b-16e-instruct"],["q_d3640b70-7c82-494c-8b23-2c77ffd288c5","Dört basamaklı bölünen sınırı aşılıyor ve önceki sorunun yeniden yazımı.","@cf/meta/llama-4-scout-17b-16e-instruct"],["q_924cd203-aea6-40d8-94ef-9ba060483e4c","240 kitap/40 öğrenci problemi q_85b4c261 ile aynı; yalnız ifade ve seçenek sırası değişmiş.","@cf/meta/llama-4-scout-17b-16e-instruct"],["q_b0fd20f9-f7db-4d20-9515-5951c7e6ba34","Seçeneklerde İngilizce forty/ninety var; soru yalnız altı basamaklı sayı içeriyor.","@cf/meta/llama-4-scout-17b-16e-instruct"],["q_fd4d9662-95e3-4377-bf28-592aa095e726","Yalnız altı basamaklı okuma/yazma, MAT.5.1.1 altıdan çok basamaklı genellemeyi değerlendirmiyor.","@cf/meta/llama-4-scout-17b-16e-instruct"]];
 report.quarantined=[];
 for(const [id,note,model] of known){
  const rows=await query("SELECT id,grade_level,source_model,owner_type,origin_kind,review_status,review_revision FROM question_bank WHERE id=?",[id]);
  const q=rows[0];if(!q||q.grade_level!==5||q.source_model!==model||q.owner_type!=='PLATFORM'||q.origin_kind!=='AI_GENERATED')throw Error('Quarantine scope mismatch');
  if(q.review_status==='REJECTED'){report.quarantined.push({id,reused:true});continue;}
  if(q.review_status!=='REVIEW')throw Error('Draft status changed; manual inspection required');
  const result=await req('/api/question-bank-standard/'+id+'/review',{status:'REJECTED',expectedRevision:q.review_revision,note:'Pilot içerik denetimi: '+note},'PATCH');
  if(!result.r.ok||result.p.status!=='REJECTED')throw Error('Invalid draft could not be quarantined');
  report.quarantined.push({id,note});
 }
}
try{
 const health=await req('/api/health');if(health.p.environment!=='staging')throw Error('Staging boundary failed');
 const login=await req('/api/auth/login',{identifier:'super',password:process.env.SMOKE_DEMO_PASSWORD||'Demo123!',turnstileToken:'XXXX.DUMMY.TOKEN.XXXX',remember:false});if(!login.r.ok||!login.p.ok)throw Error('Staging admin session unavailable');cookie=(login.r.headers.get('set-cookie')||'').match(/(yildiz_session=[^;]+)/)?.[1];if(!cookie)throw Error('Staging session missing');
 await quarantineKnownInvalidDrafts();
 await retirePriorBoundedFailure();
 const readiness=(await req('/api/question-bank-standard/agent-pilot/readiness')).p;report.readiness=readiness;if(!readiness.manualPilot?.ready||readiness.manualPilot?.requestProfile!=='VALIDATED_QUESTION_DRAFT_V3')throw Error('Manual pilot gates are not ready');
 const spec=JSON.parse(await readFile('data/question-pilot-math5-curriculum.json','utf8'));const versions=(await req('/api/curriculum-admin?academicYear='+spec.academicYear)).p;const cv=versions.versions?.find(v=>v.program_version===spec.programVersion&&v.verified===1&&v.authority==='MEB'&&v.source_url===spec.sourceUrl);if(!cv)throw Error('Verified official pilot curriculum missing');
 const detail=(await req('/api/curriculum-admin/versions/'+cv.id)).p;const outcomes=detail.outcomes.filter(o=>spec.outcomes.some(s=>s.code===o.code&&s.title===o.title)&&o.official===1&&o.active===1&&o.grade_level===5);if(outcomes.length!==2)throw Error('Official learning outcomes mismatch');
 for(let i=0;i<5;i++){
 const o=outcomes[i%outcomes.length];const created=await req('/api/question-bank-standard/generation-jobs',{requestKey:key(i),outcomeId:o.id,questionCount:2,expectedContext:{curriculumVersionId:cv.id,academicYear:spec.academicYear,gradeLevel:5,subjectId:o.subject_id,programVersion:spec.programVersion}});if(!created.r.ok)throw Error('Job creation failed '+(created.p.error?.code||created.r.status));let job=created.p.job;
 if(['FAILED','CANCELLED'].includes(job.status)&&job.attemptCount>=3&&job.generatedCount===0){
 report.recoveredJobs=[...(report.recoveredJobs||[]),{priorJob:job,action:'CANCEL_AND_REPLACE',quotaRefunded:false}];const cancel=await req('/api/question-bank-standard/generation-jobs/'+job.id+'/cancel',{},'PATCH');if(!cancel.r.ok)throw Error('Failed job could not be retired');
 const replacement=await req('/api/question-bank-standard/generation-jobs',{requestKey:key(5000+i),outcomeId:o.id,questionCount:2,expectedContext:{curriculumVersionId:cv.id,academicYear:spec.academicYear,gradeLevel:5,subjectId:o.subject_id,programVersion:spec.programVersion}});if(!replacement.r.ok)throw Error('Recovery job creation failed');job=replacement.p.job;
 }
 report.jobs.push(job);
 if(job.status==='REVIEW_READY')continue;
 for(let retry=0;retry<3&&calls<8;retry++){
 calls++;console.log('PILOT_BATCH_PROGRESS '+JSON.stringify({batch:i+1,jobId:job.id,runRequests:calls}));const run=await req('/api/question-bank-standard/generation-jobs/'+job.id+'/run',{});const current=(await req('/api/question-bank-standard/generation-jobs?academicYear='+spec.academicYear+'&outcomeId='+o.id+'&limit=50')).p.jobs?.find(j=>j.id===job.id);report.jobs[i]={...job,...current,...run.p.job,error:run.p.error?.code};if(run.r.ok&&run.p.job?.status==='REVIEW_READY')break;
 if(!['GENERATION_OUTPUT_INVALID','GENERATION_PROVIDER_FAILED','GENERATION_TIMEOUT','GENERATION_DUPLICATE','GENERATION_QUALITY_REJECTED','GENERATION_VERIFICATION_UNAVAILABLE'].includes(run.p.error?.code))throw Error('Generation blocked '+(run.p.error?.code||run.r.status));if(retry===2||calls===8)throw Error('Bounded provider retries exhausted');
 }
 if(report.jobs[i].status!=='REVIEW_READY')throw Error('Pilot batch incomplete');
 }
 await exportEvidence();if(report.generatedQuestions!==10||report.publishedQuestions!==0||report.questions.some(q=>q.option_count!==4||q.review_status!=='REVIEW'||q.copyright_status!=='RESTRICTED'||!q.solution_text||q.verified!==1))throw Error('Generated draft verification failed');if(report.usage.length!==5||report.usage.some(u=>JSON.parse(u.verification_json||'null')?.ok!==true))throw Error('Independent verification evidence missing');report.status='TEN_AUTOMATICALLY_SCREENED_DRAFTS_PENDING_HUMAN_REVIEW';
}catch(e){report.status='BLOCKED';report.error=e.message;try{await exportEvidence()}catch{}process.exitCode=1;}
report.runRequests=calls;await mkdir('tmp/question-pilot',{recursive:true});await writeFile('tmp/question-pilot/first-ten.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,questions:report.questions.map(({stem_text,options_json,solution_text,correct_answer,...q})=>q)},null,2));

// Synthetic original questions contain no student information; expose full evidence for content review.
console.log('PILOT_CONTENT_EVIDENCE '+JSON.stringify(report.questions));
console.log('PREVIOUS_LAST_BATCH '+JSON.stringify(report.previousLastBatch||[]));
