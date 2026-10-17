export function checkMath8Target2028(spec,html){
 if(spec?.academicYear!=='2027-2028'||spec.gradeLevel!==8||spec.programCode!=='SCHOOL'||spec.authority!=='MEB'||spec.programVersion!=='ANUNEX-TYMM-MAT8-THEME1-TARGET2028-20261017'||spec.sourceUrl!=='https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/472'||spec.outcomes.length!==4||spec.outcomes.map(o=>o.code).join(',')!=='MAT.8.1.1,MAT.8.1.2,MAT.8.1.3,MAT.8.1.4')throw Error('MATH8_TARGET_MANIFEST_MISMATCH');
 const norm=s=>s.replace(/&nbsp;|&#160;|&#xA0;/gi,' ').replace(/\s+/gu,' ').trim();
 const text=norm(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' '));
 for(const o of spec.outcomes)if(!text.includes(o.code+'. '+norm(o.title)))throw Error('MATH8_OFFICIAL_TEXT_MISMATCH:'+o.code);
 for(const phrase of ['Sayılar Ve Nicelikler','bilimsel gösterime girilmez','binde birler basamağına kadar','katsayıyı kök içine almaya yönelik çalışmalara değinilmeden','açık ve yarı açık'])if(!text.toLocaleLowerCase('tr-TR').includes(phrase.toLocaleLowerCase('tr-TR')))throw Error('MATH8_SCOPE_GUIDANCE_MISSING:'+phrase);
 return {matchedCodes:spec.outcomes.map(o=>o.code),targetAcademicYear:spec.academicYear,annualPlanVerified:false,exam2028ScopeVerified:false,completeGrade:false,productionQualified:false,contentVerification:'CURRENT_OFFICIAL_PROGRAM',targetYearMeaning:'ANUNEX_CONTENT_PLANNING'};
}
export function math8Csv(spec){
 const cell=x=>'"'+String(x??'').replaceAll('"','""')+'"';
 return [['subject_code','grade_level','outcome_code','title','topic','unit','node_type'],...spec.outcomes.map(o=>['MAT',8,o.code,o.title,o.topic,'Sayılar ve Nicelikler','OUTCOME'])].map(r=>r.map(cell).join(';')).join('\n');
}
