import app from './standard-entry';
import type { Env } from './types';
import { getAuthUser } from './lib/auth';
import { all,json } from './lib/db';

function fail(status:number,code:string,message:string){return json({ok:false,error:{code,message}},status)}

async function examReview(request:Request,env:Env){
  const user=await getAuthUser(env,request);
  if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');
  if(user.role!=='STUDENT'||!user.student_id)return fail(403,'STUDENT_ONLY','Bu ekran yalnız öğrenci hesabına açıktır.');
  const url=new URL(request.url);const examId=url.searchParams.get('examId');
  if(!examId)return fail(400,'EXAM_REQUIRED','Sınav seçilmelidir.');
  const rows=await all<any>(env.DB.prepare(`SELECT e.id exam_id,e.title exam_title,e.exam_date,q.id question_id,q.question_no,q.global_no,
    s.id subject_id,s.name subject_name,sa.answer,sa.status,ak.correct_answer,
    o.id outcome_id,o.title outcome_title,o.topic,o.subtopic,
    EXISTS(SELECT 1 FROM video_links vl WHERE vl.exam_question_id=q.id AND vl.link_type='SOLUTION' AND vl.approved=1 AND vl.active=1 AND vl.safety_review_status='APPROVED') has_solution_video,
    EXISTS(SELECT 1 FROM video_links vl WHERE (vl.exam_question_id=q.id OR vl.outcome_id=o.id) AND vl.link_type='TOPIC' AND vl.approved=1 AND vl.active=1 AND vl.safety_review_status='APPROVED') has_topic_video
    FROM exam_participants ep
    JOIN exams e ON e.id=ep.exam_id
    JOIN exam_delivery_profiles dp ON dp.exam_id=e.id AND dp.result_freeze_status='PUBLISHED' AND dp.snapshot_version>0
    JOIN student_answers sa ON sa.participant_id=ep.id
    JOIN exam_questions q ON q.id=sa.exam_question_id
    JOIN subjects s ON s.id=q.subject_id
    LEFT JOIN answer_keys ak ON ak.exam_question_id=q.id AND ak.booklet_code=coalesce(ep.booklet_code,'A')
    LEFT JOIN question_outcomes qo ON qo.exam_question_id=q.id
    LEFT JOIN outcomes o ON o.id=qo.outcome_id
    WHERE ep.student_id=? AND e.id=?
    ORDER BY coalesce(q.global_no,9999),s.name,q.question_no`).bind(user.student_id,examId));
  if(!rows.length)return fail(404,'REVIEW_NOT_FOUND','Bu sınav için incelenebilir öğrenci cevabı bulunamadı.');
  return json({ok:true,exam:{id:examId,title:rows[0].exam_title,examDate:rows[0].exam_date},answers:rows});
}

export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const url=new URL(request.url);
    if(url.pathname==='/api/student-standard/exam-review'&&request.method==='GET')return examReview(request,env);
    return app.fetch(request,env,ctx);
  },
  async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){
    if('scheduled' in app&&typeof app.scheduled==='function')return app.scheduled(event,env,ctx);
  },
} satisfies ExportedHandler<Env>;
