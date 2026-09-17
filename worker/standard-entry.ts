import app from './platform-entry';
import type { AuthUser, Env } from './types';
import { getAuthUser } from './lib/auth';
import { all, json, one, uuid } from './lib/db';

function fail(status:number,code:string,message:string){return json({ok:false,error:{code,message}},status)}

async function requireStudent(env:Env,request:Request):Promise<AuthUser|Response>{
  const user=await getAuthUser(env,request);
  if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');
  if(user.role!=='STUDENT'||!user.student_id)return fail(403,'STUDENT_ONLY','Bu özellik öğrenci hesabına açıktır.');
  return user;
}

async function latestEnrollment(env:Env,studentId:string){
  return one<any>(env.DB.prepare(`SELECT e.*,c.name class_name FROM student_enrollments e LEFT JOIN classes c ON c.id=e.class_id WHERE e.student_id=? ORDER BY CASE e.status WHEN 'ACTIVE' THEN 0 WHEN 'GRADUATED' THEN 1 ELSE 2 END,e.created_at DESC LIMIT 1`).bind(studentId));
}

function motivationLabel(programName:string){
  const value=String(programName||'').toLocaleLowerCase('tr-TR');
  if(value.includes('tıp'))return 'Geleceğin doktoru';
  if(value.includes('diş'))return 'Geleceğin diş hekimi';
  if(value.includes('hukuk'))return 'Geleceğin hukukçusu';
  if(value.includes('mimarl'))return 'Geleceğin mimarı';
  if(value.includes('öğretmen'))return 'Geleceğin öğretmeni';
  if(value.includes('psikoloji'))return 'Geleceğin psikoloğu';
  if(value.includes('mühendis'))return 'Geleceğin mühendisi';
  return 'Geleceğine hazırlanıyorsun';
}

async function listTargets(env:Env,user:AuthUser){
  const enrollment=await latestEnrollment(env,user.student_id!);
  const rows=await all<any>(env.DB.prepare(`SELECT sat.id,sat.target_type,sat.priority,sat.note,sat.motivation_label,sat.motivation_enabled,sat.created_at,
    ss.name school_name,ss.city school_city,ss.district school_district,ss.percentile school_percentile,ss.base_score school_base_score,
    up.university_name,up.faculty_name,up.program_name,up.score_type,up.success_rank,up.base_score university_base_score
    FROM student_academic_targets sat
    LEFT JOIN secondary_school_targets ss ON ss.id=sat.secondary_school_target_id
    LEFT JOIN university_program_targets up ON up.id=sat.university_program_target_id
    WHERE sat.student_id=? AND sat.status='ACTIVE'
    ORDER BY sat.target_type,sat.priority,sat.created_at DESC`).bind(user.student_id));
  const [professions,catalog]=await Promise.all([
    all<any>(env.DB.prepare(`SELECT spt.id,spt.priority,pc.code,pc.title,pc.motivation_title,pc.category FROM student_profession_targets spt JOIN profession_catalog pc ON pc.code=spt.profession_code WHERE spt.student_id=? AND spt.status='ACTIVE' ORDER BY spt.priority`).bind(user.student_id)),
    all<any>(env.DB.prepare(`SELECT code,title,motivation_title,category FROM profession_catalog WHERE active=1 AND min_grade<=? ORDER BY sort_order,title`).bind(Number(enrollment?.grade_level||5))),
  ]);
  return json({ok:true,studentId:user.student_id,gradeLevel:enrollment?.grade_level??null,enrollmentStatus:enrollment?.status??null,maxTargets:Number(enrollment?.grade_level)===12||enrollment?.status==='GRADUATED'?3:1,targets:rows,professions,professionCatalog:catalog,maxProfessions:3});
}

