import panelApp from './panel-entry';
import type { AuthUser, Env } from './types';
import { getAuthUser } from './lib/auth';
import { all, audit, json, one, uuid } from './lib/db';

function apiError(status:number,code:string,message:string){return json({ok:false,error:{code,message}},status)}
async function requireUser(env:Env,request:Request):Promise<AuthUser|Response>{return (await getAuthUser(env,request))||apiError(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.')}
async function rejectPassive(env:Env,user:AuthUser){if(user.role==='SUPER_ADMIN'||!user.institution_id)return null;const i=await one<{status:string}>(env.DB.prepare('SELECT status FROM institutions WHERE id=?').bind(user.institution_id));return i?.status==='PASSIVE'?apiError(403,'INSTITUTION_PASSIVE','Kurum hesabınız şu anda aktif değildir. Lütfen kurum yöneticinizle iletişime geçin.'):null}

async function notify(env:Env,userId:string,institutionId:string|null,type:string,title:string,body:string,actionUrl:string|null,entityType?:string,entityId?:string){
  await env.DB.prepare(`INSERT INTO notifications(id,recipient_user_id,institution_id,type,title,body,action_url,entity_type,entity_id) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(uuid('ntf'),userId,institutionId,type,title,body,actionUrl,entityType||null,entityId||null).run();
}

async function listNotifications(env:Env,user:AuthUser){
  const stored=await all<any>(env.DB.prepare(`SELECT id,type,title,body,action_url,read_at,created_at,entity_type,entity_id FROM notifications WHERE recipient_user_id=? ORDER BY created_at DESC LIMIT 50`).bind(user.id));
  const generated:any[]=[];
  if(user.role==='STUDENT'&&user.student_id){
    const latest=await one<any>(env.DB.prepare(`SELECT e.title,e.exam_date,er.created_at FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id JOIN exams e ON e.id=ep.exam_id WHERE ep.student_id=? AND date(coalesce(e.exam_date,er.created_at))>=date('now','-7 days') ORDER BY coalesce(e.exam_date,er.created_at) DESC LIMIT 1`).bind(user.student_id));
    if(latest)generated.push({id:'dynamic-latest-result',type:'EXAM_RESULT',title:'Yeni sınav sonucun hazır',body:`${latest.title} sonucunu ve kazanım durumunu inceleyebilirsin.`,action_url:'/my-results',read_at:null,created_at:latest.exam_date||latest.created_at,dynamic:true});
  }
  if(user.role==='PARENT')generated.push({id:'dynamic-weekly-parent',type:'WEEKLY_SUMMARY',title:'Haftalık gelişim özeti',body:'Bağlı öğrencinizin son 7 günlük sınav ve kazanım özetini görüntüleyin.',action_url:'/weekly-summary',read_at:null,created_at:new Date().toISOString(),dynamic:true});
  if(['STUDENT','PARENT','TEACHER','GUIDANCE_TEACHER','INSTITUTION_MANAGER'].includes(user.role)){
    const published=await one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM worksheets WHERE status='PUBLISHED' AND date(created_at)>=date('now','-7 days')`));
    if((published?.c||0)>0)generated.push({id:'dynamic-worksheets',type:'WORKSHEET',title:'Yeni föyler yayınlandı',body:`Son 7 günde ${published?.c||0} yeni föy yayınlandı.`,action_url:'/worksheets',read_at:null,created_at:new Date().toISOString(),dynamic:true});
  }
  return json({ok:true,notifications:[...generated,...stored],unread:stored.filter((n:any)=>!n.read_at).length+generated.length});
}

async function markNotificationRead(env:Env,user:AuthUser,id:string){
  const row=await one(env.DB.prepare('SELECT id FROM notifications WHERE id=? AND recipient_user_id=?').bind(id,user.id));
  if(!row)return apiError(404,'NOT_FOUND','Bildirim bulunamadı.');
  await env.DB.prepare(`UPDATE notifications SET read_at=coalesce(read_at,CURRENT_TIMESTAMP) WHERE id=?`).bind(id).run();
  return json({ok:true});
}

