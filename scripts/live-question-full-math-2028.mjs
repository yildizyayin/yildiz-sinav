import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fetchMathCatalog,assertSameMathCatalog,fullMathCsv} from './official-math-catalog.mjs';
import {login,req,reqForm,query} from './question-production-live-client.mjs';
const expected=JSON.parse(await readFile('data/question-full-math-target-2028.json','utf8'));
const report={environment:'staging',academicYear:'2027-2028',newProducerCalls:0,newEditorCalls:0,imports:[],scope:expected.scope,annualPlanVerified:false,exam2028ScopeVerified:false,processComponentsImported:false};
const snapshot=async()=>({preserved:await query("SELECT cv.id,cv.academic_year,cv.program_version,cv.verified,o.id outcome_id,o.code,o.title,o.active,n.id node_id,n.active node_active,n.academic_year node_year FROM curriculum_versions cv LEFT JOIN outcomes o ON o.curriculum_version_id=cv.id LEFT JOIN learning_nodes n ON n.id='ln_'||o.id WHERE cv.program_version NOT LIKE 'ANUNEX-TYMM-MAT%-ALLTHEMES-TARGET2028-20261019%' ORDER BY cv.id,o.id"),pilot:await query("SELECT id,question_cap,reserved_count FROM question_agent_pilot_budget WHERE id='pilot_50'"),campaigns:await query('SELECT id,academic_year,status FROM question_production_campaigns ORDER BY id'),jobs:await query('SELECT count(*) n FROM question_generation_jobs'),questions:await query('SELECT count(*) n FROM question_bank')});
try{
 if(expected.academicYear!=='2027-2028'||expected.grades.map(g=>g.grade).join(',')!=='5,6,7,8,9,10,11,12')throw Error('FULL_MATH_MANIFEST_INVALID');
 const current=await fetchMathCatalog();assertSameMathCatalog(expected.grades,current);report.sources=current.map(g=>({grade:g.grade,indexUrl:g.indexUrl,indexHash:g.indexHash,themes:g.themes}));report.retrievedAt=new Date().toISOString();
 await login();
 let ready=false;for(let attempt=0;attempt<15;attempt++){const r=await req('/api/question-bank-standard/team/readiness?academicYear=2027-2028');if(r.status===200&&r.p.catalogRevision===2){ready=true;break;}if(attempt<14)await new Promise(r=>setTimeout(r,12000));}if(!ready)throw Error('CATALOG_V2_APP_NOT_DEPLOYED');
 // Quarantine only this task's failed first catalog import, never an older user version.
 const bad=await query("SELECT id FROM curriculum_versions WHERE id='cv_12a47439-314a-402a-b67b-a0ac90603df1' AND program_version='ANUNEX-TYMM-MAT5-ALLTHEMES-TARGET2028-20261019'");
 if(bad.length){const links=await query("SELECT count(*) n FROM question_learning_links l JOIN outcomes o ON l.node_id='ln_'||o.id WHERE o.curriculum_version_id=?",[bad[0].id]);if(Number(links[0].n)!==0)throw Error('FAILED_IMPORT_HAS_QUESTION_LINKS');await query('UPDATE curriculum_versions SET verified=0 WHERE id=?',[bad[0].id]);await query('UPDATE outcomes SET active=0 WHERE curriculum_version_id=?',[bad[0].id]);await query("INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,NULL,NULL,'CURRICULUM_IMPORT_QUARANTINED','curriculum_version',?,?)",['aud_'+crypto.randomUUID(),bad[0].id,JSON.stringify({reason:'SPLIT_SOURCE_HEADING_PARSE_AND_NODE_IDENTITY',replacement:'CATALOG_V2'})]);report.quarantinedFailedVersion=bad[0].id;}
 report.before=await snapshot();if(report.before.campaigns.some(c=>c.status==='ACTIVE'))throw Error('CAMPAIGN_MUST_REMAIN_PAUSED');
 for(const grade of current){
  if((await query("SELECT id FROM question_production_campaigns WHERE status='ACTIVE'")).length)throw Error('CAMPAIGN_BECAME_ACTIVE');
  const spec={academicYear:'2027-2028',gradeLevel:grade.grade,programCode:'SCHOOL',programVersion:`ANUNEX-TYMM-MAT${grade.grade}-ALLTHEMES-TARGET2028-20261019-V2`,authority:'MEB',sourceUrl:grade.indexUrl,sourceTitle:`${grade.grade}. Sınıf Matematik — Güncel Resmî Tema Sayfaları / ANUNEX 2027–2028 Hedefi`};
  const listed=await req('/api/curriculum-admin?academicYear='+spec.academicYear);if(listed.status!==200)throw Error('CURRICULUM_LIST_FAILED');
  let version=listed.p.versions.find(v=>v.program_version===spec.programVersion&&v.grade_level===spec.gradeLevel&&v.program_code==='SCHOOL');const item={grade:grade.grade,reused:!!version,themes:grade.themes.length,outcomes:grade.outcomes.length};report.imports.push(item);
  if(version){if(version.verified!==1||version.authority!=='MEB'||version.source_url!==spec.sourceUrl)throw Error('EXISTING_VERSION_CONTEXT_MISMATCH');}
  else{
   const form=new FormData();form.set('file',new Blob([fullMathCsv(grade)],{type:'text/csv'}),`meb-math${grade.grade}-all-themes.csv`);for(const [k,v] of Object.entries(spec))form.set(k,String(v));
   const preview=await reqForm('/api/curriculum-admin/import-preview',form);if(preview.status!==200||preview.p.invalidCount!==0||preview.p.rowCount!==grade.outcomes.length)throw Error('IMPORT_PREVIEW_FAILED_'+grade.grade+':'+JSON.stringify(preview.p));item.importJob=preview.p.jobId;
   const commit=await req('/api/curriculum-admin/imports/'+preview.p.jobId+'/commit',{confirmedOfficial:true});if(commit.status!==200||!commit.p.versionId||commit.p.outcomeCount!==grade.outcomes.length)throw Error('IMPORT_COMMIT_FAILED_'+grade.grade);version={id:commit.p.versionId};
  }
  const rows=await query("SELECT o.code,o.title,o.grade_level,o.unit,o.active,o.official,n.id node_id,n.active node_active,n.academic_year node_year,n.grade_level node_grade FROM outcomes o LEFT JOIN learning_nodes n ON n.id='ln_'||o.id WHERE o.curriculum_version_id=?",[version.id]);
  if(rows.length!==grade.outcomes.length||grade.outcomes.some(o=>!rows.some(r=>r.code===o.code&&r.title===o.title&&r.unit===o.unit&&r.grade_level===grade.grade&&r.active===1&&r.official===1&&r.node_id&&r.node_active===1&&r.node_year===spec.academicYear&&r.node_grade===grade.grade)))throw Error('IMPORTED_OUTCOME_LINK_MISMATCH_'+grade.grade);
  Object.assign(item,{versionId:version.id,linkedNodes:rows.length});
 }
 report.after=await snapshot();if(JSON.stringify(report.before)!==JSON.stringify(report.after))throw Error('PRESERVED_STATE_CHANGED');report.passed=true;
}catch(e){report.passed=false;report.error=e.message;process.exitCode=1;}
await mkdir('tmp/question-full-math-2028',{recursive:true});await writeFile('tmp/question-full-math-2028/evidence.json',JSON.stringify(report,null,2));console.log('QUESTION_FULL_MATH2028 '+JSON.stringify(report));
