import { useEffect, useState } from 'react';
import { BarChart3, BellRing, MessageCircleHeart } from 'lucide-react';
import { api } from '../api';
import { NibiruMark } from './NibiruMark';

/**
 * Son rötuş (owner, 24 Nov 2026: "gece modu yerine onların belirlediği birkaç tema"): themes a parent or student picks
 * on their own phone, a three-card introduction the first time Nibiru opens, and the phone notification switch.
 * Theme and "seen" flags live in this browser only (a per-device convenience).
 */
export const NIBIRU_THEMES = [
  { id: 'gece-mavisi', label: 'Gece mavisi', swatch: 'linear-gradient(135deg,#071b46,#1d4ed8)' },
  { id: 'gece', label: 'Gece', swatch: 'linear-gradient(135deg,#0b1020,#334155)' },
  { id: 'gun-isigi', label: 'Gün ışığı', swatch: 'linear-gradient(135deg,#9a3412,#f59e0b)' },
  { id: 'orman', label: 'Orman', swatch: 'linear-gradient(135deg,#064e3b,#10b981)' },
  { id: 'lavanta', label: 'Lavanta', swatch: 'linear-gradient(135deg,#3b0764,#a855f7)' },
] as const;
const THEME_KEY = 'anunex.nibiruTheme.v1', INTRO_KEY = 'anunex.nibiruIntro.v1';
export function readTheme(): string { try { const v = localStorage.getItem(THEME_KEY) || ''; return NIBIRU_THEMES.some((t) => t.id === v) ? v : 'gece-mavisi'; } catch { return 'gece-mavisi'; } }
export function saveTheme(id: string) { try { localStorage.setItem(THEME_KEY, id); } catch { /* private mode */ } }

