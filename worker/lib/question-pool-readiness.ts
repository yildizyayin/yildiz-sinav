import type {Env} from '../types';
import {all,json,badRequest} from './db';
import catalog from '../../data/question-full-math-target-2028.json';
export function summarizePoolReadiness(year:string,versions:any[],rows:any[],counts:any[],campaigns:any[]){
 const grades=catalog.grades.map(g=>{
  const label=`ANUNEX-TYMM-MAT${g.grade}-ALLTHEMES-TARGET2028-20261019`;
  const version=versions.find(v=>v.academic_year===year&&v.grade_level===g.grade&&v.program_code==='SCHOOL'&&v.program_version===label&&v.verified===1&&v.authority==='MEB'&&v.source_url===g.indexUrl);
  const found=version?rows.filter(r=>r.version_id===version.id):[];
  const fullProgramImported=year===catalog.academicYear&&!!version&&found.length===g.outcomes.length&&g.outcomes.every(o=>found.some(r=>r.code===o.code&&r.title===o.title&&r.active===1&&r.official===1&&r.node_active===1&&r.node_grade===g.grade&&r.node_year===year));
  const approvedLinkedQuestions=Number(counts.find(c=>c.version_id===version?.id)?.n??0);
  return {grade:g.grade,versionId:version?.id??null,expectedThemes:g.themes.length,expectedOutcomes:g.outcomes.length,observedOutcomes:found.length,fullProgramImported,approvedLinkedQuestions,proofScope:g.grade<7?'BOUNDED_SUBCASES':g.grade===7?'BOUNDED_RATIONAL_COMPARISON':'SUBJECT_SPECIFIC_PROOF_REQUIRED',blockers:[...(!fullProgramImported?['CURRICULUM_IMPORT_REQUIRED']:[]),...(!approvedLinkedQuestions?['APPROVED_QUESTIONS_REQUIRED']:[]),'END_TO_END_QUALITY_QUALIFICATION_REQUIRED']};
 });
 return {ok:true,academicYear:year,asOf:new Date().toISOString(),subject:'MAT',scope:'CURRENT_OFFICIAL_OUTCOME_HEADINGS',grades,campaigns,summary:{importedGrades:grades.filter(g=>g.fullProgramImported).length,totalGrades:grades.length,expectedOutcomes:grades.reduce((n,g)=>n+g.expectedOutcomes,0),observedOutcomes:grades.reduce((n,g)=>n+g.observedOutcomes,0),approvedLinkedQuestions:grades.reduce((n,g)=>n+g.approvedLinkedQuestions,0)},capabilities:{fullMathProgramImported:grades.every(g=>g.fullProgramImported),allSubjectsVerified:false,processComponentsImported:false,exam2028ScopeVerified:false,massProductionReady:false,richVisualProductionQualified:false},note:'Bu ekran seçilen yılın matematik programı kayıtlarını ve bunlara bağlı onaylı soruları sayar. Müfredat aktarımı üretim kalitesi değildir; diğer branşlar, süreç bileşenleri, sınav kapsamı ve kapasite ayrıca doğrulanır.'};
}
export async function questionPoolReadiness(request:Request,env:Env){
 const year=new URL(request.url).searchParams.get('academicYear')||'2027-2028',m=/^(\d{4})-(\d{4})$/.exec(year);if(!m||Number(m[2])!==Number(m[1])+1)return badRequest('Geçerli eğitim yılı seçin.','INVALID_ACADEMIC_YEAR');
 const [versions,rows,counts,campaigns]=await Promise.all([
  all<any>(env.DB.prepare("SELECT id,academic_year,grade_level,program_code,program_version,verified,authority,source_url FROM curriculum_versions WHERE academic_year=? AND program_code='SCHOOL'").bind(year)),
  all<any>(env.DB.prepare("SELECT cv.id version_id,o.code,o.title,o.active,o.official,n.active node_active,n.grade_level node_grade,n.academic_year node_year FROM curriculum_versions cv JOIN outcomes o ON o.curriculum_version_id=cv.id LEFT JOIN learning_nodes n ON n.id='ln_'||o.id WHERE cv.academic_year=? AND cv.program_code='SCHOOL'").bind(year)),
  all<any>(env.DB.prepare("SELECT cv.id version_id,count(DISTINCT q.id) n FROM curriculum_versions cv JOIN outcomes o ON o.curriculum_version_id=cv.id JOIN learning_nodes n ON n.id='ln_'||o.id AND n.active=1 AND n.academic_year=cv.academic_year AND n.grade_level=cv.grade_level JOIN question_learning_links l ON l.node_id=n.id JOIN question_bank q ON q.id=l.question_id AND q.academic_year=cv.academic_year AND q.grade_level=cv.grade_level AND q.subject_id=o.subject_id WHERE cv.academic_year=? AND cv.verified=1 AND o.active=1 AND o.official=1 AND q.owner_type='PLATFORM' AND q.review_status='APPROVED' AND q.copyright_status IN ('OWNED','LICENSED','PUBLIC_DOMAIN') GROUP BY cv.id").bind(year)),
  all<any>(env.DB.prepare('SELECT id,academic_year,status,reserved_questions,target_accepted FROM question_production_campaigns WHERE academic_year=? ORDER BY id').bind(year)),
 ]);
 return json(summarizePoolReadiness(year,versions,rows,counts,campaigns));
}
