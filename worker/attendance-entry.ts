import app from './scale-entry';
import type {AuthUser,Env} from './types';
import {getAuthUser} from './lib/auth';
import {all,audit,badRequest,forbidden,json,one,uuid} from './lib/db';
import {canAccessClass,loadPermissionScope} from './lib/permissions';

const STATUSES=new Set(['PRESENT','ABSENT','LATE','EXCUSED']);
function fail(status:number,code:string,message:string){return json({ok:false,error:{code,message}},status)}

async function classAccess(env:Env,user:AuthUser,classId:string){
 const row=await one<any>(env.DB.prepare(`SELECT c.id,c.name,c.institution_id,c.season_id FROM classes c WHERE c.id=? AND c.active=1`).bind(classId));
 if(!row)return null;
 if(user.role==='SUPER_ADMIN')return row;
 if(!user.institution_id||row.institution_id!==user.institution_id)return null;
 if(user.role==='INSTITUTION_MANAGER')return row;
 if(!['TEACHER','GUIDANCE_TEACHER'].includes(user.role))return null;
 const scope=await loadPermissionScope(env.DB,user,row.season_id);return canAccessClass(scope,classId)?row:null;
}

async function attendanceDetail(env:Env,user:AuthUser,url:URL){
 const classId=String(url.searchParams.get('classId')||''),date=String(url.searchParams.get('date')||''),period=String(url.searchParams.get('period')||'Günlük').slice(0,40);
 if(!classId||!/^\d{4}-\d{2}-\d{2}$/.test(date))return badRequest('Sınıf ve geçerli yoklama tarihi gereklidir.');
 const klass=await classAccess(env,user,classId);if(!klass)return forbidden('Bu sınıf için yoklama yetkiniz yok.');
 const session=await one<any>(env.DB.prepare(`SELECT s.*,u.display_name taken_by_name FROM attendance_sessions s JOIN users u ON u.id=s.taken_by WHERE s.class_id=? AND s.attendance_date=? AND s.period_label=?`).bind(classId,date,period));
 const students=await all<any>(env.DB.prepare(`SELECT st.id,st.first_name,st.last_name,e.student_number,COALESCE(r.attendance_status,'PRESENT') attendance_status,COALESCE(r.note,'') note FROM student_enrollments e JOIN student_entities st ON st.id=e.student_id LEFT JOIN attendance_records r ON r.student_id=st.id AND r.session_id=? WHERE e.class_id=? AND e.status='ACTIVE' AND st.status='ACTIVE' ORDER BY st.first_name,st.last_name`).bind(session?.id||'',classId));
 const summary=students.reduce((acc:any,row:any)=>{acc[row.attendance_status]=(acc[row.attendance_status]||0)+1;return acc},{PRESENT:0,ABSENT:0,LATE:0,EXCUSED:0});
 return json({ok:true,class:klass,session,students,summary});
}

async function saveAttendance(request:Request,env:Env,user:AuthUser){
 const body=await request.json<any>().catch(()=>null);if(!body)return badRequest('Yoklama bilgileri geçersiz.');
 const classId=String(body.classId||''),date=String(body.date||''),period=String(body.period||'Günlük').trim().slice(0,40)||'Günlük';
 if(!classId||!/^\d{4}-\d{2}-\d{2}$/.test(date))return badRequest('Sınıf ve geçerli yoklama tarihi gereklidir.');
 const klass=await classAccess(env,user,classId);if(!klass)return forbidden('Bu sınıf için yoklama yetkiniz yok.');
 const records=Array.isArray(body.records)?body.records.slice(0,300):[];if(!records.length)return badRequest('En az bir öğrenci yoklama kaydı gereklidir.');
 if(records.some((r:any)=>!STATUSES.has(String(r.status))))return badRequest('Geçersiz yoklama durumu.');
 const enrolled=await all<{student_id:string}>(env.DB.prepare(`SELECT student_id FROM student_enrollments WHERE class_id=? AND status='ACTIVE'`).bind(classId)),allowed=new Set(enrolled.map(x=>x.student_id));
 if(records.some((r:any)=>!allowed.has(String(r.studentId))))return forbidden('Sınıfa kayıtlı olmayan öğrenci yoklamaya eklenemez.');
 let session=await one<{id:string}>(env.DB.prepare(`SELECT id FROM attendance_sessions WHERE class_id=? AND attendance_date=? AND period_label=?`).bind(classId,date,period));const sessionId=session?.id||uuid('att');
 const finalized=Boolean(body.finalized),statements:D1PreparedStatement[]=[env.DB.prepare(`INSERT INTO attendance_sessions(id,institution_id,class_id,attendance_date,period_label,status,note,taken_by,finalized_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(class_id,attendance_date,period_label) DO UPDATE SET status=excluded.status,note=excluded.note,taken_by=excluded.taken_by,finalized_at=excluded.finalized_at,updated_at=CURRENT_TIMESTAMP`).bind(sessionId,klass.institution_id,classId,date,period,finalized?'FINALIZED':'OPEN',String(body.note||'').trim().slice(0,500)||null,user.id,finalized?new Date().toISOString():null)];
 for(const record of records)statements.push(env.DB.prepare(`INSERT INTO attendance_records(session_id,student_id,attendance_status,note,updated_by) VALUES(?,?,?,?,?) ON CONFLICT(session_id,student_id) DO UPDATE SET attendance_status=excluded.attendance_status,note=excluded.note,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(sessionId,String(record.studentId),String(record.status),String(record.note||'').trim().slice(0,250)||null,user.id));
 await env.DB.batch(statements);await audit(env.DB,user.id,klass.institution_id,finalized?'ATTENDANCE_FINALIZED':'ATTENDANCE_SAVED','attendance_session',sessionId,{classId,date,period,recordCount:records.length});
 return attendanceDetail(env,user,new URL(`/api/attendance?classId=${encodeURIComponent(classId)}&date=${date}&period=${encodeURIComponent(period)}`,'https://anunex.local'));
}

export default {async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
 const url=new URL(request.url);if(url.pathname!=='/api/attendance')return app.fetch(request,env,ctx);
 const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');
 if(request.method==='GET')return attendanceDetail(env,user,url);
 if(request.method==='PUT')return saveAttendance(request,env,user);
 return fail(405,'METHOD_NOT_ALLOWED','Bu işlem desteklenmiyor.');
}} satisfies ExportedHandler<Env>;
