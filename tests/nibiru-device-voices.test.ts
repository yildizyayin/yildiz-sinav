import { describe, expect, it, vi } from 'vitest';
import { chooseVoice, createDeviceSpeech, turkishVoiceOptions, withoutPersonalWords } from '../src/lib/device-speech';

/** D-S049: free device voices; an online (natural) voice only after the student's choice, and without names. */
const v = (name: string, lang: string, localService: boolean) => ({ name, voiceURI: name, lang, localService } as SpeechSynthesisVoice);
const VOICES = [v('Google US English', 'en-US', false), v('Yelda', 'tr-TR', true), v('Microsoft Emel Online (Natural) - Turkish (Turkey)', 'tr-TR', false), v('Microsoft Ahmet Online (Natural) - Turkish (Turkey)', 'tr-TR', false)];

describe('Nibiru device voices', () => {
  it('lists only Turkish voices, natural first, with known genders', () => {
    const list = turkishVoiceOptions(VOICES);
    expect(list.map((x) => x.name)).toEqual(['Microsoft Ahmet Online (Natural) - Turkish (Turkey)', 'Microsoft Emel Online (Natural) - Turkish (Turkey)', 'Yelda']);
    expect(list.map((x) => x.gender)).toEqual(['MALE', 'FEMALE', 'FEMALE']);
    expect(list[0]).toMatchObject({ online: true, natural: true });
  });

  it('uses an online voice only with consent, otherwise the local one', () => {
    const emel = 'Microsoft Emel Online (Natural) - Turkish (Turkey)';
    expect(chooseVoice(VOICES, { voiceId: emel })!.name).toBe('Yelda');
    expect(chooseVoice(VOICES, { voiceId: emel, allowOnline: true })!.name).toBe(emel);
    expect(chooseVoice(VOICES, {})!.name).toBe('Yelda');
    expect(chooseVoice([VOICES[0]], { voiceId: 'Google US English', allowOnline: true })).toBeNull();
  });

  it('removes names before an online voice reads the answer, keeps the text for a local voice', () => {
    expect(withoutPersonalWords('Merhaba Efe, bugün Efe\'nin planı hazır. Aferin Efe!', ['Efe', 'Yılmaz'])).toBe('Merhaba, bugün planı hazır. Aferin!');
    expect(withoutPersonalWords('Efeler ekibi', ['Efe'])).toBe('Efeler ekibi');
    class U { constructor(public text: string) {} voice: any; lang = ''; rate = 1; onstart: any; onend: any; onerror: any; }
    const synth = { getVoices: () => VOICES, cancel: vi.fn(), speak: vi.fn() } as unknown as SpeechSynthesis;
    const speech = createDeviceSpeech(synth, U as any);
    speech.speak('Merhaba Efe, devam edelim.', vi.fn(), vi.fn(), { voiceId: 'Microsoft Emel Online (Natural) - Turkish (Turkey)', allowOnline: true, rate: 2, personalWords: ['Efe'] });
    const online = vi.mocked(synth.speak).mock.calls[0][0];
    expect(online.text).toBe('Merhaba, devam edelim.');
    expect(online.rate).toBe(1.3);
    speech.speak('Merhaba Efe, devam edelim.', vi.fn(), vi.fn(), { personalWords: ['Efe'] });
    expect(vi.mocked(synth.speak).mock.calls[1][0].text).toBe('Merhaba Efe, devam edelim.');
  });
});
