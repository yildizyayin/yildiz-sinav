import type { AuthUser, Env } from '../types';
import { all, badRequest, forbidden, json, methodNotAllowed, one, uuid } from './db';

// Every staff assignment is matched to the enrollment's institution, season and class.
function access(user:AuthUser,subject?:string,writing=false):{sql:string;params:any[]} {
 if(writing&&user.role!=='TEACHER')return {sql:'0',params:[]};
 if(!writing&&user.role==='SUPER_ADMIN')return {sql:'1',params:[]};
 if(!writing&&user.role==='STUDENT')return {sql:'e.student_id=?',params:[user.student_id]};
 if(!writing&&user.role==='PARENT')return {sql:'EXISTS(SELECT 1 FROM parent_student_links pl WHERE pl.student_id=e.student_id AND pl.parent_user_id=? AND pl.active=1)',params:[user.id]};
 if(!user.institution_id)return {sql:'0',params:[]};
 if(!writing&&user.role==='INSTITUTION_MANAGER')return {sql:'e.institution_id=?',params:[user.institution_id]};
 if(!['TEACHER','GUIDANCE_TEACHER'].includes(user.role))return {sql:'0',params:[]};
 const assignment=writing?`ta.assignment_type='SUBJECT' AND ta.subject_id=${subject}`:
  subject?`(ta.assignment_type='GUIDANCE' OR (ta.assignment_type='SUBJECT' AND ta.subject_id=${subject}))`:'1';
 return {sql:`e.institution_id=? AND EXISTS(SELECT 1 FROM teacher_assignments ta WHERE ta.user_id=? AND ta.institution_id=e.institution_id AND ta.season_id=e.season_id AND ta.class_id=e.class_id AND ta.active=1 AND ${assignment})`,params:[user.institution_id,user.id]};
}
const enrollmentJoin=`FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id JOIN institution_seasons se ON se.id=e.season_id AND se.institution_id=e.institution_id JOIN classes c ON c.id=e.class_id AND c.institution_id=e.institution_id AND c.season_id=e.season_id`;
const activeContext=`e.status='ACTIVE' AND s.status='ACTIVE' AND se.status='ACTIVE' AND c.active=1`;
const rubricJoin=`JOIN curriculum_versions cv ON cv.academic_year=se.academic_year AND cv.program_code='SCHOOL' AND cv.verified=1 JOIN outcomes o ON o.curriculum_version_id=cv.id AND o.grade_level=e.grade_level AND o.active=1 AND o.official=1 JOIN curriculum_process_components pc ON pc.outcome_id=o.id JOIN learning_rubric_versions r ON r.component_id=pc.id`;
function bounded(value:unknown,min:number,max:number){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)throw new Error(`Metin ${min}–${max} karakter olmalıdır.`);return value.trim()}
async function fingerprint(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,'0')).join('')}

