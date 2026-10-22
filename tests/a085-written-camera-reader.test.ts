import { describe, expect, it } from 'vitest';
import { buildWrittenLayout, digitPositionsFor, digitValue, pageCode } from '../worker/lib/written-camera-layout';
import { readWrittenPage } from '../src/lib/writtenCameraReader';
import { photographPage } from './helpers/written-sheet-render';

/** A085: the camera answer sheet is read from a slanted synthetic photo: page, student, exact digits, crops. */
const items = [
  { itemId: 'q1', no: 1, points: 40, digitPositions: null, tall: true },
  { itemId: 'q2', no: 2, points: 20, digitPositions: 4, tall: false },
  { itemId: 'q3', no: 3, points: 40, digitPositions: null, tall: true },
  { itemId: 'q4', no: 4, points: 0, digitPositions: null, tall: true },
];
const layout = buildWrittenLayout('paper1', items, 4);

describe('A085: camera answer sheet', () => {
  it('layout: standard markers inside the page, bubbles ≥ 4 mm, page codes, boxes within the content area', () => {
    expect(layout.fiducials.targets.every((c) => c.xMm - 5 >= 5 && c.xMm + 5 <= 205 && c.yMm - 5 >= 5 && c.yMm + 5 <= 292)).toBe(true);
    expect(layout.pages.length).toBe(2);
    expect(layout.pages.map((p) => p.code)).toEqual([pageCode(1), pageCode(2)]);
    for (const p of layout.pages) for (const r of p.regions as any[]) {
      if ('bubbleRadiusMm' in r) expect(r.bubbleRadiusMm * 2).toBeGreaterThanOrEqual(4);
      if (r.purpose === 'answer-box') expect(r.yMm + r.heightMm).toBeLessThanOrEqual(272);
    }
    expect(digitPositionsFor('42')).toBe(4); expect(digitPositionsFor('123456')).toBe(6); expect(digitPositionsFor('3,5')).toBe(null); expect(digitPositionsFor('Ankara')).toBe(null);
    expect(digitValue('__42')).toBe(42); expect(digitValue('4_2_')).toBe(null); expect(digitValue('____')).toBe(null);
  });

  it('reads a slanted photo: page, student number, digit grid exactly, and crops each answer box', () => {
    const img = photographPage(layout, 1, { student: '0101', digits: { q2: '__42' }, ink: ['q1'] });
    const r = readWrittenPage(img, layout);
    expect(r.issues).toEqual([]);
    expect(r).toMatchObject({ ok: true, pageNo: 1, studentNumber: '0101' });
    expect(r.digits.q2.read).toBe('__42');
    expect(r.crops.map((c) => c.itemId)).toEqual(['q1', 'q2']);
    // the crop is the flat answer box: the pen stroke is in q1, q2's box only has its bubbles
    const darkShare = (c: any) => { let n = 0; for (let i = 0; i < c.data.length; i += 4) if (c.data[i] < 100) n++; return n / (c.width * c.height); };
    const [q1] = r.crops; expect(q1.width).toBe(900);
    expect(darkShare(q1)).toBeGreaterThan(0.002);
    expect(r.confidence).toBeGreaterThan(0.7);
  });

  it('page 2 is recognised by its printed code; a double mark is never guessed; a missing corner fails closed', () => {
    expect(readWrittenPage(photographPage(layout, 2, { student: '0101' }), layout)).toMatchObject({ pageNo: 2, studentNumber: '0101' });
    const dbl = readWrittenPage(photographPage(layout, 1, { student: '0101', digits: { q2: '__42' } }), layout);
    expect(dbl.digits.q2.read).toBe('__42');
    const both = photographPage(layout, 1, { student: '0101', digits: { q2: '__47' } });
    // add a second mark in the last position (7 and 2 both filled) by overlaying another render
    const two = photographPage(layout, 1, { student: '0101', digits: { q2: '___2' } });
    for (let i = 0; i < both.data.length; i++) (both.data as any)[i] = Math.min((both.data as any)[i], (two.data as any)[i]);
    const r = readWrittenPage(both, layout);
    expect(r.digits.q2.read).toBe('__4?');
    expect(digitValue(r.digits.q2.read)).toBe(null);
    expect(r.digits.q2.issues.join()).toContain('çift');
    // the photo cut off a corner: nothing is read
    const cut = photographPage(layout, 1, { student: '0101' }, { corners: [[90, 70], [1300, 110], [1040, 1390], [60, 1340]], width: 1100 });
    expect(readWrittenPage(cut, layout).ok).toBe(false);
    // an unmarked student number is not guessed
    expect(readWrittenPage(photographPage(layout, 1, {}), layout)).toMatchObject({ ok: false, studentNumber: null });
  });
});
