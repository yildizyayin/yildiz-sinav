import {readFileSync} from 'node:fs';
import {expect,it,vi} from 'vitest';
import {readEditorPacket,editQuestionPacket,QUESTION_EDITOR_MODEL} from '../worker/lib/question-ai-editor';
const observation=()=>JSON.parse(readFileSync(new URL('./fixtures/qwen-editor-null-content.json',import.meta.url),'utf8'));
it('reads the actual complete null-content Qwen response as a packet',async()=>{
 const raw=observation(),packet=readEditorPacket(raw,QUESTION_EDITOR_MODEL);
 expect(packet.questions).toHaveLength(1);expect(packet.questions[0].correctAnswer).toBe('B');
 const run=vi.fn(async()=>raw),result=await editQuestionPacket({AI:{run},QUESTION_GENERATION_MODEL:'writer'} as any,packet.questions,{sourceModel:'writer',gradeLevel:5,outcomeCode:'MAT.5.1.1',presentation:'TEXT',taskFocus:'READ_ZERO_PERIODS'});
 expect(result.questions).toEqual(packet.questions);expect(result.humanApproved).toBe(false);expect(run).toHaveBeenCalledTimes(1);
});
it('never accepts truncated, conflicting, other-model or prose-only alternate outputs',()=>{
 const raw=observation();raw.choices[0].finish_reason='length';expect(readEditorPacket(raw,QUESTION_EDITOR_MODEL)).toBeNull();
 const conflict=observation();conflict.choices[0].message.content='not a packet';expect(readEditorPacket(conflict,QUESTION_EDITOR_MODEL)).toBeNull();
 expect(readEditorPacket(observation(),'other-model')).toBeNull();
 const prose=observation();prose.choices[0].message.reasoning_content='Here is the result: '+prose.choices[0].message.reasoning_content;expect(readEditorPacket(prose,QUESTION_EDITOR_MODEL)).toBeNull();
 const ambiguous=observation();ambiguous.choices[0].message.reasoning='different';expect(readEditorPacket(ambiguous,QUESTION_EDITOR_MODEL)).toBeNull();
});
it('keeps ordinary provider output working and does not admit incomplete packets',async()=>{
 const packet=readEditorPacket(observation(),QUESTION_EDITOR_MODEL);expect(readEditorPacket({response:JSON.stringify(packet)},QUESTION_EDITOR_MODEL)).toEqual(packet);
 const raw=observation();raw.choices[0].message.reasoning_content='{"questions":[]}';
 await expect(editQuestionPacket({AI:{run:async()=>raw}} as any,packet.questions,{sourceModel:'writer',gradeLevel:5,presentation:'TEXT'})).rejects.toThrow('EDITOR_OUTPUT_INCOMPLETE');
});
