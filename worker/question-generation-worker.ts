import {diagnoseEditorProtocol} from './lib/question-editor-diagnostic';
import type {Env,AuthUser} from './types';
import {one} from './lib/db';
import {withQuestionAiBudget} from './lib/question-ai-budget';
import {runQuestionGenerationJob} from './lib/question-generation-runner';
import {automaticallyEditFailedJob,verifyAutomaticEdit} from './lib/question-ai-editor';
/** Private service binding only; public and preview URLs are disabled at deployment. */
export default {async fetch(request:Request,env:Env){
 const path=new URL(request.url).pathname;if(request.method==='GET'&&path==='/internal/version')return Response.json({contract:'EDITOR_TEAM_V2_PLACEVALUE_V1'});if(request.method!=='POST'||!['/internal/run','/internal/auto-edit','/internal/verify-edit','/internal/editor-diagnostic'].includes(path))return new Response('Not found',{status:404});
 const body:any=await request.json().catch(()=>null);if(!body||typeof body.jobId!=='string'||body.jobId.length>100||typeof body.actorId!=='string'||body.actorId.length>100)return new Response('Invalid request',{status:400});
 const actor=await one<AuthUser>(env.DB.prepare("SELECT * FROM users WHERE id=? AND role='SUPER_ADMIN' AND active=1").bind(body.actorId));if(!actor)return new Response('Forbidden',{status:403});
 const bounded=withQuestionAiBudget(env);if(path==='/internal/editor-diagnostic')return diagnoseEditorProtocol(bounded,actor);return path==='/internal/verify-edit'?verifyAutomaticEdit(bounded,actor,body.jobId):path==='/internal/auto-edit'?automaticallyEditFailedJob(bounded,actor,body.jobId):runQuestionGenerationJob(request,bounded,actor,body.jobId);
}} satisfies ExportedHandler<Env>;
