import { expect, it } from 'vitest';
import { ROOMS, roomFor, roomProblems } from '../src/components/universe/escapeRooms';
import { nibiState } from '../src/components/universe/BabyNibi';

/** Kaçış Odası and Bebek Nibi (owner, 26 Nov 2026): individual games; the same play behaves the same way every time. */
it('every room has three objects and a door order that is a real puzzle', () => {
  for (const r of ROOMS) { expect(roomProblems(r), r.id).toEqual([]); expect(r.ending.length, r.id).toBeGreaterThan(40); }
  expect(new Set(ROOMS.map((r) => r.id)).size).toBe(ROOMS.length);
  expect(roomProblems({ ...ROOMS[0], sign: ROOMS[0].objects.map((o) => o.id) })).toHaveLength(1);
  expect(roomProblems({ ...ROOMS[0], sign: ['tank', 'tank', 'map'] })).toHaveLength(1);
});

it('gives the same play the same room and digits, and spreads plays over the rooms', () => {
  const a = roomFor('abc'), b = roomFor('abc');
  expect(a).toEqual(b);
  for (const d of Object.values(a.digits)) { expect(d).toBeGreaterThanOrEqual(1); expect(d).toBeLessThanOrEqual(9); }
  expect(new Set(Array.from({ length: 40 }, (_, k) => roomFor(`session-${k}`).room.id)).size).toBe(ROOMS.length);
});

it('Bebek Nibi grows with the student’s own correct answers and asks for due reviews', () => {
  expect(nibiState(0, 0, 0).stage.key).toBe('egg');
  expect(nibiState(1, 0, 0).stage.key).toBe('baby');
  expect(nibiState(9, 0, 0).toNext).toBe(1);
  expect(nibiState(10, 0, 0).stage.key).toBe('small');
  expect(nibiState(30, 0, 0)).toMatchObject({ stage: { key: 'grown' }, toNext: null });
  expect(nibiState(5, 2, 1).mood).toBe('hungry');
  expect(nibiState(5, 0, 1).mood).toBe('happy');
  expect(nibiState(5, 0, 0).mood).toBe('sleepy');
  expect(nibiState(-3, 0, 0).correct).toBe(0);
});
