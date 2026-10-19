export function checkMath12Target2028(spec,html){
 if(spec?.academicYear!=='2027-2028'||spec.gradeLevel!==12||spec.programCode!=='SCHOOL'||spec.authority!=='MEB'||spec.programVersion!=='ANUNEX-TYMM-MAT12-THEME1-TARGET2028-20261017'||spec.sourceUrl!=='https://tymm.meb.gov.tr/matematik-dersi/unite/305'||spec.outcomes.length!==2||spec.outcomes.map(o=>o.code).join(',')!=='MAT.12.1.1,MAT.12.1.2')throw Error('MATH12_TARGET_MANIFEST_MISMATCH');
 const norm=s=>s.replace(/&nbsp;|&#160;|&#xA0;/gi,' ').replace(/\s+/gu,' ').trim();
 const text=norm(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' '));
 for(const o of spec.outcomes)if(!text.includes(o.code+'. '+norm(o.title)))throw Error('MATH12_OFFICIAL_TEXT_MISMATCH:'+o.code);
 for(const phrase of ['Nicelikler Ve Değişimler (1)','sonlu toplamlarına','cebirsel olarak ispat','tanım kümesi pozitif tam sayılar'])if(!text.toLocaleLowerCase('tr-TR').includes(phrase.toLocaleLowerCase('tr-TR')))throw Error('MATH12_SCOPE_GUIDANCE_MISSING:'+phrase);
 return {matchedCodes:spec.outcomes.map(o=>o.code),targetAcademicYear:spec.academicYear,annualPlanVerified:false,exam2028ScopeVerified:false,completeGrade:false,productionQualified:false,contentVerification:'CURRENT_OFFICIAL_PROGRAM',targetYearMeaning:'ANUNEX_CONTENT_PLANNING'};
}
export function math12Csv(spec){
 const cell=x=>'"'+String(x??'').replaceAll('"','""')+'"';
 return [['subject_code','grade_level','outcome_code','title','topic','unit','node_type'],...spec.outcomes.map(o=>['MAT',12,o.code,o.title,o.topic,'Nicelikler ve Değişimler (1)','OUTCOME'])].map(r=>r.map(cell).join(';')).join('\n');
}