async function setProfession(request:Request,env:Env,user:AuthUser){
  const body:any=await request.json<{professionCode?:string;priority?:number}>().catch(()=>({}));const enrollment=await latestEnrollment(env,user.student_id!);if(!enrollment)return fail(400,'ENROLLMENT_REQUIRED','Öğrenci için sınıf kaydı bulunamadı.');
  const code=String(body.professionCode||'').trim().toUpperCase(),priority=Math.max(1,Math.min(3,Number(body.priority||1)));const profession=await one<any>(env.DB.prepare(`SELECT code FROM profession_catalog WHERE code=? AND active=1 AND min_grade<=?`).bind(code,Number(enrollment.grade_level||5)));if(!profession)return fail(404,'PROFESSION_NOT_FOUND','Meslek kataloğunda aktif kayıt bulunamadı.');
  await env.DB.prepare(`UPDATE student_profession_targets SET status='ARCHIVED',updated_at=CURRENT_TIMESTAMP WHERE student_id=? AND status='ACTIVE' AND (priority=? OR profession_code=?)`).bind(user.student_id,priority,code).run();
  await env.DB.prepare(`INSERT INTO student_profession_targets(id,student_id,profession_code,priority,created_by) VALUES(?,?,?,?,?)`).bind(uuid('pro'),user.student_id,code,priority,user.id).run();return listTargets(env,user);
}

async function archiveProfession(env:Env,user:AuthUser,id:string){const result=await env.DB.prepare(`UPDATE student_profession_targets SET status='ARCHIVED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND student_id=? AND status='ACTIVE'`).bind(id,user.student_id).run();if(!result.meta.changes)return fail(404,'PROFESSION_NOT_FOUND','Aktif meslek hedefi bulunamadı.');return listTargets(env,user)}

async function setTarget(request:Request,env:Env,user:AuthUser){
  const body=await request.json<{targetType?:'LGS_SCHOOL'|'YKS_PROGRAM';targetId?:string;priority?:number;note?:string;motivationLabel?:string;motivationEnabled?:boolean}>();
  const enrollment=await latestEnrollment(env,user.student_id!);
  if(!enrollment)return fail(400,'ENROLLMENT_REQUIRED','Öğrenci için sınıf kaydı bulunamadı.');
  const grade=Number(enrollment.grade_level||0),isGraduate=enrollment.status==='GRADUATED';
  const targetType=body.targetType;
  if(!targetType||!body.targetId)return fail(400,'TARGET_REQUIRED','Hedef türü ve hedef seçilmelidir.');
  if(targetType==='LGS_SCHOOL'&&grade!==8)return fail(400,'LGS_GRADE_ONLY','LGS hedefi yalnız 8. sınıf öğrencileri için kullanılabilir.');
  if(targetType==='YKS_PROGRAM'&&!(grade===12||isGraduate))return fail(400,'YKS_GRADE_ONLY','YKS hedefi yalnız 12. sınıf veya mezun öğrenciler için kullanılabilir.');
  const priority=targetType==='YKS_PROGRAM'?Math.max(1,Math.min(3,Number(body.priority||1))):1;
  let label=String(body.motivationLabel||'').trim();
  if(targetType==='LGS_SCHOOL'){
    const target=await one<any>(env.DB.prepare(`SELECT id,name FROM secondary_school_targets WHERE id=? AND active=1`).bind(body.targetId));
    if(!target)return fail(404,'TARGET_NOT_FOUND','Seçilen lise hedefi bulunamadı.');
    if(!label)label=`${target.name} yolunda`;
  }else{
    const target=await one<any>(env.DB.prepare(`SELECT id,program_name FROM university_program_targets WHERE id=? AND active=1`).bind(body.targetId));
    if(!target)return fail(404,'TARGET_NOT_FOUND','Seçilen üniversite programı bulunamadı.');
    if(!label)label=motivationLabel(target.program_name);
  }
  await env.DB.prepare(`UPDATE student_academic_targets SET status='ARCHIVED',updated_at=CURRENT_TIMESTAMP WHERE student_id=? AND status='ACTIVE' AND (target_type=? AND priority=? OR (?='YKS_PROGRAM' AND university_program_target_id=?))`).bind(user.student_id,targetType,priority,targetType,body.targetId).run();
  const id=uuid('tgt');
  await env.DB.prepare(`INSERT INTO student_academic_targets(id,student_id,institution_id,target_type,secondary_school_target_id,university_program_target_id,status,set_by_user_id,note,priority,motivation_label,motivation_enabled) VALUES(?,?,?,?,?,?,'ACTIVE',?,?,?,?,?)`)
    .bind(id,user.student_id,enrollment.institution_id,targetType,targetType==='LGS_SCHOOL'?body.targetId:null,targetType==='YKS_PROGRAM'?body.targetId:null,user.id,body.note?.trim()||null,priority,label,body.motivationEnabled===false?0:1).run();
  return listTargets(env,user);
}

