import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

/** 0159: one named exam moves to the LGS-type profile only while it has no evaluated student. Synthetic rows. */
const dir = new URL('../migrations/', import.meta.url), FIX = '0159_fenomen7_lgs_type_scoring.sql', ID = 'exam_888040b1-f4d4-4523-960b-4b8ce3b67f4d';
function db() { const d = new DatabaseSync(':memory:'); for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql') && f < FIX).sort()) d.exec(readFileSync(new URL(f, dir), 'utf8')); return d; }
describe('0159 Fenomen 7 scoring profile', () => {
  it('changes the profile of the empty exam once, with an audit row', () => {
    const d = db();
    d.prepare(`INSERT INTO exams(id,owner_type,academic_year,title,exam_type,grade_level,status,scoring_rule_version_id) VALUES(?,?,?,?,?,?,?,?)`).run(ID, 'CENTRAL', '2026-2027', 'Sentetik', 'STANDARD', 7, 'ACTIVE', 'srv_meb_lgs_2627');
    const sql = readFileSync(new URL(FIX, dir), 'utf8'); d.exec(sql); d.exec(sql);
    expect(d.prepare('SELECT scoring_rule_version_id s FROM exams WHERE id=?').get(ID)).toEqual({ s: 'srv_anunex_lgs_type_2627' });
    expect((d.prepare(`SELECT count(*) n FROM audit_logs WHERE id='aud_mig0159_fenomen7'`).get() as any).n).toBe(1);
    d.close();
  });
  it('leaves the exam alone once students are evaluated', () => {
    const d = db();
    d.exec(`INSERT INTO institutions(id,name,code,status) VALUES('i','Sentetik Okul','SNT','ACTIVE');`);
    d.prepare(`INSERT INTO exams(id,owner_type,academic_year,title,exam_type,grade_level,status,scoring_rule_version_id) VALUES(?,?,?,?,?,?,?,?)`).run(ID, 'CENTRAL', '2026-2027', 'Sentetik', 'STANDARD', 7, 'ACTIVE', 'srv_meb_lgs_2627');
    d.prepare(`INSERT INTO exam_participants(id,exam_id,institution_id,name_snapshot,participant_status) VALUES('p',?,'i','X','GUEST')`).run(ID);
    d.exec(readFileSync(new URL(FIX, dir), 'utf8'));
    expect(d.prepare('SELECT scoring_rule_version_id s FROM exams WHERE id=?').get(ID)).toEqual({ s: 'srv_meb_lgs_2627' });
    d.close();
  });
});
