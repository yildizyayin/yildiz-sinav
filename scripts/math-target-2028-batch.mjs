import m5 from '../data/question-pilot-math5-curriculum.json' with {type:'json'};
import m6 from '../data/question-pilot-math6-curriculum.json' with {type:'json'};
import m9 from '../data/question-pilot-math9-curriculum.json' with {type:'json'};
import m10 from '../data/question-pilot-math10-curriculum.json' with {type:'json'};
import m11 from '../data/question-pilot-math11-curriculum.json' with {type:'json'};
import {checkMath6Source,math6Csv} from './math6-curriculum-source.mjs';
import {checkMath9Source,math9Csv} from './math9-curriculum-source.mjs';
import {checkMath10Source,math10Csv} from './math10-curriculum-source.mjs';
import {checkMath11Source,math11Csv} from './math11-curriculum-source.mjs';
const refs=[m5,m6,m9,m10,m11];
export const batchTargets=refs.map(s=>({...structuredClone(s),academicYear:'2027-2028',programVersion:`ANUNEX-TYMM-MAT${s.gradeLevel}-THEME1-TARGET2028-20261017`,scope:'Güncel resmî ilk tema içeriğinin 2027–2028 ANUNEX hedef yılı kaydı; tam müfredat veya 2028 sınav şartnamesi değildir.'}));
export function checkBatchTarget(spec,html){
 const i=refs.findIndex(r=>r.gradeLevel===spec?.gradeLevel),expected=batchTargets[i];
 if(i<0||JSON.stringify(spec)!==JSON.stringify(expected))throw Error('TARGET2028_MANIFEST_MISMATCH');
 const ref=refs[i];let checked;
 if(ref.gradeLevel===5){
  const text=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;|&#xA0;/gi,' ').replace(/\s+/gu,' ');
  if(ref.sourceUrl!=='https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/447'||ref.outcomes.map(o=>o.code).join(',')!=='MAT.5.1.1,MAT.5.1.2'||ref.outcomes.some(o=>!text.includes(o.code+'. '+o.title))||!text.includes('en fazla on iki basamaklı')||!text.includes('en fazla beş basamak')||!text.includes('en fazla üç basamaklı'))throw Error('MATH5_CURRENT_SOURCE_MISMATCH');
  checked={matchedCodes:ref.outcomes.map(o=>o.code),completeGrade:false,productionQualified:false};
 }else checked=({6:checkMath6Source,9:checkMath9Source,10:checkMath10Source,11:checkMath11Source})[ref.gradeLevel](ref,html);
 return {...checked,targetAcademicYear:spec.academicYear,annualPlanVerified:false,exam2028ScopeVerified:false,contentVerification:'CURRENT_OFFICIAL_PROGRAM',targetYearMeaning:'ANUNEX_CONTENT_PLANNING'};
}
export function batchTargetCsv(spec){
 if(!batchTargets.some(s=>JSON.stringify(s)===JSON.stringify(spec)))throw Error('TARGET2028_MANIFEST_MISMATCH');
 if(spec.gradeLevel!==5)return ({6:math6Csv,9:math9Csv,10:math10Csv,11:math11Csv})[spec.gradeLevel](spec);
 const cell=x=>'"'+String(x??'').replaceAll('"','""')+'"';
 return [['subject_code','grade_level','outcome_code','title','topic','unit','node_type'],...spec.outcomes.map(o=>['MAT',5,o.code,o.title,o.topic,'Sayılar ve Nicelikler (1)','OUTCOME'])].map(r=>r.map(cell).join(';')).join('\n');
}
export function assertTargetRows(spec,rows){
 if(rows.length!==spec.outcomes.length||rows.some((r,i)=>r.code!==spec.outcomes[i].code||r.title!==spec.outcomes[i].title||r.grade_level!==spec.gradeLevel||r.official!==1||r.active!==1||r.subject_code!=='MAT'||!r.node_id||r.node_active!==1||r.node_grade!==spec.gradeLevel||r.node_year!==spec.academicYear))throw Error('TARGET2028_IMPORTED_LINKS_MISMATCH');
}
