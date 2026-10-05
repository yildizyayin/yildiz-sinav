import app from './student-books-entry';
import {getQuestionPoolCoverage} from './lib/question-pool-coverage';
import {handleQuestionGenerationJobs} from './lib/question-generation-jobs';
import {handleQuestionGenerationRunner} from './lib/question-generation-runner';
import {sealQuestionMedia} from './lib/question-media-integrity';
import {handleFrozenFoyGameReport} from './lib/frozen-foy-game-report';
import {combineExpandedFrozenReports} from './lib/expanded-frozen-report';
import type { AuthUser,Env } from './types';
import { getAuthUser } from './lib/auth';
import { json,one,all } from './lib/db';
import { legacyDifficulty, normalizeDifficultyLevel } from './lib/question-bank';
import { reviewQuestionWithGate,normalizeQuestionOrigin,isAiQuestionOrigin,validMultipleChoiceQuestion } from './lib/question-review';

function fail(status:number,code:string,message:string){return json({ok:false,error:{code,message}},status)}

async function stats(env:Env){
 const rows=await all<any>(env.DB.prepare(`SELECT review_status,copyright_status,COUNT(*) count FROM question_bank WHERE review_status<>'ARCHIVED' GROUP BY review_status,copyright_status ORDER BY review_status,copyright_status`));
 const total=rows.reduce((sum:number,r:any)=>sum+Number(r.count||0),0);
 const approved=rows.filter((r:any)=>r.review_status==='APPROVED').reduce((sum:number,r:any)=>sum+Number(r.count||0),0);
 const printable=rows.filter((r:any)=>r.review_status==='APPROVED'&&['OWNED','LICENSED','PUBLIC_DOMAIN'].includes(r.copyright_status)).reduce((sum:number,r:any)=>sum+Number(r.count||0),0);
 return json({ok:true,total,approved,printable,breakdown:rows});
}

async function reviewQuestion(request:Request,env:Env,id:string){
 const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(user.role!=='SUPER_ADMIN')return fail(403,'SUPER_ADMIN_ONLY','Soru onayını yalnız Süper Admin yapabilir.');
 return reviewQuestionWithGate(request,env,user,id);
}

