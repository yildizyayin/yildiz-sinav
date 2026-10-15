import {editorialScores} from './fixtures/editorial-question';
import {expect,it,vi} from 'vitest';
import {qualityValidationCases,qualityValidationFindings,validateIndependentQuality} from '../worker/lib/question-quality-validation';
import {mechanicalDraftIssues,outcomeDraftIssues} from '../worker/lib/question-generation-validation';
const model='@cf/nvidia/nemotron-3-120b-a12b';
const results=()=>qualityValidationCases().map(c=>({key:c.key,verification:{ok:c.expectedPass,unavailable:false,model,blindSolves:[{keyHidden:true,solutionHidden:true}],reviews:[{valid:c.expectedPass,issues:c.expectedPass?[]:['SCIENTIFIC_ERROR'],editorial:{...editorialScores,rationale:'Çeldirici açıklamaları seçeneklerin gerçek değerleriyle karşılaştırıldı; hatalı açıklama tespit edildi.'}}]}}));
it('freezes a positive control and five distinct real or seeded defects',()=>{
 const cases=qualityValidationCases();expect(cases).toHaveLength(6);expect(cases.filter(c=>c.expectedPass)).toHaveLength(1);
 expect(mechanicalDraftIssues(cases[2].question)).toContain('INVALID_ARITHMETIC');
 expect(outcomeDraftIssues(cases[5].question,cases[5].context)).toContain('INVALID_TURKISH_COMPOUND_NUMERAL');
 expect(cases[4].question.editorial!.distractors[1].whyIncorrect).toContain('2 000 003 407');
});
it('requires every result, hidden-key evidence, positive acceptance and reasoned negative rejection',()=>{
 expect(qualityValidationFindings(results()).passed).toBe(true);
 for(const mutate of [(r:any[])=>r.pop(),(r:any[])=>{r[0].verification.ok=false;},(r:any[])=>{r[4].verification.unavailable=true;},(r:any[])=>{r[4].verification.ok=true;},(r:any[])=>{delete r[4].verification.reviews[0].editorial;},(r:any[])=>{r[0].verification.blindSolves[0].keyHidden=false;},(r:any[])=>{r[3].verification.reviews[0].issues=[];}]){const r:any[]=results();mutate(r);expect(qualityValidationFindings(r).passed).toBe(false);}
});
it('requires the specific mechanical fault rather than counting unrelated failure',()=>{
 const r:any[]=results();r[2].verification.model=null;r[2].verification.reviews[0].issues=['INVALID_ARITHMETIC'];expect(qualityValidationFindings(r).passed).toBe(true);
 r[2].verification.reviews[0].issues=['UNRELATED_ERROR'];expect(qualityValidationFindings(r).passed).toBe(false);
});
it('enforces staging/admin access and reuses prior validation without a model retry',async()=>{
 const run=vi.fn(),prior={id:'independent-quality-20261015-v1',status:'BLOCKED'},env:any={ENVIRONMENT:'staging',QUESTION_AI_DAILY_NEURON_LIMIT:'10000',QUESTION_BLIND_SOLVE_ENABLED:'true',QUESTION_GENERATION_VERIFIER_MODEL:model,AI:{run},DB:{prepare:()=>({bind:()=>({first:async()=>prior})})}};
 expect((await validateIndependentQuality({...env,ENVIRONMENT:'production'},{role:'SUPER_ADMIN'} as any)).status).toBe(403);
 expect((await validateIndependentQuality(env,{role:'STUDENT'} as any)).status).toBe(403);
 expect(await (await validateIndependentQuality(env,{role:'SUPER_ADMIN'} as any)).json()).toMatchObject({reused:true,validation:prior});expect(run).not.toHaveBeenCalled();
});
