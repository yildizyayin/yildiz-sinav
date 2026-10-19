import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {buildBranchImportPlan} from './branch-import-plan.mjs';
import {visibleText,mathThemeLinks,mathThemeOutcomes} from './official-math-catalog.mjs';
import {branchThemeOutcomes} from './official-branch-catalog.mjs';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const contentHash=rows=>digest(rows.map(o=>JSON.stringify([o.code,o.title,o.unit??null])).sort());
export function expandBranchCatalog(compact){
 if(!Array.isArray(compact.programs[0]))return compact;
 return {...compact,programs:compact.programs.map(([course,grade,indexUrl,subjectCode,raw])=>{
  const byCode=new Map(),conflicts=[];
  const themes=raw.map(([url,title,values])=>{const outcomes=values.map(([code,text])=>({code,title:text,unit:title,topic:title,sourceUrl:url}));for(const o of outcomes){const prior=byCode.get(o.code);if(prior&&prior.title!==o.title)conflicts.push({code:o.code});else if(!prior)byCode.set(o.code,{...o,sourceUrls:[url]});else prior.sourceUrls.push(url);}return {url,title,outcomes};});
  return {course,grade,indexUrl,subjectCode,themes,outcomes:[...byCode.values()],conflicts};
 })};
}
export function productionCurriculumPlan(branches,math,registry){
 const imports=[...buildBranchImportPlan(expandBranchCatalog(branches)).imports,...math.grades.map(g=>({academicYear:'2027-2028',grade:g.grade,subjectCode:'MAT',programVersion:`ANUNEX-TYMM-MAT${g.grade}-ALLTHEMES-TARGET2028-20261019-V2`,sourceUrl:g.indexUrl,scopeKind:'SUBJECT_PROGRAM',outcomeCount:g.outcomes.length,outcomes:g.outcomes,themeUrls:g.themes.map(t=>t.url)}))];
 if(registry.academicYear!=='2027-2028'||imports.length!==registry.programs.length)throw Error('REGISTRY_SCOPE_MISMATCH');
 for(const p of imports){const expected=registry.programs.find(e=>e.programVersion===p.programVersion);if(!expected||p.academicYear!=='2027-2028'||expected.grade!==p.grade||expected.subjectCode!==p.subjectCode||expected.sourceUrl!==p.sourceUrl||expected.contentHash!==contentHash(p.outcomes)||expected.outcomeCount!==p.outcomes.length||new Set(p.outcomes.map(o=>o.code)).size!==p.outcomes.length)throw Error('REGISTRY_CONTENT_MISMATCH');}
 return imports;
}
export async function reverifyCurricula(branches,math,get){
 // No database write is allowed until every included official source passes.
 const cache=new Map();const page=url=>{if(new URL(url).origin!=='https://tymm.meb.gov.tr'||new URL(url).search||new URL(url).hash)throw Error('OFFICIAL_SOURCE_REQUIRED');if(!cache.has(url))cache.set(url,get(url));return cache.get(url);};
 for(const p of expandBranchCatalog(branches).programs){
  const html=await page(p.indexUrl),heading=visibleText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]??'');
  if(!new RegExp(`(?:^|\\s)${p.grade}\\.\\s*Sınıf`,'u').test(heading))throw Error('INDEX_GRADE_CHANGED');
  const urls=[];for(const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){const u=new URL(m[1],p.indexUrl);if(u.origin==='https://tymm.meb.gov.tr'&&new RegExp(`^/${p.course}/unite/\\d+$`).test(u.pathname)&&visibleText(m[2])&&!urls.includes(u.href))urls.push(u.href);}
  if(JSON.stringify(urls.sort())!==JSON.stringify(p.themes.map(t=>t.url).sort()))throw Error('INDEX_THEMES_CHANGED');
  for(let i=0;i<p.themes.length;i+=4)await Promise.all(p.themes.slice(i,i+4).map(async t=>{if(JSON.stringify(branchThemeOutcomes(await page(t.url),p,t))!==JSON.stringify(t.outcomes))throw Error('OFFICIAL_OUTCOMES_CHANGED:'+t.url);}));
 }
 for(const p of math.grades){
  const links=mathThemeLinks(await page(p.indexUrl),p.grade);
  if(JSON.stringify(links.map(t=>t.url).sort())!==JSON.stringify(p.themes.map(t=>t.url).sort()))throw Error('MATH_THEMES_CHANGED');
  const rows=[];for(let i=0;i<p.themes.length;i+=4){const group=await Promise.all(p.themes.slice(i,i+4).map(async t=>mathThemeOutcomes(await page(t.url),p.grade,t)));rows.push(...group.flat());}
  if(contentHash(rows)!==contentHash(p.outcomes))throw Error('MATH_OUTCOMES_CHANGED');
 }
 return {sourceCount:cache.size,verifiedAt:new Date().toISOString()};
}
export function curriculumInsert(item,subjectId){
 const id='cv_prod_'+digest(item.programVersion).slice(0,24);
 const rows=item.outcomes.map(o=>({id:'out_prod_'+digest([id,o.code]).slice(0,24),code:o.code,title:o.title,topic:o.topic??o.unit,unit:o.unit}));
 return {id,rows,sql:`INSERT OR IGNORE INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,topic,title,node_type,unit,official,active)
 SELECT json_extract(value,'$.id'),?,?,?,json_extract(value,'$.code'),json_extract(value,'$.topic'),json_extract(value,'$.title'),'OUTCOME',json_extract(value,'$.unit'),1,1 FROM json_each(?)`,params:[id,subjectId,item.grade,JSON.stringify(rows)]};
}
export async function importProductionCurricula({query,imports,evidence,runId}){
 const results=[];
 for(const code of new Set(imports.map(p=>p.subjectCode))){if((await query('SELECT id FROM subjects WHERE code=? AND active=1',[code])).length!==1)throw Error('SUBJECT_NOT_UNIQUE:'+code);}
 for(const item of imports){
  const subjects=await query('SELECT id FROM subjects WHERE code=? AND active=1',[item.subjectCode]);if(subjects.length!==1)throw Error('SUBJECT_NOT_UNIQUE:'+item.subjectCode);
  const entry=curriculumInsert(item,subjects[0].id),title=`${item.grade}. Sınıf ${item.subjectCode} / ${item.scopeKind} / ANUNEX 2027–2028 hedef kapsamı`;
  let existing=await query("SELECT * FROM curriculum_versions WHERE academic_year=? AND program_code='SCHOOL' AND grade_level=? AND program_version=?",[item.academicYear,item.grade,item.programVersion]);
  if(existing.length>1)throw Error('DUPLICATE_VERSION');
  if(existing.length&&existing[0].id!==entry.id){
   if(existing[0].verified!==1)throw Error('FOREIGN_UNVERIFIED_VERSION');
  }else if(!existing.length){
   await query("INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,authority,verified,source_url,program_code,source_kind,source_title) VALUES(?,?,?,?,'MEB',0,?,'SCHOOL','MEB_TYMM',?)",[entry.id,item.academicYear,item.grade,item.programVersion,item.sourceUrl,title]);
   existing=await query('SELECT * FROM curriculum_versions WHERE id=?',[entry.id]);
  }
  const v=existing[0];if(v.source_url!==item.sourceUrl||v.authority!=='MEB'||v.source_kind!=='MEB_TYMM')throw Error('VERSION_CONTEXT_CHANGED');
  if(v.verified!==1){
   // Staged versions are invisible to generation. Interrupted imports safely resume.
   await query(entry.sql,entry.params);
  }
  const rows=await query("SELECT o.code,o.title,o.unit,o.grade_level,o.subject_id,o.active,o.official,n.active node_active,n.academic_year node_year,n.grade_level node_grade,n.curriculum_version_id node_version,n.official_code node_code FROM outcomes o LEFT JOIN learning_nodes n ON n.id='ln_'||o.id WHERE o.curriculum_version_id=?",[v.id]);
  if(rows.length!==item.outcomes.length||contentHash(rows)!==contentHash(item.outcomes)||rows.some(o=>o.grade_level!==item.grade||o.subject_id!==subjects[0].id||o.active!==1||o.official!==1||o.node_active!==1||o.node_year!==item.academicYear||o.node_grade!==item.grade||o.node_version!==v.id||o.node_code!==o.code))throw Error('IMPORTED_CONTEXT_MISMATCH:'+item.programVersion);
  const eventId='oke_prod_'+digest([v.id,contentHash(rows)]).slice(0,24);
  await query("INSERT OR IGNORE INTO official_knowledge_events(id,source_kind,authority,entity_type,entity_id,academic_year,source_url,source_title,source_verified_at,content_hash,row_count,verification_method) VALUES(?,'MEB_TYMM','MEB','CURRICULUM_VERSION',?,?,?,?,?,?,?,'OFFICIAL_REFETCH_EXACT_CONTENT_OWNER_AUTHORIZED')",[eventId,v.id,item.academicYear,item.sourceUrl,title,evidence.verifiedAt,contentHash(rows),rows.length]);
  // Publication only follows complete row, node and provenance validation.
  await query("UPDATE curriculum_versions SET verified=1,verified_at=? WHERE id=? AND verified=0 AND EXISTS(SELECT 1 FROM official_knowledge_events WHERE id=?)",[evidence.verifiedAt,v.id,eventId]);
  if((await query('SELECT verified FROM curriculum_versions WHERE id=?',[v.id]))[0]?.verified!==1)throw Error('CURRICULUM_PUBLICATION_FAILED');
  await query("INSERT OR IGNORE INTO audit_logs(id,action,entity_type,entity_id,details_json) VALUES(?,'CURRICULUM_PRODUCTION_IMPORTED','curriculum_version',?,?)",['aud_'+eventId,v.id,JSON.stringify({githubRunId:runId,contentHash:contentHash(rows),outcomeCount:rows.length,annualPlanVerified:false,exam2028ScopeVerified:false})]);
  results.push({programVersion:item.programVersion,outcomes:rows.length,reused:v.verified===1});
  console.log('PRODUCTION_CURRICULUM_PROGRESS '+JSON.stringify(results.at(-1)));
 }
 return results;
}
export async function productionSetup(){
 if(process.env.GITHUB_ACTIONS!=='true'||!process.env.GITHUB_RUN_ID||process.env.GITHUB_REPOSITORY!=='yildizyayin/yildiz-sinav')throw Error('PROTECTED_REPOSITORY_WORKFLOW_REQUIRED');
 const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
 if(!account||!token)throw Error('PRODUCTION_CREDENTIALS_REQUIRED');
 const cf=async(path,body)=>{const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},signal:AbortSignal.timeout(60000),...(body?{body:JSON.stringify(body)}:{})});const p=await r.json();if(!r.ok||!p.success)throw Error('PRODUCTION_API_FAILED');return p.result;};
 const versions=await cf('/workers/scripts/yildiz-sinav-prod/versions'),version=versions.items?.[0]?.id||versions[0]?.id;
 const info=await cf('/workers/scripts/yildiz-sinav-prod/versions/'+version),bindings=info.resources.bindings;
 if(!bindings.some(b=>b.name==='ENVIRONMENT'&&b.type==='plain_text'&&(b.text??b.value)==='production'))throw Error('PRODUCTION_BINDING_REQUIRED');
 const db=bindings.find(b=>b.name==='DB'&&b.type==='d1');if(!db)throw Error('PRODUCTION_DB_REQUIRED');
 const query=async(sql,params=[])=>{const result=await cf(`/d1/database/${db.id||db.database_id}/query`,{sql,params});if(!Array.isArray(result)||result.some(r=>r.success===false))throw Error('PRODUCTION_QUERY_FAILED');return result[0].results;};
 const branches=JSON.parse(await readFile('data/question-branch-catalog-2028.json','utf8')),math=JSON.parse(await readFile('data/question-full-math-target-2028.json','utf8')),registry=JSON.parse(await readFile('data/app-question-scope-2028.json','utf8'));
 const imports=productionCurriculumPlan(branches,math,registry);
 const evidence=await reverifyCurricula(branches,math,async url=>{const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('OFFICIAL_SOURCE_HTTP_'+r.status);const html=await r.text();if(html.length>5e6)throw Error('SOURCE_TOO_LARGE');return html;});
 const before=(await query("SELECT budget_mode,question_cap,reserved_count,legacy_question_cap FROM question_agent_pilot_budget WHERE id='pilot_50'"))[0];
 if(!before||!Number.isSafeInteger(before.reserved_count)||before.reserved_count<0)throw Error('BUDGET_LEDGER_INVALID');
 const imported=await importProductionCurricula({query,imports,evidence,runId:process.env.GITHUB_RUN_ID});
 await query("UPDATE question_agent_pilot_budget SET budget_mode='UNLIMITED',question_cap=NULL WHERE id='pilot_50'");
 const after=(await query("SELECT budget_mode,question_cap,reserved_count,legacy_question_cap FROM question_agent_pilot_budget WHERE id='pilot_50'"))[0];
 if(after.budget_mode!=='UNLIMITED'||after.question_cap!==null||after.reserved_count<before.reserved_count||after.legacy_question_cap!==before.legacy_question_cap)throw Error('BUDGET_POSTCHECK_FAILED');
 await query("INSERT OR IGNORE INTO audit_logs(id,action,entity_type,entity_id,details_json) VALUES(?,'QUESTION_PRODUCTION_QUOTA_UNLIMITED','question_budget','pilot_50',?)",['aud_unlimited_'+process.env.GITHUB_RUN_ID,JSON.stringify({before,after,githubRunId:process.env.GITHUB_RUN_ID,noRefund:true,providerBillingUnlimited:false})]);
 console.log('PRODUCTION_QUESTION_SETUP '+JSON.stringify({environment:'production',sourceEvidence:evidence,versions:imported.length,outcomes:imported.reduce((n,p)=>n+p.outcomes,0),budget:after,providerCalls:0,annualPlanVerified:false,exam2028ScopeVerified:false,humanApprovalRequired:true}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await productionSetup();
