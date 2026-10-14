import {verificationProtocolRetryAllowed} from './question-verification-protocol';
import type {AuthUser,Env} from '../types';
import {one,json,forbidden,badRequest,notFound} from './db';
import {sha256} from './question-team-policy';
import {readAiJson} from './question-generation-validation';
import {runQuestionGenerationJob,generationOptionCount} from './question-generation-runner';
import {generationJobDto} from './question-generation-jobs';
import {editorialIssues} from './question-editorial';
export async function handleQuestionEditorialRepair(request:Request,env:Env,user:AuthUser,id:string){
 if(user.role!=='SUPER_ADMIN')return forbidden('Editoryal paket düzeltmesi yalnız Süper Admin içindir.');
 if(!['GET','POST'].includes(request.method))return json({ok:false,error:{code:'METHOD_NOT_ALLOWED',message:'Geçersiz işlem.'}},405);
 if(request.method==='POST'&&request.headers.get('Origin')!==new URL(request.url).origin)return forbidden('İşlemi ANUNEX üzerinden başlatın.');
 const job=await one<any>(env.DB.prepare('SELECT * FROM question_generation_jobs WHERE id=?').bind(id));if(!job)return notFound('İş bulunamadı.');
 if(job.quality_profile!=='EDITORIAL_V1')return badRequest('Bu işlem editoryal soru paketleri içindir.','EDITORIAL_PROFILE_REQUIRED');
 const audit=job.repair_source_audit_id?await one<any>(env.DB.prepare('SELECT id,details_json FROM audit_logs WHERE id=? AND entity_id=?').bind(job.repair_source_audit_id,id)):await one<any>(env.DB.prepare("SELECT id,details_json FROM audit_logs WHERE entity_id=? AND action IN ('QUESTION_GENERATION_OUTPUT_BLOCKED','QUESTION_GENERATION_VERIFICATION_BLOCKED') ORDER BY created_at DESC,id DESC LIMIT 1").bind(id));
 if(!audit)return badRequest('Düzeltilebilecek gerçek model çıktısı yok.','EDITORIAL_SOURCE_REQUIRED');
 const details=JSON.parse(audit.details_json),parsed=details.drafts?{questions:details.drafts}:readAiJson(details.sample),sourceHash=await sha256(audit.details_json);
 if(!Array.isArray(parsed?.questions)||parsed.questions.length!==job.question_count||typeof details.model!=='string')return badRequest('Tamamlanmış ve kaynağı kayıtlı model paketi gerekir. Kesilmiş yanıt onarılamaz.','EDITORIAL_SOURCE_INCOMPLETE');
 const last=job.editorial_repair_count===1?await one<any>(env.DB.prepare("SELECT details_json FROM audit_logs WHERE entity_id=? AND action='QUESTION_GENERATION_VERIFICATION_BLOCKED' ORDER BY created_at DESC,id DESC LIMIT 1").bind(id)):null;
 const protocolRetryable=job.status==='FAILED'&&job.generated_count===0&&job.editorial_repair_count===1&&job.editorial_verify_retry_count===0&&last&&verificationProtocolRetryAllowed(JSON.parse(last.details_json)?.verification);
 const priorEdit=protocolRetryable?await one<any>(env.DB.prepare("SELECT details_json FROM audit_logs WHERE entity_id=? AND action='QUESTION_EDITORIAL_REPAIR_REQUESTED' ORDER BY created_at DESC,id DESC LIMIT 1").bind(id)):null;
 const edit=priorEdit?JSON.parse(priorEdit.details_json):null;
 if(request.method==='GET')return json({ok:true,jobId:id,presentation:job.presentation,protocolRetryable:!!protocolRetryable,repairReason:edit?.reason??null,repairable:job.status==='FAILED'&&job.generated_count===0&&job.editorial_repair_count===0,sourceAuditId:audit.id,sourceHash,drafts:edit?.editedDrafts??parsed.questions,attemptCount:job.attempt_count,editorialRepairCount:job.editorial_repair_count,producerWillBeCalled:false,humanApprovalRequired:true});
 const raw=await request.text();if(raw.length>65536)return badRequest('Paket çok uzun.','EDITORIAL_PACKET_TOO_LARGE');let b:any;try{b=JSON.parse(raw)}catch{return badRequest('Geçersiz paket.','INVALID_EDITORIAL_REPAIR')}
 if(!b||b.expectedSourceAuditId!==audit.id||b.expectedSourceHash!==sourceHash||typeof b.reason!=='string'||b.reason.trim().length<20||b.reason.length>1000||!Array.isArray(b.drafts)||b.drafts.length!==job.question_count)return json({ok:false,error:{code:'EDITORIAL_REPAIR_SOURCE_CHANGED',message:'Kaynak sürümü, düzeltme gerekçesi ve tam paket gerekir.'}},409);
 const count=generationOptionCount(job.grade_level);if(!count||b.drafts.some((q:any)=>!q||typeof q.stemText!=='string'||typeof q.solutionText!=='string'||!Array.isArray(q.options)||q.options.length!==count||editorialIssues(q,job.presentation).length))return badRequest('Düzeltme tam editoryal sözleşmeye uymalıdır.','INVALID_EDITORIAL_PACKET');
 const payloadHash=await sha256(JSON.stringify([b.drafts,b.reason.trim()]));
 if(job.status==='REVIEW_READY'&&job.repair_source_hash===sourceHash&&job.repair_payload_hash===payloadHash)return json({ok:true,job:generationJobDto(job),reused:true});
 const verificationRetry=!!protocolRetryable&&job.repair_source_hash===sourceHash&&job.repair_payload_hash===payloadHash;
 if(job.status!=='FAILED'||job.generated_count!==0||(job.editorial_repair_count!==0&&!verificationRetry))return json({ok:false,error:{code:'EDITORIAL_REPAIR_UNAVAILABLE',message:'Bu iş için tek seferlik paket düzeltmesi kullanılmış veya işin durumu değişmiş.'}},409);
 return runQuestionGenerationJob(request,env,user,id,{verificationRetry,drafts:b.drafts,sourceAuditId:audit.id,sourceDetails:audit.details_json,sourceHash,payloadHash,reason:b.reason.trim(),sourceModel:details.model,sourceUsage:details.providerUsage??{}});
}
