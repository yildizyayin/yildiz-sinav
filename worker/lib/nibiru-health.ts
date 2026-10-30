import type { AuthUser, Env } from '../types';
import { all, json, one, uuid } from './db';
import { probeNibiruModels } from './nibiru-model-router';
import { recordVoiceProviderProbe, speakNibiru, transcribeNibiruAudio, voiceProviderStatus } from './nibiru-voice';
import { classifyVoiceActivationFailure } from './nibiru-voice-diagnostics';

/**
 * Nibiru canlı kontrol (owner decision 30 Oct): one button for the Super Admin that answers "do the AI services we
 * depend on actually work in this environment right now?" Unlike the staging-only provider probe this runs in
 * production, so it is small and rate limited: three one-word model calls, half a second of silence through
 * speech-to-text, and one short sentence of speech only when paid voice is switched on. Nothing about students is sent.
 */
export const HEALTH_CHECK_MIN_INTERVAL_SECONDS = 120;

type ItemState = 'OK' | 'FAIL' | 'OFF';
export type HealthItem = { key: string; label: string; state: ItemState; model?: string | null; detail: string };

const clip = (value: unknown) => String(value instanceof Error ? value.message : value ?? '')
  .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [gizli]').replace(/sk-[A-Za-z0-9_-]+/g, '[gizli]').slice(0, 200);

