import type {Env} from '../types';
export function runQuarterHourTasks(event:{cron:string;scheduledTime:number}){return event.cron!=='* * * * *'||new Date(event.scheduledTime).getUTCMinutes()%15===0;}
export async function routeQuestionProductionSchedule(event:ScheduledController,env:Env,ctx:ExecutionContext,quarterHour:()=>Promise<any>|any){
 const service=(env as Env&{QUESTION_PRODUCTION?:Fetcher}).QUESTION_PRODUCTION;
 if(service)ctx.waitUntil(service.fetch(new Request('https://question-production/internal/tick',{method:'POST'})).then(async r=>{if(!r.ok)throw Error('QUESTION_PRODUCTION_WORKER_FAILED');console.log('question-production-scheduler',JSON.stringify(await r.json()));}).catch(e=>console.error('question-production-scheduler',String(e))));
 if(runQuarterHourTasks(event))return quarterHour();
}
