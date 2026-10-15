import type {Env} from './types';
import {tickQuestionProduction} from './lib/question-production-campaign';
export default {
 async fetch(request:Request,env:Env){if(request.method==='POST'&&new URL(request.url).pathname==='/internal/tick')return Response.json(await tickQuestionProduction(env));return new Response('Not found',{status:404});},
 async scheduled(_event:ScheduledController,env:Env,ctx:ExecutionContext){ctx.waitUntil(tickQuestionProduction(env).then(result=>console.log(JSON.stringify({event:'question_production_tick',...result}))));},
} satisfies ExportedHandler<Env>;
