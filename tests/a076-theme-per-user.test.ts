import { afterEach, describe, expect, it, vi } from 'vitest';
import { activePanelTheme, readPanelTheme, themeStorageKey, writePanelTheme } from '../src/lib/panelTheme';

/** A076: a theme chosen by one account never shows up in another account's panel on the same device. */
afterEach(() => vi.unstubAllGlobals());
function memoryStorage() { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; }

describe('A076 theme per user', () => {
  it('keeps each account on a shared device to its own theme and drops the old shared key', () => {
    const store = memoryStorage(); vi.stubGlobal('window', { localStorage: store });
    store.setItem('anunex-panel-theme', 'NIGHT'); // left behind by the old shared setting
    writePanelTheme('student-1', 'OCEAN');
    expect(store.m.has('anunex-panel-theme')).toBe(false);
    expect(readPanelTheme('student-1')).toBe('OCEAN');
    expect(readPanelTheme('parent-1')).toBeNull();
    const allowed = ['ANUNEX_STANDARD', 'OCEAN'];
    expect(activePanelTheme(readPanelTheme('parent-1'), allowed, null)).toBe('ANUNEX_STANDARD');
    expect(activePanelTheme(readPanelTheme('student-1'), allowed, null)).toBe('OCEAN');
    expect(activePanelTheme('OCEAN', ['ANUNEX_STANDARD'], null)).toBe('ANUNEX_STANDARD'); // no longer allowed for this role
    expect(activePanelTheme('OCEAN', allowed, 'REPUBLIC_DAY')).toBe('REPUBLIC_DAY');
    writePanelTheme('student-1', null);
    expect(store.m.has(themeStorageKey('student-1'))).toBe(false);
  });

  it('falls back to the standard theme when storage is unavailable', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } } });
    expect(readPanelTheme('u')).toBeNull();
    expect(() => writePanelTheme('u', 'OCEAN')).not.toThrow();
    expect(activePanelTheme(readPanelTheme('u'), ['OCEAN'], null)).toBe('ANUNEX_STANDARD');
  });
});
