import type {CapacityJobMessage,Env} from './types';
import {getAuthUser} from './lib/auth';
import {json} from './lib/db';
import {handlePrivateRubricExport,consumePrivateRubricExports,dispatchPrivateRubricExports} from './lib/private-rubric-export';
import {handlePrivateCohortReport,consumePrivateCohortReports,dispatchPrivateCohortReports} from './lib/private-cohort-report';
type App=ReturnType<typeof import('./preview-policy-entry').createPreviewPolicyEntry>;

export function createPrivateRubricExportEntry(app:App){return {
 async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
  if(new URL(request.url).pathname.startsWith('/api/private-rubric-exports')){const user=await getAuthUser(env,request);if(!user)return json({ok:false,error:{code:'UNAUTHENTICATED',message:'Oturum açmanız gerekiyor.'}},401);try{return await handlePrivateRubricExport(request,env,user)||json({ok:false,error:{code:'NOT_FOUND',message:'Rapor yolu bulunamadı.'}},404)}catch{return json({ok:false,error:{code:'EXPORT_SERVER_ERROR',message:'Rapor işlemi tamamlanamadı.'}},500)}}
  if(new URL(request.url).pathname.startsWith('/api/private-cohort-reports')){const user=await getAuthUser(env,request);if(!user)return json({ok:false,error:{code:'UNAUTHENTICATED',message:'Oturum açmanız gerekiyor.'}},401);try{return await handlePrivateCohortReport(request,env,user)||json({ok:false,error:{code:'NOT_FOUND',message:'Rapor bulunamadı.'}},404)}catch{return json({ok:false,error:{code:'COHORT_REPORT_SERVER_ERROR',message:'Rapor işlemi tamamlanamadı.'}},500)}}
  return app.fetch(request,env,ctx);
 },
 async queue(batch:MessageBatch<CapacityJobMessage>,env:Env,ctx:ExecutionContext){if(/^anunex-cohort-reports-(staging|production)$/.test(env.COHORT_REPORT_QUEUE_NAME||'')&&batch.queue===env.COHORT_REPORT_QUEUE_NAME)return consumePrivateCohortReports(batch,env);if(/^anunex-rubric-exports-(staging|production)$/.test(env.REPORT_EXPORT_QUEUE_NAME||'')&&batch.queue===env.REPORT_EXPORT_QUEUE_NAME)return consumePrivateRubricExports(batch,env);return app.queue(batch,env,ctx)},
 async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){ctx.waitUntil(dispatchPrivateCohortReports(env).catch(()=>{}));ctx.waitUntil(dispatchPrivateRubricExports(env).catch(()=>{}));return app.scheduled(event,env,ctx)},
};}
