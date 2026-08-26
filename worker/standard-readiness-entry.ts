import app from './question-bank-standard-entry';
import type { Env } from './types';
import { getAuthUser } from './lib/auth';
import { all,json,one } from './lib/db';
import { routeNibiruSpecialist } from './lib/nibiru-specialists';
import { evaluateProviderActivation,evaluateStandardReadiness } from './lib/standard-readiness';

function fail(status:number,code:string,message:string){return json({ok:false,error:{code,message}},status)}
type OperationalCheck={key:string;label:string;state:'READY'|'SETUP_REQUIRED';value:number;detail:string;blocking:boolean};
async function count(env:Env,sql:string){const row=await one<{c:number}>(env.DB.prepare(sql));return Number(row?.c||0)}

async function operationalChecks(env:Env):Promise<OperationalCheck[]>{
  const [readyOpticals,verifiedScoring,printableQuestions,publishedWorksheets,officialTargets,activeInstitutions,activeStudents,teacherAssignments]=await Promise.all([
    count(env,`SELECT COUNT(*) c FROM optical_templates t WHERE t.active=1 AND t.status='READY' AND EXISTS(SELECT 1 FROM optical_template_versions v WHERE v.template_id=t.id AND v.active=1)`),
    count(env,`SELECT COUNT(*) c FROM scoring_rule_versions WHERE verified=1`),
    count(env,`SELECT COUNT(*) c FROM question_bank WHERE review_status='APPROVED' AND copyright_status IN ('OWNED','LICENSED','PUBLIC_DOMAIN')`),
    count(env,`SELECT COUNT(*) c FROM worksheets WHERE status='PUBLISHED'`),
    count(env,`SELECT (SELECT COUNT(*) FROM secondary_school_targets WHERE active=1)+(SELECT COUNT(*) FROM university_program_targets WHERE active=1) c`),
    count(env,`SELECT COUNT(*) c FROM institutions WHERE status='ACTIVE'`),
    count(env,`SELECT COUNT(*) c FROM student_entities WHERE status='ACTIVE'`),
    count(env,`SELECT COUNT(*) c FROM teacher_assignments WHERE active=1`),
  ]);
  const make=(key:string,label:string,value:number,detailReady:string,detailMissing:string,blocking:boolean):OperationalCheck=>({key,label,value,state:value>0?'READY':'SETUP_REQUIRED',detail:value>0?detailReady:detailMissing,blocking});
  return [
    make('READY_OPTICAL','Okunabilir hazır optik şablonu',readyOpticals,`${readyOpticals} hazır optik şablonu var.`,'En az bir optik şablon READY durumuna getirilmelidir.',true),
    make('VERIFIED_SCORING','Doğrulanmış puanlama kuralı',verifiedScoring,`${verifiedScoring} doğrulanmış puanlama sürümü var.`,'Resmî/standart değerlendirme için doğrulanmış puanlama kuralı gerekir.',true),
    make('PRINTABLE_QUESTIONS','Basılabilir onaylı soru',printableQuestions,`${printableQuestions} soru Kişiye Özel Kitap / Sıfır Hata için kullanılabilir.`,'Soru Havuzunda APPROVED + OWNED/LICENSED/PUBLIC_DOMAIN soru eklenmelidir.',true),
    make('PUBLISHED_WORKSHEETS','Yayınlanmış föy',publishedWorksheets,`${publishedWorksheets} yayınlanmış föy var.`,'Standard Föy Merkezi için en az bir yayınlanmış föy hazırlanmalıdır.',true),
    make('OFFICIAL_TARGET_DATA','LGS/YKS hedef verisi',officialTargets,`${officialTargets} resmî hedef kaydı hazır.`,'LGS/YKS hedef araması için resmî hedef verisi içe aktarılmalıdır.',false),
    make('ACTIVE_INSTITUTION','Aktif kurum',activeInstitutions,`${activeInstitutions} aktif kurum var.`,'Demo/kabul testi için aktif kurum oluşturulmalıdır.',true),
    make('ACTIVE_STUDENT','Aktif öğrenci',activeStudents,`${activeStudents} aktif öğrenci var.`,'Uçtan uca kabul testi için aktif öğrenci gerekir.',true),
    make('TEACHER_ASSIGNMENT','Öğretmen ataması',teacherAssignments,`${teacherAssignments} aktif öğretmen-sınıf/branş ataması var.`,'Öğretmen rolü kabul testi için en az bir atama gerekir.',true),
  ];
}