async function listActivationRequests(env:Env,user:AuthUser){
  if(!['SUPER_ADMIN','INSTITUTION_MANAGER'].includes(user.role))return apiError(403,'FORBIDDEN','Aktivasyon taleplerine erişim yetkiniz yok.');
  const params:any[]=[];let where='1=1';
  if(user.role==='INSTITUTION_MANAGER'){where+=' AND ar.institution_id=?';params.push(user.institution_id)}
  const rows=await all<any>(env.DB.prepare(`SELECT ar.*,i.name institution_name,s.first_name||' '||s.last_name student_name,e.student_number,e.grade_level,e.section,u.display_name requested_by_name,du.display_name decided_by_name FROM activation_requests ar JOIN institutions i ON i.id=ar.institution_id JOIN student_entities s ON s.id=ar.student_id LEFT JOIN student_enrollments e ON e.student_id=s.id AND e.institution_id=ar.institution_id LEFT JOIN users u ON u.id=ar.requested_by LEFT JOIN users du ON du.id=ar.decided_by WHERE ${where} ORDER BY CASE ar.status WHEN 'PENDING' THEN 0 ELSE 1 END,ar.requested_at DESC LIMIT 500`).bind(...params));
  return json({ok:true,requests:rows});
}

async function createActivationRequest(request:Request,env:Env,user:AuthUser){
  if(user.role!=='INSTITUTION_MANAGER'||!user.institution_id)return apiError(403,'FORBIDDEN','Aktivasyon talebini kurum yöneticisi oluşturabilir.');
  const body=await request.json<{studentId?:string;note?:string}>();if(!body.studentId)return apiError(400,'STUDENT_REQUIRED','Misafir öğrenci seçilmelidir.');
  const student=await one<any>(env.DB.prepare(`SELECT s.id,s.first_name,s.last_name FROM student_entities s JOIN student_enrollments e ON e.student_id=s.id WHERE s.id=? AND s.status='GUEST' AND e.institution_id=? LIMIT 1`).bind(body.studentId,user.institution_id));
  if(!student)return apiError(404,'GUEST_NOT_FOUND','Bu kurumda uygun misafir öğrenci bulunamadı.');
  const pending=await one(env.DB.prepare(`SELECT id FROM activation_requests WHERE institution_id=? AND student_id=? AND status='PENDING'`).bind(user.institution_id,body.studentId));
  if(pending)return apiError(409,'REQUEST_EXISTS','Bu öğrenci için bekleyen bir aktivasyon talebi zaten var.');
  const id=uuid('act');
  await env.DB.prepare(`INSERT INTO activation_requests(id,institution_id,student_id,requested_by,note) VALUES(?,?,?,?,?)`).bind(id,user.institution_id,body.studentId,user.id,body.note?.trim()||null).run();
  const admins=await all<{id:string}>(env.DB.prepare(`SELECT id FROM users WHERE role='SUPER_ADMIN' AND active=1`));
  for(const admin of admins)await notify(env,admin.id,user.institution_id,'ACTIVATION_REQUEST','Misafir öğrenci aktivasyon talebi',`${student.first_name} ${student.last_name} için aktivasyon onayı bekleniyor.`,'/activation-requests','activation_request',id);
  await audit(env.DB,user.id,user.institution_id,'GUEST_ACTIVATION_REQUESTED','activation_request',id,{studentId:body.studentId});
  return json({ok:true,id},201);
}

