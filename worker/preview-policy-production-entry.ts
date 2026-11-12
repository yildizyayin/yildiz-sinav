import {withErrorBoundary} from './lib/error-boundary';
import {activateDueExams,afterExamDefinitionChange} from './lib/exam-lifecycle';
import {outerFeatureGate} from './lib/platform-feature-policy';
import {handleOperationsSummary} from './lib/operations-summary';
import {handleQuestionImport} from './lib/question-import';
import {handleReleaseDrift} from './lib/release-drift';
import {handleHomework} from './lib/homework';
import {handleQuickTests} from './lib/quick-tests';
import {handleSuperAdminMfa} from './lib/super-admin-mfa';
import {handleSmsAuth} from './lib/sms-auth';
import {handleInstitutionLiveLessons} from './lib/institution-live-lessons';
import {handleGuidanceRecords} from './lib/guidance-records';
import {handleGuidanceCenter} from './lib/guidance-center';
import {handleGuidanceProgram} from './lib/guidance-program';
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
export default {...base,async fetch(request:Request,env:any,ctx:any){return withErrorBoundary(request,async()=>{const result=await handleExamChannels(request,env)||await handleWrittenScenarios(request,env)||await handleOpenEndedRoute(request,env)||await handleQuestionRubrics(request,env)||await outerFeatureGate(request,env)||await handleOperationsSummary(request,env)||await handleQuestionImport(request,env)||await handleReleaseDrift(request,env)||await handleHomework(request,env)||await handleQuickTests(request,env)||await handleSuperAdminMfa(request,env)||await handleSmsAuth(request,env)||await handleInstitutionLiveLessons(request,env)||await handleGuidanceRecords(request,env)||await handleGuidanceCenter(request,env)||await handleGuidanceProgram(request,env)||await handleWrittenReport(request,env)||await handleWrittenCamera(request,env)||await handleWrittenGrading(request,env)||await handleWrittenPapers(request,env);const response=result||await base.fetch!(request as any,env,ctx);await afterExamDefinitionChange(request,env,response);return response})},
  // D1 budget: every scheduled job pauses before it reads anything while SCHEDULED_JOBS_PAUSED is "true".
  async scheduled(event:any,env:any,ctx:any){if(scheduledJobsPaused(env)){console.log(JSON.stringify({event:'scheduled_jobs_paused',cron:event?.cron||null}));return}ctx.waitUntil(import('./lib/quick-tests').then(m=>m.finalizeExpiredQuickTests(env)).catch(error=>console.error(JSON.stringify({event:'quick_test_finalize_failed',error:String(error)}))));ctx.waitUntil((async()=>{/* Tek "Sonuçları aç" (3 Nov): at the planned time freeze what was never frozen, then publish */const pe=await import('./lib/platform-expansion');await pe.freezeDueAppResults(env);const sc=await import('./lib/exam-schedule');const n=await sc.publishScheduledExamResults(env);if(n)console.log(JSON.stringify({event:'scheduled_exam_results',count:n}))})().catch(error=>console.error(JSON.stringify({event:'scheduled_release_failed',error:String(error)}))));ctx.waitUntil(import('./lib/exam-purge').then(m=>m.purgeTrashedExams(env)).then(n=>{if(n)console.log(JSON.stringify({event:'trashed_exams_purged',count:n}))}).catch(error=>console.error(JSON.stringify({event:'trashed_exam_purge_failed',error:String(error)}))));/* owner 3 Nov: no trash — exams left in the old trash are deleted on the next run; run here so it never depends on the inner scheduled chain */ctx.waitUntil(import('./lib/exam-release').then(m=>m.autoOpenDueExams(env)).then(n=>{if(n)console.log(JSON.stringify({event:'results_auto_opened_or_refreshed',count:n}))}).catch(error=>console.error(JSON.stringify({event:'auto_open_failed',error:String(error)}))));/* owner 4 Nov: normal exams open by themselves; open results that miss students are written again */ctx.waitUntil(import('./lib/batch-lifecycle').then(m=>m.purgeArchivedStudents(env)).then(r=>{if(r.deleted||r.anonymized)console.log(JSON.stringify({event:'archived_students_purged',...r}))}).catch(error=>console.error(JSON.stringify({event:'archived_student_purge_failed',error:String(error)}))));/* owner 4 Nov (KVKK): archived students that take part in nothing are deleted for good */ctx.waitUntil(activateDueExams(env).then(count=>{if(count)console.log(JSON.stringify({event:'exam_auto_activated',count}))}).catch(error=>console.error(JSON.stringify({event:'exam_auto_activate_cron_failed',error:String(error)}))));return (base as any).scheduled(event,env,ctx)}};
