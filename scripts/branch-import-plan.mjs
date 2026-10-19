import {createHash} from 'node:crypto';
import {fullMathCsv} from './official-math-catalog.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Official codes are unchanged. The version and source theme scope identity. */
export function buildBranchImportPlan(catalog){
 if(catalog.academicYear!=='2027-2028')throw Error('CATALOG_YEAR_MISMATCH');
 const imports=[],blocked=[...(catalog.issues??[])];const names=new Set();
 for(const program of catalog.programs){
  const groups=program.conflicts.length?program.themes.map(theme=>({scopeUrl:theme.url,themes:[theme],outcomes:theme.outcomes})): [{scopeUrl:program.indexUrl,themes:program.themes,outcomes:program.outcomes}];
  for(const group of groups){
   const codes=new Set();for(const outcome of group.outcomes){if(!outcome.code||!outcome.title||codes.has(outcome.code))throw Error('AMBIGUOUS_SCOPED_CODE');codes.add(outcome.code);}
   const scopeKey=hash([catalog.academicYear,program.course,program.grade,group.scopeUrl]).slice(0,16);
   const programVersion=`ANUNEX-TYMM-${program.subjectCode}${program.grade}-TARGET2028-20261019-${scopeKey}`;
   if(names.has(programVersion))throw Error('DUPLICATE_IMPORT_SCOPE');names.add(programVersion);
   imports.push({academicYear:catalog.academicYear,course:program.course,subjectCode:program.subjectCode,grade:program.grade,
    programCode:'SCHOOL',programVersion,sourceUrl:group.scopeUrl,indexUrl:program.indexUrl,
    scopeKind:groups.length>1?'THEME':'SUBJECT_PROGRAM',themeUrls:group.themes.map(t=>t.url),
    outcomeCount:group.outcomes.length,outcomes:group.outcomes,
    contentFingerprint:hash(group.outcomes.map(o=>[o.code,o.title,o.unit,o.sourceUrl])),
    sourceFingerprints:group.themes.map(t=>({url:t.url,hash:t.hash})),examSpecification:false});
  }
 }
 return {academicYear:catalog.academicYear,imports,blocked,officialCodesRewritten:false,
  automaticAnnualPlanSelectionSafe:false,activationRequirement:'EXPLICIT_CURRICULUM_SELECTION',
  sourceCheckRequirement:'REFETCH_INDEXES_AND_COMPARE_THEME_CONTENT_BEFORE_COMMIT'};
}
export function branchImportCsv(item){
 // Reuse CSV quoting only. Replace the fixed mathematics subject column.
 return fullMathCsv({grade:item.grade,outcomes:item.outcomes}).split('\n').map((line,i)=>i?line.replace(/^"MAT";/,`"${item.subjectCode}";`):line).join('\n');
}
export function summarizeBranchImportPlan(plan){return {...plan,imports:plan.imports.map(({outcomes,...item})=>item)};}
