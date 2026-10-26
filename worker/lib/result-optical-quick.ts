import type { Env } from '../types';
import { getAuthUser } from './auth';
import { json } from './db';

/**
 * S030: "Optik ekle" on sonuc.anunex.com. The Super Admin gives a name, the FMT file and the TXT/DAT file to evaluate;
 * the optic is created, read from the FMT, tested against that very TXT and, when the test passes, published at once.
 * Each step runs through the same optical administration API as the app, with the same checks and audit.
 */
export async function quickOptical(request: Request, env: Env): Promise<Response> {
  const user = await getAuthUser(env, request);
  if (!user) return json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Oturum açmanız gerekiyor.' } }, 401);
  if (user.role !== 'SUPER_ADMIN') return json({ ok: false, error: { code: 'FORBIDDEN', message: 'Yeni optiği Süper Admin ekler. Optiğin FMT dosyasını ANUNEX yönetimine iletin.' } }, 403);
  const form = await request.formData().catch(() => null);
  const name = String(form?.get('name') || '').trim(), vendor = String(form?.get('vendor') || '').trim() || name;
  const fmt = form?.get('fmt'), sample = form?.get('sample');
  if (!name) return json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Optik adını yazın (ör. "4K Yayınları TYT").' } }, 400);
  if (!(fmt instanceof File)) return json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Optiğin FMT dosyasını seçin.' } }, 400);
  if (!(sample instanceof File)) return json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Optiği denemek için değerlendireceğiniz TXT/DAT dosyasını da seçin.' } }, 400);
  const { default: optical } = await import('../optical-admin-entry');
  const origin = new URL(request.url).origin;
  const headers = (extra: Record<string, string> = {}) => ({ Cookie: request.headers.get('Cookie') || '', Origin: origin, ...extra });
  const call = async (path: string, init: RequestInit) => {
    const r = await optical.fetch(new Request(`${origin}${path}`, init), env);
    const data: any = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  };
  const code = `${name}`.toLocaleUpperCase('tr-TR').replace(/[^A-Z0-9ÇĞİÖŞÜ]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'OPTIK';
  const created = await call('/api/optical-definitions', { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ name, vendor, opticalCode: code, version: 'v1', formType: 'FMT' }) });
  if (!created.ok) return json({ ok: false, error: { code: created.data?.error?.code || 'OPTICAL_CREATE_FAILED', message: created.data?.error?.message || 'Optik oluşturulamadı.' } }, created.status);
  const versionId = created.data.versionId as string;
  const fd = new FormData(); fd.set('file', fmt, fmt.name || 'optik.fmt');
  const imported = await call(`/api/optical-definition-versions/${versionId}/fmt`, { method: 'POST', headers: headers(), body: fd });
  if (!imported.ok) return json({ ok: false, step: 'FMT', versionId, error: { code: imported.data?.error?.code || 'INVALID_FMT', message: `FMT okunamadı: ${imported.data?.error?.message || 'dosya tanınmadı'}. Optik taslak olarak Optikler sayfasında duruyor.` } }, 422);
  const tested = await call(`/api/optical-definition-versions/${versionId}/test-parser`, { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ sampleText: await sample.text(), fileName: sample.name || 'veri.txt' }) });
  if (!tested.ok || !tested.data?.passed) return json({ ok: false, step: 'TEST', versionId, issues: tested.data?.issues || [], error: { code: 'OPTICAL_TEST_FAILED', message: `FMT bu TXT dosyasını okuyamadı${tested.data?.issues?.length ? `: ${tested.data.issues.slice(0, 3).join(' · ')}` : ''}. Doğru FMT ile tekrar deneyin; optik taslak olarak Optikler sayfasında duruyor.` } }, 422);
  const published = await call(`/api/optical-definition-versions/${versionId}/publish`, { method: 'POST', headers: headers() });
  if (!published.ok) return json({ ok: false, step: 'PUBLISH', versionId, error: { code: published.data?.error?.code || 'OPTICAL_PUBLISH_FAILED', message: published.data?.error?.message || 'Optik yayına alınamadı.' } }, 422);
  return json({ ok: true, optical: { id: versionId, name, version: 'v1' }, recordCount: tested.data.recordCount, sample: (tested.data.sample || []).slice(0, 3).map((r: any) => ({ name: r.name, booklet: r.booklet })) }, 201);
}
