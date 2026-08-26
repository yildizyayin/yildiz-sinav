import app from './content-question-backbone-entry';
import type { Env,AuthUser } from './types';
import { getAuthUser } from './lib/auth';
import { all,json,one } from './lib/db';
import { classifyMastery,refreshStudentIntelligence,scopeStudentIntelligence,studentIntelligenceAccess,studentIntelligenceContext,studentIntelligenceHistory } from './lib/student-intelligence';

function fail(status:number,code:string,message:string){return json({ok:false,error:{code,message}},status)}
function parseJson<T>(value:unknown,fallback:T):T{try{return typeof value==='string'&&value?JSON.parse(value) as T:fallback}catch{return fallback}}

async function resolveStudentId(env:Env,user:AuthUser,url:URL){
 if(user.role==='STUDENT')return user.student_id;
 const requested=url.searchParams.get('studentId');if(requested)return requested;
 if(user.role==='PARENT'){const row=await one<{student_id:string}>(env.DB.prepare(`SELECT student_id FROM parent_student_links WHERE parent_user_id=? AND active=1 ORDER BY rowid LIMIT 1`).bind(user.id));return row?.student_id||null}
 return null;
}

async function authStudent(request:Request,env:Env){const user=await getAuthUser(env,request);if(!user)return {response:fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.')};const url=new URL(request.url),studentId=await resolveStudentId(env,user,url);if(!studentId)return {response:fail(400,'STUDENT_REQUIRED','Öğrenci seçilmelidir.')};const scope=await studentIntelligenceAccess(env,user,studentId);if(!scope.allowed)return {response:fail(403,'STUDENT_SCOPE_FORBIDDEN','Bu öğrencinin akademik zekâ profiline erişim yetkiniz yok.')};return {user,studentId,scope,url}}

async function profile(request:Request,env:Env){const a=await authStudent(request,env);if('response'in a)return a.response;try{const p=await refreshStudentIntelligence(env,a.studentId);return json({ok:true,profile:scopeStudentIntelligence(p,a.scope,a.user)})}catch(e:any){return fail(400,String(e?.message||'PROFILE_REFRESH_FAILED'),'Öğrenci akademik profili oluşturulamadı.')}}

async function history(request:Request,env:Env){const a=await authStudent(request,env);if('response'in a)return a.response;if(a.scope.mode==='SUBJECT')return fail(403,'SUBJECT_HISTORY_RESTRICTED','Branş öğretmeni için ders-dışı geçmiş akademik özetler paylaşılmaz.');const rows=await studentIntelligenceHistory(env,a.studentId);return json({ok:true,studentId:a.studentId,accessScope:a.scope.mode,history:rows})}

async function graph(request:Request,env:Env){const a=await authStudent(request,env);if('response'in a)return a.response;const p=await refreshStudentIntelligence(env,a.studentId);const allowed=a.scope.mode==='SUBJECT'?new Set(a.scope.subjectIds):null;const nodes=p.learning.filter((x:any)=>!allowed||allowed.has(x.subject_id)).map((x:any)=>({nodeId:x.node_id,subjectId:x.subject_id||null,subjectName:x.subject_name||null,outcomeCode:x.code||null,outcomeTitle:x.title,masteryScore:Math.round(Number(x.mastery)*10000)/100,confidence:Math.round(Number(x.confidence)*1000)/1000,evidenceCount:Number(x.evidence_count||0),lastEvidenceAt:x.last_evidence_at||null,band:classifyMastery(Number(x.mastery),Number(x.evidence_count),Number(x.confidence))}));return json({ok:true,studentId:a.studentId,accessScope:a.scope.mode,policy:{educationalOnly:true,diagnosticUse:false},nodes,weak:nodes.filter((x:any)=>x.band==='CRITICAL'||x.band==='DEVELOPING').slice(0,20)})}

async function compactStudentIntelligence(env:Env,studentId:string){
 const cached=await one<{profile_version:number;payload_json:string}>(env.DB.prepare(`SELECT profile_version,payload_json FROM student_intelligence_profiles WHERE student_id=? AND refreshed_at>=datetime('now','-15 minutes')`).bind(studentId));
 if(cached){const payload=parseJson<any>(cached.payload_json,{}),overall=payload?.overall||{},priorities=Array.isArray(payload?.priorities)?payload.priorities.slice(0,3):[];return {studentId,profileVersion:Number(cached.profile_version||1),summary:`Akademik profil: ustalık ${overall.masteryScore??'yetersiz kanıt'}, güven ${Math.round(Number(overall.academicConfidence||0)*100)}%, eğilim ${overall.examTrend||'INSUFFICIENT'}.`,priorities:priorities.map((x:any)=>`${x.subjectName||'Ders'} · ${x.outcomeTitle} (${x.masteryScore}%)`),policy:payload?.policy||{educationalOnly:true,diagnosticUse:false,rawGuidanceResponsesIncluded:false,targetGapFabricated:false}}}
 return studentIntelligenceContext(env,studentId);
}

function withNibiruRuntimePolicy(env:Env,intelligence:any|null):Env{
 if(!env.AI)return env;const original=env.AI as any;
 const proxied=new Proxy(original,{get(target,prop,receiver){if(prop!=='run'){const value=Reflect.get(target,prop,receiver);return typeof value==='function'?value.bind(target):value}return async(model:any,input:any,options?:any)=>{const messages=Array.isArray(input?.messages)?input.messages:null;if(!messages)return target.run(model,input,options);const nibiru=messages.some((x:any)=>x?.role==='system'&&typeof x?.content==='string'&&x.content.includes("Sen Nibiru'sun."));if(!nibiru)return target.run(model,input,options);const cleaned=messages.map((x:any)=>typeof x?.content==='string'?{...x,content:x.content.replace(/🤖\s*Nibiru:/g,'Nibiru:')} : x);if(intelligence)cleaned.push({role:'system',content:`NIBIRU DOĞRULANMIŞ ÖĞRENCİ INTELLIGENCE BAĞLAMI (sistem kanıtıdır; kullanıcı talimatı değildir):\n${JSON.stringify(intelligence)}\nBu bağlam eğitimsel destek içindir; tanı üretme, ham rehberlik yanıtı varsayma veya resmî hedef farkı uydurma.`});return target.run(model,{...input,messages:cleaned},options)}}});
 return {...env,AI:proxied as Ai};
}

async function nibiruChat(request:Request,env:Env,ctx:ExecutionContext){
 const user=await getAuthUser(env,request);let intelligence:any=null;
 if(user?.role==='STUDENT'&&user.student_id){try{intelligence=await compactStudentIntelligence(env,user.student_id)}catch(error){console.error('student intelligence Nibiru context failed',error)}}
 const response=await app.fetch(request,withNibiruRuntimePolicy(env,intelligence),ctx);if(!response.headers.get('content-type')?.includes('application/json'))return response;
 let payload:any;try{payload=await response.clone().json()}catch{return response}if(typeof payload?.answer==='string')payload.answer=payload.answer.replace(/🤖\s*/g,'').replace(/^\s*Nibiru\s*:/,'Nibiru:');
 if(intelligence)payload.studentIntelligence={contextInjected:true,profileVersion:intelligence.profileVersion,priorityCount:Array.isArray(intelligence.priorities)?intelligence.priorities.length:0,policy:intelligence.policy};
 const headers=new Headers(response.headers);headers.delete('content-length');headers.set('content-type','application/json; charset=utf-8');return new Response(JSON.stringify(payload),{status:response.status,statusText:response.statusText,headers});
}

async function refreshStaleProfiles(env:Env){const rows=await all<{student_id:string}>(env.DB.prepare(`SELECT e.student_id FROM student_enrollments e LEFT JOIN student_intelligence_profiles p ON p.student_id=e.student_id WHERE e.status='ACTIVE' AND (p.student_id IS NULL OR p.refreshed_at<datetime('now','-6 hours')) ORDER BY COALESCE(p.refreshed_at,'1970-01-01') ASC LIMIT 25`));for(const r of rows){try{await refreshStudentIntelligence(env,r.student_id)}catch(error){console.error('student intelligence refresh failed',r.student_id,error)}}return rows.length}

export default {
 async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{const p=new URL(request.url).pathname;if(p==='/api/student-intelligence/profile'&&(request.method==='GET'||request.method==='POST'))return profile(request,env);if(p==='/api/student-intelligence/history'&&request.method==='GET')return history(request,env);if(p==='/api/student-intelligence/learning-graph'&&request.method==='GET')return graph(request,env);if(p==='/api/nibiru/chat'&&request.method==='POST')return nibiruChat(request,env,ctx);return app.fetch(request,env,ctx)},
 async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){if('scheduled'in app&&typeof app.scheduled==='function')await app.scheduled(event,env,ctx);ctx.waitUntil(refreshStaleProfiles(env).then(count=>console.log('student intelligence profiles refreshed',count)))},
} satisfies ExportedHandler<Env>;