async function archiveTarget(env:Env,user:AuthUser,id:string){
  const result=await env.DB.prepare(`UPDATE student_academic_targets SET status='ARCHIVED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND student_id=? AND status='ACTIVE'`).bind(id,user.student_id).run();
  if(!result.meta.changes)return fail(404,'TARGET_NOT_FOUND','Aktif hedef bulunamadı.');
  return listTargets(env,user);
}

async function getPreferences(env:Env,user:AuthUser){
  const enrollment=await latestEnrollment(env,user.student_id!);
  const row=await one<any>(env.DB.prepare(`SELECT * FROM student_experience_preferences WHERE student_id=?`).bind(user.student_id));
  const grade=Number(enrollment?.grade_level||0);
  const defaults={theme_key:'ANUNEX_STANDARD',appearance:'AUTO',font_key:'SYSTEM',font_scale:1,animation_level:'NORMAL',countdown_enabled:1,countdown_flip_clock:1,motivation_enabled:1,voice_motivation_enabled:0,motivation_frequency:'MILESTONES'};
  return {enrollment,preferences:{...defaults,...(row||{})}};
}

async function updatePreferences(request:Request,env:Env,user:AuthUser){
  const body:any=await request.json().catch(()=>({}));
  const current=await getPreferences(env,user);const p={...current.preferences,...body};
  const fontScale=Math.max(.85,Math.min(1.3,Number(p.font_scale||1)));
  const appearance=['AUTO','LIGHT','DARK'].includes(String(p.appearance))?String(p.appearance):'AUTO';
  const animation=['OFF','REDUCED','NORMAL'].includes(String(p.animation_level))?String(p.animation_level):'NORMAL';
  const frequency=['OFF','MILESTONES','BALANCED'].includes(String(p.motivation_frequency))?String(p.motivation_frequency):'MILESTONES';
  await env.DB.prepare(`INSERT INTO student_experience_preferences(student_id,theme_key,appearance,font_key,font_scale,animation_level,countdown_enabled,countdown_label,countdown_target_date,countdown_flip_clock,motivation_identity,motivation_enabled,voice_motivation_enabled,motivation_frequency,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(student_id) DO UPDATE SET theme_key=excluded.theme_key,appearance=excluded.appearance,font_key=excluded.font_key,font_scale=excluded.font_scale,animation_level=excluded.animation_level,countdown_enabled=excluded.countdown_enabled,countdown_label=excluded.countdown_label,countdown_target_date=excluded.countdown_target_date,countdown_flip_clock=excluded.countdown_flip_clock,motivation_identity=excluded.motivation_identity,motivation_enabled=excluded.motivation_enabled,voice_motivation_enabled=excluded.voice_motivation_enabled,motivation_frequency=excluded.motivation_frequency,updated_at=CURRENT_TIMESTAMP`)
    .bind(user.student_id,String(p.theme_key||'AUTO'),appearance,String(p.font_key||'SYSTEM'),fontScale,animation,p.countdown_enabled===0?0:1,p.countdown_label||null,p.countdown_target_date||null,p.countdown_flip_clock===0?0:1,p.motivation_identity||null,p.motivation_enabled===0?0:1,p.voice_motivation_enabled===1?1:0,frequency).run();
  return json({ok:true,...await getPreferences(env,user)});
}

function daysUntil(dateValue:string|null|undefined){
  if(!dateValue)return null;const target=new Date(`${dateValue}T00:00:00`);if(Number.isNaN(target.getTime()))return null;
  const now=new Date();const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());return Math.max(0,Math.ceil((target.getTime()-today.getTime())/86400000));
}

async function homeContext(env:Env,user:AuthUser){
  const {enrollment,preferences}=await getPreferences(env,user);
  let targetDate=preferences.countdown_target_date as string|null;
  let label=preferences.countdown_label as string|null;
  if(!targetDate&&enrollment){
    const next=await one<any>(env.DB.prepare(`SELECT title,exam_date FROM exams WHERE exam_date>date('now') AND (grade_level=? OR grade_level IS NULL) AND status IN ('DRAFT','ACTIVE') ORDER BY exam_date LIMIT 1`).bind(enrollment.grade_level));
    targetDate=next?.exam_date||null;label=label||next?.title||null;
  }
  const targets=await all<any>(env.DB.prepare(`SELECT priority,target_type,motivation_label,motivation_enabled,up.university_name,up.program_name,ss.name school_name FROM student_academic_targets sat LEFT JOIN university_program_targets up ON up.id=sat.university_program_target_id LEFT JOIN secondary_school_targets ss ON ss.id=sat.secondary_school_target_id WHERE sat.student_id=? AND sat.status='ACTIVE' ORDER BY priority`).bind(user.student_id));
  return json({ok:true,student:{id:user.student_id,gradeLevel:enrollment?.grade_level??null,className:enrollment?.class_name??null,enrollmentStatus:enrollment?.status??null},countdown:{enabled:Boolean(preferences.countdown_enabled),label,targetDate,days:daysUntil(targetDate),flipClock:Boolean(preferences.countdown_flip_clock)},preferences,targets});
}

