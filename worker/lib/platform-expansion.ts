import type { AuthUser, Env } from '../types';
import { all, audit, badRequest, forbidden, json, notFound, one, uuid } from './db';
import { rightsBasisForCopyright } from './content-source-policy';

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

type TeacherContentScope=Array<{subject_id:string;grade_level:number}>;
async function teacherContentScope(env:Env,user:AuthUser):Promise<TeacherContentScope|null>{
  if(user.role!=='TEACHER')return null;
  return all<TeacherContentScope[number]>(env.DB.prepare(`SELECT DISTINCT ta.subject_id,c.grade_level FROM teacher_assignments ta JOIN classes c ON c.id=ta.class_id JOIN institution_seasons se ON se.id=ta.season_id WHERE ta.user_id=? AND ta.institution_id=? AND c.institution_id=ta.institution_id AND se.institution_id=ta.institution_id AND ta.assignment_type='SUBJECT' AND ta.subject_id IS NOT NULL AND ta.active=1 AND c.active=1 AND se.status='ACTIVE'`).bind(user.id,user.institution_id));
}
function teacherContentAllowed(scope:TeacherContentScope|null,subjectId:string,gradeLevel:number){return scope===null||scope.some(row=>row.subject_id===subjectId&&Number(row.grade_level)===gradeLevel)}

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

type NetworkAccess = { role: 'SUPER_ADMIN'|'NETWORK_ADMIN'|'NETWORK_VIEWER'; scopeUnitId: string|null };

async function networkAccess(env:Env,user:AuthUser,networkId:string):Promise<NetworkAccess|null>{
  if(user.role==='SUPER_ADMIN')return{role:'SUPER_ADMIN',scopeUnitId:null};
  const row=await one<any>(env.DB.prepare(`SELECT role,scope_unit_id FROM network_user_roles WHERE network_id=? AND user_id=? AND active=1`).bind(networkId,user.id));
  return row?{role:row.role,scopeUnitId:row.scope_unit_id||null}:null;
}

async function accessibleNetworkUnit(env:Env,networkId:string,rootUnitId:string|null,requestedUnitId:string|null):Promise<string|null|false>{
  const effective=requestedUnitId||rootUnitId;
  if(!effective)return null;
  const row=await one<any>(env.DB.prepare(`WITH RECURSIVE permitted(id) AS (
    SELECT id FROM network_units WHERE id=? AND network_id=? AND active=1
    UNION ALL SELECT u.id FROM network_units u JOIN permitted p ON u.parent_unit_id=p.id WHERE u.network_id=? AND u.active=1
  ) SELECT id FROM permitted WHERE id=? LIMIT 1`).bind(rootUnitId||effective,networkId,networkId,effective));
  return row?effective:false;
}

export function networkPercent(numerator:unknown,denominator:unknown):number{
  const n=Number(numerator||0),d=Number(denominator||0);return d>0?Math.round((n/d)*1000)/10:0;
}

function csvValue(value:unknown):string{
  let text=String(value??'');
  if(/^[=+\-@]/.test(text))text=`'${text}`;
  return `"${text.replace(/"/g,'""')}"`;
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
  const can=await canManageExam(env,user,p); if(!can&&user.role!=='TEACHER'&&user.role!=='GUIDANCE_TEACHER')return forbidden();
  const version=Number(p.snapshot_version||0); if(!version)return json({ok:true,profile:p,stats:null,cities:[],institutions:[]});
  const stats=await one<any>(env.DB.prepare(`SELECT * FROM exam_publication_stats WHERE exam_id=? AND snapshot_version=?`).bind(examId,version));
  const cities=await all<any>(env.DB.prepare(`SELECT COALESCE(city,'Belirtilmemiş') city,COUNT(*) participant_count,AVG(net) avg_net,AVG(score) avg_score FROM exam_result_snapshots WHERE exam_id=? AND snapshot_version=? GROUP BY city ORDER BY participant_count DESC LIMIT 100`).bind(examId,version));
  const institutions=await all<any>(env.DB.prepare(`SELECT i.id,i.name,i.city,i.district,COUNT(*) participant_count,AVG(s.net) avg_net,AVG(s.score) avg_score FROM exam_result_snapshots s JOIN institutions i ON i.id=s.institution_id WHERE s.exam_id=? AND s.snapshot_version=? GROUP BY i.id,i.name,i.city,i.district ORDER BY participant_count DESC LIMIT 500`).bind(examId,version));
  return json({ok:true,profile:p,stats,cities,institutions});
}

async function studentExamResult(request:Request,env:Env,user:AuthUser,examId:string):Promise<Response>{
  const url=new URL(request.url); const requested=url.searchParams.get('studentId'); const studentId=await scopedStudentId(env,user,requested);
  if(!studentId)return forbidden('Bu öğrenci sonucuna erişemezsiniz.');
  const p=await examProfile(env,examId); if(!p)return notFound();
  if(p.result_freeze_status!=='PUBLISHED'&&user.role!=='SUPER_ADMIN'&&user.role!=='INSTITUTION_MANAGER')return badRequest('Sonuçlar henüz yayınlanmadı.','RESULTS_NOT_PUBLISHED');
  const snap=await one<any>(env.DB.prepare(`SELECT s.*,i.name institution_name,e.title exam_title,e.exam_type FROM exam_result_snapshots s JOIN institutions i ON i.id=s.institution_id JOIN exams e ON e.id=s.exam_id WHERE s.exam_id=? AND s.student_id=? AND s.snapshot_version=? LIMIT 1`).bind(examId,studentId,p.snapshot_version));
  if(!snap)return notFound('Öğrencinin bu sınav için yayınlanmış sonucu yok.');
  const subjects=await all<any>(env.DB.prepare(`SELECT sub.name subject,sr.correct_count,sr.wrong_count,sr.blank_count,sr.net,sr.success_percent FROM subject_results sr JOIN subjects sub ON sub.id=sr.subject_id WHERE sr.participant_id=? ORDER BY sub.name`).bind(snap.participant_id));
  return json({ok:true,profile:p,result:{...snap,subjects,rankingLabel:p.scope==='CENTRAL'?'Türkiye geneli sınav katılımcıları arasında':p.scope==='NETWORK'?'Kurum ağı katılımcıları arasında':'Kurum katılımcıları arasında'}});
}

async function listNetworks(env:Env,user:AuthUser):Promise<Response>{
  const where=user.role==='SUPER_ADMIN'?'1=1':`n.id IN (SELECT network_id FROM network_user_roles WHERE user_id=? AND active=1)`;
  const stmt=env.DB.prepare(`SELECT n.*,(SELECT COUNT(*) FROM institution_network_members m WHERE m.network_id=n.id AND m.active=1) institution_count FROM institution_networks n WHERE n.active=1 AND ${where} ORDER BY n.name`);
  const rows=user.role==='SUPER_ADMIN'?await all<any>(stmt):await all<any>(stmt.bind(user.id));
  return json({ok:true,networks:rows});
}

