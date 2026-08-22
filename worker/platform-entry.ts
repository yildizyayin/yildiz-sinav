import app from './academic-growth-entry';
import type { AuthUser, Env } from './types';
import { getAuthUser } from './lib/auth';
import { json,one } from './lib/db';
import { loadPermissionScope } from './lib/permissions';
import { handlePlatformApi } from './lib/platform-expansion';
import { handleAdvancedPlatformApi } from './lib/platform-advanced';
import { materializeNetworkAndPublisherAnalytics, networkRanksForParticipant, publisherQuestionAnalytics } from './lib/platform-ranking';
import { platformFeatureGate } from './lib/platform-feature-policy';

function edgeCache():Cache{return (caches as unknown as {default:Cache}).default;}
async function publishedSnapshotVersion(env:Env,examId:string){
  const cache=edgeCache();const key=new Request(`https://platform-cache.invalid/exam-version/${encodeURIComponent(examId)}`);
  const hit=await cache.match(key);if(hit){const p:any=await hit.json().catch(()=>null);if(p?.version)return Number(p.version)}
  const row=await one<any>(env.DB.prepare(`SELECT snapshot_version,result_freeze_status FROM exam_delivery_profiles WHERE exam_id=?`).bind(examId));
  if(row?.result_freeze_status!=='PUBLISHED'||!Number(row.snapshot_version))return 0;
  const version=Number(row.snapshot_version);ctxWait(cache.put(key,new Response(JSON.stringify({version}),{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=30'}})));return version;
}
function ctxWait(p:Promise<any>){void p.catch(()=>{})}

async function resultStudentAllowed(env:Env,user:AuthUser,requested:string|null):Promise<boolean>{
  if(user.role==='SUPER_ADMIN')return true;
  if(user.role==='STUDENT')return !requested||requested===user.student_id;
  if(user.role==='PARENT'){
    if(!requested)return false;
    return !!await one<any>(env.DB.prepare(`SELECT 1 ok FROM parent_student_links WHERE parent_user_id=? AND student_id=? AND active=1`).bind(user.id,requested));
  }
  if(!requested||!user.institution_id)return false;
  const enrollment=await one<any>(env.DB.prepare(`SELECT institution_id,class_id,season_id FROM student_enrollments WHERE student_id=? AND status='ACTIVE' ORDER BY created_at DESC LIMIT 1`).bind(requested));
  if(!enrollment||enrollment.institution_id!==user.institution_id)return false;
  if(user.role==='INSTITUTION_MANAGER')return true;
  if((user.role==='TEACHER'||user.role==='GUIDANCE_TEACHER')&&enrollment.class_id){
    const scope=await loadPermissionScope(env.DB,user,enrollment.season_id||undefined);
    return scope.classIds.includes(enrollment.class_id)||scope.guidanceClassIds.includes(enrollment.class_id);
  }
  return false;
}

async function centralCatalogPolicy(request:Request,path:string):Promise<Response|null>{
  const isCatalogCreate=path==='/api/platform/exam-center/catalog'&&request.method==='POST';
  const isProfileUpdate=/^\/api\/platform\/exam-center\/[^/]+\/profile$/.test(path)&&request.method==='PUT';
  if(!isCatalogCreate&&!isProfileUpdate)return null;
  const body:any=await request.clone().json().catch(()=>({}));
  if(String(body.scope||'').toUpperCase()==='CENTRAL'&&!body.verifiedCatalog){
    return json({ok:false,error:{code:'CENTRAL_REQUIRES_VERIFIED_CATALOG',message:'Merkezi / Türkiye Geneli sınav yalnız Süper Admin tarafından doğrulanmış katalog sınavı olarak tanımlanabilir.'}},400);
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/platform/')) {
      const user = await getAuthUser(env, request);
      if (!user) return json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Oturum açmanız gerekiyor.' } }, 401);
      const featureGate=await platformFeatureGate(env,user,url.pathname);if(featureGate)return featureGate;
      const catalogPolicy=await centralCatalogPolicy(request,url.pathname);if(catalogPolicy)return catalogPolicy;

      const resultMatchBefore=url.pathname.match(/^\/api\/platform\/exam-center\/([^/]+)\/result$/);
      let resultCacheKey:Request|null=null;
      if(resultMatchBefore&&request.method==='GET'){
        const requestedStudent=url.searchParams.get('studentId');
        if(!await resultStudentAllowed(env,user,requestedStudent))return json({ok:false,error:{code:'FORBIDDEN',message:'Bu öğrenci sonucuna erişim yetkiniz yok.'}},403);
        const version=await publishedSnapshotVersion(env,resultMatchBefore[1]);
        if(version){const studentKey=requestedStudent||user.student_id||'self';resultCacheKey=new Request(`https://platform-cache.invalid/result/${encodeURIComponent(resultMatchBefore[1])}/${version}/${encodeURIComponent(user.id)}/${encodeURIComponent(studentKey)}`);const hit=await edgeCache().match(resultCacheKey);if(hit){const payload=await hit.json();return new Response(JSON.stringify(payload),{status:200,headers:{'Content-Type':'application/json;charset=UTF-8','Cache-Control':'private,no-store','X-Platform-Cache':'HIT'}})}}
      }

      const advanced = await handleAdvancedPlatformApi(request, env, user);
      if (advanced) return advanced;

      const response = await handlePlatformApi(request, env, user);
      if (!response) return json({ ok: false, error: { code: 'NOT_FOUND', message: 'Platform API yolu bulunamadı.' } }, 404);

      const freezeMatch = url.pathname.match(/^\/api\/platform\/exam-center\/([^/]+)\/freeze$/);
      if (freezeMatch && request.method === 'POST' && response.ok) {
        const payload: any = await response.clone().json().catch(() => null);
        if (payload?.ok && Number(payload.version) > 0) {
          await materializeNetworkAndPublisherAnalytics(env, freezeMatch[1], Number(payload.version));
          return json({ ...payload, comparisonScopesReady: true, publisherQuestionAnalyticsReady: true });
        }
      }

      const resultMatch = url.pathname.match(/^\/api\/platform\/exam-center\/([^/]+)\/result$/);
      if (resultMatch && request.method === 'GET' && response.ok) {
        const payload: any = await response.clone().json().catch(() => null);
        const r = payload?.result;
        if (r?.participant_id && r?.snapshot_version) {
          const networkRanks = await networkRanksForParticipant(env, resultMatch[1], r.participant_id, Number(r.snapshot_version));
          const enriched={ ...payload, result: { ...r, networkRanks }, rankingLabel:'Türkiye Geneli Katılımcılar Arasında' };
          if(resultCacheKey)ctx.waitUntil(edgeCache().put(resultCacheKey,new Response(JSON.stringify(enriched),{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=3600'}})).catch(()=>{}));
          return new Response(JSON.stringify(enriched),{status:200,headers:{'Content-Type':'application/json;charset=UTF-8','Cache-Control':'private,no-store','X-Platform-Cache':'MISS'}});
        }
      }

      const publisherMatch = url.pathname.match(/^\/api\/platform\/publishers\/([^/]+)\/analytics$/);
      if (publisherMatch && request.method === 'GET' && response.ok) {
        const payload: any = await response.clone().json().catch(() => null);
        const requestedExamId = url.searchParams.get('examId') || payload?.exams?.find((x:any)=>Number(x.snapshot_version||0)>0)?.id || null;
        const analytics = await publisherQuestionAnalytics(env, publisherMatch[1], requestedExamId);
        return json({ ...payload, ...analytics });
      }
      return response;
    }
    return app.fetch(request, env, ctx);
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    if ('scheduled' in app && typeof app.scheduled === 'function') return app.scheduled(event, env, ctx);
  },
} satisfies ExportedHandler<Env>;
