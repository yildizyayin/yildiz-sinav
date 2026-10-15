import type {Env} from './types';
import {tickQuestionProduction} from './lib/question-production-campaign';
export default {
 async fetch(){return Response.json({ok:true,service:'bounded-question-production',controls:'SUPER_ADMIN application panel'});},
 async scheduled(_event:ScheduledController,env:Env,ctx:ExecutionContext){ctx.waitUntil(tickQuestionProduction(env).then(result=>console.log(JSON.stringify({event:'question_production_tick',...result}))));},
} satisfies ExportedHandler<Env>;
