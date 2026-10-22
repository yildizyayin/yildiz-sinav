/**
 * A084: hands-free serial reading. The camera reads a frame automatically once the sheet has been held
 * still for a few frames with all corner markers found; then it waits until the sheet is taken away before
 * it can fire again, so one sheet is never read twice in a row.
 */
export type FrameSample = { confidence: number; markers: Array<{ x: number; y: number }>; width: number; height: number };
export type GateState = { armed: boolean; history: FrameSample[] };
export const GATE_START: GateState = { armed: true, history: [] };

const OPTIONS = { frames: 3, minConfidence: 0.7, maxMove: 0.015, releaseBelow: 0.35 };

function corners(s: FrameSample) {
  // the four largest-to-outer markers, ordered by angle around their centre, in page-relative units
  const pts = s.markers.slice(0, 4).map((m) => ({ x: m.x / s.width, y: m.y / s.height }));
  const cx = pts.reduce((a, p) => a + p.x, 0) / (pts.length || 1), cy = pts.reduce((a, p) => a + p.y, 0) / (pts.length || 1);
  return pts.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
}

export function stableEnough(history: FrameSample[], o = OPTIONS): boolean {
  if (history.length < o.frames) return false;
  const last = history.slice(-o.frames);
  if (last.some((s) => s.confidence < o.minConfidence || s.markers.length < 4)) return false;
  for (let i = 1; i < last.length; i++) {
    const a = corners(last[i - 1]), b = corners(last[i]);
    if (a.some((p, k) => Math.hypot(p.x - b[k].x, p.y - b[k].y) > o.maxMove)) return false;
  }
  return true;
}

/** Feed one sample; `fire` is true exactly once per sheet held still. */
export function nextGate(state: GateState, sample: FrameSample, o = OPTIONS): { state: GateState; fire: boolean } {
  const history = [...state.history, sample].slice(-o.frames);
  if (!state.armed) return { state: { armed: sample.confidence < o.releaseBelow, history: [] }, fire: false };
  if (stableEnough(history, o)) return { state: { armed: false, history: [] }, fire: true };
  return { state: { armed: true, history }, fire: false };
}
