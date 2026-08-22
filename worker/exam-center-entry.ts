import app from './academic-growth-entry';
import type { Env } from './types';
import { getAuthUser } from './lib/auth';
import { handleExamCenterApiV2 } from './lib/exam-center-v2';
import { json } from './lib/db';

export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const path=new URL(request.url).pathname;
    if(path.startsWith('/api/exam-center')){
      const user=await getAuthUser(env,request);
      if(!user)return json({ok:false,error:{code:'UNAUTHENTICATED',message:'Oturum açmanız gerekiyor.'}},401);
      const response=await handleExamCenterApiV2(request,env,user);
      return response||json({ok:false,error:{code:'NOT_FOUND',message:'Sınav Merkezi API yolu bulunamadı.'}},404);
    }
    return app.fetch(request,env,ctx);
  },
  async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){
    if(typeof app.scheduled==='function')return app.scheduled(event,env,ctx);
  },
} satisfies ExportedHandler<Env>;
