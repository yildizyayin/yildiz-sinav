import type { AuthUser, Env } from '../types';
import { all, badRequest, forbidden, json, notFound, one, uuid } from './db';

function parseJson<T>(v:unknown,f:T):T{if(typeof v!=='string'||!v)return f;try{return JSON.parse(v) as T}catch{return f}}
async function body(request:Request){return request.json().catch(()=>({})) as Promise<any>}

async function featureEnabled(env:Env,user:AuthUser,key:string){
  if(user.role==='SUPER_ADMIN')return true;
  if(!user.institution_id)return false;
  const r=await one<any>(env.DB.prepare(`SELECT COALESCE(o.enabled,f.enabled_default) enabled FROM platform_features f LEFT JOIN institution_feature_overrides o ON o.feature_key=f.feature_key AND o.institution_id=? WHERE f.feature_key=?`).bind(user.institution_id,key));
  return Number(r?.enabled||0)===1;
}

async function scopedStudent(env:Env,user:AuthUser,requested?:string|null){
  if(user.role==='STUDENT')return user.student_id;
  if(user.role==='PARENT'){
    if(!requested)return null;
    const r=await one<any>(env.DB.prepare(`SELECT 1 ok FROM parent_student_links WHERE parent_user_id=? AND student_id=? AND active=1`).bind(user.id,requested));return r?requested:null;
  }
  if(!requested)return null;
  if(user.role==='SUPER_ADMIN')return requested;
  if(!user.institution_id)return null;
  const r=await one<any>(env.DB.prepare(`SELECT 1 ok FROM student_enrollments WHERE student_id=? AND institution_id=? AND status='ACTIVE' LIMIT 1`).bind(requested,user.institution_id));return r?requested:null;
}

export async function rebuildExamScopeRanks(env:Env,examId:string,version:number){
  await env.DB.prepare(`DELETE FROM exam_result_scope_ranks WHERE exam_id=? AND snapshot_version=?`).bind(examId,version).run();
  const base=`FROM exam_result_snapshots s WHERE s.exam_id=? AND s.snapshot_version=?`;
  const statements=[
    env.DB.prepare(`INSERT INTO exam_result_scope_ranks(id,exam_id,participant_id,snapshot_version,scope_type,scope_id,rank,participant_count,score,net)
      SELECT 'rk_'||lower(hex(randomblob(16))),exam_id,participant_id,snapshot_version,'NATIONAL','TR',RANK() OVER(ORDER BY COALESCE(score,net) DESC),COUNT(*) OVER(),score,net ${base}`).bind(examId,version),
    env.DB.prepare(`INSERT INTO exam_result_scope_ranks(id,exam_id,participant_id,snapshot_version,scope_type,scope_id,rank,participant_count,score,net)
      SELECT 'rk_'||lower(hex(randomblob(16))),exam_id,participant_id,snapshot_version,'CITY',COALESCE(city,'BELIRTILMEMIS'),RANK() OVER(PARTITION BY COALESCE(city,'BELIRTILMEMIS') ORDER BY COALESCE(score,net) DESC),COUNT(*) OVER(PARTITION BY COALESCE(city,'BELIRTILMEMIS')),score,net ${base}`).bind(examId,version),
    env.DB.prepare(`INSERT INTO exam_result_scope_ranks(id,exam_id,participant_id,snapshot_version,scope_type,scope_id,rank,participant_count,score,net)
      SELECT 'rk_'||lower(hex(randomblob(16))),exam_id,participant_id,snapshot_version,'DISTRICT',COALESCE(city,'')||'|'||COALESCE(district,'BELIRTILMEMIS'),RANK() OVER(PARTITION BY COALESCE(city,''),COALESCE(district,'BELIRTILMEMIS') ORDER BY COALESCE(score,net) DESC),COUNT(*) OVER(PARTITION BY COALESCE(city,''),COALESCE(district,'BELIRTILMEMIS')),score,net ${base}`).bind(examId,version),
    env.DB.prepare(`INSERT INTO exam_result_scope_ranks(id,exam_id,participant_id,snapshot_version,scope_type,scope_id,rank,participant_count,score,net)
      SELECT 'rk_'||lower(hex(randomblob(16))),exam_id,participant_id,snapshot_version,'INSTITUTION',institution_id,RANK() OVER(PARTITION BY institution_id ORDER BY COALESCE(score,net) DESC),COUNT(*) OVER(PARTITION BY institution_id),score,net ${base}`).bind(examId,version),
    env.DB.prepare(`INSERT INTO exam_result_scope_ranks(id,exam_id,participant_id,snapshot_version,scope_type,scope_id,rank,participant_count,score,net)
      SELECT 'rk_'||lower(hex(randomblob(16))),exam_id,participant_id,snapshot_version,'GRADE',institution_id||'|'||COALESCE(CAST(grade_level AS TEXT),'0'),RANK() OVER(PARTITION BY institution_id,COALESCE(grade_level,0) ORDER BY COALESCE(score,net) DESC),COUNT(*) OVER(PARTITION BY institution_id,COALESCE(grade_level,0)),score,net ${base}`).bind(examId,version),
    env.DB.prepare(`INSERT INTO exam_result_scope_ranks(id,exam_id,participant_id,snapshot_version,scope_type,scope_id,rank,participant_count,score,net)
      SELECT 'rk_'||lower(hex(randomblob(16))),exam_id,participant_id,snapshot_version,'CLASS',institution_id||'|'||COALESCE(class_snapshot,'BELIRTILMEMIS'),RANK() OVER(PARTITION BY institution_id,COALESCE(class_snapshot,'BELIRTILMEMIS') ORDER BY COALESCE(score,net) DESC),COUNT(*) OVER(PARTITION BY institution_id,COALESCE(class_snapshot,'BELIRTILMEMIS')),score,net ${base}`).bind(examId,version),
    env.DB.prepare(`INSERT INTO exam_result_scope_ranks(id,exam_id,participant_id,snapshot_version,scope_type,scope_id,rank,participant_count,score,net)
      SELECT 'rk_'||lower(hex(randomblob(16))),s.exam_id,s.participant_id,s.snapshot_version,'NETWORK',m.network_id,
        RANK() OVER(PARTITION BY m.network_id ORDER BY COALESCE(s.score,s.net) DESC),COUNT(*) OVER(PARTITION BY m.network_id),s.score,s.net
      FROM exam_result_snapshots s JOIN institution_network_members m ON m.institution_id=s.institution_id AND m.active=1
      WHERE s.exam_id=? AND s.snapshot_version=?`).bind(examId,version),
  ];
  await env.DB.batch(statements);
  await materializePublisherQuestionAnalytics(env,examId,version);
}