async function createNetwork(request:Request,env:Env,user:AuthUser):Promise<Response>{
  if(user.role!=='SUPER_ADMIN')return forbidden(); const b=await requestBody(request); if(!b.name||!b.code)return badRequest('Ağ adı ve kodu gereklidir.'); const id=uuid('net');
  const headquartersId=b.headquartersInstitutionId||null,unitId=headquartersId?uuid('nunit'):null;
  const statements=[env.DB.prepare(`INSERT INTO institution_networks(id,name,code,headquarters_institution_id) VALUES(?,?,?,?)`).bind(id,String(b.name).trim(),String(b.code).trim().toUpperCase(),headquartersId)];
  if(headquartersId){
    const institution=await one<any>(env.DB.prepare(`SELECT id,name,code,city,district FROM institutions WHERE id=?`).bind(headquartersId));if(!institution)return badRequest('Merkez kurum bulunamadı.');
    statements.push(env.DB.prepare(`INSERT INTO network_units(id,network_id,unit_type,institution_id,name,code,city,district) VALUES(?,?,'HEADQUARTERS',?,?,?,?,?)`).bind(unitId,id,headquartersId,institution.name,`HQ-${institution.code}`,institution.city||null,institution.district||null));
    statements.push(env.DB.prepare(`INSERT INTO institution_network_members(network_id,institution_id,region_label,active,unit_id) VALUES(?,?,?,1,?)`).bind(id,headquartersId,'Merkez',unitId));
  }
  await env.DB.batch(statements);
  await audit(env.DB,user.id,headquartersId,'NETWORK_CREATED','institution_network',id,{code:String(b.code).trim().toUpperCase(),headquartersInstitutionId:headquartersId});
  return json({ok:true,id},201);
}

async function addNetworkMember(request:Request,env:Env,user:AuthUser,networkId:string):Promise<Response>{
  const access=await networkAccess(env,user,networkId);if(!access||access.role==='NETWORK_VIEWER')return forbidden(); const b=await requestBody(request); if(!b.institutionId)return badRequest('Kurum seçin.');
  if(access.scopeUnitId&&!b.unitId)return badRequest('Sınırlı zincir yöneticisi kurumu kendi hiyerarşi kapsamındaki birime bağlamalıdır.');
  if(b.unitId&&await accessibleNetworkUnit(env,networkId,access.scopeUnitId,b.unitId)===false)return forbidden('Seçilen birim yetki kapsamınızda değil.');
  const institution=await one<any>(env.DB.prepare(`SELECT id FROM institutions WHERE id=? AND status='ACTIVE'`).bind(b.institutionId));if(!institution)return badRequest('Aktif kurum bulunamadı.');
  if(b.unitId){const unit=await one<any>(env.DB.prepare(`SELECT id,institution_id FROM network_units WHERE id=? AND network_id=? AND active=1`).bind(b.unitId,networkId));if(!unit)return badRequest('Seçilen hiyerarşi birimi bu zincire ait değil.');if(unit.institution_id&&unit.institution_id!==b.institutionId)return badRequest('Bu birim başka bir kuruma bağlı.');}
  const statements=[env.DB.prepare(`INSERT INTO institution_network_members(network_id,institution_id,region_label,active,unit_id) VALUES(?,?,?,1,?) ON CONFLICT(network_id,institution_id) DO UPDATE SET region_label=excluded.region_label,unit_id=excluded.unit_id,active=1`).bind(networkId,b.institutionId,b.regionLabel||null,b.unitId||null)];
  if(b.unitId)statements.push(env.DB.prepare(`UPDATE network_units SET institution_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND network_id=?`).bind(b.institutionId,b.unitId,networkId));
  await env.DB.batch(statements);
  await audit(env.DB,user.id,b.institutionId,'NETWORK_MEMBER_UPSERTED','institution_network',networkId,{unitId:b.unitId||null,regionLabel:b.regionLabel||null});
  return json({ok:true});
}

async function updateNetworkMember(request:Request,env:Env,user:AuthUser,networkId:string,institutionId:string):Promise<Response>{
  const access=await networkAccess(env,user,networkId);if(!access||access.role==='NETWORK_VIEWER')return forbidden();const b=await requestBody(request);
  const current=await one<any>(env.DB.prepare(`SELECT unit_id FROM institution_network_members WHERE network_id=? AND institution_id=? AND active=1`).bind(networkId,institutionId));if(!current)return notFound('Zincir kurumu bulunamadı.');
  if(access.scopeUnitId&&(!current.unit_id||await accessibleNetworkUnit(env,networkId,access.scopeUnitId,current.unit_id)===false))return forbidden('Bu kurum yetki kapsamınızda değil.');
  if(request.method==='DELETE'){
    const network=await one<any>(env.DB.prepare(`SELECT headquarters_institution_id FROM institution_networks WHERE id=?`).bind(networkId));if(network?.headquarters_institution_id===institutionId)return badRequest('Merkez kurum zincirden çıkarılamaz.');
    await env.DB.prepare(`UPDATE institution_network_members SET active=0 WHERE network_id=? AND institution_id=?`).bind(networkId,institutionId).run();
    await audit(env.DB,user.id,institutionId,'NETWORK_MEMBER_DEACTIVATED','institution_network',networkId,{});return json({ok:true});
  }
  if(b.unitId){const unit=await one<any>(env.DB.prepare(`SELECT id FROM network_units WHERE id=? AND network_id=? AND active=1`).bind(b.unitId,networkId));if(!unit)return badRequest('Seçilen hiyerarşi birimi bu zincire ait değil.');if(await accessibleNetworkUnit(env,networkId,access.scopeUnitId,b.unitId)===false)return forbidden('Hedef birim yetki kapsamınızda değil.');}
  await env.DB.prepare(`UPDATE institution_network_members SET unit_id=?,region_label=? WHERE network_id=? AND institution_id=? AND active=1`).bind(b.unitId||null,b.regionLabel||null,networkId,institutionId).run();
  await audit(env.DB,user.id,institutionId,'NETWORK_MEMBER_UPDATED','institution_network',networkId,{unitId:b.unitId||null,regionLabel:b.regionLabel||null});return json({ok:true});
}

