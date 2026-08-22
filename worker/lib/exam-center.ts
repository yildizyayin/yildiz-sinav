import type { AuthUser, Env } from '../types';
import { all, audit, badRequest, forbidden, json, notFound, one, uuid } from './db';

type ExamScope = 'INSTITUTION' | 'NETWORK' | 'CENTRAL';

function escLike(value:string){return `%${value.replace(/[%_]/g, m=>`\\${m}`)}%`;}
function isSuper(user:AuthUser){return user.role==='SUPER_ADMIN';}
function isManager(user:AuthUser){return user.role==='INSTITUTION_MANAGER';}

async function examRow(env:Env,id:string){
  return one<any>(env.DB.prepare(`SELECT e.*, ot.name AS optical_name, otv.version AS optical_version,
    (SELECT COUNT(*) FROM exam_participants p WHERE p.exam_id=e.id) AS participant_count,
    (SELECT COUNT(DISTINCT p.institution_id) FROM exam_participants p WHERE p.exam_id=e.id) AS institution_count
    FROM exams e
    LEFT JOIN optical_template_versions otv ON otv.id=e.default_optical_template_version_id
    LEFT JOIN optical_templates ot ON ot.id=otv.template_id
    WHERE e.id=?`).bind(id));
}

async function networkAccess(env:Env,user:AuthUser,organizationId:string,manage=false){
  if(isSuper(user))return true;
  const row=await one<any>(env.DB.prepare(`SELECT access_level FROM organization_user_access WHERE organization_id=? AND user_id=? AND active=1`).bind(organizationId,user.id));
  return !!row && (!manage || row.access_level==='MANAGE');
}

async function canManageExam(env:Env,user:AuthUser,exam:any){
  if(isSuper(user))return true;
  if(exam.scope_type==='INSTITUTION')return isManager(user)&&!!user.institution_id&&exam.institution_id===user.institution_id;
  if(exam.scope_type==='NETWORK'){
    const links=await all<any>(env.DB.prepare(`SELECT organization_id FROM exam_networks WHERE exam_id=? AND enabled=1`).bind(exam.id));
    for(const x of links)if(await networkAccess(env,user,x.organization_id,true))return true;
  }
  return false;
}

async function catalog(request:Request,env:Env,user:AuthUser){
  const url=new URL(request.url), q=(url.searchParams.get('q')||'').trim(), scope=url.searchParams.get('scope')||'', examType=url.searchParams.get('examType')||'';
  const args:any[]=[]; let where=`WHERE e.status IN ('ACTIVE','CLOSED')`;
  if(isSuper(user))where=`WHERE e.status IN ('DRAFT','ACTIVE','CLOSED')`;
  if(q){where+=` AND (e.title LIKE ? ESCAPE '\\' OR COALESCE(e.publisher_name,'') LIKE ? ESCAPE '\\' OR COALESCE(e.exam_code,'') LIKE ? ESCAPE '\\' OR COALESCE(e.series_name,'') LIKE ? ESCAPE '\\')`; const p=escLike(q);args.push(p,p,p,p);}
  if(scope){where+=' AND e.scope_type=?';args.push(scope);}
  if(examType){where+=' AND e.exam_type=?';args.push(examType);}
  if(!isSuper(user)&&user.institution_id){
    where+=` AND (e.scope_type='CENTRAL' OR e.institution_id=? OR EXISTS(SELECT 1 FROM exam_institutions ei WHERE ei.exam_id=e.id AND ei.institution_id=? AND ei.enabled=1) OR EXISTS(SELECT 1 FROM exam_networks en JOIN organization_institutions oi ON oi.organization_id=en.organization_id AND oi.active=1 WHERE en.exam_id=e.id AND en.enabled=1 AND oi.institution_id=?))`;
    args.push(user.institution_id,user.institution_id,user.institution_id);
  }
  const rows=await all<any>(env.DB.prepare(`SELECT e.id,e.title,e.exam_type,e.grade_level,e.exam_date,e.academic_year,e.status,e.scope_type,e.publisher_name,e.series_name,e.exam_code,e.verified_catalog,e.ranking_status,e.data_closes_at,e.result_release_at,
    ot.name AS optical_name,otv.id AS optical_template_version_id,otv.version AS optical_version,
    (SELECT GROUP_CONCAT(code, ',') FROM exam_booklets b WHERE b.exam_id=e.id AND b.active=1) AS booklet_codes,
    (SELECT COUNT(*) FROM exam_participants p WHERE p.exam_id=e.id) AS participant_count,
    (SELECT COUNT(DISTINCT institution_id) FROM exam_participants p WHERE p.exam_id=e.id) AS institution_count,
    (SELECT COUNT(*) FROM answer_keys ak JOIN exam_questions eq ON eq.id=ak.exam_question_id WHERE eq.exam_id=e.id) AS answer_key_count
    FROM exams e LEFT JOIN optical_template_versions otv ON otv.id=e.default_optical_template_version_id LEFT JOIN optical_templates ot ON ot.id=otv.template_id
    ${where} ORDER BY e.exam_date DESC,e.created_at DESC LIMIT 300`).bind(...args));
  return json({ok:true,exams:rows});
}

