import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { packToItems } from '../src/components/universe/ContentPack';
import { dueAfterDays, reviewOrder } from '../worker/lib/learning-universe/spacing';

/** Tazelik motoru (owner, 25 Nov 2026): monthly packs tied to outcomes by code, saved for approval; spaced repeats. Synthetic data only. */
const pack = (code: string) => ({ paket: 'Sentetik paket', hak: 'OWNED', etkinlikler: [
  { kazanim: code, sinif: 8, tur: 'PAIRS', baslik: 'Kuvvetler', ciftler: ['2³ = 8', '3² = 9'] },
  { kazanim: code, sinif: 8, tur: 'SEQUENCE', yonerge: 'Sırala', sira: ['Üssü yaz', 'Çarp', 'Sonucu yaz'] },
  { kazanim: code, tur: 'CLOZE', metin: '2³ = [8]' },
  { kazanim: code, tur: 'STEPS', problem: '3 kalem 12 TL ise 5 kalem?', adimlar: ['1 kalem = 4', '5 kalem = 20'] },
  { kazanim: 'YOK.9.9.9', tur: 'PAIRS', ciftler: ['a = b', 'c = d'] },
  { kazanim: code, tur: 'PAIRS', ciftler: ['tek satır yanlış'] },
  { kazanim: code, tur: 'OYUN' }] });

it('turns a plain Turkish pack into server items and reports the rows it cannot build', () => {
  const { items, errors } = packToItems(pack('M.8.1.1'));
  expect(items.map((x) => x.contentKind)).toEqual(['PAIRS', 'SEQUENCE', 'CLOZE', 'STEPS', 'PAIRS']);
  expect(items[0]).toMatchObject({ row: 1, outcomeCode: 'M.8.1.1', gradeLevel: 8, title: 'Kuvvetler', copyrightStatus: 'OWNED' });
  expect(errors.map((e) => e.row)).toEqual([6, 7]);
});

it('saves a pack for approval, tied to verified outcomes by code, and skips what is already there', async () => {
  const t = await evaluatedExam('direct', { outcomes: true });
  try {
    t.db.exec(`UPDATE platform_features SET enabled_default=1 WHERE feature_key='LEARNING_UNIVERSE'`);
    const o = t.db.prepare(`SELECT o.id FROM outcomes o WHERE o.code='M.8.1.1'`).get() as any;
    const { items } = packToItems(pack('M.8.1.1'));
    const r = await t.request('/api/reporting/universe/contents/bulk', 'POST', { name: 'Sentetik paket', items }, 'admin');
    expect(r.response.status, r.text).toBe(201);
    expect(r.data).toMatchObject({ created: 4, skipped: 0, failed: 1 });
    expect(r.data.results[4]).toMatchObject({ ok: false });
    expect(r.data.results[4].message).toContain('doğrulanmış bir MEB kazanımı bulunamadı');
    const rows = t.db.prepare(`SELECT content_kind,outcome_id,review_status,owner_type,copyright_status FROM lu_game_contents WHERE id IN (${r.data.results.filter((x: any) => x.ok).map(() => '?').join(',')})`).all(...r.data.results.filter((x: any) => x.ok).map((x: any) => x.id)) as any[];
    expect(rows).toHaveLength(4);
    expect(rows.every((x) => x.outcome_id === o.id && x.review_status === 'REVIEW' && x.owner_type === 'PLATFORM' && x.copyright_status === 'OWNED')).toBe(true);
    // the same pack again: nothing doubles
    expect((await t.request('/api/reporting/universe/contents/bulk', 'POST', { items }, 'admin')).data).toMatchObject({ created: 0, skipped: 4 });
    // a teacher's pack belongs to the school; a student cannot send one; empty and oversized packs are refused
    expect((await t.request('/api/reporting/universe/contents/bulk', 'POST', { items: [items[2]] }, 'teacher')).data).toMatchObject({ created: 1 });
    expect((await t.request('/api/reporting/universe/contents/bulk', 'POST', { items }, 'stuuser')).response.status).toBe(403);
    expect((await t.request('/api/reporting/universe/contents/bulk', 'POST', { items: [] }, 'admin')).response.status).toBe(400);
    expect((await t.request('/api/reporting/universe/contents/bulk', 'POST', { items: Array(201).fill(items[0]) }, 'admin')).response.status).toBe(400);
    // nothing from a pack is played before a person approves it
    const s = await t.request('/api/student-standard/universe/sessions', 'POST', { templateCode: 'LU_ORDER', outcomeId: o.id, itemCount: 1 }, 'stuuser');
    expect(s.response.status).not.toBe(201);
  } finally { t.db.close(); }
});

it('brings a mistake back after 1, 3 and 7 days, before anything answered right', () => {
  const now = Date.parse('2026-11-25T12:00:00Z'), day = 864e5;
  expect([1, 2, 3, 4].map(dueAfterDays)).toEqual([1, 3, 7, 7]);
  const hist = new Map([
    ['right-old', { lastCorrect: true, lastAt: now - 30 * day, wrongRun: 0 }],
    ['wrong-due', { lastCorrect: false, lastAt: now - 2 * day, wrongRun: 1 }],
    ['wrong-twice-not-due', { lastCorrect: false, lastAt: now - 2 * day, wrongRun: 2 }],
    ['right-new', { lastCorrect: true, lastAt: now - 1 * day, wrongRun: 0 }],
  ]);
  const order = reviewOrder(['right-new', 'right-old', 'wrong-twice-not-due', 'elsewhere', 'wrong-due'].map((id) => ({ id })), hist, now).map((x) => x.id);
  expect(order).toEqual(['wrong-due', 'elsewhere', 'wrong-twice-not-due', 'right-old', 'right-new']);
});
