// Pinned official first-theme source, not full-grade/production qualification.
export function checkMath7Source(spec,html){
 if(spec.gradeLevel!==7||spec.academicYear!=='2026-2027'||spec.programCode!=='SCHOOL'||spec.authority!=='MEB'||spec.sourceUrl!=='https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/463'||spec.outcomes.length!==4||spec.outcomes.map(o=>o.code).join(',')!=='MAT.7.1.1,MAT.7.1.2,MAT.7.1.3,MAT.7.1.4')throw Error('MATH7_MANIFEST_SCOPE_MISMATCH');
 const norm=s=>s.replace(/&nbsp;|&#160;|&#xA0;/gi,' ').replace(/\s+/gu,' ').trim();
 const text=norm(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' '));
 for(const o of spec.outcomes)if(!text.includes(o.code+'. '+norm(o.title)))throw Error('MATH7_OFFICIAL_TEXT_MISMATCH:'+o.code);
 // Both representations belong here; rational does not mean only terminating.
 if(!text.includes('devirli')||!text.includes('mutlak değer')||!text.includes('sayı doğrusu'))throw Error('MATH7_SCOPE_GUIDANCE_MISSING');
 return {matchedCodes:spec.outcomes.map(o=>o.code),completeGrade:false,productionQualified:false};
}
export function math7Csv(spec){
 const cell=x=>'"'+String(x??'').replaceAll('"','""')+'"';
 return [['subject_code','grade_level','outcome_code','title','topic','unit','node_type'],...spec.outcomes.map(o=>['MAT',7,o.code,o.title,o.topic,'Sayılar ve Nicelikler (1)','OUTCOME'])].map(r=>r.map(cell).join(';')).join('\n');
}
