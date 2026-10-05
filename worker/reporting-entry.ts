import { handleFrozenFoyGameReport } from './lib/frozen-foy-game-report';
import { combineExpandedFrozenReports } from './lib/expanded-frozen-report';
import answerApp from './answer-correctness-entry';
import type { AuthUser, Env } from './types';
import { getAuthUser } from './lib/auth';
import { all, forbidden, json, notFound, one } from './lib/db';
import { loadPermissionScope } from './lib/permissions';
import { masteryStatus } from './lib/outcome';
import { combineFrozenReports } from './lib/combined-frozen-report';
import { frozenPracticeReport } from './lib/frozen-practice-report';
import { frozenExamReport } from './lib/frozen-exam-report';
import { frozenMiniTestReport } from './lib/frozen-mini-test-report';

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

export async function selectedFrozenExamReport(env:Env,user:AuthUser,studentId:string,url:URL){
 const access=await studentAccess(env,user,studentId);if(!access.allowed)return forbidden();
 const year=url.searchParams.get('academicYear')||'';
 const ids=[...new Set((url.searchParams.get('examIds')||'').split(',').map(id=>id.trim()).filter(Boolean))];
 if(!/^\d{4}-\d{4}$/.test(year)||Number(year.slice(5))!==Number(year.slice(0,4))+1||!ids.length||ids.length>20||ids.some(id=>id.length>100))return apiError(400,'REPORT_SELECTION_INVALID','Eğitim yılı ve en fazla 20 sınav seçin.');
 const staff=['TEACHER','GUIDANCE_TEACHER'].includes(user.role);
 const params:any[]=[studentId,access.student.institution_id,year,...ids];
 if(staff)params.push(access.student.season_id);
 const rows=await all<any>(env.DB.prepare(`SELECT s.exam_id,s.grade_level,s.payload_json,CASE WHEN json_valid(s.payload_json) THEN json_extract(s.payload_json,'$.exam.academic_year') END academic_year
 FROM exam_result_snapshots s
 JOIN exam_delivery_profiles p ON p.exam_id=s.exam_id AND p.snapshot_version=s.snapshot_version
 JOIN exams e ON e.id=s.exam_id
 JOIN exam_participants ep ON ep.id=s.participant_id AND ep.exam_id=s.exam_id AND ep.student_id=s.student_id AND ep.institution_id=s.institution_id
 WHERE s.student_id=? AND s.institution_id=? AND CASE WHEN json_valid(s.payload_json) THEN json_extract(s.payload_json,'$.exam.academic_year') END=? AND s.exam_id IN (${ids.map(()=>'?').join(',')})
 AND p.result_freeze_status='PUBLISHED' AND p.published_at IS NOT NULL
 AND (p.result_publish_at IS NULL OR datetime(p.result_publish_at)<=CURRENT_TIMESTAMP)
 ${staff?'AND ep.season_id=?':''} ORDER BY s.exam_id,s.participant_id LIMIT 21`).bind(...params));
 if(rows.length>20||new Set(rows.map(row=>row.exam_id)).size!==rows.length)return apiError(409,'REPORT_SOURCE_AMBIGUOUS','Sınav katılım kayıtları tekil değil.');
 return json({ok:true,sourceTypes:['EXAM'],academicYear:year,selectedExamIds:ids,restrictedToSubjects:access.restricted,
 ...frozenExamReport(rows,access.subjectFilter),unavailableExamIds:staff?[]:ids.filter(id=>!rows.some(row=>row.exam_id===id)),
 message:'Bu rapor seçilen yayınlanmış sınavların doğruluk özetidir; resmî puan veya beceri düzeyi değildir.'});
}

export async function selectedFrozenPracticeReport(env:Env,user:AuthUser,studentId:string,url:URL){
 const access=await studentAccess(env,user,studentId);if(!access.allowed)return forbidden();
 const year=url.searchParams.get('academicYear')||'',repeat=url.searchParams.get('repeatPolicy')||'LATEST';
 const ids=[...new Set((url.searchParams.get('runIds')||'').split(',').map(x=>x.trim()).filter(Boolean))];
 if(!/^\d{4}-\d{4}$/.test(year)||Number(year.slice(5))!==Number(year.slice(0,4))+1||!['FIRST','LATEST'].includes(repeat)||!ids.length||ids.length>100||ids.some(x=>x.length>100))return apiError(400,'REPORT_SELECTION_INVALID','Eğitim yılı, tekrar politikası ve en fazla 100 çözüm kaydı seçin.');
 const staff=['TEACHER','GUIDANCE_TEACHER'].includes(user.role);
 const params:any[]=[studentId,access.student.institution_id,year,...ids];if(staff)params.push(access.student.season_id);
 const rows=await all<any>(env.DB.prepare(`SELECT r.id,r.completed_at,r.metadata_json,r.source_type,r.source_id,r.status FROM assessment_runs r
 JOIN student_enrollments e ON e.id=CASE WHEN json_valid(r.metadata_json) THEN json_extract(r.metadata_json,'$.frozenEvidence.enrollmentId') END AND e.student_id=r.student_id AND e.institution_id=r.institution_id
 WHERE r.student_id=? AND r.institution_id=? AND r.source_type='QUESTION_BANK' AND r.status='SCORED' AND r.delivery_mode='DIGITAL' AND r.completed_at IS NOT NULL
 AND CASE WHEN json_valid(r.metadata_json) THEN json_extract(r.metadata_json,'$.frozenEvidence.academicYear') END=?
 AND e.season_id=CASE WHEN json_valid(r.metadata_json) THEN json_extract(r.metadata_json,'$.frozenEvidence.seasonId') END
 AND r.source_id=CASE WHEN json_valid(r.metadata_json) THEN json_extract(r.metadata_json,'$.frozenEvidence.questionId') END
 AND r.id IN (${ids.map(()=>'?').join(',')}) ${staff?'AND e.season_id=?':''} ORDER BY r.completed_at,r.id LIMIT 101`).bind(...params));
 if(rows.length>100||new Set(rows.map(r=>r.id)).size!==rows.length)return apiError(409,'REPORT_SOURCE_AMBIGUOUS','Çözüm kayıtları tekil değil.');
 return json({ok:true,academicYear:year,restrictedToSubjects:access.restricted,
 ...frozenPracticeReport(rows,year,access.subjectFilter,repeat as 'FIRST'|'LATEST'),
 unavailableRunIds:staff?[]:ids.filter(id=>!rows.some(r=>r.id===id)),
 message:'Seçili dijital soru pratiği doğruluğu; sınav puanı veya beceri düzeyi değildir. İlk/son politika yalnız seçili kayıtlar içinde uygulanır.'});
}

