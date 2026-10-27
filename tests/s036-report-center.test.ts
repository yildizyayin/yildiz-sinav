import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** S036 Rapor Merkezi (design "A+B karma", owner approval 27 Oct). Browser checks were run separately on synthetic data. */
const ui = readFileSync('src/components/ResultTopluListe.tsx', 'utf8');
const css = readFileSync('src/components/report-center.css', 'utf8');
describe('S036 Rapor Merkezi', () => {
  it('has the approved steps, folding finished ones, and a page-by-page preview with one PDF and Excel', () => {
    for (const text of ['1 · Sınav', '2 · Kurum', '3 · Raporlar', '4 · Önizleme ve çıktı', 'Değiştir', 'Raporları hazırla', 'Tümünü PDF indir', 'Excel indir', 'Önceki sayfa', 'Sonraki sayfa']) expect(ui).toContain(text);
    expect(ui).toContain("['Tümü', () => true]"); // level switcher on the page, not in the menu
  });
  it('is not reshaped by the portal theme (inputs, buttons, tables)', () => {
    for (const f of ['src/pages/approved-result-dealer.css', 'src/pages/approved-result-institution.css']) {
      const s = readFileSync(f, 'utf8');
      expect(s).toContain(':is(input[type=checkbox],input[type=radio]):not(.rm *)');
      expect(s).toContain('td:not(.rx-pages *) {');
    }
    expect(css).toContain('.rm input[type=checkbox],.rm input[type=radio]{width:18px;height:18px;min-height:0');
    expect(css).toContain('position:absolute;top:0;left:0'); // the scaled page does not widen the layout
  });
  it('prints the approved student card language', () => {
    const k = readFileSync('src/components/reports/karnes.tsx', 'utf8');
    for (const text of ['rx-hero', 'rx-ranks', 'rx-sbar', 'Öncelikli kazanımlar']) expect(k).toContain(text);
  });
});
