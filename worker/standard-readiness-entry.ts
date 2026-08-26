import app from './question-bank-standard-entry';
import type { Env } from './types';
import { getAuthUser } from './lib/auth';
import { all,json,one } from './lib/db';
import { coachPlanSummary,completeCoachItem,createOrReuseDailyCoachPlan,getTodayCoachPlan } from './lib/education-coach';
import { buildStudentTargetAnalysisV2,guidanceSummary } from './lib/target-analysis-v2';
import { routeNibiruSpecialist } from './lib/nibiru-specialists';
import { withNibiruAiRouter } from './lib/nibiru-ai-proxy';
import { nibiruRoutingMatrix } from './lib/nibiru-model-router';
import { evaluateProviderActivation,evaluateStandardReadiness } from './lib/standard-readiness';
import { guidanceAssessmentChatExtension,handleGuidanceAssessmentApi } from './lib/guidance-assessment-controller';

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
  const providers=evaluateProviderActivation({youtubeApiKey:env.YOUTUBE_API_KEY,whatsappVerifyToken:env.WHATSAPP_VERIFY_TOKEN,whatsappAppSecret:env.WHATSAPP_APP_SECRET,whatsappAccessToken:env.WHATSAPP_ACCESS_TOKEN,whatsappPhoneNumberId:env.WHATSAPP_PHONE_NUMBER_ID});
  const report=evaluateStandardReadiness(rows.map(r=>r.name),{files:Boolean(env.FILES),ai:Boolean(env.AI),youtube:providers.youtube.ready,whatsapp:providers.whatsapp.ready});
  let operational:OperationalCheck[]=[];let operationalError:string|null=null;
  if(report.summary.missing===0){try{operational=await operationalChecks(env)}catch(e){operationalError=e instanceof Error?e.message:'OPERATIONAL_CHECK_FAILED'}}
  const blockingSetup=operational.filter(x=>x.blocking&&x.state==='SETUP_REQUIRED').length,externalSetup=report.summary.configRequired,coreAcceptanceReady=report.summary.coreReady&&blockingSetup===0,saleReady=coreAcceptanceReady&&externalSetup===0&&!operationalError;
  return json({ok:true,environment:env.ENVIRONMENT||'unknown',generatedAt:new Date().toISOString(),...report,providers,aiRouting:nibiruRoutingMatrix(env),operational,operationalError,acceptance:{coreReady:report.summary.coreReady,blockingSetup,externalSetup,coreAcceptanceReady,saleReady,standardAcceptanceReady:saleReady}});
}

async function routingApi(request:Request,env:Env){
  const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');
  if(user.role!=='SUPER_ADMIN')return fail(403,'SUPER_ADMIN_ONLY','AI model yönlendirme matrisi yalnız Süper Admin içindir.');
  return json({ok:true,environment:env.ENVIRONMENT||'unknown',routing:nibiruRoutingMatrix(env),policy:{identity:'Nibiru',gateway:'Cloudflare AI Gateway',personalizedCache:false,authoritativeCalculations:'DETERMINISTIC_ENGINES',providerNamesHiddenFromEndUsers:true}});
}

async function coachApi(request:Request,env:Env,url:URL){
 const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(user.role!=='STUDENT'||!user.student_id)return fail(403,'STUDENT_ONLY','Eğitim Koçu günlük planı öğrenci hesabına açıktır.');
 if(url.pathname==='/api/nibiru/coach/daily-plan'&&request.method==='GET'){const result=await getTodayCoachPlan(env,user);return json({ok:true,...result});}
 if(url.pathname==='/api/nibiru/coach/daily-plan'&&request.method==='POST'){const result=await createOrReuseDailyCoachPlan(env,user);if(!result.available)return fail(result.reason==='INSUFFICIENT_EVIDENCE'?409:400,result.reason||'COACH_PLAN_UNAVAILABLE','Günlük plan oluşturmak için yeterli doğrulanmış akademik kanıt bulunamadı.');return json({ok:true,...result},result.reused?200:201);}
 const item=url.pathname.match(/^\/api\/nibiru\/coach\/items\/([^/]+)\/complete$/);
 if(item&&request.method==='PATCH'){const body:any=await request.json().catch(()=>({}));const result=await completeCoachItem(env,user,item[1],body.completed!==false);if(!result.ok)return fail(result.reason==='ITEM_NOT_FOUND'?404:403,result.reason||'COACH_ITEM_FAILED','Eğitim Koçu görevi güncellenemedi.');return json(result);}
 return fail(404,'NOT_FOUND','Eğitim Koçu API yolu bulunamadı.');
}

