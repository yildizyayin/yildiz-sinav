import { it, expect } from 'vitest';
import { collectAccessCodePages } from '../src/lib/access-code-pages';
it('retains committed page codes when a subsequent request fails', async () => {
  const result = await collectAccessCodePages(async cursor => {
    if (cursor) throw Error('second page unavailable');
    return { codes: [{ accessCode: 'synthetic' }], nextCursor: 'p079' };
  });
  expect(result.codes).toEqual([{ accessCode: 'synthetic' }]);
  expect(result.error?.message).toBe('second page unavailable');
});
it('collects successful pages and stops repeated continuation cursors', async () => {
  expect((await collectAccessCodePages(async cursor => ({ codes: [cursor || 'first'], nextCursor: cursor ? null : 'second' }))).codes).toEqual(['first', 'second']);
  const repeated = await collectAccessCodePages(async () => ({ codes: ['saved'], nextCursor: 'same' }));
  expect(repeated.codes).toHaveLength(2);expect(repeated.error).not.toBeNull();
});
