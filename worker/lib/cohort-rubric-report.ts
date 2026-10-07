import type {AuthUser,Env} from '../types';
import {all,forbidden,json,one} from './db';
import {validateRubricCriteria} from './maarif-rubric-registry';
type ClassScope={id:string;seasonId:string;academicYear:string};
const fail=(code:string,message:string,status=400)=>json({ok:false,error:{code,message}},status);

export async function cohortRubricReport(env:Env,user:AuthUser,url:URL,classScope?:ClassScope){
 if(classScope?user.role!=='GUIDANCE_TEACHER':!['SUPER_ADMIN','INSTITUTION_MANAGER'].includes(user.role))return forbidden();
 const institutionId=user.role==='SUPER_ADMIN'?url.searchParams.get('institutionId'):user.institution_id;
 const year=url.searchParams.get('academicYear')||'',policy=url.searchParams.get('observationPolicy')||'LATEST';
 const fromDate=url.searchParams.get('fromDate')||'',toDate=url.searchParams.get('toDate')||'';
 const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 if(!institutionId||!/^\d{4}-\d{4}$/.test(year)||Number(year.slice(5))!==Number(year.slice(0,4))+1||!['LATEST','ALL'].includes(policy)||(fromDate||toDate)&&(!validDate(fromDate)||!validDate(toDate)||fromDate>toDate||fromDate.slice(0,4)<year.slice(0,4)||toDate.slice(0,4)>year.slice(5)))return fail('REPORT_SELECTION_INVALID','Eğitim yılı, gözlem politikası ve varsa tarih aralığını kontrol edin.');
 if(!await one(env.DB.prepare("SELECT id FROM institutions WHERE id=? AND status='ACTIVE'").bind(institutionId)))return forbidden();
 if(classScope&&(year!==classScope.academicYear||!await one(env.DB.prepare(`SELECT c.id FROM classes c JOIN institution_seasons se ON se.id=c.season_id AND se.institution_id=c.institution_id AND se.status='ACTIVE' WHERE c.id=? AND c.institution_id=? AND c.season_id=? AND c.active=1 AND se.academic_year=? AND EXISTS(SELECT 1 FROM teacher_assignments ta WHERE ta.user_id=? AND ta.institution_id=c.institution_id AND ta.season_id=c.season_id AND ta.class_id=c.id AND ta.assignment_type='GUIDANCE' AND ta.active=1)`).bind(classScope.id,institutionId,classScope.seasonId,year,user.id))))return forbidden();
 const rows=await all<any>(env.DB.prepare(`SELECT obs.*,c.name class_name FROM learning_rubric_observations obs JOIN student_enrollments e ON e.id=obs.enrollment_id AND e.student_id=obs.student_id AND e.institution_id=obs.institution_id AND e.season_id=obs.season_id JOIN institution_seasons se ON se.id=obs.season_id AND se.institution_id=obs.institution_id LEFT JOIN classes c ON c.id=obs.class_id AND c.institution_id=obs.institution_id AND c.season_id=obs.season_id WHERE obs.institution_id=? AND se.academic_year=? AND NOT EXISTS(SELECT 1 FROM learning_rubric_observation_withdrawals w WHERE w.observation_id=obs.id) ${fromDate?'AND date(obs.observed_at)>=? AND date(obs.observed_at)<=?':''} ${classScope?"AND obs.class_id=? AND obs.season_id=? AND e.class_id=obs.class_id AND e.status='ACTIVE'":''} ORDER BY obs.observed_at DESC,obs.id DESC LIMIT 5001`).bind(institutionId,year,...(fromDate?[fromDate,toDate]:[]),...(classScope?[classScope.id,classScope.seasonId]:[])));
 if(rows.length>5000)return fail('REPORT_SCOPE_TOO_LARGE','Gözlem sayısı 5.000 sınırını aşıyor. Tarih aralığını daraltın.');
 const groups=new Map<string,any>(),seen=new Set<string>(),signatures=new Map<string,string>();let excludedObservations=0,repeatedObservations=0,usedObservations=0;
 for(const row of rows){
  let snapshot:any,selections:any[],criteria:any[];
  try{snapshot=JSON.parse(row.snapshot_json);selections=JSON.parse(row.selections_json);if(snapshot?.schemaVersion!==1||snapshot.rubricId!==row.rubric_id||snapshot.academicYear!==year||snapshot.subjectId!==row.subject_id||typeof snapshot.curriculumVersionId!=='string'||!snapshot.curriculumVersionId||!['OFFICIAL','TEACHER_DESIGNED'].includes(snapshot.sourceKind))throw new Error();criteria=validateRubricCriteria(snapshot.criteria);if(!Array.isArray(selections)||selections.length!==criteria.length||criteria.some(c=>{const matches=selections.filter(s=>s?.criterionId===c.id);return matches.length!==1||!c.levels.some((l:any)=>l.id===matches[0].levelId)}))throw new Error();}catch{excludedObservations++;continue;}
  const signature=JSON.stringify([snapshot.title,snapshot.versionLabel,snapshot.sourceKind,snapshot.curriculumVersionId,snapshot.subjectId,snapshot.outcomeId,snapshot.outcomeCode,snapshot.outcomeTitle,snapshot.componentCode,snapshot.componentTitle,snapshot.taskInstructions,snapshot.sourceUrl,snapshot.sourceTitle,snapshot.sourceLocator,snapshot.componentSourceUrl,snapshot.componentSourceLocator,criteria]);
  if(signatures.has(row.rubric_id)&&signatures.get(row.rubric_id)!==signature)return fail('RUBRIC_SNAPSHOT_CONFLICT','Aynı rubrik sürümünün kanıt tanımları uyuşmuyor. Rapor hazırlanmadı.',409);
  signatures.set(row.rubric_id,signature);
  const studentRubric=JSON.stringify([row.enrollment_id,row.rubric_id]);
  if(policy==='LATEST'&&seen.has(studentRubric)){repeatedObservations++;continue;}seen.add(studentRubric);usedObservations++;
  for(const c of criteria){
   const key=JSON.stringify([row.class_id,row.rubric_id,snapshot.curriculumVersionId,c.id]);
   let g=groups.get(key);if(!g){g={classId:row.class_id,className:row.class_name,rubricId:row.rubric_id,rubricTitle:snapshot.title,versionLabel:snapshot.versionLabel,sourceKind:snapshot.sourceKind,curriculumVersionId:snapshot.curriculumVersionId,academicYear:year,outcomeCode:snapshot.outcomeCode,componentCode:snapshot.componentCode,criterionId:c.id,criterionTitle:c.title,criterionDescription:c.description,observationCount:0,students:new Set<string>(),levels:c.levels.map((l:any)=>({...l,count:0}))};groups.set(key,g)}
   const selected=selections.find(s=>s.criterionId===c.id)!;g.levels.find((l:any)=>l.id===selected.levelId).count++;g.observationCount++;g.students.add(row.enrollment_id);
  }
 }
 if(groups.size>500)return fail('REPORT_SCOPE_TOO_LARGE','Rubrik ölçüt grubu sayısı 500 sınırını aşıyor. Tarih aralığını daraltın.');
 return json({ok:true,academicYear:year,policy:policy==='LATEST'?'LATEST_VALID_OBSERVATION_PER_ENROLLMENT_RUBRIC_V1':'ALL_VALID_OBSERVATIONS_V1',dateRange:fromDate?{fromDate,toDate}:null,coverage:{rowCount:rows.length,usedObservations,excludedObservations,repeatedObservations},groups:[...groups.values()].map(({students,...g})=>({...g,participatingEnrollmentCount:students.size,levels:g.levels.map((l:any)=>({...l,percent:g.observationCount?Math.round(l.count/g.observationCount*10000)/100:null}))})),officialScore:null,abilityScore:null,message:policy==='LATEST'?'Her dönem kaydı ve rubrik sürümü için seçilen aralıktaki son geçerli gözlem kullanılır. Farklı rubrik sürümleri ayrı tutulur. Düzey dağılımı resmî beceri puanı değildir.':'Seçilen aralıktaki tüm geçerli gözlemler sayılır; bir öğrencinin tekrar gözlemleri dağılıma birden fazla katkı verir. Düzey dağılımı resmî beceri puanı değildir.'});
}