async function networkUnits(request:Request,env:Env,user:AuthUser,networkId:string):Promise<Response>{
  const access=await networkAccess(env,user,networkId);if(!access)return forbidden();
  if(request.method==='GET'){const scope=await accessibleNetworkUnit(env,networkId,access.scopeUnitId,new URL(request.url).searchParams.get('unitId'));if(scope===false)return forbidden('Bu hiyerarşi birimine erişemezsiniz.');const rows=await all<any>(env.DB.prepare(`WITH RECURSIVE visible(id) AS (SELECT ? UNION ALL SELECT u.id FROM network_units u JOIN visible v ON u.parent_unit_id=v.id WHERE u.network_id=? AND u.active=1) SELECT * FROM network_units WHERE network_id=? AND active=1 AND (? IS NULL OR id IN (SELECT id FROM visible)) ORDER BY sort_order,unit_type,name`).bind(scope,networkId,networkId,scope));return json({ok:true,units:rows});}
  if(access.role==='NETWORK_VIEWER')return forbidden();const b=await requestBody(request),type=String(b.unitType||'').toUpperCase();if(!b.name||!b.code||!['HEADQUARTERS','REGION','PROVINCE','DISTRICT','CAMPUS'].includes(type))return badRequest('Birim adı, kodu ve geçerli tür gereklidir.');
  if(access.scopeUnitId&&!b.parentUnitId)return badRequest('Sınırlı zincir yöneticisi yeni birimi kendi kapsamının altında oluşturmalıdır.');
  if(b.parentUnitId){const permitted=await accessibleNetworkUnit(env,networkId,access.scopeUnitId,b.parentUnitId);if(permitted===false)return forbidden('Üst birim yetki kapsamınızda değil.');}
  const id=uuid('nunit');await env.DB.prepare(`INSERT INTO network_units(id,network_id,parent_unit_id,unit_type,name,code,city,district,sort_order) VALUES(?,?,?,?,?,?,?,?,?)`).bind(id,networkId,b.parentUnitId||null,type,String(b.name).trim(),String(b.code).trim().toUpperCase(),b.city||null,b.district||null,Number(b.sortOrder||0)).run();
  await audit(env.DB,user.id,user.institution_id,'NETWORK_UNIT_CREATED','network_unit',id,{networkId,type,parentUnitId:b.parentUnitId||null});return json({ok:true,id},201);
}

async function networkRoles(request:Request,env:Env,user:AuthUser,networkId:string):Promise<Response>{
  const access=await networkAccess(env,user,networkId);if(!access||access.role==='NETWORK_VIEWER')return forbidden();
  if(request.method==='GET'){const rows=await all<any>(env.DB.prepare(`WITH RECURSIVE visible(id) AS (SELECT ? UNION ALL SELECT nu.id FROM network_units nu JOIN visible v ON nu.parent_unit_id=v.id WHERE nu.network_id=? AND nu.active=1) SELECT r.network_id,r.user_id,r.role,r.scope_unit_id,r.active,u.display_name,u.email,i.name institution_name,nu.name scope_name FROM network_user_roles r JOIN users u ON u.id=r.user_id LEFT JOIN institutions i ON i.id=u.institution_id LEFT JOIN network_units nu ON nu.id=r.scope_unit_id WHERE r.network_id=? AND r.active=1 AND (? IS NULL OR r.scope_unit_id IN (SELECT id FROM visible)) ORDER BY r.role,u.display_name`).bind(access.scopeUnitId,networkId,networkId,access.scopeUnitId));return json({ok:true,roles:rows});}
  const b=await requestBody(request),role=String(b.role||'NETWORK_VIEWER').toUpperCase();if(!b.userId||!['NETWORK_ADMIN','NETWORK_VIEWER'].includes(role))return badRequest('Kullanıcı ve geçerli zincir rolü gereklidir.');
  const candidate=await one<any>(env.DB.prepare(`SELECT id,institution_id,role FROM users WHERE id=? AND active=1`).bind(b.userId));if(!candidate||!['SUPER_ADMIN','INSTITUTION_MANAGER'].includes(candidate.role))return badRequest('Zincir rolü yalnız aktif yönetici hesabına verilebilir.');
  if(user.role!=='SUPER_ADMIN'&&candidate.institution_id){const member=await one<any>(env.DB.prepare(`SELECT unit_id FROM institution_network_members WHERE network_id=? AND institution_id=? AND active=1`).bind(networkId,candidate.institution_id));if(!member)return forbidden('Yalnız zincir içindeki kurum yöneticilerine rol verebilirsiniz.');if(access.scopeUnitId&&(!member.unit_id||await accessibleNetworkUnit(env,networkId,access.scopeUnitId,member.unit_id)===false))return forbidden('Kullanıcının kurumu yetki kapsamınızda değil.');}
  if(access.scopeUnitId&&!b.scopeUnitId)return badRequest('Sınırlı zincir yöneticisi rol kapsamı seçmelidir.');
  if(b.scopeUnitId){const permitted=await accessibleNetworkUnit(env,networkId,access.scopeUnitId,b.scopeUnitId);if(permitted===false)return forbidden('Rol kapsamı yetkinizin dışında.');}
  await env.DB.prepare(`INSERT INTO network_user_roles(network_id,user_id,role,active,scope_unit_id) VALUES(?,?,?,1,?) ON CONFLICT(network_id,user_id) DO UPDATE SET role=excluded.role,scope_unit_id=excluded.scope_unit_id,active=1`).bind(networkId,b.userId,role,b.scopeUnitId||null).run();
  await audit(env.DB,user.id,candidate.institution_id,'NETWORK_ROLE_GRANTED','institution_network',networkId,{targetUserId:b.userId,role,scopeUnitId:b.scopeUnitId||null});return json({ok:true});
}

