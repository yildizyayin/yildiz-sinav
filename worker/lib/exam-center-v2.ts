import type { AuthUser, Env } from '../types';
import { all, audit, badRequest, forbidden, json, notFound, one, uuid } from './db';
import { loadPermissionScope } from './permissions';
import { handleExamCenterApi } from './exam-center';

async function allowedStudentId(env:Env,user:AuthUser,requested:string|null):Promise<string|null>{
  if(user.role==='STUDENT')return user.student_id;
  if(!requested)return null;
  if(user.role==='PARENT'){
    const row=await one<any>(env.DB.prepare(`SELECT 1 ok FROM parent_student_links WHERE parent_user_id=? AND student_id=? AND active=1`).bind(user.id,requested));
    return row?requested:null;
  }
  if(user.role==='SUPER_ADMIN')return requested;
  const enrollment=await one<any>(env.DB.prepare(`SELECT se.institution_id,se.class_id,se.season_id FROM student_enrollments se WHERE se.student_id=? AND se.status='ACTIVE' ORDER BY se.created_at DESC LIMIT 1`).bind(requested));
  if(!enrollment||!user.institution_id||enrollment.institution_id!==user.institution_id)return null;
  if(user.role==='INSTITUTION_MANAGER')return requested;
  if(user.role==='TEACHER'||user.role==='GUIDANCE_TEACHER'){
    if(!enrollment.class_id)return null;
    const scope=await loadPermissionScope(env.DB,user,enrollment.season_id);
    if(scope.guidanceClassIds.includes(enrollment.class_id)||scope.classIds.includes(enrollment.class_id))return requested;
  }
  return null;
}

async function availableResults(request:Request,env:Env,user:AuthUser){
  const url=new URL(request.url);const studentId=await allowedStudentId(env,user,url.searchParams.get('studentId'));if(!studentId)return forbidden('Bu öğrenci sonucuna erişemezsiniz.');
  const rows=await all<any>(env.DB.prepare(`SELECT e.id,e.title,e.exam_type,e.exam_date,e.publisher_name,e.series_name,e.scope_type,
    r.city,r.district,r.grade_level,r.section,r.organization_id,r.net,r.score,r.percentile,
    r.turkey_rank,r.turkey_total,r.city_rank,r.city_total,r.district_rank,r.district_total,
    r.organization_rank,r.organization_total,r.institution_rank,r.institution_total,
    r.grade_rank,r.grade_total,r.section_rank,r.section_total
    FROM exam_ranking_entries r
    JOIN exam_ranking_snapshots s ON s.id=r.snapshot_id AND s.status='PUBLISHED'
    JOIN exams e ON e.id=r.exam_id AND e.ranking_status='PUBLISHED'
    WHERE r.student_id=? ORDER BY e.exam_date DESC,e.created_at DESC LIMIT 100`).bind(studentId));
  return json({ok:true,results:rows});
}

async function detailedResult(request:Request,env:Env,user:AuthUser,examId:string){
  const url=new URL(request.url);const studentId=await allowedStudentId(env,user,url.searchParams.get('studentId'));if(!studentId)return forbidden('Bu öğrenci sonucuna erişemezsiniz.');
  const exam=await one<any>(env.DB.prepare(`SELECT * FROM exams WHERE id=?`).bind(examId));if(!exam)return notFound('Sınav bulunamadı.');if(exam.ranking_status!=='PUBLISHED'||!exam.ranking_snapshot_id)return badRequest('Bu sınavın merkezi sıralaması henüz yayınlanmadı.','RESULT_NOT_PUBLISHED');
  const cacheKey=new Request(`https://result-cache.internal/v2/${encodeURIComponent(exam.ranking_snapshot_id)}/${encodeURIComponent(studentId)}`);const cache=typeof caches!=='undefined'?caches.default:null;if(cache){const hit=await cache.match(cacheKey);if(hit)return hit;}
  const row=await one<any>(env.DB.prepare(`SELECT r.*,i.name institution_name,e.title,e.exam_type,e.exam_date,e.publisher_name,e.series_name,e.scope_type,e.result_release_at,ep.name_snapshot,ep.class_snapshot,er.correct_count,er.wrong_count,er.blank_count,er.success_percent
    FROM exam_ranking_entries r JOIN exams e ON e.id=r.exam_id JOIN institutions i ON i.id=r.institution_id JOIN exam_participants ep ON ep.id=r.participant_id JOIN exam_results er ON er.participant_id=r.participant_id
    WHERE r.snapshot_id=? AND r.student_id=? LIMIT 1`).bind(exam.ranking_snapshot_id,studentId));
  if(!row)return notFound('Bu öğrenci için yayınlanmış sonuç bulunamadı.');
  const subjects=await all<any>(env.DB.prepare(`SELECT s.name subject_name,s.code,sr.correct_count,sr.wrong_count,sr.blank_count,sr.net,sr.success_percent FROM subject_results sr JOIN subjects s ON s.id=sr.subject_id WHERE sr.participant_id=? ORDER BY s.name`).bind(row.participant_id));
  let organizationName:string|null=null;if(row.organization_id){const o=await one<any>(env.DB.prepare(`SELECT name FROM organization_networks WHERE id=?`).bind(row.organization_id));organizationName=o?.name||null;}
  const payload={ok:true,label:'Türkiye Geneli Katılımcılar Arasında',exam:{id:examId,title:row.title,type:row.exam_type,date:row.exam_date,publisher:row.publisher_name,series:row.series_name,scope:row.scope_type},student:{id:studentId,name:row.name_snapshot,className:row.class_snapshot,institutionName:row.institution_name},result:{correct:row.correct_count,wrong:row.wrong_count,blank:row.blank_count,net:row.net,score:row.score,successPercent:row.success_percent,percentile:row.percentile},rankings:{turkey:{rank:row.turkey_rank,total:row.turkey_total},city:row.city?{name:row.city,rank:row.city_rank,total:row.city_total}:null,district:row.district?{name:row.district,rank:row.district_rank,total:row.district_total}:null,organization:row.organization_id?{name:organizationName,rank:row.organization_rank,total:row.organization_total}:null,institution:{rank:row.institution_rank,total:row.institution_total},grade:row.grade_level?{gradeLevel:row.grade_level,rank:row.grade_rank,total:row.grade_total}:null,section:row.section?{section:row.section,rank:row.section_rank,total:row.section_total}:null},subjects};
  const response=Response.json(payload,{headers:{'Cache-Control':'private, max-age=60','Content-Type':'application/json; charset=utf-8'}});if(cache){const edge=response.clone();edge.headers.set('Cache-Control','public, s-maxage=3600');await cache.put(cacheKey,edge).catch(()=>{});}return response;
}