async function games(env:Env,user:AuthUser){
  const enrollment=await latestEnrollment(env,user.student_id!);const grade=Number(enrollment?.grade_level||0);
  if(!grade)return json({ok:true,gradeLevel:null,games:[]});
  const rows=await all<any>(env.DB.prepare(`SELECT game_code,title,description,min_grade,max_grade,subject_code,game_type,icon_key,xp_enabled FROM educational_game_catalog WHERE active=1 AND ? BETWEEN min_grade AND max_grade ORDER BY sort_order,title`).bind(grade));
  return json({ok:true,gradeLevel:grade,games:rows});
}

function parseIsoDuration(value:string){
  const m=String(value||'').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);if(!m)return null;
  return Number(m[1]||0)*3600+Number(m[2]||0)*60+Number(m[3]||0);
}
function tokens(value:string){return String(value||'').toLocaleLowerCase('tr-TR').split(/[^a-z0-9çğıöşü]+/i).filter(x=>x.length>2)}
function relevance(query:string,title:string){const q=new Set(tokens(query)),t=new Set(tokens(title));if(!q.size)return 0;let hit=0;for(const x of q)if(t.has(x))hit++;return hit/q.size}

async function aiPick(env:Env,query:string,candidates:any[]){
  if(!env.AI||candidates.length<2)return candidates[0]||null;
  try{
    const model=env.NIBIRU_AI_MODEL||'@cf/zai-org/glm-4.7-flash';
    const prompt=`Bir öğrenci için yalnız şu mikro konuyu anlatan en uygun kısa YouTube videosunu seç: ${query}. Adaylar: ${candidates.map(x=>`${x.id} | ${x.title} | ${x.duration_seconds}s | ${x.view_count} izlenme`).join('\n')}. 5-12. sınıf öğrencisine uygun, konuya doğrudan odaklanan ve yaklaşık 1-2 dakikalık olanı seç. Yalnız video id döndür.`;
    const response:any=await env.AI.run(model as any,{messages:[{role:'system',content:'Sen eğitim içerik seçicisisin. Yalnız verilen adaylardan bir video kimliği seç.'},{role:'user',content:prompt}],max_tokens:40,temperature:0});
    const text=typeof response==='string'?response:response?.response||response?.result?.response||response?.choices?.[0]?.message?.content;
    return candidates.find(x=>String(text||'').includes(x.id))||candidates[0]||null;
  }catch{return candidates[0]||null}
}

