/**
 * Sonuç raporları (30 Oct, owner): "PDF indir" downloads a real PDF file instead of opening the print dialog.
 * Every `.rx-page` of the report is drawn as it looks on screen (A4 portrait or landscape) and the pages are put into
 * one PDF in the browser. Nothing is sent to a server. The text is an image in the file (not selectable); the printed
 * look is exactly the reviewed report.
 */
const A4 = { w: 595.28, h: 841.89 };

/** Loads the two libraries ahead of the click, so pressing "PDF indir" starts at once. */
export function preloadPdfTools() { void import('html-to-image'); void import('pdf-lib'); }

export async function downloadPagesAsPdf(root: Element | null | undefined, fileName: string, onProgress?: (done: number, total: number) => void): Promise<number> {
  const pages = root ? [...root.querySelectorAll<HTMLElement>('.rx-page')] : [];
  if (!pages.length) return 0;
  const [{ toJpeg, getFontEmbedCSS }, { PDFDocument }] = await Promise.all([import('html-to-image'), import('pdf-lib')]);
  const pdf = await PDFDocument.create();
  pdf.setTitle(fileName.replace(/\.pdf$/i, ''));
  pdf.setCreator('ANUNEX Sonuç Ağı');

  // Pages are copied into an off-screen stage at their real A4 size (the preview scales and hides them).
  const stage = document.createElement('div');
  stage.setAttribute('aria-hidden', 'true');
  stage.style.cssText = 'position:fixed;left:-100000px;top:0;z-index:-1;pointer-events:none;background:#fff';
  // Keep the report's own styles: the stage sits inside the same scoped wrappers as the preview.
  const scope = root!.closest('.rm') ? document.createElement('div') : null;
  if (scope) scope.className = 'rm';
  (scope || stage).appendChild(document.createElement('div')).className = 'rx-pages';
  if (scope) stage.appendChild(scope);
  const holder = stage.querySelector('.rx-pages') as HTMLElement;
  document.body.appendChild(stage);
  let fontEmbedCSS: string | undefined;
  try {
    for (let i = 0; i < pages.length; i++) {
      const clone = pages[i].cloneNode(true) as HTMLElement;
      clone.classList.remove('is-current');
      clone.style.cssText += ';display:flex;position:static;transform:none;margin:0;box-shadow:none;border-radius:0';
      holder.replaceChildren(clone);
      if (i === 0) { try { fontEmbedCSS = await getFontEmbedCSS(clone); } catch { fontEmbedCSS = undefined; } }
      const landscape = clone.classList.contains('rx-land');
      const dataUrl = await toJpeg(clone, { pixelRatio: 2, quality: 0.9, backgroundColor: '#ffffff', cacheBust: false, fontEmbedCSS, width: clone.offsetWidth, height: clone.offsetHeight });
      const image = await pdf.embedJpg(dataUrl);
      const size = landscape ? { w: A4.h, h: A4.w } : A4;
      pdf.addPage([size.w, size.h]).drawImage(image, { x: 0, y: 0, width: size.w, height: size.h });
      onProgress?.(i + 1, pages.length);
      await new Promise((r) => setTimeout(r, 0)); // let the progress text paint between pages
    }
    const bytes = await pdf.save();
    const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url; a.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return pages.length;
  } finally { stage.remove(); }
}

/** A file name from the report title: letters, digits and dashes only. */
export function pdfFileName(title: string) {
  const base = title.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return `${base || 'anunex-rapor'}.pdf`;
}
