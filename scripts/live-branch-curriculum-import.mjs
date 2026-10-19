import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {visibleText} from './official-math-catalog.mjs';
import {branchThemeOutcomes} from './official-branch-catalog.mjs';
import {buildBranchImportPlan,branchImportCsv} from './branch-import-plan.mjs';
import {login,req,reqForm,query} from './question-production-live-client.mjs';
const catalog=JSON.parse(await readFile('data/question-branch-catalog-2028.json','utf8'));
const plan=buildBranchImportPlan(catalog),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const report={environment:'staging',academicYear:plan.academicYear,imports:[],blocked:plan.blocked,newProducerCalls:0,newEditorCalls:0,examSpecification:false};
const get=async url=>{if(new URL(url).origin!=='https://tymm.meb.gov.tr')throw Error('OFFICIAL_HOST_REQUIRED');const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('SOURCE_HTTP_'+r.status);return r.text();};
const labels=plan.imports.map(i=>i.programVersion),marks=labels.map(()=>'?').join(',');
const snapshot=async()=>({
 preservedHash:hash(await query(`SELECT cv.*,o.id outcome_id,o.code,o.title,o.unit,o.active,n.id node_id,n.active node_active FROM curriculum_versions cv LEFT JOIN outcomes o ON o.curriculum_version_id=cv.id LEFT JOIN learning_nodes n ON n.id='ln_'||o.id WHERE cv.program_version NOT IN (${marks}) ORDER BY cv.id,o.id`,labels)),
 campaigns:await query('SELECT id,academic_year,status FROM question_production_campaigns ORDER BY id'),
 pilot:await query('SELECT id,question_cap,reserved_count FROM question_agent_pilot_budget ORDER BY id'),
 jobs:await query('SELECT count(*) n FROM question_generation_jobs'),questions:await query('SELECT count(*) n FROM question_bank'),
 plans:hash(await query('SELECT * FROM annual_content_plans ORDER BY id')),slots:hash(await query('SELECT * FROM annual_content_plan_slots ORDER BY id'))});
try{
 // Recheck every included course index and theme before any database write.
 for(const program of catalog.programs){
  const html=await get(program.indexUrl),heading=visibleText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]??'');
  if(!new RegExp(`(?:^|\\s)${program.grade}\\.\\s*Sınıf`,'u').test(heading))throw Error('INDEX_GRADE_CHANGED');
  const urls=[];for(const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){const url=new URL(m[1],program.indexUrl);if(url.origin==='https://tymm.meb.gov.tr'&&new RegExp(`^/${program.course}/unite/\\d+$`).test(url.pathname)&&visibleText(m[2])&&!urls.includes(url.href))urls.push(url.href);}
  if(JSON.stringify([...urls].sort())!==JSON.stringify(program.themes.map(t=>t.url).sort()))throw Error('INDEX_THEMES_CHANGED:'+program.course+program.grade);
  for(let i=0;i<program.themes.length;i+=4)await Promise.all(program.themes.slice(i,i+4).map(async theme=>{
   const observed=branchThemeOutcomes(await get(theme.url),program,theme);
   if(JSON.stringify(observed)!==JSON.stringify(theme.outcomes))throw Error('OFFICIAL_OUTCOMES_CHANGED:'+theme.url);
  }));
 }
 report.sourcesReverified=true;await login();report.before=await snapshot();
 if(report.before.campaigns.some(c=>c.status==='ACTIVE'))throw Error('CAMPAIGN_MUST_REMAIN_PAUSED');
 for(const item of plan.imports){
  if((await query("SELECT id FROM question_production_campaigns WHERE status='ACTIVE'")).length)throw Error('CAMPAIGN_BECAME_ACTIVE');
  const listed=await req('/api/curriculum-admin?academicYear='+item.academicYear);if(listed.status!==200)throw Error('CURRICULUM_LIST_FAILED');
  let version=listed.p.versions.find(v=>v.program_version===item.programVersion&&v.program_code==='SCHOOL'&&v.grade_level===item.grade);
  const result={subject:item.subjectCode,grade:item.grade,scope:item.scopeKind,reused:!!version,outcomes:item.outcomeCount};
  if(version){if(version.verified!==1||version.source_url!==item.sourceUrl||version.authority!=='MEB')throw Error('EXISTING_VERSION_CONTEXT_MISMATCH');}
  else{
   const form=new FormData();form.set('file',new Blob([branchImportCsv(item)],{type:'text/csv'}),item.programVersion+'.csv');
   const metadata={academicYear:item.academicYear,gradeLevel:item.grade,programCode:'SCHOOL',programVersion:item.programVersion,authority:'MEB',sourceUrl:item.sourceUrl,sourceTitle:`${item.grade}. Sınıf ${item.subjectCode} — Resmî Program / ${item.scopeKind==='THEME'?'Tema Kapsamı':'Ders Kapsamı'} / ANUNEX 2027–2028 Hedefi`};
   for(const [key,value] of Object.entries(metadata))form.set(key,String(value));
   const preview=await reqForm('/api/curriculum-admin/import-preview',form);if(preview.status!==200||preview.p.invalidCount!==0||preview.p.rowCount!==item.outcomeCount)throw Error('IMPORT_PREVIEW_FAILED:'+item.programVersion+':'+JSON.stringify(preview.p));
   const commit=await req('/api/curriculum-admin/imports/'+preview.p.jobId+'/commit',{confirmedOfficial:true});if(commit.status!==200||commit.p.outcomeCount!==item.outcomeCount||!commit.p.versionId)throw Error('IMPORT_COMMIT_FAILED:'+item.programVersion);version={id:commit.p.versionId};
  }
  const rows=await query("SELECT o.code,o.title,o.unit,o.grade_level,o.active,o.official,s.code subject_code,n.id node_id,n.active node_active,n.academic_year node_year FROM outcomes o JOIN subjects s ON s.id=o.subject_id LEFT JOIN learning_nodes n ON n.id='ln_'||o.id WHERE o.curriculum_version_id=?",[version.id]);
  if(rows.length!==item.outcomeCount||item.outcomes.some(o=>!rows.some(r=>r.code===o.code&&r.title===o.title&&r.unit===o.unit&&r.grade_level===item.grade&&r.subject_code===item.subjectCode&&r.active===1&&r.official===1&&r.node_id&&r.node_active===1&&r.node_year===item.academicYear)))throw Error('IMPORTED_LINK_MISMATCH:'+item.programVersion);
  report.imports.push({...result,versionId:version.id,linkedNodes:rows.length});console.log('BRANCH_IMPORT_PROGRESS '+JSON.stringify(result));
 }
 report.after=await snapshot();if(JSON.stringify(report.before)!==JSON.stringify(report.after))throw Error('PRESERVED_STATE_CHANGED');report.passed=true;
}catch(error){report.passed=false;report.error=error.message;process.exitCode=1;}
await mkdir('tmp/branch-curriculum-import',{recursive:true});await writeFile('tmp/branch-curriculum-import/evidence.json',JSON.stringify(report,null,2));console.log('BRANCH_CURRICULUM_IMPORT '+JSON.stringify(report));