async function youtubeMicroVideo(env:Env,question:any){
  if(!env.YOUTUBE_API_KEY)return {video:null,reason:'YOUTUBE_NOT_CONFIGURED',candidateCount:0};
  if(!question.outcome_title&&!question.topic&&!question.subtopic)return {video:null,reason:'OUTCOME_MAPPING_REQUIRED',candidateCount:0};
  const query=[question.grade_level?`${question.grade_level}. sınıf`:null,question.subject_name,question.topic,question.subtopic,question.outcome_title,'kısa konu anlatımı'].filter(Boolean).join(' ');
  const cached=await all<any>(env.DB.prepare(`SELECT youtube_video_id id,title,channel_title,url,duration_seconds,view_count,relevance_score,popularity_score,ai_selected FROM youtube_micro_video_candidates WHERE exam_question_id=? AND (expires_at IS NULL OR expires_at>datetime('now')) ORDER BY ai_selected DESC,relevance_score DESC,popularity_score DESC LIMIT 5`).bind(question.question_id));
  if(cached.length){const selected=cached.find(x=>x.ai_selected)||cached[0];return {video:selected,reason:'CACHE',candidateCount:cached.length};}
  const searchUrl=new URL('https://www.googleapis.com/youtube/v3/search');searchUrl.searchParams.set('part','snippet');searchUrl.searchParams.set('type','video');searchUrl.searchParams.set('safeSearch','strict');searchUrl.searchParams.set('videoEmbeddable','true');searchUrl.searchParams.set('videoDuration','short');searchUrl.searchParams.set('maxResults','12');searchUrl.searchParams.set('q',query);searchUrl.searchParams.set('key',env.YOUTUBE_API_KEY);
  const searchRes=await fetch(searchUrl.toString());if(!searchRes.ok)return {video:null,reason:'YOUTUBE_SEARCH_FAILED',candidateCount:0};
  const search:any=await searchRes.json();const ids=(search.items||[]).map((x:any)=>x.id?.videoId).filter(Boolean);if(!ids.length)return {video:null,reason:'NO_CANDIDATE',candidateCount:0};
  const detailsUrl=new URL('https://www.googleapis.com/youtube/v3/videos');detailsUrl.searchParams.set('part','snippet,contentDetails,statistics,status');detailsUrl.searchParams.set('id',ids.join(','));detailsUrl.searchParams.set('key',env.YOUTUBE_API_KEY);
  const detailsRes=await fetch(detailsUrl.toString());if(!detailsRes.ok)return {video:null,reason:'YOUTUBE_DETAILS_FAILED',candidateCount:0};const details:any=await detailsRes.json();
  let items=(details.items||[]).map((x:any)=>{const duration=parseIsoDuration(x.contentDetails?.duration)||0;const views=Number(x.statistics?.viewCount||0);const rel=relevance(query,x.snippet?.title||'');return {id:x.id,title:x.snippet?.title||'Konu Anlatımı',channel_title:x.snippet?.channelTitle||'',url:`https://www.youtube.com/watch?v=${x.id}`,duration_seconds:duration,view_count:views,relevance_score:rel,popularity_score:Math.log10(Math.max(views,1))};}).filter((x:any)=>x.duration_seconds>=60&&x.duration_seconds<=150&&x.relevance_score>0);
  if(items.length<3)items=(details.items||[]).map((x:any)=>{const duration=parseIsoDuration(x.contentDetails?.duration)||0;const views=Number(x.statistics?.viewCount||0);const rel=relevance(query,x.snippet?.title||'');return {id:x.id,title:x.snippet?.title||'Konu Anlatımı',channel_title:x.snippet?.channelTitle||'',url:`https://www.youtube.com/watch?v=${x.id}`,duration_seconds:duration,view_count:views,relevance_score:rel,popularity_score:Math.log10(Math.max(views,1))};}).filter((x:any)=>x.duration_seconds>=45&&x.duration_seconds<=180&&x.relevance_score>0);
  items.sort((a:any,b:any)=>(b.relevance_score*10+b.popularity_score)-(a.relevance_score*10+a.popularity_score));items=items.slice(0,5);
  if(!items.length)return {video:null,reason:'NO_MICRO_VIDEO',candidateCount:0};
  const selected=await aiPick(env,query,items);
  const expires=new Date(Date.now()+7*86400000).toISOString();
  for(const item of items)await env.DB.prepare(`INSERT OR REPLACE INTO youtube_micro_video_candidates(id,exam_question_id,outcome_id,grade_level,subject_id,search_query,youtube_video_id,title,channel_title,url,duration_seconds,view_count,relevance_score,popularity_score,ai_selected,safe_search,fetched_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?)`).bind(uuid('ytm'),question.question_id,question.outcome_id||null,question.grade_level||null,question.subject_id,query,item.id,item.title,item.channel_title,item.url,item.duration_seconds,item.view_count,item.relevance_score,item.popularity_score,item.id===selected?.id?1:0,1,expires).run();
  return {video:selected,reason:'AI_SELECTED',candidateCount:items.length};
}

