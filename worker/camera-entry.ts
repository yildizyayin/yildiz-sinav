import reportingApp from './reporting-entry';
import type { AuthUser, CanonicalRecord, Env, MatchCandidate } from './types';
import { getAuthUser } from './lib/auth';
import { all, audit, badRequest, forbidden, json, notFound, one, uuid } from './lib/db';
import { canEvaluateExam } from './lib/permissions';
import { matchParticipant } from './lib/matching';

function err(status:number,code:string,message:string,details?:unknown){return json({ok:false,error:{code,message,details}},status)}
async function auth(env:Env,request:Request){const u=await getAuthUser(env,request);return u||err(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.')}
function placeholders(items:unknown[]){return items.map(()=>'?').join(',')}

async function listCameraTemplates(env:Env,user:AuthUser):Promise<Response>{
 if(!canEvaluateExam(user.role))return forbidden();
 const rows=await all<any>(env.DB.prepare(`SELECT v.id,t.name,t.vendor,v.version,v.page_width_mm,v.page_height_mm,v.camera_geometry,v.fiducials
   FROM optical_template_versions v JOIN optical_templates t ON t.id=v.template_id
   WHERE t.active=1 AND t.status='READY' AND v.active=1 AND v.camera_geometry IS NOT NULL AND v.fiducials IS NOT NULL
   ORDER BY t.name,v.version`));
 return json({ok:true,templates:rows.map(r=>({id:r.id,name:r.name,vendor:r.vendor,version:r.version,pageWidthMm:Number(r.page_width_mm),pageHeightMm:Number(r.page_height_mm),cameraGeometry:JSON.parse(r.camera_geometry),fiducials:JSON.parse(r.fiducials)}))});
}

async function currentSeason(env:Env,institutionId:string){return one<any>(env.DB.prepare(`SELECT id,academic_year FROM institution_seasons WHERE institution_id=? ORDER BY CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END,academic_year DESC LIMIT 1`).bind(institutionId))}

async function assertInstitutionScope(env:Env,user:AuthUser,institutionId:string){
 const inst=await one<any>(env.DB.prepare('SELECT id,name,status FROM institutions WHERE id=?').bind(institutionId));
 if(!inst)return {response:notFound('Kurum bulunamadı.'),institution:null};
 if(user.role!=='SUPER_ADMIN'&&user.institution_id!==institutionId)return {response:forbidden(),institution:null};
 if(user.role!=='SUPER_ADMIN'&&inst.status!=='ACTIVE')return {response:err(403,'INSTITUTION_PASSIVE','Kurum hesabı pasif.'),institution:null};
 return {response:null,institution:inst};
}

async function assertExamScope(env:Env,user:AuthUser,examId:string,institutionId:string){
 const exam=await one<any>(env.DB.prepare('SELECT id,title,status,owner_type,institution_id FROM exams WHERE id=?').bind(examId));
 if(!exam)return {response:notFound('Sınav bulunamadı.'),exam:null};
 if(exam.status!=='ACTIVE')return {response:badRequest('Sınav değerlendirmeye açık değil.','EXAM_NOT_ACTIVE'),exam:null};
 if(user.role==='SUPER_ADMIN')return {response:null,exam};
 if(exam.owner_type==='INSTITUTION'&&exam.institution_id!==institutionId)return {response:forbidden(),exam:null};
 if(exam.owner_type==='CENTRAL'){
   const allowed=await one(env.DB.prepare('SELECT id FROM exam_institutions WHERE exam_id=? AND institution_id=? AND enabled=1').bind(examId,institutionId));
   if(!allowed)return {response:forbidden('Bu merkezi sınav kurumunuza açılmamış.'),exam:null};
 }
 return {response:null,exam};
}

async function loadCandidates(env:Env,institutionId:string,seasonId:string){
 const rows=await all<any>(env.DB.prepare(`SELECT s.id student_id,s.status,s.normalized_name,s.first_name,s.last_name,e.student_number,e.grade_level,e.section,e.class_id,c.name class_name
   FROM student_entities s JOIN student_enrollments e ON e.student_id=s.id LEFT JOIN classes c ON c.id=e.class_id
   WHERE e.institution_id=? AND e.season_id=? AND e.status='ACTIVE' AND s.status IN ('ACTIVE','GUEST')`).bind(institutionId,seasonId));
 return rows;
}

function hydrateIdentity(record:CanonicalRecord,candidates:any[]):CanonicalRecord{
 if(record.name?.trim())return record;
 const no=(record.student_number||'').trim();if(!no)return record;
 const byNo=candidates.filter(c=>(c.student_number||'').trim()===no);
 if(byNo.length!==1)return record;
 const c=byNo[0];return {...record,name:`${c.first_name} ${c.last_name}`.trim(),class_name:record.class_name||c.class_name||undefined,grade_level:record.grade_level??c.grade_level??undefined,section:record.section||c.section||undefined};
}

function normalizeRecord(raw:any,index:number,templateName:string):CanonicalRecord{
 const answers:Record<string,string>={};for(const [k,v] of Object.entries(raw?.answers_by_subject||{}))answers[String(k).toUpperCase()]=String(v??'').toUpperCase().replace(/[^ABCDE_]/g,'_');
 return {row_no:index+1,student_number:raw?.student_number?String(raw.student_number).trim():undefined,name:String(raw?.name||'').trim(),class_name:raw?.class_name?String(raw.class_name):undefined,grade_level:Number.isFinite(Number(raw?.grade_level))?Number(raw.grade_level):undefined,section:raw?.section?String(raw.section).trim().toUpperCase():undefined,booklet:raw?.booklet?String(raw.booklet).trim().toUpperCase():undefined,answers_by_subject:answers,source_type:'CAMERA',source_template:templateName,confidence:Math.max(0,Math.min(1,Number(raw?.confidence)||0)),issues:Array.isArray(raw?.issues)?raw.issues.map(String):[]};
}

async function cameraPreview(request:Request,env:Env,user:AuthUser,examId:string):Promise<Response>{
 if(!canEvaluateExam(user.role))return forbidden();
 const body=await request.json<{institutionId?:string;templateVersionId?:string;records?:any[]}>();
 const institutionId=user.role==='SUPER_ADMIN'?(body.institutionId||''):user.institution_id||'';if(!institutionId)return badRequest('Kurum seçilmelidir.');
 const instCheck=await assertInstitutionScope(env,user,institutionId);if(instCheck.response)return instCheck.response;
 const examCheck=await assertExamScope(env,user,examId,institutionId);if(examCheck.response)return examCheck.response;
 const season=await currentSeason(env,institutionId);if(!season)return badRequest('Kurum için aktif/uygun sezon bulunamadı.','SEASON_REQUIRED');
 if(!body.templateVersionId)return badRequest('Kamera optik şablonu belirlenmelidir.');
 const template=await one<any>(env.DB.prepare(`SELECT v.id,t.name,t.status,v.active FROM optical_template_versions v JOIN optical_templates t ON t.id=v.template_id WHERE v.id=?`).bind(body.templateVersionId));
 if(!template||template.status!=='READY'||!template.active)return badRequest('Seçilen kamera şablonu yayında ve READY durumda değil.','CAMERA_TEMPLATE_NOT_READY');
 const rawRecords=Array.isArray(body.records)?body.records:[];if(!rawRecords.length)return badRequest('Kamera kaydı bulunamadı.');if(rawRecords.length>500)return badRequest('Tek kamera oturumunda en fazla 500 optik gönderilebilir.');
 const candidates=await loadCandidates(env,institutionId,season.id);
 const candidateForMatch:MatchCandidate[]=candidates.map(c=>({student_id:c.student_id,status:c.status,normalized_name:c.normalized_name,student_number:c.student_number,grade_level:c.grade_level,section:c.section}));
 const subjects=await all<any>(env.DB.prepare(`SELECT s.code,es.question_count FROM exam_subjects es JOIN subjects s ON s.id=es.subject_id WHERE es.exam_id=?`).bind(examId));
 const booklets=await all<any>(env.DB.prepare('SELECT code FROM exam_booklets WHERE exam_id=? AND active=1').bind(examId));
 const allowedSubjects=new Map(subjects.map(s=>[String(s.code).toUpperCase(),Number(s.question_count)]));const allowedBooklets=new Set(booklets.map(b=>String(b.code).toUpperCase()));
 const batchId=uuid('batch');await env.DB.prepare(`INSERT INTO scan_batches (id,exam_id,institution_id,season_id,source_type,optical_template_version_id,detection_confidence,status,created_by) VALUES(?,?,?,?, 'CAMERA',?,?, 'PREVIEW',?)`).bind(batchId,examId,institutionId,season.id,body.templateVersionId,0,user.id).run();
 const counts={active:0,guest:0,newGuest:0,ambiguous:0,invalid:0};let confTotal=0;
 for(let i=0;i<rawRecords.length;i++){
   let record=hydrateIdentity(normalizeRecord(rawRecords[i],i,template.name),candidates);const issues=[...record.issues];
   if(record.confidence<.68)issues.push('Kamera okuma güveni düşük; kontrol edin.');
   for(const [code,seq] of Object.entries(record.answers_by_subject)){const q=allowedSubjects.get(code);if(!q)issues.push(`KRİTİK: Sınavda ${code} dersi bulunmuyor.`);else if(seq.length!==q)issues.push(`KRİTİK: ${code} cevap sayısı ${seq.length}; beklenen ${q}.`)}
   if(booklets.length===1&&!record.booklet)record={...record,booklet:String(booklets[0].code).toUpperCase()};
   if(record.booklet&&!allowedBooklets.has(record.booklet))issues.push(`KRİTİK: Geçersiz kitapçık ${record.booklet}.`);
   if(booklets.length>1&&!record.booklet)issues.push('KRİTİK: Kitapçık belirlenemedi.');
   record={...record,issues};const match=matchParticipant(record,candidateForMatch);
   if(match.status==='ACTIVE_MATCH')counts.active++;else if(match.status==='GUEST_MATCH')counts.guest++;else if(match.status==='NEW_GUEST')counts.newGuest++;else if(match.status==='AMBIGUOUS')counts.ambiguous++;else counts.invalid++;
   const combinedIssues=[...issues,...match.issues];confTotal+=record.confidence;
   await env.DB.prepare(`INSERT INTO scan_records (id,batch_id,row_no,canonical_json,matched_student_id,match_status,match_confidence,issues_json) VALUES(?,?,?,?,?,?,?,?)`).bind(uuid('scan'),batchId,i+1,JSON.stringify(record),match.student_id||null,match.status,match.confidence,JSON.stringify(combinedIssues)).run();
 }
 const issueCount=await one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM scan_records WHERE batch_id=? AND (match_status IN ('AMBIGUOUS','INVALID') OR issues_json!='[]')`).bind(batchId));const status=(issueCount?.c||0)>0?'NEEDS_REVIEW':'READY';const confidence=rawRecords.length?confTotal/rawRecords.length:0;
 await env.DB.prepare('UPDATE scan_batches SET status=?,detection_confidence=? WHERE id=?').bind(status,confidence,batchId).run();
 await audit(env.DB,user.id,institutionId,'CAMERA_SCAN_PREVIEWED','scan_batch',batchId,{examId,total:rawRecords.length,counts,templateVersionId:body.templateVersionId,confidence});
 return json({ok:true,batchId,detection:{templateId:body.templateVersionId,templateName:template.name,confidence},counts,total:rawRecords.length,status});
}

async function patchCameraIdentity(request:Request,env:Env,user:AuthUser,batchId:string,recordId:string):Promise<Response>{
 if(!canEvaluateExam(user.role))return forbidden();const batch=await one<any>(env.DB.prepare(`SELECT * FROM scan_batches WHERE id=? AND source_type='CAMERA'`).bind(batchId));if(!batch)return notFound('Kamera batch bulunamadı.');const scope=await assertInstitutionScope(env,user,batch.institution_id);if(scope.response)return scope.response;
 const row=await one<any>(env.DB.prepare('SELECT * FROM scan_records WHERE id=? AND batch_id=?').bind(recordId,batchId));if(!row)return notFound('Kamera kaydı bulunamadı.');const body=await request.json<{name?:string;studentNumber?:string;gradeLevel?:number;section?:string;className?:string;booklet?:string}>();let canonical=JSON.parse(row.canonical_json) as CanonicalRecord;canonical={...canonical,name:body.name!=null?String(body.name).trim():canonical.name,student_number:body.studentNumber!=null?String(body.studentNumber).trim():canonical.student_number,grade_level:body.gradeLevel!=null?Number(body.gradeLevel):canonical.grade_level,section:body.section!=null?String(body.section).trim().toUpperCase():canonical.section,class_name:body.className!=null?String(body.className).trim():canonical.class_name,booklet:body.booklet!=null?String(body.booklet).trim().toUpperCase():canonical.booklet};
 const candidates=await loadCandidates(env,batch.institution_id,batch.season_id);canonical=hydrateIdentity(canonical,candidates);canonical.issues=canonical.issues.filter(x=>!x.startsWith('Kamera okuma güveni düşük'));
 const match=matchParticipant(canonical,candidates.map(c=>({student_id:c.student_id,status:c.status,normalized_name:c.normalized_name,student_number:c.student_number,grade_level:c.grade_level,section:c.section})));
 await env.DB.prepare('UPDATE scan_records SET canonical_json=?,matched_student_id=?,match_status=?,match_confidence=?,issues_json=? WHERE id=? AND batch_id=?').bind(JSON.stringify(canonical),match.student_id||null,match.status,match.confidence,JSON.stringify([...canonical.issues,...match.issues]),recordId,batchId).run();await refreshBatchStatus(env,batchId);return json({ok:true,match});
}

async function acceptCameraIssues(env:Env,user:AuthUser,batchId:string,recordId:string):Promise<Response>{
 if(!canEvaluateExam(user.role))return forbidden();const batch=await one<any>(env.DB.prepare(`SELECT * FROM scan_batches WHERE id=? AND source_type='CAMERA'`).bind(batchId));if(!batch)return notFound();const scope=await assertInstitutionScope(env,user,batch.institution_id);if(scope.response)return scope.response;const row=await one<any>(env.DB.prepare('SELECT match_status,issues_json,canonical_json FROM scan_records WHERE id=? AND batch_id=?').bind(recordId,batchId));if(!row)return notFound();if(['AMBIGUOUS','INVALID'].includes(row.match_status))return badRequest('Önce öğrenci kimliğini düzeltin.');const issues=JSON.parse(row.issues_json||'[]') as string[];if(issues.some(x=>String(x).startsWith('KRİTİK:')))return badRequest('Kritik kamera hatası kabul edilerek geçilemez. Şablon veya kayıt düzeltilmelidir.','CAMERA_CRITICAL_ISSUE',issues);const canonical=JSON.parse(row.canonical_json);canonical.issues=[];await env.DB.prepare(`UPDATE scan_records SET canonical_json=?,issues_json='[]' WHERE id=? AND batch_id=?`).bind(JSON.stringify(canonical),recordId,batchId).run();await refreshBatchStatus(env,batchId);return json({ok:true});
}

async function refreshBatchStatus(env:Env,batchId:string){const p=await one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM scan_records WHERE batch_id=? AND (match_status IN ('AMBIGUOUS','INVALID') OR issues_json!='[]')`).bind(batchId));await env.DB.prepare('UPDATE scan_batches SET status=? WHERE id=?').bind((p?.c||0)>0?'NEEDS_REVIEW':'READY',batchId).run()}

