import reference from '../data/question-pilot-math7-curriculum.json' with {type:'json'};
import {checkMath7Source,math7Csv} from './math7-curriculum-source.mjs';
/** Target year is ANUNEX scheduling metadata, not an official annual-plan claim. */
export function checkMath7Target2028(spec,html){
 if(spec?.academicYear!=='2027-2028'||spec.programVersion!=='ANUNEX-TYMM-MAT7-THEME1-TARGET2028-20261017')throw Error('MATH7_TARGET_YEAR_MISMATCH');
 for(const k of ['gradeLevel','programCode','authority','sourceUrl','sourceTitle','outcomes'])if(JSON.stringify(spec[k])!==JSON.stringify(reference[k]))throw Error('MATH7_TARGET_SOURCE_MISMATCH:'+k);
 const checked=checkMath7Source(reference,html);
 return {...checked,targetAcademicYear:spec.academicYear,annualPlanVerified:false,exam2028ScopeVerified:false,contentVerification:'CURRENT_OFFICIAL_PROGRAM',targetYearMeaning:'ANUNEX_CONTENT_PLANNING'};
}
export {math7Csv};