async function materializePublisherQuestionAnalytics(env:Env,examId:string,version:number){
  await env.DB.prepare(`DELETE FROM publisher_question_analytics WHERE exam_id=? AND snapshot_version=?`).bind(examId,version).run();
  await env.DB.prepare(`INSERT INTO publisher_question_analytics(exam_id,snapshot_version,exam_question_id,subject_id,question_no,participant_count,correct_count,wrong_count,blank_count,invalid_count,success_percent)
    SELECT ?,?,q.id,q.subject_id,q.question_no,COUNT(a.id),
      SUM(CASE WHEN a.status='CORRECT' THEN 1 ELSE 0 END),SUM(CASE WHEN a.status='WRONG' THEN 1 ELSE 0 END),SUM(CASE WHEN a.status='BLANK' THEN 1 ELSE 0 END),SUM(CASE WHEN a.status='INVALID' THEN 1 ELSE 0 END),
      ROUND(100.0*SUM(CASE WHEN a.status='CORRECT' THEN 1 ELSE 0 END)/NULLIF(COUNT(a.id),0),2)
    FROM exam_questions q LEFT JOIN student_answers a ON a.exam_question_id=q.id LEFT JOIN exam_participants ep ON ep.id=a.participant_id AND ep.exam_id=?
    WHERE q.exam_id=? AND (a.id IS NULL OR ep.id IS NOT NULL) GROUP BY q.id,q.subject_id,q.question_no`).bind(examId,version,examId,examId).run();
}

