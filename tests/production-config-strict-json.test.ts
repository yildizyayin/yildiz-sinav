import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

/**
 * The production deploys rewrite these files with jq, which reads strict JSON only: a // comment stopped the
 * 9 Nov deploy at "Materialize resolved production D1 config". Keep them comment-free; Smart Placement stays on.
 */
it('production Wrangler configs are strict JSON and keep Smart Placement', () => {
  for (const file of ['wrangler.production.jsonc', 'wrangler.result.production.jsonc']) {
    const config = JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
    expect(config.placement, file).toEqual({ mode: 'smart' });
  }
});
