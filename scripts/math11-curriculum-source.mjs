// Current statistics theme; do not infer titles from older code numbering.
export function checkMath11Source(spec,html){
 if(spec.gradeLevel!==11||spec.academicYear!=='2026-2027'||spec.programCode!=='SCHOOL'||spec.authority!=='MEB'||spec.sourceUrl!=='https://tymm.meb.gov.tr/matematik-dersi/unite/298'||spec.outcomes.length!==2||spec.outcomes.map(o=>o.code).join(',')!=='MAT.11.1.1,MAT.11.1.2')throw Error('MATH11_MANIFEST_SCOPE_MISMATCH');
 const norm=s=>s.replace(/&nbsp;|&#160;|&#xA0;/gi,' ').replace(/\s+/gu,' ').trim();
 const text=norm(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' '));
 for(const o of spec.outcomes)if(!text.includes(o.code+'. '+norm(o.title)))throw Error('MATH11_OFFICIAL_TEXT_MISMATCH:'+o.code);
 if(!text.includes('İstatistiksel Araştırma Süreci')||!text.includes('korelasyon katsayısı')||!text.includes('neden-sonuç ilişkisi olduğu anlamına gelmez'))throw Error('MATH11_SCOPE_GUIDANCE_MISSING');
 return {matchedCodes:spec.outcomes.map(o=>o.code),completeGrade:false,productionQualified:false};
}
export function math11Csv(spec){
 const cell=x=>'"'+String(x??'').replaceAll('"','""')+'"';
 return [['subject_code','grade_level','outcome_code','title','topic','unit','node_type'],...spec.outcomes.map(o=>['MAT',11,o.code,o.title,o.topic,'İstatistiksel Araştırma Süreci','OUTCOME'])].map(r=>r.map(cell).join(';')).join('\n');
}
