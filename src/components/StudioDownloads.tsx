import { useState } from 'react';
import { Download, KeyRound } from 'lucide-react';

/** A017: booklet PDFs and the separate teacher answer key. Server errors (e.g. an unprintable question) are shown as returned. */
export function studioBooklets(document: any): string[] {
  try { const codes = JSON.parse(document?.config_json || '{}').bookletCodes; return Array.isArray(codes) && codes.length ? codes : ['A']; } catch { return ['A']; }
}

export function StudioDownloads({ document, onError }: { document: any; onError: (message: string) => void }) {
  const [busy, setBusy] = useState('');
  const download = async (key: string, url: string, fileName: string) => {
    setBusy(key); onError('');
    try {
      const response = await fetch(url, { credentials: 'same-origin' });
      if (!response.ok) { const body: any = await response.json().catch(() => null); throw new Error(body?.error?.message || 'PDF indirilemedi.'); }
      const blob = await response.blob(); const href = URL.createObjectURL(blob);
      const a = window.document.createElement('a'); a.href = href; a.download = fileName; a.click(); URL.revokeObjectURL(href);
    } catch (e: any) { onError(e.message || 'PDF indirilemedi.'); } finally { setBusy(''); }
  };
  const id = encodeURIComponent(document.id), name = String(document.title || 'sinav');
  return <span className="studio-downloads" style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
    {studioBooklets(document).map(code => <button type="button" key={code} disabled={!!busy} onClick={() => void download(code, `/api/platform/studio/${id}/pdf?booklet=${encodeURIComponent(code)}`, `${name}-${code}.pdf`)}><Download size={14} /> {busy === code ? 'Hazırlanıyor…' : `Kitapçık ${code}`}</button>)}
    <button type="button" disabled={!!busy} onClick={() => void download('KEY', `/api/platform/studio/${id}/answer-key`, `${name}-cevap-anahtari.pdf`)}><KeyRound size={14} /> {busy === 'KEY' ? 'Hazırlanıyor…' : 'Cevap anahtarı'}</button>
  </span>;
}
