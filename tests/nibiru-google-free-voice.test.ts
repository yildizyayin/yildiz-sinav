import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { evaluatedExam } from './helpers/exam-flow';
import { buildVoiceProviderPlan, prepareNibiruSpeechText, speakNibiru, voiceProviderStatusWithHealth } from '../worker/lib/nibiru-voice';

/**
 * Owner, 13 Nov 2026: Nibiru's natural Google WaveNet voice comes back without any paid provider, and the platform
 * stays under Google's free monthly WaveNet allowance; past the ceiling Nibiru uses the device voice.
 */
const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const account = JSON.stringify({ client_email: 'nibiru@test.iam.gserviceaccount.com', private_key: key, project_id: 'anunex-test' });
const audio = btoa('ID3' + 'x'.repeat(400));

function mockGoogle() {
  const calls: any[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
    if (String(url).includes('oauth2')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ audioContent: audio }));
  }));
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe('Nibiru ücretsiz Google sesi', () => {
  it('uses only Google WaveNet, never a paid provider, and is ready without a paid switch', async () => {
    const t = await evaluatedExam('direct');
    Object.assign(t.env, { GOOGLE_TTS_SERVICE_ACCOUNT_JSON: account, NIBIRU_GOOGLE_FREE_VOICE: 'ON', NIBIRU_GOOGLE_TTS_VOICE: 'tr-TR-Chirp3-HD-Aoede', AI: {} });
    expect(buildVoiceProviderPlan(t.env, 'STANDARD').providers).toEqual(['GOOGLE_WAVENET']);
    expect(buildVoiceProviderPlan(t.env, 'PREMIUM').providers).toEqual(['GOOGLE_WAVENET']);
    expect((await voiceProviderStatusWithHealth(t.env)).standardReady).toBe(true);
    const calls = mockGoogle();
    const r = await speakNibiru(t.env, '**Merhaba!** Bugün %50 ilerledin.', 'STANDARD');
    expect(r.audio.provider).toBe('GOOGLE_WAVENET');
    expect(calls[0].voice.name).toBe('tr-TR-Wavenet-E'); // a costlier voice tier is never used in free mode
    expect(calls[0].input.text).toBe('Merhaba! Bugün yüzde 50 ilerledin.');
  });

  it('stops at the monthly ceiling and then reports the natural voice as not ready', async () => {
    const t = await evaluatedExam('direct');
    Object.assign(t.env, { GOOGLE_TTS_SERVICE_ACCOUNT_JSON: account, NIBIRU_GOOGLE_FREE_VOICE: 'ON', NIBIRU_GOOGLE_FREE_MONTHLY_CHARS: '260' });
    const calls = mockGoogle();
    await speakNibiru(t.env, 'a'.repeat(30), 'STANDARD');
    await expect(speakNibiru(t.env, 'b'.repeat(240), 'STANDARD')).rejects.toThrow(/GOOGLE_FREE_MONTHLY_LIMIT/);
    expect(calls).toHaveLength(1);
    t.db.exec(`UPDATE nibiru_voice_monthly_chars SET chars=250`);
    expect((await voiceProviderStatusWithHealth(t.env)).standardReady).toBe(false);
    // a ceiling above Google's free allowance is never accepted
    Object.assign(t.env, { NIBIRU_GOOGLE_FREE_MONTHLY_CHARS: '9000000' });
    t.db.exec(`UPDATE nibiru_voice_monthly_chars SET chars=3499990`);
    await expect(speakNibiru(t.env, 'c'.repeat(50), 'STANDARD')).rejects.toThrow(/GOOGLE_FREE_MONTHLY_LIMIT/);
  });

  it('stays on the device voice when the switch is off', async () => {
    const t = await evaluatedExam('direct');
    Object.assign(t.env, { GOOGLE_TTS_SERVICE_ACCOUNT_JSON: account });
    expect(buildVoiceProviderPlan(t.env, 'STANDARD').providers).toEqual([]);
    await expect(speakNibiru(t.env, 'Merhaba', 'STANDARD')).rejects.toThrow(/VOICE_PAID_PROVIDERS_DISABLED/);
  });

  it('reads lists, middle dots and emoji the way a listener expects', () => {
    expect(prepareNibiruSpeechText('Önce şunlar:\n- **Matematik**: Üslü ifadeler (%40)\n- Türkçe · Ana fikir 🎯')).toBe('Önce şunlar: Matematik: Üslü ifadeler (yüzde 40). Türkçe, Ana fikir');
  });
});
