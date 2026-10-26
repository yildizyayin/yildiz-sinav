import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

/** S026: the institution list of the evaluation picker flows under its input; as an absolute list it was drawn off-screen (y < 0) in the sonuc layout. */
it('keeps the evaluation institution list under its input', () => {
  const css = readFileSync(new URL('../src/pages/result-network-admin.css', import.meta.url), 'utf8');
  expect(css).toMatch(/\.result-institution-picker \.institution-options\{position:static/);
  expect(readFileSync(new URL('../src/pages/ResultOperatorWorkspace.tsx', import.meta.url), 'utf8')).toContain('className="result-institution-picker"');
});
