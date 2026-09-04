import type { AuthUser, Env } from '../types';
import { all, audit, badRequest, forbidden, json, notFound, one, uuid } from './db';

const NEXT_FEATURES = new Set([
  'LEARNING_GRAPH','QUESTION_BANK','RECOVERY','RBA','MEMBERSHIP','LIVE','STUDIO','PHYSICAL_BRIDGE','GAMES','CAMPUS','ENTERPRISE','PUBLISHER','ADMISSIONS','GUIDANCE_TESTS','BOARD','MOBILE_API','VIDEO_LIBRARY',
]);

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

async function requestBody(request: Request): Promise<any> {
  return request.json().catch(() => ({}));
}

function userInstitution(user: AuthUser, requested?: string | null): string | null {
  if (user.role === 'SUPER_ADMIN') return requested || user.institution_id || null;
  return user.institution_id;
}

async function featureEnabled(env: Env, user: AuthUser, key: string): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true;
  if (!NEXT_FEATURES.has(key)) return true;
  if (!user.institution_id) return false;
  const row = await one<any>(env.DB.prepare(`SELECT COALESCE(o.enabled,f.enabled_default) enabled
    FROM platform_features f LEFT JOIN institution_feature_overrides o
      ON o.feature_key=f.feature_key AND o.institution_id=? WHERE f.feature_key=?`).bind(user.institution_id,key));
  return Number(row?.enabled || 0) === 1;
}

async function requireFeature(env: Env, user: AuthUser, key: string): Promise<Response | null> {
  return await featureEnabled(env,user,key) ? null : json({ok:false,error:{code:'FEATURE_DISABLED',message:'Bu özellik kurumunuz için henüz etkin değil.',feature:key}},403);
}

async function canManageInstitution(env: Env, user: AuthUser, institutionId: string): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true;
  return user.role === 'INSTITUTION_MANAGER' && user.institution_id === institutionId;
}

async function canManageNetwork(env: Env, user: AuthUser, networkId: string): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true;
  const row = await one<any>(env.DB.prepare(`SELECT 1 ok FROM network_user_roles WHERE network_id=? AND user_id=? AND role='NETWORK_ADMIN' AND active=1`).bind(networkId,user.id));
  return !!row;
}

async function scopedStudentId(env: Env, user: AuthUser, requested?: string | null): Promise<string | null> {
  if (user.role === 'STUDENT') return user.student_id;
  if (user.role === 'PARENT') {
    if (!requested) return null;
    const row = await one<any>(env.DB.prepare(`SELECT 1 ok FROM parent_student_links WHERE parent_user_id=? AND student_id=? AND active=1`).bind(user.id,requested));
    return row ? requested : null;
  }
  if (!requested) return null;
  if (user.role === 'SUPER_ADMIN') return requested;
  if (!user.institution_id) return null;
  const row = await one<any>(env.DB.prepare(`SELECT 1 ok FROM student_enrollments WHERE student_id=? AND institution_id=? AND status='ACTIVE' ORDER BY created_at DESC LIMIT 1`).bind(requested,user.institution_id));
  return row ? requested : null;
}

async function examProfile(env: Env, examId: string) {
  return one<any>(env.DB.prepare(`SELECT p.*,e.title,e.exam_type,e.grade_level,e.academic_year,e.institution_id,e.status exam_status,pub.name publisher_name,n.name network_name
    FROM exams e LEFT JOIN exam_delivery_profiles p ON p.exam_id=e.id
    LEFT JOIN publishers pub ON pub.id=p.publisher_id LEFT JOIN institution_networks n ON n.id=p.network_id
    WHERE e.id=?`).bind(examId));
}

async function canManageExam(env: Env,user:AuthUser,profile:any):Promise<boolean>{
  if(user.role==='SUPER_ADMIN')return true;
  if(!profile)return false;
  if(profile.scope==='NETWORK'&&profile.network_id)return canManageNetwork(env,user,profile.network_id);
  return user.role==='INSTITUTION_MANAGER'&&!!user.institution_id&&profile.institution_id===user.institution_id;
}

async function listExamCatalog(request: Request, env: Env, user: AuthUser): Promise<Response> {
  const url=new URL(request.url); const q=(url.searchParams.get('q')||'').trim(); const scope=url.searchParams.get('scope');
  const params:any[]=[]; const where=[`e.status IN ('ACTIVE','CLOSED')`];
  if(scope){where.push('COALESCE(p.scope,\'INSTITUTION\')=?');params.push(scope);}
  if(q){where.push(`(e.title LIKE ? OR p.catalog_code LIKE ? OR pub.name LIKE ?)`); const s=`%${q}%`;params.push(s,s,s);}
  if(user.role!=='SUPER_ADMIN'){
    where.push(`(p.scope='CENTRAL' OR e.institution_id=? OR e.id IN (SELECT exam_id FROM exam_institutions WHERE institution_id=? AND enabled=1) OR p.network_id IN (SELECT network_id FROM institution_network_members WHERE institution_id=? AND active=1))`);
    params.push(user.institution_id,user.institution_id,user.institution_id);
  }
  const rows=await all<any>(env.DB.prepare(`SELECT e.id,e.title,e.exam_type,e.grade_level,e.academic_year,e.exam_date,e.status,
    COALESCE(p.scope,'INSTITUTION') scope,p.catalog_code,p.verified_catalog,p.result_freeze_status,p.snapshot_version,p.published_at,
    pub.name publisher_name,n.name network_name,
    (SELECT COUNT(*) FROM exam_participants ep WHERE ep.exam_id=e.id) participant_count,
    (SELECT GROUP_CONCAT(code) FROM exam_booklets b WHERE b.exam_id=e.id AND b.active=1) booklet_codes
    FROM exams e LEFT JOIN exam_delivery_profiles p ON p.exam_id=e.id LEFT JOIN publishers pub ON pub.id=p.publisher_id LEFT JOIN institution_networks n ON n.id=p.network_id
    WHERE ${where.join(' AND ')} ORDER BY e.exam_date DESC,e.created_at DESC LIMIT 250`).bind(...params));
  return json({ok:true,exams:rows});
}

async function createCatalogExam(request:Request,env:Env,user:AuthUser):Promise<Response>{
  if(user.role!=='SUPER_ADMIN')return forbidden();
  const b=await requestBody(request); const title=String(b.title||'').trim(); const scope=String(b.scope||'CENTRAL').toUpperCase();
  if(!title||!['CENTRAL','NETWORK','INSTITUTION'].includes(scope))return badRequest('Sınav adı ve geçerli kapsam gereklidir.');
  const examId=uuid('exam');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO exams(id,owner_type,institution_id,academic_year,title,exam_type,grade_level,exam_date,status,scoring_rule_version_id,sponsor_mode,created_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(examId,scope==='INSTITUTION'?'INSTITUTION':'CENTRAL',b.institutionId||null,b.academicYear||'2026-2027',title,b.examType||'OTHER',b.gradeLevel||null,b.examDate||null,'DRAFT',b.scoringRuleVersionId||null,scope==='CENTRAL'?'ADMIN_SPONSORED':'INSTITUTION',user.id),
    env.DB.prepare(`INSERT INTO exam_delivery_profiles(exam_id,scope,publisher_id,network_id,catalog_code,verified_catalog) VALUES(?,?,?,?,?,?)`)
      .bind(examId,scope,b.publisherId||null,b.networkId||null,b.catalogCode||null,b.verifiedCatalog?1:0),
  ]);
  await audit(env.DB,user.id,b.institutionId||null,'EXAM_CATALOG_CREATED','exam',examId,{scope,catalogCode:b.catalogCode||null});
  return json({ok:true,id:examId},201);
}

async function updateExamProfile(request:Request,env:Env,user:AuthUser,examId:string):Promise<Response>{
  if(user.role!=='SUPER_ADMIN')return forbidden(); const b=await requestBody(request); const scope=String(b.scope||'INSTITUTION').toUpperCase();
  if(!['INSTITUTION','NETWORK','CENTRAL'].includes(scope))return badRequest('Geçersiz sınav kapsamı.');
  await env.DB.prepare(`INSERT INTO exam_delivery_profiles(exam_id,scope,publisher_id,network_id,catalog_code,verified_catalog,updated_at)
    VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(exam_id) DO UPDATE SET scope=excluded.scope,publisher_id=excluded.publisher_id,network_id=excluded.network_id,catalog_code=excluded.catalog_code,verified_catalog=excluded.verified_catalog,updated_at=CURRENT_TIMESTAMP`)
    .bind(examId,scope,b.publisherId||null,b.networkId||null,b.catalogCode||null,b.verifiedCatalog?1:0).run();
  return json({ok:true,profile:await examProfile(env,examId)});
}

