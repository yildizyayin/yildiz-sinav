import type { AuthUser,Env } from '../types';
import { all,badRequest,forbidden,json,notFound,one } from './db';

async function canUseDocument(env:Env,user:AuthUser,id:string){
  const row=await one<any>(env.DB.prepare(`SELECT institution_id,created_by FROM studio_documents WHERE id=?`).bind(id));
  if(!row)return {row:null,allowed:false};
  if(user.role==='SUPER_ADMIN')return {row,allowed:true};
  if(!user.institution_id||row.institution_id!==user.institution_id)return {row,allowed:false};
  if(user.role==='INSTITUTION_MANAGER')return {row,allowed:true};
  return {row,allowed:row.created_by===user.id};
}

async function studioDocument(env:Env,user:AuthUser,id:string){
  const access=await canUseDocument(env,user,id);if(!access.row)return notFound('Belge bulunamadı.');if(!access.allowed)return forbidden();
  const document=await one<any>(env.DB.prepare(`SELECT d.*,i.name institution_name,i.city,i.district FROM studio_documents d LEFT JOIN institutions i ON i.id=d.institution_id WHERE d.id=?`).bind(id));
  const items=await all<any>(env.DB.prepare(`SELECT si.sort_order,si.booklet_code,q.id question_id,q.stem_text,q.options_json,q.correct_answer,q.solution_text,q.question_type,q.difficulty,q.topic,q.subtopic,s.name subject_name
    FROM studio_document_items si JOIN question_bank q ON q.id=si.question_id LEFT JOIN subjects s ON s.id=q.subject_id WHERE si.document_id=? ORDER BY si.booklet_code,si.sort_order`).bind(id));
  return json({ok:true,document,items:items.map(x=>({...x,options:parseJson(x.options_json,[])})),answerKey:items.map(x=>({no:x.sort_order,answer:x.correct_answer,booklet:x.booklet_code,subject:x.subject_name}))});
}

function parseJson(v:any,f:any){if(typeof v!=='string'||!v)return f;try{return JSON.parse(v)}catch{return f}}

async function reviewQuestion(request:Request,env:Env,user:AuthUser,id:string){
  if(user.role!=='SUPER_ADMIN')return forbidden();const b:any=await request.json().catch(()=>({}));const status=String(b.status||'APPROVED').toUpperCase();if(!['APPROVED','REJECTED','DRAFT','ARCHIVED'].includes(status))return badRequest('Geçersiz inceleme durumu.');const q=await one<any>(env.DB.prepare(`SELECT id FROM question_bank WHERE id=?`).bind(id));if(!q)return notFound('Soru bulunamadı.');await env.DB.prepare(`UPDATE question_bank SET review_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,id).run();return json({ok:true,id,status});
}

async function generateQuestion(request:Request,env:Env,user:AuthUser){
  if(!['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role))return forbidden();
  const b:any=await request.json().catch(()=>({}));const prompt=String(b.prompt||'').trim();if(!prompt)return badRequest('Soru üretim talimatı gereklidir.');
  const system='Sen eğitim içeriği için taslak soru üreten bir asistansın. Çıktıyı sadece JSON olarak ver: {"stemText":"...","options":["A ...","B ...","C ...","D ...","E ..."],"correctAnswer":"A","solutionText":"..."}. Telifli bir soruyu kopyalama; özgün taslak üret. Öğretmen onayı gerektiğini varsay.';
  let raw='';if(env.AI){try{const r:any=await env.AI.run((env.NIBIRU_AI_MODEL||'@cf/zai-org/glm-4.7-flash') as any,{messages:[{role:'system',content:system},{role:'user',content:prompt}],max_tokens:900,temperature:.35});raw=String(r?.response||r?.result?.response||r?.choices?.[0]?.message?.content||'').trim()}catch{}}
  if(!raw)return json({ok:false,error:{code:'AI_UNAVAILABLE',message:'AI soru taslağı şu anda üretilemedi.'}},503);
  const cleaned=raw.replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();let draft:any;try{draft=JSON.parse(cleaned)}catch{return json({ok:false,error:{code:'AI_INVALID_OUTPUT',message:'AI taslağı doğrulanabilir JSON üretmedi. Tekrar deneyin.'}},502)}
  return json({ok:true,draft:{stemText:String(draft.stemText||''),options:Array.isArray(draft.options)?draft.options:[],correctAnswer:String(draft.correctAnswer||'').toUpperCase(),solutionText:String(draft.solutionText||'')},requiresHumanApproval:true});
}

export async function handlePlatformOps(request:Request,env:Env,user:AuthUser):Promise<Response|null>{
  const p=new URL(request.url).pathname;
  let m=p.match(/^\/api\/platform\/studio\/([^/]+)$/);if(m&&request.method==='GET')return studioDocument(env,user,m[1]);
  m=p.match(/^\/api\/platform\/questions\/([^/]+)\/review$/);if(m&&request.method==='PATCH')return reviewQuestion(request,env,user,m[1]);
  if(p==='/api/platform/questions/generate'&&request.method==='POST')return generateQuestion(request,env,user);
  return null;
}
