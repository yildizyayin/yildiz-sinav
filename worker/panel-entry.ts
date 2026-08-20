import app from './camera-chunk-root';
import type { Env } from './types';
import { getAuthUser } from './lib/auth';
import { all, one } from './lib/db';

function fail(status:number,code:string,message:string){
  return Response.json({ok:false,error:{code,message}},{status});
}

async function rejectPassive(env:Env,user:any):Promise<Response|null>{
  if(user.role==='SUPER_ADMIN'||!user.institution_id)return null;
  const institution=await one<{status:string}>(env.DB.prepare('SELECT status FROM institutions WHERE id=?').bind(user.institution_id));
  if(institution?.status==='PASSIVE')return fail(403,'INSTITUTION_PASSIVE','Kurum hesabınız şu anda aktif değildir. Lütfen kurum yöneticinizle iletişime geçin.');
  return null;
}

async function teacherDashboard(env:Env,user:any):Promise<Response>{
  const [classCount,studentCount,examCount,classes,subjects]=await Promise.all([
    one<{c:number}>(env.DB.prepare(`
      SELECT count(DISTINCT ta.class_id) c
      FROM teacher_assignments ta
      JOIN institution_seasons se ON se.id=ta.season_id
      WHERE ta.user_id=? AND ta.active=1 AND se.status='ACTIVE'
    `).bind(user.id)),
    one<{c:number}>(env.DB.prepare(`
      SELECT count(DISTINCT e.student_id) c
      FROM teacher_assignments ta
      JOIN institution_seasons se ON se.id=ta.season_id
      JOIN student_enrollments e ON e.class_id=ta.class_id AND e.season_id=ta.season_id AND e.status='ACTIVE'
      JOIN student_entities s ON s.id=e.student_id AND s.status='ACTIVE'
      WHERE ta.user_id=? AND ta.active=1 AND se.status='ACTIVE'
    `).bind(user.id)),
    one<{c:number}>(env.DB.prepare(`
      SELECT count(DISTINCT ep.exam_id) c
      FROM teacher_assignments ta
      JOIN institution_seasons se ON se.id=ta.season_id
      JOIN student_enrollments e ON e.class_id=ta.class_id AND e.season_id=ta.season_id AND e.status='ACTIVE'
      JOIN exam_participants ep ON ep.student_id=e.student_id AND ep.institution_id=ta.institution_id
      WHERE ta.user_id=? AND ta.active=1 AND se.status='ACTIVE'
    `).bind(user.id)),
    all<any>(env.DB.prepare(`
      SELECT DISTINCT c.id,c.name,c.grade_level,c.section
      FROM teacher_assignments ta
      JOIN institution_seasons se ON se.id=ta.season_id
      JOIN classes c ON c.id=ta.class_id
      WHERE ta.user_id=? AND ta.active=1 AND se.status='ACTIVE'
      ORDER BY c.grade_level,c.section
    `).bind(user.id)),
    all<any>(env.DB.prepare(`
      SELECT DISTINCT s.id,s.code,s.name
      FROM teacher_assignments ta
      JOIN institution_seasons se ON se.id=ta.season_id
      JOIN subjects s ON s.id=ta.subject_id
      WHERE ta.user_id=? AND ta.active=1 AND ta.assignment_type='SUBJECT' AND se.status='ACTIVE'
      ORDER BY s.name
    `).bind(user.id)),
  ]);
  return Response.json({
    ok:true,
    cards:[
      {label:'Atanmış Sınıf',value:classCount?.c??0},
      {label:'Kapsamdaki Öğrenci',value:studentCount?.c??0},
      {label:'Uygulanan Sınav',value:examCount?.c??0},
    ],
    scope:{mode:user.role==='GUIDANCE_TEACHER'?'GUIDANCE':'SUBJECT',classes,subjects},
  });
}

async function parentDashboard(env:Env,user:any):Promise<Response>{
  const children=await all<any>(env.DB.prepare(`
    SELECT s.id,s.first_name || ' ' || s.last_name name,
           max(c.name) class_name,max(c.grade_level) grade_level,max(c.section) section
    FROM parent_student_links p
    JOIN student_entities s ON s.id=p.student_id AND s.status='ACTIVE'
    LEFT JOIN student_enrollments e ON e.student_id=s.id AND e.status='ACTIVE'
    LEFT JOIN institution_seasons se ON se.id=e.season_id AND se.status='ACTIVE'
    LEFT JOIN classes c ON c.id=e.class_id AND c.active=1
    WHERE p.parent_user_id=? AND p.active=1
    GROUP BY s.id,s.first_name,s.last_name
    ORDER BY s.first_name,s.last_name
  `).bind(user.id));
  return Response.json({ok:true,children});
}

export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    if(request.method!=='GET'||url.pathname!=='/api/dashboard')return app.fetch(request,env);
    const user=await getAuthUser(env,request);
    if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');
    const passive=await rejectPassive(env,user);
    if(passive)return passive;
    if(user.role==='TEACHER'||user.role==='GUIDANCE_TEACHER')return teacherDashboard(env,user);
    if(user.role==='PARENT')return parentDashboard(env,user);
    return app.fetch(request,env);
  },
} satisfies ExportedHandler<Env>;
