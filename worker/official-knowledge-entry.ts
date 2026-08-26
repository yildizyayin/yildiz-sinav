import app from './standard-closure-entry';
import type { Env } from './types';
import { getAuthUser } from './lib/auth';
import { forbidden,json } from './lib/db';
import { OFFICIAL_SOURCE_POLICIES,officialKnowledgeStatus,validateOfficialSource } from './lib/official-education-source';

async function requireSuper(request:Request,env:Env){const user=await getAuthUser(env,request);if(!user)return {user:null,response:json({ok:false,error:{code:'UNAUTHENTICATED',message:'Oturum açmanız gerekiyor.'}},401)};if(user.role!=='SUPER_ADMIN')return {user,response:forbidden('Resmî eğitim bilgi katmanını yalnız Süper Admin yönetebilir.')};return {user,response:null}}

export default {
 async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
  const url=new URL(request.url);if(!url.pathname.startsWith('/api/official-knowledge/'))return app.fetch(request,env,ctx);
  const auth=await requireSuper(request,env);if(auth.response)return auth.response;
  if(url.pathname==='/api/official-knowledge/sources'&&request.method==='GET')return json({ok:true,sources:OFFICIAL_SOURCE_POLICIES});
  if(url.pathname==='/api/official-knowledge/status'&&request.method==='GET')return json({ok:true,...await officialKnowledgeStatus(env)});
  if(url.pathname==='/api/official-knowledge/validate'&&request.method==='POST'){
   const body:any=await request.json().catch(()=>({}));const verdict=validateOfficialSource({sourceKind:body.sourceKind,authority:body.authority,sourceUrl:body.sourceUrl,sourceTitle:body.sourceTitle,sourceVerifiedAt:body.sourceVerifiedAt});
   return json({ok:true,verdict});
  }
  return json({ok:false,error:{code:'NOT_FOUND',message:'Resmî eğitim bilgi katmanı API yolu bulunamadı.'}},404);
 },
 async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){if('scheduled' in app&&typeof app.scheduled==='function')return app.scheduled(event,env,ctx);},
} satisfies ExportedHandler<Env>;