// ---------------------------------------------------------------------------------------------------- notifications
export type PushState = 'unsupported' | 'denied' | 'ask' | 'on' | 'off';
export function pushState(): PushState {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'default') return 'ask';
  try { return localStorage.getItem('anunex.nibiruPush.v1') === 'on' ? 'on' : 'off'; } catch { return 'off'; }
}
const keyBytes = (b64: string) => { const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
export async function enablePush() {
  if (pushState() === 'unsupported') throw new Error('Bu tarayıcı bildirim desteklemiyor. iPhone’da önce Nibiru’yu ana ekrana ekleyin.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Bildirim izni verilmedi. Telefon ayarlarından açabilirsiniz.');
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api<any>('/api/nibiru/push/key');
  const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await api('/api/nibiru/push/subscription', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) });
  try { localStorage.setItem('anunex.nibiruPush.v1', 'on'); } catch { /* ignore */ }
}
export async function disablePush() {
  const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription();
  if (sub) { await api('/api/nibiru/push/subscription', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined); await sub.unsubscribe().catch(() => false); }
  try { localStorage.setItem('anunex.nibiruPush.v1', 'off'); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------------------------------- introduction
export function NibiruIntro({ role }: { role?: string }) {
  const [step, setStep] = useState(-1);
  useEffect(() => { let seen = true; try { seen = Boolean(localStorage.getItem(INTRO_KEY)); } catch { /* ignore */ } if (!seen) setStep(0); }, []);
  if (step < 0) return null;
  const parent = role === 'PARENT', student = role === 'STUDENT';
  const cards = [
    { icon: <NibiruMark size={64} state="active" title="Nibiru"/>, title: 'Merhaba, ben Nibiru', text: parent ? 'Çocuğunuzun okuldaki gelişimini WhatsApp’ta yazışır gibi bana sorabilirsiniz.' : student ? 'Derslerin, sınavların ve çalışma planın için yanındayım. Bana istediğin gibi yaz.' : 'Sınıflarınız ve sınavlar hakkında doğrulanmış verilerle yardımcı olurum.' },
    { icon: <BarChart3 size={44}/>, title: 'Sonuçlar resimli', text: parent ? 'Net, gelişim ve zorlanılan konular kısa kartlarla gelir. Rehber öğretmenin onayladığı önerileri de paylaşırım.' : 'Netler, gelişim ve konular kısa kartlarla gelir; videoya ve plana tek dokunuşla geçersin.' },
    { icon: <BellRing size={44}/>, title: 'Önce ben yazarım', text: 'Sonuç açıklandığında ya da önemli bir şey olduğunda size ilk ben yazarım. Bildirimde kişisel bilgi olmaz.' },
  ];
  const done = () => { try { localStorage.setItem(INTRO_KEY, '1'); } catch { /* ignore */ } setStep(-1); };
  const c = cards[step];
  return <div className="nbx-intro" role="dialog" aria-label="Nibiru tanışma">
    <div className="nbx-intro-box">
      <div className="nbx-intro-icon">{c.icon}</div>
      <h2>{c.title}</h2><p>{c.text}</p>
      <div className="nbx-intro-dots" aria-hidden="true">{cards.map((_, i) => <i key={i} className={i === step ? 'on' : ''}/>)}</div>
      <div className="nbx-intro-actions">
        <button type="button" className="ghost" onClick={done}>Geç</button>
        <button type="button" className="go" onClick={() => step < cards.length - 1 ? setStep(step + 1) : done()}>{step < cards.length - 1 ? 'İleri' : <><MessageCircleHeart size={16}/> Başlayalım</>}</button>
      </div>
    </div>
  </div>;
}

// ---------------------------------------------------------------------------------------------------- choices
const PREF_LABELS: Record<string, { label: string; hint: string; roles: string[] }> = {
  RESULT: { label: 'Sınav sonuçları', hint: 'Sonuç açıklanınca', roles: ['PARENT', 'STUDENT'] },
  ABSENCE: { label: 'Devamsızlık', hint: 'Okulda devamsız işaretlenince', roles: ['PARENT'] },
  GUIDANCE: { label: 'Rehber öğretmenden gelenler', hint: 'Haftalık program, ekran günlüğü, not, anket, mesajın okunması', roles: ['PARENT', 'STUDENT'] },
  MEETING: { label: 'Görüşmeler', hint: 'Planlanınca ve bir gün önce hatırlatma', roles: ['PARENT', 'STUDENT'] },
  WEEKLY: { label: 'Pazar akşamı haftalık özet', hint: 'Sınav, devamsızlık ve çalışma özeti', roles: ['PARENT'] },
  STAFF: { label: 'Okul bildirimleri', hint: 'Acil rehberlik talebi, pilot başvurusu, lisans bitişi', roles: ['GUIDANCE_TEACHER', 'INSTITUTION_MANAGER', 'SUPER_ADMIN'] },
};

/** "Bildirim tercihlerim": which first messages Nibiru sends this person. Phones are quiet 22:00–08:00. */
export function NibiruNotifyPrefs({ role, onClose }: { role?: string; onClose: () => void }) {
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<any>('/api/nibiru/notify-prefs').then((r) => setPrefs(r.prefs)).catch((e) => setError(e.message || 'Tercihler yüklenemedi.')); }, []);
  const set = async (k: string, v: boolean) => { setPrefs((p) => ({ ...(p || {}), [k]: v })); try { const r = await api<any>('/api/nibiru/notify-prefs', { method: 'PUT', body: JSON.stringify({ [k]: v }) }); setPrefs(r.prefs); } catch (e: any) { setError(e.message || 'Kaydedilemedi.'); } };
  const keys = Object.keys(PREF_LABELS).filter((k) => PREF_LABELS[k].roles.includes(String(role)));
  return <div className="nbx-prefs">
    <div className="nbx-prefs-head"><strong>Bildirim tercihlerim</strong><button type="button" onClick={onClose}>Tamam</button></div>
    <p>Nibiru bu durumlarda size ilk mesajı yazar. Telefon bildirimi 22:00–08:00 arasında sabaha kalır; bildirimde ad ya da not yer almaz.</p>
    {error && <div className="nbx-error">{error}</div>}
    {keys.map((k) => <label key={k} className="nbx-pref"><span><b>{PREF_LABELS[k].label}</b><small>{PREF_LABELS[k].hint}</small></span>
      <input type="checkbox" role="switch" checked={prefs ? prefs[k] !== false : true} disabled={!prefs} onChange={(e) => void set(k, e.target.checked)}/></label>)}
  </div>;
}
