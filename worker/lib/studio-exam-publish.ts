import type { AuthUser,Env } from '../types';
import {all,one,badRequest,forbidden,json,notFound,uuid} from './db';
import {planStudioDelivery,resolveStudioDeliveryKind} from './studio-delivery-routing';
import {validateBookletPermutation} from './studio-booklet-mapping';

/** Single-booklet publication. Multi-booklet position mapping must be completed separately. */
export async function publishStudioExam(request:Request,env:Env,user:AuthUser,documentId:string):Promise<Response>{
 if(!['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER'].includes(user.role))return forbidden();
 const doc=await one<any>(env.DB.prepare('SELECT * FROM studio_documents WHERE id=?').bind(documentId));
 if(!doc)return notFound('Studio belgesi bulunamadı.');
 if(!doc.institution_id||(user.role!=='SUPER_ADMIN'&&user.institution_id!==doc.institution_id))return forbidden();
 if(user.role==='TEACHER'&&doc.created_by!==user.id)return forbidden();
 const existing=await one<{external_id:string}>(env.DB.prepare("SELECT external_id FROM studio_delivery_links WHERE document_id=? AND institution_id=? AND publication_revision=1 AND delivery_kind='EXAM'").bind(documentId,doc.institution_id));
 if(existing)return json({ok:true,examId:existing.external_id,reused:true});
 if(doc.status!=='READY'||!resolveStudioDeliveryKind(doc.document_type,'EXAM').ok)return badRequest('Sadece READY sınav belgesi yayımlanabilir.','STUDIO_NOT_READY');
 const payload:any=await request.json().catch(()=>({}));
 const academicYear=String(payload.academicYear||'');
 if(!/^[0-9]{4}-[0-9]{4}$/.test(academicYear)||Number(academicYear.slice(5))!==Number(academicYear.slice(0,4))+1)
  return badRequest('Eğitim yılı geçersiz.','INVALID_ACADEMIC_YEAR');
 const booklets=await all<{booklet_code:string}>(env.DB.prepare('SELECT DISTINCT booklet_code FROM studio_document_items WHERE document_id=? ORDER BY booklet_code').bind(documentId));
 if(booklets.length!==1||booklets[0].booklet_code!=='A')
  return badRequest('A/B eşleme doğrulaması tamamlanmadığı için yalnız A kitapçığı yayına alınabilir.','MULTIBOOKLET_NOT_READY');
 const rows=await all<any>(env.DB.prepare(`SELECT i.question_id,i.sort_order,q.subject_id,q.grade_level,q.academic_year,q.review_status,q.copyright_status,q.correct_answer
 FROM studio_document_items i JOIN question_bank q ON q.id=i.question_id WHERE i.document_id=? AND i.booklet_code='A' ORDER BY i.sort_order`).bind(documentId));
 const integrity=validateBookletPermutation(rows.map(r=>({bookletCode:'A',questionId:r.question_id,position:Number(r.sort_order),subjectId:r.subject_id,correctAnswer:r.correct_answer})));
 if(!integrity.ok)return badRequest('Kitapçık soru sırası veya cevap anahtarı doğrulanamadı.','BOOKLET_INTEGRITY_FAILED');
 const plan=planStudioDelivery({documentId,institutionId:doc.institution_id,publicationRevision:1,kind:'EXAM',approved:true,questionIds:rows.map(r=>r.question_id),bookletCodes:['A']});
 if(!plan.ok)return badRequest(plan.reason,'INVALID_STUDIO_ITEMS');
 if(rows.some(r=>r.review_status!=='APPROVED'||!['OWNED','LICENSED','PUBLIC_DOMAIN'].includes(r.copyright_status)||r.academic_year!==academicYear||
  (doc.grade_level!==null&&Number(r.grade_level)!==Number(doc.grade_level))||!['A','B','C','D','E'].includes(r.correct_answer)))
  return badRequest('Soru onayı, yıl, sınıf veya cevap anahtarı tutarsız.','QUESTION_NOT_READY');
 const outcomeRows=await all<{question_id:string;outcome_id:string}>(env.DB.prepare(`SELECT DISTINCT i.question_id,o.id outcome_id FROM studio_document_items i
 JOIN question_bank q ON q.id=i.question_id JOIN question_learning_links l ON l.question_id=q.id
 JOIN outcomes o ON l.node_id='ln_'||o.id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
 WHERE i.document_id=? AND i.booklet_code='A' AND o.active=1 AND cv.verified=1
 AND o.subject_id=q.subject_id AND o.grade_level=q.grade_level AND cv.grade_level=q.grade_level AND cv.academic_year=q.academic_year`).bind(documentId));
 const byQuestion=new Map<string,string[]>();for(const r of outcomeRows)byQuestion.set(r.question_id,[...(byQuestion.get(r.question_id)||[]),r.outcome_id]);
 if(rows.some(r=>!byQuestion.has(r.question_id)))return badRequest('Sınav sorularının kazanım bağlantıları doğrulanamadı.','OUTCOME_REQUIRED');
 if(user.role==='TEACHER'){
  const permitted=await all<{subject_id:string}>(env.DB.prepare("SELECT subject_id FROM teacher_assignments WHERE user_id=? AND institution_id=? AND assignment_type='SUBJECT' AND active=1").bind(user.id,doc.institution_id));
  const allowed=new Set(permitted.map(r=>r.subject_id));
  if(rows.some(r=>!allowed.has(r.subject_id)))return forbidden('Branş yetkisi dışında sınav.');
 }
 const examId=uuid('exm'),subjects=[...new Set<string>(rows.map(r=>r.subject_id))],operations:D1PreparedStatement[]=[
  env.DB.prepare("INSERT INTO exams(id,owner_type,institution_id,academic_year,title,exam_type,grade_level,status,created_by) VALUES(?,'INSTITUTION',?,?,?,'PRACTICE',?,'DRAFT',?)").bind(examId,doc.institution_id,academicYear,doc.title,doc.grade_level,user.id),
  env.DB.prepare("INSERT INTO exam_booklets(id,exam_id,code) VALUES(?,?,'A')").bind(uuid('ebk'),examId),
 ];
 for(let index=0;index<subjects.length;index++){
  const subject=subjects[index];const group=rows.filter(r=>r.subject_id===subject);
  operations.push(env.DB.prepare('INSERT INTO exam_subjects(id,exam_id,subject_id,question_count,sort_order) VALUES(?,?,?,?,?)').bind(uuid('esu'),examId,subject,group.length,index+1));
  for(let j=0;j<group.length;j++){
   const q=group[j],eqId=uuid('eq');
   operations.push(env.DB.prepare('INSERT INTO exam_questions(id,exam_id,subject_id,question_no,global_no) VALUES(?,?,?,?,?)').bind(eqId,examId,subject,j+1,Number(q.sort_order)));
   operations.push(env.DB.prepare("INSERT INTO answer_keys(id,exam_question_id,booklet_code,correct_answer) VALUES(?,?,'A',?)").bind(uuid('ank'),eqId,q.correct_answer));
   for(const outcome of byQuestion.get(q.question_id)||[])operations.push(env.DB.prepare('INSERT INTO question_outcomes(exam_question_id,outcome_id) VALUES(?,?)').bind(eqId,outcome));
  }
 }
 operations.push(env.DB.prepare("INSERT INTO studio_delivery_links(id,document_id,institution_id,publication_revision,delivery_kind,destination,external_id,idempotency_key) VALUES(?,?,?,1,'EXAM','EXAM_CENTER',?,?)").bind(uuid('sdl'),documentId,doc.institution_id,examId,plan.plan.idempotencyKey));
 operations.push(env.DB.prepare("UPDATE studio_documents SET status='PUBLISHED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='READY'").bind(documentId));
 try{await env.DB.batch(operations);}catch{
  const winner=await one<{external_id:string}>(env.DB.prepare("SELECT external_id FROM studio_delivery_links WHERE document_id=? AND institution_id=? AND publication_revision=1 AND delivery_kind='EXAM'").bind(documentId,doc.institution_id));
  if(winner)return json({ok:true,examId:winner.external_id,reused:true});
  return json({ok:false,error:{code:'EXAM_PUBLICATION_FAILED',message:'Sınav oluşturulamadı.'}},409);
 }
 return json({ok:true,examId,reused:false,status:'DRAFT',requiresScoringAndOpticalConfiguration:true},201);
}
