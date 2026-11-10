import app from './standard-review-entry';
import type { AuthUser, Env } from './types';
import { getAuthUser } from './lib/auth';
import { all,json,one,uuid } from './lib/db';
import { publishedForLearnersSql } from './lib/exam-schedule';
import { buildDejavuBook, gradeDejavuAnswers, type ExamGapSource } from './lib/dejavu';
import { renderDejavuBookPdf, StudioPrintError, type DejavuPrint, type DejavuSection } from './lib/studio-pdf';
import { SERVABLE_VIDEO_SQL } from './lib/video-links';

function fail(status:number,code:string,message:string){return json({ok:false,error:{code,message}},status)}
async function studentUser(env:Env,request:Request):Promise<AuthUser|Response>{const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(user.role!=='STUDENT'||!user.student_id)return fail(403,'STUDENT_ONLY','Bu özellik öğrenci hesabına açıktır.');return user;}
async function enrollment(env:Env,studentId:string){return one<any>(env.DB.prepare(`SELECT e.*,c.name class_name FROM student_enrollments e LEFT JOIN classes c ON c.id=e.class_id WHERE e.student_id=? ORDER BY CASE e.status WHEN 'ACTIVE' THEN 0 WHEN 'GRADUATED' THEN 1 ELSE 2 END,e.created_at DESC LIMIT 1`).bind(studentId));}
function safeCount(v:any,min=0,max=100){return Math.max(min,Math.min(max,Number(v||0)));}

async function personalBooks(env:Env,user:AuthUser){const rows=await all<any>(env.DB.prepare(`SELECT b.*,(SELECT count(*) FROM student_personal_book_items i WHERE i.book_id=b.id AND i.item_type='PRACTICE_QUESTION' AND i.student_answer IS NOT NULL) answered_count,(SELECT COALESCE(sum(i.correct),0) FROM student_personal_book_items i WHERE i.book_id=b.id AND i.item_type='PRACTICE_QUESTION') correct_count FROM student_personal_books b WHERE b.student_id=? ORDER BY b.created_at DESC LIMIT 50`).bind(user.student_id));return json({ok:true,books:rows.map(r=>({...r,config:JSON.parse(r.config_json||'{}')}))});}

/**
 * A058 gaps from the published deneme outcome results: used by Dejavu when the karne has no outcome evidence yet.
 * Filters on the aggregate correct/evidence ratio, never on the stored success_rate column.
 */
const examOutcomeGaps=(env:Env):ExamGapSource=>async(studentId,limit)=>{
 const rows=await all<any>(env.DB.prepare(`SELECT o.id outcome_id,o.title,o.topic,o.subtopic,o.subject_id,s.name subject_name,SUM(r.evidence_count) evidence_count,
   CASE WHEN SUM(r.evidence_count)>0 THEN CAST(SUM(r.correct_count) AS REAL)/SUM(r.evidence_count) ELSE 0 END success_rate
   FROM outcome_results r JOIN outcomes o ON o.id=r.outcome_id JOIN subjects s ON s.id=o.subject_id
   WHERE r.student_id=? AND ${publishedForLearnersSql('r.exam_id')} GROUP BY o.id,o.title,o.topic,o.subtopic,o.subject_id,s.name
   HAVING SUM(r.evidence_count)>=3 AND (CAST(SUM(r.correct_count) AS REAL)/NULLIF(SUM(r.evidence_count),0))<0.70
   ORDER BY success_rate ASC,evidence_count DESC LIMIT ?`).bind(studentId,limit));
 return rows.map(r=>({outcomeId:r.outcome_id,title:r.title,subjectId:r.subject_id,subjectName:r.subject_name,topic:r.topic,subtopic:r.subtopic,rate:Number(r.success_rate),evidence:Number(r.evidence_count),source:'EXAM' as const}));
};