async function patchQuestion(request:Request,env:Env,id:string){
 const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');
 const q=await one<any>(env.DB.prepare(`SELECT * FROM question_bank WHERE id=?`).bind(id));if(!q)return fail(404,'QUESTION_NOT_FOUND','Soru bulunamadı.');
 const can=user.role==='SUPER_ADMIN'||(q.owner_type==='INSTITUTION'&&q.owner_id===user.institution_id&&['INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role));if(!can)return fail(403,'FORBIDDEN','Bu soruyu düzenleyemezsiniz.');
 const body:any=await request.json().catch(()=>({}));const origin=normalizeQuestionOrigin(body.originKind??q.origin_kind);if(!origin)return fail(400,'INVALID_QUESTION_ORIGIN','Geçersiz soru kaynağı.');if(isAiQuestionOrigin(q.origin_kind)&&!isAiQuestionOrigin(origin))return fail(400,'AI_ORIGIN_IMMUTABLE','AI taslağının kaynak türü değiştirilemez.');const copyright=body.copyrightStatus||q.copyright_status;const allowed=['OWNED','LICENSED','PUBLIC_DOMAIN','USER_PROVIDED','RESTRICTED'];if(!allowed.includes(copyright))return fail(400,'INVALID_COPYRIGHT','Geçersiz telif durumu.');
 const requestedDifficulty=body.difficultyLevel??body.difficulty;const currentDifficulty=normalizeDifficultyLevel(q.difficulty_level??q.difficulty,3);const difficultyLevel=normalizeDifficultyLevel(requestedDifficulty,currentDifficulty);if(!difficultyLevel)return fail(400,'INVALID_DIFFICULTY','Zorluk seviyesi 1 ile 6 arasında olmalıdır.');
 const result=await env.DB.prepare(`UPDATE question_bank SET topic=?,subtopic=?,difficulty=?,difficulty_level=?,source_label=?,copyright_status=?,origin_kind=?,review_status=?,reviewed_by=NULL,reviewed_at=NULL,rejection_note=NULL,review_checks_json=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND review_revision=?`).bind(body.topic??q.topic,body.subtopic??q.subtopic,legacyDifficulty(difficultyLevel),difficultyLevel,body.sourceLabel??q.source_label,copyright,origin,user.role==='SUPER_ADMIN'&&body.keepApproved&&!isAiQuestionOrigin(origin)&&['OWNED','LICENSED','PUBLIC_DOMAIN','USER_PROVIDED'].includes(copyright)&&(q.question_type!=='MULTIPLE_CHOICE'||validMultipleChoiceQuestion(q))? q.review_status:'REVIEW',id,q.review_revision).run();
 // D1 counts the revision trigger too; this primary-key conditional write
 // changes no rows when the fence fails, and at least one when it commits.
 if(Number(result.meta?.changes||0)<1)return fail(409,'QUESTION_REVIEW_CHANGED','Soru düzenleme sırasında değişti. Güncel içeriği yeniden açın.');
 return json({ok:true,id});
}

async function expandedFrozenReport(request:Request,env:Env,ctx:ExecutionContext,user:AuthUser,studentId:string){
 if(request.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');
 const original=new URL(request.url),hasBase=['examIds','runIds','miniTestIds'].some(key=>Boolean((original.searchParams.get(key)||'').trim()));
 const hasFoy=Boolean((original.searchParams.get('foyRunIds')||'').trim()),hasGames=Boolean((original.searchParams.get('gameSessionIds')||'').trim());
 if(!hasBase&&!hasFoy&&!hasGames)return fail(400,'REPORT_SELECTION_INVALID','En az bir sınav, soru pratiği, mini test, föy veya mini oyun kaydı seçin.');
 const sources:any[]=[];let gameActivity:any=null;
 if(hasBase){
  const baseUrl=new URL(original);baseUrl.pathname=`/api/reporting/students/${encodeURIComponent(studentId)}/frozen-combined`;
  const baseResponse=await app.fetch(new Request(baseUrl.toString(),{method:'GET',headers:request.headers}),env,ctx);
  if(!baseResponse.ok)return baseResponse;
  sources.push({sourceType:'COMBINED_BASE',report:await baseResponse.json()});
 }
 if(hasFoy){
  const foyUrl=new URL(original);foyUrl.pathname=`/api/reporting/students/${encodeURIComponent(studentId)}/frozen-foy`;foyUrl.searchParams.set('runIds',original.searchParams.get('foyRunIds')!);
  const response=await handleFrozenFoyGameReport(new Request(foyUrl.toString(),{method:'GET',headers:request.headers}),env,user);if(!response)return fail(500,'REPORT_ROUTE_MISSING','Föy rapor rotası bulunamadı.');if(!response.ok)return response;
  sources.push({sourceType:'FOY',report:await response.json()});
 }
 if(hasGames){
  const gameUrl=new URL(original);gameUrl.pathname=`/api/reporting/students/${encodeURIComponent(studentId)}/frozen-games`;gameUrl.searchParams.set('sessionIds',original.searchParams.get('gameSessionIds')!);
  const response=await handleFrozenFoyGameReport(new Request(gameUrl.toString(),{method:'GET',headers:request.headers}),env,user);if(!response)return fail(500,'REPORT_ROUTE_MISSING','Mini oyun rapor rotası bulunamadı.');if(!response.ok)return response;
  gameActivity=await response.json();
 }
 return json({ok:true,academicYear:original.searchParams.get('academicYear'),...combineExpandedFrozenReports(sources,gameActivity)});
}

export default {async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{const url=new URL(request.url),p=url.pathname;if(p.startsWith('/api/reporting/students/')){const user=await getAuthUser(env,request);const expanded=p.match(/^\/api\/reporting\/students\/([^/]+)\/frozen-expanded$/);if(expanded){if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');return expandedFrozenReport(request,env,ctx,user,decodeURIComponent(expanded[1]));}const frozen=handleFrozenFoyGameReport(request,env,user);if(frozen)return frozen;}if(p==='/api/question-bank-standard/coverage'||p.startsWith('/api/question-bank-standard/generation-jobs')){const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(p==='/api/question-bank-standard/coverage'&&request.method==='GET')return getQuestionPoolCoverage(request,env,user);const runner=handleQuestionGenerationRunner(request,env,user);if(runner)return runner;const response=await handleQuestionGenerationJobs(request,env,user);if(response)return response;return fail(404,'NOT_FOUND','İşlem bulunamadı.');}if(p==='/api/question-bank-standard/stats'&&request.method==='GET'){const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(!['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role))return fail(403,'FORBIDDEN','Yetkisiz erişim.');return stats(env)}const seal=p.match(/^\/api\/question-bank-standard\/([^/]+)\/media\/seal$/);if(seal&&request.method==='POST'){const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');return sealQuestionMedia(env,user,seal[1]);}const review=p.match(/^\/api\/(?:question-bank-standard|platform\/questions)\/([^/]+)\/review$/);if(review&&request.method==='PATCH')return reviewQuestion(request,env,review[1]);const patch=p.match(/^\/api\/question-bank-standard\/([^/]+)$/);if(patch&&request.method==='PATCH')return patchQuestion(request,env,patch[1]);return app.fetch(request,env,ctx);},async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){if('scheduled' in app&&typeof app.scheduled==='function')return app.scheduled(event,env,ctx);}} satisfies ExportedHandler<Env>;