export async function enrichStudentResult(env:Env,payload:any){
  const result=payload?.result;if(!result?.participant_id||!result?.snapshot_version)return payload;
  const ranks=await all<any>(env.DB.prepare(`SELECT r.scope_type,r.scope_id,r.rank,r.participant_count,n.name network_name FROM exam_result_scope_ranks r LEFT JOIN institution_networks n ON r.scope_type='NETWORK' AND n.id=r.scope_id WHERE r.exam_id=? AND r.participant_id=? AND r.snapshot_version=? ORDER BY CASE r.scope_type WHEN 'NATIONAL' THEN 1 WHEN 'CITY' THEN 2 WHEN 'DISTRICT' THEN 3 WHEN 'NETWORK' THEN 4 WHEN 'INSTITUTION' THEN 5 WHEN 'GRADE' THEN 6 ELSE 7 END`).bind(result.exam_id,result.participant_id,result.snapshot_version));
  return {...payload,result:{...result,scopeRanks:ranks}};
}

export async function enrichPublisherAnalytics(env:Env,publisherId:string,payload:any,examId?:string|null){
  let selected=examId;
  if(!selected)selected=payload?.exams?.find((x:any)=>Number(x.snapshot_version||0)>0)?.id||null;
  if(!selected)return {...payload,questionAnalytics:[],selectedExamId:null};
  const access=await one<any>(env.DB.prepare(`SELECT p.snapshot_version FROM exam_delivery_profiles p WHERE p.exam_id=? AND p.publisher_id=?`).bind(selected,publisherId));
  if(!access)return {...payload,questionAnalytics:[],selectedExamId:null};
  const rows=await all<any>(env.DB.prepare(`SELECT a.*,s.name subject_name FROM publisher_question_analytics a JOIN subjects s ON s.id=a.subject_id WHERE a.exam_id=? AND a.snapshot_version=? ORDER BY s.name,a.question_no`).bind(selected,access.snapshot_version));
  return {...payload,selectedExamId:selected,questionAnalytics:rows};
}

async function activeEntitlements(env:Env,studentId:string){
  const r=await one<any>(env.DB.prepare(`SELECT mp.code,mp.entitlement_json FROM student_memberships sm JOIN membership_plans mp ON mp.id=sm.plan_id WHERE sm.student_id=? AND sm.status='ACTIVE' AND (sm.ends_at IS NULL OR sm.ends_at>CURRENT_TIMESTAMP) ORDER BY mp.tier DESC,sm.starts_at DESC LIMIT 1`).bind(studentId));
  return r?{plan:r.code,entitlements:parseJson<Record<string,boolean>>(r.entitlement_json,{})}:{plan:'STANDARD',entitlements:{basic_nibiru:true}};
}

async function studentAdviceContext(env:Env,studentId:string){
  const student=await one<any>(env.DB.prepare(`SELECT s.id,s.first_name,s.last_name,e.grade_level,e.section,i.name institution_name FROM student_entities s LEFT JOIN student_enrollments e ON e.student_id=s.id AND e.status='ACTIVE' LEFT JOIN institutions i ON i.id=e.institution_id WHERE s.id=? LIMIT 1`).bind(studentId));
  const exams=await all<any>(env.DB.prepare(`SELECT e.title,e.exam_type,e.exam_date,er.net,er.score,er.success_percent FROM exam_participants ep JOIN exams e ON e.id=ep.exam_id JOIN exam_results er ON er.participant_id=ep.id WHERE ep.student_id=? ORDER BY COALESCE(e.exam_date,e.created_at) DESC LIMIT 5`).bind(studentId));
  const weak=await all<any>(env.DB.prepare(`SELECT n.title,n.node_type,s.name subject_name,ls.mastery,ls.confidence,ls.evidence_count FROM student_learning_state ls JOIN learning_nodes n ON n.id=ls.node_id LEFT JOIN subjects s ON s.id=n.subject_id WHERE ls.student_id=? AND ls.evidence_count>0 ORDER BY ls.mastery ASC,ls.evidence_count DESC LIMIT 8`).bind(studentId));
  const recovery=await all<any>(env.DB.prepare(`SELECT p.title,p.status,(SELECT COUNT(*) FROM recovery_steps x WHERE x.plan_id=p.id) step_count,(SELECT COUNT(*) FROM recovery_steps x WHERE x.plan_id=p.id AND x.status='DONE') done_count FROM recovery_plans p WHERE p.student_id=? AND p.status='ACTIVE' ORDER BY p.created_at DESC LIMIT 3`).bind(studentId));
  const assignments=await all<any>(env.DB.prepare(`SELECT a.title,a.due_at,r.status,r.progress FROM assignment_recipients r JOIN assignments a ON a.id=r.assignment_id WHERE r.student_id=? AND r.status<>'COMPLETED' ORDER BY COALESCE(a.due_at,a.created_at) LIMIT 6`).bind(studentId));
  return {student,exams,weak,recovery,assignments};
}

