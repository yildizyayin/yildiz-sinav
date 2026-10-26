import type { Env } from '../types';
import { all, normalizeName } from './db';
export type OutcomeScope = {academicYear:string;gradeLevel:number|null;programCode:string};
export function examOutcomeScope(exam:any):OutcomeScope {
 const type=String(exam.exam_type||exam.examType||'').toUpperCase();
 return {academicYear:String(exam.academic_year||exam.academicYear||''),gradeLevel:Number(exam.grade_level||exam.gradeLevel)||null,programCode:['TYT','AYT'].includes(type)?type:'SCHOOL'};
}
/**
 * S028: TYT and AYT questions are matched against the MEB high-school programme.
 * TYT uses grades 9–10, AYT grades 11–12 (owner decision 26 Oct). Exam subjects map to the catalogue subjects below.
 */
const UNIVERSITY_FAMILIES:Record<string,string[]>={
 sub_tyt_tur:['sub_edb'],sub_tur:['sub_edb'],sub_ayt_tde:['sub_edb'],sub_edb:['sub_edb'],
 sub_tyt_mat:['sub_mat'],sub_ayt_mat:['sub_mat'],sub_mat:['sub_mat'],
 sub_tyt_fen:['sub_fiz','sub_kim','sub_biy'],sub_fen:['sub_fiz','sub_kim','sub_biy'],
 sub_ayt_fiz:['sub_fiz'],sub_fiz:['sub_fiz'],sub_ayt_kim:['sub_kim'],sub_kim:['sub_kim'],sub_ayt_biy:['sub_biy'],sub_biy:['sub_biy'],
 sub_tyt_sos:['sub_tar','sub_cog','sub_fel','sub_din'],sub_sos:['sub_tar','sub_cog','sub_fel','sub_din'],
 sub_ayt_tar1:['sub_tar'],sub_ayt_tar2:['sub_tar'],sub_tar:['sub_tar'],sub_ayt_cog1:['sub_cog'],sub_ayt_cog2:['sub_cog'],sub_cog:['sub_cog'],
 sub_tyt_fel:['sub_fel'],sub_ayt_fel:['sub_fel'],sub_fel:['sub_fel'],sub_ayt_din:['sub_din'],sub_din:['sub_din'],
};
export function catalogSubjectsFor(scope:OutcomeScope,examSubjectId:string):string[]{
 return scope.programCode==='SCHOOL'?[examSubjectId]:(UNIVERSITY_FAMILIES[examSubjectId]||[examSubjectId]);
}
export function examSubjectsForOutcome(scope:OutcomeScope,outcomeSubjectId:string):string[]{
 if(scope.programCode==='SCHOOL')return [outcomeSubjectId];
 return Object.entries(UNIVERSITY_FAMILIES).filter(([,family])=>family.includes(outcomeSubjectId)).map(([id])=>id);
}
/** The publisher label as stored in publisher_outcome_labels.label_path_json. */
export function publisherLabelPath(reference:any):string{
 const publisherTitle=String(reference?.publisherTitle||reference?.title||'').trim()||null;
 const publisherCode=String(reference?.publisherCode||(!publisherTitle?reference?.code||reference?.officialCode:'')||'').trim()||null;
 return JSON.stringify({publisherCode,publisherTitle,officialCode:reference?.officialCode||reference?.code||null,unit:reference?.unit||null,topic:reference?.topic||null,subtopic:reference?.subtopic||null,parentCode:reference?.parentCode||null});
}
/** S028: a publisher label a person already approved maps again automatically, in any later exam of the same publisher and programme. */
export async function approvedLabelOutcome(env:Env,publisherId:string|null,programCode:string,subjectId:string,reference:any):Promise<string|null>{
 const row=await env.DB.prepare(`SELECT canonical_outcome_id id FROM publisher_outcome_labels WHERE publisher_id IS ? AND program_code=? AND subject_id=? AND label_path_json=? AND mapping_status='APPROVED' AND canonical_outcome_id IS NOT NULL ORDER BY reviewed_at DESC LIMIT 1`).bind(publisherId,programCode,subjectId,publisherLabelPath(reference)).first<{id:string}>();
 return row?.id||null;
}
export function outcomeFitsQuestion(scope:OutcomeScope,examSubjectId:string,outcome:any):boolean{
 return catalogSubjectsFor(scope,examSubjectId).includes(String(outcome?.subject_id));
}
function scopeGrades(scope:OutcomeScope):number[]{
 if(scope.programCode==='TYT')return [9,10];
 if(scope.programCode==='AYT')return [11,12];
 return scope.gradeLevel?[scope.gradeLevel]:[];
}
const yearStart=(y:string)=>Number(String(y).slice(0,4))||0;
/** Verified official outcomes for the exam's grades. When the exam's year has no verified catalogue, the nearest verified year is used (owner decision 26 Oct: 2026-27 exams use the 2027-28 TYMM catalogue). */
export async function scopedOutcomeCatalog(env:Env,scope:OutcomeScope,subjectId?:string):Promise<any[]> {
 const grades=scopeGrades(scope);
 if(!scope.academicYear||!grades.length)return [];
 const subjects=subjectId?catalogSubjectsFor(scope,subjectId):null;
 const marks=grades.map(()=>'?').join(',');
 const rows=await all<any>(env.DB.prepare(`SELECT o.*,cv.verified,cv.authority,cv.program_code,cv.academic_year,s.name subject_name
 FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id JOIN subjects s ON s.id=o.subject_id
 WHERE o.active=1 AND o.official=1 AND cv.verified=1 AND cv.program_code='SCHOOL'
 AND coalesce(o.grade_level,cv.grade_level) IN (${marks})${subjects?` AND o.subject_id IN (${subjects.map(()=>'?').join(',')})`:''} ORDER BY s.name,o.code,o.title`).bind(...grades,...(subjects||[])));
 if(!rows.length)return [];
 const years=[...new Set(rows.map(r=>String(r.academic_year)))];
 const wanted=years.includes(scope.academicYear)?scope.academicYear:years.sort((a,b)=>Math.abs(yearStart(a)-yearStart(scope.academicYear))-Math.abs(yearStart(b)-yearStart(scope.academicYear))||yearStart(b)-yearStart(a))[0];
 return rows.filter(r=>String(r.academic_year)===wanted).map(r=>({...r,catalog_fallback:wanted!==scope.academicYear?wanted:null}));
}
export function matchScopedOutcome(reference:any,subjectId:string,catalog:any[],scope?:OutcomeScope):any {
 const rows=catalog.filter(o=>(o.subject_id===subjectId||(scope&&outcomeFitsQuestion(scope,subjectId,o)))&&Number(o.official)===1&&Number(o.verified)===1);
 if(!rows.length)return {reason:'UNVERIFIED',suggestions:[]};
 if(!reference)return {reason:'MISSING',suggestions:[]};
 const code=String(reference.officialCode||reference.code||'').trim();
 const text=normalizeName(reference.publisherTitle||reference.title||'');
 if(code){const matches=rows.filter(o=>normalizeName(o.code||'')===normalizeName(code));if(matches.length===1){
  // A021: the code wins only when the wording does not name a different verified outcome; a conflict goes to review.
  const other=text?rows.filter(o=>o.id!==matches[0].id&&normalizeName(o.title)===text):[];
  if(other.length)return {reason:'AMBIGUOUS',conflict:'CODE_TITLE',suggestions:[matches[0],...other]};
  return {reason:'CODE',outcomeId:matches[0].id,suggestions:[]};}
  if(matches.length>1)return {reason:'AMBIGUOUS',suggestions:matches};}
 if(!text)return {reason:'MISSING',suggestions:[]};
 const exact=rows.filter(o=>normalizeName(o.title)===text&&(!reference.topic||normalizeName(o.topic||'')===normalizeName(reference.topic)));
 if(exact.length===1)return {reason:'TITLE',outcomeId:exact[0].id,suggestions:[]};
 if(exact.length>1)return {reason:'AMBIGUOUS',suggestions:exact};
 // S028: publisher keys name topics ("Aralık Kavramı ve Basit Eşitsizlikler"), not MEB sentences. Suggest by shared word stems; a person approves.
 const suggestions=suggestOutcomes(`${reference.publisherTitle||reference.title||''} ${reference.topic||''} ${reference.subtopic||''}`,rows);
 return {reason:suggestions.length?'AMBIGUOUS':'MISSING',suggestions};
}

const STOP=new Set(['ve','ile','bir','bu','icin','olan','ilgili','uzerine','gore','daha','kadar','gibi','karma','soru','sorular','test','konu','genel','tekrar','yapabilme','edebilme','eder','yapar','belirler','aciklar','cozer','kullanir','tema']);
const stems=(text:string)=>new Set(normalizeName(text).split(/\s+/).filter(w=>w.length>2&&!STOP.has(w)).map(w=>w.slice(0,5)));
/** Ranked suggestions by shared word stems (first five letters, Turkish suffixes vary). Never applied without a person. */
export function suggestOutcomes(referenceText:string,rows:any[],limit=3):any[]{
 const ref=stems(referenceText);if(!ref.size)return [];
 return rows.map(o=>{const cand=stems(`${o.title||''} ${o.topic||''} ${o.subtopic||''}`);let hit=0;for(const w of ref)if(cand.has(w))hit++;return {...o,similarity:Math.round(hit/ref.size*100)/100}})
  .filter(o=>o.similarity>=0.25).sort((a,b)=>b.similarity-a.similarity||String(a.code).localeCompare(String(b.code))).slice(0,limit);
}
