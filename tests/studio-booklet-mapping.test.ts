import {describe,it,expect} from 'vitest';
import {validateBookletPermutation} from '../worker/lib/studio-booklet-mapping';
const a=[{bookletCode:'A',questionId:'q1',position:1,subjectId:'math',correctAnswer:'B'},{bookletCode:'A',questionId:'q2',position:2,subjectId:'math',correctAnswer:'D'}];
describe('A/B booklet integrity',()=>{
 it('accepts the same questions in another order',()=>expect(validateBookletPermutation([...a,{...a[1],bookletCode:'B',position:1},{...a[0],bookletCode:'B',position:2}]).ok).toBe(true));
 it('rejects changed answer keys',()=>expect(validateBookletPermutation([...a,{...a[0],bookletCode:'B',correctAnswer:'A',position:2},{...a[1],bookletCode:'B',position:1}]).errors).toContain('BOOKLET_CONTENT_MISMATCH'));
 it('rejects missing question',()=>expect(validateBookletPermutation([...a,{...a[0],bookletCode:'B'}]).ok).toBe(false));
 it('rejects duplicate question positions',()=>expect(validateBookletPermutation([...a,{...a[1],position:1}]).errors).toContain('DUPLICATE_QUESTION_OR_POSITION'));
 it('rejects a booklet without A',()=>expect(validateBookletPermutation([{...a[0],bookletCode:'B'}]).errors).toContain('BOOKLET_A_REQUIRED'));
});
