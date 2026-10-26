import {withErrorBoundary} from './lib/error-boundary';
import {activateDueExams,afterExamDefinitionChange} from './lib/exam-lifecycle';
import {outerFeatureGate} from './lib/platform-feature-policy';
import {handleOperationsSummary} from './lib/operations-summary';
import {handleQuestionImport} from './lib/question-import';
import {handleReleaseDrift} from './lib/release-drift';
import {handleHomework} from './lib/homework';
import {handleGuidanceRecords} from './lib/guidance-records';
import {handleWrittenReport} from './lib/written-report';
import {handleWrittenCamera} from './lib/written-camera';
import {handleWrittenGrading} from './lib/written-grading';
import {handleWrittenPapers} from './lib/written-papers';
import {handleQuestionRubrics} from './lib/question-rubrics';
import {handleOpenEndedRoute} from './lib/open-ended-generation';
import {handleWrittenScenarios} from './written-scenarios-entry';
import {scheduledJobsPaused} from './lib/scheduled-pause';
import {handleExamChannels} from './exam-channels-entry';
import {createNibiruAccessCalendarEntry} from './nibiru-access-calendar-entry';
import {createPrivateRubricExportEntry} from './private-rubric-export-entry';
import app from './optical-print-policy-production-entry';
import { createPreviewPolicyEntry } from './preview-policy-entry';

const base=createNibiruAccessCalendarEntry(createPrivateRubricExportEntry(createPreviewPolicyEntry(app)));
export default {...base,async fetch(request:Request,env:any,ctx:any){return withErrorBoundary(request,async()=>{const result=await handleExamChannels(request,env)||await handleWrittenScenarios(request,env)||await handleOpenEndedRoute(request,env)||await handleQuestionRubrics(request,env)||await outerFeatureGate(request,env)||await handleOperationsSummary(request,env)||await handleQuestionImport(request,env)||await handleReleaseDrift(request,env)||await handleHomework(request,env)||await handleGuidanceRecords(request,env)||await handleWrittenReport(request,env)||await handleWrittenCamera(request,env)||await handleWrittenGrading(request,env)||await handleWrittenPapers(request,env);const response=result||await base.fetch!(request as any,env,ctx);await afterExamDefinitionChange(request,env,response);return response})},
  // D1 budget: every scheduled job pauses before it reads anything while SCHEDULED_JOBS_PAUSED is "true".
  async scheduled(event:any,env:any,ctx:any){if(scheduledJobsPaused(env)){console.log(JSON.stringify({event:'scheduled_jobs_paused',cron:event?.cron||null}));return}ctx.waitUntil(activateDueExams(env).then(count=>{if(count)console.log(JSON.stringify({event:'exam_auto_activated',count}))}).catch(error=>console.error(JSON.stringify({event:'exam_auto_activate_cron_failed',error:String(error)}))));return (base as any).scheduled(event,env,ctx)}};
