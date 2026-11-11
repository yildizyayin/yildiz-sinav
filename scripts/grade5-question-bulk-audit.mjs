/**
 * ANUNEX grade-5 bulk draft audit. No network, model, database, approval or deploy.
 * Run: node scripts/grade5-question-bulk-audit.mjs [--strict]
 */
import { readFileSync } from 'node:fs';

const root='data/question-import-drafts/grade5/';
const manifest=JSON.parse(readFileSync(root+'ALL_OUTCOMES_50_TARGET_MANIFEST.json','utf8'));
const files=[
 'EXISTING_100_REVIEW_ONLY.json',
 'MAT513_part01_25_questions.json',
 'MAT513_part02_25_questions.json',
 'MAT514_part01_25_questions.json',
 'MAT514_part02_25_questions.json'
];
const groups=files.map(file=>({file,data:JSON.parse(readFileSync(root+file,'utf8'))}));
const rows=groups.flatMap(g=>g.data.rows??[]);
const expectedByCode=new Map(manifest.items.map(x=>[x.outcomeCode,x]));
if(expectedByCode.size!==manifest.items.length)throw Error('Duplicate official outcome code in manifest');
const seen=new Map(),byCode=new Map(),issues=[];
const normalize=s=>String(s??'').toLocaleLowerCase('tr-TR').replace(/\s+/gu,' ').trim();
for(const [i,row] of rows.entries()){
 const rowNo=i+1,code=row.outcomeCode,registered=expectedByCode.get(code);
 if(!registered){issues.push({row:rowNo,problem:'UNKNOWN_OUTCOME'});continue;}
 if(registered.gradeLevel!==row.gradeLevel||row.gradeLevel!==5)issues.push({row:rowNo,problem:'WRONG_GRADE'});
 const key=code+'|'+normalize(row.stem);
 if(seen.has(key))issues.push({row:rowNo,problem:'DUPLICATE_STEM',firstRow:seen.get(key)});
 else seen.set(key,rowNo);
 const options=['A','B','C','D','E'].map(k=>row['option'+k]).filter(v=>typeof v==='string'&&v.trim());
 if(options.length<4||options.length>5)issues.push({row:rowNo,problem:'OPTION_COUNT'});
 if(new Set(options.map(normalize)).size!==options.length)issues.push({row:rowNo,problem:'DUPLICATE_OPTION'});
 if(!['A','B','C','D','E'].slice(0,options.length).includes(row.correctAnswer))issues.push({row:rowNo,problem:'ANSWER_KEY'});
 if(!normalize(row.solution)||!normalize(row.sourceLabel)||!normalize(row.stem))issues.push({row:rowNo,problem:'INCOMPLETE'});
 if(!Number.isInteger(row.difficultyLevel)||row.difficultyLevel<1||row.difficultyLevel>6)issues.push({row:rowNo,problem:'DIFFICULTY'});
 if(row.copyrightStatus!=='OWNED'&&row.copyrightStatus!=='LICENSED'&&row.copyrightStatus!=='PUBLIC_DOMAIN')issues.push({row:rowNo,problem:'RIGHTS_NEEDS_REVIEW'});
 byCode.set(code,(byCode.get(code)||0)+1);
}
const bySubject={};
for(const o of manifest.items){
 const s=o.subjectCode;
 bySubject[s]??={outcomes:0,targetQuestions:0,draftQuestions:0,approvedQuestions:0};
 bySubject[s].outcomes++;
 bySubject[s].targetQuestions+=o.targetCount;
 bySubject[s].draftQuestions+=byCode.get(o.outcomeCode)||0;
 if((byCode.get(o.outcomeCode)||0)!==(o.storedInThisBranch||0))issues.push({outcome:o.outcomeCode,problem:'MANIFEST_COUNT_MISMATCH'});
}
const counts={targetQuestions:manifest.items.reduce((a,x)=>a+x.targetCount,0),draftQuestions:rows.length,distinctOutcomesWithDrafts:byCode.size,
 approvedQuestions:0,remainingDraftQuestions:manifest.items.reduce((a,x)=>a+x.targetCount,0)-rows.length};
const sameCount=counts.draftQuestions===manifest.targets.draftQuestions;
if(!sameCount)issues.push({problem:'MANIFEST_TOTAL_MISMATCH'});
const status={curriculumCatalogYear:manifest.academicYearOfCurriculumCatalog,
 previousMathematicsDraftReferenceYear:groups[0].data.academicYearOfDraftSource,
 unresolvedYearEquivalence:groups[0].data.academicYearOfDraftSource!==manifest.academicYearOfCurriculumCatalog,
 curriculumTitleConflicts:manifest.sourceInventory.titleConflicts.length,
 teacherAndRightsApproval:'PENDING',
 fullyReadyForImport:false,readyForDeploy:false};
const report={counts,bySubject,perOutcome:[...byCode].map(([code,count])=>({code,count})),files,status,structuralIssues:issues};
process.stdout.write(JSON.stringify(report,null,2)+'\n');
if(process.argv.includes('--strict')&&(counts.remainingDraftQuestions!==0||issues.length||status.unresolvedYearEquivalence||status.curriculumTitleConflicts||status.teacherAndRightsApproval!=='APPROVED'))process.exitCode=1;