async function questionSupport(env:Env,user:AuthUser,url:URL){
  const questionId=url.searchParams.get('examQuestionId');if(!questionId)return fail(400,'QUESTION_REQUIRED','Soru seçilmelidir.');
  const row=await one<any>(env.DB.prepare(`SELECT q.id question_id,q.question_no,q.global_no,sa.status answer_status,s.id subject_id,s.name subject_name,o.id outcome_id,o.title outcome_title,o.topic,o.subtopic,
    (SELECT e2.grade_level FROM student_enrollments e2 WHERE e2.student_id=ep.student_id ORDER BY CASE e2.status WHEN 'ACTIVE' THEN 0 WHEN 'GRADUATED' THEN 1 ELSE 2 END,e2.created_at DESC LIMIT 1) grade_level,
    (SELECT vl.url FROM video_links vl WHERE vl.exam_question_id=q.id AND vl.link_type='SOLUTION' AND vl.approved=1 LIMIT 1) solution_url,
    (SELECT vl.title FROM video_links vl WHERE vl.exam_question_id=q.id AND vl.link_type='SOLUTION' AND vl.approved=1 LIMIT 1) solution_title,
    (SELECT vl.url FROM video_links vl WHERE (vl.exam_question_id=q.id OR vl.outcome_id=o.id) AND vl.link_type='TOPIC' AND vl.approved=1 LIMIT 1) topic_url,
    (SELECT vl.title FROM video_links vl WHERE (vl.exam_question_id=q.id OR vl.outcome_id=o.id) AND vl.link_type='TOPIC' AND vl.approved=1 LIMIT 1) topic_title
    FROM student_answers sa JOIN exam_participants ep ON ep.id=sa.participant_id JOIN exam_questions q ON q.id=sa.exam_question_id JOIN subjects s ON s.id=q.subject_id LEFT JOIN question_outcomes qo ON qo.exam_question_id=q.id LEFT JOIN outcomes o ON o.id=qo.outcome_id WHERE ep.student_id=? AND q.id=? LIMIT 1`).bind(user.student_id,questionId));
  if(!row)return fail(404,'QUESTION_NOT_FOUND','Bu soru öğrenci sonuçlarında bulunamadı.');
  let topicVideo=row.topic_url?{url:row.topic_url,title:row.topic_title||'Konu Anlatımı',source:'REGISTERED'}:null;let selection:any=null;
  if(!topicVideo){selection=await youtubeMicroVideo(env,row);if(selection.video)topicVideo={...selection.video,source:'YOUTUBE_AI'};}
  return json({ok:true,question:{id:row.question_id,questionNo:row.question_no,globalNo:row.global_no,status:row.answer_status,subject:row.subject_name,outcome:row.outcome_title,topic:row.topic,subtopic:row.subtopic},options:{solutionVideo:row.solution_url?{url:row.solution_url,title:row.solution_title||'Video Çözümü',source:'PUBLISHER'}:null,topicVideo},microLearning:selection?{reason:selection.reason,candidateCount:selection.candidateCount}:null});
}

export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const url=new URL(request.url);const path=url.pathname;
    const ours=path.startsWith('/api/student-standard/');
    if(!ours)return app.fetch(request,env,ctx);
    const auth=await requireStudent(env,request);if(auth instanceof Response)return auth;
    if(path==='/api/student-standard/targets'&&request.method==='GET')return listTargets(env,auth);
    if(path==='/api/student-standard/targets'&&request.method==='POST')return setTarget(request,env,auth);
    const targetDelete=path.match(/^\/api\/student-standard\/targets\/([^/]+)$/);if(targetDelete&&request.method==='DELETE')return archiveTarget(env,auth,targetDelete[1]);
    if(path==='/api/student-standard/professions'&&request.method==='POST')return setProfession(request,env,auth);
    const professionDelete=path.match(/^\/api\/student-standard\/professions\/([^/]+)$/);if(professionDelete&&request.method==='DELETE')return archiveProfession(env,auth,professionDelete[1]);
    if(path==='/api/student-standard/preferences'&&request.method==='GET')return json({ok:true,...await getPreferences(env,auth)});
    if(path==='/api/student-standard/preferences'&&request.method==='PATCH')return updatePreferences(request,env,auth);
    if(path==='/api/student-standard/home-context'&&request.method==='GET')return homeContext(env,auth);
    if(path==='/api/student-standard/games'&&request.method==='GET')return games(env,auth);
    if(path==='/api/student-standard/question-support'&&request.method==='GET')return questionSupport(env,auth,url);
    return fail(404,'NOT_FOUND','Standard öğrenci API yolu bulunamadı.');
  },
  async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){
    if('scheduled' in app&&typeof app.scheduled==='function')return app.scheduled(event,env,ctx);
  },
} satisfies ExportedHandler<Env>;
