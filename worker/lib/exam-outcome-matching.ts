import type { Env } from '../types';
import { all, normalizeName } from './db';
export type OutcomeScope = {academicYear:string;gradeLevel:number|null;programCode:string};
export function examOutcomeScope(exam:any):OutcomeScope {
 const type=String(exam.exam_type||exam.examType||'').toUpperCase();
 return {academicYear:String(exam.academic_year||exam.academicYear||''),gradeLevel:Number(exam.grade_level||exam.gradeLevel)||null,programCode:['TYT','AYT'].includes(type)?type:'SCHOOL'};
}
export async function scopedOutcomeCatalog(env:Env,scope:OutcomeScope,subjectId?:string):Promise<any[]> {
 if(!scope.academicYear||!scope.gradeLevel)return [];
 return all<any>(env.DB.prepare(`SELECT o.*,cv.verified,cv.authority,cv.program_code,cv.academic_year,s.name subject_name
 FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id JOIN subjects s ON s.id=o.subject_id
 WHERE o.active=1 AND o.official=1 AND cv.verified=1 AND cv.academic_year=? AND cv.program_code=?
 AND coalesce(o.grade_level,cv.grade_level)=? AND (? IS NULL OR o.subject_id=?) ORDER BY s.name,o.code,o.title`).bind(scope.academicYear,scope.programCode,scope.gradeLevel,subjectId||null,subjectId||null));
}
export function matchScopedOutcome(reference:any,subjectId:string,catalog:any[]):any {
 const rows=catalog.filter(o=>o.subject_id===subjectId&&Number(o.official)===1&&Number(o.verified)===1);
 if(!rows.length)return {reason:'UNVERIFIED',suggestions:[]};
 if(!reference)return {reason:'MISSING',suggestions:[]};
 const code=String(reference.officialCode||reference.code||'').trim();
 if(code){const matches=rows.filter(o=>normalizeName(o.code||'')===normalizeName(code));if(matches.length===1)return {reason:'CODE',outcomeId:matches[0].id,suggestions:[]};if(matches.length>1)return {reason:'AMBIGUOUS',suggestions:matches};}
 const text=normalizeName(reference.publisherTitle||reference.title||'');
 if(!text)return {reason:'MISSING',suggestions:[]};
 const exact=rows.filter(o=>normalizeName(o.title)===text&&(!reference.topic||normalizeName(o.topic||'')===normalizeName(reference.topic)));
 if(exact.length===1)return {reason:'TITLE',outcomeId:exact[0].id,suggestions:[]};
 if(exact.length>1)return {reason:'AMBIGUOUS',suggestions:exact};
 const tokens=new Set(text.split(' ').filter(x=>x.length>2));
 const suggestions=rows.map(o=>{const candidate=new Set(normalizeName(o.title).split(' ').filter(x=>x.length>2));const overlap=[...tokens].filter(x=>candidate.has(x)).length;return {...o,similarity:overlap/Math.max(tokens.size,candidate.size,1)}}).filter(o=>o.similarity>=0.35).sort((a,b)=>b.similarity-a.similarity).slice(0,5);
 return {reason:suggestions.length?'AMBIGUOUS':'MISSING',suggestions};
}