async function premiumAi(request:Request,env:Env,user:AuthUser,mode:'GUIDANCE'|'COACH'){
  if(user.role!=='STUDENT'||!user.student_id)return forbidden('Bu özellik öğrenci hesabına özeldir.');
  const feature=mode==='GUIDANCE'?'MEMBERSHIP':'MEMBERSHIP';if(!await featureEnabled(env,user,feature))return forbidden('Gold/Premium özellikleri kurumunuz için etkin değil.');
  const access=await activeEntitlements(env,user.student_id);const entitlement=mode==='GUIDANCE'?'ai_guidance':'ai_coach';if(!access.entitlements[entitlement])return json({ok:false,error:{code:'UPGRADE_REQUIRED',message:`${mode==='GUIDANCE'?'AI Rehber Öğretmeni':'AI Eğitim Koçu'} Gold/Premium üyelik gerektirir.`,plan:access.plan}},402);
  const b=await body(request);const message=String(b.message||'').trim();const context=await studentAdviceContext(env,user.student_id);
  const label=mode==='GUIDANCE'?'AI Rehber Öğretmeni':'AI Eğitim Koçu';
  const system=`Sen Nibiru'nun ${label} modusun. Yapay zekâ olduğunu açıkça belirt. Yalnız verilen doğrulanmış akademik bağlamı kullan; veri uydurma. Psikolojik/tıbbi tanı koyma. Öğrenciyi etiketleme. ${mode==='GUIDANCE'?'Hedef, akademik rota ve tercih hazırlığı konusunda ölçülü yönlendirme yap; yerleştirme garantisi verme.':'Günlük uygulanabilir çalışma planı, takip ve öncelik öner; aşırı yükleme yapma.'} Cevabı Türkçe, kısa ve uygulanabilir yaz.`;
  let answer='';
  if(env.AI){try{const model=env.NIBIRU_AI_MODEL||'@cf/zai-org/glm-4.7-flash';const r:any=await env.AI.run(model as any,{messages:[{role:'system',content:system},{role:'user',content:`MESAJ: ${message||'Bana bugün için yardımcı ol.'}\nDOĞRULANMIŞ BAĞLAM:\n${JSON.stringify(context).slice(0,14000)}`}],max_tokens:700,temperature:.2});answer=String(r?.response||r?.result?.response||r?.choices?.[0]?.message?.content||'').trim()}catch{}}
  if(!answer){const weak=context.weak?.[0];const task=context.assignments?.[0];answer=mode==='COACH'?`🤖 Nibiru · ${label}: ${task?`Önce “${task.title}” çalışmasını tamamlamanı öneriyorum.`:'Bugün kısa bir çalışma bloğu planlayabiliriz.'}${weak?` Ardından ${weak.subject_name||''} ${weak.title} alanında pekiştirme yap.`:''} Çalışma sonunda yanlışlarını kontrol et.`:`🤖 Nibiru · ${label}: Mevcut verilerini hedefinle birlikte değerlendirmek için son sınav eğilimini ve gelişime açık alanları kullanabilirim.${weak?` Şu anda ${weak.subject_name||''} ${weak.title} pekiştirme açısından öne çıkıyor.`:''}`;}
  if(!answer.startsWith('🤖'))answer=`🤖 Nibiru · ${label}: ${answer}`;
  return json({ok:true,mode,plan:access.plan,answer,contextSummary:{examCount:context.exams.length,weakCount:context.weak.length,assignmentCount:context.assignments.length}});
}