async function attachNetwork(request:Request,env:Env,user:AuthUser,examId:string){
  const body:any=await request.json().catch(()=>({}));const organizationId=String(body.organizationId||'');if(!organizationId)return badRequest('Organizasyon ağı seçin.');
  const exam=await one<any>(env.DB.prepare(`SELECT id,scope_type FROM exams WHERE id=?`).bind(examId));if(!exam)return notFound('Sınav bulunamadı.');
  if(user.role!=='SUPER_ADMIN'){
    const access=await one<any>(env.DB.prepare(`SELECT access_level FROM organization_user_access WHERE organization_id=? AND user_id=? AND active=1`).bind(organizationId,user.id));if(access?.access_level!=='MANAGE')return forbidden();
  }
  const memberCount=await one<any>(env.DB.prepare(`SELECT COUNT(*) c FROM organization_institutions WHERE organization_id=? AND active=1`).bind(organizationId));if(!Number(memberCount?.c||0))return badRequest('Bu organizasyon ağına bağlı aktif kurum yok.');
  await env.DB.batch([
    env.DB.prepare(`UPDATE exam_networks SET enabled=0 WHERE exam_id=?`).bind(examId),
    env.DB.prepare(`INSERT INTO exam_networks(id,exam_id,organization_id,enabled) VALUES(?,?,?,1) ON CONFLICT(exam_id,organization_id) DO UPDATE SET enabled=1`).bind(uuid('en'),examId,organizationId),
    env.DB.prepare(`UPDATE exams SET scope_type='NETWORK',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(examId),
  ]);
  await audit(env.DB,user.id,user.institution_id,'EXAM_NETWORK_ATTACHED','EXAM',examId,{organizationId});return json({ok:true,organizationId,institutionCount:Number(memberCount?.c||0)});
}

async function examNetwork(env:Env,user:AuthUser,examId:string){
  const row=await one<any>(env.DB.prepare(`SELECT n.id,n.name,n.code FROM exam_networks en JOIN organization_networks n ON n.id=en.organization_id WHERE en.exam_id=? AND en.enabled=1 LIMIT 1`).bind(examId));
  if(!row)return json({ok:true,network:null});
  if(user.role==='SUPER_ADMIN')return json({ok:true,network:row});
  const access=await one<any>(env.DB.prepare(`SELECT 1 ok FROM organization_user_access WHERE organization_id=? AND user_id=? AND active=1`).bind(row.id,user.id));return access?json({ok:true,network:row}):forbidden();
}

async function patchFreezeLog(request:Request,env:Env,user:AuthUser,examId:string){
  const response=await handleExamCenterApi(request,env,user);if(response?.ok){const payload:any=await response.clone().json().catch(()=>null);if(payload?.ok){await env.DB.prepare(`INSERT INTO exam_result_release_log(id,exam_id,snapshot_id,action,actor_user_id,details_json) VALUES(?,?,NULL,'FREEZE',?,?)`).bind(uuid('erl'),examId,user.id,JSON.stringify({source:'exam-center-v2'})).run().catch(()=>{});}}
  return response;
}

export async function handleExamCenterApiV2(request:Request,env:Env,user:AuthUser):Promise<Response|null>{
  const p=new URL(request.url).pathname,m=request.method;
  if(p==='/api/exam-center/results'&&m==='GET')return availableResults(request,env,user);
  let x=p.match(/^\/api\/exam-center\/results\/([^/]+)\/me$/);if(x&&m==='GET')return detailedResult(request,env,user,x[1]);
  x=p.match(/^\/api\/exam-center\/exams\/([^/]+)\/networks$/);if(x&&m==='POST')return attachNetwork(request,env,user,x[1]);
  if(x&&m==='GET')return examNetwork(env,user,x[1]);
  x=p.match(/^\/api\/exam-center\/exams\/([^/]+)\/freeze$/);if(x&&m==='POST')return patchFreezeLog(request,env,user,x[1]);
  return handleExamCenterApi(request,env,user);
}