async function readiness(request:Request,env:Env){
  const user=await getAuthUser(env,request);
  if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');
  if(user.role!=='SUPER_ADMIN')return fail(403,'SUPER_ADMIN_ONLY','Standard hazırlık denetimi yalnız Süper Admin içindir.');
  const rows=await all<{name:string}>(env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table'`));
  const providers=evaluateProviderActivation({
    youtubeApiKey:env.YOUTUBE_API_KEY,
    whatsappVerifyToken:env.WHATSAPP_VERIFY_TOKEN,
    whatsappAppSecret:env.WHATSAPP_APP_SECRET,
    whatsappAccessToken:env.WHATSAPP_ACCESS_TOKEN,
    whatsappPhoneNumberId:env.WHATSAPP_PHONE_NUMBER_ID,
  });
  const report=evaluateStandardReadiness(rows.map(r=>r.name),{
    files:Boolean(env.FILES),ai:Boolean(env.AI),youtube:providers.youtube.ready,whatsapp:providers.whatsapp.ready,
  });
  let operational:OperationalCheck[]=[];let operationalError:string|null=null;
  if(report.summary.missing===0){try{operational=await operationalChecks(env)}catch(e){operationalError=e instanceof Error?e.message:'OPERATIONAL_CHECK_FAILED'}}
  const blockingSetup=operational.filter(x=>x.blocking&&x.state==='SETUP_REQUIRED').length;
  const externalSetup=report.summary.configRequired;
  const coreAcceptanceReady=report.summary.coreReady&&blockingSetup===0;
  const saleReady=coreAcceptanceReady&&externalSetup===0&&!operationalError;
  return json({ok:true,environment:env.ENVIRONMENT||'unknown',generatedAt:new Date().toISOString(),...report,providers,operational,operationalError,acceptance:{coreReady:report.summary.coreReady,blockingSetup,externalSetup,coreAcceptanceReady,saleReady,standardAcceptanceReady:saleReady}});
}

async function orchestratedNibiruChat(request:Request,env:Env,ctx:ExecutionContext){
  const user=await getAuthUser(env,request);
  if(!user)return app.fetch(request,env,ctx);
  let message='';
  try{const body=await request.clone().json<{message?:string}>();message=body.message?.trim()||''}catch{}
  const route=routeNibiruSpecialist(user,message);
  const response=await app.fetch(request,env,ctx);
  if(!response.headers.get('content-type')?.includes('application/json'))return response;
  let payload:any;try{payload=await response.clone().json()}catch{return response}
  if(!payload?.ok||typeof payload.answer!=='string')return response;
  const headers=new Headers(response.headers);headers.delete('content-length');headers.set('content-type','application/json; charset=utf-8');
  return new Response(JSON.stringify({...payload,orchestration:{version:'standard-v1',...route}}),{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const url=new URL(request.url);
    if(url.pathname==='/api/standard-readiness'&&request.method==='GET')return readiness(request,env);
    if(url.pathname==='/api/nibiru/chat'&&request.method==='POST')return orchestratedNibiruChat(request,env,ctx);
    return app.fetch(request,env,ctx);
  },
  async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){if('scheduled' in app&&typeof app.scheduled==='function')return app.scheduled(event,env,ctx);},
} satisfies ExportedHandler<Env>;