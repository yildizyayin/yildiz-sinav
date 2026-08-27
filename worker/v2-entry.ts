import finalApp from './final-entry';
import type { AuthUser, Env } from './types';
import { getAuthUser, hashPassword } from './lib/auth';
import { all, audit, json, normalizeName, one, uuid } from './lib/db';

function apiError(status:number,code:string,message:string,details?:unknown){return json({ok:false,error:{code,message,details}},status)}

async function requireUser(env:Env,request:Request):Promise<AuthUser|Response>{
  return (await getAuthUser(env,request)) || apiError(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');
}

function canManage(role:AuthUser['role']){return role==='SUPER_ADMIN'||role==='INSTITUTION_MANAGER'}

function resolveInstitution(user:AuthUser,requested:string|null|undefined){
  return user.role==='SUPER_ADMIN' ? (requested||null) : (user.institution_id||null);
}

async function ensureInstitution(env:Env,user:AuthUser,institutionId:string){
  if(user.role==='SUPER_ADMIN')return Boolean(await one(env.DB.prepare('SELECT id FROM institutions WHERE id=?').bind(institutionId)));
  return user.institution_id===institutionId;
}

async function institutionDashboard(env:Env,user:AuthUser,url:URL):Promise<Response>{
  if(!canManage(user.role))return apiError(403,'FORBIDDEN','Kurum paneline erişim yetkiniz yok.');
  const institutionId=resolveInstitution(user,url.searchParams.get('institutionId'));
  if(!institutionId)return apiError(400,'INSTITUTION_REQUIRED','Kurum seçilmelidir.');
  if(!(await ensureInstitution(env,user,institutionId)))return apiError(403,'FORBIDDEN','Bu kuruma erişim yetkiniz yok.');
  const [institution,activeStudents,classes,activeExams,pendingScans,assignedWorksheets,recentExams]=await Promise.all([
    one<any>(env.DB.prepare('SELECT id,name,code,status,demo_mode FROM institutions WHERE id=?').bind(institutionId)),
    one<{c:number}>(env.DB.prepare(`SELECT count(DISTINCT e.student_id) c FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.institution_id=? AND e.status='ACTIVE' AND s.status='ACTIVE'`).bind(institutionId)),
    one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM classes c JOIN institution_seasons s ON s.id=c.season_id WHERE c.institution_id=? AND c.active=1 AND s.status='ACTIVE'`).bind(institutionId)),
    one<{c:number}>(env.DB.prepare(`SELECT count(DISTINCT e.id) c FROM exams e LEFT JOIN exam_institutions ei ON ei.exam_id=e.id AND ei.institution_id=? WHERE e.status='ACTIVE' AND (e.institution_id=? OR e.institution_id IS NULL OR ei.enabled=1)`).bind(institutionId,institutionId)),
    one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM scan_batches WHERE institution_id=? AND status IN ('PREVIEW','NEEDS_REVIEW','READY')`).bind(institutionId)),
    one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM worksheet_assignments WHERE institution_id=? AND status='ACTIVE'`).bind(institutionId)),
    all<any>(env.DB.prepare(`SELECT DISTINCT e.id,e.title,e.exam_type,e.grade_level,e.exam_date,e.status FROM exams e LEFT JOIN exam_institutions ei ON ei.exam_id=e.id AND ei.institution_id=? WHERE (e.institution_id=? OR e.institution_id IS NULL OR ei.enabled=1) ORDER BY coalesce(e.exam_date,e.created_at) DESC LIMIT 8`).bind(institutionId,institutionId)),
  ]);
  const worksheetPublished=await one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM worksheets WHERE status='PUBLISHED'`));
  return json({ok:true,institution,cards:[
    {label:'Aktif Öğrenci',value:activeStudents?.c??0},
    {label:'Aktif Sınıf',value:classes?.c??0},
    {label:'Aktif Sınav',value:activeExams?.c??0},
    {label:'Bekleyen Optik',value:pendingScans?.c??0},
    {label:'Atanmış Föy',value:assignedWorksheets?.c??0},
    {label:'Yayınlanmış Föy',value:worksheetPublished?.c??0},
  ],recentExams});
}

