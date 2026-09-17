import type { AuthUser, Env } from '../types';
import { all, audit, badRequest, forbidden, json, one, uuid } from './db';
import { getEffectiveLicense, licenseAccessMessage } from './license';
import { sendWhatsAppTemplate, whatsappReady } from './whatsapp';

const SCHOOL_SOURCE = 'MEB_ROTA_MAARIF';
const UNIVERSITY_SOURCE = 'YOK_ATLAS';

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export function normalizeMetricKey(value: string) {
  return String(value || '').toLocaleUpperCase('tr-TR')
    .replace(/İ/g,'I').replace(/Ş/g,'S').replace(/Ğ/g,'G').replace(/Ü/g,'U').replace(/Ö/g,'O').replace(/Ç/g,'C')
    .replace(/[^A-Z0-9]/g,'');
}

export function compareTargetProfile(current: Record<string, number>, target: Record<string, number>) {
  const currentEntries = Object.entries(current).map(([key,value])=>[normalizeMetricKey(key),Number(value)] as const);
  const gaps: Array<{metric:string;current:number;target:number;gap:number}> = [];
  for (const [metric,targetValueRaw] of Object.entries(target || {})) {
    const targetValue = Number(targetValueRaw);
    if (!Number.isFinite(targetValue)) continue;
    const normalized = normalizeMetricKey(metric);
    const matched = currentEntries.find(([key])=>key===normalized || key.includes(normalized) || normalized.includes(key));
    const currentValue = matched ? matched[1] : 0;
    gaps.push({metric,current:Number(currentValue.toFixed(2)),target:Number(targetValue.toFixed(2)),gap:Number((targetValue-currentValue).toFixed(2))});
  }
  return gaps.sort((a,b)=>b.gap-a.gap);
}

export function targetEligibility(gradeLevel: number | null | undefined, targetType: string) {
  return (targetType==='LGS_SCHOOL' && gradeLevel===8) || (targetType==='YKS_PROGRAM' && gradeLevel===12);
}

async function enrollment(env: Env, studentId: string) {
  return one<any>(env.DB.prepare(`SELECT e.*,c.name class_name FROM student_enrollments e LEFT JOIN classes c ON c.id=e.class_id WHERE e.student_id=? AND e.status='ACTIVE' ORDER BY e.created_at DESC LIMIT 1`).bind(studentId));
}

async function canAccessStudent(env: Env, user: AuthUser, studentId: string) {
  if (user.role==='SUPER_ADMIN') return true;
  if (user.role==='STUDENT') return user.student_id===studentId;
  if (user.role==='PARENT') return Boolean(await one(env.DB.prepare(`SELECT 1 FROM parent_student_links WHERE parent_user_id=? AND student_id=? AND active=1`).bind(user.id,studentId)));
  const enr=await enrollment(env,studentId);
  if (!enr || enr.institution_id!==user.institution_id) return false;
  if (user.role==='INSTITUTION_MANAGER') return true;
  if (user.role==='TEACHER' || user.role==='GUIDANCE_TEACHER') return Boolean(await one(env.DB.prepare(`SELECT 1 FROM teacher_assignments WHERE user_id=? AND class_id=? AND active=1`).bind(user.id,enr.class_id)));
  return false;
}

async function resolveStudentId(env: Env, user: AuthUser, requested?: string | null) {
  if (user.role==='STUDENT') return user.student_id;
  if (requested && await canAccessStudent(env,user,requested)) return requested;
  if (user.role==='PARENT') {
    const row=await one<{student_id:string}>(env.DB.prepare(`SELECT student_id FROM parent_student_links WHERE parent_user_id=? AND active=1 ORDER BY rowid LIMIT 1`).bind(user.id));
    return row?.student_id || null;
  }
  return requested || null;
}

async function accessBlocked(env: Env, user: AuthUser) {
  if (!user.institution_id) return null;
  const institution=await one<{status:string}>(env.DB.prepare(`SELECT status FROM institutions WHERE id=?`).bind(user.institution_id));
  if (!institution || institution.status==='PASSIVE') return 'Kurum hesabı aktif değildir.';
  const license=await getEffectiveLicense(env,user.institution_id);
  return license.locked ? licenseAccessMessage(license) : null;
}

export async function listTargetSources(env: Env) {
  const sources=await all<any>(env.DB.prepare(`SELECT * FROM academic_target_sources ORDER BY data_year DESC,source_kind`));
  return json({ok:true,sources});
}

export async function searchTargets(env: Env, user: AuthUser, url: URL) {
  const type=url.searchParams.get('type')==='YKS_PROGRAM'?'YKS_PROGRAM':'LGS_SCHOOL';
  const q=(url.searchParams.get('q')||'').trim();
  const year=Number(url.searchParams.get('year')||2026);
  if (type==='LGS_SCHOOL') {
    const city=(url.searchParams.get('city')||'').trim();
    const district=(url.searchParams.get('district')||'').trim();
    const terms:string[]=['active=1','source_year=?'];const params:any[]=[year];
    if(q){terms.push('(name LIKE ? OR city LIKE ? OR district LIKE ?)');params.push(`%${q}%`,`%${q}%`,`%${q}%`)}
    if(city){terms.push('city=?');params.push(city)} if(district){terms.push('district=?');params.push(district)}
    const rows=await all<any>(env.DB.prepare(`SELECT t.*,s.source_kind,s.title source_title FROM secondary_school_targets t JOIN academic_target_sources s ON s.id=t.source_id WHERE ${terms.join(' AND ')} ORDER BY coalesce(percentile,999),name LIMIT 100`).bind(...params));
    return json({ok:true,type,targets:rows.map(x=>({...x,net_profile:parseJson(x.net_profile_json,{})}))});
  }
  const scoreType=(url.searchParams.get('scoreType')||'').trim();
  const terms:string[]=['active=1','source_year=?'];const params:any[]=[year];
  if(q){terms.push('(university_name LIKE ? OR program_name LIKE ? OR faculty_name LIKE ?)');params.push(`%${q}%`,`%${q}%`,`%${q}%`)}
  if(scoreType){terms.push('score_type=?');params.push(scoreType)}
  const rows=await all<any>(env.DB.prepare(`SELECT t.*,s.source_kind,s.title source_title FROM university_program_targets t JOIN academic_target_sources s ON s.id=t.source_id WHERE ${terms.join(' AND ')} ORDER BY coalesce(success_rank,99999999),university_name,program_name LIMIT 100`).bind(...params));
  return json({ok:true,type,targets:rows.map(x=>({...x,net_profile:parseJson(x.net_profile_json,{})}))});
}

