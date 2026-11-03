import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { scoringChoices, scoringRuleCodesFor } from '../worker/lib/scoring-choices';
import { calculateExamScore, scoreMethodFor } from '../worker/lib/scoring';

/** Owner (3 Nov): every exam gives a net and a puan; the list offers only puan-producing profiles of the exam's type. */
function versions() {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync(new URL('../migrations/', import.meta.url)).filter((f) => f.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  return db.prepare(`SELECT srv.id,srv.config_json,sr.code rule_code,sr.name rule_name FROM scoring_rule_versions srv JOIN scoring_rules sr ON sr.id=srv.rule_id WHERE srv.verified=1 AND srv.academic_year='2026-2027'`).all() as any[];
}
describe('scoring profiles: net and puan', () => {
  const all = versions();
  const codes = (examType: string, gradeLevel: number, current?: string) => scoringChoices(all, { examType, gradeLevel }, current).map((v) => v.rule_code);
  it('offers only puan-producing profiles of the exam type, the default first', () => {
    expect(codes('STANDARD', 7)).toEqual(['ANUNEX_LGS_TYPE', 'SCHOOL_100', 'CUSTOM_EXAM']);
    expect(codes('LGS', 8)).toEqual(['MEB_LGS', 'CUSTOM_EXAM']);
    expect(codes('TYT', 12)).toEqual(['OSYM_TYT', 'CUSTOM_EXAM']);
    expect(codes('STANDARD', 10)).toEqual(['SCHOOL_100', 'CUSTOM_EXAM']);
    for (const [t, g] of [['STANDARD', 7], ['LGS', 8], ['TYT', 12], ['AYT', 12], ['TYT_AYT', 12]] as const) expect(codes(t, g).some((c) => /PRACTICE|STANDARD_NET|COMPOSITE/.test(c))).toBe(false);
    expect(scoringRuleCodesFor({ examType: 'MIDDLE_COMPOSITE', gradeLevel: 6 })[0]).toBe('ANUNEX_LGS_TYPE');
  });
  it('keeps an exam\'s current net-only profile visible until it is changed', () => {
    const tytNet = all.find((v) => v.rule_code === 'ANUNEX_TYT_PRACTICE')!;
    expect(codes('TYT', 12, tytNet.id)[0]).toBe('ANUNEX_TYT_PRACTICE');
  });
  it('the 5–7 LGS-type profile gives a 100–500 puan with LGS weights', () => {
    const v = all.find((x) => x.rule_code === 'ANUNEX_LGS_TYPE')!;
    const method = scoreMethodFor(JSON.parse(v.config_json));
    expect(method).toBe('LGS_ESTIMATE');
    const full = [['TUR', 20], ['MAT', 20], ['FEN', 20], ['SOS', 10], ['DIN', 10], ['YAB', 10]].map(([code, q]) => ({ code: String(code), questionCount: Number(q), net: Number(q) }));
    expect(calculateExamScore(method, full)).toBe(500);
    expect(calculateExamScore(method, full.map((s) => ({ ...s, net: 0 })))).toBe(100);
  });
});