async function opticalPrepareV2(env:Env,user:AuthUser,url:URL):Promise<Response>{
  if(!canManage(user.role))return apiError(403,'FORBIDDEN','Optik hazırlama yetkiniz yok.');
  const classId=url.searchParams.get('classId');
  const templateVersionId=url.searchParams.get('templateVersionId');
  const examId=url.searchParams.get('examId');
  const sort=url.searchParams.get('sort')==='name'?'name':'number';
  if(!classId||!templateVersionId)return apiError(400,'VALIDATION_ERROR','Sınıf ve optik şablon seçilmelidir.');
  const cls=await one<any>(env.DB.prepare('SELECT * FROM classes WHERE id=?').bind(classId));
  if(!cls||!(await ensureInstitution(env,user,cls.institution_id)))return apiError(403,'FORBIDDEN','Bu sınıfa erişim yetkiniz yok.');
  const template=await one<any>(env.DB.prepare(`SELECT v.*,t.name FROM optical_template_versions v JOIN optical_templates t ON t.id=v.template_id WHERE v.id=? AND v.active=1`).bind(templateVersionId));
  if(!template)return apiError(404,'NOT_FOUND','Optik şablon bulunamadı.');
  if(!template.print_fields)return apiError(400,'TEMPLATE_DEFINITION_REQUIRED','Bu optik için baskı koordinatları henüz tanımlanmamış.');
  const institution=await one<any>(env.DB.prepare('SELECT id,name,code FROM institutions WHERE id=?').bind(cls.institution_id));
  let exam:any=null;
  let bookletCodes:string[]=[];
  if(examId){
    exam=await one<any>(env.DB.prepare(`SELECT DISTINCT e.id,e.title,e.exam_type,e.grade_level,e.exam_date FROM exams e LEFT JOIN exam_institutions ei ON ei.exam_id=e.id AND ei.institution_id=? WHERE e.id=? AND (e.institution_id=? OR e.institution_id IS NULL OR ei.enabled=1)`).bind(cls.institution_id,examId,cls.institution_id));
    if(!exam)return apiError(404,'EXAM_NOT_FOUND','Seçilen sınav bu kurum için kullanılamıyor.');
    bookletCodes=(await all<{code:string}>(env.DB.prepare(`SELECT code FROM exam_booklets WHERE exam_id=? AND active=1 ORDER BY code`).bind(examId))).map(x=>x.code);
  }
  const requestedBooklets=(url.searchParams.get('bookletSet')||'').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
  if(requestedBooklets.length)bookletCodes=requestedBooklets;
  if(!bookletCodes.length)bookletCodes=['A'];
  const rows=await all<any>(env.DB.prepare(`SELECT s.id,s.first_name,s.last_name,e.student_number,e.grade_level,e.section FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.class_id=? AND e.status='ACTIVE' AND s.status='ACTIVE' ORDER BY ${sort==='name'?'s.normalized_name':`cast(e.student_number as integer),e.student_number,s.normalized_name`}`).bind(classId));
  const participants=examId?await all<any>(env.DB.prepare(`SELECT student_id,booklet_code FROM exam_participants WHERE exam_id=? AND institution_id=? AND student_id IS NOT NULL`).bind(examId,cls.institution_id)):[];
  const participantMap=new Map(participants.map((p:any)=>[p.student_id,p.booklet_code]));
  const students=rows.map((s:any,index:number)=>({...s,booklet_code:participantMap.get(s.id)||bookletCodes[index%bookletCodes.length]}));
  return json({ok:true,template:{id:template.id,name:template.name,pageWidthMm:template.page_width_mm,pageHeightMm:template.page_height_mm,printFields:JSON.parse(template.print_fields)},institution,class:cls,exam,bookletCodes,students});
}