async function activeTarget(env: Env, studentId: string) {
  const row=await one<any>(env.DB.prepare(`SELECT sat.*,ss.name school_name,ss.city school_city,ss.district school_district,ss.base_score school_base_score,ss.percentile school_percentile,ss.net_profile_json school_nets,ss.source_year school_year,ss.source_url school_source_url,ss.source_verified_at school_verified_at,up.university_name,up.program_name,up.faculty_name,up.score_type,up.base_score university_base_score,up.success_rank,up.net_profile_json university_nets,up.source_year university_year,up.source_url university_source_url,up.source_verified_at university_verified_at FROM student_academic_targets sat LEFT JOIN secondary_school_targets ss ON ss.id=sat.secondary_school_target_id LEFT JOIN university_program_targets up ON up.id=sat.university_program_target_id WHERE sat.student_id=? AND sat.status='ACTIVE' ORDER BY sat.created_at DESC LIMIT 1`).bind(studentId));
  return row ? {...row,school_nets:parseJson(row.school_nets,{}),university_nets:parseJson(row.university_nets,{})} : null;
}

export async function getMyTarget(env: Env, user: AuthUser, url: URL) {
  const studentId=await resolveStudentId(env,user,url.searchParams.get('studentId'));
  if(!studentId || !await canAccessStudent(env,user,studentId)) return forbidden('Bu öğrenci hedef bilgisine erişim yetkiniz yok.');
  const enr=await enrollment(env,studentId);
  const target=await activeTarget(env,studentId);
  return json({ok:true,studentId,gradeLevel:enr?.grade_level??null,target});
}

export async function setMyTarget(request: Request, env: Env, user: AuthUser) {
  const body=await request.json<{studentId?:string;targetType?:'LGS_SCHOOL'|'YKS_PROGRAM';targetId?:string;note?:string}>();
  const studentId=await resolveStudentId(env,user,body.studentId||null);
  if(!studentId || !await canAccessStudent(env,user,studentId)) return forbidden('Bu öğrenci için hedef belirleme yetkiniz yok.');
  if(user.role!=='STUDENT'&&user.role!=='PARENT'&&user.role!=='INSTITUTION_MANAGER'&&user.role!=='SUPER_ADMIN') return forbidden('Hedefi öğrenci, veli veya kurum yöneticisi belirleyebilir.');
  const enr=await enrollment(env,studentId);if(!enr)return badRequest('Aktif öğrenci kaydı bulunamadı.');
  const targetType=body.targetType;if(!targetType||!body.targetId)return badRequest('Hedef türü ve hedef seçilmelidir.');
  if(!targetEligibility(Number(enr.grade_level),targetType)) return badRequest(targetType==='LGS_SCHOOL'?'LGS okul hedefi yalnız 8. sınıf öğrencileri için kullanılabilir.':'YKS program hedefi yalnız 12. sınıf öğrencileri için kullanılabilir.');
  if(targetType==='LGS_SCHOOL'&&!await one(env.DB.prepare(`SELECT id FROM secondary_school_targets WHERE id=? AND active=1`).bind(body.targetId)))return badRequest('Seçilen lise hedefi bulunamadı.');
  if(targetType==='YKS_PROGRAM'&&!await one(env.DB.prepare(`SELECT id FROM university_program_targets WHERE id=? AND active=1`).bind(body.targetId)))return badRequest('Seçilen üniversite programı bulunamadı.');
  await env.DB.prepare(`UPDATE student_academic_targets SET status='ARCHIVED',updated_at=CURRENT_TIMESTAMP WHERE student_id=? AND status='ACTIVE'`).bind(studentId).run();
  const id=uuid('tgt');
  await env.DB.prepare(`INSERT INTO student_academic_targets(id,student_id,institution_id,target_type,secondary_school_target_id,university_program_target_id,set_by_user_id,note) VALUES(?,?,?,?,?,?,?,?)`).bind(id,studentId,enr.institution_id,targetType,targetType==='LGS_SCHOOL'?body.targetId:null,targetType==='YKS_PROGRAM'?body.targetId:null,user.id,body.note||null).run();
  await audit(env.DB,user.id,enr.institution_id,'ACADEMIC_TARGET_SET','student',studentId,{targetType,targetId:body.targetId});
  return json({ok:true,target:await activeTarget(env,studentId)},201);
}

