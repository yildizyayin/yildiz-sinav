import { useState } from 'react';
import type { DeviceVoiceOption, DeviceVoicePreference } from '../lib/device-speech';

/**
 * D-S049 (30 Oct): free voices only. The student picks one of the device's Turkish voices and the speaking rate.
 * A natural online voice sends the text to its maker (Microsoft/Google): it needs an explicit tick, and the
 * student's name is removed from what is read aloud.
 */
const SAMPLE = 'Merhaba, ben Nibiru. Bugün matematikte iki konuya birlikte bakalım mı?';

export function NibiruVoiceSettings({ voices, pref, onSave, onPreview, onClose }: { voices: DeviceVoiceOption[]; pref: DeviceVoicePreference; onSave: (p: DeviceVoicePreference) => void; onPreview: (p: DeviceVoicePreference, text: string) => void; onClose: () => void }) {
  const local = voices.filter((v) => !v.online), online = voices.filter((v) => v.online);
  const [voiceId, setVoiceId] = useState<string>(pref.voiceId || local[0]?.id || '');
  const [rate, setRate] = useState<number>(pref.rate || 1);
  const [consent, setConsent] = useState<boolean>(Boolean(pref.allowOnline));
  const chosen = voices.find((v) => v.id === voiceId);
  const needsConsent = Boolean(chosen?.online);
  const draft: DeviceVoicePreference = { voiceId, rate, allowOnline: needsConsent ? consent : false };
  const label = (v: DeviceVoiceOption) => `${v.name.replace(/^Microsoft\s+/i, '').replace(/\s*-\s*Turkish.*$/i, '')}${v.gender === 'FEMALE' ? ' · kadın' : v.gender === 'MALE' ? ' · erkek' : ''}${v.natural ? ' · doğal' : ''}`;
  return <section className="nibiru-voice-settings" aria-labelledby="nvs-title">
    <div className="nvs-head"><h2 id="nvs-title">Nibiru'nun sesi</h2><button type="button" className="ghost" onClick={onClose}>Kapat</button></div>
    {!voices.length ? <p className="muted">Bu cihazda Türkçe ses yok. Cihazın ayarlarından Türkçe ses paketini yükleyebilir ya da yazılı yanıtı kullanabilirsiniz. Edge tarayıcısında doğal Türkçe sesler hazır gelir.</p> : <>
      <label className="nvs-field">Ses
        <select value={voiceId} onChange={(e) => { setVoiceId(e.target.value); setConsent(false); }}>
          {local.length > 0 && <optgroup label="Cihazın içinde (metin dışarı gitmez)">{local.map((v) => <option key={v.id} value={v.id}>{label(v)}</option>)}</optgroup>}
          {online.length > 0 && <optgroup label="Doğal çevrim içi (metin ses sağlayıcısına gider)">{online.map((v) => <option key={v.id} value={v.id}>{label(v)}</option>)}</optgroup>}
        </select>
      </label>
      <label className="nvs-field">Konuşma hızı · {rate.toFixed(2).replace('.', ',')}
        <input type="range" min={0.8} max={1.2} step={0.05} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
      </label>
      {needsConsent && <label className="nvs-consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>Bu ses çevrim içi çalışır: okunacak yanıt metni ses sağlayıcısına (ör. Microsoft, Google) gönderilir. Adın ve kişisel bilgilerin metinden çıkarılır. Kabul ediyorum.</span></label>}
      {!online.length && <p className="muted nvs-hint">Daha doğal sesler için Edge tarayıcısını deneyebilirsiniz; "Emel" ve "Ahmet" doğal sesleri ücretsiz gelir.</p>}
      <div className="nvs-actions">
        <button type="button" className="ghost" disabled={needsConsent && !consent} onClick={() => onPreview(draft, SAMPLE)}>Örnek dinle</button>
        <button type="button" className="primary" disabled={needsConsent && !consent} onClick={() => onSave(draft)}>Kaydet</button>
      </div>
      <p className="muted nvs-hint">Seçim yalnız bu cihazda saklanır; sesler cihaza ve tarayıcıya göre değişir.</p>
    </>}
  </section>;
}
