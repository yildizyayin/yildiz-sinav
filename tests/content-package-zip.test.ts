// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { BlobReader, BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';

/** İçerik Paketi: the package ZIPs can be chosen as they are — no unzipping, no folder dialog. */
const calls: Array<[string, any]> = [];
vi.mock('../src/api', () => ({
  api: async (url: string, init: any) => {
    calls.push([url, init]);
    if (url.includes('/media/')) return { ok: true, stored: true };
    const body = JSON.parse(init.body), done = url.endsWith('/commit');
    return { ok: true, outcome: { code: body.outcome.code, title: 'Güneş' }, errors: [], topic: { status: done ? 'EXISTS' : 'NONE' }, summary: { total: 1, ready: 0, needsMedia: done ? 0 : 1, exists: done ? 1 : 0, duplicate: 0, held: 0, invalid: 0 }, need: done ? [] : [{ kind: 'VIDEO', sha256: 'b'.repeat(64), bytes: 9 }], items: [], created: done ? 1 : undefined };
  },
}));
import { ContentPackageImport } from '../src/components/ContentPackageImport';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const roots: any[] = [];
afterEach(async () => { for (const r of roots.splice(0)) await act(async () => r.unmount()); document.body.innerHTML = ''; calls.length = 0; });

const sorular = JSON.stringify({ kazanim: { kod: 'FB.5.1.1', konu_anlatimi: null }, sorular: [{ id: 'FB511-01', kazanim: 'FB.5.1.1', kaynak_etiketi: 'ANUNEX · 5. Sınıf Fen · FB511-01', soru: 'Soru?', secenekler: { A: 'a', B: 'b', C: 'c', D: 'd' }, dogru_cevap: 'B', yazili_cozum: 'Çünkü.', zorluk: 1, cozum_videosu: { dosya: 'Kazanimlar/FB511/Cozumler/FB511-01.mp4', bayt: 9, sha256: 'b'.repeat(64) }, gorsel: null }] });
const until = async (ok: () => boolean) => { for (let i = 0; i < 100 && !ok(); i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)); }); };

it('reads the package ZIP in place and sends the solution video straight out of it', async () => {
  const w = new ZipWriter(new BlobWriter('application/zip'));
  await w.add('ANUNEX_Parca_01/Kazanimlar/FB511/Sorular.json', new TextReader(sorular));
  await w.add('ANUNEX_Parca_01/Kazanimlar/FB511/Cozumler/FB511-01.mp4', new BlobReader(new Blob(['mp4-bytes'])));
  const zip = new File([await w.close()], 'ANUNEX_Parca_01.zip', { type: 'application/zip' });
  const done = vi.fn();
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(ContentPackageImport, { onDone: done })));
  const input = node.querySelector('input[accept*="zip"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [zip] });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  await until(() => !!node.textContent?.includes('1 kazanım · 1 soru'));
  expect(node.textContent).toContain('1 kazanım · 1 soru · 0 görsel · 1 video');
  const sel = node.querySelector('select') as HTMLSelectElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sel, 'OWNED'); sel.dispatchEvent(new Event('change', { bubbles: true })); });
  const btn = (t: string) => [...node.querySelectorAll('button')].find((b) => b.textContent?.includes(t)) as HTMLButtonElement;
  await act(async () => { btn('Ön raporu hazırla').click(); });
  await until(() => !btn('Dosyaları yükle').disabled);
  await act(async () => { btn('Dosyaları yükle').click(); });
  await until(() => done.mock.calls.length > 0);
  const put = calls.find(([u]) => u.includes('/media/'))!;
  expect(put[1].headers['Content-Type']).toBe('video/mp4');
  expect(await (put[1].body as Blob).text()).toBe('mp4-bytes');
  expect(done).toHaveBeenCalledWith(expect.stringContaining('1 soru incelemeye alındı; 1 dosya yüklendi'));
});
