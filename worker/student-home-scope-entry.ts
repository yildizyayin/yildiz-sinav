import app from './standard-entry';
import type {Env} from './types';
import {getAuthUser} from './lib/auth';
import {one} from './lib/db';

function daysUntil(dateValue:string|null|undefined){
 if(!dateValue)return null;
 const target=new Date(`${dateValue}T00:00:00`);if(Number.isNaN(target.getTime()))return null;
 const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
 return Math.max(0,Math.ceil((target.getTime()-today.getTime())/86400000));
}

async function scopedHomeContext(request:Request,env:Env,ctx:ExecutionContext){
 const response=await app.fetch(request,env,ctx);
 if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))return response;
 const user=await getAuthUser(env,request);if(user?.role!=='STUDENT'||!user.student_id)return response;
 const payload:any=await response.clone().json().catch(()=>null);if(!payload?.ok)return response;
 const enrollment=await one<any>(env.DB.prepare(`SELECT institution_id,grade_level FROM student_enrollments WHERE student_id=? ORDER BY CASE status WHEN 'ACTIVE' THEN 0 WHEN 'GRADUATED' THEN 1 ELSE 2 END,created_at DESC LIMIT 1`).bind(user.student_id));
 const preference=await one<any>(env.DB.prepare(`SELECT countdown_target_date,countdown_label FROM student_experience_preferences WHERE student_id=?`).bind(user.student_id));
 if(preference?.countdown_target_date)return response;
 let next:any=null;
 if(enrollment?.institution_id){
  next=await one<any>(env.DB.prepare(`SELECT e.title,e.exam_date FROM exams e WHERE e.exam_date>date('now') AND (e.grade_level=? OR e.grade_level IS NULL) AND e.status IN ('DRAFT','ACTIVE') AND (e.institution_id=? OR EXISTS(SELECT 1 FROM exam_institutions ei WHERE ei.exam_id=e.id AND ei.institution_id=? AND ei.enabled=1)) ORDER BY e.exam_date LIMIT 1`).bind(enrollment.grade_level,enrollment.institution_id,enrollment.institution_id));
 }
 const targetDate=next?.exam_date||null,label=preference?.countdown_label||next?.title||null;
 payload.countdown={...(payload.countdown||{}),label,targetDate,days:daysUntil(targetDate)};
 const headers=new Headers(response.headers);headers.delete('content-length');headers.set('content-type','application/json; charset=utf-8');
 return new Response(JSON.stringify(payload),{status:response.status,statusText:response.statusText,headers});
}

export default {
 async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
  const url=new URL(request.url);
  if(url.pathname==='/api/student-standard/home-context'&&request.method==='GET')return scopedHomeContext(request,env,ctx);
  return app.fetch(request,env,ctx);
 },
 async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){
  if('scheduled' in app&&typeof app.scheduled==='function')return app.scheduled(event,env,ctx);
 },
} satisfies ExportedHandler<Env>;
