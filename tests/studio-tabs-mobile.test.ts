import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** 3 Nov: on a phone the content tabs scroll inside themselves on every tab and Studio cards stack (no page overflow). */
describe('content center on a phone', () => {
  const css = readFileSync(new URL('../src/pages/approved-question-pool.css', import.meta.url), 'utf8');
  it('lets the tab bar scroll on every tab, not only Soru havuzu', () => {
    expect(css).toContain('.app-shell .approved-question-pool .content-tabs { max-width:100%; min-width:0; overflow-x:auto;');
  });
  it('stacks Studio and Video cards under 760px', () => {
    expect(css).toMatch(/@media \(max-width:760px\) \{\s*\.app-shell \.approved-question-pool \.module-stack > \.module-card \{ flex-direction:column;/);
  });
});