async function freezeExam(env:Env,user:AuthUser,examId:string):Promise<Response>{
  const p=await examProfile(env,examId); if(!p)return notFound('Sınav bulunamadı.'); if(!await canManageExam(env,user,p))return forbidden();
  if(p.scope==='CENTRAL'&&user.role!=='SUPER_ADMIN')return forbidden('Merkezi sınav sıralamasını yalnız Süper Admin dondurabilir.');
  const version=Number(p.snapshot_version||0)+1; const networkId=p.scope==='NETWORK'?p.network_id:null;
  const participantCountRow=await one<any>(env.DB.prepare(`SELECT COUNT(*) count FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id WHERE ep.exam_id=?`).bind(examId));
  if(!Number(participantCountRow?.count||0))return badRequest('Sonuçlandırılmış katılımcı bulunmuyor.','NO_RESULTS');
  await env.DB.prepare(`DELETE FROM exam_result_snapshots WHERE exam_id=? AND snapshot_version=?`).bind(examId,version).run();
  await env.DB.prepare(`INSERT INTO exam_result_snapshots(
    id,exam_id,participant_id,snapshot_version,student_id,institution_id,network_id,city,district,grade_level,class_snapshot,score,net,
    national_rank,national_count,city_rank,city_count,district_rank,district_count,network_rank,network_count,institution_rank,institution_count,grade_rank,grade_count,class_rank,class_count)
    SELECT 'snap_'||lower(hex(randomblob(16))), ep.exam_id,ep.id,?,ep.student_id,ep.institution_id,?,i.city,i.district,
      COALESCE(se.grade_level,e.grade_level),ep.class_snapshot,er.score,er.net,
      RANK() OVER(ORDER BY COALESCE(er.score,er.net) DESC),COUNT(*) OVER(),
      RANK() OVER(PARTITION BY COALESCE(i.city,'') ORDER BY COALESCE(er.score,er.net) DESC),COUNT(*) OVER(PARTITION BY COALESCE(i.city,'')),
      RANK() OVER(PARTITION BY COALESCE(i.city,''),COALESCE(i.district,'') ORDER BY COALESCE(er.score,er.net) DESC),COUNT(*) OVER(PARTITION BY COALESCE(i.city,''),COALESCE(i.district,'')),
      CASE WHEN ? IS NOT NULL THEN RANK() OVER(ORDER BY COALESCE(er.score,er.net) DESC) END,
      CASE WHEN ? IS NOT NULL THEN COUNT(*) OVER() END,
      RANK() OVER(PARTITION BY ep.institution_id ORDER BY COALESCE(er.score,er.net) DESC),COUNT(*) OVER(PARTITION BY ep.institution_id),
      RANK() OVER(PARTITION BY ep.institution_id,COALESCE(se.grade_level,e.grade_level) ORDER BY COALESCE(er.score,er.net) DESC),COUNT(*) OVER(PARTITION BY ep.institution_id,COALESCE(se.grade_level,e.grade_level)),
      RANK() OVER(PARTITION BY ep.institution_id,COALESCE(ep.class_snapshot,'') ORDER BY COALESCE(er.score,er.net) DESC),COUNT(*) OVER(PARTITION BY ep.institution_id,COALESCE(ep.class_snapshot,''))
    FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id JOIN exams e ON e.id=ep.exam_id JOIN institutions i ON i.id=ep.institution_id
    LEFT JOIN student_enrollments se ON se.student_id=ep.student_id AND se.institution_id=ep.institution_id AND se.status='ACTIVE'
    WHERE ep.exam_id=?`).bind(version,networkId,networkId,networkId,examId).run();
  const stats=await one<any>(env.DB.prepare(`SELECT COUNT(*) participant_count,COUNT(DISTINCT institution_id) institution_count,COUNT(DISTINCT city) city_count FROM exam_result_snapshots WHERE exam_id=? AND snapshot_version=?`).bind(examId,version));
  await env.DB.batch([
    env.DB.prepare(`UPDATE exam_delivery_profiles SET result_freeze_status='FROZEN',freeze_at=CURRENT_TIMESTAMP,snapshot_version=?,updated_at=CURRENT_TIMESTAMP WHERE exam_id=?`).bind(version,examId),
    env.DB.prepare(`INSERT INTO exam_publication_stats(exam_id,snapshot_version,institution_count,participant_count,city_count,payload_json) VALUES(?,?,?,?,?,?)`)
      .bind(examId,version,stats?.institution_count||0,stats?.participant_count||0,stats?.city_count||0,JSON.stringify({scope:p.scope,networkId})),
  ]);
  await audit(env.DB,user.id,user.institution_id,'EXAM_RESULTS_FROZEN','exam',examId,{version,participants:stats?.participant_count||0});
  return json({ok:true,examId,version,stats});
}

async function publishExam(env:Env,user:AuthUser,examId:string):Promise<Response>{
  const p=await examProfile(env,examId); if(!p)return notFound('Sınav bulunamadı.'); if(!await canManageExam(env,user,p))return forbidden();
  if(p.result_freeze_status!=='FROZEN')return badRequest('Önce sıralama snapshotını dondurun.','NOT_FROZEN');
  await env.DB.prepare(`UPDATE exam_delivery_profiles SET result_freeze_status='PUBLISHED',published_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE exam_id=?`).bind(examId).run();
  await audit(env.DB,user.id,user.institution_id,'EXAM_RESULTS_PUBLISHED','exam',examId,{version:p.snapshot_version});
  return json({ok:true,published:true,version:p.snapshot_version});
}