export async function selectedFrozenMiniTestReport(env:Env,user:AuthUser,studentId:string,url:URL){
 const access=await studentAccess(env,user,studentId);if(!access.allowed)return forbidden();
 const year=url.searchParams.get('academicYear')||'';
 const ids=[...new Set((url.searchParams.get('testIds')||'').split(',').map(id=>id.trim()).filter(Boolean))];
 if(!/^\d{4}-\d{4}$/.test(year)||Number(year.slice(5))!==Number(year.slice(0,4))+1||!ids.length||ids.length>20||ids.some(id=>id.length>100))return apiError(400,'REPORT_SELECTION_INVALID','Eğitim yılı ve en fazla 20 mini test seçin.');
 const staff=['TEACHER','GUIDANCE_TEACHER'].includes(user.role);
 const params:any[]=[studentId,access.student.institution_id,year,...ids];if(staff)params.push(access.student.season_id);
 const rows=await all<any>(env.DB.prepare(`SELECT r.id,r.metadata_json,r.source_type,r.source_id,r.status FROM assessment_runs r
 JOIN coach_mini_tests t ON t.id=r.id AND t.id=r.source_id AND t.student_id=r.student_id AND t.assignment_id=r.assignment_id
 JOIN assignments a ON a.id=t.assignment_id AND a.institution_id=r.institution_id
 JOIN student_enrollments e ON e.id=CASE WHEN json_valid(r.metadata_json) THEN json_extract(r.metadata_json,'$.miniEvidence.enrollmentId') END AND e.student_id=r.student_id AND e.institution_id=r.institution_id
 WHERE r.student_id=? AND r.institution_id=? AND r.source_type='MINI_TEST' AND r.status='SCORED' AND r.delivery_mode='DIGITAL' AND r.completed_at IS NOT NULL
 AND t.selection_mode='NEW' AND t.status IN ('PASSED','FAILED') AND t.submitted_at IS NOT NULL
 AND CASE WHEN json_valid(r.metadata_json) THEN json_extract(r.metadata_json,'$.selectionMode') END='NEW'
 AND CASE WHEN json_valid(r.metadata_json) THEN json_extract(r.metadata_json,'$.practiceOnly') END=0
 AND CASE WHEN json_valid(r.metadata_json) THEN json_type(r.metadata_json,'$.practiceOnly') END='false'
 AND CASE WHEN json_valid(r.metadata_json) THEN json_extract(r.metadata_json,'$.miniEvidence.academicYear') END=?
 AND e.season_id=CASE WHEN json_valid(r.metadata_json) THEN json_extract(r.metadata_json,'$.miniEvidence.seasonId') END
 AND r.id IN (${ids.map(()=>'?').join(',')}) ${staff?'AND e.season_id=?':''} ORDER BY r.id LIMIT 21`).bind(...params));
 if(rows.length>20||new Set(rows.map(row=>row.id)).size!==rows.length)return apiError(409,'REPORT_SOURCE_AMBIGUOUS','Mini test kayıtları tekil değil.');
 return json({ok:true,academicYear:year,restrictedToSubjects:access.restricted,
 ...frozenMiniTestReport(rows,year,access.subjectFilter),unavailableTestIds:staff?[]:ids.filter(id=>!rows.some(row=>row.id===id)),
 message:'Seçili yeni soru mini testlerinin sabitlenmiş doğruluk özeti; resmî puan veya beceri düzeyi değildir. Tekrar çalışmaları bu rapora katılmaz.'});
}

export async function selectedCombinedFrozenReport(env:Env,user:AuthUser,studentId:string,url:URL){
 const access=await studentAccess(env,user,studentId);if(!access.allowed)return forbidden();
 const hasExams=Boolean((url.searchParams.get('examIds')||'').trim()),hasPractice=Boolean((url.searchParams.get('runIds')||'').trim()),hasMini=Boolean((url.searchParams.get('miniTestIds')||'').trim());
 if(!hasExams&&!hasPractice&&!hasMini)return apiError(400,'REPORT_SELECTION_INVALID','En az bir sınav, soru pratiği veya mini test kaydı seçin.');
 const sources:any[]=[];
 if(hasExams){const r=await selectedFrozenExamReport(env,user,studentId,url);if(!r.ok)return r;sources.push({sourceType:'EXAM',report:await r.json()});}
 if(hasPractice){const r=await selectedFrozenPracticeReport(env,user,studentId,url);if(!r.ok)return r;sources.push({sourceType:'QUESTION_BANK',report:await r.json()});}
 if(hasMini){const miniUrl=new URL(url);miniUrl.searchParams.set('testIds',url.searchParams.get('miniTestIds')!);const r=await selectedFrozenMiniTestReport(env,user,studentId,miniUrl);if(!r.ok)return r;sources.push({sourceType:'MINI_TEST',report:await r.json()});}
 return json({ok:true,academicYear:url.searchParams.get('academicYear'),restrictedToSubjects:access.restricted,...combineFrozenReports(sources),
 sourceCoverage:sources.map(s=>({sourceType:s.sourceType,coverage:s.report.coverage,unavailableCount:(s.report.unavailableExamIds||s.report.unavailableRunIds||s.report.unavailableTestIds||[]).length})),
 message:'Doğruluk soru sayısıyla ağırlıklıdır. Sınav soruları, seçili ilk/son pratik çözümleri ve yeni soru mini testleri ayrı kanıt olaylarıdır; resmî puan veya beceri düzeyi değildir.'});
}

type GuidanceReportClass={id:string;seasonId:string;academicYear:string};
async function guidanceReportClass(env:Env,user:AuthUser,url:URL):Promise<GuidanceReportClass|null>{
 if(user.role!=='GUIDANCE_TEACHER'||!user.institution_id)return null;
 const id=url.searchParams.get('classId')||'';if(!id||id.length>100)return null;
 return one<GuidanceReportClass>(env.DB.prepare(`SELECT c.id,c.season_id seasonId,se.academic_year academicYear FROM classes c
 JOIN institution_seasons se ON se.id=c.season_id AND se.institution_id=c.institution_id AND se.status='ACTIVE'
 JOIN institutions i ON i.id=c.institution_id AND i.status='ACTIVE'
 WHERE c.id=? AND c.institution_id=? AND c.active=1 AND EXISTS(SELECT 1 FROM teacher_assignments ta WHERE ta.user_id=? AND ta.class_id=c.id AND ta.season_id=c.season_id AND ta.assignment_type='GUIDANCE' AND ta.active=1)`)
 .bind(id,user.institution_id,user.id));
}
async function listGuidanceReportClasses(env:Env,user:AuthUser,url:URL){
 if(user.role!=='GUIDANCE_TEACHER'||!user.institution_id)return forbidden();
 const cursor=url.searchParams.get('cursor')||'';if(cursor.length>100)return apiError(400,'INVALID_CURSOR','Liste devamı geçersiz.');
 const rows=await all<any>(env.DB.prepare(`SELECT c.id,c.name,se.academic_year academicYear FROM classes c
 JOIN institution_seasons se ON se.id=c.season_id AND se.institution_id=c.institution_id AND se.status='ACTIVE'
 JOIN institutions i ON i.id=c.institution_id AND i.status='ACTIVE'
 WHERE c.institution_id=? AND c.active=1 AND c.id>? AND EXISTS(SELECT 1 FROM teacher_assignments ta WHERE ta.user_id=? AND ta.class_id=c.id AND ta.season_id=c.season_id AND ta.assignment_type='GUIDANCE' AND ta.active=1)
 ORDER BY c.id LIMIT 51`).bind(user.institution_id,cursor,user.id));
 return json({ok:true,classes:rows.slice(0,50),nextCursor:rows.length>50?rows[49].id:null});
}
async function guidanceFrozenReport(env:Env,user:AuthUser,url:URL,kind:'exams'|'summary'){
 const cls=await guidanceReportClass(env,user,url);if(!cls)return forbidden();
 return kind==='exams'?listInstitutionFrozenExams(env,user,url,cls):institutionFrozenSummary(env,user,url,cls);
}

