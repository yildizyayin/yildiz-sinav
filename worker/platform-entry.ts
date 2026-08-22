import app from './academic-growth-entry';
import type { Env } from './types';
import { getAuthUser } from './lib/auth';
import { json,one } from './lib/db';
import { handlePlatformApi } from './lib/platform-expansion';
import { handleAdvancedPlatformApi } from './lib/platform-advanced';
import { materializeNetworkAndPublisherAnalytics, networkRanksForParticipant, publisherQuestionAnalytics } from './lib/platform-ranking';
import { platformFeatureGate } from './lib/platform-feature-policy';

async function publishedSnapshotVersion(env:Env,examId:string){
  const cache=caches.default;const key=new Request(`https://platform-cache.invalid/exam-version/${encodeURIComponent(examId)}`);
  const hit=await cache.match(key);if(hit){const p:any=await hit.json().catch(()=>null);if(p?.version)return Number(p.version)}
  const row=await one<any>(env.DB.prepare(`SELECT snapshot_version,result_freeze_status FROM exam_delivery_profiles WHERE exam_id=?`).bind(examId));
  if(row?.result_freeze_status!=='PUBLISHED'||!Number(row.snapshot_version))return 0;
  const version=Number(row.snapshot_version);ctxWait(cache.put(key,new Response(JSON.stringify({version}),{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=30'}})));return version;
}
function ctxWait(p:Promise<any>){void p.catch(()=>{})}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/platform/')) {
      const user = await getAuthUser(env, request);
      if (!user) return json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Oturum açmanız gerekiyor.' } }, 401);
      const featureGate=await platformFeatureGate(env,user,url.pathname);if(featureGate)return featureGate;

      const resultMatchBefore=url.pathname.match(/^\/api\/platform\/exam-center\/([^/]+)\/result$/);
      let resultCacheKey:Request|null=null;
      if(resultMatchBefore&&request.method==='GET'){
        const version=await publishedSnapshotVersion(env,resultMatchBefore[1]);
        if(version){const studentKey=url.searchParams.get('studentId')||user.student_id||'self';resultCacheKey=new Request(`https://platform-cache.invalid/result/${encodeURIComponent(resultMatchBefore[1])}/${version}/${encodeURIComponent(user.id)}/${encodeURIComponent(studentKey)}`);const hit=await caches.default.match(resultCacheKey);if(hit){const payload=await hit.json();return new Response(JSON.stringify(payload),{status:200,headers:{'Content-Type':'application/json;charset=UTF-8','Cache-Control':'private,no-store','X-Platform-Cache':'HIT'}})}}
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
          const enriched={ ...payload, result: { ...r, networkRanks } };
          if(resultCacheKey)ctx.waitUntil(caches.default.put(resultCacheKey,new Response(JSON.stringify(enriched),{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=3600'}})).catch(()=>{}));
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