async function examStats(env:Env,user:AuthUser,examId:string):Promise<Response>{
  const p=await examProfile(env,examId); if(!p)return notFound();
  const institutionScope=user.role==='SUPER_ADMIN'?null:user.institution_id;
  const can=await canManageExam(env,user,p);
  const catalogAccess=institutionScope?await one<any>(env.DB.prepare(`SELECT 1 ok FROM exams e LEFT JOIN exam_delivery_profiles p ON p.exam_id=e.id
    WHERE e.id=? AND (p.scope='CENTRAL' OR e.institution_id=? OR e.id IN (SELECT exam_id FROM exam_institutions WHERE institution_id=? AND enabled=1)
      OR p.network_id IN (SELECT network_id FROM institution_network_members WHERE institution_id=? AND active=1))`).bind(examId,institutionScope,institutionScope,institutionScope)):null;
  if(!can&&!catalogAccess&&user.role!=='TEACHER'&&user.role!=='GUIDANCE_TEACHER')return forbidden();
  const version=Number(p.snapshot_version||0);
  const stats=version?institutionScope
    ?await one<any>(env.DB.prepare(`SELECT COUNT(*) participant_count,COUNT(DISTINCT institution_id) institution_count,COUNT(DISTINCT city) city_count FROM exam_result_snapshots WHERE exam_id=? AND snapshot_version=? AND institution_id=?`).bind(examId,version,institutionScope))
    :await one<any>(env.DB.prepare(`SELECT * FROM exam_publication_stats WHERE exam_id=? AND snapshot_version=?`).bind(examId,version))
    :await one<any>(env.DB.prepare(`SELECT COUNT(*) participant_count,COUNT(DISTINCT ep.institution_id) institution_count,COUNT(DISTINCT i.city) city_count
      FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id JOIN institutions i ON i.id=ep.institution_id
      WHERE ep.exam_id=? AND (? IS NULL OR ep.institution_id=?)`).bind(examId,institutionScope,institutionScope));
  const cities=institutionScope?[]:version
    ?await all<any>(env.DB.prepare(`SELECT COALESCE(city,'Belirtilmemiş') city,COUNT(*) participant_count,AVG(net) avg_net,AVG(score) avg_score FROM exam_result_snapshots WHERE exam_id=? AND snapshot_version=? GROUP BY city ORDER BY participant_count DESC LIMIT 100`).bind(examId,version))
    :await all<any>(env.DB.prepare(`SELECT COALESCE(i.city,'Belirtilmemiş') city,COUNT(*) participant_count,AVG(er.net) avg_net,AVG(er.score) avg_score FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id JOIN institutions i ON i.id=ep.institution_id WHERE ep.exam_id=? GROUP BY i.city ORDER BY participant_count DESC LIMIT 100`).bind(examId));
  const institutions=institutionScope?[]:version
    ?await all<any>(env.DB.prepare(`SELECT i.id,i.name,i.city,i.district,COUNT(*) participant_count,AVG(s.net) avg_net,AVG(s.score) avg_score FROM exam_result_snapshots s JOIN institutions i ON i.id=s.institution_id WHERE s.exam_id=? AND s.snapshot_version=? GROUP BY i.id,i.name,i.city,i.district ORDER BY participant_count DESC LIMIT 500`).bind(examId,version))
    :await all<any>(env.DB.prepare(`SELECT i.id,i.name,i.city,i.district,COUNT(*) participant_count,AVG(er.net) avg_net,AVG(er.score) avg_score FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id JOIN institutions i ON i.id=ep.institution_id WHERE ep.exam_id=? GROUP BY i.id,i.name,i.city,i.district ORDER BY participant_count DESC LIMIT 500`).bind(examId));
  const students=institutionScope?await all<any>(env.DB.prepare(`WITH live AS (SELECT ep.id participant_id,ep.student_number_snapshot,ep.name_snapshot,ep.class_snapshot,
      er.correct_count,er.wrong_count,er.blank_count,er.net,er.score,er.institution_rank,
      COUNT(*) OVER() live_institution_count,
      RANK() OVER(PARTITION BY COALESCE(ep.class_snapshot,'') ORDER BY er.net DESC,er.correct_count DESC) live_class_rank,
      COUNT(*) OVER(PARTITION BY COALESCE(ep.class_snapshot,'')) live_class_count
      FROM exam_participants ep JOIN exam_results er ON er.participant_id=ep.id WHERE ep.exam_id=? AND ep.institution_id=?)
    SELECT live.*,COALESCE(s.institution_rank,live.institution_rank) institution_rank,COALESCE(s.institution_count,live.live_institution_count) institution_count,s.grade_rank,s.grade_count,
      COALESCE(s.class_rank,live.live_class_rank) class_rank,COALESCE(s.class_count,live.live_class_count) class_count,
    CASE WHEN p.scope='CENTRAL' THEN s.national_rank END national_rank,CASE WHEN p.scope='CENTRAL' THEN s.national_count END national_count
    FROM live LEFT JOIN exam_result_snapshots s ON s.participant_id=live.participant_id AND s.snapshot_version=?
    LEFT JOIN exam_delivery_profiles p ON p.exam_id=?
    ORDER BY live.net DESC,live.correct_count DESC,live.name_snapshot LIMIT 5000`).bind(examId,institutionScope,version,examId)):[];
  return json({ok:true,profile:p,stats,cities,institutions,students});
}

async function studentExamResult(request:Request,env:Env,user:AuthUser,examId:string):Promise<Response>{
  const url=new URL(request.url); const requested=url.searchParams.get('studentId'); const studentId=await scopedStudentId(env,user,requested);
  if(!studentId)return forbidden('Bu öğrenci sonucuna erişemezsiniz.');
  const p=await examProfile(env,examId); if(!p)return notFound();
  if(p.result_freeze_status!=='PUBLISHED'&&user.role!=='SUPER_ADMIN'&&user.role!=='INSTITUTION_MANAGER')return badRequest('Sonuçlar henüz yayınlanmadı.','RESULTS_NOT_PUBLISHED');
  const snap=await one<any>(env.DB.prepare(`SELECT s.*,i.name institution_name,e.title exam_title,e.exam_type FROM exam_result_snapshots s JOIN institutions i ON i.id=s.institution_id JOIN exams e ON e.id=s.exam_id WHERE s.exam_id=? AND s.student_id=? AND s.snapshot_version=? LIMIT 1`).bind(examId,studentId,p.snapshot_version));
  if(!snap)return notFound('Öğrencinin bu sınav için yayınlanmış sonucu yok.');
  const subjects=await all<any>(env.DB.prepare(`SELECT sub.name subject,sr.correct_count,sr.wrong_count,sr.blank_count,sr.net,sr.success_percent FROM subject_results sr JOIN subjects sub ON sub.id=sr.subject_id WHERE sr.participant_id=? ORDER BY sub.name`).bind(snap.participant_id));
  const questionInsights=await all<any>(env.DB.prepare(`SELECT sub.name subject,q.question_no,sa.status student_status,
    a.participant_count,a.correct_count,a.wrong_count,a.blank_count,a.success_percent
    FROM student_answers sa JOIN exam_questions q ON q.id=sa.exam_question_id JOIN subjects sub ON sub.id=q.subject_id
    JOIN publisher_question_analytics a ON a.exam_question_id=q.id AND a.exam_id=? AND a.snapshot_version=?
    WHERE sa.participant_id=? AND a.participant_count>=10
    ORDER BY a.success_percent ASC,q.global_no,q.question_no LIMIT 10`).bind(examId,p.snapshot_version,snap.participant_id));
  const scopedSnap=p.scope==='CENTRAL'?snap:p.scope==='NETWORK'
    ?{...snap,national_rank:null,national_count:null,city_rank:null,city_count:null,district_rank:null,district_count:null}
    :{...snap,national_rank:null,national_count:null,city_rank:null,city_count:null,district_rank:null,district_count:null,network_rank:null,network_count:null};
  return json({ok:true,profile:p,result:{...scopedSnap,subjects,questionInsights,rankingLabel:p.scope==='CENTRAL'?'Türkiye geneli sınav katılımcıları arasında':p.scope==='NETWORK'?'Kurum ağı katılımcıları arasında':'Kurum katılımcıları arasında'}});
}

async function listNetworks(env:Env,user:AuthUser):Promise<Response>{
  const where=user.role==='SUPER_ADMIN'?'1=1':`n.id IN (SELECT network_id FROM network_user_roles WHERE user_id=? AND active=1 UNION SELECT network_id FROM institution_network_members WHERE institution_id=? AND active=1)`;
  const stmt=env.DB.prepare(`SELECT n.*,(SELECT COUNT(*) FROM institution_network_members m WHERE m.network_id=n.id AND m.active=1) institution_count FROM institution_networks n WHERE n.active=1 AND ${where} ORDER BY n.name`);
  const rows=user.role==='SUPER_ADMIN'?await all<any>(stmt):await all<any>(stmt.bind(user.id,user.institution_id));
  return json({ok:true,networks:rows});
}

async function createNetwork(request:Request,env:Env,user:AuthUser):Promise<Response>{
  if(user.role!=='SUPER_ADMIN')return forbidden(); const b=await requestBody(request); if(!b.name||!b.code)return badRequest('Ağ adı ve kodu gereklidir.'); const id=uuid('net');
  await env.DB.prepare(`INSERT INTO institution_networks(id,name,code,headquarters_institution_id) VALUES(?,?,?,?)`).bind(id,String(b.name).trim(),String(b.code).trim().toUpperCase(),b.headquartersInstitutionId||null).run();
  return json({ok:true,id},201);
}

async function addNetworkMember(request:Request,env:Env,user:AuthUser,networkId:string):Promise<Response>{
  if(!await canManageNetwork(env,user,networkId))return forbidden(); const b=await requestBody(request); if(!b.institutionId)return badRequest('Kurum seçin.');
  await env.DB.prepare(`INSERT INTO institution_network_members(network_id,institution_id,region_label,active) VALUES(?,?,?,1) ON CONFLICT(network_id,institution_id) DO UPDATE SET region_label=excluded.region_label,active=1`).bind(networkId,b.institutionId,b.regionLabel||null).run();
  return json({ok:true});
}

async function networkDashboard(env:Env,user:AuthUser,networkId:string):Promise<Response>{
  const allowed=user.role==='SUPER_ADMIN'||await canManageNetwork(env,user,networkId)||!!await one<any>(env.DB.prepare(`SELECT 1 ok FROM institution_network_members WHERE network_id=? AND institution_id=? AND active=1`).bind(networkId,user.institution_id));
  if(!allowed)return forbidden();
  const network=await one<any>(env.DB.prepare(`SELECT * FROM institution_networks WHERE id=?`).bind(networkId)); if(!network)return notFound();
  const institutions=await all<any>(env.DB.prepare(`SELECT i.*,m.region_label FROM institution_network_members m JOIN institutions i ON i.id=m.institution_id WHERE m.network_id=? AND m.active=1 ORDER BY i.city,i.district,i.name`).bind(networkId));
  const exams=await all<any>(env.DB.prepare(`SELECT e.id,e.title,e.exam_type,p.result_freeze_status,p.snapshot_version,p.published_at,(SELECT COUNT(*) FROM exam_result_snapshots s WHERE s.exam_id=e.id AND s.snapshot_version=p.snapshot_version) participant_count FROM exam_delivery_profiles p JOIN exams e ON e.id=p.exam_id WHERE p.network_id=? ORDER BY e.exam_date DESC,e.created_at DESC LIMIT 100`).bind(networkId));
  return json({ok:true,network,institutions,exams});
}

