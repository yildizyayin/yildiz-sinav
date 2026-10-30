// Device voices only. By default only voices that run inside the device are used, so academic answers never leave it.
// D-S049 (owner, 30 Oct): a student may choose a natural online voice of the device (e.g. Edge "Microsoft Emel Online
// (Natural)"); such a voice sends the text to its maker, so it is only used after the student's explicit choice, and
// the student's name and other personal words are removed from the text first.
export function localTurkishVoice(voices: SpeechSynthesisVoice[]) {
  return voices.find(v => v.localService && /^tr(?:[-_]|$)/i.test(v.lang)) || null;
}

export type DeviceVoiceOption = { id: string; name: string; online: boolean; natural: boolean; gender: 'FEMALE' | 'MALE' | null };
const isTurkish = (v: SpeechSynthesisVoice) => /^tr(?:[-_]|$)/i.test(v.lang);
// Gender only for voice names known to be Turkish female/male voices; anything else stays unlabelled.
const FEMALE = /\b(emel|filiz|seda|yelda)\b/i;
const MALE = /\b(ahmet|tolga)\b/i;

/** Every Turkish voice of the device, the more natural ones first. */
export function turkishVoiceOptions(voices: SpeechSynthesisVoice[]): DeviceVoiceOption[] {
  return voices.filter(isTurkish).map((v): DeviceVoiceOption => {
    const name = String(v.name || v.voiceURI || 'Türkçe ses');
    return { id: v.voiceURI || name, name, online: !v.localService, natural: /natural|neural|online|premium|enhanced|google/i.test(name), gender: MALE.test(name) ? 'MALE' : FEMALE.test(name) ? 'FEMALE' : null };
  }).sort((a, b) => Number(b.natural) - Number(a.natural) || Number(a.online) - Number(b.online) || a.name.localeCompare(b.name, 'tr'));
}

export type DeviceVoicePreference = { voiceId?: string | null; rate?: number; allowOnline?: boolean };
const PREF_KEY = 'nibiru_device_voice';
export function readVoicePreference(): DeviceVoicePreference {
  try { const v = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
export function saveVoicePreference(pref: DeviceVoicePreference) { try { localStorage.setItem(PREF_KEY, JSON.stringify(pref)); } catch { /* storage may be blocked */ } }

/** Removes the given personal words (names) before text goes to an online voice: "Merhaba Efe, bugün…" → "Merhaba, bugün…". */
export function withoutPersonalWords(text: string, words: string[]): string {
  let out = text;
  for (const w of [...new Set(words.map((x) => String(x || '').trim()).filter((x) => x.length >= 2))].sort((a, b) => b.length - a.length)) {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(^|[^\\p{L}])${escaped}(?:['’]\\p{L}{1,6})?(?=[^\\p{L}]|$)`, 'giu'), '$1');
  }
  return out.replace(/\s+([,.!?;:])/g, '$1').replace(/,\s*([.!?])/g, '$1').replace(/([^\S\n]){2,}/g, ' ').replace(/^\s*,\s*/, '').trim();
}

export function chooseVoice(voices: SpeechSynthesisVoice[], pref?: DeviceVoicePreference): SpeechSynthesisVoice | null {
  if (pref?.voiceId) {
    const wanted = voices.find((v) => isTurkish(v) && (v.voiceURI || v.name) === pref.voiceId);
    if (wanted && (wanted.localService || pref.allowOnline)) return wanted;
  }
  return localTurkishVoice(voices);
}

export function createDeviceSpeech(synth: SpeechSynthesis, Utterance: typeof SpeechSynthesisUtterance) {
  let active: SpeechSynthesisUtterance | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (active) { active.onstart = null; active.onend = null; active.onerror = null; }
    active = null;
    synth.cancel();
  };
  return {
    cancel,
    speak(text: string, onEnd: () => void, onError: (message: string) => void, pref?: DeviceVoicePreference & { personalWords?: string[] }) {
      const voice = chooseVoice(synth.getVoices(), pref);
      if (!voice) return false;
      cancel();
      const spoken = voice.localService ? text : withoutPersonalWords(text, pref?.personalWords || []);
      const utterance = new Utterance(spoken.slice(0, 3600));
      active = utterance;
      utterance.voice = voice;
      utterance.lang = voice.lang;
      if (pref?.rate && Number.isFinite(pref.rate)) utterance.rate = Math.min(1.3, Math.max(0.7, pref.rate));
      const finish = (error?: string) => {
        if (active !== utterance) return;
        cancel();
        if (error) onError(error); else onEnd();
      };
      utterance.onstart = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => finish('Seslendirme tamamlanamadı. Tekrar deneyin.'), 300_000); };
      utterance.onend = () => finish();
      utterance.onerror = () => finish('Cihaz sesi oynatılamadı. Cihazın ses ayarlarını kontrol edin.');
      timer = setTimeout(() => finish('Cihaz seslendirmeyi başlatamadı. Tekrar deneyin.'), 8000);
      try { synth.speak(utterance); } catch { finish('Cihaz sesi başlatılamadı.'); }
      return true;
    },
  };
}