/** Dejavu (owner, 10 Nov 2026): the book from the unified karne — see worker/lib/dejavu.ts for the rules. */
async function generatePersonalBook(request:Request,env:Env,user:AuthUser){
 const body:any=await request.json().catch(()=>({}));
 const built=await buildDejavuBook(env,{studentId:user.student_id!,generatedBy:user.id,title:body.title,outcomeLimit:body.outcomeLimit,questionsPerOutcome:body.questionsPerOutcome,sourceMode:body.sourceMode,examGaps:examOutcomeGaps(env)});
 if('error' in built)return built.error==='ENROLLMENT_REQUIRED'?fail(400,'ENROLLMENT_REQUIRED','Öğrenci sınıf kaydı bulunamadı.'):fail(400,'INSUFFICIENT_EVIDENCE','Kişiye Özel Kitap oluşturmak için henüz yeterli gelişim alanı kanıtı yok.');
 return json({ok:true,...built,note:built.questionCount>0?(built.shortages.length?'Yalnız onaylı ve telif durumu uygun sorular kullanıldı; bazı kazanımlarda yeterli yeni soru yok.':'Yalnız telif durumu uygun, onaylı soru havuzu içerikleri kitaba alındı.'):'Gelişim alanları hazır; basılabilir soru havuzu henüz yeterli değil.'},201);
}

/** Dejavu: the student's answers to their own book, graded on the server and written to the karne. */
async function personalBookAnswers(request:Request,env:Env,user:AuthUser,id:string){
 const book=await one<any>(env.DB.prepare(`SELECT id FROM student_personal_books WHERE id=? AND student_id=?`).bind(id,user.student_id));if(!book)return fail(404,'BOOK_NOT_FOUND','Kişiye Özel Kitap bulunamadı.');
 const body:any=await request.json().catch(()=>({}));
 const result=await gradeDejavuAnswers(env,id,user.student_id!,body.answers);
 return json({ok:true,...result});
}

