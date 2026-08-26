import app from './nibiru-voice-entry';
import type {AuthUser,Env} from './types';
import {getAuthUser} from './lib/auth';
import {all,json,one} from './lib/db';
import {evaluateProviderActivation,evaluateStandardReadiness} from './lib/standard-readiness';
import {evaluateStandardPackageClosure} from './lib/standard-package-closure';
import {nibiruRoutingMatrix} from './lib/nibiru-model-router';

function fail(status:number,code:string,message:string){return json({ok:false,error:{code,message}},status)}
type OperationalCheck={key:string;label:string;state:'READY'|'SETUP_REQUIRED';value:number;detail:string;blocking:boolean};
type WorksheetScope={all:boolean;grades:number[];subjectIds:string[]|null;allowYks:boolean};

async function count(env:Env,sql:string){const row=await one<{c:number}>(env.DB.prepare(sql));return Number(row?.c||0)}
function uniqueNumbers(values:unknown[]){return [...new Set(values.map(Number).filter(x=>Number.isInteger(x)&&x>0))]}
function uniqueStrings(values:unknown[]){return [...new Set(values.map(String).filter(Boolean))]}

async function operationalChecks(env:Env):Promise<OperationalCheck[]>{
 const [readyOpticals,verifiedScoring,printableQuestions,completeWorksheets,registeredVideos,resultEvidence,officialTargets,activeInstitutions,activeStudents,teacherAssignments]=await Promise.all([
  count(env,`SELECT COUNT(*) c FROM optical_templates t WHERE t.active=1 AND t.status='READY' AND EXISTS(SELECT 1 FROM optical_template_versions v WHERE v.template_id=t.id AND v.active=1)`),
  count(env,`SELECT COUNT(*) c FROM scoring_rule_versions WHERE verified=1`),
  count(env,`SELECT COUNT(*) c FROM question_bank WHERE review_status='APPROVED' AND copyright_status IN ('OWNED','LICENSED','PUBLIC_DOMAIN')`),
  count(env,`SELECT COUNT(*) c FROM worksheets w WHERE w.status='PUBLISHED'
    AND EXISTS(SELECT 1 FROM worksheet_subjects ws WHERE ws.worksheet_id=w.id)
    AND EXISTS(SELECT 1 FROM worksheet_assets a WHERE a.worksheet_id=w.id AND a.asset_type='PDF')
    AND EXISTS(SELECT 1 FROM worksheet_assets a WHERE a.worksheet_id=w.id AND a.asset_type='ANSWER_KEY')
    AND (SELECT COUNT(*) FROM worksheet_question_links q WHERE q.worksheet_id=w.id)>=(SELECT COALESCE(SUM(question_count),0) FROM worksheet_subjects ws WHERE ws.worksheet_id=w.id)
    AND (SELECT COUNT(*) FROM worksheet_question_links q WHERE q.worksheet_id=w.id AND q.solution_url IS NOT NULL AND trim(q.solution_url)!='')>=(SELECT COALESCE(SUM(question_count),0) FROM worksheet_subjects ws WHERE ws.worksheet_id=w.id)
    AND (SELECT COUNT(*) FROM worksheet_question_links q WHERE q.worksheet_id=w.id AND q.topic_url IS NOT NULL AND trim(q.topic_url)!='')>=(SELECT COALESCE(SUM(question_count),0) FROM worksheet_subjects ws WHERE ws.worksheet_id=w.id)`),
  count(env,`SELECT COUNT(*) c FROM video_links WHERE approved=1 AND link_type IN ('SOLUTION','TOPIC') AND url IS NOT NULL AND trim(url)!=''`),
  count(env,`SELECT COUNT(*) c FROM exam_results`),
  count(env,`SELECT (SELECT COUNT(*) FROM secondary_school_targets WHERE active=1)+(SELECT COUNT(*) FROM university_program_targets WHERE active=1) c`),
  count(env,`SELECT COUNT(*) c FROM institutions WHERE status='ACTIVE'`),
  count(env,`SELECT COUNT(*) c FROM student_entities WHERE status='ACTIVE'`),
  count(env,`SELECT COUNT(*) c FROM teacher_assignments WHERE active=1`),
 ]);
 const make=(key:string,label:string,value:number,ready:string,missing:string,blocking:boolean):OperationalCheck=>({key,label,value,state:value>0?'READY':'SETUP_REQUIRED',detail:value>0?ready:missing,blocking});
 return [
  make('READY_OPTICAL','Okunabilir hazır optik şablonu',readyOpticals,`${readyOpticals} hazır optik şablonu var.`,'En az bir optik şablon READY durumuna getirilmelidir.',true),
  make('VERIFIED_SCORING','Doğrulanmış puanlama kuralı',verifiedScoring,`${verifiedScoring} doğrulanmış puanlama sürümü var.`,'Değerlendirme için doğrulanmış puanlama kuralı gerekir.',true),
  make('PRINTABLE_QUESTIONS','Basılabilir onaylı soru',printableQuestions,`${printableQuestions} soru Kişiye Özel Kitap / Sıfır Hata için kullanılabilir.`,'APPROVED + OWNED/LICENSED/PUBLIC_DOMAIN soru eklenmelidir.',true),
  make('COMPLETE_PUBLISHED_WORKSHEET','Tam yayınlanmış föy',completeWorksheets,`${completeWorksheets} föy PDF + cevap anahtarı + soru/video bağlantılarıyla tüketilebilir.`,'En az bir föy PDF, cevap anahtarı ve tüm soru destekleriyle yayınlanmalıdır.',true),
  make('REGISTERED_MICRO_VIDEO','Onaylı mikro öğrenme bağlantısı',registeredVideos,`${registeredVideos} onaylı çözüm/konu videosu kayıtlı.`,'Standard mikro öğrenme için en az bir onaylı çözüm veya konu videosu kaydı gerekir.',true),
  make('RESULT_EVIDENCE','Sonuç ve analiz kanıtı',resultEvidence,`${resultEvidence} değerlendirilmiş sonuç kaydı var.`,'Standard sonuç/analiz akışı için en az bir değerlendirilmiş sınav sonucu gerekir.',true),
  make('OFFICIAL_TARGET_DATA','LGS/YKS hedef verisi',officialTargets,`${officialTargets} resmî hedef kaydı hazır.`,'Gerçek hedef araması için doğrulanmış resmî hedef verisi içe aktarılmalıdır.',false),
  make('ACTIVE_INSTITUTION','Aktif kurum',activeInstitutions,`${activeInstitutions} aktif kurum var.`,'Kabul testi için aktif kurum gerekir.',true),
  make('ACTIVE_STUDENT','Aktif öğrenci',activeStudents,`${activeStudents} aktif öğrenci var.`,'Uçtan uca kabul testi için aktif öğrenci gerekir.',true),
  make('TEACHER_ASSIGNMENT','Öğretmen ataması',teacherAssignments,`${teacherAssignments} aktif öğretmen-sınıf/branş ataması var.`,'Öğretmen rolü kabul testi için en az bir atama gerekir.',true),
 ];
}