/** Half a second of 16 kHz mono silence as a WAV file: enough for the speech model to answer without any real audio. */
export function silentWav(seconds = 0.5, rate = 16000): Uint8Array {
  const samples = Math.round(seconds * rate), data = samples * 2, out = new Uint8Array(44 + data), v = new DataView(out.buffer);
  const ascii = (o: number, s: string) => [...s].forEach((c, i) => out[o + i] = c.charCodeAt(0));
  ascii(0, 'RIFF'); v.setUint32(4, 36 + data, true); ascii(8, 'WAVE'); ascii(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  ascii(36, 'data'); v.setUint32(40, data, true);
  return out;
}

const FAMILY_LABEL: Record<string, string> = { FAST: 'Hızlı yanıt modeli', META: 'Açıklama modeli (Meta)', NVIDIA: 'Akıl yürütme modeli (NVIDIA)' };

export async function runNibiruHealthCheck(env: Env, actor: AuthUser): Promise<Response> {
  if (actor.role !== 'SUPER_ADMIN') return json({ ok: false, error: { code: 'SUPER_ADMIN_ONLY', message: 'Canlı kontrolü yalnız Süper Admin çalıştırabilir.' } }, 403);
  const last = await one<{ age: number }>(env.DB.prepare(`SELECT (julianday('now')-julianday(checked_at))*86400 age FROM nibiru_health_checks ORDER BY checked_at DESC LIMIT 1`));
  if (last && Number(last.age) < HEALTH_CHECK_MIN_INTERVAL_SECONDS) return json({ ok: false, error: { code: 'HEALTH_CHECK_TOO_SOON', message: `Son kontrol ${Math.round(Number(last.age))} saniye önce yapıldı; ${HEALTH_CHECK_MIN_INTERVAL_SECONDS} saniye sonra yeniden deneyin.` } }, 429);
  const items: HealthItem[] = [];

  // 1) text models: the three models the router uses as primaries
  if (!env.AI) items.push({ key: 'AI_BINDING', label: 'Yapay zekâ bağlantısı', state: 'FAIL', detail: 'Workers AI bağlantısı (AI binding) bu ortamda tanımlı değil.' });
  else {
    try {
      const probe = await probeNibiruModels(env);
      for (const r of probe.results) items.push({ key: `MODEL_${r.family}`, label: FAMILY_LABEL[r.family] || r.family, model: r.model, state: r.ok ? 'OK' : 'FAIL', detail: r.ok ? `Yanıt verdi (${r.transport === 'gateway' ? 'AI Gateway üzerinden' : 'doğrudan'}${r.gatewayFallback ? ', Gateway başarısız oldu' : ''}).` : `Yanıt alınamadı: ${clip(r.error)}` });
    } catch (e) { items.push({ key: 'MODELS', label: 'Yazılı yapay zekâ', state: 'FAIL', detail: `Kontrol çalışmadı: ${clip(e)}` }); }
  }

  // 2) speech-to-text: silence must come back as "no speech", which proves the model answered
  const sttModel = env.NIBIRU_STT_MODEL || '@cf/openai/whisper-large-v3-turbo';
  if (!env.AI) items.push({ key: 'STT', label: 'Sesli soru (konuşmayı yazıya çevirme)', model: sttModel, state: 'FAIL', detail: 'Workers AI bağlantısı yok.' });
  else {
    try { await transcribeNibiruAudio(env, silentWav()); items.push({ key: 'STT', label: 'Sesli soru (konuşmayı yazıya çevirme)', model: sttModel, state: 'OK', detail: 'Model yanıt verdi.' }); }
    catch (e) {
      const empty = clip(e).includes('VOICE_TRANSCRIPTION_EMPTY');
      items.push({ key: 'STT', label: 'Sesli soru (konuşmayı yazıya çevirme)', model: sttModel, state: empty ? 'OK' : 'FAIL', detail: empty ? 'Model yanıt verdi (sessiz örnekte konuşma bulmadı; beklenen sonuç).' : `Yanıt alınamadı: ${clip(e)}` });
    }
  }

  // 3) Nibiru's voice: a paid provider only when switched on; otherwise say plainly that the device voice is used
  const voice = voiceProviderStatus(env);
  const keys = [voice.google.configured ? 'Google' : null, voice.openaiDirect.configured ? 'OpenAI' : null].filter(Boolean).join(', ') || 'yok';
  if (!voice.paidProvidersAllowed) items.push({ key: 'TTS', label: 'Nibiru sesi', state: 'OFF', detail: `Doğal ses kapalı (NIBIRU_PAID_VOICE_ENABLED açık değil). Nibiru şu an cihazın kendi Türkçe sesini kullanıyor. Tanımlı ses anahtarları: ${keys}.` });
  else {
    try {
      const r = await speakNibiru(env, 'Merhaba, ben Nibiru.', 'STANDARD');
      await recordVoiceProviderProbe(env, 'STANDARD', r.audio.provider, r.audio.model);
      items.push({ key: 'TTS', label: 'Nibiru sesi', model: `${r.audio.provider} · ${r.audio.model}`, state: 'OK', detail: `Ses üretildi (${r.audio.bytes.byteLength} bayt).` });
    } catch (e) { const d = classifyVoiceActivationFailure(e); items.push({ key: 'TTS', label: 'Nibiru sesi', state: 'FAIL', detail: `${d.detail} (${d.activationCode}). Tanımlı ses anahtarları: ${keys}.` }); }
  }

  const ok = items.every((i) => i.state !== 'FAIL');
  const result = { items, voice: { paidEnabled: voice.paidProvidersAllowed, googleKey: voice.google.configured, openaiKey: voice.openaiDirect.configured, fallback: 'DEVICE_VOICE' } };
  const id = uuid('nhc');
  await env.DB.prepare(`INSERT INTO nibiru_health_checks(id,checked_by,environment,ok,result_json) VALUES(?,?,?,?,?)`).bind(id, actor.id, env.ENVIRONMENT || 'unknown', ok ? 1 : 0, JSON.stringify(result)).run();
  return json({ ok: true, check: { id, ok, environment: env.ENVIRONMENT || 'unknown', checkedAt: new Date().toISOString(), ...result } });
}

export async function listNibiruHealthChecks(env: Env, actor: AuthUser): Promise<Response> {
  if (actor.role !== 'SUPER_ADMIN') return json({ ok: false, error: { code: 'SUPER_ADMIN_ONLY', message: 'Canlı kontrolü yalnız Süper Admin görebilir.' } }, 403);
  const rows = await all<any>(env.DB.prepare(`SELECT id,ok,environment,checked_at,result_json FROM nibiru_health_checks ORDER BY checked_at DESC LIMIT 10`));
  return json({ ok: true, checks: rows.map((r) => ({ id: r.id, ok: Boolean(r.ok), environment: r.environment, checkedAt: r.checked_at, ...JSON.parse(r.result_json || '{}') })) });
}
