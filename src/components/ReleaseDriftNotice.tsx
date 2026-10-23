import { useEffect, useState } from 'react';
import { api } from '../api';

/** S006: tells the Super Admin whether sonuc.anunex.com runs the app's release. Read-only; never deploys. */
export function ReleaseDriftNotice() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { api<any>('/api/admin/release-drift').then(setD).catch(() => setD(null)); }, []);
  if (!d) return null;
  const tone = d.status === 'SAME' ? 'success' : d.status === 'DIFFERENT' ? 'error' : 'info';
  return <div className={`alert ${tone}`} role="status">
    <strong>Sonuç portalı sürümü: {d.status === 'SAME' ? 'güncel' : d.status === 'DIFFERENT' ? 'app ile farklı' : 'bilinmiyor'}</strong>
    <p>{d.message} app: <code>{d.app || '—'}</code> · sonuç: <code>{d.result || (d.resultReachable ? '—' : 'erişilemedi')}</code></p>
  </div>;
}