async function centerSummary(env:Env,user:AuthUser){
  const inst=user.institution_id;
  const scopeClause=isSuper(user)?'1=1':`(e.scope_type='CENTRAL' OR e.institution_id=? OR EXISTS(SELECT 1 FROM exam_institutions ei WHERE ei.exam_id=e.id AND ei.institution_id=? AND ei.enabled=1))`;
  const bind=isSuper(user)?[]:[inst,inst];
  const summary=await one<any>(env.DB.prepare(`SELECT
    COUNT(*) AS exam_count,
    SUM(CASE WHEN e.scope_type='CENTRAL' THEN 1 ELSE 0 END) AS central_count,
    SUM(CASE WHEN e.scope_type='NETWORK' THEN 1 ELSE 0 END) AS network_count,
    SUM(CASE WHEN e.scope_type='INSTITUTION' THEN 1 ELSE 0 END) AS institution_count,
    SUM(CASE WHEN e.ranking_status='PUBLISHED' THEN 1 ELSE 0 END) AS published_count
    FROM exams e WHERE ${scopeClause}`).bind(...bind));
  const live=await all<any>(env.DB.prepare(`SELECT e.id,e.title,e.exam_type,e.scope_type,e.ranking_status,e.exam_date,e.publisher_name,
    COUNT(p.id) participant_count,COUNT(DISTINCT p.institution_id) institution_count
    FROM exams e LEFT JOIN exam_participants p ON p.exam_id=e.id
    WHERE e.scope_type IN ('CENTRAL','NETWORK') AND e.status IN ('ACTIVE','CLOSED')
    GROUP BY e.id ORDER BY e.exam_date DESC,e.created_at DESC LIMIT 12`));
  return json({ok:true,summary:summary||{},live});
}

