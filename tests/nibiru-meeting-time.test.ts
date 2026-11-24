import { expect, it } from 'vitest';
import { fmtDate } from '../worker/lib/nibiru-companion';

// 24 Nov 2026: a meeting is stored as the counsellor typed it (Istanbul time, no zone); Nibiru must say 17:00, not 20:00.
it('reads a meeting time as Istanbul local time', () => {
  expect(fmtDate('2026-11-24T17:00')).toMatch(/24 Kasım Salı 17:00/);
  expect(fmtDate('2026-11-24 09:30:00')).toMatch(/09:30/);
  expect(fmtDate('2026-11-24T14:00:00Z')).toMatch(/17:00/);
});
