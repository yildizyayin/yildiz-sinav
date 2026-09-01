import app from './product-completion-entry';
import type { AuthUser, CapacityJobMessage, Env } from './types';
import { getAuthUser } from './lib/auth';
import { loadPermissionScope } from './lib/permissions';
import { all, audit, badRequest, forbidden, json, one } from './lib/db';

const DATE=/^\d{4}-\d{2}-\d{2}$/;
const STATUSES=new Set(['PRESENT','ABSENT','LATE','EXCUSED','MEDICAL']);
export function validAttendanceDate(value:string){if(!DATE.test(value))return false;const date=new Date(`${value}T00:00:00Z`);return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value}
export function validAttendanceStatus(value:string){return STATUSES.has(value)}
export function attendanceSessionId(classId:string,date:string,type='DAILY',period=0){return type==='DAILY'&&period===0?`att_${classId}_${date}`:`att_${classId}_${date}_${type}_${period}`}
function unauthenticated(){return json({ok:false,error:{code:'UNAUTHENTICATED',message:'Oturum açmanız gerekiyor.'}},401)}
async function userFor(request:Request,env:Env){return await getAuthUser(env,request)}

async function accessibleClass(env:Env,user:AuthUser,classId:string){
  const row=await one<any>(env.DB.prepare(`SELECT c.id,c.name,c.institution_id,c.season_id FROM classes c WHERE c.id=? AND c.active=1`).bind(classId));
  if(!row)return null;
  if(user.role==='SUPER_ADMIN')return row;
  if(user.institution_id!==row.institution_id)return null;
  if(user.role==='INSTITUTION_MANAGER')return row;
  if(!['TEACHER','GUIDANCE_TEACHER'].includes(user.role))return null;
  const scope=await loadPermissionScope(env.DB,user,row.season_id);
  return new Set([...scope.classIds,...scope.guidanceClassIds]).has(classId)?row:null;
}

async function attendance(request:Request,env:Env,user:AuthUser){
  const url=new URL(request.url),classId=String(url.searchParams.get('classId')||''),date=String(url.searchParams.get('date')||''),sessionType=url.searchParams.get('sessionType')==='PERIOD'?'PERIOD':'DAILY',periodNo=sessionType==='PERIOD'?Number(url.searchParams.get('periodNo')||1):0;
  if(!classId||!validAttendanceDate(date))return badRequest('Sınıf ve geçerli tarih seçilmelidir.');
  const classroom=await accessibleClass(env,user,classId);if(!classroom)return forbidden('Bu sınıfın yoklamasına erişemezsiniz.');
  const session=await one<any>(env.DB.prepare(`SELECT id,status,session_type,period_no,subject_id,updated_at FROM attendance_period_sessions WHERE class_id=? AND attendance_date=? AND session_type=? AND period_no=?`).bind(classId,date,sessionType,periodNo));
  const students=await all<any>(env.DB.prepare(`SELECT s.id,s.first_name,s.last_name,e.student_number,coalesce(r.attendance_status,'PRESENT') attendance_status,coalesce(r.minutes_late,0) minutes_late,r.note FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id LEFT JOIN attendance_period_records r ON r.student_id=s.id AND r.session_id=? WHERE e.class_id=? AND e.status='ACTIVE' AND s.status='ACTIVE' ORDER BY cast(e.student_number as integer),s.normalized_name`).bind(session?.id||'',classId));
  return json({ok:true,classroom,session,sessionType,periodNo,students});
}