async function readiness(request:Request,env:Env){
 const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(user.role!=='SUPER_ADMIN')return fail(403,'SUPER_ADMIN_ONLY','Standard hazırlık denetimi yalnız Süper Admin içindir.');
 const rows=await all<{name:string}>(env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table'`));
 const providers=evaluateProviderActivation({youtubeApiKey:env.YOUTUBE_API_KEY,whatsappVerifyToken:env.WHATSAPP_VERIFY_TOKEN,whatsappAppSecret:env.WHATSAPP_APP_SECRET,whatsappAccessToken:env.WHATSAPP_ACCESS_TOKEN,whatsappPhoneNumberId:env.WHATSAPP_PHONE_NUMBER_ID});
 const report=evaluateStandardReadiness(rows.map(r=>r.name),{files:Boolean(env.FILES),ai:Boolean(env.AI),youtube:providers.youtube.ready,whatsapp:providers.whatsapp.ready});
 let operational:OperationalCheck[]=[];let operationalError:string|null=null;
 if(report.summary.missing===0){try{operational=await operationalChecks(env)}catch(e){operationalError=e instanceof Error?e.message:'OPERATIONAL_CHECK_FAILED'}}
 const closure=evaluateStandardPackageClosure(report.checks,operational,providers,operationalError);
 return json({ok:true,environment:env.ENVIRONMENT||'unknown',generatedAt:new Date().toISOString(),...report,providers,aiRouting:nibiruRoutingMatrix(env),operational,operationalError,acceptance:{
  coreReady:report.summary.coreReady,
  blockingSetup:closure.blockingSetup,
  packageConfigRequired:closure.packageConfigRequired,
  externalSetup:closure.optionalChannelSetup,
  optionalChannelSetup:closure.optionalChannelSetup,
  coreAcceptanceReady:closure.standardPackageReady,
  standardPackageReady:closure.standardPackageReady,
  saleReady:closure.saleReady,
  fullChannelReady:closure.fullChannelReady,
  standardAcceptanceReady:closure.standardPackageReady,
 }});
}

async function worksheetScope(env:Env,user:AuthUser):Promise<WorksheetScope>{
 if(user.role==='SUPER_ADMIN')return{all:true,grades:[],subjectIds:null,allowYks:true};
 if(user.role==='STUDENT'&&user.student_id){const rows=await all<any>(env.DB.prepare(`SELECT grade_level,status FROM student_enrollments WHERE student_id=? AND status IN ('ACTIVE','GRADUATED') ORDER BY created_at DESC`).bind(user.student_id));const grades=uniqueNumbers(rows.map(x=>x.grade_level));return{all:false,grades,subjectIds:null,allowYks:grades.some(g=>g>=12)||rows.some(x=>x.status==='GRADUATED')};}
 if(user.role==='PARENT'){const rows=await all<any>(env.DB.prepare(`SELECT e.grade_level,e.status FROM parent_student_links p JOIN student_enrollments e ON e.student_id=p.student_id WHERE p.parent_user_id=? AND p.active=1 AND e.status IN ('ACTIVE','GRADUATED')`).bind(user.id));const grades=uniqueNumbers(rows.map(x=>x.grade_level));return{all:false,grades,subjectIds:null,allowYks:grades.some(g=>g>=12)||rows.some(x=>x.status==='GRADUATED')};}
 if(user.role==='INSTITUTION_MANAGER'&&user.institution_id){const rows=await all<any>(env.DB.prepare(`SELECT DISTINCT c.grade_level FROM classes c JOIN institution_seasons s ON s.id=c.season_id WHERE c.institution_id=? AND c.active=1 AND s.status='ACTIVE'`).bind(user.institution_id));const grades=uniqueNumbers(rows.map(x=>x.grade_level));return{all:false,grades,subjectIds:null,allowYks:grades.some(g=>g>=12)};}
 if((user.role==='TEACHER'||user.role==='GUIDANCE_TEACHER')&&user.institution_id){const rows=await all<any>(env.DB.prepare(`SELECT c.grade_level,t.subject_id,t.assignment_type FROM teacher_assignments t LEFT JOIN classes c ON c.id=t.class_id WHERE t.user_id=? AND t.institution_id=? AND t.active=1`).bind(user.id,user.institution_id));const grades=uniqueNumbers(rows.map(x=>x.grade_level));const subjects=user.role==='TEACHER'?uniqueStrings(rows.filter(x=>x.assignment_type==='SUBJECT').map(x=>x.subject_id)):null;return{all:false,grades,subjectIds:subjects,allowYks:grades.some(g=>g>=12)};}
 return{all:false,grades:[],subjectIds:[],allowYks:false};
}

function worksheetAllowed(row:any,scope:WorksheetScope){
 if(scope.all)return true;const program=String(row.program_code||'SCHOOL');
 const gradeOk=program==='SCHOOL'?scope.grades.includes(Number(row.grade_level)):scope.allowYks&&['TYT','AYT'].includes(program);if(!gradeOk)return false;
 if(scope.subjectIds===null)return true;if(!scope.subjectIds.length)return false;const rowSubjects=String(row.subject_ids||'').split(',').filter(Boolean);return rowSubjects.some(x=>scope.subjectIds!.includes(x));
}

async function listWorksheets(request:Request,env:Env,url:URL){
 const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');const scope=await worksheetScope(env,user);
 const rows=await all<any>(env.DB.prepare(`SELECT w.*,
  (SELECT group_concat(s.name, ', ') FROM worksheet_subjects ws JOIN subjects s ON s.id=ws.subject_id WHERE ws.worksheet_id=w.id) subjects,
  (SELECT group_concat(ws.subject_id, ',') FROM worksheet_subjects ws WHERE ws.worksheet_id=w.id) subject_ids,
  (SELECT COALESCE(SUM(question_count),0) FROM worksheet_subjects ws WHERE ws.worksheet_id=w.id) total_questions,
  (SELECT id FROM worksheet_assets a WHERE a.worksheet_id=w.id AND a.asset_type='PDF' ORDER BY created_at DESC LIMIT 1) pdf_asset_id,
  (SELECT file_name FROM worksheet_assets a WHERE a.worksheet_id=w.id AND a.asset_type='PDF' ORDER BY created_at DESC LIMIT 1) pdf_file_name,
  (SELECT id FROM worksheet_assets a WHERE a.worksheet_id=w.id AND a.asset_type='ANSWER_KEY' ORDER BY created_at DESC LIMIT 1) answer_key_asset_id,
  (SELECT file_name FROM worksheet_assets a WHERE a.worksheet_id=w.id AND a.asset_type='ANSWER_KEY' ORDER BY created_at DESC LIMIT 1) answer_key_file_name,
  (SELECT COUNT(*) FROM worksheet_question_links q WHERE q.worksheet_id=w.id AND q.solution_url IS NOT NULL AND trim(q.solution_url)!='') solution_count,
  (SELECT COUNT(*) FROM worksheet_question_links q WHERE q.worksheet_id=w.id AND q.topic_url IS NOT NULL AND trim(q.topic_url)!='') topic_count
  FROM worksheets w WHERE w.status='PUBLISHED' ORDER BY w.academic_year DESC,w.program_code,coalesce(w.grade_level,99),w.track,w.sequence_no`));
 const requestedGrade=url.searchParams.get('grade');let filtered=rows.filter(x=>worksheetAllowed(x,scope));if(requestedGrade)filtered=filtered.filter(x=>Number(x.grade_level)===Number(requestedGrade));
 return json({ok:true,worksheets:filtered.map(({subject_ids,...x})=>x),scope:{grades:scope.grades,allowYks:scope.allowYks,subjectRestricted:scope.subjectIds!==null}});
}

async function worksheetDetail(request:Request,env:Env,id:string){
 const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');const scope=await worksheetScope(env,user);
 const row=await one<any>(env.DB.prepare(`SELECT w.*,(SELECT group_concat(ws.subject_id, ',') FROM worksheet_subjects ws WHERE ws.worksheet_id=w.id) subject_ids FROM worksheets w WHERE w.id=? AND w.status='PUBLISHED'`).bind(id));if(!row||!worksheetAllowed(row,scope))return fail(404,'WORKSHEET_NOT_FOUND','Föy bulunamadı.');
 const [subjects,outcomes,links,assets]=await Promise.all([
  all<any>(env.DB.prepare(`SELECT ws.subject_id,s.code,s.name,ws.question_count FROM worksheet_subjects ws JOIN subjects s ON s.id=ws.subject_id WHERE ws.worksheet_id=? ORDER BY s.name`).bind(id)),
  all<any>(env.DB.prepare(`SELECT wo.subject_id,o.id outcome_id,o.title,o.topic,o.subtopic FROM worksheet_outcomes wo JOIN outcomes o ON o.id=wo.outcome_id WHERE wo.worksheet_id=? ORDER BY o.topic,o.title`).bind(id)),
  all<any>(env.DB.prepare(`SELECT q.subject_id,q.question_no,q.outcome_id,q.solution_url,q.topic_url,s.name subject_name,o.title outcome_title FROM worksheet_question_links q JOIN subjects s ON s.id=q.subject_id LEFT JOIN outcomes o ON o.id=q.outcome_id WHERE q.worksheet_id=? ORDER BY s.name,q.question_no`).bind(id)),
  all<any>(env.DB.prepare(`SELECT id,asset_type,file_name,created_at FROM worksheet_assets WHERE worksheet_id=? AND asset_type IN ('PDF','ANSWER_KEY') ORDER BY created_at DESC`).bind(id)),
 ]);
 return json({ok:true,worksheet:row,subjects,outcomes,questionLinks:links,assets});
}

async function worksheetAsset(request:Request,env:Env,worksheetId:string,assetId:string){
 const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');const scope=await worksheetScope(env,user);
 const row=await one<any>(env.DB.prepare(`SELECT w.id,w.grade_level,w.program_code,(SELECT group_concat(ws.subject_id, ',') FROM worksheet_subjects ws WHERE ws.worksheet_id=w.id) subject_ids,a.r2_key,a.file_name,a.asset_type FROM worksheets w JOIN worksheet_assets a ON a.worksheet_id=w.id WHERE w.id=? AND a.id=? AND w.status='PUBLISHED' AND a.asset_type IN ('PDF','ANSWER_KEY')`).bind(worksheetId,assetId));if(!row||!worksheetAllowed(row,scope))return fail(404,'ASSET_NOT_FOUND','Föy dosyası bulunamadı.');
 const object=await env.FILES.get(row.r2_key);if(!object)return fail(404,'ASSET_OBJECT_MISSING','Föy dosyası depolamada bulunamadı.');const headers=new Headers();headers.set('content-type',object.httpMetadata?.contentType||'application/pdf');headers.set('cache-control','private, max-age=300');headers.set('x-content-type-options','nosniff');headers.set('content-disposition',`inline; filename="${String(row.file_name||'worksheet.pdf').replace(/["\\\r\n]/g,'_')}"`);return new Response(object.body,{headers});
}

export default {
 async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
  const url=new URL(request.url),path=url.pathname;
  if(path==='/api/standard-readiness'&&request.method==='GET')return readiness(request,env);
  if(path==='/api/worksheets'&&request.method==='GET')return listWorksheets(request,env,url);
  const asset=path.match(/^\/api\/worksheets\/([^/]+)\/assets\/([^/]+)$/);if(asset&&request.method==='GET')return worksheetAsset(request,env,asset[1],asset[2]);
  const detail=path.match(/^\/api\/worksheets\/([^/]+)$/);if(detail&&request.method==='GET')return worksheetDetail(request,env,detail[1]);
  return app.fetch(request,env,ctx);
 },
 async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){if('scheduled' in app&&typeof app.scheduled==='function')return app.scheduled(event,env,ctx);},
} satisfies ExportedHandler<Env>;
