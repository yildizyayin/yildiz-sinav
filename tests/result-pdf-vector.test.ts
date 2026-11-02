import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** 2 Nov (owner): "PDF indir" must be fast — pages are written as vector text and shapes, never one picture per page. */
describe('report PDF is vector, not pictures', () => {
  const src = readFileSync(new URL('../src/lib/downloadPdf.ts', import.meta.url), 'utf8');
  it('does not rasterise pages', () => {
    expect(src).not.toMatch(/html-to-image|toJpeg|toPng|embedJpg/);
    expect(src).toContain('drawText(');
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.dependencies['html-to-image']).toBeUndefined();
  });
  it('ships the fonts it measures and embeds, with Turkish letters', async () => {
    const fontkit = (await import('@pdf-lib/fontkit')).default as any;
    for (const file of ['rx-inter-regular.ttf', 'rx-inter-bold.ttf', 'rx-mono.ttf']) {
      const url = new URL(`../public/fonts/${file}`, import.meta.url);
      expect(existsSync(url), file).toBe(true);
      expect(src).toContain(`/fonts/${file}`);
      const font = fontkit.create(readFileSync(url));
      for (const ch of 'ğüşıöçĞÜŞİÖÇ·—…▲▼') expect(font.hasGlyphForCodePoint(ch.codePointAt(0)), `${file} ${ch}`).toBe(true);
    }
  });
});
