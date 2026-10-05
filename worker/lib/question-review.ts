import type {AuthUser,Env} from '../types';
import {all,badRequest,forbidden,json,notFound,one} from './db';
import {sealQuestionMedia,verifyQuestionMediaIntegrity} from './question-media-integrity';

export function normalizeQuestionOrigin(value:unknown):string|null {
 const origin=String(value??'MANUAL').trim().toUpperCase();
 if(['AI','AI_GENERATED','AI_DRAFT','NIBIRU','NIBIRU_AI'].includes(origin))return 'AI_GENERATED';
 return ['MANUAL','DEMO','IMPORT','IMPORTED','PUBLISHER','OFFICIAL'].includes(origin)?origin:null;
}
export function isAiQuestionOrigin(value:unknown){return normalizeQuestionOrigin(value)==='AI_GENERATED';}
// Accept the management list's reviewContext DTO or the equivalent canonical
// fields. The witness binds the human's displayed curriculum to this decision.
function reviewContextWitness(refs:any[]){
 return refs.map(ref=>({outcomeId:ref.outcomeId??ref.id,curriculumVersionId:ref.curriculumVersionId,subjectId:ref.subjectId??ref.subject_id,gradeLevel:ref.gradeLevel??ref.grade_level,academicYear:ref.academicYear,programVersion:ref.programVersion??null})).sort((a,b)=>a.outcomeId<b.outcomeId?-1:a.outcomeId>b.outcomeId?1:0);
}
export function validMultipleChoiceQuestion(q:any){
 let options:any;try{options=JSON.parse(q.options_json)}catch{return false;}
 if(!Array.isArray(options)||![4,5].includes(options.length)||Number(q.option_count??options.length)!==options.length)return false;
 if(options.some((option:any,index:number)=>typeof option==='string'?!option.trim():!option||option.label!==String.fromCharCode(65+index)||typeof option.text!=='string'||!option.text.trim()))return false;
 return options.some((_:any,index:number)=>String.fromCharCode(65+index)===q.correct_answer);
}

// Re-evaluate the live official context in the conditional write as well as in
// the preview read: a curriculum change must not pass an old review decision.
export const AI_REVIEW_CONTEXT_SQL=`EXISTS(SELECT 1 FROM question_learning_links l WHERE l.question_id=question_bank.id)
 AND NOT EXISTS(SELECT 1 FROM question_learning_links l
 LEFT JOIN outcomes o ON l.node_id='ln_'||o.id
 LEFT JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
 WHERE l.question_id=question_bank.id AND (o.id IS NULL OR o.active IS NOT 1 OR cv.id IS NULL OR cv.verified IS NOT 1
 OR o.grade_level IS NOT question_bank.grade_level OR cv.grade_level IS NOT question_bank.grade_level
 OR cv.academic_year IS NOT question_bank.academic_year OR o.subject_id IS NOT question_bank.subject_id))`;