async function listFeatures(env:Env,user:AuthUser):Promise<Response>{
  const rows=user.role==='SUPER_ADMIN'
    ? await all<any>(env.DB.prepare(`SELECT f.*,NULL override_enabled FROM platform_features f ORDER BY stage,feature_key`))
    : await all<any>(env.DB.prepare(`SELECT f.*,o.enabled override_enabled,COALESCE(o.enabled,f.enabled_default) effective_enabled FROM platform_features f LEFT JOIN institution_feature_overrides o ON o.feature_key=f.feature_key AND o.institution_id=? ORDER BY f.stage,f.feature_key`).bind(user.institution_id));
  return json({ok:true,features:rows});
}

async function setFeature(request:Request,env:Env,user:AuthUser):Promise<Response>{
  if(user.role!=='SUPER_ADMIN')return forbidden(); const b=await requestBody(request); if(!b.institutionId||!b.featureKey)return badRequest('Kurum ve özellik gereklidir.');
  await env.DB.prepare(`INSERT INTO institution_feature_overrides(institution_id,feature_key,enabled,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(institution_id,feature_key) DO UPDATE SET enabled=excluded.enabled,updated_at=CURRENT_TIMESTAMP`).bind(b.institutionId,b.featureKey,b.enabled?1:0).run();
  return json({ok:true});
}

async function listQuestions(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'QUESTION_BANK'); if(gate)return gate; const u=new URL(request.url); const grade=u.searchParams.get('gradeLevel'); const subject=u.searchParams.get('subjectId'); const q=u.searchParams.get('q');
  const wh=[`q.review_status<>'ARCHIVED'`],ps:any[]=[]; if(grade){wh.push('q.grade_level=?');ps.push(Number(grade));} if(subject){wh.push('q.subject_id=?');ps.push(subject);} if(q){wh.push('(q.stem_text LIKE ? OR q.topic LIKE ? OR q.subtopic LIKE ?)');const s=`%${q}%`;ps.push(s,s,s);}
  if(user.role!=='SUPER_ADMIN') { wh.push(`(q.owner_type='PLATFORM' OR (q.owner_type='INSTITUTION' AND q.owner_id=?))`); ps.push(user.institution_id); }
  const rows=await all<any>(env.DB.prepare(`SELECT q.*,s.name subject_name FROM question_bank q LEFT JOIN subjects s ON s.id=q.subject_id WHERE ${wh.join(' AND ')} ORDER BY q.created_at DESC LIMIT 300`).bind(...ps));
  return json({ok:true,questions:rows.map(r=>({...r,options:parseJson(r.options_json,[])}))});
}

async function createQuestion(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'QUESTION_BANK');if(gate)return gate; if(!['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role))return forbidden(); const b=await requestBody(request); if(!String(b.stemText||'').trim())return badRequest('Soru metni gereklidir.');
  const id=uuid('q'); const ownerType=user.role==='SUPER_ADMIN'?(b.ownerType||'PLATFORM'):'INSTITUTION'; const ownerId=ownerType==='INSTITUTION'?user.institution_id:(b.ownerId||null);
  await env.DB.prepare(`INSERT INTO question_bank(id,owner_type,owner_id,academic_year,grade_level,subject_id,topic,subtopic,question_type,difficulty,stem_text,options_json,correct_answer,solution_text,source_label,copyright_status,review_status,created_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,ownerType,ownerId,b.academicYear||'2026-2027',b.gradeLevel||null,b.subjectId||null,b.topic||null,b.subtopic||null,b.questionType||'MULTIPLE_CHOICE',Number(b.difficulty||3),String(b.stemText).trim(),JSON.stringify(b.options||[]),b.correctAnswer||null,b.solutionText||null,b.sourceLabel||null,b.copyrightStatus||'OWNED',(['LICENSED','PUBLIC_DOMAIN','RESTRICTED'].includes(String(b.copyrightStatus||'OWNED').toUpperCase())?'REVIEW':user.role==='SUPER_ADMIN'?'APPROVED':'DRAFT'),user.id).run();
  if(Array.isArray(b.nodeIds)&&b.nodeIds.length)await env.DB.batch(b.nodeIds.map((nodeId:string)=>env.DB.prepare(`INSERT OR IGNORE INTO question_learning_links(question_id,node_id) VALUES(?,?)`).bind(id,nodeId)));
  return json({ok:true,id},201);
}

async function learningState(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'LEARNING_GRAPH');if(gate)return gate; const u=new URL(request.url); const sid=await scopedStudentId(env,user,u.searchParams.get('studentId'));if(!sid)return forbidden();
  const rows=await all<any>(env.DB.prepare(`SELECT ls.*,n.title,n.node_type,n.code,n.grade_level,s.name subject_name FROM student_learning_state ls JOIN learning_nodes n ON n.id=ls.node_id LEFT JOIN subjects s ON s.id=n.subject_id WHERE ls.student_id=? ORDER BY ls.mastery ASC,ls.evidence_count DESC LIMIT 500`).bind(sid));
  return json({ok:true,studentId:sid,nodes:rows,weak:rows.filter(r=>Number(r.mastery)<0.6).slice(0,20)});
}

async function addLearningEvidence(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'LEARNING_GRAPH');if(gate)return gate; if(!['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role))return forbidden(); const b=await requestBody(request); const sid=await scopedStudentId(env,user,b.studentId); if(!sid||!b.nodeId)return badRequest('Öğrenci ve öğrenme düğümü gereklidir.'); const result=Math.max(0,Math.min(1,Number(b.result||0)));const weight=Math.max(.1,Math.min(5,Number(b.weight||1)));
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO learning_evidence(id,student_id,node_id,source_type,source_id,result,weight) VALUES(?,?,?,?,?,?,?)`).bind(uuid('evd'),sid,b.nodeId,b.sourceType||'MANUAL',b.sourceId||null,result,weight),
    env.DB.prepare(`INSERT INTO student_learning_state(student_id,node_id,mastery,confidence,evidence_count,last_evidence_at,updated_at) VALUES(?,?,?,0.25,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(student_id,node_id) DO UPDATE SET mastery=ROUND(((mastery*evidence_count)+(excluded.mastery*?))/(evidence_count+?),4),confidence=MIN(1,confidence+0.1),evidence_count=evidence_count+1,last_evidence_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`).bind(sid,b.nodeId,result,weight,weight),
  ]);
  return json({ok:true});
}

async function listAssignments(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const u=new URL(request.url); const sid=await scopedStudentId(env,user,u.searchParams.get('studentId'));
  if(user.role==='STUDENT'||user.role==='PARENT'){
    if(!sid)return forbidden(); const rows=await all<any>(env.DB.prepare(`SELECT a.*,ar.status recipient_status,ar.progress,ar.completed_at FROM assignment_recipients ar JOIN assignments a ON a.id=ar.assignment_id WHERE ar.student_id=? ORDER BY a.created_at DESC LIMIT 200`).bind(sid));return json({ok:true,assignments:rows});
  }
  if(!user.institution_id&&user.role!=='SUPER_ADMIN')return forbidden(); const inst=userInstitution(user,u.searchParams.get('institutionId')); const rows=await all<any>(env.DB.prepare(`SELECT a.*,(SELECT COUNT(*) FROM assignment_recipients r WHERE r.assignment_id=a.id) recipient_count FROM assignments a WHERE (? IS NULL OR a.institution_id=?) ORDER BY a.created_at DESC LIMIT 200`).bind(inst,inst)); return json({ok:true,assignments:rows});
}

