import type { AuthUser, Env } from '../types';
import { centralOpenToAllSql } from './exam-audience';
import { all, audit, badRequest, forbidden, json, methodNotAllowed, notFound, one, uuid } from './db';
import { loadPermissionScope } from './permissions';
import { dueMillis } from './homework';

export const CALENDAR_KINDS=['LESSON','EXAM','HOMEWORK','WORKSHEET','MEETING','GUIDANCE','RBA','STUDY','REMINDER'] as const;
export type CalendarEvent={id:string;institution_id:string|null;owner_user_id:string;scope:string;class_id:string|null;student_id:string|null;subject_id:string|null;kind:string;title:string;description:string|null;starts_at:string;ends_at:string;recurrence:string;repeat_until:string|null;reminder_minutes:number;status:string;revision:number};
export function validCalendarRange(from:string,to:string){
 return /^\d{4}-\d{2}-\d{2}$/.test(from)&&/^\d{4}-\d{2}-\d{2}$/.test(to)&&Number.isFinite(Date.parse(from))&&Number.isFinite(Date.parse(to))&&new Date(from).toISOString().slice(0,10)===from&&new Date(to).toISOString().slice(0,10)===to&&Date.parse(to)>Date.parse(from)&&Date.parse(to)-Date.parse(from)<=93*86400000;
}
export function expandCalendarEvent(event:CalendarEvent,from:string,to:string){
 const start=Date.parse(event.starts_at),end=Date.parse(event.ends_at),lo=Date.parse(`${from}T00:00:00+03:00`),hi=Date.parse(`${to}T00:00:00+03:00`);
 const until=event.recurrence==='WEEKLY'?Date.parse(event.repeat_until||event.starts_at):start;
 const rows:any[]=[];
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return rows;
 const step=7*86400000;
 let offset=event.recurrence==='WEEKLY'?Math.max(0,Math.ceil((lo-end+1)/step))*step:0;
 // Europe/Istanbul uses UTC+3 throughout the year; retain local lesson time.
 for(let count=0;count<15&&start+offset<hi&&start+offset<=until;count++,offset+=step){
  if(end+offset>lo)rows.push({...event,occurrenceId:`${event.id}:${new Date(start+offset).toISOString()}`,starts_at:new Date(start+offset).toISOString(),ends_at:new Date(end+offset).toISOString(),source:'CALENDAR',url:'/calendar'});
  if(event.recurrence!=='WEEKLY')break;
 }
 return rows;
}
type SqlScope={sql:string;params:unknown[]};
export function studentScopeSql(user:AuthUser,alias='se'):SqlScope {
 if(user.role==='SUPER_ADMIN')return {sql:'1=1',params:[]};
 const institution=`${alias}.institution_id=?`;
 if(!user.institution_id)return {sql:'0=1',params:[]};
 if(user.role==='INSTITUTION_MANAGER')return {sql:institution,params:[user.institution_id]};
 if(user.role==='STUDENT')return {sql:`${institution} AND ${alias}.student_id=?`,params:[user.institution_id,user.student_id||'']};
 if(user.role==='PARENT')return {sql:`${institution} AND EXISTS(SELECT 1 FROM parent_student_links p WHERE p.student_id=${alias}.student_id AND p.parent_user_id=? AND p.active=1)`,params:[user.institution_id,user.id]};
 return {sql:`${institution} AND EXISTS(SELECT 1 FROM teacher_assignments ta WHERE ta.user_id=? AND ta.class_id=${alias}.class_id AND ta.active=1 AND ta.assignment_type=?)`,params:[user.institution_id,user.id,user.role==='GUIDANCE_TEACHER'?'GUIDANCE':'SUBJECT']};
}
async function accessibleStudent(env:Env,user:AuthUser,id:string){
 const scope=studentScopeSql(user);
 return one<any>(env.DB.prepare(`SELECT se.student_id,se.class_id,se.institution_id FROM student_enrollments se JOIN student_entities s ON s.id=se.student_id WHERE se.student_id=? AND se.status='ACTIVE' AND s.status='ACTIVE' AND (${scope.sql}) LIMIT 1`).bind(id,...scope.params));
}
async function eventScope(env:Env,user:AuthUser):Promise<SqlScope>{
 const studentScope=studentScopeSql(user);
 const student=`EXISTS(SELECT 1 FROM student_enrollments se WHERE se.student_id=e.student_id AND se.status='ACTIVE' AND (${studentScope.sql}))`;
 const enrolledClass=`EXISTS(SELECT 1 FROM student_enrollments se WHERE se.class_id=e.class_id AND se.status='ACTIVE' AND (${studentScope.sql}))`;
 if(user.role==='SUPER_ADMIN')return {sql:`(e.scope!='PERSONAL' OR e.owner_user_id=?)`,params:[user.id]};
 if(!user.institution_id)return {sql:`(e.scope='PERSONAL' AND e.owner_user_id=?)`,params:[user.id]};
 if(user.role==='INSTITUTION_MANAGER')return {sql:`((e.scope='PERSONAL' AND e.owner_user_id=?) OR (e.scope!='PERSONAL' AND e.institution_id=?))`,params:[user.id,user.institution_id]};
 const branch=user.role==='TEACHER'?`AND (e.subject_id IS NULL OR EXISTS(SELECT 1 FROM teacher_assignments ta WHERE ta.user_id=? AND ta.active=1 AND ta.assignment_type='SUBJECT' AND ta.subject_id=e.subject_id AND (ta.class_id=e.class_id OR EXISTS(SELECT 1 FROM student_enrollments se WHERE se.student_id=e.student_id AND se.status='ACTIVE' AND se.class_id=ta.class_id))))`:'';
 return {sql:`((e.scope='PERSONAL' AND e.owner_user_id=?) OR (e.institution_id=? AND (e.scope='INSTITUTION' OR (e.scope='CLASS' AND ${enrolledClass}) OR (e.scope='STUDENT' AND ${student})) ${branch}))`,params:[user.id,user.institution_id,...studentScope.params,...studentScope.params,...(user.role==='TEACHER'?[user.id]:[])]};
}
export async function calendarOptions(env:Env,user:AuthUser){
 const scope=studentScopeSql(user);
 const classes=user.role==='SUPER_ADMIN'?await all(env.DB.prepare('SELECT id,name,institution_id FROM classes WHERE active=1 ORDER BY name LIMIT 300')):user.role==='INSTITUTION_MANAGER'?await all(env.DB.prepare('SELECT id,name,institution_id FROM classes WHERE institution_id=? AND active=1 ORDER BY name LIMIT 300').bind(user.institution_id)):await all(env.DB.prepare(`SELECT DISTINCT c.id,c.name,c.institution_id FROM classes c JOIN student_enrollments se ON se.class_id=c.id WHERE c.active=1 AND se.status='ACTIVE' AND (${scope.sql}) ORDER BY c.name LIMIT 300`).bind(...scope.params));
 const subjects=await all(env.DB.prepare(`SELECT id,name FROM subjects ${user.role==='TEACHER'?"WHERE id IN (SELECT subject_id FROM teacher_assignments WHERE user_id=? AND active=1 AND assignment_type='SUBJECT')":''} ORDER BY name`).bind(...(user.role==='TEACHER'?[user.id]:[])));
 const children=user.role==='PARENT'?await all(env.DB.prepare(`SELECT DISTINCT s.id,s.first_name||' '||s.last_name name FROM student_entities s JOIN student_enrollments se ON se.student_id=s.id WHERE s.status='ACTIVE' AND se.status='ACTIVE' AND (${scope.sql}) ORDER BY name`).bind(...scope.params)):[];
 const institutions=user.role==='SUPER_ADMIN'?await all(env.DB.prepare("SELECT id,name FROM institutions WHERE status='ACTIVE' ORDER BY name LIMIT 300")):[];
 const students=['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role)?await all(env.DB.prepare(`SELECT DISTINCT s.id,s.first_name||' '||s.last_name name,se.institution_id FROM student_entities s JOIN student_enrollments se ON se.student_id=s.id WHERE s.status='ACTIVE' AND se.status='ACTIVE' AND (${scope.sql}) ORDER BY name LIMIT 300`).bind(...scope.params)):children;
 return {classes,subjects,children,students,institutions,kinds:CALENDAR_KINDS,scopes:['PERSONAL',...(['SUPER_ADMIN','INSTITUTION_MANAGER'].includes(user.role)?['INSTITUTION','CLASS','STUDENT']:['TEACHER','GUIDANCE_TEACHER'].includes(user.role)?['CLASS','STUDENT']:[])],timezone:'Europe/Istanbul',reminderChannel:'IN_APP'};
}
/**
 * A063: overlapping timed events in the same view are marked (each lists the occurrences it overlaps). Due
 * moments (zero length) and day items without a time (exams, worksheets) never count as a clash.
 */
export function markConflicts(events:any[]){
 const timed=events.filter(e=>!e.timeUnspecified&&Date.parse(e.ends_at)>Date.parse(e.starts_at));
 for(const e of events)e.conflictsWith=[];
 for(let i=0;i<timed.length;i++)for(let j=i+1;j<timed.length;j++){const a=timed[i],b=timed[j];
  if(Date.parse(a.starts_at)<Date.parse(b.ends_at)&&Date.parse(b.starts_at)<Date.parse(a.ends_at)){a.conflictsWith.push(b.occurrenceId);b.conflictsWith.push(a.occurrenceId);}}
 return events;
}
export async function listCalendar(env:Env,user:AuthUser,from:string,to:string){
 const scope=await eventScope(env,user);
 const raw=await all<CalendarEvent&{acknowledged_at?:string}>(env.DB.prepare(`SELECT e.* FROM calendar_events e WHERE (${scope.sql}) AND e.status!='CANCELLED' AND julianday(e.starts_at)<julianday(?) AND (julianday(e.ends_at)>julianday(?) OR (e.recurrence='WEEKLY' AND julianday(e.repeat_until)>=julianday(?))) ORDER BY e.starts_at LIMIT 301`).bind(...scope.params,`${to}T00:00:00+03:00`,`${from}T00:00:00+03:00`,`${from}T00:00:00+03:00`));
 const acknowledgements=await all<{event_id:string;occurrence_at:string;acknowledged_at:string}>(env.DB.prepare(`SELECT a.event_id,a.occurrence_at,a.acknowledged_at FROM calendar_event_acknowledgements a JOIN calendar_events e ON e.id=a.event_id WHERE a.user_id=? AND (${scope.sql}) AND julianday(a.occurrence_at)>=julianday(?) AND julianday(a.occurrence_at)<julianday(?) LIMIT 4500`).bind(user.id,...scope.params,`${from}T00:00:00+03:00`,`${to}T00:00:00+03:00`));
 const seen=new Map(acknowledgements.map(a=>[`${a.event_id}:${a.occurrence_at}`,a.acknowledged_at]));
 const events=raw.slice(0,300).flatMap(e=>expandCalendarEvent(e,from,to)).map(e=>({...e,acknowledged_at:seen.get(`${e.id}:${e.starts_at}`)||null,editable:e.owner_user_id===user.id||(e.scope!=='PERSONAL'&&['SUPER_ADMIN','INSTITUTION_MANAGER'].includes(user.role))}));
 const sourceScope=studentScopeSql(user);
 // Existing modules remain the source of truth: no duplicate exam/assignment rows.
 const assignments=await all<any>(env.DB.prepare(`SELECT DISTINCT a.id,a.title,a.due_at,ar.status FROM assignments a JOIN assignment_recipients ar ON ar.assignment_id=a.id JOIN student_enrollments se ON se.student_id=ar.student_id AND se.status='ACTIVE' WHERE a.status IN ('ASSIGNED','CLOSED') AND julianday(a.due_at)>=julianday(?,'-1 day') AND julianday(a.due_at)<julianday(?,'+1 day') AND (${sourceScope.sql}) ${user.role==='TEACHER'?'AND a.created_by=?':''} ORDER BY a.due_at LIMIT 301`).bind(`${from}T00:00:00+03:00`,`${to}T00:00:00+03:00`,...sourceScope.params,...(user.role==='TEACHER'?[user.id]:[])));
 // A063: the due moment is read the same way as the homework itself (date only = 23:59 Türkiye time; no zone = Türkiye)
 const lo=Date.parse(`${from}T00:00:00+03:00`),hi=Date.parse(`${to}T00:00:00+03:00`);
 for(const a of assignments.slice(0,300)){const due=dueMillis(a.due_at);if(due===null||due<lo||due>=hi)continue;const at=new Date(due).toISOString();events.push({id:`assignment:${a.id}`,occurrenceId:`assignment:${a.id}:${a.status}`,kind:'HOMEWORK',title:a.title,starts_at:at,ends_at:at,status:a.status==='COMPLETED'?'COMPLETED':'PLANNED',source:'ASSIGNMENT',url:user.role==='PARENT'?'/children':'/assignments',editable:false});}
 const worksheets=await all<any>(env.DB.prepare(`SELECT DISTINCT w.id,wsheet.title,w.planned_date,w.status FROM worksheet_calendar_entries w JOIN worksheets wsheet ON wsheet.id=w.worksheet_id WHERE wsheet.status='PUBLISHED' AND w.status NOT IN ('CANCELLED','SKIPPED') AND w.planned_date>=? AND w.planned_date<? AND ${user.role==='SUPER_ADMIN'?'1=1':`(w.institution_id=? AND ${user.role==='INSTITUTION_MANAGER'?'1=1':`EXISTS(SELECT 1 FROM student_enrollments se WHERE se.status='ACTIVE' AND (w.class_id IS NULL OR se.class_id=w.class_id) AND (${sourceScope.sql}))`})`} ${user.role==='TEACHER'?`AND EXISTS(SELECT 1 FROM worksheet_subjects ws JOIN teacher_assignments ta ON ta.subject_id=ws.subject_id WHERE ws.worksheet_id=w.worksheet_id AND ta.user_id=? AND ta.active=1 AND ta.assignment_type='SUBJECT' AND (w.class_id IS NULL OR ta.class_id=w.class_id))`:''} ORDER BY w.planned_date LIMIT 301`).bind(from,to,...(user.role==='SUPER_ADMIN'?[]:[user.institution_id,...(user.role==='INSTITUTION_MANAGER'?[]:sourceScope.params)]),...(user.role==='TEACHER'?[user.id]:[])));
 for(const w of worksheets.slice(0,300))events.push({id:`worksheet:${w.id}`,occurrenceId:`worksheet:${w.id}`,kind:'WORKSHEET',title:w.title,starts_at:`${w.planned_date}T09:00:00+03:00`,ends_at:`${w.planned_date}T10:00:00+03:00`,timeUnspecified:true,status:w.status==='APPLIED'?'COMPLETED':'PLANNED',source:'WORKSHEET',url:['STUDENT','PARENT'].includes(user.role)?'/nibiru':'/worksheet-calendar',editable:false});
 const exams=await all<any>(env.DB.prepare(`SELECT DISTINCT e.id,e.title,e.exam_date FROM exams e WHERE e.status IN ('ACTIVE','CLOSED') AND date(e.exam_date)>=? AND date(e.exam_date)<? AND ${user.role==='SUPER_ADMIN'?'1=1':`(e.institution_id=? OR EXISTS(SELECT 1 FROM exam_institutions ei WHERE ei.exam_id=e.id AND ei.institution_id=? AND ei.enabled=1) OR (e.institution_id IS NULL AND ${centralOpenToAllSql('e')})) AND ${user.role==='INSTITUTION_MANAGER'?'1=1':`EXISTS(SELECT 1 FROM student_enrollments se WHERE se.status='ACTIVE' AND (e.grade_level IS NULL OR se.grade_level=e.grade_level) AND (${sourceScope.sql}))`} ${user.role==='TEACHER'?`AND EXISTS(SELECT 1 FROM exam_subjects es JOIN teacher_assignments ta ON ta.subject_id=es.subject_id WHERE es.exam_id=e.id AND ta.user_id=? AND ta.active=1 AND ta.assignment_type='SUBJECT')`:''}`} ORDER BY e.exam_date LIMIT 301`).bind(from,to,...(user.role==='SUPER_ADMIN'?[]:[user.institution_id,user.institution_id,...(user.role==='INSTITUTION_MANAGER'?[]:sourceScope.params),...(user.role==='TEACHER'?[user.id]:[])])));
 for(const e of exams.slice(0,300))events.push({id:`exam:${e.id}`,occurrenceId:`exam:${e.id}`,kind:'EXAM',title:e.title,starts_at:`${String(e.exam_date).slice(0,10)}T09:00:00+03:00`,ends_at:`${String(e.exam_date).slice(0,10)}T10:00:00+03:00`,timeUnspecified:true,status:'PLANNED',source:'EXAM',url:user.role==='STUDENT'?'/my-results':user.role==='PARENT'?'/children':'/exams',editable:false});
 events.sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
 markConflicts(events);
 return {events,truncated:[raw,assignments,worksheets,exams].some(x=>x.length>300),timezone:'Europe/Istanbul',reminderChannel:'IN_APP'};
}
async function saveEvent(request:Request,env:Env,user:AuthUser,id?:string){
 const b:any=await request.json().catch(()=>({}));
 const scope=String(b.scope||'PERSONAL'),kind=String(b.kind||'REMINDER'),title=String(b.title||'').trim(),start=String(b.startsAt||''),end=String(b.endsAt||'');
 if(!['PERSONAL','CLASS','STUDENT','INSTITUTION'].includes(scope)||!CALENDAR_KINDS.includes(kind as any)||!title||title.length>160||String(b.description||'').length>1000)return badRequest('Başlık, tür veya kapsam geçersiz.');
 const explicitTime=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
 if(!explicitTime.test(start)||!explicitTime.test(end)||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(end)<=Date.parse(start)||Date.parse(end)-Date.parse(start)>7*86400000)return badRequest('Saat dilimiyle geçerli başlangıç ve bitiş seçin.');
 const recurrence=b.recurrence==='WEEKLY'?'WEEKLY':'NONE';
 const until=recurrence==='WEEKLY'?String(b.repeatUntil||''):null;
 if(until&&(!explicitTime.test(until)||!Number.isFinite(Date.parse(until))||Date.parse(until)<Date.parse(start)||Date.parse(until)-Date.parse(start)>366*86400000))return badRequest('Tekrar bitişi bir yıl içinde olmalı.');
 if(recurrence==='WEEKLY'&&!until)return badRequest('Haftalık tekrar için bitiş tarihi seçin.');
 const reminder=Number(b.reminderMinutes??30);if(![0,15,30,60,1440].includes(reminder))return badRequest('Hatırlatma süresi geçersiz.');
 let institutionId=user.institution_id,classId:string|null=null,studentId:string|null=null,subjectId:string|null=b.subjectId?String(b.subjectId):null;
 if(scope!=='PERSONAL'){
  if(['STUDENT','PARENT'].includes(user.role))return forbidden('Yalnız kendi kişisel planınızı oluşturabilirsiniz.');
  if(user.role==='SUPER_ADMIN')institutionId=String(b.institutionId||'')||null;
  if(!institutionId)return badRequest('Kurum seçin.');
  const institution=await one<{id:string}>(env.DB.prepare("SELECT id FROM institutions WHERE id=? AND status='ACTIVE'").bind(institutionId));if(!institution)return forbidden('Aktif kurum bulunamadı.');
  if(scope==='INSTITUTION'&&!['SUPER_ADMIN','INSTITUTION_MANAGER'].includes(user.role))return forbidden('Kurum geneli planı yönetici oluşturur.');
  if(scope==='STUDENT'){
   const se=await accessibleStudent(env,user,String(b.studentId||''));if(!se||se.institution_id!==institutionId)return forbidden('Bu öğrenci için plan oluşturamazsınız.');studentId=se.student_id;classId=se.class_id;
  }
  if(scope==='CLASS'){
   const c=await one<{id:string}>(env.DB.prepare('SELECT id FROM classes WHERE id=? AND institution_id=? AND active=1').bind(String(b.classId||''),institutionId));if(!c)return forbidden('Sınıf yetki kapsamınızda değil.');classId=c.id;
  }
  if(['TEACHER','GUIDANCE_TEACHER'].includes(user.role)){
   const p=await loadPermissionScope(env.DB,user);
   if(user.role==='TEACHER'&&(!classId||!subjectId||!p.subjectClassAssignments.some(x=>x.classId===classId&&x.subjectId===subjectId)))return forbidden('Atandığınız sınıf ve branşı seçin.');
   if(user.role==='GUIDANCE_TEACHER'&&(!classId||!p.guidanceClassIds.includes(classId)))return forbidden('Rehberlik atamanız olmayan sınıfta plan oluşturamazsınız.');
  }
 }
 if(subjectId&&!await one(env.DB.prepare('SELECT id FROM subjects WHERE id=?').bind(subjectId)))return badRequest('Branş geçersiz.');
 if(['GUIDANCE','RBA'].includes(kind)&&!['GUIDANCE_TEACHER','SUPER_ADMIN','INSTITUTION_MANAGER'].includes(user.role)&&scope!=='PERSONAL')return forbidden('Rehberlik planını yetkili rehber oluşturur.');
 if(scope==='PERSONAL'){classId=null;studentId=null;subjectId=null;}
 const status=String(b.status||'PLANNED');if(!['PLANNED','COMPLETED','CANCELLED'].includes(status))return badRequest('Durum geçersiz.');
 let existing:CalendarEvent|null=null;
 if(id){const access=await eventScope(env,user);existing=await one<CalendarEvent>(env.DB.prepare(`SELECT e.* FROM calendar_events e WHERE e.id=? AND (${access.sql})`).bind(id,...access.params));if(!existing)return notFound();if(existing.owner_user_id!==user.id&&(existing.scope==='PERSONAL'||!['SUPER_ADMIN','INSTITUTION_MANAGER'].includes(user.role)))return forbidden('Bu planı düzenleyemezsiniz.');if(Number(b.revision)!==existing.revision)return json({ok:false,error:{code:'CALENDAR_CONFLICT',message:'Plan değişmiş. Yenileyip tekrar deneyin.'}},409);}
 const eventId=id||uuid('cal');
 const params=[institutionId,scope,classId,studentId,subjectId,kind,title,String(b.description||'').trim()||null,new Date(start).toISOString(),new Date(end).toISOString(),recurrence,until?new Date(until).toISOString():null,reminder,status];
 if(existing){const result=await env.DB.prepare(`UPDATE calendar_events SET institution_id=?,scope=?,class_id=?,student_id=?,subject_id=?,kind=?,title=?,description=?,starts_at=?,ends_at=?,recurrence=?,repeat_until=?,reminder_minutes=?,status=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=?`).bind(...params,eventId,existing.revision).run();if(result.meta.changes!==1)return json({ok:false,error:{code:'CALENDAR_CONFLICT',message:'Plan değişmiş. Yenileyin.'}},409);}
 else await env.DB.prepare(`INSERT INTO calendar_events(institution_id,scope,class_id,student_id,subject_id,kind,title,description,starts_at,ends_at,recurrence,repeat_until,reminder_minutes,status,id,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...params,eventId,user.id).run();
 await audit(env.DB,user.id,institutionId,'CALENDAR_EVENT_SAVED','calendar_event',eventId,{scope,kind,status});
 return json({ok:true,id:eventId},id?200:201);
}
export async function handleCalendar(request:Request,env:Env,user:AuthUser){
 const url=new URL(request.url);
 if(url.pathname==='/api/calendar/options')return request.method==='GET'?json({ok:true,...await calendarOptions(env,user)}):methodNotAllowed();
 if(url.pathname==='/api/calendar'){
  if(request.method==='POST')return saveEvent(request,env,user);
  if(request.method==='GET'){const from=url.searchParams.get('from')||'',to=url.searchParams.get('to')||'';if(!validCalendarRange(from,to))return badRequest('En fazla 93 günlük geçerli tarih aralığı seçin.');return json({ok:true,...await listCalendar(env,user,from,to)});}
 }
 const match=url.pathname.match(/^\/api\/calendar\/([^/]+)(\/acknowledge)?$/);
 if(match){
  if(match[2]&&request.method==='POST'){
   const access=await eventScope(env,user);const event=await one<CalendarEvent>(env.DB.prepare(`SELECT e.* FROM calendar_events e WHERE e.id=? AND (${access.sql})`).bind(match[1],...access.params));if(!event)return notFound();
   const body:any=await request.json().catch(()=>({}));const at=body.occurrenceAt?String(body.occurrenceAt):event.starts_at;const time=Date.parse(at),base=Date.parse(event.starts_at);
   if(!Number.isFinite(time)||time<base||(event.recurrence==='WEEKLY'?(time-base)%(7*86400000)!==0||time>Date.parse(event.repeat_until||''):time!==base))return badRequest('Hatırlatma tarihi geçersiz.');
   await env.DB.prepare('INSERT OR REPLACE INTO calendar_event_acknowledgements(event_id,user_id,occurrence_at) VALUES(?,?,?)').bind(match[1],user.id,new Date(time).toISOString()).run();return json({ok:true});
  }
  if(!match[2]&&request.method==='PUT')return saveEvent(request,env,user,match[1]);
 }
 return methodNotAllowed();
}
