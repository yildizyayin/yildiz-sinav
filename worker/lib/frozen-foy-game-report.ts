import {addFrozenOutcomeEvidence,finishFrozenOutcomes} from './frozen-outcome-summary';
import type {FrozenOutcomeMap} from './frozen-outcome-summary';
import type {AuthUser,Env} from '../types';
import {all,forbidden,json,one} from './db';
import {loadPermissionScope} from './permissions';

type Access={allowed:boolean;institutionId:string|null;seasonId:string|null;classId:string|null;subjectFilter:string[]|null;restricted:boolean};
const yearOk=(year:string)=>/^\d{4}-\d{4}$/.test(year)&&Number(year.slice(5))===Number(year.slice(0,4))+1;
const fail=(status:number,code:string,message:string)=>json({ok:false,error:{code,message}},status);

async function access(env:Env,user:AuthUser,studentId:string):Promise<Access>{
 const params:any[]=[studentId];let inst='';
 if(user.institution_id&&['INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role)){inst=' AND e.institution_id=?';params.push(user.institution_id);}
 const row=await one<any>(env.DB.prepare(`SELECT s.status,e.institution_id,e.season_id,e.class_id FROM student_entities s JOIN student_enrollments e ON e.student_id=s.id WHERE s.id=? ${inst} ORDER BY CASE WHEN e.status='ACTIVE' THEN 0 ELSE 1 END,e.created_at DESC,e.id DESC LIMIT 1`).bind(...params));
 if(!row||row.status!=='ACTIVE')return{allowed:false,institutionId:null,seasonId:null,classId:null,subjectFilter:null,restricted:false};
 if(user.role==='SUPER_ADMIN')return{allowed:true,institutionId:row.institution_id,seasonId:row.season_id,classId:row.class_id,subjectFilter:null,restricted:false};
 if(user.role==='INSTITUTION_MANAGER')return{allowed:user.institution_id===row.institution_id,institutionId:row.institution_id,seasonId:row.season_id,classId:row.class_id,subjectFilter:null,restricted:false};
 if(user.role==='STUDENT')return{allowed:user.student_id===studentId,institutionId:row.institution_id,seasonId:row.season_id,classId:row.class_id,subjectFilter:null,restricted:false};
 if(user.role==='PARENT'){
  const link=await one(env.DB.prepare(`SELECT id FROM parent_student_links WHERE parent_user_id=? AND student_id=? AND active=1`).bind(user.id,studentId));
  return{allowed:Boolean(link),institutionId:row.institution_id,seasonId:row.season_id,classId:row.class_id,subjectFilter:null,restricted:false};
 }
 if((user.role==='TEACHER'||user.role==='GUIDANCE_TEACHER')&&row.class_id){
  const scope=await loadPermissionScope(env.DB,user,row.season_id);
  if(scope.guidanceClassIds.includes(row.class_id))return{allowed:true,institutionId:row.institution_id,seasonId:row.season_id,classId:row.class_id,subjectFilter:null,restricted:false};
  const subjects=[...new Set(scope.subjectClassAssignments.filter(a=>a.classId===row.class_id).map(a=>a.subjectId))];
  return{allowed:subjects.length>0,institutionId:row.institution_id,seasonId:row.season_id,classId:row.class_id,subjectFilter:subjects,restricted:true};
 }
 return{allowed:false,institutionId:row.institution_id,seasonId:row.season_id,classId:row.class_id,subjectFilter:null,restricted:false};
}
function selected(url:URL,key:string,max:number){
 const ids=[...new Set((url.searchParams.get(key)||'').split(',').map(x=>x.trim()).filter(Boolean))];
 return ids.length&&ids.length<=max&&ids.every(x=>x.length<=100)?ids:null;
}
export function groupFoy(rows:any[]){
 const outcomeRows: FrozenOutcomeMap = new Map();
 const groups=new Map<string,any>();let valid=0,invalid=0;
 for(const row of rows){
  if(Number(row.context_valid)!==1||!row.subject_id||!row.curriculum_version_id||!row.program_version){invalid++;continue;}valid++;
  const key=[row.subject_id,row.curriculum_version_id,row.academic_year,row.grade_level,row.program_version].join('\u001f');
  let g=groups.get(key);if(!g){g={subjectId:row.subject_id,subjectName:null,curriculumVersionId:row.curriculum_version_id,academicYear:row.academic_year,gradeLevel:Number(row.grade_level),programVersion:row.program_version,correct:0,wrong:0,blank:0,evidenceCount:0,accuracy:null};groups.set(key,g);}
  let refs:any;try{refs=JSON.parse(row.outcome_refs_json||'[]')}catch{refs=[]}
  if(Array.isArray(refs))addFrozenOutcomeEvidence(outcomeRows,refs,row.result_status,g);
  g.evidenceCount++;if(row.result_status==='CORRECT')g.correct++;else if(row.result_status==='WRONG')g.wrong++;else g.blank++;
 }
 for(const g of groups.values()){const denom=g.correct+g.wrong+g.blank;g.accuracy=denom?Math.round((g.correct/denom)*10000)/100:null;}
 return{outcomes:finishFrozenOutcomes(outcomeRows),groups:[...groups.values()].sort((a,b)=>String(a.subjectId).localeCompare(String(b.subjectId))),validEvidenceCount:valid,invalidEvidenceCount:invalid};
}
export function groupGames(rows:any[]){
 const groups=new Map<string,any>();let valid=0,invalid=0;
 for(const row of rows){
  if(Number(row.context_valid)!==1||!row.subject_id||!row.curriculum_version_id||!row.program_version){invalid++;continue;}valid++;
  const key=[row.subject_id,row.curriculum_version_id,row.academic_year,row.grade_level,row.program_version].join('\u001f');
  let g=groups.get(key);if(!g){g={subjectId:row.subject_id,subjectName:null,curriculumVersionId:row.curriculum_version_id,academicYear:row.academic_year,gradeLevel:Number(row.grade_level),programVersion:row.program_version,sessionCount:0,averageScore:null,totalDurationSeconds:0,totalXp:0};groups.set(key,g);}
  g.sessionCount++;g._score=(g._score||0)+Number(row.score||0);g.totalDurationSeconds+=Number(row.duration_seconds||0);g.totalXp+=Number(row.xp_earned||0);
 }
 for(const g of groups.values()){g.averageScore=g.sessionCount?Math.round((g._score/g.sessionCount)*100)/100:null;g.totalScore=g._score;delete g._score;}
 return{groups:[...groups.values()].sort((a,b)=>String(a.subjectId).localeCompare(String(b.subjectId))),validSessionCount:valid,invalidSessionCount:invalid};
}
async function foyReport(env:Env,user:AuthUser,studentId:string,url:URL){
 const a=await access(env,user,studentId);if(!a.allowed)return forbidden();const year=url.searchParams.get('academicYear')||'',ids=selected(url,'runIds',50);if(!yearOk(year)||!ids)return fail(400,'REPORT_SELECTION_INVALID','Eğitim yılı ve en fazla 50 föy çözüm kaydı seçin.');
 const params:any[]=[studentId,a.institutionId,year,...ids];let subject='';if(a.subjectFilter){subject=` AND subject_id IN (${a.subjectFilter.map(()=>'?').join(',')})`;params.push(...a.subjectFilter);}if(['TEACHER','GUIDANCE_TEACHER'].includes(user.role)){subject+=' AND season_id=?';params.push(a.seasonId);}if(params.length>100)return fail(400,'REPORT_SCOPE_TOO_LARGE','Rapor kapsamı sınırı aşıyor. Seçimi daraltın.');
 const rows=await all<any>(env.DB.prepare(`SELECT run_id,response_id,academic_year,grade_level,subject_id,curriculum_version_id,program_version,outcome_refs_json,result_status,context_valid,observed_at FROM frozen_foy_response_evidence WHERE student_id=? AND institution_id=? AND academic_year=? AND run_id IN (${ids.map(()=>'?').join(',')})${subject} ORDER BY observed_at,response_id LIMIT 1001`).bind(...params));
 if(rows.length>1000)return fail(409,'REPORT_SOURCE_AMBIGUOUS','Seçili föy kanıtı güvenli sınırı aşıyor. Seçimi daraltın.');const report=groupFoy(rows),present=new Set(rows.map(r=>r.run_id));
 return json({ok:true,sourceTypes:['FOY'],policy:'FROZEN_FOY_RESPONSE_CONTEXT_V1',academicYear:year,selectedRunIds:ids,restrictedToSubjects:a.restricted,...report,coverage:{selectedRunCount:ids.length,availableRunCount:present.size,validEvidenceCount:report.validEvidenceCount,invalidEvidenceCount:report.invalidEvidenceCount},unavailableRunIds:a.restricted?[]:ids.filter(id=>!present.has(id)),officialScore:null,nationalRank:null,message:'Föy doğruluğu yalnız çözüm anında dondurulmuş, doğrulanmış program bağlamından hesaplanır. Eski veya bağlamsız kayıtlar akademik metriğe katılmaz.'});
}
async function gameReport(env:Env,user:AuthUser,studentId:string,url:URL){
 const a=await access(env,user,studentId);if(!a.allowed)return forbidden();const year=url.searchParams.get('academicYear')||'',ids=selected(url,'sessionIds',100);if(!yearOk(year)||!ids)return fail(400,'REPORT_SELECTION_INVALID','Eğitim yılı ve en fazla 100 oyun oturumu seçin.');
 const params:any[]=[studentId,a.institutionId,year,...ids];let subject='';if(a.subjectFilter){subject=` AND subject_id IN (${a.subjectFilter.map(()=>'?').join(',')})`;params.push(...a.subjectFilter);}if(['TEACHER','GUIDANCE_TEACHER'].includes(user.role)){subject+=' AND season_id=?';params.push(a.seasonId);}
 const extra=params.slice(3+ids.length),chunkSize=Math.min(50,100-3-extra.length);
 if(chunkSize<1)return fail(400,'REPORT_SCOPE_TOO_LARGE','Yetki kapsamı sorgu sınırını aşıyor.');
 const rows:any[]=[];
 for(let offset=0;offset<ids.length;offset+=chunkSize){const chunk=ids.slice(offset,offset+chunkSize);
  rows.push(...await all<any>(env.DB.prepare(`SELECT session_id,academic_year,grade_level,game_code,subject_id,curriculum_version_id,program_version,context_valid,score,xp_earned,duration_seconds,observed_at FROM frozen_game_session_evidence WHERE student_id=? AND institution_id=? AND academic_year=? AND session_id IN (${chunk.map(()=>'?').join(',')})${subject} ORDER BY observed_at,session_id LIMIT 101`).bind(studentId,a.institutionId,year,...chunk,...extra)));
 }

 if(rows.length>100)return fail(409,'REPORT_SOURCE_AMBIGUOUS','Oyun oturumu seçimi tekil değil.');const report=groupGames(rows),present=new Set(rows.map(r=>r.session_id));
 return json({ok:true,sourceTypes:['MINI_GAME'],policy:'FROZEN_MINI_GAME_CONTEXT_V1',academicYear:year,selectedSessionIds:ids,restrictedToSubjects:a.restricted,...report,coverage:{selectedSessionCount:ids.length,availableSessionCount:present.size,validSessionCount:report.validSessionCount,invalidSessionCount:report.invalidSessionCount},unavailableSessionIds:a.restricted?[]:ids.filter(id=>!present.has(id)),officialScore:null,nationalRank:null,message:'Mini oyun puanı sınav doğruluğuna dönüştürülmez. Yalnız doğrulanmış, çözüm anında dondurulmuş program bağlamındaki oturumlar ayrı öğrenme etkinliği metriği olarak gösterilir.'});
}
async function listFoy(env:Env,user:AuthUser,studentId:string,url:URL){
 const a=await access(env,user,studentId);if(!a.allowed)return forbidden();const year=url.searchParams.get('academicYear')||'';if(!yearOk(year))return fail(400,'REPORT_SELECTION_INVALID','Geçerli eğitim yılı seçin.');const params:any[]=[studentId,a.institutionId,year];let subject='';if(a.subjectFilter){subject=` AND subject_id IN (${a.subjectFilter.map(()=>'?').join(',')})`;params.push(...a.subjectFilter);}if(['TEACHER','GUIDANCE_TEACHER'].includes(user.role)){subject+=' AND season_id=?';params.push(a.seasonId);}if(params.length>100)return fail(400,'REPORT_SCOPE_TOO_LARGE','Rapor kapsamı sınırı aşıyor. Seçimi daraltın.');
 const rows=await all<any>(env.DB.prepare(`SELECT run_id id,MIN(observed_at) completedAt,SUM(CASE WHEN context_valid=1 THEN 1 ELSE 0 END) validEvidenceCount,COUNT(*) evidenceCount FROM frozen_foy_response_evidence WHERE student_id=? AND institution_id=? AND academic_year=?${subject} GROUP BY run_id ORDER BY completedAt DESC,run_id DESC LIMIT 100`).bind(...params));return json({ok:true,academicYear:year,runs:rows,restrictedToSubjects:a.restricted,legacyRowsExcluded:true});
}
async function listGames(env:Env,user:AuthUser,studentId:string,url:URL){
 const a=await access(env,user,studentId);if(!a.allowed)return forbidden();const year=url.searchParams.get('academicYear')||'';if(!yearOk(year))return fail(400,'REPORT_SELECTION_INVALID','Geçerli eğitim yılı seçin.');const params:any[]=[studentId,a.institutionId,year];let subject='';if(a.subjectFilter){subject=` AND subject_id IN (${a.subjectFilter.map(()=>'?').join(',')})`;params.push(...a.subjectFilter);}if(['TEACHER','GUIDANCE_TEACHER'].includes(user.role)){subject+=' AND season_id=?';params.push(a.seasonId);}if(params.length>100)return fail(400,'REPORT_SCOPE_TOO_LARGE','Rapor kapsamı sınırı aşıyor. Seçimi daraltın.');
 const rows=await all<any>(env.DB.prepare(`SELECT session_id id,game_code gameCode,observed_at completedAt,score,context_valid contextValid FROM frozen_game_session_evidence WHERE student_id=? AND institution_id=? AND academic_year=?${subject} ORDER BY observed_at DESC,session_id DESC LIMIT 100`).bind(...params));return json({ok:true,academicYear:year,sessions:rows,restrictedToSubjects:a.restricted,legacyRowsExcluded:true});
}

/** null means this path belongs to the downstream worker chain. */
export function handleFrozenFoyGameReport(request:Request,env:Env,user:AuthUser|null):Promise<Response>|null{
 const path=new URL(request.url).pathname;const m=path.match(/^\/api\/reporting\/students\/([^/]+)\/(foy-runs|frozen-foy|game-sessions|frozen-games)$/);if(!m)return null;if(!user)return Promise.resolve(fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.'));if(request.method!=='GET')return Promise.resolve(fail(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.'));
 const url=new URL(request.url),studentId=m[1];if(m[2]==='foy-runs')return listFoy(env,user,studentId,url);if(m[2]==='frozen-foy')return foyReport(env,user,studentId,url);if(m[2]==='game-sessions')return listGames(env,user,studentId,url);return gameReport(env,user,studentId,url);
}
