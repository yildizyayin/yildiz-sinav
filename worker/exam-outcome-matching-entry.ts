import examAdmin from './exam-admin-entry';
import type {AuthUser,Env} from './types';
import {getAuthUser} from './lib/auth';
import {all,one,json,forbidden,notFound,badRequest,uuid} from './lib/db';
import {approvedLabelOutcome,catalogSubjectsFor,examOutcomeScope,outcomeFitsQuestion,scopedOutcomeCatalog,matchScopedOutcome} from './lib/exam-outcome-matching';
import {withExamOperationLock} from './lib/exam-operation-lock';
import {refreshExamOutcomeAnalysis} from './lib/exam-outcome-history';

async function managedExam(env:Env,user:AuthUser,id:string):Promise<any>{
 const exam=await one<any>(env.DB.prepare('SELECT e.* FROM exams e WHERE e.id=? AND NOT EXISTS(SELECT 1 FROM exam_revision_state r WHERE r.exam_id=e.id AND r.app_trashed_at IS NOT NULL)').bind(id));
 return exam&&(user.role==='SUPER_ADMIN'||(user.role==='INSTITUTION_MANAGER'&&exam.owner_type==='INSTITUTION'&&exam.institution_id===user.institution_id))?exam:null;
}
export async function getOutcomeMappings(env:Env,exam:any):Promise<Response>{
 const revision=Number((await one<any>(env.DB.prepare('SELECT coalesce(max(revision),0) revision FROM exam_outcome_analysis_revisions WHERE exam_id=?').bind(exam.id)))?.revision||0);
 const questions=await all<any>(env.DB.prepare('SELECT q.id,q.subject_id,q.question_no,s.name subject_name FROM exam_questions q JOIN subjects s ON s.id=q.subject_id WHERE q.exam_id=? ORDER BY q.global_no').bind(exam.id));
 const mappings=await all<any>(env.DB.prepare('SELECT qo.* FROM question_outcomes qo JOIN exam_questions q ON q.id=qo.exam_question_id WHERE q.exam_id=?').bind(exam.id));
 const refs=await all<any>(env.DB.prepare('SELECT qpo.exam_question_id,pol.label_path_json FROM question_publisher_outcomes qpo JOIN publisher_outcome_labels pol ON pol.id=qpo.publisher_outcome_id JOIN exam_questions q ON q.id=qpo.exam_question_id WHERE q.exam_id=?').bind(exam.id));
 const scope=examOutcomeScope(exam);
 const outcomes=await scopedOutcomeCatalog(env,scope);
 // A029: the editor says up front that saving re-analyses results that already exist.
 const resultCount=Number((await one<any>(env.DB.prepare('SELECT count(*) c FROM exam_participants ep JOIN exam_results er ON er.participant_id=ep.id WHERE ep.exam_id=?').bind(exam.id)))?.c||0);
 const published=await one<any>(env.DB.prepare("SELECT (SELECT 1 FROM exam_delivery_profiles WHERE exam_id=? AND result_freeze_status='PUBLISHED') app,(SELECT 1 FROM exam_channel_publications WHERE exam_id=? AND channel='RESULT_NETWORK' AND status='ACTIVE') network").bind(exam.id,exam.id));
 return json({ok:true,revision,resultCount,appPublished:!!published?.app,networkPublished:!!published?.network,outcomeMode:exam.outcome_mode||'OPTIONAL',catalogYear:outcomes[0]?.academic_year||null,questions:questions.map(q=>({...q,catalog_subject_ids:catalogSubjectsFor(scope,q.subject_id),outcome_ids:mappings.filter(m=>m.exam_question_id===q.id).map(m=>m.outcome_id),references:refs.filter(r=>r.exam_question_id===q.id).map(r=>{try{return JSON.parse(r.label_path_json)}catch{return {}}})})),outcomes,catalogStatus:outcomes.length?'AVAILABLE':'EMPTY'});
}
export async function putOutcomeMappings(request:Request,env:Env,user:AuthUser,examId:string):Promise<Response>{
 return withExamOperationLock(env,examId,'EXAM_OUTCOME_EDIT',async locked=>{
 const exam=await managedExam(locked,user,examId);if(!exam)return notFound();
 const body:any=await request.json().catch(()=>null);
 if(!body||!Number.isInteger(body.expectedRevision)||!Array.isArray(body.mappings)||body.mappings.length>1000)return badRequest('Güncel analiz sürümü ve soru eşleştirmeleri gereklidir.');
 const revision=Number((await one<any>(locked.DB.prepare('SELECT coalesce(max(revision),0) revision FROM exam_outcome_analysis_revisions WHERE exam_id=?').bind(examId)))?.revision||0);
 if(revision!==body.expectedRevision)return json({ok:false,error:{code:'OUTCOME_REVISION_CHANGED',message:'Kazanımlar değişti. Güncel eşleştirmeleri yeniden açın.'}},409);
 const questions=await all<any>(locked.DB.prepare('SELECT id,subject_id FROM exam_questions WHERE exam_id=?').bind(examId));
 const scope=examOutcomeScope(exam);
 const catalog=await scopedOutcomeCatalog(locked,scope);
 const mutations:D1PreparedStatement[]=[];const seen=new Set<string>();
 for(const mapping of body.mappings){
 const q=questions.find(q=>q.id===mapping.questionId);
 if(!q||seen.has(q.id)||!Array.isArray(mapping.outcomeIds)||mapping.outcomeIds.length>20)return badRequest('Geçersiz veya tekrarlanan soru eşleştirmesi.');seen.add(q.id);
 const ids=[...new Set<string>(mapping.outcomeIds)];
 if(ids.some(id=>!catalog.some(o=>o.id===id&&outcomeFitsQuestion(scope,q.subject_id,o))))return badRequest('Kazanım doğrulanmış ders, sınıf, yıl ve program kataloğunda bulunmuyor.','OUTCOME_SCOPE_MISMATCH');
 mutations.push(locked.DB.prepare('DELETE FROM question_outcomes WHERE exam_question_id=?').bind(q.id));
 for(const id of ids)mutations.push(locked.DB.prepare('INSERT INTO question_outcomes(exam_question_id,outcome_id) VALUES(?,?)').bind(q.id,id));
 // S028: the person's choice is remembered for the publisher's label, so the same label maps by itself next time.
 if(ids.length)mutations.push(locked.DB.prepare(`UPDATE publisher_outcome_labels SET canonical_outcome_id=?,mapping_status='APPROVED',confidence=1,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id IN (SELECT publisher_outcome_id FROM question_publisher_outcomes WHERE exam_question_id=?)`).bind(ids[0],user.id,q.id));
 }
 if(body.outcomeMode!==undefined){if(!['OPTIONAL','OFFICIAL_REQUIRED'].includes(body.outcomeMode))return badRequest('Geçersiz kazanım politikası.');mutations.push(locked.DB.prepare('UPDATE exams SET outcome_mode=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(body.outcomeMode,examId));}
 const reason=String(body.reason||'Kazanım eşleştirmesi güncellendi.').trim();if(reason.length>500)return badRequest('Gerekçe 500 karakteri geçemez.');
 mutations.push(locked.DB.prepare('INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,?,?,?,?)').bind(uuid('aud'),user.id,exam.institution_id,'EXAM_OUTCOMES_UPDATED','exam',examId,JSON.stringify({expectedRevision:revision,questionCount:seen.size,reason})));
 const result=await refreshExamOutcomeAnalysis(locked,examId,user.id,mutations);
 return json({ok:true,...result,scoresChanged:false,message:'Geçmiş kazanım analizleri güncellendi. Puan ve sıralama değişmedi.'});
 });
}
export default {
 async fetch(request:Request,env:Env):Promise<Response>{
 const url=new URL(request.url);const match=url.pathname.match(/^\/api\/exam-definitions\/([^/]+)\/(outcome-catalog|outcome-match-preview|outcome-mappings)$/);
 if(!match)return examAdmin.fetch(request,env);
 const user=await getAuthUser(env,request);if(!user)return json({ok:false,error:{code:'UNAUTHENTICATED',message:'Oturum açın.'}},401);
 if(!['SUPER_ADMIN','INSTITUTION_MANAGER'].includes(user.role)||user.must_change_password)return forbidden();
 if(request.method!=='GET'&&request.headers.get('Origin')!==url.origin)return forbidden('İşlemi ANUNEX üzerinden başlatın.');
 const exam=await managedExam(env,user,match[1]);if(!exam)return notFound();
 if(match[2]==='outcome-mappings')return request.method==='GET'?getOutcomeMappings(env,exam):request.method==='PUT'?putOutcomeMappings(request,env,user,exam.id):json({ok:false},405);
 const subjectId=url.searchParams.get('subjectId')||undefined;
 const catalog=await scopedOutcomeCatalog(env,examOutcomeScope(exam),subjectId);
 if(match[2]==='outcome-catalog'&&request.method==='GET'){
 const q=(url.searchParams.get('q')||'').trim().toLocaleLowerCase('tr-TR');
 return json({ok:true,outcomes:catalog.filter(o=>!q||`${o.code||''} ${o.title}`.toLocaleLowerCase('tr-TR').includes(q)),scope:examOutcomeScope(exam),catalogStatus:catalog.length?'AVAILABLE':'EMPTY',message:catalog.length?'Doğrulanmış resmî kazanım listesi.':'Bu ders, sınıf, yıl ve program için doğrulanmış katalog bulunamadı.'});
 }
 if(match[2]==='outcome-match-preview'&&request.method==='POST'){
 const body:any=await request.json().catch(()=>null);if(!body||!Array.isArray(body.entries)||body.entries.length>1000)return badRequest('En fazla 1000 kazanım referansı gönderin.');
 const scope=examOutcomeScope(exam),programCode=scope.programCode;
 const publisher=exam.publisher_name?await one<any>(env.DB.prepare('SELECT id FROM publishers WHERE lower(name)=lower(?) OR lower(code)=lower(?) LIMIT 1').bind(String(exam.publisher_name).trim(),String(exam.publisher_name).trim())):null;
 const matches:any[]=[];
 for(const e of body.entries){
  const approved=await approvedLabelOutcome(env,publisher?.id||null,programCode,e.subjectId,e.reference);
  if(approved&&catalog.some(o=>o.id===approved&&outcomeFitsQuestion(scope,e.subjectId,o))){matches.push({subjectId:e.subjectId,questionNo:e.questionNo,reference:e.reference,reason:'APPROVED',outcomeId:approved,suggestions:[]});continue;}
  matches.push({subjectId:e.subjectId,questionNo:e.questionNo,reference:e.reference,...matchScopedOutcome(e.reference,e.subjectId,catalog,scope)});
 }
 return json({ok:true,matches,catalogYear:catalog[0]?.academic_year||null,summary:{matched:matches.filter((m:any)=>m.outcomeId).length,review:matches.filter((m:any)=>['AMBIGUOUS','SUGGESTED'].includes(m.reason)).length,unmatched:matches.filter((m:any)=>!m.outcomeId&&!['AMBIGUOUS','SUGGESTED'].includes(m.reason)).length}});
 }
 return json({ok:false},405);
 },
 async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){return examAdmin.scheduled(event,env,ctx)}
} satisfies ExportedHandler<Env>;
