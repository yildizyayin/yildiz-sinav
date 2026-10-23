/**
 * A076: the chosen panel theme belongs to one account on one device. A shared school computer or family
 * tablet must not carry one user's theme into another user's panel. Storage can be unavailable; then the
 * standard theme is used.
 */
export const themeStorageKey = (userId: string) => `anunex-panel-theme:${userId}`;
export function readPanelTheme(userId: string | undefined | null): string | null {
  if (!userId || typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(themeStorageKey(userId)); } catch { return null; }
}
export function writePanelTheme(userId: string, themeKey: string | null) {
  try {
    if (themeKey) window.localStorage.setItem(themeStorageKey(userId), themeKey);
    else window.localStorage.removeItem(themeStorageKey(userId));
    window.localStorage.removeItem('anunex-panel-theme'); // the old shared key is no longer used
  } catch { /* storage unavailable: the standard theme stays */ }
}
/** The theme to show: a special day wins, then the user's own allowed choice, then the default. */
export function activePanelTheme(stored: string | null, allowed: string[], specialDay: string | null | undefined, fallback = 'ANUNEX_STANDARD') {
  return specialDay || (stored && allowed.includes(stored) ? stored : fallback);
}
