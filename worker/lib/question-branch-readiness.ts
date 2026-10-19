import type {Env} from '../types';
import {all,json,badRequest} from './db';
import registry from '../../data/app-question-scope-2028.json';
const hash=async(value:unknown)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(n=>n.toString(16).padStart(2,'0')).join('');
export async function summarizeBranchReadiness(year:string,environment:string,versions:any[],rows:any[],counts:any[]){
 const selected=year===registry.academicYear?registry.programs:[];
 const programs=await Promise.all(selected.map(async expected=>{
  const version=versions.find(v=>v.academic_year===year&&v.grade_level===expected.grade&&v.program_version===expected.programVersion&&v.program_code==='SCHOOL'&&v.verified===1&&v.authority==='MEB'&&v.source_url===expected.sourceUrl);
  const observed=version?rows.filter(r=>r.version_id===version.id):[];
  const content=observed.map(r=>JSON.stringify([r.code,r.title,r.unit??null])).sort();
  const imported=!!version&&observed.length===expected.outcomeCount&&observed.every(r=>r.subject_code===expected.subjectCode&&r.grade_level===expected.grade&&r.active===1&&r.official===1&&r.node_active===1&&r.node_year===year&&r.node_grade===expected.grade)&&await hash(content)===expected.contentHash;
  return {...expected,imported,observedOutcomes:observed.length,versionId:version?.id??null};
 }));
 const groups=new Map<string,any>();for(const p of programs){const key=p.subjectCode+':'+p.grade;const g=groups.get(key)||{subject:p.subjectCode,grade:p.grade,expectedVersions:0,importedVersions:0,expectedOutcomes:0,observedOutcomes:0};g.expectedVersions++;g.importedVersions+=Number(p.imported);g.expectedOutcomes+=p.outcomeCount;g.observedOutcomes+=p.observedOutcomes;groups.set(key,g);}
 const subjects=[...groups.values()].map(g=>({...g,imported:g.expectedVersions===g.importedVersions,approvedQuestions:Number(counts.find(c=>c.subject_code===g.subject&&c.grade_level===g.grade)?.n??0)})).sort((a,b)=>a.grade-b.grade||a.subject.localeCompare(b.subject));
 return {ok:true,academicYear:year,environment,targetAcademicYear:registry.academicYear,asOf:new Date().toISOString(),subjects,sourceIssues:year===registry.academicYear?registry.blocked:[],summary:{expectedVersions:programs.length,importedVersions:programs.filter(p=>p.imported).length,expectedOutcomes:programs.reduce((n,p)=>n+p.outcomeCount,0),observedOutcomes:programs.reduce((n,p)=>n+p.observedOutcomes,0),verifiedSubjectGrades:subjects.filter(g=>g.imported).length},capabilities:{massProductionReady:false,exam2028ScopeVerified:false,openEndedProductionQualified:false},note:'Kapsam, bu ortamın kendi kayıtlarıyla karşılaştırılır. Tema bağlamları ayrı sayılır. Müfredat aktarımı soru kalitesi veya üretimin çalıştığı anlamına gelmez.'};
}
export async function questionBranchReadiness(request:Request,env:Env){
 const year=new URL(request.url).searchParams.get('academicYear')||registry.academicYear,m=/^(\d{4})-(\d{4})$/.exec(year);if(!m||Number(m[2])!==Number(m[1])+1)return badRequest('Geçerli eğitim yılı seçin.','INVALID_ACADEMIC_YEAR');
 const labels=registry.programs.map(p=>p.programVersion),marks=labels.map(()=>'?').join(',');
 const [versions,rows,counts]=await Promise.all([
  all<any>(env.DB.prepare(`SELECT id,academic_year,grade_level,program_version,program_code,verified,authority,source_url FROM curriculum_versions WHERE academic_year=? AND program_version IN (${marks})`).bind(year,...labels)),
  all<any>(env.DB.prepare(`SELECT cv.id version_id,o.code,o.title,o.unit,o.grade_level,o.active,o.official,s.code subject_code,n.active node_active,n.academic_year node_year,n.grade_level node_grade FROM curriculum_versions cv JOIN outcomes o ON o.curriculum_version_id=cv.id JOIN subjects s ON s.id=o.subject_id LEFT JOIN learning_nodes n ON n.id='ln_'||o.id WHERE cv.academic_year=? AND cv.program_version IN (${marks})`).bind(year,...labels)),
  all<any>(env.DB.prepare(`SELECT s.code subject_code,cv.grade_level,count(DISTINCT q.id) n FROM curriculum_versions cv JOIN outcomes o ON o.curriculum_version_id=cv.id JOIN subjects s ON s.id=o.subject_id JOIN learning_nodes n ON n.id='ln_'||o.id AND n.active=1 AND n.academic_year=cv.academic_year AND n.grade_level=cv.grade_level JOIN question_learning_links l ON l.node_id=n.id JOIN question_bank q ON q.id=l.question_id AND q.academic_year=cv.academic_year AND q.grade_level=cv.grade_level AND q.subject_id=o.subject_id WHERE cv.academic_year=? AND cv.program_version IN (${marks}) AND cv.verified=1 AND o.active=1 AND o.official=1 AND q.owner_type='PLATFORM' AND q.review_status='APPROVED' AND q.copyright_status IN ('OWNED','LICENSED','PUBLIC_DOMAIN') GROUP BY s.code,cv.grade_level`).bind(year,...labels)),
 ]);return json(await summarizeBranchReadiness(year,env.ENVIRONMENT||'unknown',versions,rows,counts));
}