async function bulkOptions(env:Env,user:AuthUser,url:URL):Promise<Response>{
  if(!canManage(user.role))return apiError(403,'FORBIDDEN','Toplu işlem yetkiniz yok.');
  const institutionId=resolveInstitution(user,url.searchParams.get('institutionId'));
  if(!institutionId)return apiError(400,'INSTITUTION_REQUIRED','Kurum seçilmelidir.');
  if(!(await ensureInstitution(env,user,institutionId)))return apiError(403,'FORBIDDEN','Bu kuruma erişim yetkiniz yok.');
  const [classes,worksheets,exams]=await Promise.all([
    all<any>(env.DB.prepare(`SELECT c.id,c.name,c.grade_level,c.section,(SELECT count(*) FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.class_id=c.id AND e.status='ACTIVE' AND s.status='ACTIVE') student_count FROM classes c JOIN institution_seasons se ON se.id=c.season_id WHERE c.institution_id=? AND c.active=1 AND se.status='ACTIVE' ORDER BY c.grade_level,c.section`).bind(institutionId)),
    all<any>(env.DB.prepare(`SELECT id,title,program_code,grade_level,track,sequence_no FROM worksheets WHERE status='PUBLISHED' ORDER BY academic_year DESC,program_code,coalesce(grade_level,99),track,sequence_no`)),
    all<any>(env.DB.prepare(`SELECT DISTINCT e.id,e.title,e.exam_type,e.grade_level,e.exam_date FROM exams e LEFT JOIN exam_institutions ei ON ei.exam_id=e.id AND ei.institution_id=? WHERE e.status IN ('DRAFT','ACTIVE') AND (e.institution_id=? OR e.institution_id IS NULL OR ei.enabled=1) ORDER BY coalesce(e.exam_date,e.created_at) DESC`).bind(institutionId,institutionId)),
  ]);
  return json({ok:true,institutionId,classes,worksheets,exams});
}

type RecoveryState='READY'|'NO_ACTION'|'INSUFFICIENT_EVIDENCE'|'NO_WORKSHEET'|'ALREADY_ASSIGNED';

type RecoveryRecommendation={
  classId:string;className:string;gradeLevel:number;section:string;studentCount:number;
  state:RecoveryState;reason:string;evidenceCount:number;
  weakOutcomes:Array<{outcomeId:string;outcomeCode:string|null;outcomeTitle:string;topic:string|null;subjectId:string;subjectName:string;evidenceCount:number;correctCount:number;successRate:number;measuredStudents:number}>;
  worksheet:null|{id:string;title:string;programCode:string;gradeLevel:number|null;track:string;sequenceNo:number;matchedOutcomeCount:number;alreadyAssigned:boolean};
};

