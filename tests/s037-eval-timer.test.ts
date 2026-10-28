import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { seconds } from '../src/components/EvalTimer';

/** S037: every evaluation screen shows a seconds counter and the time it took. */
describe('S037 evaluation timer', () => {
  it('formats seconds the Turkish way', () => {
    expect(seconds(2400)).toBe('2,4 sn');
    expect(seconds(150)).toBe('0,2 sn');
    expect(seconds(61000)).toBe('61,0 sn');
  });
  it('is wired into the sonuc and app evaluation screens', () => {
    for (const f of ['src/pages/ResultOperatorWorkspace.tsx', 'src/pages/ExamEvaluate.tsx', 'src/pages/ExamCenter.tsx']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toContain('<EvalTimer');
      expect(src, f).toContain('watch.start()');
      expect(src, f).toContain('watch.stop()');
    }
  });
});
