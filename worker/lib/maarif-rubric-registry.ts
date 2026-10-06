import type { AuthUser, Env } from '../types';
import { all, badRequest, forbidden, json, methodNotAllowed, one, uuid } from './db';
import { validateOfficialSource } from './official-education-source';

function text(value:unknown,min:number,max:number):string {
 if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)throw new Error(`Metin uzunluğu ${min}–${max} karakter olmalıdır.`);
 return value.trim();
}
function officialSource(body:any) {
 const sourceUrl=text(body.sourceUrl,10,2000);
 const parsed=new URL(sourceUrl);
 if(parsed.username||parsed.password||parsed.port)throw new Error('Kaynak adresi kullanıcı bilgisi veya özel port içeremez.');
 const sourceTitle=text(body.sourceTitle,3,500);
 const verdict=validateOfficialSource({authority:'MEB',sourceUrl,sourceTitle});
 if(!verdict.valid)throw new Error(verdict.message);
 return {sourceUrl:verdict.sourceUrl,sourceTitle,sourceLocator:text(body.sourceLocator,2,500)};
}
export function validateRubricCriteria(value:unknown) {
 if(!Array.isArray(value)||value.length<1||value.length>10)throw new Error('Rubrik 1–10 ölçüt içermelidir.');
 const ids=new Set<string>();
 return value.map((criterion:any)=>{
  if(!criterion||typeof criterion!=='object')throw new Error('Ölçüt geçersiz.');
  const id=text(criterion.id,1,80);if(ids.has(id))throw new Error('Ölçüt kimlikleri tekil olmalıdır.');ids.add(id);
  if(!Array.isArray(criterion.levels)||criterion.levels.length<2||criterion.levels.length>5)throw new Error('Her ölçüt 2–5 gözlenebilir düzey içermelidir.');
  const levelIds=new Set<string>();
  const levels=criterion.levels.map((level:any)=>{
   if(!level||typeof level!=='object')throw new Error('Düzey geçersiz.');
   const levelId=text(level.id,1,80);if(levelIds.has(levelId))throw new Error('Düzey kimlikleri tekil olmalıdır.');levelIds.add(levelId);
   return {id:levelId,label:text(level.label,2,120),description:text(level.description,10,1000)};
  });
  return {id,title:text(criterion.title,3,200),description:text(criterion.description,10,1000),levels};
 });
}

