import { describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('demo seed idempotency policy',()=>{
 it('sanitizer converts destructive replace inserts to ignore inserts',()=>{
  const source=readFileSync('scripts/make-demo-seeds-idempotent.mjs','utf8');
  expect(source).toContain("replaceAll('INSERT OR REPLACE INTO','INSERT OR IGNORE INTO')");
  expect(source).toContain('demo-standard-fixture.idempotent.sql');
 });
});