async function networkDashboard(request:Request,env:Env,user:AuthUser,networkId:string):Promise<Response>{
  const access=await networkAccess(env,user,networkId);if(!access)return forbidden();
  const network=await one<any>(env.DB.prepare(`SELECT * FROM institution_networks WHERE id=?`).bind(networkId)); if(!network)return notFound();
  const url=new URL(request.url),requestedUnit=url.searchParams.get('unitId'),scope=await accessibleNetworkUnit(env,networkId,access.scopeUnitId,requestedUnit);if(scope===false)return forbidden('Bu rapor kapsamına erişemezsiniz.');
  const from=url.searchParams.get('from'),to=url.searchParams.get('to');
  const units=await all<any>(env.DB.prepare(`WITH RECURSIVE visible(id) AS (SELECT ? UNION ALL SELECT u.id FROM network_units u JOIN visible v ON u.parent_unit_id=v.id WHERE u.network_id=? AND u.active=1) SELECT id,parent_unit_id,unit_type,institution_id,name,code,city,district,sort_order FROM network_units WHERE network_id=? AND active=1 AND (? IS NULL OR id IN (SELECT id FROM visible)) ORDER BY sort_order,unit_type,name`).bind(scope,networkId,networkId,scope));
  const institutions=await all<any>(env.DB.prepare(`WITH RECURSIVE visible(id) AS (SELECT ? UNION ALL SELECT u.id FROM network_units u JOIN visible v ON u.parent_unit_id=v.id WHERE u.network_id=? AND u.active=1), members AS (SELECT m.* FROM institution_network_members m WHERE m.network_id=? AND m.active=1 AND (? IS NULL OR m.unit_id IN (SELECT id FROM visible))) SELECT i.id,i.name,i.code,i.city,i.district,i.status,m.region_label,m.unit_id,nu.name unit_name,nu.unit_type,
    (SELECT COUNT(*) FROM student_enrollments se WHERE se.institution_id=i.id AND se.status='ACTIVE') active_students,
    (SELECT COUNT(*) FROM exam_participants ep WHERE ep.institution_id=i.id AND ep.participant_status='GUEST' AND (? IS NULL OR date(ep.created_at)>=date(?)) AND (? IS NULL OR date(ep.created_at)<=date(?))) guest_students,
    (SELECT COUNT(*) FROM exam_participants ep WHERE ep.institution_id=i.id AND (? IS NULL OR date(ep.created_at)>=date(?)) AND (? IS NULL OR date(ep.created_at)<=date(?))) participant_count,
    (SELECT ROUND(AVG(er.net),2) FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id WHERE ep.institution_id=i.id AND (? IS NULL OR date(ep.created_at)>=date(?)) AND (? IS NULL OR date(ep.created_at)<=date(?))) avg_net,
    (SELECT ROUND(AVG(er.success_percent),1) FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id WHERE ep.institution_id=i.id AND (? IS NULL OR date(ep.created_at)>=date(?)) AND (? IS NULL OR date(ep.created_at)<=date(?))) avg_success,
    (SELECT COUNT(*) FROM attendance_records ar JOIN attendance_sessions ats ON ats.id=ar.session_id WHERE ats.institution_id=i.id AND ar.attendance_status IN ('PRESENT','LATE') AND (? IS NULL OR date(ats.attendance_date)>=date(?)) AND (? IS NULL OR date(ats.attendance_date)<=date(?))) attendance_present,
    (SELECT COUNT(*) FROM attendance_records ar JOIN attendance_sessions ats ON ats.id=ar.session_id WHERE ats.institution_id=i.id AND (? IS NULL OR date(ats.attendance_date)>=date(?)) AND (? IS NULL OR date(ats.attendance_date)<=date(?))) attendance_total,
    (SELECT COUNT(*) FROM assignment_recipients ar JOIN assignments a ON a.id=ar.assignment_id WHERE a.institution_id=i.id AND ar.status='COMPLETED' AND (? IS NULL OR date(a.created_at)>=date(?)) AND (? IS NULL OR date(a.created_at)<=date(?))) assignment_completed,
    (SELECT COUNT(*) FROM assignment_recipients ar JOIN assignments a ON a.id=ar.assignment_id WHERE a.institution_id=i.id AND (? IS NULL OR date(a.created_at)>=date(?)) AND (? IS NULL OR date(a.created_at)<=date(?))) assignment_total,
    (SELECT COUNT(*) FROM recovery_plans rp WHERE rp.institution_id=i.id AND rp.status='ACTIVE') active_recovery
    FROM members m JOIN institutions i ON i.id=m.institution_id LEFT JOIN network_units nu ON nu.id=m.unit_id ORDER BY i.city,i.district,i.name`).bind(scope,networkId,networkId,scope,from,from,to,to,from,from,to,to,from,from,to,to,from,from,to,to,from,from,to,to,from,from,to,to,from,from,to,to,from,from,to,to));
  const branches=institutions.map(x=>({...x,active_students:Number(x.active_students||0),guest_students:Number(x.guest_students||0),participant_count:Number(x.participant_count||0),avg_net:Number(x.avg_net||0),avg_success:Number(x.avg_success||0),attendance_rate:networkPercent(x.attendance_present,x.attendance_total),assignment_completion_rate:networkPercent(x.assignment_completed,x.assignment_total),active_recovery:Number(x.active_recovery||0)}));
  const totals={institution_count:branches.length,active_students:branches.reduce((s,x)=>s+x.active_students,0),guest_students:branches.reduce((s,x)=>s+x.guest_students,0),participant_count:branches.reduce((s,x)=>s+x.participant_count,0),attendance_rate:networkPercent(branches.reduce((s,x)=>s+Number(x.attendance_present||0),0),branches.reduce((s,x)=>s+Number(x.attendance_total||0),0)),assignment_completion_rate:networkPercent(branches.reduce((s,x)=>s+Number(x.assignment_completed||0),0),branches.reduce((s,x)=>s+Number(x.assignment_total||0),0)),active_recovery:branches.reduce((s,x)=>s+x.active_recovery,0)};
  const exams=await all<any>(env.DB.prepare(`SELECT e.id,e.title,e.exam_type,p.result_freeze_status,p.snapshot_version,p.published_at,(SELECT COUNT(*) FROM exam_result_snapshots s WHERE s.exam_id=e.id AND s.snapshot_version=p.snapshot_version) participant_count FROM exam_delivery_profiles p JOIN exams e ON e.id=p.exam_id WHERE p.network_id=? ORDER BY e.exam_date DESC,e.created_at DESC LIMIT 100`).bind(networkId));
  const roleCandidates=access.role==='NETWORK_VIEWER'?[]:await all<any>(env.DB.prepare(`WITH RECURSIVE visible(id) AS (SELECT ? UNION ALL SELECT nu.id FROM network_units nu JOIN visible v ON nu.parent_unit_id=v.id WHERE nu.network_id=? AND nu.active=1) SELECT DISTINCT u.id,u.display_name,u.email,u.institution_id,i.name institution_name FROM users u LEFT JOIN institutions i ON i.id=u.institution_id WHERE u.active=1 AND u.role IN ('SUPER_ADMIN','INSTITUTION_MANAGER') AND (u.role='SUPER_ADMIN' OR u.institution_id IN (SELECT institution_id FROM institution_network_members WHERE network_id=? AND active=1)) AND (? IS NULL OR u.institution_id IN (SELECT institution_id FROM institution_network_members WHERE network_id=? AND active=1 AND unit_id IN (SELECT id FROM visible))) ORDER BY u.display_name LIMIT 500`).bind(scope,networkId,networkId,scope,networkId));
  return json({ok:true,network,permission:{role:access.role,canManage:access.role!=='NETWORK_VIEWER',scopeUnitId:access.scopeUnitId},filters:{unitId:scope,from,to},totals,units,institutions:branches,exams,roleCandidates});
}