async function buildRecoveryRecommendations(env:Env,institutionId:string,classIds:string[]):Promise<RecoveryRecommendation[]>{
  const recommendations:RecoveryRecommendation[]=[];
  for(const classId of classIds){
    const cls=await one<any>(env.DB.prepare(`SELECT c.id,c.name,c.grade_level,c.section,(SELECT count(*) FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.class_id=c.id AND e.status='ACTIVE' AND s.status='ACTIVE') student_count FROM classes c JOIN institution_seasons se ON se.id=c.season_id WHERE c.id=? AND c.institution_id=? AND c.active=1 AND se.status='ACTIVE'`).bind(classId,institutionId));
    if(!cls)continue;
    const totalEvidence=await one<{evidence_count:number|null}>(env.DB.prepare(`SELECT sum(r.evidence_count) evidence_count FROM outcome_results r JOIN student_enrollments e ON e.student_id=r.student_id AND e.status='ACTIVE' JOIN student_entities st ON st.id=r.student_id AND st.status='ACTIVE' WHERE e.class_id=? AND e.institution_id=?`).bind(classId,institutionId));
    const evidenceCount=Number(totalEvidence?.evidence_count||0);
    const weakRows=await all<any>(env.DB.prepare(`SELECT o.id outcome_id,o.code outcome_code,o.title outcome_title,o.topic,s.id subject_id,s.name subject_name,sum(r.evidence_count) evidence_count,sum(r.correct_count) correct_count,count(DISTINCT r.student_id) measured_students FROM outcome_results r JOIN student_enrollments e ON e.student_id=r.student_id AND e.status='ACTIVE' JOIN student_entities st ON st.id=r.student_id AND st.status='ACTIVE' JOIN outcomes o ON o.id=r.outcome_id AND o.active=1 JOIN subjects s ON s.id=o.subject_id WHERE e.class_id=? AND e.institution_id=? GROUP BY o.id,o.code,o.title,o.topic,s.id,s.name HAVING sum(r.evidence_count)>=3 AND (cast(sum(r.correct_count) as real)/nullif(sum(r.evidence_count),0))<0.60 ORDER BY (cast(sum(r.correct_count) as real)/nullif(sum(r.evidence_count),0)) ASC,sum(r.evidence_count) DESC,o.title LIMIT 5`).bind(classId,institutionId));
    const weakOutcomes=weakRows.map((r:any)=>({outcomeId:r.outcome_id,outcomeCode:r.outcome_code||null,outcomeTitle:r.outcome_title,topic:r.topic||null,subjectId:r.subject_id,subjectName:r.subject_name,evidenceCount:Number(r.evidence_count||0),correctCount:Number(r.correct_count||0),successRate:Number(r.evidence_count)?Math.round((Number(r.correct_count)/Number(r.evidence_count))*1000)/10:0,measuredStudents:Number(r.measured_students||0)}));
    if(!evidenceCount){recommendations.push({classId,className:cls.name,gradeLevel:Number(cls.grade_level),section:cls.section,studentCount:Number(cls.student_count||0),state:'INSUFFICIENT_EVIDENCE',reason:'Bu sınıf için henüz güvenilir kazanım kanıtı oluşmadı. Önce sınav/optik sonuçlarıyla ölçüm yapılmalı.',evidenceCount,weakOutcomes:[],worksheet:null});continue}
    if(!weakOutcomes.length){recommendations.push({classId,className:cls.name,gradeLevel:Number(cls.grade_level),section:cls.section,studentCount:Number(cls.student_count||0),state:'NO_ACTION',reason:'Mevcut kanıtlarda %60 altına düşen ve en az 3 kanıtı bulunan kazanım yok. Recovery ataması gerekmiyor.',evidenceCount,weakOutcomes:[],worksheet:null});continue}
    const ids=weakOutcomes.map(x=>x.outcomeId);const placeholders=ids.map(()=>'?').join(',');
    const candidates=await all<any>(env.DB.prepare(`SELECT w.id,w.title,w.program_code,w.grade_level,w.track,w.sequence_no,count(DISTINCT wo.outcome_id) matched_outcome_count,CASE WHEN wa.id IS NULL THEN 0 ELSE 1 END already_assigned FROM worksheets w JOIN worksheet_outcomes wo ON wo.worksheet_id=w.id LEFT JOIN worksheet_assignments wa ON wa.worksheet_id=w.id AND wa.class_id=? AND wa.status='ACTIVE' WHERE w.status='PUBLISHED' AND (w.grade_level IS NULL OR w.grade_level=?) AND wo.outcome_id IN (${placeholders}) GROUP BY w.id,w.title,w.program_code,w.grade_level,w.track,w.sequence_no,wa.id ORDER BY already_assigned ASC,matched_outcome_count DESC,w.sequence_no ASC,w.title ASC LIMIT 3`).bind(classId,Number(cls.grade_level),...ids));
    if(!candidates.length){recommendations.push({classId,className:cls.name,gradeLevel:Number(cls.grade_level),section:cls.section,studentCount:Number(cls.student_count||0),state:'NO_WORKSHEET',reason:'Zayıf kazanımlar doğrulandı; ancak bu kazanımlarla eşleşen yayınlanmış föy bulunamadı. Föy Merkezi’nde içerik eşlemesi yapılmalı.',evidenceCount,weakOutcomes,worksheet:null});continue}
    const candidate=candidates[0];const alreadyAssigned=Boolean(candidate.already_assigned);
    const worksheet={id:candidate.id,title:candidate.title,programCode:candidate.program_code,gradeLevel:candidate.grade_level==null?null:Number(candidate.grade_level),track:candidate.track,sequenceNo:Number(candidate.sequence_no),matchedOutcomeCount:Number(candidate.matched_outcome_count||0),alreadyAssigned};
    recommendations.push({classId,className:cls.name,gradeLevel:Number(cls.grade_level),section:cls.section,studentCount:Number(cls.student_count||0),state:alreadyAssigned?'ALREADY_ASSIGNED':'READY',reason:alreadyAssigned?'En uygun föy bu sınıfa zaten aktif olarak atanmış. Yeni kayıt oluşturulmayacak.':`Nibiru, ölçülmüş zayıf kazanımların ${worksheet.matchedOutcomeCount} tanesiyle eşleşen yayınlanmış föyü öneriyor. Atama yalnız yönetici onayıyla yapılır.`,evidenceCount,weakOutcomes,worksheet});
  }
  return recommendations;
}

