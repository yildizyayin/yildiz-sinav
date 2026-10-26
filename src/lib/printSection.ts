/**
 * S031: print only one part of the page (a report or the report cards), not the whole admin screen.
 * The section is copied into a top-level #print-root; while printing everything else is hidden (styles.css).
 * Copying avoids the admin layout (sidebar, scroll containers, positioned parents) shaping the printed page.
 */
export function printSection(element: Element | null | undefined) {
  if (!element) { window.print(); return; }
  document.getElementById('print-root')?.remove();
  const root = document.createElement('div');
  root.id = 'print-root';
  root.appendChild(element.cloneNode(true));
  document.body.appendChild(root);
  document.body.classList.add('print-one');
  const done = () => { root.remove(); document.body.classList.remove('print-one'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  try { window.print(); } finally { setTimeout(done, 0); }
}
