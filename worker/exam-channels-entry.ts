import type {Env} from './types';
import {getAuthUser} from './lib/auth';
import {all,json,forbidden,notFound} from './lib/db';
import {channelState,changeChannel,trashExam,restoreExam,type Channel} from './lib/exam-channels';
export async function handleExamChannels(request:Request,env:Env):Promise<Response|null>{
 const url=new URL(request.url),list=url.pathname==='/api/admin/exam-channels',m=url.pathname.match(/^\/api\/admin\/exams\/([^/]+)\/(channels(?:\/(LICENSED|RESULT_NETWORK)\/(publish|update|unpublish|remove))?|trash|restore)$/);if(!list&&!m)return null;
 const user=await getAuthUser(env,request);if(!user)return json({ok:false,error:{code:'UNAUTHENTICATED',message:'Oturum açın.'}},401);if(!['SUPER_ADMIN','INSTITUTION_MANAGER'].includes(user.role)||user.must_change_password)return forbidden();
 if(user.role!=='SUPER_ADMIN'){if(list||!m)return forbidden();const exam=await env.DB.prepare('SELECT owner_type,institution_id FROM exams WHERE id=?').bind(m[1]).first<any>();if(!exam||exam.owner_type!=='INSTITUTION'||exam.institution_id!==user.institution_id)return forbidden();if(m[2].startsWith('channels/'))return forbidden();}
 if(request.method!=='GET'&&request.headers.get('Origin')!==url.origin)return forbidden('İstek kaynağı doğrulanamadı.');
 if(list&&request.method==='GET'){const ids=await all<any>(env.DB.prepare('SELECT id FROM exams ORDER BY updated_at DESC,id LIMIT 250'));const exams=[];for(const r of ids)exams.push(await channelState(env,r.id));return json({ok:true,exams});}
 if(!m)return json({ok:false,error:{code:'METHOD_NOT_ALLOWED',message:'İşlem desteklenmiyor.'}},405);
 if(m[2]==='channels'&&request.method==='GET'){const state=await channelState(env,m[1]);return state?json(state):notFound();}
 if(request.method!=='POST')return json({ok:false,error:{code:'METHOD_NOT_ALLOWED',message:'İşlem desteklenmiyor.'}},405);
 const b:any=await request.json().catch(()=>({}));if(m[2]==='trash')return trashExam(env,user,m[1],b.scope||'APP');if(m[2]==='restore')return restoreExam(env,user,m[1]);
 if((!Number.isSafeInteger(b.expectedRevision)||b.expectedRevision<1))return json({ok:false,error:{code:'REVISION_REQUIRED',message:'Önizlemeyi yenileyin.'}},400);
 return changeChannel(env,user,m[1],m[3] as Channel,m[4],b.expectedRevision);
}
