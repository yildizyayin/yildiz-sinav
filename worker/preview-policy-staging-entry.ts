import {handleExamChannels} from './exam-channels-entry';
import {createNibiruAccessCalendarEntry} from './nibiru-access-calendar-entry';
import {createPrivateRubricExportEntry} from './private-rubric-export-entry';
import app from './optical-print-policy-staging-entry';
import { createPreviewPolicyEntry } from './preview-policy-entry';

const base=createNibiruAccessCalendarEntry(createPrivateRubricExportEntry(createPreviewPolicyEntry(app)));
export default {...base,async fetch(request:Request,env:any,ctx:any){const result=await handleExamChannels(request,env);return result||base.fetch!(request as any,env,ctx)}};
