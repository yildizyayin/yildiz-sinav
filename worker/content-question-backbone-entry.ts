import app from './official-knowledge-entry';
import type { AuthUser,Env } from './types';
import { getAuthUser } from './lib/auth';
import { all,badRequest,forbidden,json,notFound,one,uuid } from './lib/db';
import { hasRestrictedOfficialQuestionPayload,requiresVerifiedRightsBeforeApproval,restrictedOfficialPayloadFields,rightsBasisForCopyright,validateOfficialQuestionUrl,type RightsBasis } from './lib/content-source-policy';
import { recordOfficialKnowledgeEvent,type OfficialSourceKind } from './lib/official-education-source';

function fail(status:number,code:string,message:string,details?:unknown){return json({ok:false,error:{code,message,details}},status)}
async function auth(request:Request,env:Env){return getAuthUser(env,request)}
async function bodyOf(request:Request){return request.clone().json().catch(()=>({})) as Promise<any>}

async function sourceRow(env:Env,sourceKey:string){return one<any>(env.DB.prepare(`SELECT source_key,authority,label,index_url,rights_status,ingestion_policy,knowledge_source_kind FROM official_question_sources WHERE source_key=? AND active=1`).bind(sourceKey))}
function sourceVerdict(source:any,url:string){if(!source?.knowledge_source_kind)return {valid:false as const,code:'OFFICIAL_QUESTION_SOURCE_UNCLASSIFIED',message:'Resmî soru kaynağı ortak bilgi katmanında sınıflandırılmamış.'};return validateOfficialQuestionUrl({sourceKind:source.knowledge_source_kind,authority:source.authority,url});}

async function guardOfficialRefresh(request:Request,env:Env,ctx:ExecutionContext,sourceKey:string){
 const user=await auth(request,env);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(user.role!=='SUPER_ADMIN')return forbidden();
 const source=await sourceRow(env,sourceKey);if(!source)return notFound('Resmî soru kaynağı bulunamadı.');const verdict=sourceVerdict(source,String(source.index_url));if(!verdict.valid)return fail(400,verdict.code,verdict.message);
 const response=await app.fetch(request,env,ctx);if(response.ok){try{const payload:any=await response.clone().json();await recordOfficialKnowledgeEvent(env,{sourceKind:source.knowledge_source_kind as OfficialSourceKind,authority:source.authority,entityType:'OFFICIAL_QUESTION_SOURCE_REFRESH',entityId:sourceKey,sourceUrl:String(source.index_url),sourceTitle:String(source.label),sourceVerifiedAt:new Date().toISOString(),rowCount:Number(payload?.discovered||0)+Number(payload?.updated||0),createdBy:user.id});}catch(error){console.error('Official question refresh provenance failed',error)}}return response;
}

async function guardOfficialMappingImport(request:Request,env:Env,ctx:ExecutionContext){
 const user=await auth(request,env);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(user.role!=='SUPER_ADMIN')return forbidden();const body=await bodyOf(request);const rows=Array.isArray(body.rows)?body.rows:[];const source=await sourceRow(env,String(body.sourceKey||''));if(!source)return badRequest('Geçerli sourceKey gereklidir.');
 const root=sourceVerdict(source,String(source.index_url));if(!root.valid)return fail(400,root.code,root.message);
 const issues:Array<{row:number;code:string;message:string;fields?:string[]}>=[];
 for(let i=0;i<rows.length;i++){
  const row=rows[i]||{};if(hasRestrictedOfficialQuestionPayload(row)){issues.push({row:i+1,code:'OFFICIAL_QUESTION_METADATA_ONLY',message:'Resmî telifli soru eşleştirmesinde soru metni, şıklar veya çözüm içeriği gönderilemez.',fields:restrictedOfficialPayloadFields(row)});continue;}
  for(const [field,value] of [['sourceUrl',row.sourceUrl],['documentUrl',row.documentUrl]] as const){if(!value)continue;const verdict=sourceVerdict(source,String(value));if(!verdict.valid)issues.push({row:i+1,code:verdict.code,message:`${field}: ${verdict.message}`});}
  if(issues.length>=50)break;
 }
 if(issues.length)return fail(400,'OFFICIAL_QUESTION_MAPPING_POLICY_FAILED','Resmî soru eşleştirme paketi metadata/telif veya kaynak doğrulamasından geçemedi.',issues);
 const response=await app.fetch(request,env,ctx);if(response.ok){try{const payload:any=await response.clone().json();await recordOfficialKnowledgeEvent(env,{sourceKind:source.knowledge_source_kind as OfficialSourceKind,authority:source.authority,entityType:'OFFICIAL_QUESTION_MAPPING_BATCH',entityId:String(body.sourceKey||''),sourceUrl:String(source.index_url),sourceTitle:String(source.label),sourceVerifiedAt:new Date().toISOString(),rowCount:Number(payload?.mapped||0),createdBy:user.id});}catch(error){console.error('Official question mapping provenance failed',error)}}return response;
}