async function personalBook(request:Request,env:Env,user:AuthUser){
  if(!await featureEnabled(env,user,'STUDIO')||!await featureEnabled(env,user,'QUESTION_BANK'))return forbidden('Kişisel kitap özellikleri etkin değil.');
  if(!['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role))return forbidden();
  const b=await body(request);const sid=await scopedStudent(env,user,b.studentId);if(!sid)return forbidden('Öğrenci kapsam dışında.');
  const enr=await one<any>(env.DB.prepare(`SELECT e.institution_id,e.grade_level,s.first_name,s.last_name FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.student_id=? AND e.status='ACTIVE' ORDER BY e.created_at DESC LIMIT 1`).bind(sid));if(!enr)return badRequest('Aktif öğrenci kaydı yok.');
  const weak=await all<any>(env.DB.prepare(`SELECT node_id,mastery,evidence_count FROM student_learning_state WHERE student_id=? AND evidence_count>0 ORDER BY mastery ASC,evidence_count DESC LIMIT 12`).bind(sid));
  const count=Math.max(10,Math.min(120,Number(b.questionCount||40)));let qs:any[]=[];
  if(weak.length){const marks=weak.map(()=>'?').join(',');qs=await all<any>(env.DB.prepare(`SELECT DISTINCT q.id FROM question_bank q JOIN question_learning_links l ON l.question_id=q.id WHERE q.review_status='APPROVED' AND l.node_id IN (${marks}) ORDER BY q.difficulty,q.created_at DESC LIMIT ?`).bind(...weak.map(x=>x.node_id),count));}
  if(qs.length<count){const existing=new Set(qs.map(x=>x.id));const fallback=await all<any>(env.DB.prepare(`SELECT id FROM question_bank WHERE review_status='APPROVED' AND (? IS NULL OR grade_level=?) ORDER BY RANDOM() LIMIT ?`).bind(enr.grade_level,enr.grade_level,count-qs.length));qs.push(...fallback.filter(x=>!existing.has(x.id)).slice(0,count-qs.length));}
  if(!qs.length)return badRequest('Kişisel kitap için onaylı soru bulunamadı.','NO_APPROVED_QUESTIONS');
  const id=uuid('std');const title=String(b.title||`${enr.first_name} ${enr.last_name} · Kişisel Gelişim Kitabı`).trim();const stmts=[env.DB.prepare(`INSERT INTO studio_documents(id,institution_id,created_by,document_type,title,grade_level,status,config_json) VALUES(?,?,?,'PERSONAL_BOOK',?,?,'DRAFT',?)`).bind(id,enr.institution_id,user.id,title,enr.grade_level,JSON.stringify({studentId:sid,questionCount:qs.length,sourceExamId:b.sourceExamId||null})),env.DB.prepare(`INSERT INTO personal_book_profiles(document_id,student_id,institution_id,source_exam_id,weak_nodes_json) VALUES(?,?,?,?,?)`).bind(id,sid,enr.institution_id,b.sourceExamId||null,JSON.stringify(weak))];qs.forEach((q,i)=>stmts.push(env.DB.prepare(`INSERT INTO studio_document_items(document_id,question_id,booklet_code,sort_order) VALUES(?,?,'A',?)`).bind(id,q.id,i+1)));await env.DB.batch(stmts);return json({ok:true,id,title,questionCount:qs.length,weakNodeCount:weak.length},201);
}

async function recoveryStep(request:Request,env:Env,user:AuthUser,planId:string,stepId:string){
  const b=await body(request);const plan=await one<any>(env.DB.prepare(`SELECT * FROM recovery_plans WHERE id=?`).bind(planId));if(!plan)return notFound();const sid=await scopedStudent(env,user,plan.student_id);if(!sid)return forbidden();
  const status=String(b.status||'DONE').toUpperCase();if(!['DONE','SKIPPED'].includes(status))return badRequest('Durum DONE veya SKIPPED olmalı.');await env.DB.prepare(`UPDATE recovery_steps SET status=?,score=? WHERE id=? AND plan_id=?`).bind(status,b.score??null,stepId,planId).run();
  const current=await one<any>(env.DB.prepare(`SELECT sort_order FROM recovery_steps WHERE id=? AND plan_id=?`).bind(stepId,planId));if(current)await env.DB.prepare(`UPDATE recovery_steps SET status='AVAILABLE' WHERE plan_id=? AND status='PENDING' AND sort_order=(SELECT MIN(sort_order) FROM recovery_steps WHERE plan_id=? AND status='PENDING')`).bind(planId,planId).run();
  const left=await one<any>(env.DB.prepare(`SELECT COUNT(*) c FROM recovery_steps WHERE plan_id=? AND status NOT IN ('DONE','SKIPPED')`).bind(planId));if(Number(left?.c||0)===0){await env.DB.prepare(`UPDATE recovery_plans SET status='COMPLETED',completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(planId).run();await env.DB.prepare(`INSERT OR IGNORE INTO student_achievements(student_id,achievement_id) VALUES(?, 'ach_first_recovery')`).bind(plan.student_id).run();}
  return json({ok:true,completed:Number(left?.c||0)===0});
}

async function assignmentProgress(request:Request,env:Env,user:AuthUser,assignmentId:string){
  const b=await body(request);const sid=await scopedStudent(env,user,b.studentId||null);if(!sid)return forbidden();const row=await one<any>(env.DB.prepare(`SELECT 1 ok FROM assignment_recipients WHERE assignment_id=? AND student_id=?`).bind(assignmentId,sid));if(!row)return notFound('Ödev ataması bulunamadı.');const progress=Math.max(0,Math.min(100,Number(b.progress||0)));const status=progress>=100?'COMPLETED':progress>0?'STARTED':'ASSIGNED';await env.DB.prepare(`UPDATE assignment_recipients SET progress=?,status=?,completed_at=CASE WHEN ?='COMPLETED' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE assignment_id=? AND student_id=?`).bind(progress,status,status,assignmentId,sid).run();return json({ok:true,status,progress});
}

async function boardUpdate(request:Request,env:Env,user:AuthUser,id:string){
  if(!await featureEnabled(env,user,'BOARD'))return forbidden();if(!['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role))return forbidden();const row=await one<any>(env.DB.prepare(`SELECT * FROM board_sessions WHERE id=?`).bind(id));if(!row)return notFound();if(user.role!=='SUPER_ADMIN'&&row.institution_id!==user.institution_id)return forbidden();const b=await body(request);await env.DB.prepare(`UPDATE board_sessions SET state_json=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(JSON.stringify(b.state||parseJson(row.state_json,{})),b.status||row.status,id).run();return json({ok:true});
}

async function admissionCandidates(request:Request,env:Env,user:AuthUser,campaignId:string){
  if(!await featureEnabled(env,user,'ADMISSIONS'))return forbidden();const camp=await one<any>(env.DB.prepare(`SELECT * FROM admissions_campaigns WHERE id=?`).bind(campaignId));if(!camp)return notFound();if(user.role!=='SUPER_ADMIN'&&camp.institution_id!==user.institution_id)return forbidden();if(request.method==='GET')return json({ok:true,candidates:await all<any>(env.DB.prepare(`SELECT * FROM admissions_candidates WHERE campaign_id=? ORDER BY created_at DESC LIMIT 1000`).bind(campaignId))});const b=await body(request);if(!b.fullName)return badRequest('Aday adı gereklidir.');const id=uuid('cand');await env.DB.prepare(`INSERT INTO admissions_candidates(id,campaign_id,full_name,phone,email,grade_level,external_student_ref,application_status) VALUES(?,?,?,?,?,?,?,'APPLIED')`).bind(id,campaignId,String(b.fullName).trim(),b.phone||null,b.email||null,b.gradeLevel||null,b.externalStudentRef||null).run();return json({ok:true,id},201);
}

async function liveProviders(request:Request,env:Env,user:AuthUser){
  if(!await featureEnabled(env,user,'LIVE'))return forbidden();if(request.method==='GET')return json({ok:true,providers:await all<any>(env.DB.prepare(`SELECT * FROM live_providers WHERE active=1 ORDER BY provider_type,display_name`))});if(user.role!=='SUPER_ADMIN')return forbidden();const b=await body(request);if(!b.displayName||!b.providerType)return badRequest('Uzman adı ve türü gereklidir.');const id=uuid('lvp');await env.DB.prepare(`INSERT INTO live_providers(id,user_id,provider_type,display_name,subjects_json) VALUES(?,?,?,?,?)`).bind(id,b.userId||null,b.providerType,b.displayName,JSON.stringify(b.subjects||[])).run();return json({ok:true,id},201);
}

async function physicalContent(request:Request,env:Env,user:AuthUser){
  if(!await featureEnabled(env,user,'PHYSICAL_BRIDGE'))return forbidden();if(request.method==='GET'){const rows=await all<any>(env.DB.prepare(`SELECT c.*,p.name publisher_name,(SELECT COUNT(*) FROM physical_content_links l WHERE l.content_item_id=c.id) link_count FROM physical_content_items c LEFT JOIN publishers p ON p.id=c.publisher_id WHERE c.active=1 ORDER BY c.title LIMIT 500`));return json({ok:true,items:rows});}if(user.role!=='SUPER_ADMIN')return forbidden();const b=await body(request);if(!b.title)return badRequest('İçerik adı gereklidir.');const id=uuid('pci');await env.DB.prepare(`INSERT INTO physical_content_items(id,publisher_id,isbn_or_code,title,grade_level,academic_year) VALUES(?,?,?,?,?,?)`).bind(id,b.publisherId||null,b.isbnOrCode||null,b.title,b.gradeLevel||null,b.academicYear||'2026-2027').run();return json({ok:true,id},201);
}

async function mobileApi(request:Request,env:Env,user:AuthUser){
  if(!await featureEnabled(env,user,'MOBILE_API'))return forbidden('Mobil API bu kurumda etkin değil.');const p=new URL(request.url).pathname;
  if(p==='/api/platform/mobile/bootstrap'&&request.method==='GET'){const features=await all<any>(env.DB.prepare(`SELECT f.feature_key,COALESCE(o.enabled,f.enabled_default) enabled FROM platform_features f LEFT JOIN institution_feature_overrides o ON o.feature_key=f.feature_key AND o.institution_id=?`).bind(user.institution_id));return json({ok:true,user:{id:user.id,role:user.role,displayName:user.display_name,institutionId:user.institution_id,studentId:user.student_id},features:Object.fromEntries(features.map(f=>[f.feature_key,!!f.enabled])),apiVersion:1,capabilities:{cameraOptical:true,qrBridge:true,nibiru:true,pushRegistration:true}});}
  if(p==='/api/platform/mobile/devices'&&request.method==='POST'){const b=await body(request);if(!['IOS','ANDROID','WEB'].includes(b.platform)||!b.deviceKey)return badRequest('Platform ve cihaz anahtarı gereklidir.');const id=uuid('dev');await env.DB.prepare(`INSERT INTO mobile_devices(id,user_id,platform,device_key,push_provider,push_token,app_version,active,last_seen_at) VALUES(?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(user_id,platform,device_key) DO UPDATE SET push_provider=excluded.push_provider,push_token=excluded.push_token,app_version=excluded.app_version,active=1,last_seen_at=CURRENT_TIMESTAMP`).bind(id,user.id,b.platform,b.deviceKey,b.pushProvider||null,b.pushToken||null,b.appVersion||null).run();return json({ok:true});}
  return null;
}

export async function handleAdvancedPlatformApi(request:Request,env:Env,user:AuthUser):Promise<Response|null>{
  const url=new URL(request.url),p=url.pathname;
  if(p==='/api/platform/ai-guidance'&&request.method==='POST')return premiumAi(request,env,user,'GUIDANCE');
  if(p==='/api/platform/ai-coach'&&request.method==='POST')return premiumAi(request,env,user,'COACH');
  if(p==='/api/platform/personal-book/generate'&&request.method==='POST')return personalBook(request,env,user);
  let m=p.match(/^\/api\/platform\/recovery\/([^/]+)\/steps\/([^/]+)$/);if(m&&request.method==='POST')return recoveryStep(request,env,user,m[1],m[2]);
  m=p.match(/^\/api\/platform\/assignments\/([^/]+)\/progress$/);if(m&&request.method==='POST')return assignmentProgress(request,env,user,m[1]);
  m=p.match(/^\/api\/platform\/board\/([^/]+)$/);if(m&&request.method==='PUT')return boardUpdate(request,env,user,m[1]);
  m=p.match(/^\/api\/platform\/admissions\/([^/]+)\/candidates$/);if(m&&(request.method==='GET'||request.method==='POST'))return admissionCandidates(request,env,user,m[1]);
  if(p==='/api/platform/live/providers'&&(request.method==='GET'||request.method==='POST'))return liveProviders(request,env,user);
  if(p==='/api/platform/physical/content'&&(request.method==='GET'||request.method==='POST'))return physicalContent(request,env,user);
  if(p.startsWith('/api/platform/mobile/'))return mobileApi(request,env,user);
  return null;
}
