import type {AuthUser,Env} from '../types';
import {badRequest,forbidden,json,uuid} from './db';
import {reviewQuestionWithGate} from './question-review';

/**
 * A008: fast human review of many questions in one action.
 *
 * Every item goes through the unchanged single-question gate, so each question
 * keeps its own revision fence, live curriculum fence, copyright/RESTRICTED
 * block, option/answer validation and media integrity check, and gets its own
 * reviewed_by/reviewed_at. The reviewer's checks and justification are given
 * once and recorded on every approved question together with the batch id, so
 * a batch decision stays distinguishable from a one-by-one decision.
 * Items are independent: one failing item never blocks or rolls back another.
 */
export const REVIEW_BATCH_MAX = 50;
const BATCH_STATUSES = ['APPROVED','REJECTED','DRAFT'] as const;

export async function reviewQuestionBatch(request:Request,env:Env,user:AuthUser){
 if(user.role!=='SUPER_ADMIN')return forbidden('Soru onayını yalnız Süper Admin yapabilir.');
 const body:any=await request.json().catch(()=>null);
 if(!body||typeof body!=='object')return badRequest('Toplu inceleme isteği okunamadı.','INVALID_BATCH');
 const status=String(body.status||'').toUpperCase();
 if(!(BATCH_STATUSES as readonly string[]).includes(status))return badRequest('Toplu işlem yalnız onay, ret veya düzeltmeye gönderme olabilir.','INVALID_STATUS');
 const items=Array.isArray(body.items)?body.items:[];
 if(items.length<1||items.length>REVIEW_BATCH_MAX)return badRequest(`Bir seferde 1–${REVIEW_BATCH_MAX} soru seçin.`,'INVALID_BATCH_SIZE');
 const ids=items.map((item:any)=>item&&typeof item.id==='string'?item.id.trim():'');
 if(ids.some((id:string)=>!id)||new Set(ids).size!==ids.length)return badRequest('Seçilen soru kimlikleri geçersiz veya tekrarlı.','INVALID_BATCH_ITEMS');
 const note=String(body.note||'').trim();
 if(status==='REJECTED'&&note.length<5)return badRequest('Toplu ret için kısa bir gerekçe yazın.','REJECTION_NOTE_REQUIRED');
 const batchId=uuid('qrb');
 const results:Array<{id:string;ok:boolean;code?:string;message?:string}>=[];
 for(let index=0;index<items.length;index++){
  const item=items[index];
  const itemRequest=new Request(request.url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({
   status,expectedRevision:item.expectedRevision,expectedContext:item.expectedContext,
   checks:body.checks,qualityReview:body.qualityReview,note,batchId,
  })});
  try{
   const response=await reviewQuestionWithGate(itemRequest,env,user,ids[index]);
   const payload:any=await response.json().catch(()=>({}));
   results.push(response.ok?{id:ids[index],ok:true}:{id:ids[index],ok:false,code:payload?.error?.code??`HTTP_${response.status}`,message:payload?.error?.message});
  }catch{
   results.push({id:ids[index],ok:false,code:'REVIEW_FAILED',message:'Bu soru için inceleme kaydedilemedi.'});
  }
 }
 const succeeded=results.filter(r=>r.ok).length;
 return json({ok:true,batchId,status,requested:items.length,succeeded,failed:items.length-succeeded,results});
}
