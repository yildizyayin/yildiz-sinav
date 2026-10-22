import { describe, expect, it } from 'vitest';
import { GATE_START, nextGate, stableEnough, type FrameSample } from '../src/lib/autoCapture';

const sheet = (dx = 0, confidence = 0.9): FrameSample => ({ confidence, width: 1000, height: 1400, markers: [{ x: 100 + dx, y: 100 }, { x: 900 + dx, y: 100 }, { x: 100 + dx, y: 1300 }, { x: 900 + dx, y: 1300 }] });
const run = (frames: FrameSample[]) => { let s = GATE_START; const fired: number[] = []; frames.forEach((f, i) => { const r = nextGate(s, f); s = r.state; if (r.fire) fired.push(i); }); return fired; };

describe('A084: automatic capture', () => {
  it('fires once the sheet is held still for three frames', () => {
    expect(stableEnough([sheet(), sheet(2), sheet(4)])).toBe(true);
    expect(run([sheet(), sheet(1), sheet(2)])).toEqual([2]);
  });
  it('does not fire while the sheet moves, with a marker missing or with low confidence', () => {
    expect(run([sheet(0), sheet(40), sheet(80), sheet(120)])).toEqual([]);
    expect(run([sheet(), { ...sheet(), markers: sheet().markers.slice(0, 3) }, sheet()])).toEqual([]);
    expect(run([sheet(0, 0.5), sheet(0, 0.5), sheet(0, 0.5)])).toEqual([]);
  });
  it('reads one sheet once: fires again only after the sheet was taken away', () => {
    const still = [sheet(), sheet(), sheet()];
    expect(run([...still, ...still, ...still])).toEqual([2]);
    expect(run([...still, sheet(0, 0.1), ...still])).toEqual([2, 6]);
  });
});
