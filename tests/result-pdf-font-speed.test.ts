import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 2 Nov (owner: "5000 öğrencide bile hızlı"): profiling showed ~80% of PDF time in OpenType shaping (kerning lookups)
 * for every text run. The report fonts carry no GSUB/GPOS/kern tables, so each run is a plain glyph lookup
 * (measured 536 → 133 ms per dense one-page karne). The browser measures with the same files, so layout still matches.
 */
describe('report PDF fonts are shaping-free', () => {
  it('has no layout tables', async () => {
    const fontkit = (await import('@pdf-lib/fontkit')).default as any;
    for (const file of ['rx-inter-regular.ttf', 'rx-inter-bold.ttf', 'rx-mono.ttf']) {
      const font = fontkit.create(readFileSync(new URL(`../public/fonts/${file}`, import.meta.url)));
      for (const table of ['GSUB', 'GPOS', 'kern']) expect(font.directory.tables[table], `${file} ${table}`).toBeUndefined();
    }
  });
});