/** Everything the Dejavu PDF needs for one book; shared by the student and staff downloads. */
export async function dejavuPrintInput(env:Env,bookId:string,origin:string,answerKey:'APPEND'|'NONE'):Promise<{error:Response}|{book:any;input:DejavuPrint}>{
 const book=await one<any>(env.DB.prepare(`SELECT b.*,st.first_name,st.last_name,i.name institution_name FROM student_personal_books b JOIN student_entities st ON st.id=b.student_id LEFT JOIN institutions i ON i.id=b.institution_id WHERE b.id=?`).bind(bookId));
 if(!book)return {error:fail(404,'BOOK_NOT_FOUND','Kişiye Özel Kitap bulunamadı.')};
 const items=await all<any>(env.DB.prepare(`SELECT i.item_type,i.outcome_id,i.bank_question_id,i.payload_json,i.solution_code,q.review_status,q.copyright_status FROM student_personal_book_items i LEFT JOIN question_bank q ON q.id=i.bank_question_id WHERE i.book_id=? ORDER BY i.sort_order`).bind(bookId));
 const cls=await one<any>(env.DB.prepare(`SELECT c.name FROM student_enrollments e LEFT JOIN classes c ON c.id=e.class_id WHERE e.student_id=? AND e.status='ACTIVE' ORDER BY e.created_at DESC LIMIT 1`).bind(book.student_id));
 const sections:DejavuSection[]=[];
 for(const it of items){
  if(it.item_type==='OUTCOME_HEADER'){const p=JSON.parse(it.payload_json||'{}');const short=Number(p.found)<Number(p.wanted)?`Bu kazanımda şimdilik ${p.found} yeni onaylı soru var.`:null;sections.push({heading:[p.subject,p.title].filter(Boolean).join(' · ')||'Kazanım',note:short,items:[]});continue;}
  if(it.item_type!=='PRACTICE_QUESTION')continue;
  if(it.review_status!=='APPROVED'||!['OWNED','LICENSED','PUBLIC_DOMAIN'].includes(it.copyright_status))return {error:fail(409,'BOOK_CONTENT_CHANGED','Kitaptaki bir sorunun onayı veya kullanım hakkı değişti; kitabı yeniden oluşturun.')};
  sections[sections.length-1]?.items.push({questionId:it.bank_question_id,solutionUrl:it.solution_code?`${origin}/dejavu/cozum/${it.solution_code}`:null});
 }
 const filled=sections.filter(x=>x.items.length);if(!filled.length)return {error:fail(409,'BOOK_EMPTY','Kitapta basılabilir soru yok.')};
 const name=[book.first_name,book.last_name].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR').replace(/(^|\s)\S/g,(c:string)=>c.toLocaleUpperCase('tr-TR'));
 const date=new Date(String(book.created_at||'').replace(' ','T')+'Z');
 const input:DejavuPrint={title:book.title||'Dejavu · Kişiye Özel Kitabım',studentName:name||'Öğrenci',classLine:[cls?.name||(book.grade_level?`${book.grade_level}. sınıf`:''),book.academic_year].filter(Boolean).join(' · ')||'—',institutionName:book.institution_name||null,dateLabel:Number.isNaN(date.getTime())?'':date.toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'}),bookUrl:`${origin}/my-books`,sections:filled,answerKey};
 return {book,input};
}

/** Dejavu PDF: cover, outcome sections, a solution QR under each question, the answer key at the back. */
async function personalBookPdf(env:Env,user:AuthUser,id:string,origin:string):Promise<Response>{
 const own=await one<any>(env.DB.prepare(`SELECT id FROM student_personal_books WHERE id=? AND student_id=?`).bind(id,user.student_id));if(!own)return fail(404,'BOOK_NOT_FOUND','Kişiye Özel Kitap bulunamadı.');
 const prepared=await dejavuPrintInput(env,id,origin,'APPEND');if('error' in prepared)return prepared.error;
 try{const out=await renderDejavuBookPdf(env,prepared.input);return new Response(out.bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="dejavu-kitabim.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
 catch(e){if(e instanceof StudioPrintError)return fail(422,e.code,e.message);throw e;}
}

/**
 * The page a printed QR opens. Without revealing: the question and any approved topic video for its outcome.
 * Revealing shows the answer and the written solution; if the student has not answered it yet, their later answer
 * no longer counts as karne evidence (they saw the key).
 */
export async function dejavuSolution(env:Env,code:string,reveal:boolean,studentId:string|null){
 const it=await one<any>(env.DB.prepare(`SELECT i.id,i.outcome_id,i.student_answer,i.correct,i.answered_at,i.solution_viewed_at,b.student_id,b.id book_id,b.title book_title,q.stem_text,q.options_json,q.correct_answer,q.solution_text,o.code outcome_code,o.title outcome_title,s.name subject_name
   FROM student_personal_book_items i JOIN student_personal_books b ON b.id=i.book_id JOIN question_bank q ON q.id=i.bank_question_id LEFT JOIN outcomes o ON o.id=i.outcome_id LEFT JOIN subjects s ON s.id=o.subject_id
   WHERE i.solution_code=? AND i.item_type='PRACTICE_QUESTION'`).bind(code));
 if(!it||(studentId&&it.student_id!==studentId))return null;
 const no=await one<any>(env.DB.prepare(`SELECT count(*) n FROM student_personal_book_items WHERE book_id=? AND item_type='PRACTICE_QUESTION' AND sort_order<=(SELECT sort_order FROM student_personal_book_items WHERE id=?)`).bind(it.book_id,it.id));
 const video=await one<any>(env.DB.prepare(`SELECT vl.title,vl.url FROM video_links vl WHERE vl.outcome_id=? AND vl.link_type='TOPIC' AND ${SERVABLE_VIDEO_SQL} ORDER BY vl.id LIMIT 1`).bind(it.outcome_id))
  ||await one<any>(env.DB.prepare(`SELECT title,url FROM learning_videos WHERE node_id=? AND approved=1 AND active=1 ORDER BY created_at DESC LIMIT 1`).bind(`ln_${it.outcome_id}`));
 if(reveal&&studentId&&!it.solution_viewed_at)await env.DB.prepare(`UPDATE student_personal_book_items SET solution_viewed_at=CURRENT_TIMESTAMP WHERE id=? AND solution_viewed_at IS NULL`).bind(it.id).run();
 const shown=reveal||Boolean(it.student_answer);
 return {ok:true,bookId:it.book_id,bookTitle:it.book_title,number:Number(no?.n||0),outcome:{code:it.outcome_code,title:it.outcome_title,subjectName:it.subject_name},question:{stem_text:it.stem_text,options:it.options_json?JSON.parse(it.options_json):[]},
  video:video?{title:video.title||'Konu anlatımı',url:video.url}:null,answered:it.student_answer?{answer:it.student_answer,correct:Boolean(it.correct)}:null,
  ...(shown?{solution:{correctAnswer:it.correct_answer,text:it.solution_text||null}}:{}),
  // whether this question still counts in the karne: answered before the key was seen, or not seen at all yet
  countsAsEvidence:it.student_answer?!(it.solution_viewed_at&&String(it.solution_viewed_at)<=String(it.answered_at)):!(it.solution_viewed_at||reveal)};
}

async function personalBookDetail(env:Env,user:AuthUser,id:string){const book=await one<any>(env.DB.prepare(`SELECT * FROM student_personal_books WHERE id=? AND student_id=?`).bind(id,user.student_id));if(!book)return fail(404,'BOOK_NOT_FOUND','Kişiye Özel Kitap bulunamadı.');const items=await all<any>(env.DB.prepare(`SELECT i.*,s.name subject_name,o.title outcome_title,q.stem_text,q.options_json,q.correct_answer,q.solution_text,q.copyright_status FROM student_personal_book_items i LEFT JOIN subjects s ON s.id=i.subject_id LEFT JOIN outcomes o ON o.id=i.outcome_id LEFT JOIN question_bank q ON q.id=i.bank_question_id WHERE i.book_id=? ORDER BY i.sort_order`).bind(id));return json({ok:true,book:{...book,config:JSON.parse(book.config_json||'{}')},items:items.map(x=>{const answered=Boolean(x.student_answer);const{correct_answer,solution_text,...rest}=x;return{...rest,...(answered?{correct_answer,solution_text}:{}),payload:JSON.parse(x.payload_json||'{}'),options:x.options_json?JSON.parse(x.options_json):null}})});}

async function zeroErrorBooks(env:Env,user:AuthUser){const rows=await all<any>(env.DB.prepare(`SELECT z.*,e.title source_exam_title,e.exam_date FROM zero_error_booklets z LEFT JOIN exams e ON e.id=z.source_exam_id WHERE z.student_id=? ORDER BY z.created_at DESC LIMIT 50`).bind(user.student_id));return json({ok:true,booklets:rows.map(r=>({...r,config:JSON.parse(r.config_json||'{}')}))});}

async function generateZeroError(request:Request,env:Env,user:AuthUser){
 const body:any=await request.json().catch(()=>({}));const examId=String(body.examId||'').trim();if(!examId)return fail(400,'EXAM_REQUIRED','Sıfır Hata Kitapçığı için bir sınav seçilmelidir.');const enr=await enrollment(env,user.student_id!);if(!enr)return fail(400,'ENROLLMENT_REQUIRED','Öğrenci sınıf kaydı bulunamadı.');
 const answerRows=await all<any>(env.DB.prepare(`SELECT q.id question_id,q.subject_id,sa.status,o.id outcome_id,o.title outcome_title,o.topic,o.subtopic FROM exam_participants ep JOIN student_answers sa ON sa.participant_id=ep.id JOIN exam_questions q ON q.id=sa.exam_question_id LEFT JOIN question_outcomes qo ON qo.exam_question_id=q.id LEFT JOIN outcomes o ON o.id=qo.outcome_id WHERE ep.student_id=? AND ep.exam_id=? AND sa.status IN ('WRONG','BLANK') AND ${publishedForLearnersSql('ep.exam_id')} ORDER BY coalesce(q.global_no,9999),q.question_no`).bind(user.student_id,examId));
 // one row per source question even when it measures several outcomes
 const answers=answerRows.filter((a,k)=>answerRows.findIndex(b=>b.question_id===a.question_id)===k);
 if(!answers.length&&!(await one(env.DB.prepare(`SELECT 1 WHERE ${publishedForLearnersSql('?')}`).bind(examId))))return fail(409,'RESULTS_NOT_PUBLISHED','Bu sınavın sonuçları henüz yayımlanmadı.');
 if(!answers.length)return fail(400,'ZERO_ERROR_ALREADY','Bu sınavda Sıfır Hata Kitapçığına girecek yanlış veya boş soru bulunmuyor.');
 const wrong=answers.filter(x=>x.status==='WRONG').length,blank=answers.filter(x=>x.status==='BLANK').length,id=uuid('zeb');const perSource=safeCount(body.practicePerSource||2,1,4);let practice=0,order=1;const stmts:any[]=[env.DB.prepare(`INSERT INTO zero_error_booklets(id,student_id,institution_id,source_exam_id,title,status,wrong_count,blank_count,practice_count,unresolved_count,config_json,generated_by) VALUES(?,?,?,?,?,'ACTIVE',?,?,?,?,?,?)`).bind(id,user.student_id,enr.institution_id,examId,String(body.title||'Sıfır Hata Kitapçığım').trim()||'Sıfır Hata Kitapçığım',wrong,blank,0,answers.length,JSON.stringify({practicePerSource:perSource}),user.id)];
 const used:string[]=[];
 for(const a of answers){
  const similar=!a.outcome_id?[]:await all<any>(env.DB.prepare(`SELECT q.id,COALESCE(q.difficulty_level,q.difficulty,3) difficulty FROM question_bank q WHERE q.review_status='APPROVED' AND q.grade_level=? AND q.subject_id=? AND q.copyright_status IN ('OWNED','LICENSED','PUBLIC_DOMAIN') AND COALESCE(q.question_type,'MULTIPLE_CHOICE')='MULTIPLE_CHOICE' AND q.correct_answer IS NOT NULL AND EXISTS(SELECT 1 FROM question_learning_links l WHERE l.question_id=q.id AND l.node_id='ln_'||?) AND q.id NOT IN (SELECT value FROM json_each(?)) ORDER BY ABS(COALESCE(q.difficulty_level,q.difficulty,3)-3),RANDOM() LIMIT ?`).bind(enr.grade_level,a.subject_id,a.outcome_id,JSON.stringify(used),perSource));
  if(similar.length){for(const q of similar){stmts.push(env.DB.prepare(`INSERT INTO zero_error_booklet_items(id,booklet_id,source_exam_question_id,outcome_id,subject_id,original_status,bank_question_id,cycle_no,item_status,sort_order,payload_json) VALUES(?,?,?,?,?,?,?,1,'PRACTICE_READY',?,?)`).bind(uuid('zei'),id,a.question_id,a.outcome_id||null,a.subject_id,a.status,q.id,order++,JSON.stringify({outcomeTitle:a.outcome_title,source:'APPROVED_QUESTION_BANK'})));used.push(q.id);practice++;}}
  else stmts.push(env.DB.prepare(`INSERT INTO zero_error_booklet_items(id,booklet_id,source_exam_question_id,outcome_id,subject_id,original_status,cycle_no,item_status,sort_order,payload_json) VALUES(?,?,?,?,?,?,1,'TO_REVIEW',?,?)`).bind(uuid('zei'),id,a.question_id,a.outcome_id||null,a.subject_id,a.status,order++,JSON.stringify({outcomeTitle:a.outcome_title,note:'Benzer basılabilir soru henüz havuzda yok.'})));
 }
 stmts.push(env.DB.prepare(`UPDATE zero_error_booklets SET practice_count=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(practice,practice>0?'READY':'ACTIVE',id));await env.DB.batch(stmts);
 return json({ok:true,id,wrongCount:wrong,blankCount:blank,practiceCount:practice,unresolvedCount:answers.length,status:practice>0?'READY':'ACTIVE'},201);
}

async function zeroErrorDetail(env:Env,user:AuthUser,id:string){const booklet=await one<any>(env.DB.prepare(`SELECT z.*,e.title source_exam_title,e.exam_date FROM zero_error_booklets z LEFT JOIN exams e ON e.id=z.source_exam_id WHERE z.id=? AND z.student_id=?`).bind(id,user.student_id));if(!booklet)return fail(404,'BOOKLET_NOT_FOUND','Sıfır Hata Kitapçığı bulunamadı.');const items=await all<any>(env.DB.prepare(`SELECT i.*,s.name subject_name,o.title outcome_title,q.stem_text,q.options_json,q.correct_answer,q.solution_text,q.copyright_status FROM zero_error_booklet_items i LEFT JOIN subjects s ON s.id=i.subject_id LEFT JOIN outcomes o ON o.id=i.outcome_id LEFT JOIN question_bank q ON q.id=i.bank_question_id WHERE i.booklet_id=? ORDER BY i.sort_order`).bind(id));return json({ok:true,booklet:{...booklet,config:JSON.parse(booklet.config_json||'{}')},items:items.map(x=>({...x,payload:JSON.parse(x.payload_json||'{}'),options:x.options_json?JSON.parse(x.options_json):null}))});}

async function zeroErrorAttempt(request:Request,env:Env,user:AuthUser,itemId:string){const item=await one<any>(env.DB.prepare(`SELECT i.*,q.correct_answer,z.student_id FROM zero_error_booklet_items i JOIN zero_error_booklets z ON z.id=i.booklet_id LEFT JOIN question_bank q ON q.id=i.bank_question_id WHERE i.id=? AND z.student_id=?`).bind(itemId,user.student_id));if(!item)return fail(404,'ITEM_NOT_FOUND','Sıfır Hata çalışma sorusu bulunamadı.');const key=item.correct_answer;if(!item.bank_question_id||!key)return fail(400,'PRACTICE_NOT_READY','Bu madde henüz cevaplanabilir benzer soruya bağlı değil.');const body:any=await request.json().catch(()=>({}));const answer=String(body.answer||'').trim().toLocaleUpperCase('tr-TR');if(!/^[A-E]$/.test(answer))return fail(400,'ANSWER_INVALID','Bir seçenek işaretleyin (A–E).');const correct=answer===String(key).trim().toLocaleUpperCase('tr-TR');await env.DB.batch([env.DB.prepare(`INSERT INTO zero_error_attempts(id,booklet_item_id,student_id,answer,correct,score) VALUES(?,?,?,?,?,?)`).bind(uuid('zea'),itemId,user.student_id,answer,correct?1:0,correct?1:0),env.DB.prepare(`UPDATE zero_error_booklet_items SET item_status=?,last_score=?,last_attempt_at=CURRENT_TIMESTAMP WHERE id=?`).bind(correct?'MASTERED':'NEEDS_REPEAT',correct?1:0,itemId)]);const remain=await one<any>(env.DB.prepare(`SELECT COUNT(*) c FROM zero_error_booklet_items WHERE booklet_id=? AND item_status<>'MASTERED'`).bind(item.booklet_id));await env.DB.prepare(`UPDATE zero_error_booklets SET unresolved_count=?,status=?,completed_at=CASE WHEN ?=0 THEN CURRENT_TIMESTAMP ELSE completed_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(Number(remain?.c||0),Number(remain?.c||0)===0?'COMPLETED':'READY',Number(remain?.c||0),item.booklet_id).run();return json({ok:true,correct,unresolvedCount:Number(remain?.c||0)});}

export default {async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{const url=new URL(request.url),p=url.pathname;const ours=p.startsWith('/api/student-books/');if(!ours)return app.fetch(request,env,ctx);const auth=await studentUser(env,request);if(auth instanceof Response)return auth;if(p==='/api/student-books/personal'&&request.method==='GET')return personalBooks(env,auth);if(p==='/api/student-books/personal'&&request.method==='POST')return generatePersonalBook(request,env,auth);const pp=p.match(/^\/api\/student-books\/personal\/([^/]+)\/pdf$/);if(pp&&request.method==='GET')return personalBookPdf(env,auth,pp[1],url.origin);const sol=p.match(/^\/api\/student-books\/solutions\/([a-z2-9]{6,20})(\/reveal)?$/);if(sol&&((request.method==='GET'&&!sol[2])||(request.method==='POST'&&sol[2]))){const r=await dejavuSolution(env,sol[1],Boolean(sol[2]),auth.student_id!);return r?json(r):fail(404,'SOLUTION_NOT_FOUND','Bu çözüm sayfası bulunamadı.');}const pa=p.match(/^\/api\/student-books\/personal\/([^/]+)\/answers$/);if(pa&&request.method==='POST')return personalBookAnswers(request,env,auth,pa[1]);const pd=p.match(/^\/api\/student-books\/personal\/([^/]+)$/);if(pd&&request.method==='GET')return personalBookDetail(env,auth,pd[1]);if(p==='/api/student-books/zero-error'&&request.method==='GET')return zeroErrorBooks(env,auth);if(p==='/api/student-books/zero-error'&&request.method==='POST')return generateZeroError(request,env,auth);const zd=p.match(/^\/api\/student-books\/zero-error\/([^/]+)$/);if(zd&&request.method==='GET')return zeroErrorDetail(env,auth,zd[1]);const za=p.match(/^\/api\/student-books\/zero-error\/items\/([^/]+)\/attempt$/);if(za&&request.method==='POST')return zeroErrorAttempt(request,env,auth,za[1]);return fail(404,'NOT_FOUND','Öğrenci kitap API yolu bulunamadı.');},async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){if('scheduled' in app&&typeof app.scheduled==='function')return app.scheduled(event,env,ctx);}} satisfies ExportedHandler<Env>;
