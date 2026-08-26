import app from './content-question-backbone-entry';
import type { Env,AuthUser } from './types';
import { getAuthUser } from './lib/auth';
import { all,json,one } from './lib/db';
import { classifyMastery,refreshStudentIntelligence,scopeStudentIntelligence,studentIntelligenceAccess,studentIntelligenceHistory } from './lib/student-intelligence';

function fail(status:number,code:string,message:string){return json({ok:false,error:{code,message}},status)}

async function resolveStudentId(env:Env,user:AuthUser,url:URL){
 if(user.role==='STUDENT')return user.student_id;
 const requested=url.searchParams.get('studentId');if(requested)return requested;
 if(user.role==='PARENT'){const row=await one<{student_id:string}>(env.DB.prepare(`SELECT student_id FROM parent_student_links WHERE parent_user_id=? AND active=1 ORDER BY rowid LIMIT 1`).bind(user.id));return row?.student_id||null}
 return null;
}

async function authStudent(request:Request,env:Env){const user=await getAuthUser(env,request);if(!user)return {response:fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.')};const url=new URL(request.url),studentId=await resolveStudentId(env,user,url);if(!studentId)return {response:fail(400,'STUDENT_REQUIRED','Öğrenci seçilmelidir.')};const scope=await studentIntelligenceAccess(env,user,studentId);if(!scope.allowed)return {response:fail(403,'STUDENT_SCOPE_FORBIDDEN','Bu öğrencinin akademik zekâ profiline erişim yetkiniz yok.')};return {user,studentId,scope,url}}

async function profile(request:Request,env:Env){const a=await authStudent(request,env);if('response'in a)return a.response;try{const p=await refreshStudentIntelligence(env,a.studentId);return json({ok:true,profile:scopeStudentIntelligence(p,a.scope,a.user)})}catch(e:any){return fail(400,String(e?.message||'PROFILE_REFRESH_FAILED'),'Öğrenci akademik profili oluşturulamadı.')}}

async function history(request:Request,env:Env){const a=await authStudent(request,env);if('response'in a)return a.response;const rows=await studentIntelligenceHistory(env,a.studentId);return json({ok:true,studentId:a.studentId,history:rows})}

async function graph(request:Request,env:Env){const a=await authStudent(request,env);if('response'in a)return a.response;const p=await refreshStudentIntelligence(env,a.studentId);const allowed=a.scope.mode==='SUBJECT'?new Set(a.scope.subjectIds):null;const nodes=p.learning.filter((x:any)=>!allowed||allowed.has(x.subject_id)).map((x:any)=>({nodeId:x.node_id,subjectId:x.subject_id||null,subjectName:x.subject_name||null,outcomeCode:x.code||null,outcomeTitle:x.title,masteryScore:Math.round(Number(x.mastery)*10000)/100,confidence:Math.round(Number(x.confidence)*1000)/1000,evidenceCount:Number(x.evidence_count||0),lastEvidenceAt:x.last_evidence_at||null,band:classifyMastery(Number(x.mastery),Number(x.evidence_count),Number(x.confidence))}));return json({ok:true,studentId:a.studentId,accessScope:a.scope.mode,policy:{educationalOnly:true,diagnosticUse:false},nodes,weak:nodes.filter((x:any)=>x.band==='CRITICAL'||x.band==='DEVELOPING').slice(0,20)})}

async function refreshStaleProfiles(env:Env){const rows=await all<{student_id:string}>(env.DB.prepare(`SELECT e.student_id FROM student_enrollments e LEFT JOIN student_intelligence_profiles p ON p.student_id=e.student_id WHERE e.status='ACTIVE' AND (p.student_id IS NULL OR p.refreshed_at<datetime('now','-6 hours')) ORDER BY COALESCE(p.refreshed_at,'1970-01-01') ASC LIMIT 25`));for(const r of rows){try{await refreshStudentIntelligence(env,r.student_id)}catch(error){console.error('student intelligence refresh failed',r.student_id,error)}}return rows.length}

export default {
 async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{const p=new URL(request.url).pathname;if(p==='/api/student-intelligence/profile'&&(request.method==='GET'||request.method==='POST'))return profile(request,env);if(p==='/api/student-intelligence/history'&&request.method==='GET')return history(request,env);if(p==='/api/student-intelligence/learning-graph'&&request.method==='GET')return graph(request,env);return app.fetch(request,env,ctx)},
 async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){if('scheduled'in app&&typeof app.scheduled==='function')await app.scheduled(event,env,ctx);ctx.waitUntil(refreshStaleProfiles(env).then(count=>console.log('student intelligence profiles refreshed',count)))},
} satisfies ExportedHandler<Env>;
