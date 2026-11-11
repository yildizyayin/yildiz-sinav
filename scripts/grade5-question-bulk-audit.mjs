/**
 * ANUNEX fifth-grade question coverage report.
 * No AI calls, database writes, approval, imports, or deployment.
 * Usage: node scripts/grade5-question-bulk-audit.mjs [--strict]
 */
import {readFileSync} from 'node:fs';
const root = 'data/question-import-drafts/grade5/';
const m=JSON.parse(readFileSync(root+'ALL_OUTCOMES_50_TARGET_MANIFEST.json','utf8'));
const d=JSON.parse(readFileSync(root+'EXISTING_100_REVIEW_ONLY.json','utf8'));
const issues=[],counts=new Map(),codes=new Map(),seen=new Set();
const normalize=s=>String(s||'').toLocaleLowerCase('tr-TR').replace(/\s+/gu,' ').trim();
for(const x of m.items){
 if(codes.has(x.outcomeCode))throw Error('Duplicate curriculum code '+x.outcomeCode);
 codes.set(x.outcomeCode,x);
}
for(const [i,row] of d.rows.entries()){
 const code=row.outcomeCode;
 if(!codes.has(code)){issues.push({row:i+1,problem:'UNKNOWN_OUTCOME'});continue;}
 if(row.gradeLevel!==5)issues.push({row:i+1,problem:'WRONG_GRADE'});
 const hash=code+'|'+normalize(row.stem);
 if(seen.has(hash))issues.push({row:i+1,problem:'DUPLICATE_STEM'});
 seen.add(hash);
 const options=['A','B','C','D','E'].map(l=>row['option'+l]).filter(v=>typeof v==='string'&&v.trim());
 if(options.length<4||options.length>5)issues.push({row:i+1,problem:'WRONG_OPTION_COUNT'});
 if(new Set(options.map(normalize)).size!==options.length)issues.push({row:i+1,problem:'DUPLICATE_OPTION'});
 if(!['A','B','C','D','E'].slice(0,options.length).includes(row.correctAnswer))issues.push({row:i+1,problem:'INVALID_KEY'});
 if(!normalize(row.stem)||!normalize(row.solution)||!normalize(row.sourceLabel))issues.push({row:i+1,problem:'INCOMPLETE_CONTENT'});
 if(!['OWNED','LICENSED','PUBLIC_DOMAIN','USER_PROVIDED','RESTRICTED'].includes(row.copyrightStatus))issues.push({row:i+1,problem:'INVALID_RIGHTS'});
 if(!Number.isInteger(row.difficultyLevel)||row.difficultyLevel<1||row.difficultyLevel>6)issues.push({row:i+1,problem:'INVALID_DIFFICULTY'});
 counts.set(code,(counts.get(code)||0)+1);
}
const bySubject={};
for(const item of m.items){
 const s=item.subjectCode;
 bySubject[s]??={outcomes:0,target:0,draft:0,approved:0};
 bySubject[s].outcomes++;
 bySubject[s].target+=item.targetCount;
 bySubject[s].draft+=counts.get(item.outcomeCode)||0;
}
const totalTarget=m.items.reduce((a,x)=>a+x.targetCount,0);
const summary={outcomes:m.items.length,targets:totalTarget,drafts:d.rows.length,
 missingDrafts:totalTarget-d.rows.length,approved:0,bySubject,
 yearMismatch:m.academicYearOfCurriculumCatalog!==d.academicYearOfDraftSource,
 conflictingSourceDescriptions:m.sourceInventory?.titleConflicts?.length||0,
 structuralIssues:issues};
process.stdout.write(JSON.stringify(summary,null,2)+'\n');
if(process.argv.includes('--strict')&&
 (summary.missingDrafts!==0||summary.approved!==totalTarget||summary.yearMismatch||issues.length||summary.conflictingSourceDescriptions))process.exitCode=1;
