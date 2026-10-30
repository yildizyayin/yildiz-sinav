import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pdfFileName } from '../src/lib/downloadPdf';

/** 30 Oct: the report centre's "PDF indir" downloads a PDF file; it no longer opens the print dialog. */
describe('report PDF download', () => {
  it('uses the PDF builder, not the print dialog', () => {
    const src = readFileSync(new URL('../src/components/ResultTopluListe.tsx', import.meta.url), 'utf8');
    expect(src).toContain('downloadPagesAsPdf(ref.current');
    expect(src).not.toContain('printSection(');
    expect(src).not.toMatch(/PDF olarak kaydet/);
  });
  it('makes a safe Turkish file name', () => {
    expect(pdfFileName('anunex ÇAP Yayınları TYT 1.DENEME SINAVI')).toBe('anunex-cap-yayinlari-tyt-1-deneme-sinavi.pdf');
    expect(pdfFileName('   ')).toBe('anunex-rapor.pdf');
  });
});
