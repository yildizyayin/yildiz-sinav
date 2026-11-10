/**
 * Student panel sounds (owner, 10 Nov 2026): taps that feel like touching glass. Everything is synthesised in the
 * browser with the Web Audio API — no sound files, no service, nothing recorded. On by default at a low level;
 * the student can turn it off or change the level in Görünüm ayarları. The choice is kept on this device only.
 */
export type GlassSound = 'tap' | 'nav' | 'toggle' | 'success' | 'soft';
const KEY = 'anunex-ui-sounds';
type Settings = { enabled: boolean; volume: number };
const DEFAULTS: Settings = { enabled: true, volume: 0.35 };

export function readSoundSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const v = JSON.parse(raw);
    return { enabled: v?.enabled !== false, volume: Math.max(0, Math.min(1, Number(v?.volume ?? DEFAULTS.volume))) };
  } catch { return DEFAULTS; }
}
export function writeSoundSettings(next: Settings) {
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: keep the default */ }
}

let ctx: AudioContext | null = null;
function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) { try { ctx = new Ctor(); } catch { return null; } }
  if (ctx!.state === 'suspended') void ctx!.resume().catch(() => undefined);
  return ctx;
}

/** One glassy ping: a bright fundamental with an inharmonic overtone, quick attack and a short ring. */
function ping(ac: AudioContext, out: AudioNode, at: number, freq: number, length: number, level: number) {
  const partials: Array<[number, number]> = [[1, 1], [2.76, 0.35], [5.4, 0.12]];
  for (const [ratio, weight] of partials) {
    const osc = ac.createOscillator(); const gain = ac.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(freq * ratio * (1 + (Math.random() - 0.5) * 0.004), at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level * weight), at + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length / ratio ** 0.35);
    osc.connect(gain).connect(out); osc.start(at); osc.stop(at + length + 0.05);
  }
}

export function playGlass(sound: GlassSound = 'tap') {
  const settings = readSoundSettings();
  if (!settings.enabled || settings.volume <= 0 || (typeof document !== 'undefined' && document.hidden)) return;
  const ac = context(); if (!ac) return;
  const master = ac.createGain(); master.gain.value = 0.22 * settings.volume;
  const tone = ac.createBiquadFilter(); tone.type = 'highshelf'; tone.frequency.value = 6000; tone.gain.value = -6;
  master.connect(tone).connect(ac.destination);
  const t = ac.currentTime + 0.005;
  switch (sound) {
    case 'nav': ping(ac, master, t, 1760, 0.16, 0.7); break;
    case 'toggle': ping(ac, master, t, 2093, 0.1, 0.6); ping(ac, master, t + 0.05, 2637, 0.12, 0.5); break;
    case 'success': [1568, 1976, 2349, 3136].forEach((f, i) => ping(ac, master, t + i * 0.07, f, 0.35, 0.65)); break;
    case 'soft': { // a muted, friendly knock for a wrong answer: never harsh
      const osc = ac.createOscillator(); const gain = ac.createGain(); const lp = ac.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 900; osc.type = 'triangle';
      osc.frequency.setValueAtTime(330, t); osc.frequency.exponentialRampToValueAtTime(220, t + 0.18);
      gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(0.5, t + 0.01); gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(lp).connect(gain).connect(master); osc.start(t); osc.stop(t + 0.3); break;
    }
    default: ping(ac, master, t, 2489, 0.09, 0.55);
  }
}

/** Which sound a click deserves, if any: links and menu items "nav", switches "toggle", buttons "tap". */
export function soundForTarget(target: EventTarget | null): GlassSound | null {
  const el = target instanceof Element ? target.closest('a[href],button,[role="tab"],[role="button"],input[type="checkbox"],input[type="radio"],select,summary,label.toggle-row') : null;
  if (!el || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('[data-sound="off"]')) return null;
  if (el.matches('input[type="checkbox"],input[type="radio"],label.toggle-row,[role="tab"]')) return 'toggle';
  if (el.matches('a[href],.nav-item,.student-dock-link')) return 'nav';
  return 'tap';
}

/** Plays the matching sound for every click inside the panel; returns the cleanup. */
export function installGlassSounds(root: Document | HTMLElement = document) {
  const onClick = (e: Event) => { const s = soundForTarget(e.target); if (s) playGlass(s); };
  const onCustom = (e: Event) => playGlass(((e as CustomEvent).detail as GlassSound) || 'tap');
  root.addEventListener('click', onClick, { capture: true, passive: true } as any);
  window.addEventListener('anunex-sound', onCustom);
  return () => { root.removeEventListener('click', onClick, { capture: true } as any); window.removeEventListener('anunex-sound', onCustom); };
}

/** For screens that know an answer was right or wrong. */
export function soundCue(sound: GlassSound) { try { window.dispatchEvent(new CustomEvent('anunex-sound', { detail: sound })); } catch { /* old browser */ } }
