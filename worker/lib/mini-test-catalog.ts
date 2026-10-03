import type {AuthUser,Env} from '../types';
import {all,one,json,forbidden} from './db';
import {startCoachMiniTest} from './coach-mastery-cycle';

async function scope(env:Env,user:AuthUser){
 if(user.role!=='STUDENT'||!user.student_id||!user.institution_id)return null;
 return one<any>(env.DB.prepare(`SELECT e.id,e.institution_id,e.season_id,e.grade_level,s.academic_year FROM student_enrollments e JOIN institution_seasons s ON s.id=e.season_id AND s.institution_id=e.institution_id WHERE e.student_id=? AND e.institution_id=? AND e.status='ACTIVE' ORDER BY e.created_at DESC,e.id DESC LIMIT 1`).bind(user.student_id,user.institution_id));
}
export async function listOutcomeMiniTests(env:Env,user:AuthUser,url:URL){
 const enrollment=await scope(env,user);if(!enrollment)return forbidden();
 let cursor='';try{const raw=url.searchParams.get('cursor');if(raw){if(raw.length>512)throw Error();cursor=decodeURIComponent(raw);if(!cursor||cursor.length>100)throw Error();}}catch{return json({ok:false,error:{code:'INVALID_CURSOR',message:'Liste devam bilgisi geçersiz.'}},400);}
 const rows=await all<any>(env.DB.prepare(`SELECT o.id,o.code,o.title,s.name subjectName,cv.program_version programVersion FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id JOIN subjects s ON s.id=o.subject_id WHERE o.active=1 AND cv.verified=1 AND cv.academic_year=? AND cv.grade_level=? AND o.grade_level=? AND o.id>? ORDER BY o.id LIMIT 51`).bind(enrollment.academic_year,enrollment.grade_level,enrollment.grade_level,cursor));
 const outcomes=rows.slice(0,50);
 return json({ok:true,academicYear:enrollment.academic_year,items:outcomes,nextCursor:rows.length>50?encodeURIComponent(outcomes[outcomes.length-1].id):null,message:'Doğrulanmış programdaki öğrenme çıktılarıdır. Test başlatırken yeni/onaylı soru yeterliliği ayrıca kontrol edilir.'});
}
export async function startOutcomeMiniTest(env:Env,user:AuthUser,outcomeId:string,mode:unknown='NEW'){
 const enrollment=await scope(env,user);if(!enrollment)return{ok:false,reason:'ITEM_NOT_FOUND'};
 if(!['NEW','REPEAT'].includes(String(mode)))return{ok:false,reason:'INVALID_QUESTION_MODE'};
 const outcome=await one<any>(env.DB.prepare(`SELECT o.id,o.title FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE o.id=? AND o.active=1 AND cv.verified=1 AND cv.academic_year=? AND cv.grade_level=? AND o.grade_level=?`).bind(outcomeId,enrollment.academic_year,enrollment.grade_level,enrollment.grade_level));
 if(!outcome)return{ok:false,reason:'ITEM_NOT_FOUND'};
 const bytes=new TextEncoder().encode(JSON.stringify([user.student_id,enrollment.season_id,outcome.id]));
 const key=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const assignmentId=`coach_catalog_${key}`,itemId=`coach_outcome_${key}`;
 await env.DB.batch([
  env.DB.prepare(`INSERT OR IGNORE INTO assignments(id,institution_id,season_id,created_by,assignment_type,title,description,status) VALUES(?,?,?,?,'NIBIRU',?,?,'ASSIGNED')`).bind(assignmentId,enrollment.institution_id,enrollment.season_id,user.id,outcome.title,'Öğrenme çıktısı odaklı mini test ve isteğe bağlı tekrar çalışması.'),
  env.DB.prepare(`INSERT OR IGNORE INTO assignment_recipients(assignment_id,student_id,status,progress) VALUES(?,?,'ASSIGNED',0)`).bind(assignmentId,user.student_id),
  env.DB.prepare(`INSERT OR IGNORE INTO assignment_items(id,assignment_id,item_type,reference_id,payload_json,sort_order) VALUES(?,?,'TASK',?,?,1)`).bind(itemId,assignmentId,outcome.id,JSON.stringify({kind:'OUTCOME_PRACTICE',source:'VERIFIED_OUTCOME_CATALOG',questionTarget:5}))
 ]);
 return startCoachMiniTest(env,user,itemId,mode);
}