async function bulkRecoveryPreview(request:Request,env:Env,user:AuthUser):Promise<Response>{
  if(!canManage(user.role))return apiError(403,'FORBIDDEN','Toplu işlem yetkiniz yok.');
  const body=await request.json<{institutionId?:string;classIds?:string[]}>();
  const institutionId=resolveInstitution(user,body.institutionId);
  if(!institutionId||!Array.isArray(body.classIds)||!body.classIds.length)return apiError(400,'VALIDATION_ERROR','Kurum ve en az bir sınıf seçilmelidir.');
  if(!(await ensureInstitution(env,user,institutionId)))return apiError(403,'FORBIDDEN','Bu kuruma erişim yetkiniz yok.');
  const classIds=[...new Set(body.classIds)];
  if(classIds.length>100)return apiError(400,'TOO_MANY_CLASSES','Tek önizlemede en fazla 100 sınıf seçilebilir.');
  for(const classId of classIds){const cls=await one<any>(env.DB.prepare('SELECT id,institution_id FROM classes WHERE id=? AND active=1').bind(classId));if(!cls||cls.institution_id!==institutionId)return apiError(400,'CLASS_SCOPE_ERROR','Seçilen sınıflardan biri bu kuruma ait değil.');}
  const recommendations=await buildRecoveryRecommendations(env,institutionId,classIds);
  const ready=recommendations.filter(x=>x.state==='READY').length;
  return json({ok:true,institutionId,policy:{source:'VERIFIED_ASSESSMENT_EVIDENCE',humanApprovalRequired:true,autoAssignment:false,minEvidencePerOutcome:3,weaknessThresholdPercent:60,fabricatedIdsAllowed:false},summary:{classes:classIds.length,ready,noAction:recommendations.filter(x=>x.state==='NO_ACTION').length,insufficientEvidence:recommendations.filter(x=>x.state==='INSUFFICIENT_EVIDENCE').length,noWorksheet:recommendations.filter(x=>x.state==='NO_WORKSHEET').length,alreadyAssigned:recommendations.filter(x=>x.state==='ALREADY_ASSIGNED').length},recommendations});
}

