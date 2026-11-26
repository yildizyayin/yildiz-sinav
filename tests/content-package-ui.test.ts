// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { fileIndex, mediaPaths, outcomeFromJson, packageName, requestBody } from '../src/lib/contentPackage';

/** İçerik Paketi in the browser: the package folder is read as is; only missing files are sent; the run commits each outcome. */
const calls: Array<[string, any]> = [];
let held = false;
vi.mock('../src/api', () => ({
  api: async (url: string, init: any) => {
    calls.push([url, init]);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    if (url.includes('/media/')) return { ok: true, stored: true };
    const code = body?.outcome?.code;
    if (held && code === 'FB.5.7.1') return { ok: true, outcome: null, outcomeError: 'FB.5.7.1 yok', errors: [], topic: { status: 'NONE' }, summary: { total: 1, ready: 0, needsMedia: 0, exists: 0, duplicate: 0, held: 1, invalid: 0 }, need: [], items: [] };
    const done = url.endsWith('/commit');
    return { ok: true, outcome: { code, title: 'Güneş' }, errors: [], topic: { status: done ? 'EXISTS' : 'NEEDS_MEDIA' }, summary: { total: 2, ready: done ? 0 : 0, needsMedia: done ? 0 : 2, exists: done ? 2 : 0, duplicate: 0, held: 0, invalid: 0 }, need: done ? [] : [{ kind: 'VIDEO', sha256: 'b'.repeat(64), bytes: 3 }, { kind: 'TOPIC', sha256: 'c'.repeat(64), bytes: 3 }], items: [], created: done ? 2 : undefined };
  },
}));
import { ContentPackageImport } from '../src/components/ContentPackageImport';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const roots: any[] = [];
afterEach(async () => { for (const r of roots.splice(0)) await act(async () => r.unmount()); document.body.innerHTML = ''; calls.length = 0; held = false; });

const sorular = (kod: string, short: string) => JSON.stringify({
  kazanim: { kod, konu_anlatimi: { dosya: `Kazanimlar/${short}/Konu_Anlatimi.mp4`, bayt: 3, sha256: 'C'.repeat(64) }, sure_saniye: 196.9 },
  sorular: [1, 2].map((n) => ({ id: `${short}-0${n}`, kazanim: kod, kaynak_etiketi: `ANUNEX · 5. Sınıf Fen · ${short}-0${n}`, soru: `Soru ${n}?`, secenekler: { A: 'a', B: 'b', C: 'c', D: 'd' }, dogru_cevap: 'B', yazili_cozum: 'Çünkü b.', ipucu: 'İpucu', zorluk: 2,
    cozum_videosu: { dosya: `Kazanimlar/${short}/Cozumler/${short}-0${n}.mp4`, bayt: 3, sha256: n === 1 ? 'b'.repeat(64) : 'd'.repeat(64) },
    gorsel: n === 2 ? { dosya: `Kazanimlar/${short}/Gorseller/${short}-02.jpg`, bayt: 4, sha256: 'e'.repeat(64) } : null, gorsel_aciklamasi: n === 2 ? 'Şema' : null })),
});

it('reads a package Sorular.json without guessing', () => {
  const o = outcomeFromJson(sorular('FB.5.1.1', 'FB511'));
  expect(o).toMatchObject({ code: 'FB.5.1.1', grade: 5, sourceLabel: 'ANUNEX · 5. Sınıf Fen', topic: { sha256: 'c'.repeat(64), seconds: 196.9 } });
  expect(o.questions[1]).toMatchObject({ id: 'FB511-02', answer: 'B', hint: 'İpucu', difficulty: 2, image: { alt: 'Şema', path: 'Kazanimlar/FB511/Gorseller/FB511-02.jpg' } });
  expect(packageName(o)).toBe('fb-5');
  const b = requestBody(o, 'fen-5', 'OWNED');
  expect(b.questions[0].video).toEqual({ sha256: 'b'.repeat(64), bytes: 3 });            // paths never leave the browser
  expect(JSON.stringify(b)).not.toContain('Kazanimlar/');
  expect(mediaPaths(o).get('e'.repeat(64))).toBe('Kazanimlar/FB511/Gorseller/FB511-02.jpg');
  expect([...fileIndex([{ name: 'x.mp4', webkitRelativePath: 'Paket_01/Kazanimlar/FB511/Cozumler/FB511-01.mp4' }]).keys()]).toEqual(['Kazanimlar/FB511/Cozumler/FB511-01.mp4']);
  expect(() => outcomeFromJson('{"rows":[]}')).toThrow();
});

it('previews, uploads only what is missing and commits each outcome; a held outcome is skipped', async () => {
  held = true;
  const done = vi.fn();
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(ContentPackageImport, { onDone: done })));
  const mk = (path: string, text = 'x') => { const f = new File([text], path.split('/').pop()!); Object.defineProperty(f, 'webkitRelativePath', { value: `Paket/${path}` }); return f; };
  const files = [mk('Kazanimlar/FB511/Sorular.json', sorular('FB.5.1.1', 'FB511')), mk('Kazanimlar/FB571/Sorular.json', sorular('FB.5.7.1', 'FB571')),
    mk('Kazanimlar/FB511/Cozumler/FB511-01.mp4'), mk('Kazanimlar/FB511/Konu_Anlatimi.mp4')];
  const input = node.querySelector('input[type=file]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: files });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
  expect(node.textContent).toContain('2 kazanım · 4 soru · 2 görsel · 6 video');
  const btn = (t: string) => [...node.querySelectorAll('button')].find((b) => b.textContent?.includes(t)) as HTMLButtonElement;
  expect(btn('Ön raporu hazırla').disabled).toBe(true);                                    // rights first
  const sel = node.querySelector('select') as HTMLSelectElement;
  await act(async () => { const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!; set.call(sel, 'OWNED'); sel.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => { btn('Ön raporu hazırla').click(); await new Promise((r) => setTimeout(r, 0)); });
  expect(node.textContent).toContain('FB.5.7.1 yok');
  await act(async () => { btn('Dosyaları yükle').click(); await new Promise((r) => setTimeout(r, 0)); });
  const puts = calls.filter(([u]) => u.includes('/media/'));
  expect(puts.map(([u, i]) => [u.split('/').pop(), i.headers['Content-Type']])).toEqual([['b'.repeat(64), 'video/mp4'], ['c'.repeat(64), 'video/mp4']]);
  const commits = calls.filter(([u]) => u.endsWith('/commit')).map(([, i]) => JSON.parse(i.body));
  expect(commits.map((c) => [c.outcome.code, c.confirm, c.copyrightStatus])).toEqual([['FB.5.1.1', true, 'OWNED']]);
  expect(done).toHaveBeenCalledWith(expect.stringContaining('2 soru incelemeye alındı; 2 dosya yüklendi'));
});
