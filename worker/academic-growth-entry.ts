import app from './nibiru-license-entry';
import type { Env } from './types';
import { getAuthUser } from './lib/auth';
import { buildTargetAnalysis, handleAcademicGrowthApi, processScheduledAnnouncements, targetNibiruAnswer } from './lib/academic-growth';
import { json } from './lib/db';

const NEW_API_PREFIXES=['/api/academic-targets','/api/announcements','/api/worksheet-calendar'];
const TARGET_INTENT=/(hedef(im|im ne| lise| okul| üniversite| bölüm)|hedefe|kaç net.*hedef|hedef.*kaç net|hangi lise|hangi üniversite|hedefimin.*geris|hedef.*geris|hedef analizi)/i;

async function requireUser(env:Env,request:Request){
  const user=await getAuthUser(env,request);
  return user||null;
}

export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const url=new URL(request.url),path=url.pathname;
    if(NEW_API_PREFIXES.some(prefix=>path.startsWith(prefix))){
      const user=await requireUser(env,request);
      if(!user)return json({ok:false,error:{code:'UNAUTHENTICATED',message:'Oturum açmanız gerekiyor.'}},401);
      const response=await handleAcademicGrowthApi(request,env,user);
      return response||json({ok:false,error:{code:'NOT_FOUND',message:'Akademik gelişim API yolu bulunamadı.'}},404);
    }

    if(path==='/api/nibiru/chat'&&request.method==='POST'){
      const user=await requireUser(env,request);
      if(user?.role==='STUDENT'&&user.student_id){
        const clone=request.clone();
        const body=await clone.json<{message?:string}>().catch(()=>({}));
        const message=String(body.message||'').trim();
        if(message&&TARGET_INTENT.test(message)){
          try{
            const payload=await buildTargetAnalysis(env,user,user.student_id);
            return json({ok:true,answer:targetNibiruAnswer(payload),intent:'ACADEMIC_TARGET',studentId:user.student_id,target:payload.target,analysis:payload.analysis,outcome:'ANSWERED'});
          }catch{
            return json({ok:true,answer:'🤖 Nibiru: Hedef analizine erişirken doğrulanmış öğrenci verisini alamadım. Kurum yöneticinizden öğrenci kaydınızı kontrol etmesini isteyebilirsiniz.',intent:'ACADEMIC_TARGET',outcome:'DENIED'});
          }
        }
      }
    }
    return app.fetch(request,env,ctx);
  },
  async scheduled(_event:ScheduledController,env:Env,ctx:ExecutionContext){
    ctx.waitUntil(processScheduledAnnouncements(env).then(count=>console.log(JSON.stringify({event:'scheduled_announcements',count}))));
  },
} satisfies ExportedHandler<Env>;