async function saveAttendance(request:Request,env:Env,user:AuthUser){
  const body=await request.json<any>().catch(()=>({})),classId=String(body.classId||''),date=String(body.date||''),sessionType=body.sessionType==='PERIOD'?'PERIOD':'DAILY',periodNo=sessionType==='PERIOD'?Number(body.periodNo||1):0;
  if(!classId||!validAttendanceDate(date)||!Array.isArray(body.records))return badRequest('Sınıf, tarih ve yoklama kayıtları zorunludur.');
  const classroom=await accessibleClass(env,user,classId);if(!classroom)return forbidden('Bu sınıfın yoklamasını kaydedemezsiniz.');
  if(body.records.length>1000)return badRequest('Tek yoklamada en fazla 1000 öğrenci işlenebilir.');
  const ids=[...new Set(body.records.map((r:any)=>String(r.studentId||'')).filter(Boolean))];
  if(ids.length!==body.records.length||body.records.some((r:any)=>!validAttendanceStatus(String(r.status))))return badRequest('Öğrenci veya yoklama durumu geçersiz.');
  if(ids.length){const valid=await one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM student_enrollments WHERE class_id=? AND status='ACTIVE' AND student_id IN (${ids.map(()=>'?').join(',')})`).bind(classId,...ids));if(Number(valid?.c)!==ids.length)return badRequest('Sınıf dışında öğrenci kaydı gönderilemez.');}
  if(!Number.isInteger(periodNo)||periodNo<0||periodNo>20)return badRequest('Ders saati geçersiz.');
  let session=await one<{id:string}>(env.DB.prepare(`SELECT id FROM attendance_period_sessions WHERE class_id=? AND attendance_date=? AND session_type=? AND period_no=?`).bind(classId,date,sessionType,periodNo));
  const sessionId=session?.id||attendanceSessionId(classId,date,sessionType,periodNo);
  const statements=[env.DB.prepare(`INSERT INTO attendance_period_sessions(id,institution_id,class_id,attendance_date,session_type,period_no,subject_id,status,created_by,completed_at,updated_at) VALUES(?,?,?,?,?,?,?,'COMPLETED',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(class_id,attendance_date,session_type,period_no) DO UPDATE SET subject_id=excluded.subject_id,status='COMPLETED',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`).bind(sessionId,classroom.institution_id,classId,date,sessionType,periodNo,body.subjectId||null,user.id)];
  for(const record of body.records){statements.push(env.DB.prepare(`INSERT INTO attendance_period_records(session_id,student_id,attendance_status,minutes_late,note,recorded_by,recorded_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(session_id,student_id) DO UPDATE SET attendance_status=excluded.attendance_status,minutes_late=excluded.minutes_late,note=excluded.note,recorded_by=excluded.recorded_by,recorded_at=CURRENT_TIMESTAMP`).bind(sessionId,record.studentId,record.status,record.status==='LATE'?Math.max(0,Math.min(180,Number(record.minutesLate||0))):0,String(record.note||'').slice(0,240)||null,user.id));if(record.status==='ABSENT')statements.push(env.DB.prepare(`INSERT OR IGNORE INTO attendance_notification_outbox(id,session_id,student_id,channel,template_key) VALUES(?,?,?,'WHATSAPP','ATTENDANCE_ABSENT_SECURE')`).bind(`ano_${sessionId}_${record.studentId}`,sessionId,record.studentId));}
  await env.DB.batch(statements);await audit(env.DB,user.id,classroom.institution_id,'ATTENDANCE_SAVED','ATTENDANCE_SESSION',sessionId,{classId,date,sessionType,periodNo,recordCount:body.records.length});
  return json({ok:true,sessionId,recordCount:body.records.length});
}

export default {
 async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
  const path=new URL(request.url).pathname;
  if(path==='/api/school/attendance'){
   const user=await userFor(request,env);if(!user)return unauthenticated();
   if(request.method==='GET')return attendance(request,env,user);
   if(request.method==='POST')return saveAttendance(request,env,user);
  }
  return app.fetch(request,env,ctx);
 },
 async queue(batch:MessageBatch<CapacityJobMessage>,env:Env,ctx:ExecutionContext){if('queue' in app&&typeof app.queue==='function')return app.queue(batch,env,ctx)},
 async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){if('scheduled' in app&&typeof app.scheduled==='function')return app.scheduled(event,env,ctx)},
} satisfies ExportedHandler<Env,CapacityJobMessage>;
