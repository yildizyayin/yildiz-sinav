import type {Env} from './types';
import {routeQuestionProductionSchedule} from './lib/question-production-schedule';
import {handleExamChannels} from './exam-channels-entry';
import {createNibiruAccessCalendarEntry} from './nibiru-access-calendar-entry';
import {createPrivateRubricExportEntry} from './private-rubric-export-entry';
import app from './optical-print-policy-production-entry';
import { createPreviewPolicyEntry } from './preview-policy-entry';

const base=createNibiruAccessCalendarEntry(createPrivateRubricExportEntry(createPreviewPolicyEntry(app)));
export default {...base,async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){return routeQuestionProductionSchedule(event,env,ctx,()=>base.scheduled!(event,env,ctx));},async fetch(request:Request,env:any,ctx:any){const result=await handleExamChannels(request,env);return result||base.fetch!(request as any,env,ctx)}};
