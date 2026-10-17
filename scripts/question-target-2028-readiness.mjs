/** Describes observed database state; never turns source coverage into quality. */
export function targetReadiness(spec,versions,rows,approvedQuestions){
 const version=versions.find(v=>v.academic_year===spec.academicYear&&v.grade_level===spec.gradeLevel&&v.program_code==='SCHOOL'&&v.program_version===spec.programVersion&&v.verified===1&&v.authority==='MEB'&&v.source_url===spec.sourceUrl);
 const observed=version?rows.filter(r=>r.version_id===version.id):[];
 const imported=!!version&&observed.length===spec.outcomes.length&&spec.outcomes.every(o=>observed.some(r=>r.code===o.code&&r.title===o.title&&r.official===1&&r.active===1&&r.node_active===1&&r.node_grade===spec.gradeLevel&&r.node_year===spec.academicYear));
 return {grade:spec.gradeLevel,subject:'MAT',academicYear:spec.academicYear,versionId:version?.id??null,expectedFirstThemeOutcomes:spec.outcomes.length,observedOutcomes:observed.length,firstThemeImported:imported,approvedLinkedQuestions:approvedQuestions,proofScope:spec.gradeLevel<=6?'BOUNDED_SUBCASES':spec.gradeLevel===7?'BOUNDED_RATIONAL_COMPARISON_ONLY':'SUBJECT_SPECIFIC_PROOF_REQUIRED',fullCurriculumVerified:false,exam2028ScopeVerified:false,massProductionReady:false};
}
