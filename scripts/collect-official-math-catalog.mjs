import {mkdir,writeFile} from 'node:fs/promises';
import {fetchMathCatalog} from './official-math-catalog.mjs';
const grades=await fetchMathCatalog();
const report={catalogRevision:2,academicYear:'2027-2028',collectedAt:new Date().toISOString(),scope:'All outcome headings in the listed current official mathematics theme pages; process components, other subjects and exam specifications are separate.',annualPlanVerified:false,exam2028ScopeVerified:false,productionQualified:false,grades};
await mkdir('data',{recursive:true});await writeFile('data/question-full-math-target-2028.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(grades.map(g=>({grade:g.grade,themes:g.themes.length,outcomes:g.outcomes.length}))));
