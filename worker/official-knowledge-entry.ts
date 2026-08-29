import app from './standard-closure-entry';
import type { Env } from './types';
import { getAuthUser } from './lib/auth';
import { forbidden,json } from './lib/db';
import { OFFICIAL_SOURCE_POLICIES,officialKnowledgeStatus,recordOfficialKnowledgeEvent,validateOfficialSource,type OfficialSourceKind } from './lib/official-education-source';
import { handleAcademicTargetFileImport } from './lib/academic-target-file-import';

async function requireSuper(request:Request,env:Env){const user=await getAuthUser(env,request);if(!user)return {user:null,response:json({ok:false,error:{code:'UNAUTHENTICATED',message:'Oturum açmanız gerekiyor.'}},401)};if(user.role!=='SUPER_ADMIN')return {user,response:forbidden('Resmî eğitim bilgi katmanını yalnız Süper Admin yönetebilir.')};return {user,response:null}}

function authorityForTarget(kind:string){if(kind==='OSYM')return 'ÖSYM';if(kind==='YOK_ATLAS')return 'YÖK';return 'MEB'}
function targetRowRequired(kind:string,row:any){return kind==='MEB_ROTA_MAARIF'||kind==='MEB_EOKUL'?[row.externalCode,row.name,row.city]:[row.programCode,row.universityName,row.programName,row.scoreType]}

async function guardedTargetImport(request:Request,env:Env,ctx:ExecutionContext){
 const auth=await requireSuper(request,env);if(auth.response)return auth.response;const clone=request.clone();const body:any=await clone.json().catch(()=>({}));const sourceKind=String(body.sourceKind||'');const year=Number(body.year||0);const rows=Array.isArray(body.rows)?body.rows:[];const allowed=['MEB_ROTA_MAARIF','MEB_EOKUL','OSYM','YOK_ATLAS'];
 if(!allowed.includes(sourceKind))return json({ok:false,error:{code:'OFFICIAL_TARGET_SOURCE_INVALID',message:'Geçersiz resmî hedef kaynağı.'}},400);
 if(!rows.length||rows.length>5000)return json({ok:false,error:{code:'OFFICIAL_TARGET_BATCH_SIZE',message:'Bir aktarımda 1–5000 kayıt gönderilmelidir.'}},400);
 const issues:Array<{row:number;code:string;message:string}>=[];for(let i=0;i<rows.length;i++){const row=rows[i];if(targetRowRequired(sourceKind,row).some(v=>v===undefined||v===null||String(v).trim()===''))issues.push({row:i+1,code:'OFFICIAL_TARGET_REQUIRED_FIELD',message:'Hedef kaydında zorunlu alan eksik.'});if(!row.sourceVerifiedAt)issues.push({row:i+1,code:'OFFICIAL_TARGET_VERIFIED_AT_REQUIRED',message:'Her resmî hedef kaydında kaynak doğrulama tarihi zorunludur.'});const verdict=validateOfficialSource({sourceKind,authority:authorityForTarget(sourceKind),sourceUrl:row.sourceUrl,sourceVerifiedAt:row.sourceVerifiedAt});if(!verdict.valid)issues.push({row:i+1,code:verdict.code,message:verdict.message});if(issues.length>=50)break;}
 if(issues.length)return json({ok:false,error:{code:'OFFICIAL_TARGET_BATCH_INVALID',message:'Resmî hedef veri paketi kaynak doğrulamasından geçemedi.',details:issues}},400);
 const response=await app.fetch(request,env,ctx);if(response.ok){try{const policy=OFFICIAL_SOURCE_POLICIES.find(x=>x.kind===sourceKind)!;await recordOfficialKnowledgeEvent(env,{sourceKind:sourceKind as OfficialSourceKind,authority:policy.authority,entityType:'ACADEMIC_TARGET_BATCH',entityId:`${sourceKind}:${year}`,dataYear:year,sourceUrl:policy.baseUrl,sourceTitle:policy.title,sourceVerifiedAt:new Date().toISOString(),rowCount:rows.length,createdBy:auth.user!.id});}catch(error){console.error('Official target provenance event failed',error)}}return response;
}

export default {
 async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
  const url=new URL(request.url);
  if(url.pathname==='/api/academic-targets/import'&&request.method==='POST')return guardedTargetImport(request,env,ctx);
  if(url.pathname==='/api/academic-targets/import-preview'||url.pathname.startsWith('/api/academic-targets/import-jobs')){const auth=await requireSuper(request,env);if(auth.response)return auth.response;const response=await handleAcademicTargetFileImport(request,env,auth.user!);if(response)return response;}
  if(!url.pathname.startsWith('/api/official-knowledge/'))return app.fetch(request,env,ctx);
  const auth=await requireSuper(request,env);if(auth.response)return auth.response;
  if(url.pathname==='/api/official-knowledge/sources'&&request.method==='GET')return json({ok:true,sources:OFFICIAL_SOURCE_POLICIES});
  if(url.pathname==='/api/official-knowledge/status'&&request.method==='GET')return json({ok:true,...await officialKnowledgeStatus(env)});
  if(url.pathname==='/api/official-knowledge/validate'&&request.method==='POST'){
   const body:any=await request.json().catch(()=>({}));const verdict=validateOfficialSource({sourceKind:body.sourceKind,authority:body.authority,sourceUrl:body.sourceUrl,sourceTitle:body.sourceTitle,sourceVerifiedAt:body.sourceVerifiedAt});
   return json({ok:true,verdict});
  }
  return json({ok:false,error:{code:'NOT_FOUND',message:'Resmî eğitim bilgi katmanı API yolu bulunamadı.'}},404);
 },
 async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){if('scheduled' in app&&typeof app.scheduled==='function')return app.scheduled(event,env,ctx);},
} satisfies ExportedHandler<Env>;