async function bulkExecute(request:Request,env:Env,user:AuthUser):Promise<Response>{
  if(!canManage(user.role))return apiError(403,'FORBIDDEN','Toplu işlem yetkiniz yok.');
  const body=await request.json<{institutionId?:string;operation?:'ASSIGN_WORKSHEET'|'CREATE_EXAM_PARTICIPANTS'|'ASSIGN_RECOVERY_RECOMMENDATIONS';classIds?:string[];worksheetId?:string;examId?:string;dueDate?:string|null}>();
  const institutionId=resolveInstitution(user,body.institutionId);
  if(!institutionId||!body.operation||!Array.isArray(body.classIds)||!body.classIds.length)return apiError(400,'VALIDATION_ERROR','Kurum, işlem ve en az bir sınıf seçilmelidir.');
  if(!(await ensureInstitution(env,user,institutionId)))return apiError(403,'FORBIDDEN','Bu kuruma erişim yetkiniz yok.');
  const classIds=[...new Set(body.classIds)];
  for(const classId of classIds){const cls=await one<any>(env.DB.prepare('SELECT id,institution_id FROM classes WHERE id=? AND active=1').bind(classId));if(!cls||cls.institution_id!==institutionId)return apiError(400,'CLASS_SCOPE_ERROR','Seçilen sınıflardan biri bu kuruma ait değil.');}
  const jobId=uuid('bulk');
  let summary:any={};
  if(body.operation==='ASSIGN_WORKSHEET'){
    if(!body.worksheetId)return apiError(400,'WORKSHEET_REQUIRED','Föy seçilmelidir.');
    const worksheet=await one<any>(env.DB.prepare(`SELECT id,title FROM worksheets WHERE id=? AND status='PUBLISHED'`).bind(body.worksheetId));
    if(!worksheet)return apiError(404,'WORKSHEET_NOT_FOUND','Yayınlanmış föy bulunamadı.');
    let created=0,skipped=0;
    for(const classId of classIds){
      const exists=await one(env.DB.prepare('SELECT id FROM worksheet_assignments WHERE worksheet_id=? AND class_id=?').bind(body.worksheetId,classId));
      if(exists){skipped++;continue}
      await env.DB.prepare(`INSERT INTO worksheet_assignments(id,worksheet_id,institution_id,class_id,assigned_by,due_date) VALUES(?,?,?,?,?,?)`).bind(uuid('wsa'),body.worksheetId,institutionId,classId,user.id,body.dueDate||null).run();created++;
    }
    summary={created,skipped,worksheet:worksheet.title,classes:classIds.length};
  }else if(body.operation==='CREATE_EXAM_PARTICIPANTS'){
    if(!body.examId)return apiError(400,'EXAM_REQUIRED','Sınav seçilmelidir.');
    const exam=await one<any>(env.DB.prepare(`SELECT DISTINCT e.id,e.title FROM exams e LEFT JOIN exam_institutions ei ON ei.exam_id=e.id AND ei.institution_id=? WHERE e.id=? AND (e.institution_id=? OR e.institution_id IS NULL OR ei.enabled=1)`).bind(institutionId,body.examId,institutionId));
    if(!exam)return apiError(404,'EXAM_NOT_FOUND','Sınav bu kurum için kullanılamıyor.');
    const booklets=(await all<{code:string}>(env.DB.prepare('SELECT code FROM exam_booklets WHERE exam_id=? AND active=1 ORDER BY code').bind(body.examId))).map(x=>x.code);
    const codes=booklets.length?booklets:['A'];
    let created=0,skipped=0,index=0;
    for(const classId of classIds){
      const students=await all<any>(env.DB.prepare(`SELECT s.id,s.first_name,s.last_name,e.student_number,c.name class_name,se.id season_id FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id JOIN classes c ON c.id=e.class_id JOIN institution_seasons se ON se.id=e.season_id WHERE e.class_id=? AND e.status='ACTIVE' AND s.status='ACTIVE'`).bind(classId));
      for(const s of students){
        const exists=await one(env.DB.prepare('SELECT id FROM exam_participants WHERE exam_id=? AND institution_id=? AND student_id=?').bind(body.examId,institutionId,s.id));
        if(exists){skipped++;continue}
        await env.DB.prepare(`INSERT INTO exam_participants(id,exam_id,institution_id,season_id,student_id,student_number_snapshot,name_snapshot,class_snapshot,booklet_code,participant_status) VALUES(?,?,?,?,?,?,?,?,?,'ACTIVE')`).bind(uuid('ep'),body.examId,institutionId,s.season_id,s.id,s.student_number,`${s.first_name} ${s.last_name}`,s.class_name,codes[index%codes.length]).run();created++;index++;
      }
    }
    summary={created,skipped,exam:exam.title,classes:classIds.length,booklets:codes};
  }else if(body.operation==='ASSIGN_RECOVERY_RECOMMENDATIONS'){
    const recommendations=await buildRecoveryRecommendations(env,institutionId,classIds);let created=0,skipped=0,noRecommendation=0;const details:any[]=[];
    for(const rec of recommendations){
      if(rec.state!=='READY'||!rec.worksheet){noRecommendation++;details.push({classId:rec.classId,className:rec.className,state:rec.state,created:false});continue}
      const exists=await one(env.DB.prepare('SELECT id FROM worksheet_assignments WHERE worksheet_id=? AND class_id=?').bind(rec.worksheet.id,rec.classId));
      if(exists){skipped++;details.push({classId:rec.classId,className:rec.className,state:'ALREADY_ASSIGNED',worksheetId:rec.worksheet.id,worksheetTitle:rec.worksheet.title,created:false});continue}
      await env.DB.prepare(`INSERT INTO worksheet_assignments(id,worksheet_id,institution_id,class_id,assigned_by,due_date) VALUES(?,?,?,?,?,?)`).bind(uuid('wsa'),rec.worksheet.id,institutionId,rec.classId,user.id,body.dueDate||null).run();created++;details.push({classId:rec.classId,className:rec.className,state:'ASSIGNED',worksheetId:rec.worksheet.id,worksheetTitle:rec.worksheet.title,matchedOutcomeCount:rec.worksheet.matchedOutcomeCount,created:true});
    }
    summary={created,skipped,noRecommendation,classes:classIds.length,verifiedRecovery:true,humanApproved:true,details};
  }else return apiError(400,'INVALID_OPERATION','Desteklenmeyen toplu işlem.');
  await env.DB.prepare(`INSERT INTO bulk_operation_jobs(id,institution_id,operation_type,status,payload_json,summary_json,created_by,completed_at) VALUES(?,?,?,'COMPLETED',?,?,?,CURRENT_TIMESTAMP)`).bind(jobId,institutionId,body.operation,JSON.stringify(body),JSON.stringify(summary),user.id).run();
  await audit(env.DB,user.id,institutionId,'BULK_OPERATION_COMPLETED','bulk_operation',jobId,{operation:body.operation,summary});
  return json({ok:true,jobId,summary});
}