async function question(env:Env,id:string){return one<any>(env.DB.prepare(`SELECT * FROM question_bank WHERE id=?`).bind(id))}
function canManageQuestion(user:AuthUser,q:any){return user.role==='SUPER_ADMIN'||(q?.owner_type==='INSTITUTION'&&q?.owner_id===user.institution_id&&['INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role))}
function evidenceUrl(value:unknown){const text=String(value||'').trim();if(!text)return null;try{const u=new URL(text);return u.protocol==='https:'?u.toString():null}catch{return null}}

async function createQuestionWithProvenance(request:Request,env:Env,ctx:ExecutionContext){
 const user=await auth(request,env);const body=await bodyOf(request);const response=await app.fetch(request,env,ctx);if(!user||!response.ok)return response;
 let payload:any;try{payload=await response.clone().json()}catch{return response}const id=String(payload?.id||'');if(!id)return response;const status=String(body.copyrightStatus||'OWNED').toUpperCase();const rightsBasis=rightsBasisForCopyright(status);const ev=body.rightsEvidence&&typeof body.rightsEvidence==='object'?body.rightsEvidence:{};const sourceUrl=evidenceUrl(ev.sourceUrl);
 const verification=user.role==='SUPER_ADMIN'&&status==='OWNED'?'VERIFIED':'DECLARED';
 await env.DB.prepare(`INSERT INTO question_provenance_records(id,question_id,rights_basis,source_authority,source_url,license_reference,evidence_note,evidence_hash,source_verified_at,verification_status,created_by,reviewed_by,reviewed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(uuid('qpr'),id,rightsBasis,String(ev.sourceAuthority||'').trim()||null,sourceUrl,String(ev.licenseReference||'').trim()||null,String(ev.evidenceNote||'').trim()||null,String(ev.evidenceHash||'').trim()||null,sourceUrl?new Date().toISOString():null,verification,user.id,verification==='VERIFIED'?user.id:null,verification==='VERIFIED'?new Date().toISOString():null).run();
 if(requiresVerifiedRightsBeforeApproval(status)||status==='RESTRICTED')await env.DB.prepare(`UPDATE question_bank SET review_status='REVIEW',reviewed_by=NULL,reviewed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
 return response;
}

async function guardQuestionApproval(request:Request,env:Env,ctx:ExecutionContext,id:string){
 const user=await auth(request,env);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');const body=await bodyOf(request);if(String(body.status||'').toUpperCase()!=='APPROVED')return app.fetch(request,env,ctx);const q=await question(env,id);if(!q)return notFound('Soru bulunamadı.');
 if(requiresVerifiedRightsBeforeApproval(q.copyright_status)){
  const basis=rightsBasisForCopyright(q.copyright_status);const proof=await one<any>(env.DB.prepare(`SELECT id FROM question_provenance_records WHERE question_id=? AND rights_basis=? AND verification_status='VERIFIED' ORDER BY reviewed_at DESC LIMIT 1`).bind(id,basis));
  if(!proof)return fail(400,'QUESTION_RIGHTS_EVIDENCE_REQUIRED','Lisanslı veya kamu malı soru, hak/provenance kanıtı Süper Admin tarafından doğrulanmadan basılabilir onaya geçemez.',{questionId:id,requiredRightsBasis:basis});
 }
 if(String(q.copyright_status)==='RESTRICTED')return fail(400,'COPYRIGHT_BLOCKED','Kısıtlı telif durumundaki soru basılabilir havuza onaylanamaz.');
 const response=await app.fetch(request,env,ctx);if(response.ok&&q.copyright_status==='OWNED')await env.DB.prepare(`UPDATE question_provenance_records SET verification_status='VERIFIED',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE question_id=? AND rights_basis='OWNED' AND verification_status='DECLARED'`).bind(user.id,id).run();return response;
}

async function listProvenance(request:Request,env:Env,questionId:string){const user=await auth(request,env);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');const q=await question(env,questionId);if(!q)return notFound('Soru bulunamadı.');if(!canManageQuestion(user,q))return forbidden();const rows=await all<any>(env.DB.prepare(`SELECT p.*,cu.display_name created_by_name,ru.display_name reviewed_by_name FROM question_provenance_records p LEFT JOIN users cu ON cu.id=p.created_by LEFT JOIN users ru ON ru.id=p.reviewed_by WHERE p.question_id=? ORDER BY p.created_at DESC`).bind(questionId));return json({ok:true,question:{id:q.id,copyrightStatus:q.copyright_status,reviewStatus:q.review_status},records:rows});}

async function declareProvenance(request:Request,env:Env,questionId:string){
 const user=await auth(request,env);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');const q=await question(env,questionId);if(!q)return notFound('Soru bulunamadı.');if(!canManageQuestion(user,q))return forbidden();const body:any=await request.json().catch(()=>({}));const expected=rightsBasisForCopyright(q.copyright_status);const rightsBasis=String(body.rightsBasis||expected) as RightsBasis;if(rightsBasis!==expected)return fail(400,'RIGHTS_BASIS_MISMATCH','Hak kanıtı sorunun telif statüsüyle eşleşmiyor.',{expected});
 const sourceUrl=body.sourceUrl?evidenceUrl(body.sourceUrl):null;if(body.sourceUrl&&!sourceUrl)return fail(400,'RIGHTS_SOURCE_URL_INVALID','Hak kanıtı URL adresi HTTPS olmalıdır.');const licenseReference=String(body.licenseReference||'').trim()||null,evidenceNote=String(body.evidenceNote||'').trim()||null;
 if(rightsBasis==='WRITTEN_LICENSE'&&!licenseReference&&!evidenceNote)return fail(400,'LICENSE_EVIDENCE_REQUIRED','Lisanslı içerik için yazılı izin/lisans referansı veya kanıt notu gerekir.');if(rightsBasis==='PUBLIC_DOMAIN'&&!sourceUrl&&!evidenceNote)return fail(400,'PUBLIC_DOMAIN_EVIDENCE_REQUIRED','Kamu malı/açık hak iddiası için kaynak URL veya kanıt notu gerekir.');
 const id=uuid('qpr');await env.DB.prepare(`INSERT INTO question_provenance_records(id,question_id,rights_basis,source_authority,source_url,license_reference,evidence_note,evidence_hash,source_verified_at,verification_status,created_by) VALUES(?,?,?,?,?,?,?,?,?,'DECLARED',?)`).bind(id,questionId,rightsBasis,String(body.sourceAuthority||'').trim()||null,sourceUrl,licenseReference,evidenceNote,String(body.evidenceHash||'').trim()||null,sourceUrl?new Date().toISOString():null,user.id).run();return json({ok:true,id,status:'DECLARED',rightsBasis},201);
}

async function reviewProvenance(request:Request,env:Env,recordId:string){
 const user=await auth(request,env);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(user.role!=='SUPER_ADMIN')return forbidden('Hak/provenance doğrulamasını yalnız Süper Admin yapabilir.');const body:any=await request.json().catch(()=>({}));const status=String(body.status||'').toUpperCase();if(!['VERIFIED','REJECTED'].includes(status))return fail(400,'PROVENANCE_STATUS_INVALID','Hak kanıtı durumu VERIFIED veya REJECTED olmalıdır.');const row=await one<any>(env.DB.prepare(`SELECT * FROM question_provenance_records WHERE id=?`).bind(recordId));if(!row)return notFound('Hak/provenance kaydı bulunamadı.');await env.DB.prepare(`UPDATE question_provenance_records SET verification_status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,evidence_note=COALESCE(?,evidence_note),updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,user.id,String(body.note||'').trim()||null,recordId).run();return json({ok:true,id:recordId,status});
}

async function backboneStatus(request:Request,env:Env){
 const user=await auth(request,env);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(user.role!=='SUPER_ADMIN')return forbidden();const row=await one<any>(env.DB.prepare(`SELECT
  (SELECT COUNT(*) FROM question_bank WHERE review_status='APPROVED' AND copyright_status IN ('OWNED','LICENSED','PUBLIC_DOMAIN')) printable_legacy_compatible,
  (SELECT COUNT(*) FROM question_bank q WHERE q.copyright_status IN ('LICENSED','PUBLIC_DOMAIN') AND q.review_status<>'ARCHIVED' AND EXISTS(SELECT 1 FROM question_provenance_records p WHERE p.question_id=q.id AND p.verification_status='VERIFIED')) verified_external_rights,
  (SELECT COUNT(*) FROM question_bank q WHERE q.copyright_status IN ('LICENSED','PUBLIC_DOMAIN') AND q.review_status<>'ARCHIVED' AND NOT EXISTS(SELECT 1 FROM question_provenance_records p WHERE p.question_id=q.id AND p.verification_status='VERIFIED')) rights_review_required,
  (SELECT COUNT(*) FROM official_exam_archives WHERE active=1) official_archives,
  (SELECT COUNT(*) FROM official_question_outcome_facts WHERE verification_status='VERIFIED') verified_official_mappings`));return json({ok:true,summary:row,policy:{officialExamContent:'METADATA_ONLY',printableCopyright:['OWNED','LICENSED','PUBLIC_DOMAIN'],licensedAndPublicDomainRequireVerifiedProvenance:true,userProvidedAutomaticallyPrintable:false,restrictedAutomaticallyPrintable:false}});
}

export default {
 async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
  const url=new URL(request.url),p=url.pathname;
  const refresh=p.match(/^\/api\/official-question-intelligence\/sources\/([^/]+)\/refresh$/);if(refresh&&request.method==='POST')return guardOfficialRefresh(request,env,ctx,refresh[1]);
  if(p==='/api/official-question-intelligence/mappings/import'&&request.method==='POST')return guardOfficialMappingImport(request,env,ctx);
  if(p==='/api/platform/questions'&&request.method==='POST')return createQuestionWithProvenance(request,env,ctx);
  const review=p.match(/^\/api\/question-bank-standard\/([^/]+)\/review$/);if(review&&request.method==='PATCH')return guardQuestionApproval(request,env,ctx,review[1]);
  if(p==='/api/question-backbone/status'&&request.method==='GET')return backboneStatus(request,env);
  const list=p.match(/^\/api\/question-provenance\/([^/]+)$/);if(list&&request.method==='GET')return listProvenance(request,env,list[1]);if(list&&request.method==='POST')return declareProvenance(request,env,list[1]);
  const verify=p.match(/^\/api\/question-provenance\/records\/([^/]+)$/);if(verify&&request.method==='PATCH')return reviewProvenance(request,env,verify[1]);
  return app.fetch(request,env,ctx);
 },
 async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){if('scheduled' in app&&typeof app.scheduled==='function')return app.scheduled(event,env,ctx);},
} satisfies ExportedHandler<Env>;
