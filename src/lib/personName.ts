/**
 * Display a stored first name in sentence case (owner, 11 Nov 2026). Names typed on a Turkish keyboard keep Turkish
 * casing (ALİ → Ali, IŞIK → Işık). A name stored in plain ASCII capitals (often from optical forms, which have no
 * Turkish letters) is read as written in Latin letters: ALI → Ali, not "Alı".
 */
export function properName(value: unknown): string {
  const w = String(value ?? '').trim();
  if (!w) return '';
  const ascii = /^[A-Z]+$/.test(w);
  const lower = ascii ? w.toLowerCase() : w.toLocaleLowerCase('tr-TR');
  return lower.charAt(0).toLocaleUpperCase(ascii ? 'en' : 'tr-TR') + lower.slice(1);
}