async function demoStatus(env:Env,user:AuthUser):Promise<Response>{
  if(user.role!=='SUPER_ADMIN')return apiError(403,'FORBIDDEN','Demo yönetimini yalnız Süper Admin kullanabilir.');
  const rows=await all<any>(env.DB.prepare(`SELECT i.id,i.name,i.code,i.status,i.demo_mode,(SELECT count(DISTINCT e.student_id) FROM student_enrollments e WHERE e.institution_id=i.id) student_count,(SELECT count(*) FROM classes c WHERE c.institution_id=i.id AND c.active=1) class_count FROM institutions i WHERE i.demo_mode=1 ORDER BY i.created_at DESC`));
  return json({ok:true,demos:rows});
}

async function demoSeed(request:Request,env:Env,user:AuthUser):Promise<Response>{
  if(user.role!=='SUPER_ADMIN')return apiError(403,'FORBIDDEN','Demo oluşturmayı yalnız Süper Admin yapabilir.');
  const body=await request.json<{name?:string;managerUsername?:string;managerPassword?:string}>();
  const name=body.name?.trim()||'Anunex Demo Kurumu';
  const username=(body.managerUsername?.trim()||'').toLowerCase();
  const password=body.managerPassword||'';
  if(!username||password.length<8)return apiError(400,'VALIDATION_ERROR','Demo yönetici kullanıcı adı ve en az 8 karakter şifre gereklidir.');
  if(await one(env.DB.prepare('SELECT id FROM users WHERE lower(username)=lower(?)').bind(username)))return apiError(409,'USERNAME_EXISTS','Bu kullanıcı adı zaten kullanılıyor.');
  const institutionId=uuid('inst');const seasonId=uuid('season');const code=`DEMO${Date.now().toString().slice(-6)}`;
  await env.DB.prepare(`INSERT INTO institutions(id,name,code,city,district,status,demo_mode) VALUES(?,?,?,'İstanbul','Demo','ACTIVE',1)`).bind(institutionId,name,code).run();
  await env.DB.prepare(`INSERT INTO institution_seasons(id,institution_id,academic_year,status,started_at) VALUES(?,?,?,'ACTIVE',date('now'))`).bind(seasonId,institutionId,'2026-2027').run();
  const classIds:string[]=[];
  for(const [grade,section] of [[5,'A'],[5,'B'],[6,'A'],[6,'B'],[7,'A'],[7,'B'],[8,'A'],[8,'B']] as Array<[number,string]>){const id=uuid('class');classIds.push(id);await env.DB.prepare(`INSERT INTO classes(id,institution_id,season_id,grade_level,section,name) VALUES(?,?,?,?,?,?)`).bind(id,institutionId,seasonId,grade,section,`${grade}/${section}`).run();}
  const statements:D1PreparedStatement[]=[];
  for(let i=0;i<160;i++){
    const classIndex=i%classIds.length;const grade=5+Math.floor(classIndex/2);const section=classIndex%2===0?'A':'B';const studentId=uuid('stu');const enrollmentId=uuid('enr');const no=String(1001+i);
    statements.push(env.DB.prepare(`INSERT INTO student_entities(id,first_name,last_name,normalized_name,status,activated_at) VALUES(?,?,?,?, 'ACTIVE',CURRENT_TIMESTAMP)`).bind(studentId,'Demo',`Öğrenci ${String(i+1).padStart(3,'0')}`,normalizeName(`Demo Öğrenci ${i+1}`)));
    statements.push(env.DB.prepare(`INSERT INTO student_enrollments(id,student_id,institution_id,season_id,class_id,student_number,grade_level,section,status) VALUES(?,?,?,?,?,?,?,?, 'ACTIVE')`).bind(enrollmentId,studentId,institutionId,seasonId,classIds[classIndex],no,grade,section));
    if(statements.length>=80){await env.DB.batch(statements.splice(0,statements.length));}
  }
  if(statements.length)await env.DB.batch(statements);
  const passwordData=await hashPassword(password);const managerId=uuid('usr');
  await env.DB.prepare(`INSERT INTO users(id,institution_id,role,display_name,username,password_hash,password_salt,password_iterations,password_algo,active) VALUES(?,?,'INSTITUTION_MANAGER','Demo Kurum Yöneticisi',?,?,?,?, 'PBKDF2-SHA256-v1',1)`).bind(managerId,institutionId,username,passwordData.hash,passwordData.salt,passwordData.iterations).run();
  await audit(env.DB,user.id,institutionId,'DEMO_INSTITUTION_CREATED','institution',institutionId,{code,students:160,classes:8,managerUsername:username});
  return json({ok:true,institution:{id:institutionId,name,code},manager:{username},students:160,classes:8},201);
}

