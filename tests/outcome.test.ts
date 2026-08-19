import { describe, expect, it } from 'vitest';
import { masteryStatus } from '../worker/lib/outcome';

describe('outcome mastery',()=>{
 it('does not label a student from one wrong question',()=>expect(masteryStatus(0,1,.6,3)).toBe('INSUFFICIENT_EVIDENCE'));
 it('marks developing only after enough evidence',()=>expect(masteryStatus(1,4,.6,3)).toBe('DEVELOPING'));
 it('marks strong when threshold is met',()=>expect(masteryStatus(3,4,.6,3)).toBe('STRONG'));
});