async function decideActivationRequest(request:Request,env:Env,user:AuthUser,id:string){
  if(user.role!=='SUPER_ADMIN')return apiError(403,'FORBIDDEN','Aktivasyon kararını yalnız Süper Admin verebilir.');
  const row=await one<any>(env.DB.prepare(`SELECT ar.*,s.first_name,s.last_name FROM activation_requests ar JOIN student_entities s ON s.id=ar.student_id WHERE ar.id=?`).bind(id));
  if(!row)return apiError(404,'NOT_FOUND','Aktivasyon talebi bulunamadı.');
  if(row.status!=='PENDING')return apiError(409,'ALREADY_DECIDED','Bu talep daha önce sonuçlandırılmış.');
  const body=await request.json<{decision?:'APPROVE'|'REJECT';note?:string}>();if(!['APPROVE','REJECT'].includes(String(body.decision)))return apiError(400,'INVALID_DECISION','APPROVE veya REJECT seçilmelidir.');
  if(body.decision==='APPROVE'){
    const target=new URL(request.url);target.pathname=`/api/students/${row.student_id}/activate`;target.search='';
    const headers=new Headers();const cookie=request.headers.get('Cookie');if(cookie)headers.set('Cookie',cookie);headers.set('Content-Type','application/json');
    const activation=await panelApp.fetch(new Request(target.toString(),{method:'POST',headers,body:JSON.stringify({paymentConfirmed:true})}),env);
    if(!activation.ok)return activation;
  }
  const status=body.decision==='APPROVE'?'APPROVED':'REJECTED';
  await env.DB.prepare(`UPDATE activation_requests SET status=?,decided_by=?,decision_note=?,decided_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,user.id,body.note?.trim()||null,id).run();
  await notify(env,row.requested_by,row.institution_id,status==='APPROVED'?'ACTIVATION_APPROVED':'ACTIVATION_REJECTED',status==='APPROVED'?'Öğrenci aktivasyonu onaylandı':'Öğrenci aktivasyonu reddedildi',`${row.first_name} ${row.last_name} için aktivasyon talebi ${status==='APPROVED'?'onaylandı':'reddedildi'}.`,'/activation-requests','activation_request',id);
  await audit(env.DB,user.id,row.institution_id,status==='APPROVED'?'GUEST_ACTIVATION_APPROVED':'GUEST_ACTIVATION_REJECTED','activation_request',id,{studentId:row.student_id});
  return json({ok:true,status});
}

async function wrongAnswers(env:Env,user:AuthUser,url:URL){
  if(user.role!=='STUDENT'||!user.student_id)return apiError(403,'FORBIDDEN','Bu ekran yalnız öğrenci hesabına açıktır.');
  const examId=url.searchParams.get('examId');const params:any[]=[user.student_id];let examFilter='';if(examId){examFilter=' AND e.id=?';params.push(examId)}
  const rows=await all<any>(env.DB.prepare(`SELECT e.id exam_id,e.title exam_title,e.exam_date,s.name subject_name,q.question_no,q.global_no,sa.answer,ak.correct_answer,sa.status,o.id outcome_id,o.title outcome_title,o.topic,
    (SELECT vl.url FROM video_links vl WHERE vl.exam_question_id=q.id AND vl.link_type='SOLUTION' AND vl.approved=1 AND vl.active=1 AND vl.safety_review_status='APPROVED' LIMIT 1) solution_url,
    (SELECT vl.url FROM video_links vl WHERE (vl.exam_question_id=q.id OR (vl.outcome_id=o.id AND vl.outcome_id IS NOT NULL)) AND vl.link_type='TOPIC' AND vl.approved=1 AND vl.active=1 AND vl.safety_review_status='APPROVED' LIMIT 1) topic_url
    FROM student_answers sa JOIN exam_participants ep ON ep.id=sa.participant_id JOIN exams e ON e.id=ep.exam_id JOIN exam_delivery_profiles dp ON dp.exam_id=e.id AND dp.result_freeze_status='PUBLISHED' AND dp.snapshot_version>0 JOIN exam_questions q ON q.id=sa.exam_question_id JOIN subjects s ON s.id=q.subject_id LEFT JOIN answer_keys ak ON ak.exam_question_id=q.id AND ak.booklet_code=coalesce(ep.booklet_code,'A') LEFT JOIN question_outcomes qo ON qo.exam_question_id=q.id LEFT JOIN outcomes o ON o.id=qo.outcome_id WHERE ep.student_id=? AND sa.status IN ('WRONG','BLANK') ${examFilter} ORDER BY coalesce(e.exam_date,e.created_at) DESC,s.name,q.question_no LIMIT 500`).bind(...params));
  const exams=[...new Map(rows.map((r:any)=>[r.exam_id,{id:r.exam_id,title:r.exam_title,exam_date:r.exam_date}])).values()];
  return json({ok:true,wrongAnswers:rows,exams});
}

async function parentWeeklySummary(env:Env,user:AuthUser,url:URL){
  if(user.role!=='PARENT')return apiError(403,'FORBIDDEN','Bu özet yalnız veli hesabına açıktır.');
  const requested=url.searchParams.get('studentId');
  const children=await all<any>(env.DB.prepare(`SELECT s.id,s.first_name||' '||s.last_name name,c.name class_name FROM parent_student_links p JOIN student_entities s ON s.id=p.student_id LEFT JOIN student_enrollments e ON e.student_id=s.id AND e.status='ACTIVE' LEFT JOIN classes c ON c.id=e.class_id WHERE p.parent_user_id=? AND p.active=1 AND s.status='ACTIVE' ORDER BY s.first_name,s.last_name`).bind(user.id));
  const child=children.find((c:any)=>c.id===requested)||children[0];if(!child)return json({ok:true,children,student:null,summary:null,developing:[]});
  const recent=await one<any>(env.DB.prepare(`SELECT count(*) exam_count,avg(er.net) avg_net,max(er.net) best_net FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id JOIN exams e ON e.id=ep.exam_id WHERE ep.student_id=? AND date(coalesce(e.exam_date,er.created_at))>=date('now','-7 days')`).bind(child.id));
  const previous=await one<any>(env.DB.prepare(`SELECT avg(er.net) avg_net FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id JOIN exams e ON e.id=ep.exam_id WHERE ep.student_id=? AND date(coalesce(e.exam_date,er.created_at))>=date('now','-14 days') AND date(coalesce(e.exam_date,er.created_at))<date('now','-7 days')`).bind(child.id));
  const outcomes=await all<any>(env.DB.prepare(`SELECT o.id,o.title,o.topic,s.name subject_name,sum(r.evidence_count) evidence_count,sum(r.correct_count) correct_count FROM outcome_results r JOIN outcomes o ON o.id=r.outcome_id JOIN subjects s ON s.id=o.subject_id JOIN exams e ON e.id=r.exam_id WHERE r.student_id=? AND date(coalesce(e.exam_date,e.created_at))>=date('now','-7 days') GROUP BY o.id,o.title,o.topic,s.name HAVING sum(r.evidence_count)>=3`).bind(child.id));
  const developing=outcomes.map((r:any)=>({...r,success_rate:Number(r.evidence_count)?Number(r.correct_count)/Number(r.evidence_count):0})).filter((r:any)=>r.success_rate<0.6).sort((a:any,b:any)=>a.success_rate-b.success_rate).slice(0,5);
  const avg=recent?.avg_net==null?null:Number(recent.avg_net);const prev=previous?.avg_net==null?null:Number(previous.avg_net);
  return json({ok:true,children,student:child,summary:{exam_count:Number(recent?.exam_count||0),average_net:avg,best_net:recent?.best_net==null?null:Number(recent.best_net),previous_average_net:prev,delta_net:avg!=null&&prev!=null?Number((avg-prev).toFixed(2)):null},developing});
}

export default {async fetch(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/'))return panelApp.fetch(request,env);
  const custom=url.pathname==='/api/notifications'||url.pathname.startsWith('/api/notifications/')||url.pathname==='/api/activation-requests'||url.pathname.startsWith('/api/activation-requests/')||url.pathname==='/api/my-wrong-answers'||url.pathname==='/api/parent/weekly-summary';
  if(!custom)return panelApp.fetch(request,env);
  try{
    const auth=await requireUser(env,request);if(auth instanceof Response)return auth;const passive=await rejectPassive(env,auth);if(passive)return passive;
    if(url.pathname==='/api/notifications'&&request.method==='GET')return listNotifications(env,auth);
    const read=url.pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);if(read&&request.method==='POST')return markNotificationRead(env,auth,read[1]);
    if(url.pathname==='/api/activation-requests'&&request.method==='GET')return listActivationRequests(env,auth);
    if(url.pathname==='/api/activation-requests'&&request.method==='POST')return createActivationRequest(request,env,auth);
    const decision=url.pathname.match(/^\/api\/activation-requests\/([^/]+)\/decision$/);if(decision&&request.method==='POST')return decideActivationRequest(request,env,auth,decision[1]);
    if(url.pathname==='/api/my-wrong-answers'&&request.method==='GET')return wrongAnswers(env,auth,url);
    if(url.pathname==='/api/parent/weekly-summary'&&request.method==='GET')return parentWeeklySummary(env,auth,url);
    return apiError(404,'NOT_FOUND','API yolu bulunamadı.');
  }catch(error){console.error('Final feature API error',error);return apiError(500,'SERVER_ERROR','İşlem sırasında sunucu hatası oluştu.');}
}} satisfies ExportedHandler<Env>;