async function scaleHealth(env:Env,user:AuthUser):Promise<Response>{
  if(user.role!=='SUPER_ADMIN')return apiError(403,'FORBIDDEN','Ölçek altyapısını yalnız Süper Admin görebilir.');
  const [institutions,students,classes,exams,participants,results,scanRecords,worksheets,bulkJobs]=await Promise.all([
    one<{c:number}>(env.DB.prepare('SELECT count(*) c FROM institutions')),
    one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM student_entities WHERE status='ACTIVE'`)),
    one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM classes WHERE active=1`)),
    one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM exams WHERE status!='ARCHIVED'`)),
    one<{c:number}>(env.DB.prepare('SELECT count(*) c FROM exam_participants')),
    one<{c:number}>(env.DB.prepare('SELECT count(*) c FROM exam_results')),
    one<{c:number}>(env.DB.prepare('SELECT count(*) c FROM scan_records')),
    one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM worksheets WHERE status='PUBLISHED'`)),
    one<{c:number}>(env.DB.prepare('SELECT count(*) c FROM bulk_operation_jobs')),
  ]);
  const metrics={institutions:institutions?.c??0,students:students?.c??0,classes:classes?.c??0,exams:exams?.c??0,participants:participants?.c??0,results:results?.c??0,scanRecords:scanRecords?.c??0,publishedWorksheets:worksheets?.c??0,bulkJobs:bulkJobs?.c??0};
  const warnings:string[]=[];
  if(metrics.scanRecords>500000)warnings.push('Optik kayıt hacmi 500 bin üzeri: arşivleme/partition stratejisi planlanmalı.');
  if(metrics.results>500000)warnings.push('Sonuç hacmi 500 bin üzeri: ağır raporları özet tablolar üzerinden çalıştırın.');
  if(metrics.students>100000)warnings.push('Öğrenci hacmi 100 bin üzeri: toplu işlemleri queue/workflow katmanına taşıyın.');
  return json({ok:true,metrics,warnings,architecture:{runtime:'Cloudflare Workers',database:'D1',files:'R2',camera:'Browser OMR + Worker APIs',tenantIsolation:'institution_id + role scope',bulkMode:'job ledger',recommendedNextScaleStep:'Queues/Workflows for long-running batch jobs'}});
}

export default {async fetch(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url);
  const custom=url.pathname==='/api/optical-prepare'||url.pathname.startsWith('/api/v2/');
  if(!custom)return finalApp.fetch(request,env);
  try{
    const auth=await requireUser(env,request);if(auth instanceof Response)return auth;
    if(url.pathname==='/api/optical-prepare'&&request.method==='GET')return opticalPrepareV2(env,auth,url);
    if(url.pathname==='/api/v2/institution-dashboard'&&request.method==='GET')return institutionDashboard(env,auth,url);
    if(url.pathname==='/api/v2/bulk/options'&&request.method==='GET')return bulkOptions(env,auth,url);
    if(url.pathname==='/api/v2/bulk/recovery-preview'&&request.method==='POST')return bulkRecoveryPreview(request,env,auth);
    if(url.pathname==='/api/v2/bulk/execute'&&request.method==='POST')return bulkExecute(request,env,auth);
    if(url.pathname==='/api/v2/demo'&&request.method==='GET')return demoStatus(env,auth);
    if(url.pathname==='/api/v2/demo/seed'&&request.method==='POST')return demoSeed(request,env,auth);
    if(url.pathname==='/api/v2/scale/health'&&request.method==='GET')return scaleHealth(env,auth);
    return apiError(404,'NOT_FOUND','V2 API yolu bulunamadı.');
  }catch(error){console.error('V2 worker error',error);return apiError(500,'SERVER_ERROR','Sunucu hatası oluştu.');}
}} satisfies ExportedHandler<Env>;