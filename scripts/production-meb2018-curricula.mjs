// Owner (9 Nov): grades 4, 8 and 12 follow the previous MEB programmes in 2026-2027 (tymm.meb.gov.tr lists TYMM only
// for 1-3, 5-7 and hazırlık, 9-11). Their official outcomes come from the programme PDFs on mufredat.meb.gov.tr.
// build: node scripts/production-meb2018-curricula.mjs --build  → data/meb2018-catalog-2027.json from the reviewed text.
// import (app-only production workflow): every PDF is downloaded again, its SHA-256 must match, its text is extracted
// again and read again; only an exactly identical result is written, through the same verified importer as TYMM.
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readProgram} from './meb2018-programs.mjs';
import {contentHash,importProductionCurricula,productionDatabase} from './production-question-curricula.mjs';
export const ACADEMIC_YEAR='2026-2027';
// [collected key, subject code, grades read from it]
export const PLAN=[
 ['tur-2019','TUR',[8,4]],['mat-temel-2018','MAT',[8,4]],['fen-2018','FEN',[8,4]],
 ['ink-temel-2018','INK',[8]],['din-4-8-2018','DIN',[8,4]],['ing-2-8-2018','ING',[8,4]],
 ['sos-2018','SOS',[4]],
];
const NAMES={TUR:'Türkçe',MAT:'Matematik',FEN:'Fen Bilimleri',INK:'T.C. İnkılap Tarihi ve Atatürkçülük',DIN:'Din Kültürü ve Ahlak Bilgisi',ING:'İngilizce',SOS:'Sosyal Bilgiler'};
export function catalogItems(collected,textOf){
 const items=[];
 for(const [key,subject,grades] of PLAN){
  const p=collected.programs.find(x=>x.key===key);
  if(!p||p.error||!/^https:\/\/mufredat\.meb\.gov\.tr\//.test(p.pdfUrl||'')||!/^[0-9a-f]{64}$/.test(p.sha256||''))throw Error('PROGRAM_SOURCE_MISSING:'+key);
  for(const grade of grades){
   const outcomes=readProgram(textOf(key),subject,grade);
   if(outcomes.length<10)throw Error('TOO_FEW_OUTCOMES:'+key+':'+grade);
   if(outcomes.some(o=>o.conflicts))throw Error('CONFLICTING_OUTCOME_TEXT:'+key);
   items.push({academicYear:ACADEMIC_YEAR,grade,subjectCode:subject,programKey:key,pid:p.pid,
    programVersion:`MEB-MUFREDAT-${subject}${grade}-${p.sha256.slice(0,16)}`,sourceUrl:p.pdfUrl,pdfSha256:p.sha256,
    sourceKind:'MEB_MUFREDAT',scopeKind:'SUBJECT_PROGRAM',sourceTitle:`${grade}. Sınıf ${NAMES[subject]} / önceki MEB öğretim programı / ${ACADEMIC_YEAR}`,
    outcomes:outcomes.map(o=>({code:o.code,title:o.title,unit:o.unit??null}))});
  }
 }
 return items;
}
async function build(){
 const collected=JSON.parse(await readFile('data/maarif/meb2018/collected.json','utf8'));
 const texts={};for(const [key] of PLAN)texts[key]=await readFile(`data/maarif/meb2018/${key}.txt`,'utf8');
 const items=catalogItems(collected,k=>texts[k]);
 await writeFile('data/meb2018-catalog-2027.json',JSON.stringify({academicYear:ACADEMIC_YEAR,source:'https://mufredat.meb.gov.tr/',items},null,1)+'\n');
 console.log(items.map(i=>`${i.subjectCode}${i.grade}:${i.outcomes.length}`).join(' '));
}
/** Download each PDF again and require the same bytes and the same outcomes as the reviewed catalogue. */
export async function reverifyMeb2018(catalog,fetchPdf,extractText){
 const verifiedAt=new Date().toISOString(),bySource=new Map();
 for(const item of catalog.items){
  if(!/^https:\/\/mufredat\.meb\.gov\.tr\//.test(item.sourceUrl))throw Error('OFFICIAL_SOURCE_REQUIRED');
  if(!bySource.has(item.sourceUrl)){
   const pdf=await fetchPdf(item.sourceUrl),sha=createHash('sha256').update(pdf).digest('hex');
   if(sha!==item.pdfSha256)throw Error('OFFICIAL_PDF_CHANGED:'+item.programKey);
   bySource.set(item.sourceUrl,await extractText(pdf));
  }
  const again=readProgram(bySource.get(item.sourceUrl),item.subjectCode,item.grade).map(o=>({code:o.code,title:o.title,unit:o.unit??null}));
  if(again.length!==item.outcomes.length||contentHash(again)!==contentHash(item.outcomes))throw Error('OFFICIAL_CONTENT_CHANGED:'+item.programKey+':'+item.grade);
 }
 return {verifiedAt,sources:bySource.size,method:'OFFICIAL_PDF_SHA256_AND_EXACT_REREAD'};
}
async function productionImport(){
 const catalog=JSON.parse(await readFile('data/meb2018-catalog-2027.json','utf8'));
 const work=await mkdtemp(join(tmpdir(),'meb2018-'));let n=0;
 const evidence=await reverifyMeb2018(catalog,async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('OFFICIAL_SOURCE_HTTP_'+r.status);const b=Buffer.from(await r.arrayBuffer());if(b.length>2e7)throw Error('SOURCE_TOO_LARGE');return b;},
  async pdf=>{const f=join(work,`p${n++}.pdf`);await writeFile(f,pdf);execFileSync('pdftotext',['-layout','-enc','UTF-8',f,f+'.txt']);return readFile(f+'.txt','utf8');});
 const query=await productionDatabase();
 const imported=await importProductionCurricula({query,imports:catalog.items,evidence,runId:process.env.GITHUB_RUN_ID});
 console.log('PRODUCTION_MEB2018_CURRICULA '+JSON.stringify({academicYear:catalog.academicYear,evidence,versions:imported.length,outcomes:imported.reduce((s,p)=>s+p.outcomes,0)}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.argv.includes('--build'))await build();else await productionImport();}
