import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

/** 0160: levels for the built-in Sekonic optics; the empty draft is archived only while it is empty. Synthetic rows. */
const dir = new URL('../migrations/', import.meta.url), FIX = '0160_optic_levels_and_stale_draft.sql', DRAFT = 'opt_729f50c4-bd8f-49cc-8e9f-af809f4bc618';
describe('0160 optic levels and stale draft', () => {
  it('sets the levels and archives the empty draft once', () => {
    const d = new DatabaseSync(':memory:');
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql') && f < FIX).sort()) d.exec(readFileSync(new URL(f, dir), 'utf8'));
    d.prepare(`INSERT INTO optical_templates(id,name,vendor,form_type,sort_order,status,active,owner_type) VALUES(?,?,?,?,?,?,?,?)`).run(DRAFT, 'optik 7108', 'anunex', 'FMT', 1, 'NEEDS_DEFINITION', 1, 'CENTRAL');
    const sql = readFileSync(new URL(FIX, dir), 'utf8'); d.exec(sql); d.exec(sql);
    expect(d.prepare(`SELECT id,education_level l FROM optical_templates WHERE id IN ('optik-129-sekonic','optik-7108-sekonic') ORDER BY id`).all()).toEqual([{ id: 'optik-129-sekonic', l: 'LISE' }, { id: 'optik-7108-sekonic', l: 'ORTAOKUL' }]);
    expect(d.prepare('SELECT status,active FROM optical_templates WHERE id=?').get(DRAFT)).toEqual({ status: 'ARCHIVED', active: 0 });
    expect((d.prepare(`SELECT count(*) n FROM audit_logs WHERE id='aud_mig0160_optik7108'`).get() as any).n).toBe(1);
    d.close();
  });
});