async function createAssignment(request:Request,env:Env,user:AuthUser):Promise<Response>{
  if(!['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role))return forbidden(); const b=await requestBody(request); const inst=userInstitution(user,b.institutionId); if(!inst||!b.title)return badRequest('Kurum ve ödev başlığı gereklidir.'); const id=uuid('asg');
  const recipients:Array<string>=Array.isArray(b.studentIds)?b.studentIds:[]; const items:Array<any>=Array.isArray(b.items)?b.items:[];
  const stmts=[env.DB.prepare(`INSERT INTO assignments(id,institution_id,season_id,created_by,assignment_type,title,description,due_at,status) VALUES(?,?,?,?,?,?,?,?,?)`).bind(id,inst,b.seasonId||null,user.id,b.assignmentType||'TEACHER',String(b.title).trim(),b.description||null,b.dueAt||null,b.publish?'ASSIGNED':'DRAFT')];
  items.forEach((it,i)=>stmts.push(env.DB.prepare(`INSERT INTO assignment_items(id,assignment_id,item_type,reference_id,payload_json,sort_order) VALUES(?,?,?,?,?,?)`).bind(uuid('asi'),id,it.itemType||'TASK',it.referenceId||null,JSON.stringify(it.payload||{}),i+1)));
  recipients.forEach(sid=>stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO assignment_recipients(assignment_id,student_id,status) VALUES(?,?,'ASSIGNED')`).bind(id,sid)));
  await env.DB.batch(stmts); return json({ok:true,id},201);
}

async function generateRecovery(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'RECOVERY');if(gate)return gate; const b=await requestBody(request); const sid=await scopedStudentId(env,user,b.studentId||null); if(!sid)return forbidden();
  const enrollment=await one<any>(env.DB.prepare(`SELECT institution_id FROM student_enrollments WHERE student_id=? AND status='ACTIVE' ORDER BY created_at DESC LIMIT 1`).bind(sid)); if(!enrollment)return badRequest('Aktif öğrenci kaydı bulunamadı.');
  const examId=b.examId||null; const weak=examId?await all<any>(env.DB.prepare(`SELECT o.id outcome_id,o.title,orr.success_rate,orr.evidence_count FROM outcome_results orr JOIN outcomes o ON o.id=orr.outcome_id WHERE orr.student_id=? AND orr.exam_id=? ORDER BY orr.success_rate ASC,orr.evidence_count DESC LIMIT 8`).bind(sid,examId)) : await all<any>(env.DB.prepare(`SELECT o.id outcome_id,o.title,AVG(orr.success_rate) success_rate,SUM(orr.evidence_count) evidence_count FROM outcome_results orr JOIN outcomes o ON o.id=orr.outcome_id WHERE orr.student_id=? GROUP BY o.id,o.title HAVING SUM(orr.evidence_count)>0 ORDER BY AVG(orr.success_rate) ASC LIMIT 8`).bind(sid));
  if(!weak.length)return badRequest('Recovery oluşturmak için yeterli kazanım kanıtı yok.','INSUFFICIENT_EVIDENCE'); const planId=uuid('rec'); const stmts=[env.DB.prepare(`INSERT INTO recovery_plans(id,student_id,institution_id,source_exam_id,title,generated_by) VALUES(?,?,?,?,?,?)`).bind(planId,sid,enrollment.institution_id,examId,b.title||'Kişisel Eksik Tamamlama Rotası',user.role==='STUDENT'?'NIBIRU':(b.generatedBy||'SYSTEM'))];
  let order=1; for(const w of weak){const node=await one<any>(env.DB.prepare(`SELECT id FROM learning_nodes WHERE code=(SELECT code FROM outcomes WHERE id=?) OR title=? LIMIT 1`).bind(w.outcome_id,w.title)); for(const type of ['EXPLAIN','PRACTICE','RETEST'])stmts.push(env.DB.prepare(`INSERT INTO recovery_steps(id,plan_id,node_id,step_type,reference_id,difficulty,status,sort_order) VALUES(?,?,?,?,?,?,?,?)`).bind(uuid('rst'),planId,node?.id||null,type,w.outcome_id,type==='PRACTICE'?2:null,order===1?'AVAILABLE':'PENDING',order++));}
  await env.DB.batch(stmts); return json({ok:true,id:planId,weakOutcomes:weak,stepCount:order-1},201);
}

async function listRecovery(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'RECOVERY');if(gate)return gate; const u=new URL(request.url);const sid=await scopedStudentId(env,user,u.searchParams.get('studentId'));if(!sid)return forbidden(); const rows=await all<any>(env.DB.prepare(`SELECT p.*,(SELECT COUNT(*) FROM recovery_steps s WHERE s.plan_id=p.id) step_count,(SELECT COUNT(*) FROM recovery_steps s WHERE s.plan_id=p.id AND s.status='DONE') done_count FROM recovery_plans p WHERE p.student_id=? ORDER BY p.created_at DESC LIMIT 100`).bind(sid));return json({ok:true,plans:rows});
}

function rbaScore(responses:any){const values=Object.values(responses||{}).map(Number).filter(Number.isFinite).map(v=>Math.max(1,Math.min(5,v)));const avg=values.length?values.reduce((a,b)=>a+b,0)/values.length:0;const normalized=avg?Math.round((avg/5)*100):null;return {normalized,items:values.length};}

async function rba(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'RBA');if(gate)return gate; const u=new URL(request.url); const sid=await scopedStudentId(env,user,u.searchParams.get('studentId'));if(!sid)return forbidden();
  if(request.method==='GET'){const p=await one<any>(env.DB.prepare(`SELECT * FROM rba_profiles WHERE student_id=?`).bind(sid));return json({ok:true,profile:p?{...p,evidence:parseJson(p.evidence_json,{})}:null,disclaimer:'RBA eğitsel öğrenme davranışı profilidir; psikolojik veya tıbbi tanı değildir.'});}
  const b=await requestBody(request);const dimensions=b.dimensions||{};const calc=(x:any)=>rbaScore(x).normalized;const result={analytical:calc(dimensions.analytical),verbal:calc(dimensions.verbal),numeric:calc(dimensions.numeric),consistency:calc(dimensions.consistency),errorRepetition:calc(dimensions.errorRepetition),pace:calc(dimensions.pace),planAdherence:calc(dimensions.planAdherence),persistence:calc(dimensions.persistence),stability:calc(dimensions.stability)};
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO rba_assessments(id,student_id,instrument_version,response_json,result_json) VALUES(?,?,?,?,?)`).bind(uuid('rba'),sid,b.version||'RBA-1',JSON.stringify(b),JSON.stringify(result)),
    env.DB.prepare(`INSERT INTO rba_profiles(student_id,analytical_score,verbal_processing_score,numeric_processing_score,consistency_score,error_repetition_score,pace_score,plan_adherence_score,persistence_score,performance_stability_score,confidence,evidence_json,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?, ?,CURRENT_TIMESTAMP) ON CONFLICT(student_id) DO UPDATE SET version=version+1,analytical_score=excluded.analytical_score,verbal_processing_score=excluded.verbal_processing_score,numeric_processing_score=excluded.numeric_processing_score,consistency_score=excluded.consistency_score,error_repetition_score=excluded.error_repetition_score,pace_score=excluded.pace_score,plan_adherence_score=excluded.plan_adherence_score,persistence_score=excluded.persistence_score,performance_stability_score=excluded.performance_stability_score,confidence=excluded.confidence,evidence_json=excluded.evidence_json,updated_at=CURRENT_TIMESTAMP`)
      .bind(sid,result.analytical,result.verbal,result.numeric,result.consistency,result.errorRepetition,result.pace,result.planAdherence,result.persistence,result.stability,.6,JSON.stringify({source:'SELF_REPORT',items:Object.keys(dimensions).length})),
  ]);return json({ok:true,result,disclaimer:'Bu sonuç eğitsel farkındalık içindir; tanı değildir.'});
}

async function membership(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'MEMBERSHIP');if(gate)return gate; const u=new URL(request.url);const sid=await scopedStudentId(env,user,u.searchParams.get('studentId')); const plans=(await all<any>(env.DB.prepare(`SELECT * FROM membership_plans WHERE active=1 ORDER BY tier`))).map(p=>({...p,entitlements:parseJson(p.entitlement_json,{})}));if(!sid)return json({ok:true,plans,membership:null,wallet:null});const current=await one<any>(env.DB.prepare(`SELECT sm.*,mp.code plan_code,mp.name plan_name,mp.tier,mp.entitlement_json FROM student_memberships sm JOIN membership_plans mp ON mp.id=sm.plan_id WHERE sm.student_id=? AND sm.status='ACTIVE' AND (sm.ends_at IS NULL OR sm.ends_at>CURRENT_TIMESTAMP) ORDER BY mp.tier DESC,sm.starts_at DESC LIMIT 1`).bind(sid));const wallet=await one<any>(env.DB.prepare(`SELECT * FROM live_credit_wallets WHERE student_id=?`).bind(sid));return json({ok:true,plans,membership:current?{...current,entitlements:parseJson(current.entitlement_json,{})}:null,wallet:wallet||{balance:0}});
}

