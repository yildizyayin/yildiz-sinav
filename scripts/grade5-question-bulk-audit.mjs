/**
 * ANUNEX grade-five question drafts structural and coverage audit.
 * READ-ONLY, NO NETWORK, NO AI, NO D1 WRITES, NO APPROVAL, NO DEPLOY.
 * Usage: node scripts/grade5-question-bulk-audit.mjs [--strict]
 */
import {readFileSync,existsSync} from 'node:fs';
const dir='data/question-import-drafts/grade5/';
const manifest=JSON.parse(readFileSync(dir+'ALL_OUTCOMES_50_TARGET_MANIFEST.json','utf8'));
const origin=manifest.bulkDraftFile?.split('/').at(-1)||'EXISTING_100_REVIEW_ONLY.json';
const other=(manifest.newDraftFiles||[]).map(x=>x.split('/').at(-1));
const files=[...new Set([origin,...other])];
if(files.some(x=>!existsSync(dir+x)))throw Error('Manifest refers to missing draft file');
const batches=files.map(file=>({file,data:JSON.parse(readFileSync(dir+file,'utf8'))}));
const outcomes=new Map(manifest.items.map(x=>[x.outcomeCode,x]));
if(outcomes.size!==manifest.items.length)throw Error('Duplicate outcome codes in registry');
const issues=[],firstSeen=new Map(),byCode=new Map(),yearContexts=new Set();
const norm=x=>String(x??'').toLocaleLowerCase('tr-TR').replace(/\s+/gu,' ').trim();
let rowNo=0;
for(const {file,data} of batches){
  if(!Array.isArray(data.rows))throw Error('File does not contain rows: '+file);
  const sourceYear=data.academicYearOfDraftSource||data.metadata?.academicYearCatalog||data.metadata?.academicYearOfCurriculumCatalog||data.metadata?.sourceAcademicYear||null;
  if(sourceYear)yearContexts.add(sourceYear);
  for(const row of data.rows){
    rowNo++;
    const o=outcomes.get(row.outcomeCode);
    if(!o){issues.push({rowNo,file,issue:'UNKNOWN_OUTCOME'});continue;}
    if(o.gradeLevel!==row.gradeLevel||row.gradeLevel!==5)issues.push({rowNo,file,issue:'GRADE_MISMATCH'});
    const key=row.outcomeCode+'|'+norm(row.stem);
    if(firstSeen.has(key))issues.push({rowNo,file,issue:'DUPLICATE_STEM',originalRow:firstSeen.get(key)});
    else firstSeen.set(key,rowNo);
    const options=['A','B','C','D','E'].map(k=>row['option'+k]).filter(x=>typeof x==='string'&&x.trim().length>0);
    if(options.length<4||options.length>5||new Set(options.map(norm)).size!==options.length)issues.push({rowNo,file,issue:'INVALID_OPTIONS'});
    if(!['A','B','C','D','E'].slice(0,options.length).includes(row.correctAnswer))issues.push({rowNo,file,issue:'INVALID_KEY'});
    if(!norm(row.stem)||!norm(row.solution)||!norm(row.sourceLabel))issues.push({rowNo,file,issue:'INCOMPLETE_CONTENT'});
    if(!Number.isInteger(row.difficultyLevel)||row.difficultyLevel<1||row.difficultyLevel>6)issues.push({rowNo,file,issue:'DIFFICULTY_INVALID'});
    if(!['OWNED','LICENSED','PUBLIC_DOMAIN'].includes(row.copyrightStatus))issues.push({rowNo,file,issue:'RIGHTS_REQUIRE_REVIEW'});
    byCode.set(row.outcomeCode,(byCode.get(row.outcomeCode)||0)+1);
  }
}
const perSubject={};
for(const outcome of manifest.items){
 const sub=outcome.subjectCode;
 perSubject[sub]??={outcomes:0,target:0,draft:0,approved:0};
 perSubject[sub].outcomes++;
 perSubject[sub].target+=outcome.targetCount;
 perSubject[sub].draft+=byCode.get(outcome.outcomeCode)||0;
 if((byCode.get(outcome.outcomeCode)||0)!==(outcome.storedInThisBranch||0))issues.push({outcome:outcome.outcomeCode,issue:'MANIFEST_COUNT_MISMATCH'});
 if((byCode.get(outcome.outcomeCode)||0)>outcome.targetCount)issues.push({outcome:outcome.outcomeCode,issue:'OVER_TARGET'});
}
const draftCount=batches.reduce((a,x)=>a+x.data.rows.length,0),target=manifest.items.reduce((a,x)=>a+x.targetCount,0);
if(manifest.targets.draftQuestions!==draftCount)issues.push({issue:'MANIFEST_TOTAL_MISMATCH'});
const report={scope:'grade-five six-core-subjects',target,draftCount,remainingDrafts:target-draftCount,completeDraftOutcomes:[...byCode.values()].filter(n=>n===50).length,approvedInThisPackage:0,sourceYearContexts:[...yearContexts],sourceYearMismatch:yearContexts.size>1||[...yearContexts].some(y=>y!==manifest.academicYearOfCurriculumCatalog),sourceTitleConflicts:manifest.sourceInventory.titleConflicts.length,perSubject,files,structuralIssueCount:issues.length,structuralIssues:issues,
  evidenceLimits:'Structural checks are NOT independent academic validation, MEB process-component validation, copyright verification, or teacher approval.',
  deploymentAllowed:false};
process.stdout.write(JSON.stringify(report,null,2)+'\n');
if(process.argv.includes('--strict')&&(draftCount!==target||report.sourceYearMismatch||report.sourceTitleConflicts||issues.length||report.approvedInThisPackage!==target))process.exitCode=1;
