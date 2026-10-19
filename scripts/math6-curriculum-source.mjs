// Pinned first-theme source check; this is neither a general crawler nor an
// attestation of the whole grade/year curriculum. HTML formatting is normalized.
export function checkMath6Source(spec,html){
 if(spec.gradeLevel!==6||spec.academicYear!=='2026-2027'||spec.programCode!=='SCHOOL'||spec.authority!=='MEB'||spec.sourceUrl!=='https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/456'||spec.outcomes.length!==4||spec.outcomes.map(o=>o.code).join(',')!=='MAT.6.1.1,MAT.6.1.2,MAT.6.1.3,MAT.6.1.4')throw Error('MATH6_MANIFEST_SCOPE_MISMATCH');
 const norm=s=>s.replace(/&nbsp;|&#160;|&#xA0;/gi,' ').replace(/\s+/gu,' ').trim();
 const text=norm(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' '));
 for(const o of spec.outcomes)if(!text.includes(o.code+'. '+norm(o.title)))throw Error('MATH6_OFFICIAL_TEXT_MISMATCH:'+o.code);
 if(!text.includes('EBOB')||!text.includes('EKOK')||!text.includes('kavramlarına değinilmez'))throw Error('MATH6_SCOPE_RESTRICTION_MISSING');
 return {matchedCodes:spec.outcomes.map(o=>o.code),completeGrade:false,productionQualified:false};
}
export function math6Csv(spec){
 const cell=x=>'"'+String(x??'').replaceAll('"','""')+'"';
 return [['subject_code','grade_level','outcome_code','title','topic','unit','node_type'],...spec.outcomes.map(o=>['MAT',6,o.code,o.title,o.topic,'Sayılar ve Nicelikler (1)','OUTCOME'])].map(r=>r.map(cell).join(';')).join('\n');
}