async function grantMembership(request:Request,env:Env,user:AuthUser):Promise<Response>{
  if(user.role!=='SUPER_ADMIN')return forbidden();const b=await requestBody(request);if(!b.studentId||!b.planId)return badRequest('Öğrenci ve plan gereklidir.');const id=uuid('mem');const plan=await one<any>(env.DB.prepare(`SELECT * FROM membership_plans WHERE id=? OR code=?`).bind(b.planId,b.planId));if(!plan)return notFound('Plan bulunamadı.');const credits=Number(plan.monthly_live_credits||0),periodKey=new Date().toISOString().slice(0,7);const statements:D1PreparedStatement[]=[env.DB.prepare(`UPDATE student_memberships SET status='EXPIRED' WHERE student_id=? AND status='ACTIVE'`).bind(b.studentId),env.DB.prepare(`INSERT INTO student_memberships(id,student_id,plan_id,status,starts_at,ends_at,source) VALUES(?,?,?,'ACTIVE',CURRENT_TIMESTAMP,?,?)`).bind(id,b.studentId,plan.id,b.endsAt||null,b.source||'ADMIN')];if(credits>0)statements.push(env.DB.prepare(`INSERT INTO live_credit_wallets(student_id,balance) VALUES(?,?) ON CONFLICT(student_id) DO UPDATE SET balance=balance+excluded.balance,updated_at=CURRENT_TIMESTAMP`).bind(b.studentId,credits),env.DB.prepare(`INSERT INTO live_credit_ledger(id,student_id,amount,reason,reference_id) VALUES(?,?,?,?,?)`).bind(uuid('lcd'),b.studentId,credits,'MEMBERSHIP_MONTHLY_GRANT',id),env.DB.prepare(`INSERT INTO membership_monthly_credit_grants(membership_id,period_key,student_id,credit_amount) VALUES(?,?,?,?)`).bind(id,periodKey,b.studentId,credits));await env.DB.batch(statements);return json({ok:true,id});
}

async function liveSessions(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'LIVE');if(gate)return gate;const u=new URL(request.url);const sid=await scopedStudentId(env,user,u.searchParams.get('studentId'));
  if(request.method==='GET'){const providers=await all<any>(env.DB.prepare(`SELECT * FROM live_providers WHERE active=1 ORDER BY provider_type,display_name`));const sessions=sid?await all<any>(env.DB.prepare(`SELECT s.*,p.display_name provider_name FROM live_sessions s LEFT JOIN live_providers p ON p.id=s.provider_id WHERE s.student_id=? ORDER BY s.scheduled_at DESC LIMIT 100`).bind(sid)):[];const wallet=sid?await one<any>(env.DB.prepare(`SELECT * FROM live_credit_wallets WHERE student_id=?`).bind(sid)):null;return json({ok:true,providers,sessions,wallet:wallet||{balance:0},meetingProviderConfigured:false});}
  if(!sid)return forbidden();const b=await requestBody(request);if(!b.scheduledAt||!b.sessionType)return badRequest('Görüşme türü ve zaman gereklidir.');const cost=Math.max(1,Number(b.creditCost||1));const wallet=await one<any>(env.DB.prepare(`SELECT balance FROM live_credit_wallets WHERE student_id=?`).bind(sid));if(Number(wallet?.balance||0)<cost)return badRequest('Yeterli Live Credit yok.','INSUFFICIENT_CREDIT');const id=uuid('live');await env.DB.batch([env.DB.prepare(`INSERT INTO live_sessions(id,student_id,provider_id,session_type,scheduled_at,duration_minutes,credit_cost,status) VALUES(?,?,?,?,?,?,?,'RESERVED')`).bind(id,sid,b.providerId||null,b.sessionType,b.scheduledAt,Number(b.durationMinutes||20),cost),env.DB.prepare(`UPDATE live_credit_wallets SET balance=balance-?,updated_at=CURRENT_TIMESTAMP WHERE student_id=?`).bind(cost,sid),env.DB.prepare(`INSERT INTO live_credit_ledger(id,student_id,amount,reason,reference_id) VALUES(?,?,?,?,?)`).bind(uuid('lcd'),sid,-cost,'LIVE_RESERVATION',id)]);return json({ok:true,id,meetingProviderConfigured:false},201);
}

async function studio(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'STUDIO');if(gate)return gate;if(!['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role))return forbidden();const u=new URL(request.url);
  if(request.method==='GET'){const inst=userInstitution(user,u.searchParams.get('institutionId'));const rows=await all<any>(env.DB.prepare(`SELECT d.*,(SELECT COUNT(*) FROM studio_document_items i WHERE i.document_id=d.id) question_count FROM studio_documents d WHERE (? IS NULL OR d.institution_id=?) ORDER BY d.created_at DESC LIMIT 200`).bind(inst,inst));return json({ok:true,documents:rows});}
  const b=await requestBody(request);if(!b.title||!b.documentType)return badRequest('Belge türü ve başlık gereklidir.');const inst=userInstitution(user,b.institutionId);const id=uuid('std');const count=Math.max(1,Math.min(200,Number(b.questionCount||20)));await env.DB.prepare(`INSERT INTO studio_documents(id,institution_id,created_by,document_type,title,grade_level,subject_id,status,config_json) VALUES(?,?,?,?,?,?,?,'DRAFT',?)`).bind(id,inst,user.id,b.documentType,b.title,b.gradeLevel||null,b.subjectId||null,JSON.stringify(b)).run();const qs=await all<any>(env.DB.prepare(`SELECT id FROM question_bank WHERE review_status='APPROVED' AND (? IS NULL OR grade_level=?) AND (? IS NULL OR subject_id=?) ORDER BY RANDOM() LIMIT ?`).bind(b.gradeLevel||null,b.gradeLevel||null,b.subjectId||null,b.subjectId||null,count));if(qs.length)await env.DB.batch(qs.map((q,i)=>env.DB.prepare(`INSERT INTO studio_document_items(document_id,question_id,booklet_code,sort_order) VALUES(?,?,'A',?)`).bind(id,q.id,i+1)));return json({ok:true,id,selectedQuestions:qs.length,requestedQuestions:count},201);
}

async function physicalBridge(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'PHYSICAL_BRIDGE');if(gate)return gate;const u=new URL(request.url);const key=u.searchParams.get('key');if(request.method==='GET'){if(!key)return badRequest('QR/kitap anahtarı gereklidir.');const row=await one<any>(env.DB.prepare(`SELECT l.*,c.title content_title,c.grade_level,p.name publisher_name FROM physical_content_links l JOIN physical_content_items c ON c.id=l.content_item_id LEFT JOIN publishers p ON p.id=c.publisher_id WHERE l.external_key=? AND c.active=1`).bind(key));return row?json({ok:true,link:{...row,payload:parseJson(row.payload_json,{})}}):notFound('İçerik bağlantısı bulunamadı.');}if(user.role!=='SUPER_ADMIN')return forbidden();const b=await requestBody(request);if(!b.contentItemId||!b.externalKey)return badRequest('İçerik ve dış anahtar gereklidir.');const id=uuid('phy');await env.DB.prepare(`INSERT INTO physical_content_links(id,content_item_id,page_from,page_to,external_key,reference_type,reference_id,payload_json) VALUES(?,?,?,?,?,?,?,?)`).bind(id,b.contentItemId,b.pageFrom||null,b.pageTo||null,b.externalKey,b.referenceType||'TEST',b.referenceId||null,JSON.stringify(b.payload||{})).run();return json({ok:true,id},201);
}

