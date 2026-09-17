import answerApp from './answer-correctness-entry';
import type { AuthUser, Env } from './types';
import { getAuthUser } from './lib/auth';
import { all, forbidden, json, notFound, one } from './lib/db';
import { loadPermissionScope } from './lib/permissions';
import { masteryStatus } from './lib/outcome';

function apiError(status:number,code:string,message:string,details?:unknown){return json({ok:false,error:{code,message,details}},status)}
async function requireUser(env:Env,request:Request){const user=await getAuthUser(env,request);return user||apiError(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.')}

type StudentAccess={allowed:boolean;student:any|null;subjectFilter:string[]|null;restricted:boolean};

async function studentAccess(env:Env,user:AuthUser,studentId:string):Promise<StudentAccess>{
  const params:any[]=[studentId];let instFilter='';
  if(user.institution_id&&['INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role)){instFilter=' AND e.institution_id=?';params.push(user.institution_id)}
  const student=await one<any>(env.DB.prepare(`SELECT s.id,s.first_name,s.last_name,s.status,e.institution_id,e.season_id,e.class_id,e.student_number,e.grade_level,e.section,c.name class_name,i.name institution_name
    FROM student_entities s JOIN student_enrollments e ON e.student_id=s.id LEFT JOIN classes c ON c.id=e.class_id LEFT JOIN institutions i ON i.id=e.institution_id
    WHERE s.id=? ${instFilter}
    ORDER BY CASE WHEN e.status='ACTIVE' THEN 0 ELSE 1 END,e.created_at DESC LIMIT 1`).bind(...params));
  if(!student||student.status!=='ACTIVE')return {allowed:false,student:null,subjectFilter:null,restricted:false};
  if(user.role==='SUPER_ADMIN')return {allowed:true,student,subjectFilter:null,restricted:false};
  if(user.role==='INSTITUTION_MANAGER')return {allowed:user.institution_id===student.institution_id,student,subjectFilter:null,restricted:false};
  if(user.role==='STUDENT')return {allowed:user.student_id===studentId,student,subjectFilter:null,restricted:false};
  if(user.role==='PARENT'){
    const link=await one(env.DB.prepare('SELECT id FROM parent_student_links WHERE parent_user_id=? AND student_id=? AND active=1').bind(user.id,studentId));
    return {allowed:Boolean(link),student,subjectFilter:null,restricted:false};
  }
  if(user.role==='TEACHER'||user.role==='GUIDANCE_TEACHER'){
    if(!student.class_id)return {allowed:false,student,subjectFilter:null,restricted:false};
    const scope=await loadPermissionScope(env.DB,user,student.season_id);
    if(scope.guidanceClassIds.includes(student.class_id))return {allowed:true,student,subjectFilter:null,restricted:false};
    const subjects=scope.subjectClassAssignments.filter(a=>a.classId===student.class_id).map(a=>a.subjectId);
    return {allowed:subjects.length>0,student,subjectFilter:subjects,restricted:true};
  }
  return {allowed:false,student,subjectFilter:null,restricted:false};
}

async function currentSeason(env:Env,institutionId:string,requested?:string|null){if(requested){const s=await one<any>(env.DB.prepare('SELECT id,academic_year FROM institution_seasons WHERE id=? AND institution_id=?').bind(requested,institutionId));if(s)return s}return one<any>(env.DB.prepare(`SELECT id,academic_year FROM institution_seasons WHERE institution_id=? ORDER BY CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END,academic_year DESC LIMIT 1`).bind(institutionId))}

async function listStudents(env:Env,user:AuthUser,url:URL):Promise<Response>{
  if(user.role==='STUDENT'){
    if(!user.student_id)return json({ok:true,students:[]});const access=await studentAccess(env,user,user.student_id);return json({ok:true,students:access.allowed?[access.student]:[]});
  }
  if(user.role==='PARENT'){
    const rows=await all<any>(env.DB.prepare(`SELECT DISTINCT s.id,s.first_name,s.last_name,e.student_number,e.grade_level,e.section,c.name class_name,i.name institution_name
      FROM parent_student_links p JOIN student_entities s ON s.id=p.student_id JOIN student_enrollments e ON e.student_id=s.id LEFT JOIN classes c ON c.id=e.class_id LEFT JOIN institutions i ON i.id=e.institution_id
      WHERE p.parent_user_id=? AND p.active=1 AND s.status='ACTIVE' AND e.status='ACTIVE' ORDER BY s.last_name,s.first_name`).bind(user.id));return json({ok:true,students:rows});
  }
  const institutionId=user.role==='SUPER_ADMIN'?url.searchParams.get('institutionId'):user.institution_id;if(!institutionId)return apiError(400,'INSTITUTION_REQUIRED','Kurum seçilmelidir.');
  if(user.role!=='SUPER_ADMIN'&&user.institution_id!==institutionId)return forbidden();
  const season=await currentSeason(env,institutionId,url.searchParams.get('seasonId'));if(!season)return json({ok:true,students:[],season:null});
  const params:any[]=[institutionId,season.id];let classFilter='';
  if(user.role==='TEACHER'||user.role==='GUIDANCE_TEACHER'){
    const scope=await loadPermissionScope(env.DB,user,season.id);const classes=[...new Set([...scope.classIds,...scope.guidanceClassIds])];if(!classes.length)return json({ok:true,students:[],season});classFilter=` AND e.class_id IN (${classes.map(()=>'?').join(',')})`;params.push(...classes)
  }
  const rows=await all<any>(env.DB.prepare(`SELECT DISTINCT s.id,s.first_name,s.last_name,e.student_number,e.grade_level,e.section,c.name class_name,i.name institution_name
    FROM student_entities s JOIN student_enrollments e ON e.student_id=s.id LEFT JOIN classes c ON c.id=e.class_id LEFT JOIN institutions i ON i.id=e.institution_id
    WHERE e.institution_id=? AND e.season_id=? AND e.status='ACTIVE' AND s.status='ACTIVE' ${classFilter}
    ORDER BY e.grade_level,e.section,cast(e.student_number as integer),s.normalized_name LIMIT 2000`).bind(...params));
  return json({ok:true,students:rows,season});
}

function placeholders(items:string[]){return items.map(()=>'?').join(',')}

async function combinedReport(env:Env,user:AuthUser,studentId:string,url:URL):Promise<Response>{
  const access=await studentAccess(env,user,studentId);if(!access.allowed||!access.student)return forbidden('Bu öğrenci için birleşik rapor erişiminiz bulunmuyor.');
  const examParams:any[]=[studentId];let examAccessSql='';
  if(access.subjectFilter?.length){examAccessSql=` AND EXISTS (SELECT 1 FROM subject_results sr2 WHERE sr2.participant_id=ep.id AND sr2.subject_id IN (${placeholders(access.subjectFilter)}))`;examParams.push(...access.subjectFilter)}
  const allExams=await all<any>(env.DB.prepare(`SELECT e.id exam_id,e.title,e.exam_date,e.exam_type,er.correct_count,er.wrong_count,er.blank_count,er.net,er.score,er.success_percent,er.institution_rank,ep.booklet_code
    FROM exam_participants ep JOIN exams e ON e.id=ep.exam_id JOIN exam_results er ON er.participant_id=ep.id
    WHERE ep.student_id=? ${examAccessSql} ORDER BY coalesce(e.exam_date,er.created_at) DESC LIMIT 100`).bind(...examParams));
  const availableIds=new Set(allExams.map(x=>String(x.exam_id)));const requested=(url.searchParams.get('examIds')||'').split(',').map(x=>x.trim()).filter(Boolean);const selectedIds=(requested.length?requested.filter(x=>availableIds.has(x)):allExams.slice(0,20).map(x=>String(x.exam_id)));
  if(!selectedIds.length)return json({ok:true,student:access.student,restrictedToSubjects:access.restricted,availableExams:allExams,selectedExamIds:[],exams:[],subjectTrend:[],subjectSummary:[],outcomes:[],developing:[],strong:[],summary:null});
  const examSet=new Set(selectedIds);const selectedExams=allExams.filter(x=>examSet.has(String(x.exam_id)));
  const examSql=placeholders(selectedIds);const subjectParams:any[]=[studentId,...selectedIds];let subjectFilterSql='';if(access.subjectFilter?.length){subjectFilterSql=` AND sr.subject_id IN (${placeholders(access.subjectFilter)})`;subjectParams.push(...access.subjectFilter)}
  const subjectTrend=await all<any>(env.DB.prepare(`SELECT e.id exam_id,e.title,e.exam_date,s.id subject_id,s.code subject_code,s.name subject_name,sr.correct_count,sr.wrong_count,sr.blank_count,sr.net,sr.success_percent
    FROM exam_participants ep JOIN exams e ON e.id=ep.exam_id JOIN subject_results sr ON sr.participant_id=ep.id JOIN subjects s ON s.id=sr.subject_id
    WHERE ep.student_id=? AND ep.exam_id IN (${examSql}) ${subjectFilterSql}
    ORDER BY s.name,coalesce(e.exam_date,e.created_at),e.title`).bind(...subjectParams));
  const outcomeParams:any[]=[studentId,...selectedIds];let outcomeFilterSql='';if(access.subjectFilter?.length){outcomeFilterSql=` AND o.subject_id IN (${placeholders(access.subjectFilter)})`;outcomeParams.push(...access.subjectFilter)}
  const outcomeRaw=await all<any>(env.DB.prepare(`SELECT o.id outcome_id,o.code,o.topic,o.subtopic,o.title,s.id subject_id,s.name subject_name,sum(r.evidence_count) evidence_count,sum(r.correct_count) correct_count
    FROM outcome_results r JOIN outcomes o ON o.id=r.outcome_id JOIN subjects s ON s.id=o.subject_id
    WHERE r.student_id=? AND r.exam_id IN (${examSql}) ${outcomeFilterSql}
    GROUP BY o.id,o.code,o.topic,o.subtopic,o.title,s.id,s.name ORDER BY s.name,o.topic,o.title`).bind(...outcomeParams));
  const outcomes=outcomeRaw.map(o=>{const evidence=Number(o.evidence_count||0),correct=Number(o.correct_count||0),rate=evidence?correct/evidence:0;return {...o,evidence_count:evidence,correct_count:correct,success_rate:rate,mastery_status:masteryStatus(correct,evidence)}});
  const subjectGroups=new Map<string,any[]>();for(const row of subjectTrend){if(!subjectGroups.has(row.subject_id))subjectGroups.set(row.subject_id,[]);subjectGroups.get(row.subject_id)!.push(row)}
  const subjectSummary=[...subjectGroups.values()].map(rows=>{const ordered=[...rows].sort((a,b)=>String(a.exam_date||'').localeCompare(String(b.exam_date||'')));const first=ordered[0],last=ordered.at(-1);const avg=rows.reduce((s,r)=>s+Number(r.net||0),0)/rows.length;return {subject_id:first.subject_id,subject_name:first.subject_name,exam_count:rows.length,first_net:Number(first.net||0),last_net:Number(last?.net||0),delta_net:Number((Number(last?.net||0)-Number(first.net||0)).toFixed(4)),average_net:Number(avg.toFixed(4))}});
  let summary:any=null;let examsForClient=selectedExams;
  if(access.restricted){examsForClient=selectedExams.map(({correct_count,wrong_count,blank_count,net,score,success_percent,institution_rank,...rest})=>rest)}else{const chronological=[...selectedExams].sort((a,b)=>String(a.exam_date||'').localeCompare(String(b.exam_date||'')));const first=chronological[0],last=chronological.at(-1);const avg=selectedExams.reduce((s,e)=>s+Number(e.net||0),0)/selectedExams.length;summary={exam_count:selectedExams.length,first_net:Number(first?.net||0),last_net:Number(last?.net||0),delta_net:Number((Number(last?.net||0)-Number(first?.net||0)).toFixed(4)),average_net:Number(avg.toFixed(4)),latest_rank:last?.institution_rank||null}}
  return json({ok:true,student:access.student,restrictedToSubjects:access.restricted,availableExams:allExams.map(e=>access.restricted?{exam_id:e.exam_id,title:e.title,exam_date:e.exam_date,exam_type:e.exam_type}:e),selectedExamIds:selectedIds,exams:examsForClient,summary,subjectTrend,subjectSummary,outcomes,developing:outcomes.filter(o=>o.mastery_status==='DEVELOPING').sort((a,b)=>a.success_rate-b.success_rate),strong:outcomes.filter(o=>o.mastery_status==='STRONG').sort((a,b)=>b.success_rate-a.success_rate)});
}

export default {async fetch(request:Request,env:Env):Promise<Response>{const url=new URL(request.url);if(!url.pathname.startsWith('/api/reporting'))return answerApp.fetch(request,env);try{const auth=await requireUser(env,request);if(auth instanceof Response)return auth;if(url.pathname==='/api/reporting/students'&&request.method==='GET')return listStudents(env,auth,url);const combined=url.pathname.match(/^\/api\/reporting\/students\/([^/]+)\/combined$/);if(combined&&request.method==='GET')return combinedReport(env,auth,combined[1],url);return notFound('Raporlama API yolu bulunamadı.')}catch(e){console.error('Reporting error',e);return apiError(500,'SERVER_ERROR','Rapor hazırlanırken sunucu hatası oluştu.')}}} satisfies ExportedHandler<Env>;