export async function listInstitutionFrozenExams(env:Env,user:AuthUser,url:URL,classScope?:GuidanceReportClass){
 if(classScope?user.role!=='GUIDANCE_TEACHER':!['SUPER_ADMIN','INSTITUTION_MANAGER'].includes(user.role))return forbidden();
 const institutionId=user.role==='SUPER_ADMIN'?url.searchParams.get('institutionId'):user.institution_id;if(!institutionId)return apiError(400,'INSTITUTION_REQUIRED','Kurum seçin.');
 if(!await one(env.DB.prepare("SELECT id FROM institutions WHERE id=? AND status='ACTIVE'").bind(institutionId)))return forbidden();
 const years=classScope?[{academic_year:classScope.academicYear}]:await all<any>(env.DB.prepare("SELECT academic_year FROM institution_seasons WHERE institution_id=? GROUP BY academic_year ORDER BY MAX(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END) DESC,academic_year DESC LIMIT 30").bind(institutionId));
 const year=url.searchParams.get('academicYear')||years[0]?.academic_year||'',cursor=url.searchParams.get('cursor')||'';
 if(!/^\d{4}-\d{4}$/.test(year)||Number(year.slice(5))!==Number(year.slice(0,4))+1||cursor.length>100)return apiError(400,'REPORT_SELECTION_INVALID','Geçerli eğitim yılı seçin.');
 if(classScope&&year!==classScope.academicYear)return forbidden();
 const rows=await all<any>(env.DB.prepare(`WITH frozen AS (
 SELECT s.exam_id,CASE WHEN json_valid(s.payload_json) THEN s.payload_json ELSE '{}' END payload
 FROM exam_result_snapshots s JOIN exam_delivery_profiles p ON p.exam_id=s.exam_id AND p.snapshot_version=s.snapshot_version
 WHERE s.institution_id=? AND s.exam_id>? AND p.result_freeze_status='PUBLISHED' AND p.published_at IS NOT NULL
 AND (p.result_publish_at IS NULL OR datetime(p.result_publish_at)<=CURRENT_TIMESTAMP)
 ${classScope?`AND EXISTS(SELECT 1 FROM exam_participants gp JOIN student_enrollments ge ON ge.student_id=s.student_id AND ge.institution_id=s.institution_id AND ge.status='ACTIVE' WHERE gp.id=s.participant_id AND gp.exam_id=s.exam_id AND gp.institution_id=s.institution_id AND gp.student_id=s.student_id AND gp.season_id=? AND ge.class_id=? AND ge.season_id=?)`:''}
 ) SELECT exam_id examId,MIN(json_extract(payload,'$.exam.title')) title,MIN(json_extract(payload,'$.exam.exam_date')) examDate
 FROM frozen WHERE json_extract(payload,'$.schemaVersion')=1 AND json_extract(payload,'$.exam.exam_id')=exam_id AND json_extract(payload,'$.exam.academic_year')=?
 GROUP BY exam_id ORDER BY exam_id LIMIT 51`).bind(institutionId,cursor,...(classScope?[classScope.seasonId,classScope.id,classScope.seasonId]:[]),year));
 return json({ok:true,academicYear:year,academicYears:years.map(row=>row.academic_year),exams:rows.slice(0,50),nextCursor:rows.length>50?rows[49].examId:null});
}

export async function institutionFrozenSummary(env:Env,user:AuthUser,url:URL,classScope?:GuidanceReportClass){
 if(classScope?user.role!=='GUIDANCE_TEACHER':!['SUPER_ADMIN','INSTITUTION_MANAGER'].includes(user.role))return forbidden();
 const institutionId=user.role==='SUPER_ADMIN'?url.searchParams.get('institutionId'):user.institution_id;
 const year=url.searchParams.get('academicYear')||'',ids=[...new Set((url.searchParams.get('examIds')||'').split(',').map(id=>id.trim()).filter(Boolean))];
 if(!institutionId||!/^\d{4}-\d{4}$/.test(year)||Number(year.slice(5))!==Number(year.slice(0,4))+1||!ids.length||ids.length>20||ids.some(id=>id.length>100))return apiError(400,'REPORT_SELECTION_INVALID','Kurum, eğitim yılı ve en fazla 20 sınav seçin.');
 if(classScope&&year!==classScope.academicYear)return forbidden();
 const institution=await one<any>(env.DB.prepare("SELECT id FROM institutions WHERE id=? AND status='ACTIVE'").bind(institutionId));if(!institution)return forbidden();
 const rows=await all<any>(env.DB.prepare(`WITH scoped AS (
  SELECT s.exam_id,s.snapshot_version,s.grade_level,s.class_snapshot,s.student_id,s.participant_id,s.net,
   CASE WHEN json_valid(s.payload_json) THEN s.payload_json ELSE '{}' END payload
  FROM exam_result_snapshots s JOIN exam_delivery_profiles p ON p.exam_id=s.exam_id AND p.snapshot_version=s.snapshot_version
  JOIN exam_participants ep ON ep.id=s.participant_id AND ep.exam_id=s.exam_id AND ep.institution_id=s.institution_id AND ep.student_id IS s.student_id
  WHERE s.institution_id=? AND s.exam_id IN (${ids.map(()=>'?').join(',')})
   AND p.result_freeze_status='PUBLISHED' AND p.published_at IS NOT NULL
   AND (p.result_publish_at IS NULL OR datetime(p.result_publish_at)<=CURRENT_TIMESTAMP)
   ${classScope?`AND ep.season_id=? AND EXISTS(SELECT 1 FROM student_enrollments ge WHERE ge.student_id=s.student_id AND ge.institution_id=s.institution_id AND ge.status='ACTIVE' AND ge.class_id=? AND ge.season_id=?)`:''}
 ), validated AS (
  SELECT *, CASE WHEN json_extract(payload,'$.schemaVersion')=1 AND json_extract(payload,'$.exam.exam_id')=exam_id
   AND json_type(payload,'$.exam.correct_count') IN ('integer','real') AND json_extract(payload,'$.exam.correct_count')>=0
   AND json_type(payload,'$.exam.wrong_count') IN ('integer','real') AND json_extract(payload,'$.exam.wrong_count')>=0
   AND json_type(payload,'$.exam.blank_count') IN ('integer','real') AND json_extract(payload,'$.exam.blank_count')>=0
   THEN 1 ELSE 0 END usable
  FROM scoped WHERE json_extract(payload,'$.exam.academic_year')=?
 ) SELECT exam_id examId,snapshot_version snapshotVersion,grade_level gradeLevel,class_snapshot className,
 COUNT(*) participantCount,COUNT(DISTINCT student_id) registeredStudentCount,SUM(usable) usableCount,
 SUM(CASE WHEN usable=1 THEN json_extract(payload,'$.exam.correct_count') ELSE 0 END) correct,
 SUM(CASE WHEN usable=1 THEN json_extract(payload,'$.exam.wrong_count') ELSE 0 END) wrong,
 SUM(CASE WHEN usable=1 THEN json_extract(payload,'$.exam.blank_count') ELSE 0 END) blank,
 AVG(CASE WHEN usable=1 THEN net END) averageNet
 FROM validated GROUP BY exam_id,snapshot_version,grade_level,class_snapshot ORDER BY exam_id,grade_level,class_snapshot LIMIT 501`).bind(institutionId,...ids,...(classScope?[classScope.seasonId,classScope.id,classScope.seasonId]:[]),year));
 if(rows.length>500)return apiError(400,'REPORT_SCOPE_TOO_LARGE','Seçili sınavlardaki sınıf sayısı rapor sınırını aşıyor. Seçimi daraltın.');
 return json({ok:true,academicYear:year,policy:'PUBLISHED_SNAPSHOT_CLASS_AGGREGATES_V1',groups:rows.map(row=>{const denominator=Number(row.correct)+Number(row.wrong)+Number(row.blank);return {...row,unusableCount:Number(row.participantCount)-Number(row.usableCount),accuracyPercent:denominator?Math.round(Number(row.correct)/denominator*10000)/100:null}}),message:'Her sınav ve yayın sürümünün sınıf özeti ayrı hesaplanır. Farklı sınavların netleri ortak kurum ortalamasına dönüştürülmez.'});
}

