import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {login,req,reqForm,query} from './question-production-live-client.mjs';
import {batchTargets,checkBatchTarget,batchTargetCsv,assertTargetRows} from './math-target-2028-batch.mjs';
const report={environment:'staging',academicYear:'2027-2028',newProducerCalls:0,newEditorCalls:0,imports:[]};
const snapshot=async()=>({previousYear:await query("SELECT cv.id version_id,cv.academic_year,cv.program_version,cv.verified,o.id outcome_id,o.code,o.title,o.active,n.id node_id,n.active node_active,n.academic_year node_year FROM curriculum_versions cv LEFT JOIN outcomes o ON o.curriculum_version_id=cv.id LEFT JOIN learning_nodes n ON n.id='ln_'||o.id WHERE cv.academic_year='2026-2027' ORDER BY cv.id,o.id"),pilot:await query("SELECT id,question_cap,reserved_count FROM question_agent_pilot_budget WHERE id='pilot_50'"),campaigns:await query('SELECT id,status FROM question_production_campaigns ORDER BY id'),jobs:await query('SELECT count(*) n FROM question_generation_jobs'),questions:await query('SELECT count(*) n FROM question_bank')});
try{
 // All official sources must pass before the first database write.
 const sources=await Promise.all(batchTargets.map(async spec=>{const r=await fetch(spec.sourceUrl,{signal:AbortSignal.timeout(45000),redirect:'error'});if(!r.ok)throw Error('SOURCE_HTTP_'+spec.gradeLevel+'_'+r.status);const html=await r.text();return {grade:spec.gradeLevel,check:checkBatchTarget(spec,html),hash:createHash('sha256').update(html).digest('hex'),retrievedAt:new Date().toISOString()};}));report.sources=sources;
 await login();report.before=await snapshot();if(report.before.campaigns.some(c=>c.status==='ACTIVE'))throw Error('CAMPAIGN_MUST_REMAIN_PAUSED');
 for(const spec of batchTargets){
  if((await query("SELECT id FROM question_production_campaigns WHERE status='ACTIVE'")).length)throw Error('CAMPAIGN_BECAME_ACTIVE');
  const listed=await req('/api/curriculum-admin?academicYear='+spec.academicYear);if(listed.status!==200)throw Error('CURRICULUM_LIST_FAILED');
  let version=listed.p.versions.find(v=>v.program_version===spec.programVersion&&v.grade_level===spec.gradeLevel&&v.program_code==='SCHOOL');const item={grade:spec.gradeLevel,reused:!!version};report.imports.push(item);
  if(version){if(version.verified!==1||version.authority!=='MEB'||version.source_url!==spec.sourceUrl)throw Error('EXISTING_VERSION_CONTEXT_MISMATCH');}
  else{
   const form=new FormData();form.set('file',new Blob([batchTargetCsv(spec)],{type:'text/csv'}),`meb-math${spec.gradeLevel}-theme1.csv`);for(const k of ['academicYear','gradeLevel','programCode','programVersion','authority','sourceUrl','sourceTitle'])form.set(k,String(spec[k]));
   const preview=await reqForm('/api/curriculum-admin/import-preview',form);if(preview.status!==200||preview.p.invalidCount!==0||preview.p.rowCount!==spec.outcomes.length)throw Error('IMPORT_PREVIEW_FAILED_'+spec.gradeLevel);item.importJob=preview.p.jobId;
   const commit=await req('/api/curriculum-admin/imports/'+preview.p.jobId+'/commit',{confirmedOfficial:true});if(commit.status!==200||!commit.p.versionId||commit.p.outcomeCount!==spec.outcomes.length)throw Error('IMPORT_COMMIT_FAILED_'+spec.gradeLevel);version={id:commit.p.versionId};
  }
  const rows=await query("SELECT o.code,o.title,o.grade_level,o.official,o.active,s.code subject_code,n.id node_id,n.active node_active,n.grade_level node_grade,n.academic_year node_year FROM outcomes o JOIN subjects s ON s.id=o.subject_id LEFT JOIN learning_nodes n ON n.id='ln_'||o.id WHERE o.curriculum_version_id=? ORDER BY o.code",[version.id]);assertTargetRows(spec,rows);Object.assign(item,{versionId:version.id,codes:rows.map(r=>r.code),linkedNodes:rows.length});
 }
 report.after=await snapshot();if(JSON.stringify(report.before)!==JSON.stringify(report.after))throw Error('UNRELATED_STATE_CHANGED');report.passed=true;
}catch(e){report.passed=false;report.error=e.message;process.exitCode=1;}
await mkdir('tmp/question-target-2028-batch',{recursive:true});await writeFile('tmp/question-target-2028-batch/evidence.json',JSON.stringify(report,null,2));console.log('QUESTION_TARGET2028_BATCH '+JSON.stringify(report));