// Caller authenticates first; retain role enforcement here for future callers.
export async function handleMaarifRegistry(request:Request,env:Env,actor:AuthUser):Promise<Response|null> {
 const path=new URL(request.url).pathname;
 const listing=path.match(/^\/api\/curriculum-admin\/versions\/([^/]+)\/learning-rubrics$/);
 const componentPath=path==='/api/curriculum-admin/process-components';
 const rubricPath=path==='/api/curriculum-admin/learning-rubrics';
 if(!listing&&!componentPath&&!rubricPath)return null;
 if(actor.role!=='SUPER_ADMIN')return forbidden();
 if(listing){
  if(request.method!=='GET')return methodNotAllowed();
  const components=await all<any>(env.DB.prepare(`SELECT pc.*,o.code outcome_code,o.title outcome_title FROM curriculum_process_components pc JOIN outcomes o ON o.id=pc.outcome_id WHERE o.curriculum_version_id=? ORDER BY o.code,pc.code`).bind(listing[1]));
  const rubrics=await all<any>(env.DB.prepare(`SELECT r.* FROM learning_rubric_versions r JOIN curriculum_process_components pc ON pc.id=r.component_id JOIN outcomes o ON o.id=pc.outcome_id WHERE o.curriculum_version_id=? ORDER BY r.published_at DESC,r.id`).bind(listing[1]));
  return json({ok:true,components,rubrics:rubrics.map(r=>({...r,criteria:JSON.parse(r.criteria_json),criteria_json:undefined})),policy:{automaticCompetencyInference:false,definitionsImmutable:true,officialDomainCheckIsContentVerification:false}});
 }
 if(request.method!=='POST')return methodNotAllowed();
 let normalized:any;
 try{
  const raw=await request.text();if(raw.length>65000)return badRequest('Kayıt boyutu sınırı aşıldı.');
  const body=JSON.parse(raw);
  if(!body||typeof body!=='object'||body.confirmedSource!==true)throw new Error('Kaynak içeriği ve kayıt açıkça doğrulanmalıdır.');
  const reviewNote=text(body.reviewNote,20,1000);
  const versionId=text(body.versionId,1,100);
  if(componentPath)normalized={versionId,outcomeId:text(body.outcomeId,1,100),code:text(body.code,1,100),title:text(body.title,3,1000),reviewNote,...officialSource(body)};
  else {
   if(!['OFFICIAL','TEACHER_DESIGNED'].includes(body.sourceKind))throw new Error('Rubrik kaynağı seçilmelidir.');
   normalized={versionId,componentId:text(body.componentId,1,100),versionLabel:text(body.versionLabel,1,80),title:text(body.title,3,200),taskInstructions:text(body.taskInstructions,20,4000),criteria:validateRubricCriteria(body.criteria),sourceKind:body.sourceKind,reviewNote,...(body.sourceKind==='OFFICIAL'?officialSource(body):{sourceUrl:null,sourceTitle:null,sourceLocator:null})};
  }
 }catch(e){return badRequest(e instanceof Error?e.message:'Kayıt geçersiz.');}
 const n=normalized;
 if(componentPath){
  const outcome=await one(env.DB.prepare(`SELECT o.id FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE o.id=? AND cv.id=? AND o.active=1 AND o.official=1 AND cv.verified=1 AND o.node_type IN ('OUTCOME','SUB_OUTCOME')`).bind(n.outcomeId,n.versionId));
  if(!outcome)return badRequest('Doğrulanmış resmî öğrenme çıktısı seçilmelidir.');
  const id=uuid('pc');
  const result=await env.DB.prepare(`INSERT INTO curriculum_process_components(id,outcome_id,code,title,source_url,source_title,source_locator,review_note,verified_by) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE o.id=? AND cv.id=? AND o.active=1 AND o.official=1 AND cv.verified=1 AND o.node_type IN ('OUTCOME','SUB_OUTCOME')) ON CONFLICT(outcome_id,code) DO NOTHING`).bind(id,n.outcomeId,n.code,n.title,n.sourceUrl,n.sourceTitle,n.sourceLocator,n.reviewNote,actor.id,n.outcomeId,n.versionId).run();
  if(!result.meta.changes)return json({ok:false,error:{code:'COMPONENT_EXISTS',message:'Süreç bileşeni zaten kayıtlı veya seçilen müfredat bağlamı değişti. Kayıtları yenileyin.'}},409);
  return json({ok:true,id},201);
 }
 const component=await one(env.DB.prepare(`SELECT pc.id FROM curriculum_process_components pc JOIN outcomes o ON o.id=pc.outcome_id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE pc.id=? AND cv.id=? AND o.active=1 AND o.official=1 AND cv.verified=1`).bind(n.componentId,n.versionId));
 if(!component)return badRequest('Doğrulanmış süreç bileşeni seçilmelidir.');
 const id=uuid('rub');
 const result=await env.DB.prepare(`INSERT INTO learning_rubric_versions(id,component_id,version_label,title,task_instructions,criteria_json,source_kind,source_url,source_title,source_locator,review_note,published_by) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM curriculum_process_components pc JOIN outcomes o ON o.id=pc.outcome_id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE pc.id=? AND cv.id=? AND o.active=1 AND o.official=1 AND cv.verified=1) ON CONFLICT(component_id,version_label) DO NOTHING`).bind(id,n.componentId,n.versionLabel,n.title,n.taskInstructions,JSON.stringify(n.criteria),n.sourceKind,n.sourceUrl,n.sourceTitle,n.sourceLocator,n.reviewNote,actor.id,n.componentId,n.versionId).run();
 if(!result.meta.changes)return json({ok:false,error:{code:'RUBRIC_CONTEXT_OR_VERSION_CONFLICT',message:'Sürüm zaten kayıtlı veya kaynak bağlamı değişti.'}},409);
 return json({ok:true,id},201);
}
