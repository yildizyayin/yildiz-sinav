export type AnnualCurriculumVersion={id:string;academic_year:string;grade_level:number;program_code:string;verified:number};
export function selectAnnualCurricula(versions:AnnualCurriculumVersion[],year:string,grade:number,requested?:unknown):{ok:true;ids:string[]}|{ok:false;reason:string}{
 const eligible=versions.filter(v=>v.academic_year===year&&v.grade_level===grade&&v.program_code==='SCHOOL'&&v.verified===1);
 if(requested===undefined){if(eligible.length===1)return {ok:true,ids:[eligible[0].id]};return {ok:false,reason:eligible.length?'CURRICULUM_SELECTION_REQUIRED':'VERIFIED_CURRICULUM_REQUIRED'};}
 if(!Array.isArray(requested)||!requested.length||requested.length>80||requested.some(id=>typeof id!=='string')||new Set(requested).size!==requested.length)return {ok:false,reason:'INVALID_CURRICULUM_SELECTION'};
 if(requested.some(id=>!eligible.some(v=>v.id===id)))return {ok:false,reason:'CURRICULUM_CONTEXT_MISMATCH'};
 return {ok:true,ids:[...requested].sort()};
}
export function overlappingAnnualOutcomes(rows:{subject_id:string;code:string|null;unit:string|null}[]):boolean{
 const seen=new Set<string>();for(const row of rows){const key=JSON.stringify([row.subject_id,row.unit??'',row.code]);if(seen.has(key))return true;seen.add(key);}return false;
}