async function recentPerformance(env: Env, studentId: string, targetType: 'LGS_SCHOOL'|'YKS_PROGRAM') {
  const pattern=targetType==='LGS_SCHOOL'?'%LGS%':'%YK%';
  let exams=await all<any>(env.DB.prepare(`SELECT e.id,e.title,e.exam_type,e.exam_date,er.net,er.score,er.success_percent,er.general_rank FROM exam_participants ep JOIN exams e ON e.id=ep.exam_id JOIN exam_results er ON er.participant_id=ep.id WHERE ep.student_id=? AND upper(e.exam_type) LIKE ? ORDER BY coalesce(e.exam_date,e.created_at) DESC LIMIT 8`).bind(studentId,pattern));
  if(!exams.length) exams=await all<any>(env.DB.prepare(`SELECT e.id,e.title,e.exam_type,e.exam_date,er.net,er.score,er.success_percent,er.general_rank FROM exam_participants ep JOIN exams e ON e.id=ep.exam_id JOIN exam_results er ON er.participant_id=ep.id WHERE ep.student_id=? ORDER BY coalesce(e.exam_date,e.created_at) DESC LIMIT 8`).bind(studentId));
  const subjectRows=exams.length?await all<any>(env.DB.prepare(`SELECT s.code,s.name,sr.net,sr.success_percent,ep.exam_id FROM exam_participants ep JOIN subject_results sr ON sr.participant_id=ep.id JOIN subjects s ON s.id=sr.subject_id WHERE ep.student_id=? AND ep.exam_id IN (${exams.map(()=>'?').join(',')})`).bind(studentId,...exams.map(x=>x.id))):[];
  const sums=new Map<string,{sum:number,count:number,label:string}>();
  for(const row of subjectRows){const label=String(row.name||row.code);const key=normalizeMetricKey(label);const entry=sums.get(key)||{sum:0,count:0,label};entry.sum+=Number(row.net||0);entry.count++;sums.set(key,entry)}
  const subjectAverages:Record<string,number>={};for(const [,v] of sums)subjectAverages[v.label]=Number((v.sum/Math.max(v.count,1)).toFixed(2));
  const validNets=exams.map(x=>Number(x.net)).filter(Number.isFinite);const validScores=exams.map(x=>Number(x.score)).filter(Number.isFinite);const validRanks=exams.map(x=>Number(x.general_rank)).filter(x=>Number.isFinite(x)&&x>0);
  const avg=(arr:number[])=>arr.length?Number((arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(2)):null;
  let trend:'RISING'|'STABLE'|'FALLING'|'INSUFFICIENT'='INSUFFICIENT';
  if(validNets.length>=3){const latest=validNets.slice(0,Math.ceil(validNets.length/2));const older=validNets.slice(Math.ceil(validNets.length/2));const delta=(avg(latest)||0)-(avg(older)||0);trend=delta>1?'RISING':delta<-1?'FALLING':'STABLE'}
  const weak=await all<any>(env.DB.prepare(`SELECT s.name subject_name,o.title,o.topic,round(avg(r.success_rate),1) avg_success,count(*) evidence FROM outcome_results r JOIN outcomes o ON o.id=r.outcome_id JOIN subjects s ON s.id=o.subject_id WHERE r.student_id=? GROUP BY o.id,o.title,o.topic,s.name HAVING count(*)>0 ORDER BY avg_success ASC,evidence DESC LIMIT 6`).bind(studentId));
  return {exams,subjectAverages,averageNet:avg(validNets),averageScore:avg(validScores),averageRank:avg(validRanks),latestRank:validRanks[0]||null,trend,weakOutcomes:weak};
}

export async function buildTargetAnalysis(env: Env, user: AuthUser, studentId: string) {
  if(!await canAccessStudent(env,user,studentId)) throw new Error('FORBIDDEN');
  const enr=await enrollment(env,studentId);const target=await activeTarget(env,studentId);
  if(!target)return {studentId,gradeLevel:enr?.grade_level??null,target:null,analysis:null};
  const targetType=target.target_type as 'LGS_SCHOOL'|'YKS_PROGRAM';const perf=await recentPerformance(env,studentId,targetType);
  const profile=targetType==='LGS_SCHOOL'?target.school_nets:target.university_nets;
  const gaps=compareTargetProfile(perf.subjectAverages,profile||{});
  const source=targetType==='LGS_SCHOOL'?{kind:SCHOOL_SOURCE,year:target.school_year,url:target.school_source_url,verifiedAt:target.school_verified_at}:{kind:UNIVERSITY_SOURCE,year:target.university_year,url:target.university_source_url,verifiedAt:target.university_verified_at};
  const primaryGap=targetType==='LGS_SCHOOL'
    ? {metric:'LGS',targetScore:target.school_base_score,targetPercentile:target.school_percentile,currentScore:perf.averageScore,scoreGap:target.school_base_score!=null&&perf.averageScore!=null?Number((target.school_base_score-perf.averageScore).toFixed(2)):null}
    : {metric:'YKS',targetRank:target.success_rank,currentRank:perf.averageRank,rankGap:target.success_rank!=null&&perf.averageRank!=null?Math.round(perf.averageRank-target.success_rank):null,targetScore:target.university_base_score,currentScore:perf.averageScore};
  const analysis={examCount:perf.exams.length,trend:perf.trend,subjectAverages:perf.subjectAverages,gaps,weakOutcomes:perf.weakOutcomes,primaryGap,latestExam:perf.exams[0]||null,source,officialNetProfile:Object.keys(profile||{}).length>0};
  return {studentId,gradeLevel:enr?.grade_level??null,target,analysis};
}

export function targetNibiruAnswer(payload: any) {
  const target=payload?.target,analysis=payload?.analysis;if(!target)return '🤖 Nibiru: Henüz bir akademik hedef belirlememişsin. 8. sınıftaysan hedef lise, 12. sınıftaysan hedef üniversite programı seçebilirsin.';
  if(!analysis)return '🤖 Nibiru: Hedefin kayıtlı ancak karşılaştırma yapacak yeterli sınav verisi henüz oluşmadı.';
  const name=target.target_type==='LGS_SCHOOL'?target.school_name:`${target.university_name} · ${target.program_name}`;
  const trend=analysis.trend==='RISING'?'Son sınavlarında olumlu bir gelişim var.':analysis.trend==='FALLING'?'Son sınavlarında gerileme görülüyor; kısa bir pekiştirme planı yararlı olabilir.':analysis.trend==='STABLE'?'Son sınavların genel olarak dengeli seyrediyor.':'Gelişim eğilimi için daha fazla sınav verisi gerekiyor.';
  const gaps=(analysis.gaps||[]).filter((x:any)=>x.gap>0).slice(0,3);
  const gapText=gaps.length?` Hedef net profiline göre öncelikli farklar: ${gaps.map((x:any)=>`${x.metric} +${x.gap} net`).join(', ')}.`:'';
  const weak=(analysis.weakOutcomes||[]).slice(0,3);const weakText=weak.length?` Pekiştirmeni önerdiğim alanlar: ${weak.map((x:any)=>`${x.subject_name} – ${x.title}`).join('; ')}.`:'';
  const source=`Kaynak: ${analysis.source.kind}, ${analysis.source.year}.`;
  return `🤖 Nibiru: Hedefin ${name}. Bugüne kadar karşılaştırmaya uygun ${analysis.examCount} sınavını değerlendirdim. ${trend}${gapText}${weakText} ${source} Bu değerlendirme rehberlik amaçlıdır; yerleştirme garantisi vermez.`;
}

export async function getTargetAnalysis(env: Env, user: AuthUser, url: URL) {
  const studentId=await resolveStudentId(env,user,url.searchParams.get('studentId'));
  if(!studentId || !await canAccessStudent(env,user,studentId))return forbidden('Bu öğrenci hedef analizine erişim yetkiniz yok.');
  try{return json({ok:true,...await buildTargetAnalysis(env,user,studentId)})}catch{return forbidden()}
}

export async function importOfficialTargets(request: Request, env: Env, user: AuthUser) {
  if(user.role!=='SUPER_ADMIN')return forbidden('Resmî hedef verilerini yalnız Süper Admin içe aktarabilir.');
  const body=await request.json<{sourceKind?:string;year?:number;rows?:any[]}>();const year=Number(body.year||2026);const rows=Array.isArray(body.rows)?body.rows:[];
  if(!['MEB_ROTA_MAARIF','MEB_EOKUL','YOK_ATLAS','OSYM'].includes(body.sourceKind||''))return badRequest('Geçersiz resmî kaynak.');
  if(!rows.length||rows.length>5000)return badRequest('Bir aktarımda 1–5000 kayıt gönderilmelidir.');
  const source=await one<any>(env.DB.prepare(`SELECT * FROM academic_target_sources WHERE source_kind=? AND data_year=?`).bind(body.sourceKind,year));if(!source)return badRequest('Kaynak kataloğu bulunamadı.');
  let imported=0;
  if(body.sourceKind==='MEB_ROTA_MAARIF'||body.sourceKind==='MEB_EOKUL'){
    for(const r of rows){if(!r.externalCode||!r.name||!r.city||!r.sourceUrl)continue;const existing=await one<any>(env.DB.prepare(`SELECT id FROM secondary_school_targets WHERE source_id=? AND external_code=? AND source_year=?`).bind(source.id,String(r.externalCode),year));const id=existing?.id||uuid('lgs');
      if(existing)await env.DB.prepare(`UPDATE secondary_school_targets SET name=?,city=?,district=?,school_type=?,placement_type=?,base_score=?,percentile=?,quota=?,net_profile_json=?,source_url=?,source_verified_at=?,active=1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(r.name,r.city,r.district||null,r.schoolType||null,r.placementType||'CENTRAL',r.baseScore??null,r.percentile??null,r.quota??null,JSON.stringify(r.netProfile||{}),r.sourceUrl,r.sourceVerifiedAt||new Date().toISOString(),id).run();
      else await env.DB.prepare(`INSERT INTO secondary_school_targets(id,source_id,external_code,name,city,district,school_type,placement_type,source_year,base_score,percentile,quota,net_profile_json,source_url,source_verified_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,source.id,String(r.externalCode),r.name,r.city,r.district||null,r.schoolType||null,r.placementType||'CENTRAL',year,r.baseScore??null,r.percentile??null,r.quota??null,JSON.stringify(r.netProfile||{}),r.sourceUrl,r.sourceVerifiedAt||new Date().toISOString()).run();imported++}
  }else{
    for(const r of rows){if(!r.programCode||!r.universityName||!r.programName||!r.scoreType||!r.sourceUrl)continue;const existing=await one<any>(env.DB.prepare(`SELECT id FROM university_program_targets WHERE source_id=? AND program_code=? AND source_year=?`).bind(source.id,String(r.programCode),year));const id=existing?.id||uuid('yks');
      if(existing)await env.DB.prepare(`UPDATE university_program_targets SET university_name=?,faculty_name=?,program_name=?,university_type=?,scholarship=?,score_type=?,base_score=?,success_rank=?,quota=?,min_rank_rule=?,net_profile_json=?,source_url=?,source_verified_at=?,active=1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(r.universityName,r.facultyName||null,r.programName,r.universityType||null,r.scholarship||null,r.scoreType,r.baseScore??null,r.successRank??null,r.quota??null,r.minRankRule??null,JSON.stringify(r.netProfile||{}),r.sourceUrl,r.sourceVerifiedAt||new Date().toISOString(),id).run();
      else await env.DB.prepare(`INSERT INTO university_program_targets(id,source_id,program_code,university_name,faculty_name,program_name,university_type,scholarship,score_type,source_year,base_score,success_rank,quota,min_rank_rule,net_profile_json,source_url,source_verified_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,source.id,String(r.programCode),r.universityName,r.facultyName||null,r.programName,r.universityType||null,r.scholarship||null,r.scoreType,year,r.baseScore??null,r.successRank??null,r.quota??null,r.minRankRule??null,JSON.stringify(r.netProfile||{}),r.sourceUrl,r.sourceVerifiedAt||new Date().toISOString()).run();imported++}
  }
  await env.DB.prepare(`UPDATE academic_target_sources SET last_imported_at=CURRENT_TIMESTAMP,import_status='CURRENT' WHERE id=?`).bind(source.id).run();
  await audit(env.DB,user.id,null,'OFFICIAL_TARGET_DATA_IMPORTED','academic_target_source',source.id,{sourceKind:body.sourceKind,year,imported});
  return json({ok:true,imported,sourceKind:body.sourceKind,year});
}

async function teacherClassIds(env: Env, user: AuthUser) {
  if(user.role!=='TEACHER'&&user.role!=='GUIDANCE_TEACHER')return [] as string[];
  return (await all<{class_id:string}>(env.DB.prepare(`SELECT DISTINCT class_id FROM teacher_assignments WHERE user_id=? AND active=1 AND class_id IS NOT NULL`).bind(user.id))).map(x=>x.class_id);
}

async function resolveAnnouncementRecipients(env: Env, user: AuthUser, audienceType: string, audience: any) {
  const institutionId=user.institution_id;if(!institutionId)return [] as any[];
  const teacherClasses=await teacherClassIds(env,user);
  if((user.role==='TEACHER'||user.role==='GUIDANCE_TEACHER')&&!['CLASS','SELECTED'].includes(audienceType))throw new Error('TEACHER_AUDIENCE_SCOPE');
  if(audienceType==='ALL')return all<any>(env.DB.prepare(`SELECT id,role,display_name,phone FROM users WHERE institution_id=? AND active=1 AND id<>?`).bind(institutionId,user.id));
  if(audienceType==='ROLE'){
    const roles=(audience?.roles||[]).filter((x:string)=>['PARENT','STUDENT','TEACHER','GUIDANCE_TEACHER','INSTITUTION_MANAGER'].includes(x));if(!roles.length)return [];
    return all<any>(env.DB.prepare(`SELECT id,role,display_name,phone FROM users WHERE institution_id=? AND active=1 AND role IN (${roles.map(()=>'?').join(',')})`).bind(institutionId,...roles));
  }
  if(audienceType==='SELECTED'){
    const ids=(audience?.userIds||[]).filter(Boolean).slice(0,1000);if(!ids.length)return [];
    let rows=await all<any>(env.DB.prepare(`SELECT id,role,display_name,phone,student_id FROM users WHERE institution_id=? AND active=1 AND id IN (${ids.map(()=>'?').join(',')})`).bind(institutionId,...ids));
    if(teacherClasses.length){const allowed=new Set<string>();for(const row of rows){if(row.role==='STUDENT'&&row.student_id){const enr=await enrollment(env,row.student_id);if(enr&&teacherClasses.includes(enr.class_id))allowed.add(row.id)}else if(row.role==='PARENT'){const link=await one<any>(env.DB.prepare(`SELECT e.class_id FROM parent_student_links p JOIN student_enrollments e ON e.student_id=p.student_id AND e.status='ACTIVE' WHERE p.parent_user_id=? AND p.active=1 LIMIT 1`).bind(row.id));if(link&&teacherClasses.includes(link.class_id))allowed.add(row.id)}}rows=rows.filter(x=>allowed.has(x.id));}
    return rows;
  }
  const classIds=audienceType==='CLASS'?(audience?.classIds||[]).filter(Boolean):[];
  let ids=classIds;if(audienceType==='GRADE'){
    const grades=(audience?.grades||[]).map(Number).filter(Number.isFinite);if(!grades.length)return [];
    ids=(await all<{id:string}>(env.DB.prepare(`SELECT id FROM classes WHERE institution_id=? AND active=1 AND grade_level IN (${grades.map(()=>'?').join(',')})`).bind(institutionId,...grades))).map(x=>x.id);
  }
  if(teacherClasses.length)ids=ids.filter((id:string)=>teacherClasses.includes(id));if(!ids.length)return [];
  const rows=await all<any>(env.DB.prepare(`SELECT DISTINCT u.id,u.role,u.display_name,u.phone FROM users u LEFT JOIN parent_student_links p ON p.parent_user_id=u.id AND p.active=1 LEFT JOIN student_enrollments ep ON ep.student_id=coalesce(u.student_id,p.student_id) AND ep.status='ACTIVE' WHERE u.institution_id=? AND u.active=1 AND ep.class_id IN (${ids.map(()=>'?').join(',')}) AND u.role IN ('STUDENT','PARENT')`).bind(institutionId,...ids));
  return rows;
}

export async function listAnnouncements(env: Env, user: AuthUser) {
  if(!user.institution_id)return json({ok:true,announcements:[]});
  if(!['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role))return forbidden();
  const rows=await all<any>(env.DB.prepare(`SELECT a.*,(SELECT count(*) FROM announcement_deliveries d WHERE d.announcement_id=a.id) delivery_count,(SELECT count(*) FROM announcement_deliveries d WHERE d.announcement_id=a.id AND d.status IN ('SENT','DELIVERED')) sent_count FROM announcements a WHERE a.institution_id=? ${user.role==='TEACHER'||user.role==='GUIDANCE_TEACHER'?'AND a.created_by=?':''} ORDER BY a.created_at DESC LIMIT 100`).bind(...(user.role==='TEACHER'||user.role==='GUIDANCE_TEACHER'?[user.institution_id,user.id]:[user.institution_id])));
  return json({ok:true,announcements:rows.map(x=>({...x,audience:parseJson(x.audience_json,{}),channels:parseJson(x.channels_json,['PANEL'])}))});
}

export async function createAnnouncement(request: Request, env: Env, user: AuthUser) {
  if(!user.institution_id||!['INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role))return forbidden('Duyuruyu kurum yöneticisi veya öğretmen oluşturabilir.');
  const body=await request.json<any>();const title=String(body.title||'').trim(),text=String(body.body||'').trim();if(!title||!text)return badRequest('Başlık ve duyuru metni gereklidir.');
  const audienceType=String(body.audienceType||'CLASS');const audience=body.audience||{};let recipients:any[];try{recipients=await resolveAnnouncementRecipients(env,user,audienceType,audience)}catch{return forbidden('Öğretmen yalnız yetkili olduğu sınıflara veya seçili kullanıcılara duyuru gönderebilir.');}
  if(!recipients.length)return badRequest('Seçilen hedef kitlede kullanıcı bulunamadı.');
  const channels=(Array.isArray(body.channels)?body.channels:['PANEL']).filter((x:string)=>['PANEL','WHATSAPP'].includes(x));if(!channels.includes('PANEL'))channels.unshift('PANEL');
  const id=uuid('ann');const scheduledAt=body.scheduledAt||null;const status=scheduledAt?'SCHEDULED':'DRAFT';
  await env.DB.prepare(`INSERT INTO announcements(id,institution_id,created_by,announcement_type,title,body,action_url,audience_type,audience_json,channels_json,sms_fallback,whatsapp_template_name,status,scheduled_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,user.institution_id,user.id,body.announcementType||'GENERAL',title,text,body.actionUrl||null,audienceType,JSON.stringify(audience),JSON.stringify(channels),body.smsFallback?1:0,body.whatsappTemplateName||null,status,scheduledAt).run();
  await audit(env.DB,user.id,user.institution_id,'ANNOUNCEMENT_CREATED','announcement',id,{audienceType,recipientCount:recipients.length,channels});
  return json({ok:true,id,status,recipientCount:recipients.length},201);
}

async function dispatchAnnouncement(env: Env, announcement: any) {
  const creator=await one<AuthUser>(env.DB.prepare(`SELECT id,institution_id,student_id,role,display_name,email,username FROM users WHERE id=?`).bind(announcement.created_by));if(!creator)return {sent:0,failed:0};
  const recipients=await resolveAnnouncementRecipients(env,creator,announcement.audience_type,parseJson(announcement.audience_json,{}));const channels=parseJson<string[]>(announcement.channels_json,['PANEL']);let sent=0,failed=0;
  for(const recipient of recipients){
    const panelId=uuid('andel');await env.DB.prepare(`INSERT OR IGNORE INTO announcement_deliveries(id,announcement_id,recipient_user_id,channel,status) VALUES(?,?,?,'PANEL','PENDING')`).bind(panelId,announcement.id,recipient.id).run();
    const already=await one(env.DB.prepare(`SELECT id FROM notifications WHERE recipient_user_id=? AND entity_type='announcement' AND entity_id=?`).bind(recipient.id,announcement.id));
    if(!already)await env.DB.prepare(`INSERT INTO notifications(id,recipient_user_id,institution_id,type,title,body,action_url,entity_type,entity_id) VALUES(?,?,?,?,?,?,?,?,?)`).bind(uuid('not'),recipient.id,announcement.institution_id,'ANNOUNCEMENT',announcement.title,announcement.body,announcement.action_url||null,'announcement',announcement.id).run();
    await env.DB.prepare(`UPDATE announcement_deliveries SET status='SENT',attempted_at=CURRENT_TIMESTAMP WHERE announcement_id=? AND recipient_user_id=? AND channel='PANEL'`).bind(announcement.id,recipient.id).run();sent++;
    let whatsappSent=false;
    if(channels.includes('WHATSAPP')){
      const identity=await one<any>(env.DB.prepare(`SELECT phone_e164 FROM nibiru_whatsapp_identities WHERE user_id=? AND status='VERIFIED'`).bind(recipient.id));
      const id=uuid('andel');await env.DB.prepare(`INSERT OR IGNORE INTO announcement_deliveries(id,announcement_id,recipient_user_id,channel,status) VALUES(?,?,?,'WHATSAPP','PENDING')`).bind(id,announcement.id,recipient.id).run();
      if(!identity){await env.DB.prepare(`UPDATE announcement_deliveries SET status='SKIPPED',failure_code='WHATSAPP_NOT_LINKED',attempted_at=CURRENT_TIMESTAMP WHERE announcement_id=? AND recipient_user_id=? AND channel='WHATSAPP'`).bind(announcement.id,recipient.id).run();}
      else if(!announcement.whatsapp_template_name||!whatsappReady(env)){await env.DB.prepare(`UPDATE announcement_deliveries SET status='SKIPPED',failure_code=?,attempted_at=CURRENT_TIMESTAMP WHERE announcement_id=? AND recipient_user_id=? AND channel='WHATSAPP'`).bind(!announcement.whatsapp_template_name?'TEMPLATE_NOT_CONFIGURED':'PROVIDER_NOT_CONFIGURED',announcement.id,recipient.id).run();}
      else {const result=await sendWhatsAppTemplate(env,identity.phone_e164,announcement.whatsapp_template_name,[announcement.title,announcement.body]);whatsappSent=result.ok;if(result.ok)await env.DB.prepare(`UPDATE announcement_deliveries SET status='SENT',provider_message_id=?,attempted_at=CURRENT_TIMESTAMP WHERE announcement_id=? AND recipient_user_id=? AND channel='WHATSAPP'`).bind(result.messageId||null,announcement.id,recipient.id).run();else {failed++;await env.DB.prepare(`UPDATE announcement_deliveries SET status='FAILED',failure_code=?,attempted_at=CURRENT_TIMESTAMP WHERE announcement_id=? AND recipient_user_id=? AND channel='WHATSAPP'`).bind(result.reason,announcement.id,recipient.id).run();}}
    }
    if(announcement.sms_fallback&&!whatsappSent){const id=uuid('andel');await env.DB.prepare(`INSERT OR IGNORE INTO announcement_deliveries(id,announcement_id,recipient_user_id,channel,status,failure_code,attempted_at) VALUES(?,?,?,'SMS','PENDING','SMS_PROVIDER_NOT_CONFIGURED',CURRENT_TIMESTAMP)`).bind(id,announcement.id,recipient.id).run();}
  }
  await env.DB.prepare(`UPDATE announcements SET status='SENT',sent_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(announcement.id).run();return {sent,failed,recipients:recipients.length};
}

export async function sendAnnouncement(env: Env, user: AuthUser, id: string) {
  const row=await one<any>(env.DB.prepare(`SELECT * FROM announcements WHERE id=?`).bind(id));if(!row)return badRequest('Duyuru bulunamadı.');if(user.role!=='SUPER_ADMIN'&&row.institution_id!==user.institution_id)return forbidden();if((user.role==='TEACHER'||user.role==='GUIDANCE_TEACHER')&&row.created_by!==user.id)return forbidden();
  await env.DB.prepare(`UPDATE announcements SET status='SENDING' WHERE id=?`).bind(id).run();const result=await dispatchAnnouncement(env,row);await audit(env.DB,user.id,row.institution_id,'ANNOUNCEMENT_SENT','announcement',id,result);return json({ok:true,...result});
}

export async function processScheduledAnnouncements(env: Env) {
  const rows=await all<any>(env.DB.prepare(`SELECT * FROM announcements WHERE status='SCHEDULED' AND scheduled_at<=CURRENT_TIMESTAMP ORDER BY scheduled_at LIMIT 25`));
  for(const row of rows){await env.DB.prepare(`UPDATE announcements SET status='SENDING' WHERE id=? AND status='SCHEDULED'`).bind(row.id).run();await dispatchAnnouncement(env,row)}
  return rows.length;
}

export async function worksheetCalendar(env: Env, user: AuthUser, url: URL) {
  if(!['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER','STUDENT'].includes(user.role))return forbidden();
  const grade=Number(url.searchParams.get('grade')||0),track=(url.searchParams.get('track')||'').trim(),classId=(url.searchParams.get('classId')||'').trim();const terms=[`w.status='PUBLISHED'`];const params:any[]=[];
  if(grade){terms.push('w.grade_level=?');params.push(grade)}if(track){terms.push('w.track=?');params.push(track)}
  let classScope=classId;
  if((user.role==='TEACHER'||user.role==='GUIDANCE_TEACHER')&&classScope){const allowed=await one(env.DB.prepare(`SELECT 1 FROM teacher_assignments WHERE user_id=? AND class_id=? AND active=1`).bind(user.id,classScope));if(!allowed)return forbidden();}
  if(user.role==='STUDENT'&&user.student_id){const enr=await enrollment(env,user.student_id);classScope=enr?.class_id||'';}
  const institutionId=user.institution_id;
  const rows=await all<any>(env.DB.prepare(`SELECT w.id,w.academic_year,w.program_code,w.grade_level,w.track,w.sequence_no,w.title,ce.id calendar_id,ce.planned_date,ce.planned_week,ce.actual_date,ce.status calendar_status,ce.note,c.name class_name,(SELECT group_concat(DISTINCT s.name) FROM worksheet_subjects ws JOIN subjects s ON s.id=ws.subject_id WHERE ws.worksheet_id=w.id) subjects,(SELECT group_concat(DISTINCT o.title) FROM worksheet_outcomes wo JOIN outcomes o ON o.id=wo.outcome_id WHERE wo.worksheet_id=w.id) outcomes,(SELECT count(*) FROM worksheet_question_links q WHERE q.worksheet_id=w.id AND q.solution_url IS NOT NULL) solution_count,(SELECT count(*) FROM worksheet_assets a WHERE a.worksheet_id=w.id) asset_count FROM worksheets w LEFT JOIN worksheet_calendar_entries ce ON ce.worksheet_id=w.id AND (ce.institution_id IS NULL OR ce.institution_id=?) ${classScope?'AND (ce.class_id IS NULL OR ce.class_id=?)':''} LEFT JOIN classes c ON c.id=ce.class_id WHERE ${terms.join(' AND ')} ORDER BY coalesce(ce.planned_date,'9999-12-31'),w.sequence_no LIMIT 300`).bind(...([institutionId||'',...(classScope?[classScope]:[]),...params])));
  return json({ok:true,entries:rows.map(x=>({...x,subjects:x.subjects?String(x.subjects).split(','):[],outcomes:x.outcomes?String(x.outcomes).split(','):[]}))});
}

export async function saveWorksheetCalendar(request: Request, env: Env, user: AuthUser) {
  if(!['SUPER_ADMIN','INSTITUTION_MANAGER'].includes(user.role))return forbidden('Föy takvimini Süper Admin veya kurum yöneticisi planlayabilir.');
  const body=await request.json<any>();if(!body.worksheetId||!body.plannedDate)return badRequest('Föy ve planlanan tarih gereklidir.');const worksheet=await one<any>(env.DB.prepare(`SELECT id FROM worksheets WHERE id=? AND status='PUBLISHED'`).bind(body.worksheetId));if(!worksheet)return badRequest('Yayımlanmış föy bulunamadı.');
  const institutionId=user.role==='SUPER_ADMIN'?(body.institutionId||null):user.institution_id;const classId=body.classId||null;if(classId&&institutionId){const cls=await one<any>(env.DB.prepare(`SELECT id FROM classes WHERE id=? AND institution_id=?`).bind(classId,institutionId));if(!cls)return badRequest('Sınıf kurum kapsamı dışında.');}
  let id=body.id||null;if(id){const existing=await one<any>(env.DB.prepare(`SELECT * FROM worksheet_calendar_entries WHERE id=?`).bind(id));if(!existing)return badRequest('Takvim kaydı bulunamadı.');if(user.role!=='SUPER_ADMIN'&&existing.institution_id!==user.institution_id)return forbidden();await env.DB.prepare(`UPDATE worksheet_calendar_entries SET worksheet_id=?,institution_id=?,class_id=?,planned_date=?,planned_week=?,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(body.worksheetId,institutionId,classId,body.plannedDate,body.plannedWeek??null,body.note||null,id).run();}
  else{id=uuid('wcal');await env.DB.prepare(`INSERT INTO worksheet_calendar_entries(id,worksheet_id,institution_id,class_id,planned_date,planned_week,note,created_by) VALUES(?,?,?,?,?,?,?,?)`).bind(id,body.worksheetId,institutionId,classId,body.plannedDate,body.plannedWeek??null,body.note||null,user.id).run();}
  await audit(env.DB,user.id,institutionId,'WORKSHEET_CALENDAR_SAVED','worksheet_calendar',id,{worksheetId:body.worksheetId,classId,plannedDate:body.plannedDate});return json({ok:true,id});
}

export async function applyWorksheetCalendar(env: Env, user: AuthUser, id: string) {
  if(!['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role))return forbidden();const row=await one<any>(env.DB.prepare(`SELECT * FROM worksheet_calendar_entries WHERE id=?`).bind(id));if(!row)return badRequest('Takvim kaydı bulunamadı.');if(user.role!=='SUPER_ADMIN'&&row.institution_id&&row.institution_id!==user.institution_id)return forbidden();if((user.role==='TEACHER'||user.role==='GUIDANCE_TEACHER')&&row.class_id){const allowed=await one(env.DB.prepare(`SELECT 1 FROM teacher_assignments WHERE user_id=? AND class_id=? AND active=1`).bind(user.id,row.class_id));if(!allowed)return forbidden();}
  await env.DB.prepare(`UPDATE worksheet_calendar_entries SET status='APPLIED',actual_date=date('now'),updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();await audit(env.DB,user.id,row.institution_id,'WORKSHEET_APPLIED','worksheet_calendar',id,{worksheetId:row.worksheet_id});return json({ok:true,id,status:'APPLIED'});
}

export async function handleAcademicGrowthApi(request: Request, env: Env, user: AuthUser): Promise<Response | null> {
  const url=new URL(request.url),path=url.pathname;const blocked=await accessBlocked(env,user);if(blocked&&user.role!=='SUPER_ADMIN')return json({ok:false,error:{code:'LICENSE_EXPIRED',message:blocked}},402);
  if(path==='/api/academic-targets/sources'&&request.method==='GET')return listTargetSources(env);
  if(path==='/api/academic-targets/search'&&request.method==='GET')return searchTargets(env,user,url);
  if(path==='/api/academic-targets/me'&&request.method==='GET')return getMyTarget(env,user,url);
  if(path==='/api/academic-targets/me'&&request.method==='POST')return setMyTarget(request,env,user);
  if(path==='/api/academic-targets/analysis'&&request.method==='GET')return getTargetAnalysis(env,user,url);
  if(path==='/api/academic-targets/import'&&request.method==='POST')return importOfficialTargets(request,env,user);
  if(path==='/api/announcements'&&request.method==='GET')return listAnnouncements(env,user);
  if(path==='/api/announcements'&&request.method==='POST')return createAnnouncement(request,env,user);
  const send=path.match(/^\/api\/announcements\/([^/]+)\/send$/);if(send&&request.method==='POST')return sendAnnouncement(env,user,send[1]);
  if(path==='/api/worksheet-calendar'&&request.method==='GET')return worksheetCalendar(env,user,url);
  if(path==='/api/worksheet-calendar'&&request.method==='POST')return saveWorksheetCalendar(request,env,user);
  const apply=path.match(/^\/api\/worksheet-calendar\/([^/]+)\/apply$/);if(apply&&request.method==='POST')return applyWorksheetCalendar(env,user,apply[1]);
  return null;
}
