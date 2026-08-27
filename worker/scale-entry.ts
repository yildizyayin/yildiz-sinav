import app from './student-intelligence-entry';
import type { AuthUser, Env } from './types';
import { getAuthUser } from './lib/auth';
import { all, audit, json, one, uuid } from './lib/db';

function fail(status:number,code:string,message:string,details?:unknown){return json({ok:false,error:{code,message,details}},status)}
function canManage(role:AuthUser['role']){return role==='SUPER_ADMIN'||role==='INSTITUTION_MANAGER'}
function resolveInstitution(user:AuthUser,requested:string|null|undefined){return user.role==='SUPER_ADMIN'?(requested||null):(user.institution_id||null)}

async function requireUser(env:Env,request:Request):Promise<AuthUser|Response>{return (await getAuthUser(env,request))||fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.')}
async function ensureInstitution(env:Env,user:AuthUser,institutionId:string){if(user.role==='SUPER_ADMIN')return Boolean(await one(env.DB.prepare('SELECT id FROM institutions WHERE id=?').bind(institutionId)));return user.institution_id===institutionId}

async function scaleSafeExamParticipants(request:Request,env:Env,user:AuthUser,body:any){
  if(!canManage(user.role))return fail(403,'FORBIDDEN','Toplu işlem yetkiniz yok.');
  const institutionId=resolveInstitution(user,body?.institutionId);
  const classIds=Array.isArray(body?.classIds)?[...new Set(body.classIds.filter((x:unknown)=>typeof x==='string'&&x))] as string[]:[];
  const examId=typeof body?.examId==='string'?body.examId:'';
  if(!institutionId||!examId||!classIds.length)return fail(400,'VALIDATION_ERROR','Kurum, sınav ve en az bir sınıf seçilmelidir.');
  if(classIds.length>250)return fail(400,'TOO_MANY_CLASSES','Tek toplu işlemde en fazla 250 sınıf işlenebilir.');
  if(!(await ensureInstitution(env,user,institutionId)))return fail(403,'FORBIDDEN','Bu kuruma erişim yetkiniz yok.');

  const exam=await one<any>(env.DB.prepare(`SELECT DISTINCT e.id,e.title FROM exams e LEFT JOIN exam_institutions ei ON ei.exam_id=e.id AND ei.institution_id=? WHERE e.id=? AND (e.institution_id=? OR e.institution_id IS NULL OR ei.enabled=1)`).bind(institutionId,examId,institutionId));
  if(!exam)return fail(404,'EXAM_NOT_FOUND','Sınav bu kurum için kullanılamıyor.');
  const bookletRows=await all<{code:string}>(env.DB.prepare(`SELECT code FROM exam_booklets WHERE exam_id=? AND active=1 ORDER BY code`).bind(examId));
  const bookletCodes=bookletRows.length?bookletRows.map(x=>x.code):['A'];

  let created=0,skipped=0,eligible=0;
  const details:Array<{classId:string;eligible:number;created:number;skipped:number}>=[];
  for(const classId of classIds){
    const cls=await one<any>(env.DB.prepare(`SELECT id,institution_id FROM classes WHERE id=? AND active=1`).bind(classId));
    if(!cls||cls.institution_id!==institutionId)return fail(400,'CLASS_SCOPE_ERROR','Seçilen sınıflardan biri bu kuruma ait değil.');

    const countRow=await one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.class_id=? AND e.institution_id=? AND e.status='ACTIVE' AND s.status='ACTIVE'`).bind(classId,institutionId));
    const classEligible=Number(countRow?.c||0);
    eligible+=classEligible;

    const cases=bookletCodes.map((_,index)=>`WHEN ${index} THEN ?`).join(' ');
    const sql=`WITH eligible AS (
      SELECT s.id student_id,e.season_id,e.student_number,s.first_name,s.last_name,c.name class_name,
             row_number() OVER (ORDER BY CASE WHEN e.student_number GLOB '[0-9]*' THEN cast(e.student_number AS INTEGER) ELSE 2147483647 END,e.student_number,s.normalized_name,s.id) rn
      FROM student_enrollments e
      JOIN student_entities s ON s.id=e.student_id
      JOIN classes c ON c.id=e.class_id
      WHERE e.class_id=? AND e.institution_id=? AND e.status='ACTIVE' AND s.status='ACTIVE'
    )
    INSERT OR IGNORE INTO exam_participants(id,exam_id,institution_id,season_id,student_id,student_number_snapshot,name_snapshot,class_snapshot,booklet_code,participant_status)
    SELECT 'ep_'||lower(hex(randomblob(16))),?,?,season_id,student_id,student_number,trim(first_name||' '||last_name),class_name,
           CASE ((rn-1) % ${bookletCodes.length}) ${cases} ELSE ? END,'ACTIVE'
    FROM eligible`;
    const result=await env.DB.prepare(sql).bind(classId,institutionId,examId,institutionId,...bookletCodes,bookletCodes[0]).run();
    const classCreated=Number((result.meta as any)?.changes||0);
    const classSkipped=Math.max(0,classEligible-classCreated);
    created+=classCreated;skipped+=classSkipped;details.push({classId,eligible:classEligible,created:classCreated,skipped:classSkipped});
  }

  const jobId=uuid('bulk');
  const summary={created,skipped,eligible,exam:exam.title,classes:classIds.length,booklets:bookletCodes,strategy:'SET_BASED_D1',details};
  await env.DB.prepare(`INSERT INTO bulk_operation_jobs(id,institution_id,operation_type,status,payload_json,summary_json,created_by,completed_at) VALUES(?,?,?,'COMPLETED',?,?,?,CURRENT_TIMESTAMP)`).bind(jobId,institutionId,'CREATE_EXAM_PARTICIPANTS',JSON.stringify({...body,classIds}),JSON.stringify(summary),user.id).run();
  await audit(env.DB,user.id,institutionId,'BULK_OPERATION_COMPLETED','bulk_operation',jobId,{operation:'CREATE_EXAM_PARTICIPANTS',summary,strategy:'SET_BASED_D1'});
  return json({ok:true,jobId,summary});
}

async function scaleHealth(env:Env,user:AuthUser){
  if(user.role!=='SUPER_ADMIN')return fail(403,'FORBIDDEN','Ölçek altyapısını yalnız Süper Admin görebilir.');
  const [institutions,students,classes,exams,participants,results,scanRecords,worksheets,bulkJobs,profiles,staleProfiles,pendingScans,activeSessions,oldestProfile]=await Promise.all([
    one<{c:number}>(env.DB.prepare('SELECT count(*) c FROM institutions')),
    one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM student_entities WHERE status='ACTIVE'`)),
    one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM classes WHERE active=1`)),
    one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM exams WHERE status!='ARCHIVED'`)),
    one<{c:number}>(env.DB.prepare('SELECT count(*) c FROM exam_participants')),
    one<{c:number}>(env.DB.prepare('SELECT count(*) c FROM exam_results')),
    one<{c:number}>(env.DB.prepare('SELECT count(*) c FROM scan_records')),
    one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM worksheets WHERE status='PUBLISHED'`)),
    one<{c:number}>(env.DB.prepare('SELECT count(*) c FROM bulk_operation_jobs')),
    one<{c:number}>(env.DB.prepare('SELECT count(*) c FROM student_intelligence_profiles')),
    one<{c:number}>(env.DB.prepare(`SELECT count(DISTINCT e.student_id) c FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id LEFT JOIN student_intelligence_profiles p ON p.student_id=e.student_id WHERE e.status='ACTIVE' AND s.status='ACTIVE' AND (p.student_id IS NULL OR p.refreshed_at<datetime('now','-6 hours'))`)),
    one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM scan_batches WHERE status IN ('PREVIEW','NEEDS_REVIEW','READY')`)),
    one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM sessions WHERE revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP`)),
    one<{refreshed_at:string|null}>(env.DB.prepare(`SELECT min(refreshed_at) refreshed_at FROM student_intelligence_profiles`)),
  ]);

  const metrics={institutions:institutions?.c??0,students:students?.c??0,classes:classes?.c??0,exams:exams?.c??0,participants:participants?.c??0,results:results?.c??0,scanRecords:scanRecords?.c??0,publishedWorksheets:worksheets?.c??0,bulkJobs:bulkJobs?.c??0,intelligenceProfiles:profiles?.c??0,intelligenceBacklog:staleProfiles?.c??0,pendingScanBatches:pendingScans?.c??0,activeSessions:activeSessions?.c??0};
  const backlog=Number(metrics.intelligenceBacklog||0),studentCount=Number(metrics.students||0);
  const backlogRatio=studentCount?backlog/studentCount:0;
  const readiness=[
    {key:'TENANT_SCOPE',label:'Kurum izolasyonu',status:'PASS',detail:'Kritik V2 toplu işlemler institution_id ve rol kapsamıyla sınırlandırılıyor.'},
    {key:'BULK_PARTICIPANTS',label:'Toplu sınav katılımcısı',status:'PASS',detail:'Öğrenci başına sorgu yerine sınıf başına set-based D1 INSERT OR IGNORE kullanılıyor.'},
    {key:'RECOVERY_GUARDRAIL',label:'Nibiru Recovery toplu işlem',status:'PASS',detail:'En fazla 100 sınıf önizlenir; doğrulanmış kazanım kanıtı ve yönetici onayı zorunludur.'},
    {key:'INTELLIGENCE_BACKLOG',label:'Student Intelligence yenileme',status:backlogRatio>0.25?'WARN':'PASS',detail:`6 saatten eski/eksik profil: ${backlog.toLocaleString('tr-TR')} (${Math.round(backlogRatio*100)}%). Profiller ayrıca öğrenci erişiminde on-demand yenilenir.`},
    {key:'QUEUE_WORKFLOW',label:'Queue / Workflow',status:studentCount>=100000?'WARN':'READY_WHEN_NEEDED',detail:'Mevcut ağır katılımcı üretimi set-based D1 ile optimize edildi. 100.000+ canlı hacimde uzun arka plan yenilemeleri için Queue/Workflow binding açılmalıdır.'},
    {key:'LIVE_100K_BENCHMARK',label:'100.000 öğrenci staging testi',status:'PENDING',detail:'Staging-only benchmark workflow sonucu gelmeden production kapasitesi 100.000 olarak onaylanmaz.'},
  ];
  const warnings:string[]=[];
  if(Number(metrics.scanRecords)>500000)warnings.push('Optik kayıt hacmi 500 bin üzeri: arşivleme/özetleme politikası etkinleştirilmeli.');
  if(Number(metrics.results)>500000)warnings.push('Sonuç hacmi 500 bin üzeri: ağır raporlar özet read-model üzerinden çalıştırılmalı.');
  if(backlogRatio>0.25)warnings.push('Student Intelligence stale profil kuyruğu aktif öğrencilerin %25’ini aşıyor; Queue/Workflow yenileme hattı etkinleştirilmeli.');
  return json({ok:true,metrics,warnings,readiness,profileRefresh:{staleAfterHours:6,scheduledBatchSize:25,cron:'*/15 * * * *',oldestRefreshAt:oldestProfile?.refreshed_at||null,onDemandRefresh:true},architecture:{runtime:'Cloudflare Workers',database:'D1',files:'R2',camera:'Browser OMR + Worker APIs',tenantIsolation:'institution_id + role scope',bulkMode:'set-based D1 + job ledger',backgroundRefresh:'bounded cron + on-demand; Queue/Workflow at 100k threshold',recommendedNextScaleStep:'Run staging-only 100k benchmark; provision Queues/Workflows only if measured backlog/latency requires it.'}});
}

export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const url=new URL(request.url);
    if(url.pathname==='/api/v2/scale/health'&&request.method==='GET'){
      const auth=await requireUser(env,request);if(auth instanceof Response)return auth;return scaleHealth(env,auth);
    }
    if(url.pathname==='/api/v2/bulk/execute'&&request.method==='POST'){
      let body:any;try{body=await request.clone().json()}catch{return fail(400,'INVALID_JSON','İstek gövdesi okunamadı.')}
      if(body?.operation==='CREATE_EXAM_PARTICIPANTS'){
        const auth=await requireUser(env,request);if(auth instanceof Response)return auth;return scaleSafeExamParticipants(request,env,auth,body);
      }
    }
    return app.fetch(request,env,ctx);
  },
  async scheduled(event:any,env:Env,ctx:ExecutionContext){if('scheduled'in app&&typeof app.scheduled==='function')return (app.scheduled as any)(event,env,ctx)},
} satisfies ExportedHandler<Env>;