export async function selectedExpandedFrozenReport(request:Request,env:Env,user:AuthUser,studentId:string,url:URL){
 const access=await studentAccess(env,user,studentId);if(!access.allowed)return forbidden();
 const year=url.searchParams.get('academicYear')||'';
 if(!/^\d{4}-\d{4}$/.test(year)||Number(year.slice(5))!==Number(year.slice(0,4))+1)return apiError(400,'REPORT_SELECTION_INVALID','Geçerli eğitim yılı seçin.');
 const hasBase=['examIds','runIds','miniTestIds'].some(key=>Boolean((url.searchParams.get(key)||'').trim()));
 const hasFoy=Boolean((url.searchParams.get('foyRunIds')||'').trim()),hasGames=Boolean((url.searchParams.get('gameSessionIds')||'').trim());
 if(!hasBase&&!hasFoy&&!hasGames)return apiError(400,'REPORT_SELECTION_INVALID','En az bir rapor kaynağı seçin.');
 const sources:any[]=[];let gameActivity:any=null,restricted=access.restricted;
 if(hasBase){const response=await selectedCombinedFrozenReport(env,user,studentId,url);if(!response.ok)return response;const report=await response.json() as any;restricted=restricted||Boolean(report.restrictedToSubjects);sources.push({sourceType:'COMBINED_BASE',report});}
 for(const [enabled,path,input,output] of [[hasFoy,'frozen-foy','foyRunIds','runIds'],[hasGames,'frozen-games','gameSessionIds','sessionIds']] as const){
  if(!enabled)continue;
  const child=new URL(url);child.pathname='/api/reporting/students/'+encodeURIComponent(studentId)+'/'+path;child.searchParams.set(output,url.searchParams.get(input)!);
  const pending=handleFrozenFoyGameReport(new Request(child,{method:'GET'}),env,user);
  if(!pending)return apiError(500,'REPORT_SOURCE_UNAVAILABLE','Rapor kaynağı bağlanamadı.');
  const response=await pending;if(!response.ok)return response;
  const report=await response.json() as any;restricted=restricted||Boolean(report.restrictedToSubjects);
  if(path==='frozen-foy')sources.push({sourceType:'FOY',report});else gameActivity=report;
 }
 return json({ok:true,academicYear:year,restrictedToSubjects:restricted,...combineExpandedFrozenReports(sources,gameActivity)});
}