export async function reviewQuestionWithGate(request:Request,env:Env,user:AuthUser,id:string){
 if(user.role!=='SUPER_ADMIN')return forbidden('Soru onayını yalnız Süper Admin yapabilir.');
 const body:any=await request.json().catch(()=>({}));const status=String(body.status||'').toUpperCase();
 if(!['APPROVED','REJECTED','REVIEW','DRAFT','ARCHIVED'].includes(status))return badRequest('Geçersiz inceleme durumu.','INVALID_STATUS');
 let q=await one<any>(env.DB.prepare(`SELECT * FROM question_bank WHERE id=? AND review_status<>'ARCHIVED'`).bind(id));
 if(!q)return notFound('Soru bulunamadı.');
 const ai=isAiQuestionOrigin(q.origin_kind);let mediaSealed=false;
 if((ai&&status==='APPROVED')||body.expectedRevision!==undefined){
  if(!Number.isInteger(body.expectedRevision)||body.expectedRevision!==q.review_revision)return json({ok:false,error:{code:'QUESTION_REVIEW_CHANGED',message:'İncelediğiniz soru sürümü değişti. Güncel içeriği yeniden açın.'}},409);
 }
 const contextParams:any[]=[];let contextFence='';
 if(status==='APPROVED'){
  if(!['OWNED','LICENSED','PUBLIC_DOMAIN','USER_PROVIDED'].includes(q.copyright_status))return badRequest('Kısıtlı telif durumundaki soru onaylanamaz.','COPYRIGHT_BLOCKED');
  if(q.question_type==='MULTIPLE_CHOICE'&&!validMultipleChoiceQuestion(q))return badRequest('Soru seçenekleri ve cevap anahtarı doğrulanamadı.','INVALID_QUESTION_CONTENT');
  let mediaIntegrity=await verifyQuestionMediaIntegrity(env,id);
  if(!mediaIntegrity.ok&&mediaIntegrity.code==='QUESTION_MEDIA_SEAL_REQUIRED'){
   // The reviewer already witnessed q.review_revision above. Seal only local R2
   // bytes as a controlled internal mutation, then continue against the new
   // revision. External/missing/tampered media still fail closed.
   const sealedResponse=await sealQuestionMedia(env,user,id);
   if(!sealedResponse.ok)return sealedResponse;
   const sealed:any=await sealedResponse.json();mediaSealed=Array.isArray(sealed.sealed)&&sealed.sealed.some((asset:any)=>asset?.reused===false);
   q=await one<any>(env.DB.prepare(`SELECT * FROM question_bank WHERE id=? AND review_status<>'ARCHIVED'`).bind(id));
   if(!q)return notFound('Soru bulunamadı.');
   mediaIntegrity=await verifyQuestionMediaIntegrity(env,id);
  }
  if(!mediaIntegrity.ok)return json({ok:false,error:{code:mediaIntegrity.code,message:mediaIntegrity.message}},409);
  if(ai){
   const year=typeof q.academic_year==='string'?q.academic_year.match(/^(\d{4})-(\d{4})$/):null;
   if(!Number.isInteger(q.grade_level)||q.grade_level<1||q.grade_level>12||!year||Number(year[2])!==Number(year[1])+1||typeof q.subject_id!=='string'||!q.subject_id.trim())return badRequest('AI taslağının eğitim yılı, sınıf ve ders kapsamı geçersiz.','VERIFIED_CURRICULUM_REQUIRED');
   if(q.question_type!=='MULTIPLE_CHOICE'||![q.stem_text,q.solution_text,q.source_label].every(v=>typeof v==='string'&&v.trim()))return badRequest('AI taslağının soru, çözüm ve kaynak bilgisi tamamlanmalıdır.','AI_CONTENT_INCOMPLETE');
   const checks=body.checks;
   if(!checks||!['answerAndSolution','curriculum','ageAppropriate','originalityAndRights'].every(k=>checks[k]===true))return badRequest('AI taslağı için cevap/çözüm, program, yaş düzeyi ve özgünlük/telif incelemesini onaylayın.','HUMAN_REVIEW_REQUIRED');
   const context=await one<any>(env.DB.prepare(`SELECT id FROM question_bank WHERE id=? AND ${AI_REVIEW_CONTEXT_SQL}`).bind(id));
   if(!context)return badRequest('AI taslağı aynı yıl, sınıf ve dersteki doğrulanmış aktif öğrenme çıktısına bağlanmalıdır.','VERIFIED_CURRICULUM_REQUIRED');
   const refs=await all<any>(env.DB.prepare(`SELECT o.id outcome_id,o.curriculum_version_id,o.subject_id,o.grade_level,cv.academic_year,cv.program_version
    FROM question_learning_links l JOIN outcomes o ON l.node_id='ln_'||o.id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE l.question_id=? ORDER BY o.id LIMIT 16`).bind(id));
   if(!refs.length||refs.length>15)return badRequest('AI incelemesi 1–15 öğrenme çıktısı içermelidir.','VERIFIED_CURRICULUM_REQUIRED');
   const expected=body.expectedContext;
   const current=refs.map(ref=>({outcomeId:ref.outcome_id,curriculumVersionId:ref.curriculum_version_id,subjectId:ref.subject_id,gradeLevel:ref.grade_level,academicYear:ref.academic_year,programVersion:ref.program_version}));
   if(!Array.isArray(expected)||expected.length!==refs.length||expected.some((ref:any)=>!ref||typeof ref!=='object'||(ref.verified!==undefined&&ref.verified!==1))||JSON.stringify(reviewContextWitness(expected))!==JSON.stringify(reviewContextWitness(current)))return json({ok:false,error:{code:'QUESTION_REVIEW_CONTEXT_CHANGED',message:'İncelediğiniz program veya öğrenme çıktısı değişti. Güncel bağlamı yeniden açın.'}},409);
   for(const ref of refs){
    contextFence+=` AND EXISTS(SELECT 1 FROM outcomes ro JOIN curriculum_versions rc ON rc.id=ro.curriculum_version_id WHERE ro.id=? AND ro.curriculum_version_id=? AND ro.subject_id IS ? AND ro.grade_level IS ? AND rc.academic_year IS ? AND rc.program_version IS ? AND ro.active=1 AND rc.verified=1)`;
    contextParams.push(ref.outcome_id,ref.curriculum_version_id,ref.subject_id,ref.grade_level,ref.academic_year,ref.program_version);
   }
  }
 }
 const checks=ai&&status==='APPROVED'?JSON.stringify({answerAndSolution:true,curriculum:true,ageAppropriate:true,originalityAndRights:true}):null;
 const result=await env.DB.prepare(`UPDATE question_bank SET review_status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,rejection_note=?,review_checks_json=?,updated_at=CURRENT_TIMESTAMP
 WHERE id=? AND review_revision=?${ai&&status==='APPROVED'?` AND ${AI_REVIEW_CONTEXT_SQL}${contextFence}`:''}`).bind(status,user.id,status==='REJECTED'?String(body.note||'').trim().slice(0,2000)||null:null,checks,id,q.review_revision,...contextParams).run();
 // D1 counts the revision trigger too; this primary-key conditional write
 // changes no rows when the fence fails, and at least one when it commits.
 if(Number(result.meta?.changes||0)<1)return json({ok:false,error:{code:'QUESTION_REVIEW_CHANGED',message:'Soru veya program inceleme sırasında değişti. Güncel içeriği yeniden inceleyin.'}},409);
 return json({ok:true,id,status,mediaSealed});
}
