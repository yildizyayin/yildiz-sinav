import {questionTeamPaused} from './question-team-policy';
import type {AuthUser,Env} from '../types';
import {all,one,json,forbidden,badRequest,notFound,uuid} from './db';
import {validMultipleChoiceQuestion,AI_REVIEW_CONTEXT_SQL} from './question-review';
import {verifyQuestionDrafts} from './question-generation-validation';

export async function verifyStoredQuestionDraft(request:Request,env:Env,user:AuthUser,id:string){
 if(user.role!=='SUPER_ADMIN')return forbidden('Taslak kontrolü yalnız Süper Admin içindir.');
 if(request.method!=='POST'||request.headers.get('Origin')!==new URL(request.url).origin)return forbidden('İşlemi ANUNEX üzerinden başlatın.');
 const b:any=await request.json().catch(()=>null);
 const q=await one<any>(env.DB.prepare('SELECT * FROM question_bank WHERE id=?').bind(id));if(!q)return notFound('Soru bulunamadı.');
 if(!b||Object.keys(b).join(',')!=='expectedRevision'||!Number.isInteger(b.expectedRevision)||b.expectedRevision!==q.review_revision)return json({ok:false,error:{code:'QUESTION_REVIEW_CHANGED',message:'Güncel soru sürümünü açın.'}},409);
 if(!['DRAFT','REVIEW','REJECTED'].includes(q.review_status))return badRequest('Bu işlem yalnız inceleme bekleyen taslaklar içindir.','DRAFT_REQUIRED');
 if(!env.AI||env.QUESTION_GENERATION_VERIFICATION_ENABLED!=='true')return json({ok:false,error:{code:'VERIFIER_UNAVAILABLE',message:'Bağımsız doğrulama sağlayıcısı etkin değil.'}},503);
 if(!validMultipleChoiceQuestion(q)||!q.stem_text?.trim()||!q.solution_text?.trim())return badRequest('Tam soru, şık ve çözüm gerekir.','INVALID_QUESTION_CONTENT');
 const valid=await one<any>(env.DB.prepare(`SELECT id FROM question_bank WHERE id=? AND ${AI_REVIEW_CONTEXT_SQL}`).bind(id));
 if(!valid)return badRequest('Doğrulanmış aynı sınıf/ders/yıl kazanımı gerekir.','VERIFIED_CURRICULUM_REQUIRED');
 const context=()=>all<any>(env.DB.prepare(`SELECT o.id,o.code,o.title,o.active,o.grade_level,o.subject_id,o.curriculum_version_id,cv.program_version,cv.verified,cv.academic_year FROM question_learning_links l JOIN outcomes o ON l.node_id='ln_'||o.id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE l.question_id=? ORDER BY o.id LIMIT 16`).bind(id));
 const before=await context();if(before.length!==1)return badRequest('Otomatik taslak kontrolü için tek birincil öğrenme çıktısı gerekir. İnsan incelemesi ayrıca korunur.','SINGLE_OUTCOME_REQUIRED');
 const ref=before[0],raw=JSON.parse(q.options_json);
 const draft={...(q.editorial_packet_json?{editorial:JSON.parse(q.editorial_packet_json)}:{}),stemText:q.stem_text,solutionText:q.solution_text,correctAnswer:q.correct_answer,difficultyLevel:q.difficulty_level??q.difficulty??3,options:raw.map((o:any,i:number)=>typeof o==='string'?{label:String.fromCharCode(65+i),text:o}:o)};
 if(await questionTeamPaused(env,['VERIFIER']))return json({ok:false,error:{code:'QUESTION_TEAM_PAUSED',message:'Doğrulama ekibi duraklatıldı.'}},409);
 const result=await verifyQuestionDrafts(env,{producerModel:q.source_model,qualityProfile:q.editorial_packet_json?'EDITORIAL_V1':'LEGACY',presentation:'AUTO',gradeLevel:q.grade_level,outcomeCode:ref.code,outcomeTitle:ref.title,academicYear:q.academic_year},[draft]);
 const current=await one<any>(env.DB.prepare('SELECT review_revision FROM question_bank WHERE id=?').bind(id));
 const paused=await questionTeamPaused(env,['VERIFIER']);
 const unchanged=!paused&&current?.review_revision===q.review_revision&&JSON.stringify(before)===JSON.stringify(await context());
 await env.DB.prepare(`INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,NULL,?,'question_bank',?,?)`).bind(uuid('aud'),user.id,unchanged?'QUESTION_DRAFT_VERIFIED':'QUESTION_DRAFT_VERIFICATION_STALE',id,JSON.stringify({reviewRevision:q.review_revision,officialContext:before,scope:'AUTOMATED_ANSWER_AND_CURRICULUM_SCREENING',humanApproved:false,rightsApproved:false,noveltyCertified:false,...result})).run();
 if(!unchanged)return json({ok:false,error:{code:'QUESTION_REVIEW_CHANGED',message:'Kontrol sırasında soru veya kazanım değişti; sonuç güncel sürüme uygulanmadı.'}},409);
 return json({ok:true,questionId:id,reviewRevision:q.review_revision,verification:result,humanApprovalRequired:true,rightsReviewRequired:true,noveltyCertified:false});
}
