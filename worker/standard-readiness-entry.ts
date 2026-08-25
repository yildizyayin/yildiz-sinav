import app from './question-bank-standard-entry';
import type { Env } from './types';
import { getAuthUser } from './lib/auth';
import { all,json } from './lib/db';
import { evaluateStandardReadiness } from './lib/standard-readiness';

function fail(status:number,code:string,message:string){return json({ok:false,error:{code,message}},status)}

async function readiness(request:Request,env:Env){
  const user=await getAuthUser(env,request);
  if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');
  if(user.role!=='SUPER_ADMIN')return fail(403,'SUPER_ADMIN_ONLY','Standard hazırlık denetimi yalnız Süper Admin içindir.');
  const rows=await all<{name:string}>(env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table'`));
  const report=evaluateStandardReadiness(rows.map(r=>r.name),{
    files:Boolean(env.FILES),
    ai:Boolean(env.AI),
    youtube:Boolean(env.YOUTUBE_API_KEY),
    whatsapp:Boolean(env.WHATSAPP_ACCESS_TOKEN&&env.WHATSAPP_PHONE_NUMBER_ID),
  });
  return json({ok:true,environment:env.ENVIRONMENT||'unknown',generatedAt:new Date().toISOString(),...report});
}

export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const url=new URL(request.url);
    if(url.pathname==='/api/standard-readiness'&&request.method==='GET')return readiness(request,env);
    return app.fetch(request,env,ctx);
  },
  async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){
    if('scheduled' in app&&typeof app.scheduled==='function')return app.scheduled(event,env,ctx);
  },
} satisfies ExportedHandler<Env>;
