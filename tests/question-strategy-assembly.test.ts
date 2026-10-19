import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {assembleInverseStrategies} from '../worker/lib/question-strategy-assembly';
import {mechanicalDraftIssues,outcomeDraftIssues,taskFocusIssues} from '../worker/lib/question-generation-validation';
import {editorialIssues} from '../worker/lib/question-editorial';
const source=()=>JSON.parse(readFileSync(new URL('./fixtures/pipeline-reasoned-math-candidate.json',import.meta.url),'utf8'));
const context={gradeLevel:5,outcomeCode:'MAT.5.1.2',qualityProfile:'EDITORIAL_V1',taskFocus:'NAT_INVERSE_STEPS'};
it('assembles a real AI source into a two-method decision while preserving every numerical answer and given',()=>{
 const q=source();expect(taskFocusIssues(q,context)).toContain('INVERSE_STRATEGY_DECISION_REQUIRED');expect(mechanicalDraftIssues(q)).toEqual([]);
 const result=assembleInverseStrategies(q)!;expect(result).not.toBeNull();expect(result.question.correctAnswer).toBe(q.correctAnswer);expect(result.plan.originalOptionValues).toEqual(q.options);expect(result.question.stemText).toContain('II. yöntem: 632 + 148 - 275 = 505');
 expect(editorialIssues(result.question,'TEXT')).toEqual([]);expect(mechanicalDraftIssues(result.question)).toEqual([]);expect(outcomeDraftIssues(result.question,context)).toEqual([]);expect(taskFocusIssues(result.question,context)).toEqual([]);
 expect(result.pureLlmEditorial).toBe(false);expect(q).toEqual(source());
});
it('refuses bad arithmetic, unsupported values and missing source structure rather than inventing a solution',()=>{
 const q=source();q.solutionText=q.solutionText.replace('= 907','= 908');expect(assembleInverseStrategies(q)).toBeNull();
 const wrong=source();wrong.options[0].text='999';expect(assembleInverseStrategies(wrong)).toBeNull();
 const missing=source();missing.editorial.distractors=[];expect(assembleInverseStrategies(missing)).toBeNull();
});
