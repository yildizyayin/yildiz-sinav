import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../migrations/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const FIX = '0156_fix_leftover_2025_seasons.sql';

describe('0156: leftover 2025-2026 seasons of the two Pendik schools', () => {
  it('moves only their lone 2025-2026 season to 2026-2027, once', () => {
    const db = new DatabaseSync(':memory:');
    for (const f of files.filter((f) => f < FIX)) db.exec(readFileSync(new URL(f, dir), 'utf8'));
    db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('p1','Synthetic P1','974884','ACTIVE'),('p2','Synthetic P2','964165','ACTIVE'),('x','Synthetic X','111111','ACTIVE');
      INSERT INTO institution_seasons(id,institution_id,academic_year,status) VALUES('s1','p1','2025-2026','ACTIVE'),('s2a','p2','2025-2026','ACTIVE'),('s2b','p2','2026-2027','ACTIVE'),('s3','x','2025-2026','ACTIVE');`);
    const sql = readFileSync(new URL(FIX, dir), 'utf8');
    db.exec(sql); db.exec(sql);
    const year = (id: string) => (db.prepare('SELECT academic_year y FROM institution_seasons WHERE id=?').get(id) as any).y;
    expect(year('s1')).toBe('2026-2027');
    expect(year('s2a')).toBe('2025-2026'); // already has a 2026-2027 season
    expect(year('s3')).toBe('2025-2026'); // other institutions untouched
    db.close();
  });
});
