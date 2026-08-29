import app from './student-books-entry';
import type { Env } from './types';
import { getAuthUser } from './lib/auth';
import { audit,json,one,all } from './lib/db';
import { requiresVerifiedRightsBeforeApproval } from './lib/content-source-policy';

function fail(status:number,code:string,message:string){return json({ok:false,error:{code,message}},status)}

async function educatorCanAccessQuestion(env:Env,user:any,question:{subject_id?:string;grade_level?:number}){
 if(!['TEACHER','GUIDANCE_TEACHER'].includes(user.role))return true;
 const assignment=user.role==='TEACHER'?`ta.assignment_type='SUBJECT' AND ta.subject_id=?`:`ta.assignment_type='GUIDANCE'`;
 const params=user.role==='TEACHER'?[user.id,user.institution_id,question.subject_id,question.grade_level]:[user.id,user.institution_id,question.grade_level];
 return Boolean(await one(env.DB.prepare(`SELECT 1 FROM teacher_assignments ta JOIN classes c ON c.id=ta.class_id JOIN institution_seasons se ON se.id=ta.season_id WHERE ta.user_id=? AND ta.institution_id=? AND c.institution_id=ta.institution_id AND se.institution_id=ta.institution_id AND ${assignment} AND c.grade_level=? AND ta.active=1 AND c.active=1 AND se.status='ACTIVE' LIMIT 1`).bind(...params)));
}

async function stats(env:Env,user:any){
 const rows=user.role==='SUPER_ADMIN'
  ? await all<any>(env.DB.prepare(`SELECT review_status,copyright_status,COUNT(*) count FROM question_bank WHERE review_status<>'ARCHIVED' GROUP BY review_status,copyright_status ORDER BY review_status,copyright_status`))
  : user.role==='TEACHER'
   ? await all<any>(env.DB.prepare(`SELECT q.review_status,q.copyright_status,COUNT(*) count FROM question_bank q WHERE q.review_status<>'ARCHIVED' AND (q.owner_type='PLATFORM' OR (q.owner_type='INSTITUTION' AND q.owner_id=?)) AND EXISTS(SELECT 1 FROM teacher_assignments ta JOIN classes c ON c.id=ta.class_id JOIN institution_seasons se ON se.id=ta.season_id WHERE ta.user_id=? AND ta.institution_id=? AND c.institution_id=ta.institution_id AND se.institution_id=ta.institution_id AND ta.assignment_type='SUBJECT' AND ta.subject_id=q.subject_id AND c.grade_level=q.grade_level AND ta.active=1 AND c.active=1 AND se.status='ACTIVE') GROUP BY q.review_status,q.copyright_status ORDER BY q.review_status,q.copyright_status`).bind(user.institution_id,user.id,user.institution_id))
   : user.role==='GUIDANCE_TEACHER'
    ? await all<any>(env.DB.prepare(`SELECT q.review_status,q.copyright_status,COUNT(*) count FROM question_bank q WHERE q.review_status<>'ARCHIVED' AND (q.owner_type='PLATFORM' OR (q.owner_type='INSTITUTION' AND q.owner_id=?)) AND EXISTS(SELECT 1 FROM teacher_assignments ta JOIN classes c ON c.id=ta.class_id JOIN institution_seasons se ON se.id=ta.season_id WHERE ta.user_id=? AND ta.institution_id=? AND c.institution_id=ta.institution_id AND se.institution_id=ta.institution_id AND ta.assignment_type='GUIDANCE' AND c.grade_level=q.grade_level AND ta.active=1 AND c.active=1 AND se.status='ACTIVE') GROUP BY q.review_status,q.copyright_status ORDER BY q.review_status,q.copyright_status`).bind(user.institution_id,user.id,user.institution_id))
   : await all<any>(env.DB.prepare(`SELECT review_status,copyright_status,COUNT(*) count FROM question_bank WHERE review_status<>'ARCHIVED' AND (owner_type='PLATFORM' OR (owner_type='INSTITUTION' AND owner_id=?)) GROUP BY review_status,copyright_status ORDER BY review_status,copyright_status`).bind(user.institution_id));
 const total=rows.reduce((sum:number,r:any)=>sum+Number(r.count||0),0);
 const approved=rows.filter((r:any)=>r.review_status==='APPROVED').reduce((sum:number,r:any)=>sum+Number(r.count||0),0);
 const printable=rows.filter((r:any)=>r.review_status==='APPROVED'&&['OWNED','LICENSED','PUBLIC_DOMAIN'].includes(r.copyright_status)).reduce((sum:number,r:any)=>sum+Number(r.count||0),0);
 return json({ok:true,total,approved,printable,breakdown:rows});
}