export default {async fetch(request:Request,env:Env):Promise<Response>{const url=new URL(request.url);try{
 if(url.pathname==='/api/camera/templates'&&request.method==='GET'){const u=await auth(env,request);if(u instanceof Response)return u;return listCameraTemplates(env,u)}
 const preview=url.pathname.match(/^\/api\/exams\/([^/]+)\/camera-preview$/);if(preview&&request.method==='POST'){const u=await auth(env,request);if(u instanceof Response)return u;return cameraPreview(request,env,u,preview[1])}
 const identity=url.pathname.match(/^\/api\/camera\/scan-batches\/([^/]+)\/records\/([^/]+)\/identity$/);if(identity&&request.method==='POST'){const u=await auth(env,request);if(u instanceof Response)return u;return patchCameraIdentity(request,env,u,identity[1],identity[2])}
 const accept=url.pathname.match(/^\/api\/camera\/scan-batches\/([^/]+)\/records\/([^/]+)\/accept$/);if(accept&&request.method==='POST'){const u=await auth(env,request);if(u instanceof Response)return u;return acceptCameraIssues(env,u,accept[1],accept[2])}
 return reportingApp.fetch(request,env);
 }catch(e){console.error('Camera runtime error',e);return err(500,'CAMERA_SERVER_ERROR','Kamera kaydı işlenirken sunucu hatası oluştu.')}}} satisfies ExportedHandler<Env>;
