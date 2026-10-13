import type { AuthUser,Env } from '../types';
import {all,one,badRequest,forbidden,json,notFound,uuid} from './db';
import {planStudioDelivery,resolveStudioDeliveryKind} from './studio-delivery-routing';

/** READY worksheet -> one institution-scoped assignment, atomically; no exam creation. */
export async function publishStudioHomework(request:Request,env:Env,user:AuthUser,documentId:string):Promise<Response>{
 if(!['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER'].includes(user.role))return forbidden();
 const input:any=await request.json().catch(()=>({}));
 const studentIds:string[]=input.studentIds;
 if(!Array.isArray(studentIds)||studentIds.length<1||studentIds.length>200||studentIds.some(x=>typeof x!=='string'||!x.trim())||new Set(studentIds).size!==studentIds.length)
  return badRequest('1-200 benzersiz öğrenci gerekli.','INVALID_RECIPIENTS');
 const doc=await one<any>(env.DB.prepare('SELECT * FROM studio_documents WHERE id=?').bind(documentId));
 if(!doc)return notFound('Belge bulunamadı.');
 if(!doc.institution_id||(user.role!=='SUPER_ADMIN'&&user.institution_id!==doc.institution_id))return forbidden();
 if(user.role==='TEACHER'&&doc.created_by!==user.id)return forbidden();
 const prev=await one<any>(env.DB.prepare("SELECT external_id FROM studio_delivery_links WHERE document_id=? AND institution_id=? AND delivery_kind='HOMEWORK' AND publication_revision=1").bind(documentId,doc.institution_id));
 if(prev)return json({ok:true,assignmentId:prev.external_id,reused:true});
 if(doc.status!=='READY'||!resolveStudioDeliveryKind(doc.document_type,'HOMEWORK').ok)
  return badRequest('Belge yayıma hazır bir çalışma föyü değil.','STUDIO_NOT_READY');
 const questions=await all<any>(env.DB.prepare(`SELECT i.question_id,q.review_status,q.copyright_status,q.subject_id FROM studio_document_items i
 JOIN question_bank q ON q.id=i.question_id WHERE i.document_id=? AND i.booklet_code='A' ORDER BY i.sort_order`).bind(documentId));
 const ids:string[]=questions.map(q=>q.question_id);
 const plan=planStudioDelivery({documentId,institutionId:doc.institution_id,publicationRevision:1,kind:'HOMEWORK',approved:true,questionIds:ids});
 if(!plan.ok)return badRequest(plan.reason,'INVALID_STUDIO_ITEMS');
 if(questions.some(q=>q.review_status!=='APPROVED'||!['OWNED','LICENSED','PUBLIC_DOMAIN'].includes(q.copyright_status)))return badRequest('Onaysız soru yayımlanamaz.','QUESTION_NOT_APPROVED');
 const invalid=await one<{n:number}>(env.DB.prepare(`SELECT COUNT(*) n FROM studio_document_items i JOIN question_bank q ON q.id=i.question_id
 WHERE i.document_id=? AND i.booklet_code='A' AND NOT EXISTS(SELECT 1 FROM question_learning_links l
 JOIN outcomes o ON l.node_id='ln_'||o.id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
 WHERE l.question_id=q.id AND o.active=1 AND cv.verified=1 AND o.subject_id=q.subject_id
 AND o.grade_level=q.grade_level AND cv.grade_level=q.grade_level AND cv.academic_year=q.academic_year)`).bind(documentId));
 if(Number(invalid?.n||0)>0)return badRequest('Doğrulanmış kazanım bağlantısı eksik.','OUTCOME_REQUIRED');
 const placeholders=studentIds.map(()=>'?').join(',');
 const students=await all<{student_id:string}>(env.DB.prepare(`SELECT DISTINCT student_id FROM student_enrollments WHERE student_id IN (${placeholders}) AND institution_id=? AND status='ACTIVE'`).bind(...studentIds,doc.institution_id));
 if(students.length!==studentIds.length)return forbidden('Kurum dışı veya pasif öğrenci bulunuyor.');
 if(user.role==='TEACHER'){
  const allowed=await all<{student_id:string}>(env.DB.prepare(`SELECT DISTINCT e.student_id FROM student_enrollments e JOIN teacher_assignments ta ON ta.institution_id=e.institution_id
 AND ta.user_id=? AND ta.active=1 AND (ta.class_id IS NULL OR ta.class_id=e.class_id)
 WHERE e.student_id IN (${placeholders}) AND e.institution_id=? AND e.status='ACTIVE'`).bind(user.id,...studentIds,doc.institution_id));
  if(allowed.length!==studentIds.length)return forbidden('Öğrenciler öğretmenin yetki alanı dışında.');
  const subjects=await all<{subject_id:string}>(env.DB.prepare("SELECT subject_id FROM teacher_assignments WHERE user_id=? AND institution_id=? AND assignment_type='SUBJECT' AND active=1").bind(user.id,doc.institution_id));
  const set=new Set(subjects.map(s=>s.subject_id));if(questions.some(q=>!set.has(q.subject_id)))return forbidden('Branş yetkisi yok.');
 }
 const assignmentId=uuid('asg');
 const ops:D1PreparedStatement[]=[
  env.DB.prepare("INSERT INTO assignments(id,institution_id,created_by,assignment_type,title,status) VALUES(?,?,?,'TEACHER',?,'ASSIGNED')").bind(assignmentId,doc.institution_id,user.id,doc.title),
  ...ids.map((id,i)=>env.DB.prepare("INSERT INTO assignment_items(id,assignment_id,item_type,reference_id,payload_json,sort_order) VALUES(?,?,'QUESTION',?,'{}',?)").bind(uuid('asi'),assignmentId,id,i+1)),
  ...studentIds.map(id=>env.DB.prepare("INSERT INTO assignment_recipients(assignment_id,student_id,status) VALUES(?,?,'ASSIGNED')").bind(assignmentId,id)),
  env.DB.prepare("INSERT INTO studio_delivery_links(id,document_id,institution_id,publication_revision,delivery_kind,destination,external_id,idempotency_key) VALUES(?,?,?,1,'HOMEWORK','ASSIGNMENTS',?,?)").bind(uuid('sdl'),documentId,doc.institution_id,assignmentId,plan.plan.idempotencyKey),
  env.DB.prepare("UPDATE studio_documents SET status='PUBLISHED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='READY'").bind(documentId)
 ];
 try{await env.DB.batch(ops);}catch{
  // Competing submissions may lose the unique delivery-key race. D1 batch
  // rolls back the losing writes; return the winner rather than a false error.
  const winner=await one<{external_id:string}>(env.DB.prepare(
   "SELECT external_id FROM studio_delivery_links WHERE document_id=? AND institution_id=? AND delivery_kind='HOMEWORK' AND publication_revision=1"
  ).bind(documentId,doc.institution_id));
  if(winner)return json({ok:true,assignmentId:winner.external_id,reused:true});
  return json({ok:false,error:{code:'HOMEWORK_PUBLICATION_FAILED',message:'Ödev kaydı oluşturulamadı.'}},409);
 }
 return json({ok:true,assignmentId,reused:false},201);
}