async function patchCatalog(request:Request,env:Env,user:AuthUser,examId:string){
  if(!isSuper(user))return forbidden();
  const exam=await examRow(env,examId); if(!exam)return notFound('Sınav bulunamadı.');
  const b:any=await request.json().catch(()=>({}));
  const scope:ExamScope=['INSTITUTION','NETWORK','CENTRAL'].includes(b.scopeType)?b.scopeType:exam.scope_type;
  const verified=b.verifiedCatalog===undefined?Number(exam.verified_catalog):b.verifiedCatalog?1:0;
  if(scope==='CENTRAL'&&!verified)return badRequest('Merkezi/Türkiye geneli sınavlar yalnız doğrulanmış katalog sınavı olabilir.','CENTRAL_REQUIRES_VERIFICATION');
  await env.DB.prepare(`UPDATE exams SET scope_type=?,publisher_name=?,series_name=?,exam_code=?,verified_catalog=?,default_optical_template_version_id=?,data_closes_at=?,result_release_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
   .bind(scope,b.publisherName??exam.publisher_name,b.seriesName??exam.series_name,b.examCode??exam.exam_code,verified,b.defaultOpticalTemplateVersionId??exam.default_optical_template_version_id,b.dataClosesAt??exam.data_closes_at,b.resultReleaseAt??exam.result_release_at,examId).run();
  await audit(env.DB,user.id,null,'EXAM_CATALOG_UPDATED','EXAM',examId,{scope,verified,publisherName:b.publisherName,examCode:b.examCode});
  return json({ok:true,exam:await examRow(env,examId)});
}

async function listNetworks(env:Env,user:AuthUser){
  let rows:any[];
  if(isSuper(user))rows=await all<any>(env.DB.prepare(`SELECT n.*,(SELECT COUNT(*) FROM organization_institutions oi WHERE oi.organization_id=n.id AND oi.active=1) institution_count FROM organization_networks n WHERE n.active=1 ORDER BY n.name`));
  else rows=await all<any>(env.DB.prepare(`SELECT n.*,ou.access_level,(SELECT COUNT(*) FROM organization_institutions oi WHERE oi.organization_id=n.id AND oi.active=1) institution_count FROM organization_networks n JOIN organization_user_access ou ON ou.organization_id=n.id AND ou.user_id=? AND ou.active=1 WHERE n.active=1 ORDER BY n.name`).bind(user.id));
  return json({ok:true,networks:rows});
}

async function createNetwork(request:Request,env:Env,user:AuthUser){
  if(!isSuper(user))return forbidden(); const b:any=await request.json().catch(()=>({}));
  if(!String(b.name||'').trim()||!String(b.code||'').trim())return badRequest('Ağ adı ve kodu gereklidir.');
  const id=uuid('org'); await env.DB.prepare(`INSERT INTO organization_networks(id,name,code) VALUES(?,?,?)`).bind(id,String(b.name).trim(),String(b.code).trim().toUpperCase()).run();
  await audit(env.DB,user.id,null,'NETWORK_CREATED','ORGANIZATION',id,{name:b.name,code:b.code}); return json({ok:true,id},201);
}

async function networkInstitutions(request:Request,env:Env,user:AuthUser,orgId:string){
  if(!(await networkAccess(env,user,orgId,true)))return forbidden(); const b:any=await request.json().catch(()=>({}));
  const ids:Array<any>=Array.isArray(b.institutions)?b.institutions:[]; if(!ids.length)return badRequest('En az bir kurum seçin.');
  for(const x of ids){const institutionId=typeof x==='string'?x:x.institutionId;if(!institutionId)continue;await env.DB.prepare(`INSERT INTO organization_institutions(id,organization_id,institution_id,region_name,is_headquarters,active) VALUES(?,?,?,?,?,1) ON CONFLICT(organization_id,institution_id) DO UPDATE SET region_name=excluded.region_name,is_headquarters=excluded.is_headquarters,active=1`).bind(uuid('oi'),orgId,institutionId,typeof x==='string'?null:x.regionName||null,typeof x==='string'?0:x.isHeadquarters?1:0).run();}
  await audit(env.DB,user.id,user.institution_id,'NETWORK_INSTITUTIONS_UPDATED','ORGANIZATION',orgId,{count:ids.length}); return json({ok:true,count:ids.length});
}

async function networkUser(request:Request,env:Env,user:AuthUser,orgId:string){
  if(!isSuper(user))return forbidden(); const b:any=await request.json().catch(()=>({})); if(!b.userId)return badRequest('Kullanıcı seçin.');
  const level=b.accessLevel==='MANAGE'?'MANAGE':'VIEW'; await env.DB.prepare(`INSERT INTO organization_user_access(id,organization_id,user_id,access_level,active) VALUES(?,?,?,?,1) ON CONFLICT(organization_id,user_id) DO UPDATE SET access_level=excluded.access_level,active=1`).bind(uuid('oua'),orgId,b.userId,level).run();
  return json({ok:true});
}

async function freezeExam(env:Env,user:AuthUser,examId:string){
  const exam=await examRow(env,examId);if(!exam)return notFound('Sınav bulunamadı.');if(!(await canManageExam(env,user,exam)))return forbidden();
  await env.DB.prepare(`UPDATE exams SET status='CLOSED',ranking_status='FROZEN',data_closes_at=COALESCE(data_closes_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(examId).run();
  const snapshot=await latestSnapshot(env,examId); await env.DB.prepare(`INSERT INTO exam_result_release_log(id,exam_id,snapshot_id,action,actor_user_id,details_json) VALUES(?,?,?,?,?,?)`).bind(uuid('erl'),examId,snapshot?.id||'pending','FREEZE',user.id,JSON.stringify({participantCount:exam.participant_count})).run().catch(()=>{});
  await audit(env.DB,user.id,user.institution_id,'EXAM_RANKING_FROZEN','EXAM',examId,{participants:exam.participant_count});
  return json({ok:true,exam:await examRow(env,examId)});
}

async function latestSnapshot(env:Env,examId:string){return one<any>(env.DB.prepare(`SELECT * FROM exam_ranking_snapshots WHERE exam_id=? ORDER BY version DESC LIMIT 1`).bind(examId));}

async function buildRanking(env:Env,user:AuthUser,examId:string){
  const exam=await examRow(env,examId);if(!exam)return notFound('Sınav bulunamadı.');if(!(await canManageExam(env,user,exam)))return forbidden();
  if(exam.ranking_status==='OPEN')return badRequest('Önce veri alımını dondurun.','RANKING_NOT_FROZEN');
  const latest=await latestSnapshot(env,examId);const version=Number(latest?.version||0)+1;const snapshotId=uuid('snap');
  await env.DB.prepare(`UPDATE exams SET ranking_status='CALCULATING',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(examId).run();
  await env.DB.prepare(`INSERT INTO exam_ranking_snapshots(id,exam_id,version,status,created_by) VALUES(?,?,?,'CALCULATING',?)`).bind(snapshotId,examId,version,user.id).run();
  try{
    await env.DB.prepare(`INSERT INTO exam_ranking_entries(
      id,snapshot_id,exam_id,participant_id,institution_id,student_id,city,district,organization_id,grade_level,section,score,net,participant_status,
      turkey_rank,turkey_total,city_rank,city_total,district_rank,district_total,organization_rank,organization_total,institution_rank,institution_total,grade_rank,grade_total,section_rank,section_total,percentile,payload_json)
    SELECT
      'rank_'||lower(hex(randomblob(16))), ?, s.exam_id,s.participant_id,s.institution_id,s.student_id,s.city,s.district,s.organization_id,s.grade_level,s.section,s.score,s.net,s.participant_status,
      RANK() OVER(ORDER BY COALESCE(s.score,s.net) DESC,s.net DESC,s.participant_id),
      COUNT(*) OVER(),
      CASE WHEN s.city IS NOT NULL THEN RANK() OVER(PARTITION BY s.city ORDER BY COALESCE(s.score,s.net) DESC,s.net DESC,s.participant_id) END,
      CASE WHEN s.city IS NOT NULL THEN COUNT(*) OVER(PARTITION BY s.city) END,
      CASE WHEN s.city IS NOT NULL AND s.district IS NOT NULL THEN RANK() OVER(PARTITION BY s.city,s.district ORDER BY COALESCE(s.score,s.net) DESC,s.net DESC,s.participant_id) END,
      CASE WHEN s.city IS NOT NULL AND s.district IS NOT NULL THEN COUNT(*) OVER(PARTITION BY s.city,s.district) END,
      CASE WHEN s.organization_id IS NOT NULL THEN RANK() OVER(PARTITION BY s.organization_id ORDER BY COALESCE(s.score,s.net) DESC,s.net DESC,s.participant_id) END,
      CASE WHEN s.organization_id IS NOT NULL THEN COUNT(*) OVER(PARTITION BY s.organization_id) END,
      RANK() OVER(PARTITION BY s.institution_id ORDER BY COALESCE(s.score,s.net) DESC,s.net DESC,s.participant_id),
      COUNT(*) OVER(PARTITION BY s.institution_id),
      CASE WHEN s.grade_level IS NOT NULL THEN RANK() OVER(PARTITION BY s.institution_id,s.grade_level ORDER BY COALESCE(s.score,s.net) DESC,s.net DESC,s.participant_id) END,
      CASE WHEN s.grade_level IS NOT NULL THEN COUNT(*) OVER(PARTITION BY s.institution_id,s.grade_level) END,
      CASE WHEN s.grade_level IS NOT NULL AND s.section IS NOT NULL THEN RANK() OVER(PARTITION BY s.institution_id,s.grade_level,s.section ORDER BY COALESCE(s.score,s.net) DESC,s.net DESC,s.participant_id) END,
      CASE WHEN s.grade_level IS NOT NULL AND s.section IS NOT NULL THEN COUNT(*) OVER(PARTITION BY s.institution_id,s.grade_level,s.section) END,
      CASE WHEN COUNT(*) OVER()>1 THEN ROUND((RANK() OVER(ORDER BY COALESCE(s.score,s.net) DESC,s.net DESC,s.participant_id)-1)*100.0/(COUNT(*) OVER()-1),3) ELSE 0 END,
      NULL
    FROM v_exam_ranking_source s WHERE s.exam_id=?`).bind(snapshotId,examId).run();
    const stats=await one<any>(env.DB.prepare(`SELECT COUNT(*) participant_count,COUNT(DISTINCT institution_id) institution_count FROM exam_ranking_entries WHERE snapshot_id=?`).bind(snapshotId));
    await env.DB.prepare(`UPDATE exam_ranking_snapshots SET status='READY',participant_count=?,institution_count=?,generated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(Number(stats?.participant_count||0),Number(stats?.institution_count||0),snapshotId).run();
    await env.DB.prepare(`UPDATE exams SET ranking_status='READY',ranking_snapshot_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(snapshotId,examId).run();
    await audit(env.DB,user.id,user.institution_id,'EXAM_RANKING_BUILT','EXAM',examId,{snapshotId,version,...stats});
    return json({ok:true,snapshot:await one<any>(env.DB.prepare(`SELECT * FROM exam_ranking_snapshots WHERE id=?`).bind(snapshotId))});
  }catch(e:any){await env.DB.prepare(`UPDATE exam_ranking_snapshots SET status='FAILED' WHERE id=?`).bind(snapshotId).run();await env.DB.prepare(`UPDATE exams SET ranking_status='FROZEN' WHERE id=?`).bind(examId).run();return json({ok:false,error:{code:'RANKING_BUILD_FAILED',message:'Sıralama snapshotı oluşturulamadı.',details:String(e?.message||e)}},500);}
}

async function publishRanking(env:Env,user:AuthUser,examId:string){
  const exam=await examRow(env,examId);if(!exam)return notFound('Sınav bulunamadı.');if(!(await canManageExam(env,user,exam)))return forbidden();
  const snapshot=await one<any>(env.DB.prepare(`SELECT * FROM exam_ranking_snapshots WHERE exam_id=? AND status='READY' ORDER BY version DESC LIMIT 1`).bind(examId));if(!snapshot)return badRequest('Yayınlanmaya hazır sıralama snapshotı yok.','NO_READY_SNAPSHOT');
  await env.DB.batch([
    env.DB.prepare(`UPDATE exam_ranking_snapshots SET status='SUPERSEDED' WHERE exam_id=? AND status='PUBLISHED'`).bind(examId),
    env.DB.prepare(`UPDATE exam_ranking_snapshots SET status='PUBLISHED',published_at=CURRENT_TIMESTAMP WHERE id=?`).bind(snapshot.id),
    env.DB.prepare(`UPDATE exams SET ranking_status='PUBLISHED',ranking_snapshot_id=?,result_release_at=COALESCE(result_release_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(snapshot.id,examId),
  ]);
  await env.DB.prepare(`INSERT INTO exam_result_release_log(id,exam_id,snapshot_id,action,actor_user_id,details_json) VALUES(?,?,?,?,?,?)`).bind(uuid('erl'),examId,snapshot.id,'PUBLISH',user.id,JSON.stringify({version:snapshot.version,participantCount:snapshot.participant_count})).run();
  await audit(env.DB,user.id,user.institution_id,'EXAM_RESULTS_PUBLISHED','EXAM',examId,{snapshotId:snapshot.id});
  return json({ok:true,snapshot:{...snapshot,status:'PUBLISHED'}});
}

async function rankingSummary(env:Env,user:AuthUser,examId:string){
  const exam=await examRow(env,examId);if(!exam)return notFound();
  if(!isSuper(user)&&exam.scope_type==='INSTITUTION'&&exam.institution_id!==user.institution_id)return forbidden();
  const snapshot=await one<any>(env.DB.prepare(`SELECT * FROM exam_ranking_snapshots WHERE exam_id=? AND status IN ('READY','PUBLISHED') ORDER BY version DESC LIMIT 1`).bind(examId));
  const cities=snapshot?await all<any>(env.DB.prepare(`SELECT city,COUNT(*) participant_count,COUNT(DISTINCT institution_id) institution_count,ROUND(AVG(net),2) avg_net FROM exam_ranking_entries WHERE snapshot_id=? AND city IS NOT NULL GROUP BY city ORDER BY participant_count DESC LIMIT 81`).bind(snapshot.id)):[];
  const institutions=snapshot?await all<any>(env.DB.prepare(`SELECT i.id,i.name,i.city,i.district,COUNT(r.id) participant_count,ROUND(AVG(r.net),2) avg_net,MIN(r.turkey_rank) best_rank FROM exam_ranking_entries r JOIN institutions i ON i.id=r.institution_id WHERE r.snapshot_id=? GROUP BY i.id ORDER BY participant_count DESC LIMIT 500`).bind(snapshot.id)):[];
  return json({ok:true,exam,snapshot,cities,institutions});
}

async function ensureStudentAccess(env:Env,user:AuthUser,requestedStudentId?:string|null){
  if(user.role==='STUDENT')return user.student_id;
  if(user.role==='PARENT'&&requestedStudentId){const link=await one<any>(env.DB.prepare(`SELECT 1 ok FROM parent_student_links WHERE parent_user_id=? AND student_id=? AND active=1`).bind(user.id,requestedStudentId));return link?requestedStudentId:null;}
  if(['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role)&&requestedStudentId)return requestedStudentId;
  return null;
}

async function studentResult(request:Request,env:Env,user:AuthUser,examId:string){
  const url=new URL(request.url);const studentId=await ensureStudentAccess(env,user,url.searchParams.get('studentId'));if(!studentId)return forbidden('Bu öğrenci sonucuna erişemezsiniz.');
  const exam=await examRow(env,examId);if(!exam)return notFound('Sınav bulunamadı.');if(exam.ranking_status!=='PUBLISHED')return badRequest('Bu sınavın merkezi sıralaması henüz yayınlanmadı.','RESULT_NOT_PUBLISHED');
  const snapshotId=exam.ranking_snapshot_id; if(!snapshotId)return notFound('Yayınlanmış sonuç snapshotı bulunamadı.');
  const cacheKey=new Request(`https://result-cache.internal/v1/${encodeURIComponent(snapshotId)}/${encodeURIComponent(studentId)}`);
  const cache=typeof caches!=='undefined'?caches.default:null; if(cache){const hit=await cache.match(cacheKey);if(hit)return hit;}
  const row=await one<any>(env.DB.prepare(`SELECT r.*,i.name institution_name,e.title,e.exam_type,e.exam_date,e.publisher_name,e.series_name,e.scope_type,e.result_release_at,ep.name_snapshot,ep.class_snapshot,
    er.correct_count,er.wrong_count,er.blank_count,er.success_percent
    FROM exam_ranking_entries r JOIN exams e ON e.id=r.exam_id JOIN institutions i ON i.id=r.institution_id JOIN exam_participants ep ON ep.id=r.participant_id JOIN exam_results er ON er.participant_id=r.participant_id
    WHERE r.snapshot_id=? AND r.student_id=? LIMIT 1`).bind(snapshotId,studentId));
  if(!row)return notFound('Bu öğrenci için yayınlanmış sonuç bulunamadı.');
  const subjects=await all<any>(env.DB.prepare(`SELECT s.name subject_name,s.code,sr.correct_count,sr.wrong_count,sr.blank_count,sr.net,sr.success_percent FROM subject_results sr JOIN subjects s ON s.id=sr.subject_id WHERE sr.participant_id=? ORDER BY s.name`).bind(row.participant_id));
  const payload={ok:true,label:'Türkiye Geneli Katılımcılar Arasında',exam:{id:examId,title:row.title,type:row.exam_type,date:row.exam_date,publisher:row.publisher_name,series:row.series_name,scope:row.scope_type},student:{id:studentId,name:row.name_snapshot,className:row.class_snapshot,institutionName:row.institution_name},result:{correct:row.correct_count,wrong:row.wrong_count,blank:row.blank_count,net:row.net,score:row.score,successPercent:row.success_percent,percentile:row.percentile},rankings:{turkey:{rank:row.turkey_rank,total:row.turkey_total},city:row.city?{name:row.city,rank:row.city_rank,total:row.city_total}:null,district:row.district?{name:row.district,rank:row.district_rank,total:row.district_total}:null,organization:row.organization_id?{rank:row.organization_rank,total:row.organization_total}:null,institution:{rank:row.institution_rank,total:row.institution_total},grade:row.grade_level?{gradeLevel:row.grade_level,rank:row.grade_rank,total:row.grade_total}:null,section:row.section?{section:row.section,rank:row.section_rank,total:row.section_total}:null},subjects};
  const response=Response.json(payload,{headers:{'Cache-Control':'private, max-age=60','Content-Type':'application/json; charset=utf-8'}});if(cache){const edge=response.clone();edge.headers.set('Cache-Control','public, s-maxage=3600');await cache.put(cacheKey,edge).catch(()=>{});}return response;
}

async function availableStudentResults(env:Env,user:AuthUser,request:Request){
  const url=new URL(request.url);const studentId=await ensureStudentAccess(env,user,url.searchParams.get('studentId'));if(!studentId)return forbidden();
  const rows=await all<any>(env.DB.prepare(`SELECT e.id,e.title,e.exam_type,e.exam_date,e.publisher_name,e.scope_type,r.net,r.score,r.turkey_rank,r.turkey_total,r.institution_rank,r.institution_total FROM exam_ranking_entries r JOIN exam_ranking_snapshots s ON s.id=r.snapshot_id AND s.status='PUBLISHED' JOIN exams e ON e.id=r.exam_id WHERE r.student_id=? ORDER BY e.exam_date DESC,e.created_at DESC LIMIT 100`).bind(studentId));
  return json({ok:true,results:rows});
}

export async function handleExamCenterApi(request:Request,env:Env,user:AuthUser):Promise<Response|null>{
  const url=new URL(request.url),p=url.pathname,m=request.method;
  if(p==='/api/exam-center/catalog'&&m==='GET')return catalog(request,env,user);
  if(p==='/api/exam-center/summary'&&m==='GET')return centerSummary(env,user);
  if(p==='/api/exam-center/networks'&&m==='GET')return listNetworks(env,user);
  if(p==='/api/exam-center/networks'&&m==='POST')return createNetwork(request,env,user);
  if(p==='/api/exam-center/results'&&m==='GET')return availableStudentResults(env,user,request);
  let x=p.match(/^\/api\/exam-center\/networks\/([^/]+)\/institutions$/);if(x&&m==='POST')return networkInstitutions(request,env,user,x[1]);
  x=p.match(/^\/api\/exam-center\/networks\/([^/]+)\/users$/);if(x&&m==='POST')return networkUser(request,env,user,x[1]);
  x=p.match(/^\/api\/exam-center\/exams\/([^/]+)\/catalog$/);if(x&&m==='PATCH')return patchCatalog(request,env,user,x[1]);
  x=p.match(/^\/api\/exam-center\/exams\/([^/]+)\/freeze$/);if(x&&m==='POST')return freezeExam(env,user,x[1]);
  x=p.match(/^\/api\/exam-center\/exams\/([^/]+)\/build-ranking$/);if(x&&m==='POST')return buildRanking(env,user,x[1]);
  x=p.match(/^\/api\/exam-center\/exams\/([^/]+)\/publish$/);if(x&&m==='POST')return publishRanking(env,user,x[1]);
  x=p.match(/^\/api\/exam-center\/exams\/([^/]+)\/ranking-summary$/);if(x&&m==='GET')return rankingSummary(env,user,x[1]);
  x=p.match(/^\/api\/exam-center\/results\/([^/]+)\/me$/);if(x&&m==='GET')return studentResult(request,env,user,x[1]);
  return null;
}
