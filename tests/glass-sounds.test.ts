// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { readSoundSettings, soundForTarget, writeSoundSettings } from '../src/lib/glassSounds';

/** Owner (10 Nov 2026): glass-touch sounds — on by default and low, switchable, never for disabled controls. */
afterEach(() => { window.localStorage.clear(); document.body.innerHTML = ''; });
it('is on and low by default, and remembers the student\'s choice on this device', () => {
  expect(readSoundSettings()).toEqual({ enabled: true, volume: 0.35 });
  writeSoundSettings({ enabled: false, volume: 0.8 });
  expect(readSoundSettings()).toEqual({ enabled: false, volume: 0.8 });
  window.localStorage.setItem('anunex-ui-sounds', '{broken');
  expect(readSoundSettings()).toEqual({ enabled: true, volume: 0.35 });
});
it('picks a sound by what was touched', () => {
  document.body.innerHTML = `<nav><a class="nav-item" href="/x"><span id="in-link">Menü</span></a></nav><button id="b">Kaydet</button><button id="d" disabled>Kapalı</button>
    <label class="toggle-row"><input id="c" type="checkbox"/></label><div data-sound="off"><button id="m">Sessiz</button></div><p id="p">metin</p>`;
  const $ = (id: string) => document.getElementById(id);
  expect(soundForTarget($('in-link'))).toBe('nav');
  expect(soundForTarget($('b'))).toBe('tap');
  expect(soundForTarget($('c'))).toBe('toggle');
  expect(soundForTarget($('d'))).toBeNull();
  expect(soundForTarget($('m'))).toBeNull();
  expect(soundForTarget($('p'))).toBeNull();
});