async function guidanceApi(request:Request,env:Env){
 const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(user.role!=='STUDENT'||!user.student_id)return fail(403,'STUDENT_ONLY','Rehber Öğretmen hedef rotası öğrenci hesabına açıktır.');
 if(request.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');
 try{const payload=await buildStudentTargetAnalysisV2(env,user);const extension=await guidanceAssessmentChatExtension(env,user,'');return json({ok:true,...payload,guidance:{summary:guidanceSummary(payload),policy:'Resmî hedef profili yoksa net/rank farkı tahmin edilmez; kurum içi sıra ÖSYM başarı sırası sayılmaz. Yalnız gerçek rehber öğretmen tarafından incelenmiş RBA/rehberlik sonuçları gelişim bağlamına girer.',development:extension.development}});}catch{return fail(400,'GUIDANCE_ROUTE_FAILED','Rehber Öğretmen hedef rotası oluşturulamadı.');}
}

async function orchestratedNibiruChat(request:Request,env:Env,ctx:ExecutionContext){
  const user=await getAuthUser(env,request);if(!user)return app.fetch(request,env,ctx);
  let message='';try{const body=await request.clone().json<{message?:string}>();message=body.message?.trim()||''}catch{}
  const route=routeNibiruSpecialist(user,message),response=await app.fetch(request,env,ctx);
  if(!response.headers.get('content-type')?.includes('application/json'))return response;
  let payload:any;try{payload=await response.clone().json()}catch{return response}if(!payload?.ok||typeof payload.answer!=='string')return response;
  let coachPlan:any=null,guidanceRoute:any=null,guidanceAssessment:any=null;
  if(route.specialist==='EDUCATION_COACH'&&user.role==='STUDENT'&&user.student_id){
    const result=await createOrReuseDailyCoachPlan(env,user);
    if(result.available){const summary=coachPlanSummary(result);coachPlan=result;if(summary&&!payload.answer.includes('Bugünkü planın'))payload.answer=`${payload.answer}\n\nBugünkü planın sisteme kaydedildi:\n${summary}`;}
    else coachPlan={available:false,reason:result.reason};
  }
  if(route.specialist==='GUIDANCE_COUNSELOR'&&user.role==='STUDENT'&&user.student_id){
    try{
      guidanceAssessment=await guidanceAssessmentChatExtension(env,user,message);
      guidanceRoute=await buildStudentTargetAnalysisV2(env,user);
      const summary=guidanceSummary(guidanceRoute);
      if(guidanceRoute.targets?.length&&summary&&!payload.answer.includes('Rehber rotan'))payload.answer=`${payload.answer}\n\nRehber rotan:\n${summary}`;
      if(!guidanceRoute.targets?.length&&!payload.answer.includes('Henüz bir akademik hedef'))payload.answer=`${payload.answer}\n\nRehber rotası: Henüz aktif akademik hedef bulunmuyor.`;
      if(guidanceAssessment?.development?.available&&guidanceAssessment.development.summary&&!payload.answer.includes('Rehber öğretmen onaylı gelişim'))payload.answer=`${payload.answer}\n\n${guidanceAssessment.development.summary}`;
      if(guidanceAssessment?.proposal?.session&&!payload.answer.includes('rehber öğretmen'))payload.answer=`${payload.answer}\n\nİstediğin eğitimsel değerlendirme gerçek rehber öğretmeninin onay kuyruğuna gönderildi. Onay verilmeden sorular açılmaz ve sonuçlar gelişim profiline eklenmez.`;
    }catch{guidanceRoute={error:'GUIDANCE_ROUTE_FAILED'};}
  }
  const headers=new Headers(response.headers);headers.delete('content-length');headers.set('content-type','application/json; charset=utf-8');
  return new Response(JSON.stringify({...payload,orchestration:{version:'multi-ai-v1',...route},coachPlan,guidanceRoute,guidanceAssessment}),{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const routedEnv=withNibiruAiRouter(env),url=new URL(request.url);
    if(url.pathname==='/api/standard-readiness'&&request.method==='GET')return readiness(request,routedEnv);
    if(url.pathname==='/api/nibiru/ai-routing'&&request.method==='GET')return routingApi(request,routedEnv);
    if(url.pathname.startsWith('/api/nibiru/coach/'))return coachApi(request,routedEnv,url);
    if(url.pathname.startsWith('/api/nibiru/guidance/')&&url.pathname!=='/api/nibiru/guidance/route'){
      const user=await getAuthUser(routedEnv,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');const handled=await handleGuidanceAssessmentApi(request,routedEnv,user,url);if(handled)return handled;
    }
    if(url.pathname==='/api/nibiru/guidance/route')return guidanceApi(request,routedEnv);
    if(url.pathname==='/api/nibiru/chat'&&request.method==='POST')return orchestratedNibiruChat(request,routedEnv,ctx);
    return app.fetch(request,routedEnv,ctx);
  },
  async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){const routedEnv=withNibiruAiRouter(env);if('scheduled' in app&&typeof app.scheduled==='function')return app.scheduled(event,routedEnv,ctx);},
} satisfies ExportedHandler<Env>;
