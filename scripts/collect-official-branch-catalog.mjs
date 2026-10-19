import {readFile,writeFile} from 'node:fs/promises';
import {assembleBranchProgram} from './official-branch-catalog.mjs';
export async function collectBranchCatalog(indexes,get){
 const programs=[],issues=[];
 for(const spec of indexes){
  try{const pages=[];for(const theme of spec.themes)pages.push({theme,html:await get(theme.url)});
   programs.push(assembleBranchProgram(spec,pages));
  }catch(error){issues.push({course:spec.course,grade:spec.grade,error:error.message});}
 }
 return {academicYear:'2027-2028',scope:'Official school program sources; not a 2028 LGS/TYT/AYT specification.',programs,issues};
}
if(process.argv[1]?.endsWith('/collect-official-branch-catalog.mjs')){
 const indexes=JSON.parse(await readFile('data/question-branch-source-indexes-2028.json','utf8'));
 const get=async url=>{const u=new URL(url);if(u.origin!=='https://tymm.meb.gov.tr'||!/^\/[a-z0-9-]+\/unite\/\d+$/.test(u.pathname)||u.search||u.hash)throw Error('SOURCE_URL_REJECTED');const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('SOURCE_HTTP_'+r.status);return r.text();};
 const catalog=await collectBranchCatalog(indexes,get);
 await writeFile(process.argv[2]??'tmp/official-branch-catalog.json',JSON.stringify(catalog,null,2)+'\n');
 console.log(JSON.stringify({programs:catalog.programs.length,issues:catalog.issues,ready:catalog.programs.filter(p=>p.importStatus==='SOURCE_VERIFIED').length}));
}
