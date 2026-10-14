import type {AuthUser,Env} from '../types';
import {all,one,json,forbidden,badRequest,notFound} from './db';
import {isAiQuestionOrigin,validMultipleChoiceQuestion} from './question-review';
import {generationOptionCount} from './question-generation-runner';
import {mechanicalDraftIssues} from './question-generation-validation';

export async function handleQuestionContentEdit(request:Request,env:Env,user:AuthUser,id:string):Promise<Response>{
 if(user.role!=='SUPER_ADMIN')return forbidden('İçerik sürümlerini yalnız Süper Admin yönetebilir.');
 const q=await one<any>(env.DB.prepare('SELECT * FROM question_bank WHERE id=?').bind(id));
 if(!q)return notFound('Soru bulunamadı.');
 if(request.method==='GET'){
  const rows=await all<any>(env.DB.prepare('SELECT review_revision,snapshot_json,edited_by,edit_note,edited_at FROM question_content_revisions WHERE question_id=? ORDER BY review_revision DESC LIMIT 20').bind(id));
  return json({ok:true,currentRevision:q.review_revision,revisions:rows.map(r=>{const snapshot=JSON.parse(r.snapshot_json);try{snapshot.options=JSON.parse(snapshot.optionsJson??'null')}catch{snapshot.options=null}return {...r,snapshot,snapshot_json:undefined}})});
 }
 if(q.editorial_packet_json)return json({ok:false,error:{code:'EDITORIAL_ATOMIC_REVISION_REQUIRED',message:'Beceri, çeldirici ve görsel paketi birlikte sürümlenmelidir; kısmi metin değişikliği yapılamaz.'}},409);
 if(request.method!=='PATCH')return json({ok:false,error:{code:'METHOD_NOT_ALLOWED',message:'Geçersiz işlem.'}},405);
 if(request.headers.get('Origin')!==new URL(request.url).origin)return forbidden('İşlemi ANUNEX üzerinden başlatın.');
 const raw=await request.text();if(raw.length>32768)return badRequest('İçerik çok uzun.','CONTENT_TOO_LARGE');
 let b:any;try{b=JSON.parse(raw)}catch{return badRequest('Geçersiz içerik.','INVALID_CONTENT');}
 const allowed=['expectedRevision','stemText','options','correctAnswer','solutionText','editNote'];
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!allowed.includes(k)))return badRequest('Yalnız soru, şık, cevap ve çözüm alanları düzenlenebilir.','INVALID_CONTENT_FIELDS');
 if(!Number.isInteger(b.expectedRevision)||b.expectedRevision!==q.review_revision)return json({ok:false,error:{code:'QUESTION_REVIEW_CHANGED',message:'Soru değişmiş. Güncel içeriği açın.'}},409);
 const validText=(v:any,min:number,max:number)=>typeof v==='string'&&v.trim().length>=min&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(v);
 if(!validText(b.stemText,1,3000)||!validText(b.solutionText,1,5000)||!validText(b.editNote,10,1000)||!Array.isArray(b.options)||![4,5].includes(b.options.length)
 ||b.options.some((o:any,i:number)=>!o||Object.keys(o).sort().join(',')!=='label,text'||o.label!==String.fromCharCode(65+i)||!validText(o.text,1,1200)))return badRequest('Soru, çözüm, seçenekler ve en az10 karakterlik değişiklik gerekçesi gerekir.','INVALID_QUESTION_CONTENT');
 const expectedOptions=generationOptionCount(Number(q.grade_level));
 const candidate={...q,stem_text:b.stemText.trim(),solution_text:b.solutionText.trim(),options_json:JSON.stringify(b.options.map((o:any)=>({label:o.label,text:o.text.trim()}))),correct_answer:b.correctAnswer,option_count:b.options.length};
 if((expectedOptions&&expectedOptions!==b.options.length)||!validMultipleChoiceQuestion(candidate))return badRequest('Sınıfa uygun farklı şıklar ve geçerli cevap anahtarı gerekir.','INVALID_QUESTION_CONTENT');
 const issues=mechanicalDraftIssues({stemText:candidate.stem_text,solutionText:candidate.solution_text,options:JSON.parse(candidate.options_json),correctAnswer:candidate.correct_answer,difficultyLevel:q.difficulty_level??3});
 if(issues.length)return badRequest('Cevap veya işlem kontrolü başarısız.','CONTENT_CHECK_FAILED',{issues});
 if(q.review_status==='APPROVED'||q.review_status==='ARCHIVED')return json({ok:false,error:{code:'QUESTION_CONTENT_LOCKED',message:'Onaylı ve arşiv soruları doğrudan değiştirilemez; geçmiş içeriği koruyun.'}},409);
 // Rich packets need a coordinated text/block/asset revision, not a partial text edit.
 const rich=await one<any>(env.DB.prepare('SELECT (SELECT count(*) FROM question_assets WHERE question_id=?)+(SELECT count(*) FROM question_content_blocks WHERE question_id=?) n').bind(id,id));
 if(q.question_type!=='MULTIPLE_CHOICE'||q.content_mode!=='TEXT'||Number(rich?.n)>0)return json({ok:false,error:{code:'RICH_CONTENT_REVISION_REQUIRED',message:'Medya ve blok içeren sorular birlikte sürümlenmelidir. Bu düzenleyici metin taslakları içindir.'}},409);
 const unchanged=candidate.stem_text===q.stem_text&&candidate.options_json===q.options_json&&candidate.correct_answer===q.correct_answer&&candidate.solution_text===q.solution_text;
 if(unchanged)return json({ok:true,id,reviewRevision:q.review_revision,unchanged:true});
 try{
  const result=await env.DB.prepare(`UPDATE question_bank SET stem_text=?,options_json=?,option_count=?,correct_answer=?,solution_text=?,
   review_status='REVIEW',review_checks_json=NULL,reviewed_by=NULL,reviewed_at=NULL,rejection_note=NULL,
   copyright_status=?,content_edited_by=?,content_edit_note=?,updated_at=CURRENT_TIMESTAMP
   WHERE id=? AND review_revision=? AND review_status NOT IN ('APPROVED','ARCHIVED')
   AND NOT EXISTS(SELECT 1 FROM question_assets WHERE question_id=question_bank.id)
   AND NOT EXISTS(SELECT 1 FROM question_content_blocks WHERE question_id=question_bank.id)`).bind(candidate.stem_text,candidate.options_json,candidate.option_count,candidate.correct_answer,candidate.solution_text,isAiQuestionOrigin(q.origin_kind)?'RESTRICTED':q.copyright_status,user.id,b.editNote.trim(),id,q.review_revision).run();
  if(Number(result.meta?.changes||0)<1)return json({ok:false,error:{code:'QUESTION_REVIEW_CHANGED',message:'Soru düzenleme sırasında değişti; yeniden açın.'}},409);
 }catch(e){if(String(e).includes('QUESTION_CONTENT_LOCKED'))return json({ok:false,error:{code:'QUESTION_CONTENT_LOCKED',message:'Bu soru bir öğrenci çalışması, kitap veya sınavda kullanılmış; geçmiş içerik değiştirilemez.'}},409);throw e;}
 const current=await one<any>(env.DB.prepare('SELECT review_revision FROM question_bank WHERE id=?').bind(id));
 return json({ok:true,id,reviewRevision:current?.review_revision,requiresReview:true});
}
