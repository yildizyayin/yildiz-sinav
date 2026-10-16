import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {login,req,reqForm,query} from './question-production-live-client.mjs';
import {checkMath6Source,math6Csv} from './math6-curriculum-source.mjs';
const spec=JSON.parse(await readFile('data/question-pilot-math6-curriculum.json','utf8'));
const report={environment:'staging',scope:spec.scope,newProducerCalls:0,newEditorCalls:0};
const snapshot=async()=>({pilot:await query("SELECT id,question_cap,reserved_count FROM question_agent_pilot_budget WHERE id='pilot_50'"),campaigns:await query('SELECT id,status FROM question_production_campaigns ORDER BY id'),jobs:await query('SELECT count(*) n FROM question_generation_jobs'),questions:await query('SELECT count(*) n FROM question_bank')});
try{
 const source=await fetch(spec.sourceUrl,{signal:AbortSignal.timeout(45000),redirect:'error'});if(!source.ok)throw Error('MATH6_SOURCE_HTTP_'+source.status);const html=await source.text();report.source=checkMath6Source(spec,html);report.sourceHash=createHash('sha256').update(html).digest('hex');report.retrievedAt=new Date().toISOString();
 await login();report.before=await snapshot();if(report.before.campaigns.some(c=>c.status==='ACTIVE'))throw Error('CAMPAIGN_MUST_REMAIN_PAUSED');
 const listed=await req('/api/curriculum-admin?academicYear='+spec.academicYear);if(listed.status!==200)throw Error('CURRICULUM_LIST_FAILED');
 let version=listed.p.versions.find(v=>v.program_version===spec.programVersion&&v.grade_level===6&&v.program_code==='SCHOOL');
 if(version){if(version.verified!==1||version.authority!=='MEB'||version.source_url!==spec.sourceUrl)throw Error('EXISTING_VERSION_CONTEXT_MISMATCH');report.reused=true;}
 else{
  const form=new FormData();form.set('file',new Blob([math6Csv(spec)],{type:'text/csv'}),'meb-math6-theme1.csv');for(const k of ['academicYear','gradeLevel','programCode','programVersion','authority','sourceUrl','sourceTitle'])form.set(k,String(spec[k]));
  const preview=await reqForm('/api/curriculum-admin/import-preview',form);if(preview.status!==200||preview.p.invalidCount!==0||preview.p.rowCount!==4)throw Error('MATH6_IMPORT_PREVIEW_FAILED');report.importJob=preview.p.jobId;
  const commit=await req('/api/curriculum-admin/imports/'+preview.p.jobId+'/commit',{confirmedOfficial:true});if(commit.status!==200||!commit.p.versionId||commit.p.outcomeCount!==4)throw Error('MATH6_IMPORT_COMMIT_FAILED');version={id:commit.p.versionId};report.reused=false;
 }
 report.versionId=version.id;
 const rows=await query("SELECT o.code,o.title,o.grade_level,o.official,o.active,s.code subject_code,n.id node_id,n.active node_active,n.grade_level node_grade,n.academic_year node_year FROM outcomes o JOIN subjects s ON s.id=o.subject_id LEFT JOIN learning_nodes n ON n.id='ln_'||o.id WHERE o.curriculum_version_id=? ORDER BY o.code",[version.id]);
 if(rows.length!==4||rows.some((r,i)=>r.code!==spec.outcomes[i].code||r.title!==spec.outcomes[i].title||r.grade_level!==6||r.official!==1||r.active!==1||r.subject_code!=='MAT'||!r.node_id||r.node_active!==1||r.node_grade!==6||r.node_year!==spec.academicYear))throw Error('MATH6_IMPORTED_LINKS_MISMATCH');
 report.codes=rows.map(r=>r.code);report.linkedNodes=rows.length;report.after=await snapshot();if(JSON.stringify(report.before)!==JSON.stringify(report.after))throw Error('MATH6_UNRELATED_STATE_CHANGED');report.passed=true;
}catch(e){report.passed=false;report.error=e.message;process.exitCode=1;}
await mkdir('tmp/question-math6-curriculum',{recursive:true});await writeFile('tmp/question-math6-curriculum/evidence.json',JSON.stringify(report,null,2));console.log('QUESTION_MATH6_CURRICULUM '+JSON.stringify(report));
