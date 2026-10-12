// Local voices only: academic answers never leave the device through browser TTS.
export function localTurkishVoice(voices: SpeechSynthesisVoice[]) {
  return voices.find(v => v.localService && /^tr(?:[-_]|$)/i.test(v.lang)) || null;
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
    speak(text: string, onEnd: () => void, onError: (message: string) => void) {
      const voice = localTurkishVoice(synth.getVoices());
      if (!voice) return false;
      cancel();
      const utterance = new Utterance(text.slice(0, 3600));
      active = utterance;
      utterance.voice = voice;
      utterance.lang = voice.lang;
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