async function reviewQuestion(request:Request,env:Env,id:string){
 const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(user.role!=='SUPER_ADMIN')return fail(403,'SUPER_ADMIN_ONLY','Soru onayını yalnız Süper Admin yapabilir.');
 const body:any=await request.json().catch(()=>({}));const status=String(body.status||'').toUpperCase();if(!['APPROVED','REJECTED','REVIEW','DRAFT'].includes(status))return fail(400,'INVALID_STATUS','Geçersiz inceleme durumu.');
 const q=await one<any>(env.DB.prepare(`SELECT id,copyright_status FROM question_bank WHERE id=? AND review_status<>'ARCHIVED'`).bind(id));if(!q)return fail(404,'QUESTION_NOT_FOUND','Soru bulunamadı.');
 if(status==='APPROVED'&&!['OWNED','LICENSED','PUBLIC_DOMAIN','USER_PROVIDED'].includes(q.copyright_status))return fail(400,'COPYRIGHT_BLOCKED','Kısıtlı telif durumundaki soru onaylı havuza alınamaz.');
 if(status==='APPROVED'&&requiresVerifiedRightsBeforeApproval(q.copyright_status)&&body.verifyRights){const declared=await one<any>(env.DB.prepare(`SELECT id,source_url,license_reference,evidence_note FROM question_provenance_records WHERE question_id=? AND verification_status='DECLARED' ORDER BY created_at DESC LIMIT 1`).bind(id));if(!declared||!String(declared.evidence_note||'').trim()||(!String(declared.source_url||'').trim()&&!String(declared.license_reference||'').trim()))return fail(400,'RIGHTS_EVIDENCE_INCOMPLETE','Hak doğrulaması için kaynak/lisans referansı ve kanıt notu gereklidir.');await env.DB.prepare(`UPDATE question_provenance_records SET verification_status='VERIFIED',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(user.id,declared.id).run();}
 if(status==='APPROVED'&&requiresVerifiedRightsBeforeApproval(q.copyright_status)){const proof=await one<any>(env.DB.prepare(`SELECT id FROM question_provenance_records WHERE question_id=? AND verification_status='VERIFIED' ORDER BY reviewed_at DESC LIMIT 1`).bind(id));if(!proof)return fail(400,'RIGHTS_PROOF_REQUIRED','Lisanslı veya kamu malı içerik için doğrulanmış hak kaydı gereklidir.');}
 await env.DB.prepare(`UPDATE question_bank SET review_status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,rejection_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,user.id,status==='REJECTED'?String(body.note||'').trim()||null:null,id).run();
 await audit(env.DB,user.id,null,'QUESTION_REVIEWED','question',id,{status});
 return json({ok:true,id,status});
}

async function patchQuestion(request:Request,env:Env,id:string){
 const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');
 const q=await one<any>(env.DB.prepare(`SELECT * FROM question_bank WHERE id=?`).bind(id));if(!q)return fail(404,'QUESTION_NOT_FOUND','Soru bulunamadı.');
 const can=user.role==='SUPER_ADMIN'||(q.owner_type==='INSTITUTION'&&q.owner_id===user.institution_id&&['INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role));if(!can)return fail(403,'FORBIDDEN','Bu soruyu düzenleyemezsiniz.');
 if(!await educatorCanAccessQuestion(env,user,q))return fail(403,'FORBIDDEN','Yalnız aktif sınıf ve görev kapsamınızdaki soruları düzenleyebilirsiniz.');
 const body:any=await request.json().catch(()=>({}));const copyright=body.copyrightStatus||q.copyright_status;const allowed=['OWNED','LICENSED','PUBLIC_DOMAIN','USER_PROVIDED','RESTRICTED'];if(!allowed.includes(copyright))return fail(400,'INVALID_COPYRIGHT','Geçersiz telif durumu.');
 await env.DB.prepare(`UPDATE question_bank SET topic=?,subtopic=?,difficulty=?,source_label=?,copyright_status=?,origin_kind=?,review_status=?,reviewed_by=NULL,reviewed_at=NULL,rejection_note=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(body.topic??q.topic,body.subtopic??q.subtopic,Math.max(1,Math.min(5,Number(body.difficulty??q.difficulty))),body.sourceLabel??q.source_label,copyright,body.originKind??q.origin_kind,user.role==='SUPER_ADMIN'&&body.keepApproved? q.review_status:'REVIEW',id).run();
 await audit(env.DB,user.id,q.owner_id||user.institution_id,'QUESTION_UPDATED','question',id,{subjectId:q.subject_id,gradeLevel:q.grade_level});
 return json({ok:true,id});
}

export default {async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{const url=new URL(request.url),p=url.pathname;if(p==='/api/question-bank-standard/stats'&&request.method==='GET'){const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(!['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role))return fail(403,'FORBIDDEN','Yetkisiz erişim.');return stats(env,user)}const review=p.match(/^\/api\/question-bank-standard\/([^/]+)\/review$/);if(review&&request.method==='PATCH')return reviewQuestion(request,env,review[1]);const patch=p.match(/^\/api\/question-bank-standard\/([^/]+)$/);if(patch&&request.method==='PATCH')return patchQuestion(request,env,patch[1]);return app.fetch(request,env,ctx);},async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){if('scheduled' in app&&typeof app.scheduled==='function')return app.scheduled(event,env,ctx);}} satisfies ExportedHandler<Env>;
