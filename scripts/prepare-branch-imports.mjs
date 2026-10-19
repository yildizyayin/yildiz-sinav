import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {buildBranchImportPlan,branchImportCsv,summarizeBranchImportPlan} from './branch-import-plan.mjs';
const catalog=JSON.parse(await readFile('data/question-branch-catalog-2028.json','utf8'));
const plan=buildBranchImportPlan(catalog);await mkdir('tmp/branch-imports-2028',{recursive:true});
for(const item of plan.imports)await writeFile(`tmp/branch-imports-2028/${item.programVersion}.csv`,branchImportCsv(item));
await writeFile('data/question-branch-import-plan-2028.json',JSON.stringify(summarizeBranchImportPlan(plan),null,2)+'\n');
console.log(JSON.stringify({imports:plan.imports.length,themeScoped:plan.imports.filter(p=>p.scopeKind==='THEME').length,outcomes:plan.imports.reduce((n,p)=>n+p.outcomeCount,0),blocked:plan.blocked,dbWrites:0}));