export async function handleRubricObservations(request:Request,env:Env,user:AuthUser):Promise<Response|null>{
 const url=new URL(request.url),match=url.pathname.match(/^\/api\/learning-observations\/students\/([^/]+)(?:\/([^/]+)\/withdraw)?$/);
 if(!match)return null;
 const studentId=match[1],withdrawId=match[2];
 if(!withdrawId&&request.method==='GET'){
  const historical=url.searchParams.get('view')==='history';
  const historyAvailable=['SUPER_ADMIN','INSTITUTION_MANAGER','STUDENT','PARENT'].includes(user.role);
  if(historical&&!historyAvailable)return forbidden('Geçmiş dönem görünümü bu rol için açık değil.');
  const enrollmentId=url.searchParams.get('enrollmentId')||'';
  if(enrollmentId.length>100)return badRequest('Dönem seçimi geçersiz.');
  const cursorText=url.searchParams.get('cursor')||'';
  let cursor:any=null;
  try{if(cursorText){if(cursorText.length>2000)throw new Error();cursor=JSON.parse(atob(cursorText));if(cursor.studentId!==studentId||cursor.view!==(historical?'history':'current')||cursor.enrollmentId!==enrollmentId||typeof cursor.id!=='string'||!cursor.id||cursor.id.length>100||typeof cursor.observedAt!=='string'||cursor.observedAt.length>40||!Number.isFinite(Date.parse(cursor.observedAt)))throw new Error();}}catch{return badRequest('Liste devamı geçersiz.');}
  const scope=access(user),rubricScope=access(user,'o.subject_id'),observationScope=access(user,'obs.subject_id');
  const readContext=historical?'1':activeContext;
  const readJoin=historical?enrollmentJoin.replace('JOIN classes c','LEFT JOIN classes c'):enrollmentJoin;
  const selectedContext=enrollmentId?' AND e.id=?':'';
  const selectedParams=enrollmentId?[enrollmentId]:[];
  const enrollments=await all<any>(env.DB.prepare(`SELECT e.id,e.season_id,e.grade_level,e.status,se.academic_year,c.name class_name ${readJoin} WHERE e.student_id=? AND ${readContext} AND (${scope.sql}) ORDER BY se.academic_year DESC,e.id LIMIT 101`).bind(studentId,...scope.params));
  if(!enrollments.length||enrollmentId&&!enrollments.some(e=>e.id===enrollmentId))return forbidden();
  if(enrollments.length>100)return badRequest('Dönem listesi güvenli sınırı aşıyor.');
  const rubrics=historical?[]:await all<any>(env.DB.prepare(`SELECT e.id enrollment_id,r.*,pc.code component_code,pc.title component_title,o.code outcome_code,o.title outcome_title,o.subject_id,CASE WHEN ?='TEACHER' AND EXISTS(SELECT 1 FROM teacher_assignments wa WHERE wa.user_id=? AND wa.institution_id=e.institution_id AND wa.season_id=e.season_id AND wa.class_id=e.class_id AND wa.subject_id=o.subject_id AND wa.assignment_type='SUBJECT' AND wa.active=1) THEN 1 ELSE 0 END can_observe ${enrollmentJoin} ${rubricJoin} WHERE e.student_id=? AND ${activeContext} AND (${rubricScope.sql}) ${selectedContext} ORDER BY r.published_at DESC,r.id`).bind(user.role,user.id,studentId,...rubricScope.params,...selectedParams));
  const cursorWhere=cursor?' AND (obs.observed_at<? OR (obs.observed_at=? AND obs.id<?))':'';
  const rows=await all<any>(env.DB.prepare(`SELECT obs.*,w.withdrawn_at ${readJoin} JOIN learning_rubric_observations obs ON obs.enrollment_id=e.id AND obs.student_id=e.student_id AND obs.institution_id=e.institution_id AND obs.season_id=e.season_id ${historical?'':'AND obs.class_id=e.class_id'} LEFT JOIN learning_rubric_observation_withdrawals w ON w.observation_id=obs.id WHERE e.student_id=? AND ${readContext} AND (${observationScope.sql}) ${selectedContext} AND w.observation_id IS NULL ${cursorWhere} ORDER BY obs.observed_at DESC,obs.id DESC LIMIT 201`).bind(studentId,...observationScope.params,...selectedParams,...(cursor?[cursor.observedAt,cursor.observedAt,cursor.id]:[])));
  const observations=rows.slice(0,200),last=observations[observations.length-1];
  return json({ok:true,enrollments,rubrics:rubrics.map(r=>({...r,criteria:JSON.parse(r.criteria_json),criteria_json:undefined})),observations:observations.map(r=>({...r,snapshot:JSON.parse(r.snapshot_json),selections:JSON.parse(r.selections_json),snapshot_json:undefined,selections_json:undefined,fingerprint:undefined,request_id:undefined})),hasMore:rows.length>200,nextCursor:rows.length>200?btoa(JSON.stringify({studentId,view:historical?'history':'current',enrollmentId,observedAt:last.observed_at,id:last.id})):null,historyAvailable,canObserve:!historical&&user.role==='TEACHER',policy:{view:historical?'HISTORICAL_AUTHORIZED_ENROLLMENTS':'CURRENT_ACTIVE_ENROLLMENTS',currentActiveEnrollmentOnly:!historical,automaticCompetencyInference:false}});
 }
 if(request.method!=='POST')return methodNotAllowed();
 if(user.role!=='TEACHER')return forbidden('Gözlem kaydı için ilgili dersin öğretmen yetkisi gerekir.');
 let body:any;try{const raw=await request.text();if(raw.length>20000)throw new Error('Gözlem kaydı çok uzun.');body=JSON.parse(raw);if(!body||typeof body!=='object')throw new Error('Gözlem kaydı geçersiz.')}catch(e){return badRequest(e instanceof Error?e.message:'Gözlem kaydı geçersiz.');}
 if(withdrawId){
  let reason:string;try{reason=bounded(body.reason,20,1000)}catch(e){return badRequest((e as Error).message)}
  const scope=access(user,'obs.subject_id',true);
  const result=await env.DB.prepare(`INSERT INTO learning_rubric_observation_withdrawals(observation_id,withdrawn_by,reason) SELECT obs.id,?,? ${enrollmentJoin} JOIN learning_rubric_observations obs ON obs.enrollment_id=e.id AND obs.student_id=e.student_id AND obs.institution_id=e.institution_id AND obs.season_id=e.season_id AND obs.class_id=e.class_id WHERE obs.id=? AND e.student_id=? AND obs.observer_id=? AND ${activeContext} AND (${scope.sql}) ON CONFLICT(observation_id) DO NOTHING`).bind(user.id,reason,withdrawId,studentId,user.id,...scope.params).run();
  if(!result.meta.changes)return forbidden('Gözlem geri çekilemedi; kayıt veya güncel yetkiyi kontrol edin.');return json({ok:true});
 }
 let n:any;try{
  if(body.confirmedObservation!==true)throw new Error('Gerçek gözlemin yayımlanması açıkça onaylanmalıdır.');
  const observedAt=new Date(bounded(body.observedAt,10,40));if(Number.isNaN(observedAt.getTime())||observedAt.getTime()>Date.now()+60000)throw new Error('Gözlem tarihi geçersiz veya gelecekte.');
  n={enrollmentId:bounded(body.enrollmentId,1,100),rubricId:bounded(body.rubricId,1,100),requestId:bounded(body.requestId,8,100),evidenceNote:bounded(body.evidenceNote,20,2000),feedback:bounded(body.feedback,10,2000),nextStep:bounded(body.nextStep,10,2000),observedAt:observedAt.toISOString()};
 }catch(e){return badRequest((e as Error).message)}
 const scope=access(user,'o.subject_id',true);
 const selected=await one<any>(env.DB.prepare(`SELECT e.*,se.academic_year,r.id rubric_id,r.version_label,r.title rubric_title,r.task_instructions,r.criteria_json,r.source_kind,r.source_url,r.source_title,r.source_locator,pc.code component_code,pc.title component_title,pc.source_url component_source_url,pc.source_locator component_source_locator,o.id outcome_id,o.code outcome_code,o.title outcome_title,o.subject_id,cv.id curriculum_version_id ${enrollmentJoin} ${rubricJoin} WHERE e.student_id=? AND e.id=? AND r.id=? AND ${activeContext} AND (${scope.sql})`).bind(studentId,n.enrollmentId,n.rubricId,...scope.params));
 if(!selected)return forbidden('Seçilen öğrenci, dönem ve rubrik için branş yetkisi bulunamadı.');
 const date=new Date(n.observedAt),yearStart=Number(selected.academic_year.slice(0,4)),yearEnd=Number(selected.academic_year.slice(5));
 if(date.getUTCFullYear()<yearStart||date.getUTCFullYear()>yearEnd)return badRequest('Gözlem tarihi seçili eğitim yılının dışında.');
 const criteria=JSON.parse(selected.criteria_json);let selections:any[];
 try{
  if(!Array.isArray(body.selections)||body.selections.length!==criteria.length)throw new Error('Her ölçüt için bir gözlenen düzey seçilmelidir.');
  const seen=new Set<string>();
  selections=criteria.map((c:any)=>{const matches=body.selections.filter((s:any)=>s&&s.criterionId===c.id);if(matches.length!==1||seen.has(c.id))throw new Error('Ölçüt seçimi geçersiz.');seen.add(c.id);const level=c.levels.find((l:any)=>l.id===matches[0].levelId);if(!level)throw new Error('Rubrikte bulunmayan düzey seçildi.');return {criterionId:c.id,levelId:level.id};});
 }catch(e){return badRequest((e as Error).message)}
 const snapshot={schemaVersion:1,rubricId:selected.rubric_id,versionLabel:selected.version_label,title:selected.rubric_title,taskInstructions:selected.task_instructions,criteria,sourceKind:selected.source_kind,sourceUrl:selected.source_url,sourceTitle:selected.source_title,sourceLocator:selected.source_locator,componentCode:selected.component_code,componentTitle:selected.component_title,componentSourceUrl:selected.component_source_url,componentSourceLocator:selected.component_source_locator,outcomeId:selected.outcome_id,outcomeCode:selected.outcome_code,outcomeTitle:selected.outcome_title,curriculumVersionId:selected.curriculum_version_id,academicYear:selected.academic_year,subjectId:selected.subject_id};
 const hash=await fingerprint(JSON.stringify({studentId,...n,selections}));
 const id=uuid('obs');
 const result=await env.DB.prepare(`INSERT INTO learning_rubric_observations(id,student_id,enrollment_id,institution_id,season_id,class_id,subject_id,rubric_id,snapshot_json,selections_json,evidence_note,feedback,next_step,observed_at,observer_id,request_id,fingerprint) SELECT ?,e.student_id,e.id,e.institution_id,e.season_id,e.class_id,o.subject_id,r.id,?,?,?,?,?,?,?,?,? ${enrollmentJoin} ${rubricJoin} WHERE e.student_id=? AND e.id=? AND r.id=? AND e.institution_id=? AND e.season_id=? AND e.class_id=? AND o.subject_id=? AND cv.id=? AND ${activeContext} AND (${scope.sql}) ON CONFLICT(observer_id,request_id) DO NOTHING`).bind(id,JSON.stringify(snapshot),JSON.stringify(selections),n.evidenceNote,n.feedback,n.nextStep,n.observedAt,user.id,n.requestId,hash,studentId,n.enrollmentId,n.rubricId,selected.institution_id,selected.season_id,selected.class_id,selected.subject_id,selected.curriculum_version_id,...scope.params).run();
 if(result.meta.changes)return json({ok:true,id},201);
 const prior=await one<any>(env.DB.prepare('SELECT id,fingerprint FROM learning_rubric_observations WHERE observer_id=? AND request_id=?').bind(user.id,n.requestId));
 if(prior&&prior.fingerprint===hash)return json({ok:true,id:prior.id,replayed:true});
 return json({ok:false,error:{code:'OBSERVATION_CONTEXT_OR_REQUEST_CONFLICT',message:'Yetki/bağlam değişti veya aynı işlem kimliği farklı kayıt için kullanıldı.'}},409);
}
