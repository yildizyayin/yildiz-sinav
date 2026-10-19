import {editorialInferenceEstimate} from '../worker/lib/question-production-cost';
import {it,expect} from 'vitest';
import {editorialIssues,visualBlock} from '../worker/lib/question-editorial';
import {parseVerification} from '../worker/lib/question-generation-validation';
import {questionProductionTarget} from '../worker/lib/question-production-target';
import {originalitySearchQuery} from '../worker/lib/question-originality-search';
import {editorialQuestion,editorialScores} from './fixtures/editorial-question';
it('requires actual reasoning and one diagnosis for each wrong option',()=>{const q=editorialQuestion();expect(editorialIssues(q,'TABLE')).toEqual([]);q.editorial.distractors[0].label='A';expect(editorialIssues(q)).toContain('DISTRACTOR_DIAGNOSIS_REQUIRED');expect(editorialIssues({...q,editorial:null})).toEqual(['EDITORIAL_PACKET_REQUIRED']);});
it('rejects invented or inconsistent visual structures and never accepts generated HTML',()=>{const q=editorialQuestion();expect(visualBlock(q.editorial as any)?.payload.kind).toBe('TABLE');q.editorial.visual.rows[0].pop();expect(editorialIssues(q)).toContain('TABLE_DATA_INVALID');expect(editorialIssues(editorialQuestion(),'BAR_CHART')).toContain('PRESENTATION_MISMATCH');const p:any=editorialQuestion();p.editorial.visual.html='<script>alert(1)</script>';expect(editorialIssues(p)).toContain('VISUAL_DATA_INVALID');});
it('requires independent evidence and rejects valid:true with a low dimension score',()=>{const response={reviews:[{index:0,valid:true,issues:[],editorial:{...editorialScores}}]};expect(parseVerification(response,1,true)).not.toBeNull();response.reviews[0].editorial.distractorQuality=2;expect(parseVerification(response,1,true)).toBeNull();expect(parseVerification({reviews:[{index:0,valid:true,issues:[]}]},1,true)).toBeNull();});
it('keeps 500000/50-day targets separate from measured or human-approved throughput',()=>{const p=questionProductionTarget({approved:0,screened:10,rejected:0,elapsedDays:0});expect(p.dailyAcceptedRequired).toBe(10000);expect(p.scenarios[1].dailyRawRequired).toBe(12500);expect(p.throughputVerified).toBe(false);expect(p.automaticScreeningPassRate).toBeNull();expect(p.campaignStarted).toBe(false);expect(questionProductionTarget({approved:100000,screened:500,rejected:100,elapsedDays:10}).dailyAcceptedRequired).toBe(10000);});
it('constructs bounded literal search terms rather than accepting FTS operators',()=>{const q=originalitySearchQuery('" OR NEAR(abc) servis teklifleri 1500 kaç?');expect(q).not.toContain('1500');expect(q).not.toContain('(');expect(q.split(' OR ').length).toBeLessThanOrEqual(10);});

it('does not infer a free high-volume capacity or invoice from incomplete usage',()=>{expect(editorialInferenceEstimate([]).scenario.indicativeGrossInferenceUsd).toBeNull();const e=editorialInferenceEstimate([{action:'QUESTION_GENERATION_REVIEW_READY',details:{count:1,providerUsage:{neurons:200},verification:{usage:{neurons:300}}}}]);expect(e.optimisticFreeScreenedQuestionsPerDay).toBe(20);expect(e.scenario.indicativeGrossInferenceUsd).toBeCloseTo(3437.5);expect(e.billingVerified).toBe(false);expect(e.budgetApproved).toBe(false);});
it('constrains the provider schema itself for TABLE instead of relying only on prose',async()=>{const {editorialSchema}=await import('../worker/lib/question-editorial');const table=editorialSchema('TABLE').properties.visual.properties;expect(table.kind.enum).toEqual(['TABLE']);expect(table.values.maxItems).toBe(0);expect(table.categories.maxItems).toBe(0);const chart=editorialSchema('BAR_CHART').properties.visual.properties;expect(chart.columns.maxItems).toBe(0);expect(chart.rows.maxItems).toBe(0);});

it('resolves AUTO before enforcing the schema without inventing new official scope',async()=>{const {resolveEditorialPresentation}=await import('../worker/lib/question-editorial');expect(resolveEditorialPresentation('AUTO','MAT.5.1.2','GENERIC')).toBe('TABLE');expect(resolveEditorialPresentation('AUTO','MAT.5.1.1','READ_ZERO_PERIODS')).toBe('TEXT');expect(resolveEditorialPresentation('AUTO','UNVERIFIED_OTHER')).toBe('TEXT');expect(resolveEditorialPresentation('BAR_CHART','MAT.5.1.2')).toBe('BAR_CHART');});
it('permits protocol-only retries while preserving any substantive negative review',async()=>{const {verificationProtocolRetryAllowed:allow}=await import('../worker/lib/question-verification-protocol');expect(allow({unavailable:true,invalidOutputSample:JSON.stringify({reviews:[{index:0,valid:false,issues:['missing editorial scores']}]})})).toBe(true);expect(allow({unavailable:true,invalidOutputSample:JSON.stringify({reviews:[{valid:false,issues:['wrong answer']}]})})).toBe(false);expect(allow({unavailable:true,invalidOutputSample:JSON.stringify({reviews:[{valid:true,issues:[],editorial:{reasoningDemand:2}}]})})).toBe(false);expect(allow({unavailable:false,protocolRetryEligible:true})).toBe(false);});

it('enforces empty unused arrays for every visual presentation in schema and runtime validation',async()=>{
 const {editorialSchema}=await import('../worker/lib/question-editorial');
 for(const [presentation,kind,unused] of [['TABLE','TABLE',['categories','values']],['BAR_CHART','BAR_CHART',['columns','rows']],['TEXT','NONE',['columns','rows','categories','values']]] as const){
  const visual=editorialSchema(presentation).properties.visual.properties;expect(visual.kind.enum).toEqual([kind]);
  for(const field of unused)expect(visual[field].maxItems).toBe(0);
 }
 const q:any=editorialQuestion();q.editorial.visual.values=[1,2];expect(editorialIssues(q,'TABLE')).toContain('TABLE_DATA_INVALID');
 q.editorial.visual={kind:'BAR_CHART',title:'Deneme grafiği',unit:'adet',columns:['Sızan sütun'],rows:[],categories:['A','B'],values:[1,2],readingPurpose:'Verileri karşılaştırarak verilen kararı değerlendirmek.'};expect(editorialIssues(q,'BAR_CHART')).toContain('CHART_DATA_INVALID');
 q.editorial.visual={kind:'NONE',title:'',unit:'',columns:[],rows:[],categories:[],values:[1],readingPurpose:''};expect(editorialIssues(q,'TEXT')).toContain('EMPTY_VISUAL_MUST_BE_EMPTY');
});
it('rejects truncated provider envelopes even when their JSON prefix is syntactically valid',async()=>{
 const {readAiJson}=await import('../worker/lib/question-generation-validation');const content=JSON.stringify({questions:[editorialQuestion()]});
 expect(readAiJson({choices:[{finish_reason:'stop',message:{content}}]})).toEqual(JSON.parse(content));
 expect(readAiJson({choices:[{finish_reason:'length',message:{content}}]})).toBeNull();
 expect(readAiJson({finishReason:'length',response:content})).toBeNull();
 expect(readAiJson({status:'incomplete',output_text:content})).toBeNull();
 expect(readAiJson({choices:[{finish_reason:'length',message:{content:'{"questions":['}}]})).toBeNull();
});
