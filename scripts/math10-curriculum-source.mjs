// Pin current page codes/title pairs: do not mix older PDF theme numbering.
export function checkMath10Source(spec,html){
 if(spec.gradeLevel!==10||spec.academicYear!=='2026-2027'||spec.programCode!=='SCHOOL'||spec.authority!=='MEB'||spec.sourceUrl!=='https://tymm.meb.gov.tr/matematik-dersi/unite/260'||spec.outcomes.length!==4||spec.outcomes.map(o=>o.code).join(',')!=='MAT.10.1.1,MAT.10.1.2,MAT.10.1.3,MAT.10.1.4')throw Error('MATH10_MANIFEST_SCOPE_MISMATCH');
 const norm=s=>s.replace(/&nbsp;|&#160;|&#xA0;/gi,' ').replace(/\s+/gu,' ').trim();
 const text=norm(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' '));
 for(const o of spec.outcomes)if(!text.includes(o.code+'. '+norm(o.title)))throw Error('MATH10_OFFICIAL_TEXT_MISMATCH:'+o.code);
 if(!text.includes('Geometrik Şekiller')||!text.includes('birim çember')||!text.includes('Pisagor teoremi'))throw Error('MATH10_SCOPE_GUIDANCE_MISSING');
 return {matchedCodes:spec.outcomes.map(o=>o.code),completeGrade:false,productionQualified:false};
}
export function math10Csv(spec){
 const cell=x=>'"'+String(x??'').replaceAll('"','""')+'"';
 return [['subject_code','grade_level','outcome_code','title','topic','unit','node_type'],...spec.outcomes.map(o=>['MAT',10,o.code,o.title,o.topic,'Geometrik Şekiller','OUTCOME'])].map(r=>r.map(cell).join(';')).join('\n');
}