async function networkExport(request:Request,env:Env,user:AuthUser,networkId:string):Promise<Response>{
  const response=await networkDashboard(request,env,user,networkId);if(!response.ok)return response;const data:any=await response.json();
  const header=['Kurum','Kurum Kodu','Şehir','İlçe','Birim','Aktif Öğrenci','Misafir Öğrenci','Sınav Katılımı','Ortalama Net','Başarı %','Devam %','Ödev Tamamlama %','Aktif Sıfır Hata'];
  const lines=[header.map(csvValue).join(';'),...data.institutions.map((x:any)=>[x.name,x.code,x.city,x.district,x.unit_name,x.active_students,x.guest_students,x.participant_count,x.avg_net,x.avg_success,x.attendance_rate,x.assignment_completion_rate,x.active_recovery].map(csvValue).join(';'))];
  await audit(env.DB,user.id,user.institution_id,'NETWORK_REPORT_EXPORTED','institution_network',networkId,{unitId:data.filters.unitId||null,from:data.filters.from||null,to:data.filters.to||null,rowCount:data.institutions.length});
  return new Response(`\uFEFF${lines.join('\r\n')}`,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${String(data.network.code).replace(/[^A-Za-z0-9_-]/g,'_')}-yonetim-raporu.csv"`,'Cache-Control':'no-store'}});
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
  await audit(env.DB,user.id,b.institutionId,'INSTITUTION_FEATURE_UPDATED','institution_feature_override',String(b.featureKey),{enabled:Boolean(b.enabled)});
  return json({ok:true});
}

async function listQuestions(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'QUESTION_BANK'); if(gate)return gate;if(!['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role))return forbidden(); const u=new URL(request.url); const grade=u.searchParams.get('gradeLevel'); const subject=u.searchParams.get('subjectId'); const q=u.searchParams.get('q');
  const wh=[`q.review_status<>'ARCHIVED'`],ps:any[]=[]; if(grade){wh.push('q.grade_level=?');ps.push(Number(grade));} if(subject){wh.push('q.subject_id=?');ps.push(subject);} if(q){wh.push('(q.stem_text LIKE ? OR q.topic LIKE ? OR q.subtopic LIKE ?)');const s=`%${q}%`;ps.push(s,s,s);}
  if(user.role!=='SUPER_ADMIN') { wh.push(`(q.owner_type='PLATFORM' OR (q.owner_type='INSTITUTION' AND q.owner_id=?))`); ps.push(user.institution_id); }
  const scope=await teacherContentScope(env,user);if(scope!==null){if(!scope.length)return json({ok:true,questions:[]});wh.push(`(${scope.map(()=>'(q.subject_id=? AND q.grade_level=?)').join(' OR ')})`);for(const row of scope)ps.push(row.subject_id,row.grade_level)}
  const rows=await all<any>(env.DB.prepare(`SELECT q.*,s.name subject_name,(SELECT verification_status FROM question_provenance_records p WHERE p.question_id=q.id ORDER BY p.created_at DESC LIMIT 1) rights_verification_status FROM question_bank q LEFT JOIN subjects s ON s.id=q.subject_id WHERE ${wh.join(' AND ')} ORDER BY q.created_at DESC LIMIT 300`).bind(...ps));
  return json({ok:true,questions:rows.map(r=>({...r,options:parseJson(r.options_json,[])}))});
}

async function contentOptions(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'QUESTION_BANK');if(gate)return gate;if(!['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role))return forbidden();const u=new URL(request.url);const grade=Number(u.searchParams.get('gradeLevel')||0),subjectId=String(u.searchParams.get('subjectId')||'');
  const scope=await teacherContentScope(env,user),allowedSubjects=scope===null?null:new Set(scope.map(row=>row.subject_id));
  const subjects=(await all<any>(env.DB.prepare(`SELECT id,code,name,category FROM subjects WHERE active=1 ORDER BY name`))).filter(row=>allowedSubjects===null||allowedSubjects.has(row.id));
  const nodes=grade&&subjectId&&teacherContentAllowed(scope,subjectId,grade)?await all<any>(env.DB.prepare(`SELECT id,code,title,node_type,parent_id FROM learning_nodes WHERE active=1 AND grade_level=? AND subject_id=? AND node_type IN ('TOPIC','SUBTOPIC','OUTCOME','SKILL') ORDER BY node_type,title LIMIT 600`).bind(grade,subjectId)):[];
  const institutions=user.role==='SUPER_ADMIN'?await all<any>(env.DB.prepare(`SELECT id,name FROM institutions WHERE status<>'ARCHIVED' ORDER BY name LIMIT 500`)):[];
  return json({ok:true,subjects,nodes,institutions,subjectGrades:scope||null,canCreate:['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role),canReview:user.role==='SUPER_ADMIN'});
}

async function createQuestion(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'QUESTION_BANK');if(gate)return gate; if(!['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role))return forbidden(); const b=await requestBody(request); if(!String(b.stemText||'').trim())return badRequest('Soru metni gereklidir.');
  const subject=await one<any>(env.DB.prepare(`SELECT id FROM subjects WHERE id=? AND active=1`).bind(b.subjectId||''));if(!subject)return badRequest('Geçerli bir ders seçin.');
  const grade=Math.round(Number(b.gradeLevel||0));if(grade<1||grade>12)return badRequest('Sınıf düzeyi 1 ile 12 arasında olmalıdır.');
  if(!teacherContentAllowed(await teacherContentScope(env,user),String(b.subjectId),grade))return forbidden('Yalnız aktif sınıf ve branş atamanızdaki soruları ekleyebilirsiniz.');
  const copyright=String(b.copyrightStatus||'').toUpperCase();if(!['OWNED','LICENSED','PUBLIC_DOMAIN','USER_PROVIDED','RESTRICTED'].includes(copyright))return badRequest('Geçerli bir telif durumu seçin.');
  const sourceLabel=String(b.sourceLabel||'').trim();if(!sourceLabel)return badRequest('İçeriğin kaynağını belirtin.');
  const nodeIds=Array.isArray(b.nodeIds)?[...new Set(b.nodeIds.map(String).filter(Boolean))]:[];
  if(nodeIds.length){const marks=nodeIds.map(()=>'?').join(',');const valid=await all<any>(env.DB.prepare(`SELECT id FROM learning_nodes WHERE active=1 AND grade_level=? AND subject_id=? AND id IN (${marks})`).bind(grade,b.subjectId,...nodeIds));if(valid.length!==nodeIds.length)return badRequest('Seçilen kazanımlardan biri ders veya sınıfla uyuşmuyor.');}
  if(b.sourceUrl){let source:URL;try{source=new URL(String(b.sourceUrl))}catch{return badRequest('Geçerli bir kaynak bağlantısı girin.')}if(source.protocol!=='https:')return badRequest('Kaynak bağlantısı HTTPS olmalıdır.');b.sourceUrl=source.toString();}
  const id=uuid('q'); const ownerType=user.role==='SUPER_ADMIN'?String(b.ownerType||'PLATFORM').toUpperCase():'INSTITUTION';if(!['PLATFORM','INSTITUTION'].includes(ownerType))return badRequest('Geçersiz soru sahibi türü.');const ownerId=ownerType==='INSTITUTION'?(user.role==='SUPER_ADMIN'?b.ownerId:user.institution_id):null;if(ownerType==='INSTITUTION'&&!ownerId)return badRequest('Kurum sorusu için kurum kapsamı gereklidir.');
  const initialStatus=user.role==='SUPER_ADMIN'&&copyright==='OWNED'?'APPROVED':'REVIEW';
  await env.DB.prepare(`INSERT INTO question_bank(id,owner_type,owner_id,academic_year,grade_level,subject_id,topic,subtopic,question_type,difficulty,stem_text,options_json,correct_answer,solution_text,source_label,copyright_status,review_status,created_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,ownerType,ownerId,b.academicYear||'2026-2027',grade,b.subjectId,b.topic||null,b.subtopic||null,b.questionType||'MULTIPLE_CHOICE',Math.max(1,Math.min(5,Number(b.difficulty||3))),String(b.stemText).trim(),JSON.stringify(b.options||[]),b.correctAnswer||null,b.solutionText||null,sourceLabel,copyright,initialStatus,user.id).run();
  const provenanceId=uuid('qpr');const verification=user.role==='SUPER_ADMIN'&&copyright==='OWNED'?'VERIFIED':'DECLARED';
  const statements:D1PreparedStatement[]=[env.DB.prepare(`INSERT INTO question_provenance_records(id,question_id,rights_basis,source_authority,source_url,license_reference,evidence_note,verification_status,created_by,reviewed_by,reviewed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(provenanceId,id,rightsBasisForCopyright(copyright),b.sourceAuthority||null,b.sourceUrl||null,b.licenseReference||null,b.evidenceNote||null,verification,user.id,verification==='VERIFIED'?user.id:null,verification==='VERIFIED'?new Date().toISOString():null)];
  nodeIds.forEach(nodeId=>statements.push(env.DB.prepare(`INSERT OR IGNORE INTO question_learning_links(question_id,node_id) VALUES(?,?)`).bind(id,nodeId)));await env.DB.batch(statements);
  return json({ok:true,id,reviewStatus:initialStatus},201);
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
  if(request.method==='GET'){const inst=userInstitution(user,u.searchParams.get('institutionId')),scope=await teacherContentScope(env,user);const rows=await all<any>(env.DB.prepare(`SELECT d.*,(SELECT COUNT(*) FROM studio_document_items i WHERE i.document_id=d.id) question_count FROM studio_documents d WHERE (? IS NULL OR d.institution_id=?) ORDER BY d.created_at DESC LIMIT 200`).bind(inst,inst));return json({ok:true,documents:scope===null?rows:rows.filter(row=>teacherContentAllowed(scope,String(row.subject_id),Number(row.grade_level)))});}
  const b=await requestBody(request);if(!b.title||!b.documentType)return badRequest('Belge türü ve başlık gereklidir.');const inst=userInstitution(user,b.institutionId);if(!inst)return badRequest('Belge oluşturmak için kurum kapsamı gereklidir.');const allowedTypes=['PRACTICE_EXAM','WRITTEN_EXAM','WORKSHEET'];if(!allowedTypes.includes(String(b.documentType)))return badRequest('Geçersiz belge türü.');const subject=await one<any>(env.DB.prepare(`SELECT id FROM subjects WHERE id=? AND active=1`).bind(b.subjectId||''));if(!subject)return badRequest('Geçerli bir ders seçin.');const grade=Math.round(Number(b.gradeLevel||0));if(grade<1||grade>12)return badRequest('Sınıf düzeyi 1 ile 12 arasında olmalıdır.');if(!teacherContentAllowed(await teacherContentScope(env,user),String(b.subjectId),grade))return forbidden('Yalnız aktif sınıf ve branş atamanız için belge oluşturabilirsiniz.');const id=uuid('std');const count=Math.max(1,Math.min(200,Number(b.questionCount||20)));await env.DB.prepare(`INSERT INTO studio_documents(id,institution_id,created_by,document_type,title,grade_level,subject_id,status,config_json) VALUES(?,?,?,?,?,?,?,'DRAFT',?)`).bind(id,inst,user.id,b.documentType,String(b.title).trim(),grade,b.subjectId,JSON.stringify(b)).run();const qs=await all<any>(env.DB.prepare(`SELECT id FROM question_bank WHERE review_status='APPROVED' AND copyright_status IN ('OWNED','LICENSED','PUBLIC_DOMAIN') AND grade_level=? AND subject_id=? AND (owner_type='PLATFORM' OR (owner_type='INSTITUTION' AND owner_id=?)) ORDER BY RANDOM() LIMIT ?`).bind(grade,b.subjectId,inst,count));if(qs.length)await env.DB.batch(qs.map((q,i)=>env.DB.prepare(`INSERT INTO studio_document_items(document_id,question_id,booklet_code,sort_order) VALUES(?,?,'A',?)`).bind(id,q.id,i+1)));return json({ok:true,id,selectedQuestions:qs.length,requestedQuestions:count},201);
}

async function physicalBridge(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'PHYSICAL_BRIDGE');if(gate)return gate;const u=new URL(request.url);const key=u.searchParams.get('key');if(request.method==='GET'){if(!key)return badRequest('QR/kitap anahtarı gereklidir.');const row=await one<any>(env.DB.prepare(`SELECT l.*,c.title content_title,c.grade_level,p.name publisher_name FROM physical_content_links l JOIN physical_content_items c ON c.id=l.content_item_id LEFT JOIN publishers p ON p.id=c.publisher_id WHERE l.external_key=? AND c.active=1`).bind(key));return row?json({ok:true,link:{...row,payload:parseJson(row.payload_json,{})}}):notFound('İçerik bağlantısı bulunamadı.');}if(user.role!=='SUPER_ADMIN')return forbidden();const b=await requestBody(request);if(!b.contentItemId||!b.externalKey)return badRequest('İçerik ve dış anahtar gereklidir.');const id=uuid('phy');await env.DB.prepare(`INSERT INTO physical_content_links(id,content_item_id,page_from,page_to,external_key,reference_type,reference_id,payload_json) VALUES(?,?,?,?,?,?,?,?)`).bind(id,b.contentItemId,b.pageFrom||null,b.pageTo||null,b.externalKey,b.referenceType||'TEST',b.referenceId||null,JSON.stringify(b.payload||{})).run();return json({ok:true,id},201);
}

async function videos(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'VIDEO_LIBRARY');if(gate)return gate;const u=new URL(request.url);if(request.method==='GET'){const rows=await all<any>(env.DB.prepare(`SELECT v.*,s.name subject_name,n.title node_title FROM learning_videos v LEFT JOIN subjects s ON s.id=v.subject_id LEFT JOIN learning_nodes n ON n.id=v.node_id WHERE v.active=1 AND (v.approved=1 OR ?='SUPER_ADMIN') AND (? IS NULL OR v.grade_level=?) AND (? IS NULL OR v.subject_id=?) ORDER BY v.created_at DESC LIMIT 300`).bind(user.role,u.searchParams.get('gradeLevel'),u.searchParams.get('gradeLevel'),u.searchParams.get('subjectId'),u.searchParams.get('subjectId')));return json({ok:true,videos:rows});}if(user.role!=='SUPER_ADMIN')return forbidden();const b=await requestBody(request);if(!b.url||!b.title)return badRequest('Video URL ve başlık gereklidir.');let parsed:URL;try{parsed=new URL(String(b.url))}catch{return badRequest('Geçerli bir video bağlantısı girin.')}if(parsed.protocol!=='https:')return badRequest('Video bağlantısı HTTPS olmalıdır.');const subject=await one<any>(env.DB.prepare(`SELECT id FROM subjects WHERE id=? AND active=1`).bind(b.subjectId||''));if(!subject)return badRequest('Geçerli bir ders seçin.');const id=uuid('vid');await env.DB.prepare(`INSERT INTO learning_videos(id,provider,external_id,url,title,grade_level,subject_id,node_id,duration_seconds,approved) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id,b.provider||'YOUTUBE',b.externalId||null,parsed.toString(),String(b.title).trim(),b.gradeLevel||null,b.subjectId,b.nodeId||null,b.durationSeconds||null,b.approved?1:0).run();return json({ok:true,id},201);
}

async function questionVideoLinks(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'VIDEO_LIBRARY');if(gate)return gate;if(user.role!=='SUPER_ADMIN')return forbidden();const u=new URL(request.url);
  if(request.method==='GET'){
    const [links,questions,outcomes]=await Promise.all([
      all<any>(env.DB.prepare(`SELECT vl.*,e.title exam_title,q.question_no,q.global_no,s.name subject_name,o.title outcome_title
        FROM video_links vl LEFT JOIN exam_questions q ON q.id=vl.exam_question_id LEFT JOIN exams e ON e.id=q.exam_id
        LEFT JOIN subjects s ON s.id=q.subject_id LEFT JOIN outcomes o ON o.id=vl.outcome_id
        ORDER BY vl.active DESC,vl.created_at DESC LIMIT 500`)),
      all<any>(env.DB.prepare(`SELECT q.id,q.question_no,q.global_no,e.id exam_id,e.title exam_title,e.exam_date,s.id subject_id,s.name subject_name,
        group_concat(DISTINCT o.title) outcome_titles
        FROM exam_questions q JOIN exams e ON e.id=q.exam_id JOIN subjects s ON s.id=q.subject_id
        LEFT JOIN question_outcomes qo ON qo.exam_question_id=q.id LEFT JOIN outcomes o ON o.id=qo.outcome_id
        GROUP BY q.id,q.question_no,q.global_no,e.id,e.title,e.exam_date,s.id,s.name
        ORDER BY COALESCE(e.exam_date,e.created_at) DESC,e.title,COALESCE(q.global_no,q.question_no) LIMIT 600`)),
      all<any>(env.DB.prepare(`SELECT o.id,o.title,o.code,o.grade_level,s.name subject_name FROM outcomes o JOIN subjects s ON s.id=o.subject_id WHERE o.active=1 ORDER BY o.grade_level DESC,s.name,o.code,o.title LIMIT 1200`)),
    ]);
    return json({ok:true,links,questions,outcomes,policy:{httpsOnly:true,studentVisibleWhen:'APPROVED_AND_ACTIVE',solutionRequiresQuestion:true}});
  }
  const b=await requestBody(request),linkType=String(b.linkType||'').toUpperCase(),provider=String(b.provider||'PUBLISHER').toUpperCase();
  if(!['SOLUTION','TOPIC'].includes(linkType))return badRequest('Destek türü çözüm veya konu anlatımı olmalıdır.');
  if(!['ANUNEX','PUBLISHER','EXTERNAL'].includes(provider))return badRequest('Geçerli bir video sağlayıcısı seçin.');
  if(linkType==='SOLUTION'&&!b.examQuestionId)return badRequest('Video çözümü belirli bir sınav sorusuna bağlanmalıdır.');
  if(linkType==='TOPIC'&&!b.examQuestionId&&!b.outcomeId)return badRequest('Konu anlatımı bir sınav sorusuna veya kazanıma bağlanmalıdır.');
  const title=String(b.title||'').trim(),sourceLabel=String(b.sourceLabel||'').trim();if(!title||!sourceLabel)return badRequest('Başlık ve yayınevi/kaynak adı gereklidir.');
  let parsed:URL;try{parsed=new URL(String(b.url||''))}catch{return badRequest('Geçerli bir video bağlantısı girin.')}if(parsed.protocol!=='https:')return badRequest('Video bağlantısı HTTPS olmalıdır.');
  if(b.examQuestionId&&!await one(env.DB.prepare(`SELECT 1 ok FROM exam_questions WHERE id=?`).bind(b.examQuestionId)))return badRequest('Seçilen sınav sorusu bulunamadı.');
  if(b.outcomeId&&!await one(env.DB.prepare(`SELECT 1 ok FROM outcomes WHERE id=? AND active=1`).bind(b.outcomeId)))return badRequest('Seçilen kazanım bulunamadı.');
  const approved=b.approved===true,id=uuid('vln'),duration=b.durationSeconds==null||b.durationSeconds===''?null:Math.max(1,Math.min(14400,Math.round(Number(b.durationSeconds))));
  await env.DB.prepare(`INSERT INTO video_links(id,exam_question_id,outcome_id,link_type,url,approved,title,provider,source_label,duration_seconds,safety_review_status,active,created_by,approved_by,approved_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)`)
    .bind(id,b.examQuestionId||null,b.outcomeId||null,linkType,parsed.toString(),approved?1:0,title,provider,sourceLabel,duration,approved?'APPROVED':'PENDING',user.id,approved?user.id:null,approved?new Date().toISOString():null).run();
  await audit(env.DB,user.id,null,approved?'QUESTION_VIDEO_APPROVED':'QUESTION_VIDEO_CREATED','video_link',id,{linkType,provider,examQuestionId:b.examQuestionId||null,outcomeId:b.outcomeId||null,sourceLabel});
  return json({ok:true,id,approved},201);
}

async function updateQuestionVideoLink(request:Request,env:Env,user:AuthUser,id:string):Promise<Response>{
  const gate=await requireFeature(env,user,'VIDEO_LIBRARY');if(gate)return gate;if(user.role!=='SUPER_ADMIN')return forbidden();const b=await requestBody(request),action=String(b.action||'').toUpperCase();
  const row=await one<any>(env.DB.prepare(`SELECT id,active FROM video_links WHERE id=?`).bind(id));if(!row)return notFound('Video desteği bulunamadı.');
  if(action==='APPROVE')await env.DB.prepare(`UPDATE video_links SET approved=1,safety_review_status='APPROVED',active=1,approved_by=?,approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(user.id,id).run();
  else if(action==='REVOKE')await env.DB.prepare(`UPDATE video_links SET approved=0,safety_review_status='REJECTED',approved_by=NULL,approved_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
  else if(action==='ARCHIVE')await env.DB.prepare(`UPDATE video_links SET approved=0,active=0,approved_by=NULL,approved_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
  else return badRequest('İşlem APPROVE, REVOKE veya ARCHIVE olmalıdır.');
  await audit(env.DB,user.id,null,`QUESTION_VIDEO_${action}`,'video_link',id,{});return json({ok:true,id,action});
}

async function youtubeVideoCandidates(request:Request,env:Env,user:AuthUser):Promise<Response>{
  const gate=await requireFeature(env,user,'VIDEO_LIBRARY');if(gate)return gate;if(user.role!=='SUPER_ADMIN')return forbidden();
  const rows=await all<any>(env.DB.prepare(`SELECT c.*,e.title exam_title,q.question_no,q.global_no,s.name subject_name,o.title outcome_title
    FROM youtube_micro_video_candidates c JOIN exam_questions q ON q.id=c.exam_question_id JOIN exams e ON e.id=q.exam_id
    LEFT JOIN subjects s ON s.id=c.subject_id LEFT JOIN outcomes o ON o.id=c.outcome_id
    WHERE c.active=1 ORDER BY c.human_review_status='PENDING' DESC,c.ai_selected DESC,c.fetched_at DESC LIMIT 500`));
  return json({ok:true,candidates:rows,policy:{aiCanRank:true,aiCanApprove:false,humanApprovalRequired:true,studentVisibleWhen:'POLICY_PASSED_AND_HUMAN_APPROVED'}});
}

async function updateYoutubeVideoCandidate(request:Request,env:Env,user:AuthUser,id:string):Promise<Response>{
  const gate=await requireFeature(env,user,'VIDEO_LIBRARY');if(gate)return gate;if(user.role!=='SUPER_ADMIN')return forbidden();const b=await requestBody(request),action=String(b.action||'').toUpperCase();
  const row=await one<any>(env.DB.prepare(`SELECT id,exam_question_id,policy_status,active FROM youtube_micro_video_candidates WHERE id=?`).bind(id));if(!row)return notFound('YouTube adayı bulunamadı.');
  if(action==='APPROVE'){
    if(row.policy_status!=='PASSED'||Number(row.active)!==1)return badRequest('Otomatik güvenlik politikasını geçmeyen aday onaylanamaz.');
    await env.DB.batch([env.DB.prepare(`UPDATE youtube_micro_video_candidates SET human_review_status='REJECTED',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_note='Başka aday onaylandı',updated_at=CURRENT_TIMESTAMP WHERE exam_question_id=? AND id<>? AND human_review_status='APPROVED'`).bind(user.id,row.exam_question_id,id),env.DB.prepare(`UPDATE youtube_micro_video_candidates SET human_review_status='APPROVED',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(user.id,String(b.note||'').trim()||null,id)]);
  }else if(action==='REJECT')await env.DB.prepare(`UPDATE youtube_micro_video_candidates SET human_review_status='REJECTED',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(user.id,String(b.note||'').trim()||null,id).run();
  else if(action==='ARCHIVE')await env.DB.prepare(`UPDATE youtube_micro_video_candidates SET active=0,human_review_status='REJECTED',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(user.id,String(b.note||'').trim()||null,id).run();
  else return badRequest('İşlem APPROVE, REJECT veya ARCHIVE olmalıdır.');
  await audit(env.DB,user.id,null,`YOUTUBE_CANDIDATE_${action}`,'youtube_micro_video_candidate',id,{examQuestionId:row.exam_question_id,note:String(b.note||'').trim()||null});return json({ok:true,id,action});
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
  m=p.match(/^\/api\/platform\/networks\/([^/]+)\/members\/([^/]+)$/);if(m&&(request.method==='PATCH'||request.method==='DELETE'))return updateNetworkMember(request,env,user,m[1],m[2]);
  m=p.match(/^\/api\/platform\/networks\/([^/]+)\/units$/);if(m&&(request.method==='GET'||request.method==='POST'))return networkUnits(request,env,user,m[1]);
  m=p.match(/^\/api\/platform\/networks\/([^/]+)\/roles$/);if(m&&(request.method==='GET'||request.method==='POST'))return networkRoles(request,env,user,m[1]);
  m=p.match(/^\/api\/platform\/networks\/([^/]+)\/dashboard$/);if(m&&request.method==='GET')return networkDashboard(request,env,user,m[1]);
  m=p.match(/^\/api\/platform\/networks\/([^/]+)\/export$/);if(m&&request.method==='GET')return networkExport(request,env,user,m[1]);

  if(p==='/api/platform/questions'&&request.method==='GET')return listQuestions(request,env,user);
  if(p==='/api/platform/questions'&&request.method==='POST')return createQuestion(request,env,user);
  if(p==='/api/platform/content-options'&&request.method==='GET')return contentOptions(request,env,user);
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
  if(p==='/api/platform/question-video-links'&&(request.method==='GET'||request.method==='POST'))return questionVideoLinks(request,env,user);
  m=p.match(/^\/api\/platform\/question-video-links\/([^/]+)$/);if(m&&request.method==='PATCH')return updateQuestionVideoLink(request,env,user,m[1]);
  if(p==='/api/platform/youtube-video-candidates'&&request.method==='GET')return youtubeVideoCandidates(request,env,user);
  m=p.match(/^\/api\/platform\/youtube-video-candidates\/([^/]+)$/);if(m&&request.method==='PATCH')return updateYoutubeVideoCandidate(request,env,user,m[1]);
  if(p==='/api/platform/games'&&(request.method==='GET'||request.method==='POST'))return games(request,env,user);
  if(p.startsWith('/api/platform/publishers'))return publishersApi(request,env,user);
  if(p==='/api/platform/admissions'&&(request.method==='GET'||request.method==='POST'))return admissions(request,env,user);
  if(p==='/api/platform/guidance'&&(request.method==='GET'||request.method==='POST'))return guidance(request,env,user);
  if(p==='/api/platform/board'&&(request.method==='GET'||request.method==='POST'))return board(request,env,user);
  if(p==='/api/platform/campus'&&(request.method==='GET'||request.method==='PUT'))return campus(request,env,user);
  return json({ok:false,error:{code:'NOT_FOUND',message:'Platform API yolu bulunamadı.'}},404);
}
