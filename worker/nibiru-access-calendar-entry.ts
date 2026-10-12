import type { Env } from './types';
import { getAuthUser } from './lib/auth';
import { all, badRequest, forbidden, json, methodNotAllowed } from './lib/db';
import { activeAccess, handlePasskeys } from './lib/passkeys';
import { handleCalendar, listCalendar, studentScopeSql } from './lib/calendar';

type App=ReturnType<typeof import('./private-rubric-export-entry').createPrivateRubricExportEntry>;
export function publicNibiruAnswer(message:string){
 if(/sonuç|sonuc|çocu|ogrenci|öğrenci|puan|netim|devamsız|devamsiz/i.test(message))return 'Size veya çocuğunuza ait bilgileri paylaşabilmem için önce hesabınızı doğrulayın. Kayıtlı veli–öğrenci ilişkisi üzerinden yalnız yetkili olduğunuz bilgilere erişebilirsiniz.';
 if(/çalış|calis|plan|ders/i.test(message))return 'Genel çalışma önerim: bir öğrenme hedefi seçin, kısa bir konu tekrarı yapın, birkaç soru çözün ve yanlışların nedenini inceleyin. Kendi kazanımlarınıza göre plan ve mini test için hesabınızı doğrulayın.';
 return 'Ben Nibiru. ANUNEX içinde konu ve soru desteği, kazanım odaklı mini test, gelişim değerlendirmesi ve plan takibinde yardımcı olurum. Misafir modunda bu kullanım bilgilerini sunuyorum. Kişisel veriler ve görevler için hesabınızı doğrulayarak devam edin.';
}
export function createNibiruAccessCalendarEntry(app:App){return {
 ...app,
 async fetch(request:Request<unknown,IncomingRequestCfProperties>,env:Env,ctx:ExecutionContext):Promise<Response>{
  const url=new URL(request.url),path=url.pathname;
  const owned=path.startsWith('/api/auth/passkeys')||path.startsWith('/api/calendar')||path==='/api/nibiru/identity'||path==='/api/nibiru/public-chat';
  if(!owned&&path!=='/api/nibiru/chat')return app.fetch(request,env,ctx);
  try{
   if(path.startsWith('/api/auth/passkeys'))return handlePasskeys(request,env);
   if(path==='/api/nibiru/public-chat'){
    if(request.method!=='POST')return methodNotAllowed();
    if(request.headers.get('Origin')!==url.origin)return forbidden();
    const b:any=await request.json().catch(()=>({}));const message=String(b.message||'').trim();if(!message||message.length>1200)return badRequest('Mesaj 1–1200 karakter arasında olmalıdır.');
    // No anonymous provider calls, personal-data lookup, session creation or writes.
    return json({ok:true,answer:publicNibiruAnswer(message),mode:'GUEST_INFORMATION',personalized:false});
   }
   const user=await getAuthUser(env,request);if(!user)return json({ok:false,error:{code:'UNAUTHENTICATED',message:'Kişisel işlemler için hesabınızı doğrulayın.'}},401);
   const blocked=await activeAccess(env,user,true);if(blocked)return blocked;
   if(request.method!=='GET'&&request.headers.get('Origin')!==url.origin)return forbidden('İşlemi ANUNEX üzerinden başlatın.');
   if(path.startsWith('/api/calendar'))return handleCalendar(request,env,user);
   if(path==='/api/nibiru/identity'){
    if(request.method!=='GET')return methodNotAllowed();
    const scope=studentScopeSql(user);
    const students=['STUDENT','PARENT'].includes(user.role)?await all(env.DB.prepare(`SELECT DISTINCT s.id,s.first_name||' '||s.last_name name,se.grade_level FROM student_entities s JOIN student_enrollments se ON se.student_id=s.id WHERE s.status='ACTIVE' AND se.status='ACTIVE' AND (${scope.sql}) ORDER BY name`).bind(...scope.params)):[];
    return json({ok:true,user:{id:user.id,displayName:user.display_name,role:user.role},students});
   }
   if(path==='/api/nibiru/chat'){
    if(request.method!=='POST')return methodNotAllowed();
    const body:any=await request.clone().json().catch(()=>({}));
    if(body.studentId){
     if(!['PARENT','STUDENT'].includes(user.role))return forbidden('Bu kanalda öğrenci seçimi veli ve öğrenci içindir.');
     const scope=studentScopeSql(user);
     const permitted=await env.DB.prepare(`SELECT se.student_id FROM student_enrollments se JOIN student_entities s ON s.id=se.student_id WHERE se.student_id=? AND se.status='ACTIVE' AND s.status='ACTIVE' AND (${scope.sql}) LIMIT 1`).bind(body.studentId,...scope.params).first();
     if(!permitted)return forbidden('Bu öğrenciye erişim yetkiniz yok.');
    }
    const message=String(body.message||'').trim();
    if(!message||message.length>1200)return badRequest('Mesaj 1–1200 karakter arasında olmalıdır.');
    if(/takvim|programım|programim|planlı işler|planli isler/i.test(message)){
     const from=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
     const to=new Date(Date.parse(from)+8*86400000).toISOString().slice(0,10);
     const calendar=await listCalendar(env,user,from,to);
     return json({ok:true,answer:calendar.events.length?`Önümüzdeki günlerde takviminizde:\n${calendar.events.slice(0,10).map(e=>`• ${new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',dateStyle:'short',timeStyle:'short'}).format(new Date(e.starts_at))} — ${e.title}`).join('\n')}\n\nTüm planlar ve hatırlatmalar Takvim Merkezi’nde.`:'Önümüzdeki günlerde yetkiniz kapsamında plan görünmüyor. Takvim Merkezi’nden kişisel plan ekleyebilirsiniz.',intent:'CALENDAR',orchestration:{label:'Planlama desteği'}});
    }
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const reservation=await env.DB.prepare(`INSERT INTO nibiru_daily_usage(user_id,usage_date,request_count) VALUES(?,?,1) ON CONFLICT(user_id,usage_date) DO UPDATE SET request_count=request_count+1 WHERE request_count<30 RETURNING request_count`).bind(user.id,today).first();
    if(!reservation)return json({ok:false,error:{code:'NIBIRU_DAILY_LIMIT',message:'Bugün için 30 Nibiru isteği sınırına ulaştınız. Takvim ve diğer panel işlemleriniz açık; sohbet için yarın tekrar devam edebilirsiniz.'}},429,{'Retry-After':'3600'});
   }
   return app.fetch(request,env,ctx);
  }catch(error){
   console.warn(JSON.stringify({event:'nibiru_access_calendar_error',path,kind:error instanceof Error?error.name:'Error'}));
   return json({ok:false,error:{code:'SERVICE_TEMPORARILY_UNAVAILABLE',message:'İşlem şu anda tamamlanamadı. Lütfen tekrar deneyin.'}},503);
  }
 }
};}