export async function listFrozenMiniTestRuns(env:Env,user:AuthUser,studentId:string,url:URL){
 const access=await studentAccess(env,user,studentId);if(!access.allowed)return forbidden();
 const year=url.searchParams.get('academicYear')||'',limitText=url.searchParams.get('limit')||'50';
 let cursor:any=null;
 try{const raw=url.searchParams.get('cursor');if(raw){if(raw.length>512||!/^[A-Za-z0-9_-]+$/.test(raw))throw Error();cursor=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')));if(!Array.isArray(cursor)||cursor.length!==2||typeof cursor[0]!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cursor[0])||!Number.isFinite(Date.parse(cursor[0]))||new Date(cursor[0]).toISOString()!==cursor[0]||typeof cursor[1]!=='string'||!cursor[1]||cursor[1].length>100)throw Error();}}
 catch{return apiError(400,'REPORT_CURSOR_INVALID','Mini test listesi devam anahtarı geçersiz.');}
 if(!/^\d{4}-\d{4}$/.test(year)||Number(year.slice(5))!==Number(year.slice(0,4))+1||!/^([1-9]|[1-4][0-9]|50)$/.test(limitText))return apiError(400,'REPORT_SELECTION_INVALID','Geçerli eğitim yılı ve 1–50 kayıt sınırı seçin.');
 const limit=Number(limitText),staff=['TEACHER','GUIDANCE_TEACHER'].includes(user.role);
 const params:any[]=[studentId,access.student.institution_id,year];if(staff)params.push(access.student.season_id);
 const branchSQL=access.subjectFilter?`AND json_extract(f.ref,'$.subjectId') IN (${access.subjectFilter.map(()=>'?').join(',')})`:'';
 if(access.subjectFilter)params.push(...access.subjectFilter);
 if(cursor)params.push(cursor[0],cursor[0],cursor[1]);params.push(limit+1);
 // Filter native evidence and branch scope before LIMIT. No current question or
 // curriculum joins may rewrite which completed tests are available to a report.
 const rows=await all<any>(env.DB.prepare(`WITH safe AS (
 SELECT r.*,CASE WHEN json_valid(r.metadata_json) THEN r.metadata_json ELSE '{}' END metadata
 FROM assessment_runs r WHERE r.student_id=? AND r.institution_id=? AND r.source_type='MINI_TEST' AND r.status='SCORED' AND r.delivery_mode='DIGITAL'
 ), native AS (
 SELECT r.id,r.metadata,strftime('%Y-%m-%dT%H:%M:%fZ',r.completed_at) completedAt FROM safe r
 JOIN coach_mini_tests t ON t.id=r.id AND t.id=r.source_id AND t.student_id=r.student_id AND t.assignment_id=r.assignment_id
 JOIN assignments a ON a.id=t.assignment_id AND a.institution_id=r.institution_id
 JOIN student_enrollments e ON e.id=json_extract(r.metadata,'$.miniEvidence.enrollmentId') AND e.student_id=r.student_id AND e.institution_id=r.institution_id AND e.season_id=json_extract(r.metadata,'$.miniEvidence.seasonId')
 WHERE json_extract(r.metadata,'$.miniEvidence.academicYear')=? ${staff?'AND e.season_id=?':''}
 AND t.selection_mode='NEW' AND t.status IN ('PASSED','FAILED') AND t.submitted_at IS NOT NULL
 AND json_extract(r.metadata,'$.selectionMode')='NEW' AND json_type(r.metadata,'$.practiceOnly')='false'
 AND json_extract(r.metadata,'$.miniEvidence.policy')='MINI_TEST_CONTENT_AT_START_V1'
 AND json_type(r.metadata,'$.miniEvidence.enrollmentId')='text' AND length(e.id)>0
 AND json_type(r.metadata,'$.miniEvidence.seasonId')='text' AND length(e.season_id)>0
 AND json_type(r.metadata,'$.miniEvidence.gradeLevel')='integer' AND json_extract(r.metadata,'$.miniEvidence.gradeLevel') BETWEEN 1 AND 12
 AND json_type(r.metadata,'$.miniEvidence.questionEvidence')='array' AND json_array_length(r.metadata,'$.miniEvidence.questionEvidence')>0
 AND typeof(r.id)='text' AND length(r.id) BETWEEN 1 AND 100 AND typeof(r.completed_at)='text' AND length(r.completed_at)>=19
 AND substr(r.completed_at,1,10) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(r.completed_at,11,1) IN ('T',' ') AND substr(r.completed_at,12,8) GLOB '[0-9][0-9]:[0-9][0-9]:[0-9][0-9]' AND datetime(r.completed_at) IS NOT NULL
 AND strftime('%Y-%m-%d',substr(r.completed_at,1,10),'+0 days')=substr(r.completed_at,1,10)
 AND substr(r.completed_at,12,2) BETWEEN '00' AND '23' AND substr(r.completed_at,15,2) BETWEEN '00' AND '59' AND substr(r.completed_at,18,2) BETWEEN '00' AND '59'
 ), questions AS (
 SELECT n.id,n.metadata,q.key questionIndex,q.type questionType,CASE WHEN q.type='object' THEN q.value ELSE '{}' END question FROM native n
 JOIN json_each(json_extract(n.metadata,'$.miniEvidence.questionEvidence')) q
 ), refs AS (
 SELECT q.id,q.questionIndex,f.type refType,CASE WHEN f.type='object' THEN f.value ELSE '{}' END ref FROM questions q
 JOIN json_each(CASE WHEN json_type(q.question,'$.outcomeRefs')='array' THEN json_extract(q.question,'$.outcomeRefs') ELSE '[]' END) f
 ), validQuestions AS (
 SELECT q.id,q.questionIndex FROM questions q
 WHERE q.questionType='object' AND json_type(q.question,'$.questionId')='text' AND length(json_extract(q.question,'$.questionId'))>0
 AND json_extract(q.question,'$.status') IN ('CORRECT','WRONG','BLANK') AND json_type(q.question,'$.outcomeRefs')='array'
 AND NOT EXISTS(SELECT 1 FROM questions previous WHERE previous.id=q.id AND previous.questionIndex<q.questionIndex AND json_extract(previous.question,'$.questionId')=json_extract(q.question,'$.questionId'))
 AND NOT EXISTS(SELECT 1 FROM refs f WHERE f.id=q.id AND f.questionIndex=q.questionIndex AND NOT COALESCE(
 f.refType='object' AND json_type(f.ref,'$.verified')='integer' AND json_extract(f.ref,'$.verified')=1
 AND json_type(f.ref,'$.outcomeId')='text' AND length(json_extract(f.ref,'$.outcomeId'))>0
 AND json_type(f.ref,'$.subjectId')='text' AND length(json_extract(f.ref,'$.subjectId'))>0
 AND json_type(f.ref,'$.curriculumVersionId')='text' AND length(json_extract(f.ref,'$.curriculumVersionId'))>0
 AND json_extract(f.ref,'$.academicYear')=json_extract(q.metadata,'$.miniEvidence.academicYear')
 AND json_type(f.ref,'$.gradeLevel')='integer' AND json_extract(f.ref,'$.gradeLevel')=json_extract(q.metadata,'$.miniEvidence.gradeLevel')
 AND COALESCE(json_type(f.ref,'$.programVersion'),'null') IN ('null','text') ${branchSQL},0))
 AND (SELECT count(DISTINCT json_array(json_extract(f.ref,'$.subjectId'),json_extract(f.ref,'$.curriculumVersionId'),json_extract(f.ref,'$.programVersion'))) FROM refs f WHERE f.id=q.id AND f.questionIndex=q.questionIndex)=1
 ), eligible AS (
 SELECT n.id,n.completedAt FROM native n WHERE n.completedAt IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM questions q WHERE q.id=n.id AND NOT COALESCE(q.questionType='object' AND json_extract(q.question,'$.status') IN ('CORRECT','WRONG','BLANK') AND json_type(q.question,'$.outcomeRefs')='array',0))
 AND NOT EXISTS(SELECT 1 FROM refs f WHERE f.id=n.id AND NOT COALESCE(f.refType='object' AND json_type(f.ref,'$.outcomeId')='text' AND length(json_extract(f.ref,'$.outcomeId'))>0 AND COALESCE(json_type(f.ref,'$.programVersion'),'null') IN ('null','text'),0))
 AND EXISTS(SELECT 1 FROM validQuestions q WHERE q.id=n.id)
 ) SELECT DISTINCT id,completedAt FROM eligible ${cursor?'WHERE (completedAt<? OR (completedAt=? AND id<?))':''} ORDER BY completedAt DESC,id DESC LIMIT ?`).bind(...params));
 const runs=rows.slice(0,limit),last=runs[runs.length-1];
 const nextCursor=rows.length>limit&&last?btoa(JSON.stringify([last.completedAt,last.id])).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''):null;
 return json({ok:true,academicYear:year,restrictedToSubjects:access.restricted,runs,nextCursor});
}

export async function listFrozenPracticeRuns(env:Env,user:AuthUser,studentId:string,url:URL){
 const access=await studentAccess(env,user,studentId);if(!access.allowed)return forbidden();
 const year=url.searchParams.get('academicYear')||'',limitText=url.searchParams.get('limit')||'50';
 let cursor:any=null;
 try{const raw=url.searchParams.get('cursor');if(raw){if(raw.length>512||!/^[A-Za-z0-9_-]+$/.test(raw))throw Error();cursor=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')));if(!Array.isArray(cursor)||cursor.length!==2||typeof cursor[0]!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cursor[0])||!Number.isFinite(Date.parse(cursor[0]))||new Date(cursor[0]).toISOString()!==cursor[0]||typeof cursor[1]!=='string'||!cursor[1]||cursor[1].length>100)throw Error();}}
 catch{return apiError(400,'REPORT_CURSOR_INVALID','Çözüm listesi devam anahtarı geçersiz.');}
 if(!/^\d{4}-\d{4}$/.test(year)||Number(year.slice(5))!==Number(year.slice(0,4))+1||!/^([1-9]|[1-4][0-9]|50)$/.test(limitText))return apiError(400,'REPORT_SELECTION_INVALID','Geçerli eğitim yılı ve 1–50 kayıt sınırı seçin.');
 const limit=Number(limitText),staff=['TEACHER','GUIDANCE_TEACHER'].includes(user.role);
 const params:any[]=[studentId,access.student.institution_id,year];if(staff)params.push(access.student.season_id);
 const subjectSQL=access.subjectFilter?`AND json_extract(CASE WHEN j.type='object' THEN j.value ELSE '{}' END,'$.subjectId') IN (${access.subjectFilter.map(()=>'?').join(',')})`:'';
 if(access.subjectFilter)params.push(...access.subjectFilter);
 if(cursor)params.push(cursor[0],cursor[0],cursor[1]);params.push(limit+1);
 const rows=await all<any>(env.DB.prepare(`WITH safe AS (
 SELECT r.*,CASE WHEN json_valid(r.metadata_json) THEN r.metadata_json ELSE '{}' END metadata FROM assessment_runs r WHERE r.student_id=? AND r.institution_id=? AND r.source_type='QUESTION_BANK' AND r.status='SCORED' AND r.delivery_mode='DIGITAL'
 ), eligible AS (
 SELECT r.id,strftime('%Y-%m-%dT%H:%M:%fZ',r.completed_at) completedAt FROM safe r
 JOIN student_enrollments e ON e.id=json_extract(r.metadata,'$.frozenEvidence.enrollmentId') AND e.student_id=r.student_id AND e.institution_id=r.institution_id AND e.season_id=json_extract(r.metadata,'$.frozenEvidence.seasonId')
 WHERE json_extract(r.metadata,'$.frozenEvidence.academicYear')=? ${staff?'AND e.season_id=?':''}
 AND json_extract(r.metadata,'$.frozenEvidence.policy')='QUESTION_PRACTICE_READ_CONTEXT_V1'
 AND json_type(r.metadata,'$.frozenEvidence.questionId')='text' AND r.source_id=json_extract(r.metadata,'$.frozenEvidence.questionId') AND length(r.source_id)>0
 AND json_type(r.metadata,'$.frozenEvidence.enrollmentId')='text' AND length(e.id)>0
 AND json_type(r.metadata,'$.frozenEvidence.seasonId')='text' AND length(e.season_id)>0
 AND json_type(r.metadata,'$.frozenEvidence.gradeLevel')='integer' AND json_extract(r.metadata,'$.frozenEvidence.gradeLevel') BETWEEN 1 AND 12
 AND json_extract(r.metadata,'$.frozenEvidence.status') IN ('CORRECT','WRONG','BLANK')
 AND json_type(r.metadata,'$.frozenEvidence.contentDigest')='text' AND length(json_extract(r.metadata,'$.frozenEvidence.contentDigest'))=64 AND json_extract(r.metadata,'$.frozenEvidence.contentDigest') NOT GLOB '*[^a-f0-9]*'
 AND typeof(r.id)='text' AND length(r.id) BETWEEN 1 AND 100 AND typeof(r.completed_at)='text' AND length(r.completed_at)>=19 AND substr(r.completed_at,1,10) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(r.completed_at,11,1) IN ('T',' ') AND substr(r.completed_at,12,8) GLOB '[0-9][0-9]:[0-9][0-9]:[0-9][0-9]' AND datetime(r.completed_at) IS NOT NULL
 AND json_type(r.metadata,'$.frozenEvidence.outcomeRefs')='array' AND json_array_length(r.metadata,'$.frozenEvidence.outcomeRefs')>0
 AND NOT EXISTS(SELECT 1 FROM json_each(CASE WHEN json_type(r.metadata,'$.frozenEvidence.outcomeRefs')='array' THEN json_extract(r.metadata,'$.frozenEvidence.outcomeRefs') ELSE '[]' END) j WHERE NOT COALESCE(
 j.type='object' AND json_type(CASE WHEN j.type='object' THEN j.value ELSE '{}' END,'$.verified')='integer' AND json_extract(CASE WHEN j.type='object' THEN j.value ELSE '{}' END,'$.verified')=1
 AND json_type(CASE WHEN j.type='object' THEN j.value ELSE '{}' END,'$.outcomeId')='text' AND length(json_extract(CASE WHEN j.type='object' THEN j.value ELSE '{}' END,'$.outcomeId'))>0
 AND json_type(CASE WHEN j.type='object' THEN j.value ELSE '{}' END,'$.subjectId')='text' AND length(json_extract(CASE WHEN j.type='object' THEN j.value ELSE '{}' END,'$.subjectId'))>0
 AND json_type(CASE WHEN j.type='object' THEN j.value ELSE '{}' END,'$.curriculumVersionId')='text' AND length(json_extract(CASE WHEN j.type='object' THEN j.value ELSE '{}' END,'$.curriculumVersionId'))>0
 AND json_extract(CASE WHEN j.type='object' THEN j.value ELSE '{}' END,'$.academicYear')=json_extract(r.metadata,'$.frozenEvidence.academicYear')
 AND json_type(CASE WHEN j.type='object' THEN j.value ELSE '{}' END,'$.gradeLevel')='integer' AND json_extract(CASE WHEN j.type='object' THEN j.value ELSE '{}' END,'$.gradeLevel')=json_extract(r.metadata,'$.frozenEvidence.gradeLevel')
 AND COALESCE(json_type(CASE WHEN j.type='object' THEN j.value ELSE '{}' END,'$.programVersion'),'null') IN ('null','text') ${subjectSQL},0))
 AND (SELECT count(DISTINCT json_array(json_extract(CASE WHEN j.type='object' THEN j.value ELSE '{}' END,'$.subjectId'),json_extract(CASE WHEN j.type='object' THEN j.value ELSE '{}' END,'$.curriculumVersionId'),json_extract(CASE WHEN j.type='object' THEN j.value ELSE '{}' END,'$.programVersion'))) FROM json_each(CASE WHEN json_type(r.metadata,'$.frozenEvidence.outcomeRefs')='array' THEN json_extract(r.metadata,'$.frozenEvidence.outcomeRefs') ELSE '[]' END) j)=1
 ) SELECT DISTINCT id,completedAt FROM eligible WHERE completedAt IS NOT NULL ${cursor?'AND (completedAt<? OR (completedAt=? AND id<?))':''} ORDER BY completedAt DESC,id DESC LIMIT ?`).bind(...params));
 const runs=rows.slice(0,limit),last=runs[runs.length-1];
 const nextCursor=rows.length>limit&&last?btoa(JSON.stringify([last.completedAt,last.id])).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''):null;
 return json({ok:true,academicYear:year,restrictedToSubjects:access.restricted,runs,nextCursor});
}

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


function mergeSnapshotOutcomes(rows:any[]):any[]{
  const grouped=new Map<string,any>();
  for(const row of rows){const previous=grouped.get(row.outcome_id);if(previous){previous.evidence_count+=Number(row.evidence_count||0);previous.correct_count+=Number(row.correct_count||0)}else grouped.set(row.outcome_id,{...row,evidence_count:Number(row.evidence_count||0),correct_count:Number(row.correct_count||0)})}
  return [...grouped.values()];
}

async function combinedReport(env:Env,user:AuthUser,studentId:string,url:URL):Promise<Response>{
  const access=await studentAccess(env,user,studentId);if(!access.allowed||!access.student)return forbidden('Bu öğrenci için birleşik rapor erişiminiz bulunmuyor.');
  const publishedView=user.role==='STUDENT'||user.role==='PARENT';
  const examParams:any[]=[studentId];let examAccessSql='';
  if(user.role==='STUDENT'||user.role==='PARENT')examAccessSql+=` AND EXISTS (SELECT 1 FROM exam_delivery_profiles publication WHERE publication.exam_id=e.id AND publication.result_freeze_status='PUBLISHED' AND publication.published_at IS NOT NULL AND (publication.result_publish_at IS NULL OR datetime(publication.result_publish_at)<=CURRENT_TIMESTAMP))`;
  if(access.subjectFilter?.length){examAccessSql+=` AND EXISTS (SELECT 1 FROM subject_results sr2 WHERE sr2.participant_id=ep.id AND sr2.subject_id IN (${placeholders(access.subjectFilter)}))`;examParams.push(...access.subjectFilter)}
  const snapshotRows=publishedView?await all<any>(env.DB.prepare(`SELECT snap.exam_id,snap.payload_json,snap.snapshot_version FROM exam_result_snapshots snap
    JOIN exam_delivery_profiles p ON p.exam_id=snap.exam_id AND p.snapshot_version=snap.snapshot_version
    WHERE snap.student_id=? AND p.result_freeze_status='PUBLISHED' AND p.published_at IS NOT NULL
    AND (p.result_publish_at IS NULL OR datetime(p.result_publish_at)<=CURRENT_TIMESTAMP) ORDER BY p.published_at DESC LIMIT 100`).bind(studentId)):[];
  const snapshotPayloads=snapshotRows.map(row=>{try{const data=JSON.parse(row.payload_json||'null');return data?.schemaVersion===1&&data.exam&&Array.isArray(data.subjects)&&Array.isArray(data.outcomes)?{...row,data}:null}catch{return null}});
  const unavailableSnapshotExamIds=snapshotRows.filter((_,i)=>!snapshotPayloads[i]).map(row=>row.exam_id);
  const usableSnapshots=snapshotPayloads.filter((row):row is NonNullable<typeof row>=>!!row);
  const allExams=publishedView?usableSnapshots.map(row=>({...row.data.exam,snapshot_version:row.snapshot_version})):
    await all<any>(env.DB.prepare(`SELECT e.id exam_id,e.title,e.exam_date,e.exam_type,e.academic_year,er.correct_count,er.wrong_count,er.blank_count,er.net,er.score,er.success_percent,er.institution_rank,ep.booklet_code
    FROM exam_participants ep JOIN exams e ON e.id=ep.exam_id JOIN exam_results er ON er.participant_id=ep.id
    WHERE ep.student_id=? ${examAccessSql} ORDER BY coalesce(e.exam_date,er.created_at) DESC LIMIT 100`).bind(...examParams));
  const availableIds=new Set(allExams.map(x=>String(x.exam_id)));const requested=(url.searchParams.get('examIds')||'').split(',').map(x=>x.trim()).filter(Boolean);const selectedIds=(requested.length?requested.filter(x=>availableIds.has(x)):allExams.slice(0,20).map(x=>String(x.exam_id)));
  if(!selectedIds.length)return json({ok:true,student:access.student,restrictedToSubjects:access.restricted,availableExams:allExams,unavailableSnapshotExamIds,selectedExamIds:[],exams:[],subjectTrend:[],subjectSummary:[],outcomes:[],developing:[],strong:[],summary:null});
  const examSet=new Set(selectedIds);const selectedExams=allExams.filter(x=>examSet.has(String(x.exam_id)));
  const examSql=placeholders(selectedIds);const subjectParams:any[]=[studentId,...selectedIds];let subjectFilterSql='';if(access.subjectFilter?.length){subjectFilterSql=` AND sr.subject_id IN (${placeholders(access.subjectFilter)})`;subjectParams.push(...access.subjectFilter)}
  const subjectTrend=publishedView?usableSnapshots.filter(row=>examSet.has(String(row.exam_id))).flatMap(row=>row.data.subjects.map((subject:any)=>({...subject,exam_id:row.exam_id,title:row.data.exam.title,exam_date:row.data.exam.exam_date}))):await all<any>(env.DB.prepare(`SELECT e.id exam_id,e.title,e.exam_date,s.id subject_id,s.code subject_code,s.name subject_name,sr.correct_count,sr.wrong_count,sr.blank_count,sr.net,sr.success_percent
    FROM exam_participants ep JOIN exams e ON e.id=ep.exam_id JOIN subject_results sr ON sr.participant_id=ep.id JOIN subjects s ON s.id=sr.subject_id
    WHERE ep.student_id=? AND ep.exam_id IN (${examSql}) ${subjectFilterSql}
    ORDER BY s.name,coalesce(e.exam_date,e.created_at),e.title`).bind(...subjectParams));
  const outcomeParams:any[]=[studentId,...selectedIds];let outcomeFilterSql='';if(access.subjectFilter?.length){outcomeFilterSql=` AND o.subject_id IN (${placeholders(access.subjectFilter)})`;outcomeParams.push(...access.subjectFilter)}
  const outcomeRaw=publishedView?mergeSnapshotOutcomes(usableSnapshots.filter(row=>examSet.has(String(row.exam_id))).flatMap(row=>row.data.outcomes)):await all<any>(env.DB.prepare(`SELECT o.id outcome_id,o.code,o.topic,o.subtopic,o.title,s.id subject_id,s.name subject_name,sum(r.evidence_count) evidence_count,sum(r.correct_count) correct_count
    FROM outcome_results r JOIN outcomes o ON o.id=r.outcome_id JOIN subjects s ON s.id=o.subject_id
    WHERE r.student_id=? AND r.exam_id IN (${examSql}) ${outcomeFilterSql}
    GROUP BY o.id,o.code,o.topic,o.subtopic,o.title,s.id,s.name ORDER BY s.name,o.topic,o.title`).bind(...outcomeParams));
  const outcomes=outcomeRaw.map(o=>{const evidence=Number(o.evidence_count||0),correct=Number(o.correct_count||0),rate=evidence?correct/evidence:0;return {...o,evidence_count:evidence,correct_count:correct,success_rate:rate,mastery_status:masteryStatus(correct,evidence)}});
  const subjectGroups=new Map<string,any[]>();for(const row of subjectTrend){if(!subjectGroups.has(row.subject_id))subjectGroups.set(row.subject_id,[]);subjectGroups.get(row.subject_id)!.push(row)}
  const subjectSummary=[...subjectGroups.values()].map(rows=>{const ordered=[...rows].sort((a,b)=>String(a.exam_date||'').localeCompare(String(b.exam_date||'')));const first=ordered[0],last=ordered.at(-1);const avg=rows.reduce((s,r)=>s+Number(r.net||0),0)/rows.length;return {subject_id:first.subject_id,subject_name:first.subject_name,exam_count:rows.length,first_net:Number(first.net||0),last_net:Number(last?.net||0),delta_net:Number((Number(last?.net||0)-Number(first.net||0)).toFixed(4)),average_net:Number(avg.toFixed(4))}});
  let summary:any=null;let examsForClient=selectedExams;
  if(access.restricted){examsForClient=selectedExams.map(({correct_count,wrong_count,blank_count,net,score,success_percent,institution_rank,...rest})=>rest)}else{const chronological=[...selectedExams].sort((a,b)=>String(a.exam_date||'').localeCompare(String(b.exam_date||'')));const first=chronological[0],last=chronological.at(-1);const avg=selectedExams.reduce((s,e)=>s+Number(e.net||0),0)/selectedExams.length;summary={exam_count:selectedExams.length,first_net:Number(first?.net||0),last_net:Number(last?.net||0),delta_net:Number((Number(last?.net||0)-Number(first?.net||0)).toFixed(4)),average_net:Number(avg.toFixed(4)),latest_rank:last?.institution_rank||null}}
  return json({ok:true,student:access.student,unavailableSnapshotExamIds,restrictedToSubjects:access.restricted,availableExams:allExams.map(e=>access.restricted?{exam_id:e.exam_id,title:e.title,exam_date:e.exam_date,exam_type:e.exam_type,academic_year:e.academic_year}:e),selectedExamIds:selectedIds,exams:examsForClient,summary,subjectTrend,subjectSummary,outcomes,developing:outcomes.filter(o=>o.mastery_status==='DEVELOPING').sort((a,b)=>a.success_rate-b.success_rate),strong:outcomes.filter(o=>o.mastery_status==='STRONG').sort((a,b)=>b.success_rate-a.success_rate)});
}

export default {async fetch(request:Request,env:Env):Promise<Response>{const url=new URL(request.url);if(!url.pathname.startsWith('/api/reporting'))return answerApp.fetch(request,env);try{const auth=await requireUser(env,request);if(auth instanceof Response)return auth;if(url.pathname==='/api/reporting/guidance/classes'||url.pathname==='/api/reporting/guidance/frozen-exams'||url.pathname==='/api/reporting/guidance/frozen-summary'){if(request.method!=='GET')return apiError(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');if(url.pathname.endsWith('/classes'))return await listGuidanceReportClasses(env,auth,url);return await guidanceFrozenReport(env,auth,url,url.pathname.endsWith('/frozen-exams')?'exams':'summary');}if(url.pathname==='/api/reporting/institution/frozen-exams'){if(request.method!=='GET')return apiError(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');return await listInstitutionFrozenExams(env,auth,url);}if(url.pathname==='/api/reporting/institution/frozen-summary'){if(request.method!=='GET')return apiError(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');return await institutionFrozenSummary(env,auth,url);}const activity=handleFrozenFoyGameReport(request,env,auth);if(activity)return await activity;const expanded=url.pathname.match(/^\/api\/reporting\/students\/([^/]+)\/frozen-expanded$/);if(expanded){if(request.method!=='GET')return apiError(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');return await selectedExpandedFrozenReport(request,env,auth,expanded[1],url);}if(url.pathname==='/api/reporting/students'&&request.method==='GET')return listStudents(env,auth,url);const combinedFrozen=url.pathname.match(/^\/api\/reporting\/students\/([^/]+)\/frozen-combined$/);if(combinedFrozen&&request.method==='GET')return selectedCombinedFrozenReport(env,auth,combinedFrozen[1],url);const miniTests=url.pathname.match(/^\/api\/reporting\/students\/([^/]+)\/frozen-mini-tests$/);if(miniTests&&request.method==='GET')return selectedFrozenMiniTestReport(env,auth,miniTests[1],url);const miniRuns=url.pathname.match(/^\/api\/reporting\/students\/([^/]+)\/mini-test-runs$/);if(miniRuns&&request.method==='GET')return await listFrozenMiniTestRuns(env,auth,miniRuns[1],url);const practiceRuns=url.pathname.match(/^\/api\/reporting\/students\/([^/]+)\/practice-runs$/);if(practiceRuns&&request.method==='GET')return listFrozenPracticeRuns(env,auth,practiceRuns[1],url);const practice=url.pathname.match(/^\/api\/reporting\/students\/([^/]+)\/frozen-practice$/);if(practice&&request.method==='GET')return selectedFrozenPracticeReport(env,auth,practice[1],url);const frozen=url.pathname.match(/^\/api\/reporting\/students\/([^/]+)\/frozen-exams$/);if(frozen&&request.method==='GET')return selectedFrozenExamReport(env,auth,frozen[1],url);const combined=url.pathname.match(/^\/api\/reporting\/students\/([^/]+)\/combined$/);if(combined&&request.method==='GET')return combinedReport(env,auth,combined[1],url);return notFound('Raporlama API yolu bulunamadı.')}catch(e){console.error('Reporting error',e);return apiError(500,'SERVER_ERROR','Rapor hazırlanırken sunucu hatası oluştu.')}}} satisfies ExportedHandler<Env>;