async function videos(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'VIDEO_LIBRARY');if(gate)return gate;const u=new URL(request.url);if(request.method==='GET'){const rows=await all<any>(env.DB.prepare(`SELECT v.*,s.name subject_name,n.title node_title FROM learning_videos v LEFT JOIN subjects s ON s.id=v.subject_id LEFT JOIN learning_nodes n ON n.id=v.node_id WHERE v.active=1 AND (v.approved=1 OR ?='SUPER_ADMIN') AND (? IS NULL OR v.grade_level=?) AND (? IS NULL OR v.subject_id=?) ORDER BY v.created_at DESC LIMIT 300`).bind(user.role,u.searchParams.get('gradeLevel'),u.searchParams.get('gradeLevel'),u.searchParams.get('subjectId'),u.searchParams.get('subjectId')));return json({ok:true,videos:rows});}if(user.role!=='SUPER_ADMIN')return forbidden();const b=await requestBody(request);if(!b.url||!b.title)return badRequest('Video URL ve başlık gereklidir.');const id=uuid('vid');await env.DB.prepare(`INSERT INTO learning_videos(id,provider,external_id,url,title,grade_level,subject_id,node_id,duration_seconds,approved) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id,b.provider||'YOUTUBE',b.externalId||null,b.url,b.title,b.gradeLevel||null,b.subjectId||null,b.nodeId||null,b.durationSeconds||null,b.approved?1:0).run();return json({ok:true,id},201);
}

export function gameXpForScore(scoreValue:unknown){const score=Math.max(0,Math.min(100,Math.round(Number(scoreValue)||0)));return{score,xp:10+Math.round(score/20)*5}}

async function games(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'GAMES');if(gate)return gate;const u=new URL(request.url);const sid=await scopedStudentId(env,user,u.searchParams.get('studentId'));if(!sid)return forbidden();
  const enrollment=await one<any>(env.DB.prepare(`SELECT grade_level FROM student_enrollments WHERE student_id=? AND status='ACTIVE' ORDER BY created_at DESC LIMIT 1`).bind(sid));const grade=Number(enrollment?.grade_level||0);
  if(request.method==='GET'){
    const profile=await one<any>(env.DB.prepare(`SELECT * FROM gamification_profiles WHERE student_id=?`).bind(sid));const achievements=await all<any>(env.DB.prepare(`SELECT a.*,sa.earned_at FROM student_achievements sa JOIN achievements a ON a.id=sa.achievement_id WHERE sa.student_id=? ORDER BY sa.earned_at DESC`).bind(sid));const catalog=grade?await all<any>(env.DB.prepare(`SELECT game_code code,title,description,game_type,subject_code FROM educational_game_catalog WHERE active=1 AND ? BETWEEN min_grade AND max_grade ORDER BY sort_order,title`).bind(grade)):[];return json({ok:true,profile:profile||{student_id:sid,xp:0,level:1,streak_days:0},achievements,games:catalog});
  }
  const b=await requestBody(request),gameCode=String(b.gameCode||'').trim();const catalog=grade?await one<any>(env.DB.prepare(`SELECT game_code FROM educational_game_catalog WHERE game_code=? AND active=1 AND ? BETWEEN min_grade AND max_grade`).bind(gameCode,grade)):null;if(!catalog)return badRequest('Bu oyun öğrencinin sınıf düzeyi için aktif değil.','GAME_NOT_AVAILABLE');const{score,xp}=gameXpForScore(b.score),duration=Math.max(1,Math.min(3600,Math.round(Number(b.durationSeconds||1))));const id=uuid('game');await env.DB.batch([env.DB.prepare(`INSERT INTO game_sessions(id,student_id,game_code,node_id,score,xp_earned,duration_seconds,payload_json) VALUES(?,?,?,?,?,?,?,?)`).bind(id,sid,gameCode,b.nodeId||null,score,xp,duration,JSON.stringify(b.payload||{})),env.DB.prepare(`INSERT INTO gamification_profiles(student_id,xp,level,streak_days,last_activity_date,updated_at) VALUES(?,?,1,1,date('now'),CURRENT_TIMESTAMP) ON CONFLICT(student_id) DO UPDATE SET xp=xp+excluded.xp,level=1+CAST((xp+excluded.xp)/1000 AS INTEGER),streak_days=CASE WHEN last_activity_date=date('now','-1 day') THEN streak_days+1 WHEN last_activity_date=date('now') THEN streak_days ELSE 1 END,last_activity_date=date('now'),updated_at=CURRENT_TIMESTAMP`).bind(sid,xp)]);return json({ok:true,id,xpEarned:xp,score});
}

async function publishersApi(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'PUBLISHER');if(gate)return gate;const u=new URL(request.url);if(request.method==='GET'&&u.pathname.endsWith('/publishers')){if(user.role!=='SUPER_ADMIN')return forbidden();return json({ok:true,publishers:await all<any>(env.DB.prepare(`SELECT p.*,(SELECT COUNT(*) FROM exam_delivery_profiles e WHERE e.publisher_id=p.id) exam_count FROM publishers p WHERE p.active=1 ORDER BY p.name`))});}
  if(request.method==='POST'&&u.pathname.endsWith('/publishers')){if(user.role!=='SUPER_ADMIN')return forbidden();const b=await requestBody(request);if(!b.name||!b.code)return badRequest('Yayınevi adı ve kodu gereklidir.');const id=uuid('pub');await env.DB.prepare(`INSERT INTO publishers(id,name,code) VALUES(?,?,?)`).bind(id,b.name,String(b.code).toUpperCase()).run();return json({ok:true,id},201);}
  const m=u.pathname.match(/\/publishers\/([^/]+)\/analytics/);if(m){const publisherId=m[1];const allowed=user.role==='SUPER_ADMIN'||!!await one<any>(env.DB.prepare(`SELECT 1 ok FROM publisher_user_access WHERE publisher_id=? AND user_id=? AND active=1`).bind(publisherId,user.id));if(!allowed)return forbidden();const exams=await all<any>(env.DB.prepare(`SELECT e.id,e.title,e.exam_type,e.exam_date,p.result_freeze_status,p.snapshot_version,(SELECT COUNT(*) FROM exam_result_snapshots s WHERE s.exam_id=e.id AND s.snapshot_version=p.snapshot_version) participant_count,(SELECT COUNT(DISTINCT institution_id) FROM exam_result_snapshots s WHERE s.exam_id=e.id AND s.snapshot_version=p.snapshot_version) institution_count FROM exam_delivery_profiles p JOIN exams e ON e.id=p.exam_id WHERE p.publisher_id=? ORDER BY e.exam_date DESC LIMIT 100`).bind(publisherId));return json({ok:true,exams});}
  return notFound();
}

async function admissions(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'ADMISSIONS');if(gate)return gate;if(!['SUPER_ADMIN','INSTITUTION_MANAGER'].includes(user.role))return forbidden();const u=new URL(request.url);const inst=userInstitution(user,u.searchParams.get('institutionId'));
  if(request.method==='GET'){const rows=await all<any>(env.DB.prepare(`SELECT c.*,(SELECT COUNT(*) FROM admissions_candidates a WHERE a.campaign_id=c.id) candidate_count FROM admissions_campaigns c WHERE (? IS NULL OR c.institution_id=?) ORDER BY c.created_at DESC LIMIT 100`).bind(inst,inst));return json({ok:true,campaigns:rows});}const b=await requestBody(request);if(!inst||!b.title||!b.campaignType)return badRequest('Kurum, başlık ve kampanya türü gereklidir.');const id=uuid('adm');await env.DB.prepare(`INSERT INTO admissions_campaigns(id,institution_id,title,campaign_type,exam_id,starts_at,ends_at,status,config_json,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id,inst,b.title,b.campaignType,b.examId||null,b.startsAt||null,b.endsAt||null,b.status||'DRAFT',JSON.stringify(b.config||{}),user.id).run();return json({ok:true,id},201);
}

async function guidance(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'GUIDANCE_TESTS');if(gate)return gate;const u=new URL(request.url);if(request.method==='GET'){const instruments=(await all<any>(env.DB.prepare(`SELECT * FROM guidance_instruments WHERE active=1 ORDER BY title`))).map(x=>({...x,questions:parseJson(x.questions_json,[]),scoring:parseJson(x.scoring_json,{})}));return json({ok:true,instruments});}const b=await requestBody(request);const sid=await scopedStudentId(env,user,b.studentId||null);if(!sid||!b.instrumentId)return badRequest('Öğrenci ve test gereklidir.');const inst=await one<any>(env.DB.prepare(`SELECT * FROM guidance_instruments WHERE id=? AND active=1`).bind(b.instrumentId));if(!inst)return notFound('Test bulunamadı.');const vals=Object.values(b.responses||{}).map(Number).filter(Number.isFinite);const avg=vals.length?vals.reduce((a,c)=>a+c,0)/vals.length:0;const result={score:Math.round(avg*20),answered:vals.length,interpretation:avg>=4?'Güçlü farkındalık':avg>=3?'Gelişen farkındalık':'Desteklenebilir alanlar var'};const id=uuid('grs');await env.DB.prepare(`INSERT INTO guidance_responses(id,instrument_id,student_id,response_json,result_json) VALUES(?,?,?,?,?)`).bind(id,b.instrumentId,sid,JSON.stringify(b.responses||{}),JSON.stringify(result)).run();return json({ok:true,id,result,disclaimer:inst.disclaimer});
}

async function board(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'BOARD');if(gate)return gate;if(!['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role))return forbidden();const u=new URL(request.url);const inst=userInstitution(user,u.searchParams.get('institutionId'));if(request.method==='GET'){const rows=(await all<any>(env.DB.prepare(`SELECT * FROM board_sessions WHERE (? IS NULL OR institution_id=?) AND status<>'ARCHIVED' ORDER BY updated_at DESC LIMIT 100`).bind(inst,inst))).map(r=>({...r,state:parseJson(r.state_json,{})}));return json({ok:true,sessions:rows});}const b=await requestBody(request);if(!inst||!b.title)return badRequest('Kurum ve oturum başlığı gereklidir.');const id=uuid('brd');await env.DB.prepare(`INSERT INTO board_sessions(id,institution_id,class_id,created_by,title,state_json) VALUES(?,?,?,?,?,?)`).bind(id,inst,b.classId||null,user.id,b.title,JSON.stringify(b.state||{})).run();return json({ok:true,id},201);
}

async function campus(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'CAMPUS');if(gate)return gate;const u=new URL(request.url);const inst=userInstitution(user,u.searchParams.get('institutionId'));if(!inst)return badRequest('Kurum gereklidir.');if(!await canManageInstitution(env,user,inst))return forbidden();if(request.method==='GET'){const row=await one<any>(env.DB.prepare(`SELECT * FROM campus_branding WHERE institution_id=?`).bind(inst));return json({ok:true,campus:row||{institution_id:inst,enabled:0},brandingDeferred:true});}const b=await requestBody(request);await env.DB.prepare(`INSERT INTO campus_branding(institution_id,subdomain,custom_domain,primary_color,secondary_color,welcome_text,enabled,updated_at) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(institution_id) DO UPDATE SET subdomain=excluded.subdomain,custom_domain=excluded.custom_domain,primary_color=excluded.primary_color,secondary_color=excluded.secondary_color,welcome_text=excluded.welcome_text,enabled=excluded.enabled,updated_at=CURRENT_TIMESTAMP`).bind(inst,b.subdomain||null,b.customDomain||null,b.primaryColor||null,b.secondaryColor||null,b.welcomeText||null,b.enabled?1:0).run();return json({ok:true,brandingDeferred:true});
}

async function overview(env:Env,user:AuthUser):Promise<Response>{
  const inst=user.institution_id;const counts:any={};for(const [key,sql] of Object.entries({questions:`SELECT COUNT(*) c FROM question_bank WHERE review_status<>'ARCHIVED'`,videos:`SELECT COUNT(*) c FROM learning_videos WHERE active=1`,recovery:`SELECT COUNT(*) c FROM recovery_plans WHERE status='ACTIVE'`,studio:`SELECT COUNT(*) c FROM studio_documents WHERE status<>'ARCHIVED'`,networks:`SELECT COUNT(*) c FROM institution_networks WHERE active=1`,publishers:`SELECT COUNT(*) c FROM publishers WHERE active=1`})){const r=await one<any>(env.DB.prepare(sql));counts[key]=Number(r?.c||0);}return json({ok:true,counts,institutionId:inst,externalPending:{whatsapp:true,appStores:true,liveMeetingProvider:true,finalBranding:true}});
}

export async function handlePlatformApi(request:Request,env:Env,user:AuthUser):Promise<Response|null>{
  const u=new URL(request.url),p=u.pathname;
  if(!p.startsWith('/api/platform/'))return null;
  if(p==='/api/platform/overview'&&request.method==='GET')return overview(env,user);
  if(p==='/api/platform/features'&&request.method==='GET')return listFeatures(env,user);
  if(p==='/api/platform/features'&&request.method==='PUT')return setFeature(request,env,user);

  if(p==='/api/platform/exam-center/catalog'&&request.method==='GET')return listExamCatalog(request,env,user);
  if(p==='/api/platform/exam-center/catalog'&&request.method==='POST')return createCatalogExam(request,env,user);
  let m=p.match(/^\/api\/platform\/exam-center\/([^/]+)\/profile$/);if(m&&request.method==='PUT')return updateExamProfile(request,env,user,m[1]);
  m=p.match(/^\/api\/platform\/exam-center\/([^/]+)\/freeze$/);if(m&&request.method==='POST')return freezeExam(env,user,m[1]);
  m=p.match(/^\/api\/platform\/exam-center\/([^/]+)\/publish$/);if(m&&request.method==='POST')return publishExam(env,user,m[1]);
  m=p.match(/^\/api\/platform\/exam-center\/([^/]+)\/stats$/);if(m&&request.method==='GET')return examStats(env,user,m[1]);
  m=p.match(/^\/api\/platform\/exam-center\/([^/]+)\/result$/);if(m&&request.method==='GET')return studentExamResult(request,env,user,m[1]);

  if(p==='/api/platform/networks'&&request.method==='GET')return listNetworks(env,user);
  if(p==='/api/platform/networks'&&request.method==='POST')return createNetwork(request,env,user);
  m=p.match(/^\/api\/platform\/networks\/([^/]+)\/members$/);if(m&&request.method==='POST')return addNetworkMember(request,env,user,m[1]);
  m=p.match(/^\/api\/platform\/networks\/([^/]+)\/dashboard$/);if(m&&request.method==='GET')return networkDashboard(env,user,m[1]);

  if(p==='/api/platform/questions'&&request.method==='GET')return listQuestions(request,env,user);
  if(p==='/api/platform/questions'&&request.method==='POST')return createQuestion(request,env,user);
  if(p==='/api/platform/learning-state'&&request.method==='GET')return learningState(request,env,user);
  if(p==='/api/platform/learning-evidence'&&request.method==='POST')return addLearningEvidence(request,env,user);
  if(p==='/api/platform/assignments'&&request.method==='GET')return listAssignments(request,env,user);
  if(p==='/api/platform/assignments'&&request.method==='POST')return createAssignment(request,env,user);
  if(p==='/api/platform/recovery'&&request.method==='GET')return listRecovery(request,env,user);
  if(p==='/api/platform/recovery/generate'&&request.method==='POST')return generateRecovery(request,env,user);
  if(p==='/api/platform/rba'&&(request.method==='GET'||request.method==='POST'))return rba(request,env,user);
  if(p==='/api/platform/membership'&&request.method==='GET')return membership(request,env,user);
  if(p==='/api/platform/membership/grant'&&request.method==='POST')return grantMembership(request,env,user);
  if(p==='/api/platform/live'&&(request.method==='GET'||request.method==='POST'))return liveSessions(request,env,user);
  if(p==='/api/platform/studio'&&(request.method==='GET'||request.method==='POST'))return studio(request,env,user);
  if(p==='/api/platform/physical'&&(request.method==='GET'||request.method==='POST'))return physicalBridge(request,env,user);
  if(p==='/api/platform/videos'&&(request.method==='GET'||request.method==='POST'))return videos(request,env,user);
  if(p==='/api/platform/games'&&(request.method==='GET'||request.method==='POST'))return games(request,env,user);
  if(p.startsWith('/api/platform/publishers'))return publishersApi(request,env,user);
  if(p==='/api/platform/admissions'&&(request.method==='GET'||request.method==='POST'))return admissions(request,env,user);
  if(p==='/api/platform/guidance'&&(request.method==='GET'||request.method==='POST'))return guidance(request,env,user);
  if(p==='/api/platform/board'&&(request.method==='GET'||request.method==='POST'))return board(request,env,user);
  if(p==='/api/platform/campus'&&(request.method==='GET'||request.method==='PUT'))return campus(request,env,user);
  return json({ok:false,error:{code:'NOT_FOUND',message:'Platform API yolu bulunamadı.'}},404);
}
