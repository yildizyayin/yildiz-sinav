import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

/** 2 Nov load measurement: the student pages must not scan the MEB directory or every result identity. Synthetic data. */
function db() {
  const d = new DatabaseSync(':memory:');
  for (const f of readdirSync(new URL('../migrations/', import.meta.url)).filter((x) => x.endsWith('.sql')).sort()) d.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  return d;
}
const add = (d: DatabaseSync, code: string, city: string, district: string, status = 'ACTIVE') =>
  d.prepare(`INSERT INTO national_institution_directory(meb_code,name,normalized_name,city,district,source_url,status) VALUES(?,?,?,?,?,'https://example.invalid',?)
    ON CONFLICT(meb_code) DO UPDATE SET city=excluded.city,district=excluded.district,status=excluded.status`).run(code, `Okul ${code}`, `OKUL ${code}`, city, district, status);
const loc = (d: DatabaseSync) => d.prepare('SELECT city,district,institution_count n FROM national_institution_locations WHERE institution_count>0 ORDER BY city,district').all();

describe('result page read load', () => {
  it('keeps the il/ilçe summary in step with the directory', () => {
    const d = db();
    add(d, '100001', 'Ankara', 'Çankaya'); add(d, '100002', 'Ankara', 'Çankaya'); add(d, '100003', 'İzmir', 'Konak');
    expect(loc(d)).toEqual([{ city: 'Ankara', district: 'Çankaya', n: 2 }, { city: 'İzmir', district: 'Konak', n: 1 }]);
    add(d, '100002', 'Ankara', 'Keçiören'); // moved by a directory re-import (upsert)
    add(d, '100003', 'İzmir', 'Konak', 'CLOSED');
    d.prepare(`DELETE FROM national_institution_directory WHERE meb_code='100001'`).run();
    expect(loc(d)).toEqual([{ city: 'Ankara', district: 'Keçiören', n: 1 }]);
    d.close();
  });

  it('looks students up through indexes, never scanning every identity', () => {
    const d = db();
    const sql = readFileSync(new URL('../worker/result-network-entry.ts', import.meta.url), 'utf8');
    expect(sql).toContain('FROM national_institution_locations');
    expect(sql).not.toMatch(/SELECT DISTINCT city v FROM national_institution_directory/);
    const lookup = `SELECT rai.id FROM result_access_identities rai JOIN result_network_institutions rni ON rni.id=rai.result_institution_id JOIN exam_administrations ea ON ea.id=rai.administration_id WHERE rni.meb_code=? AND rai.grade_level=? AND rai.student_number_lookup_token=? AND rai.normalized_name=? AND ea.status='PUBLISHED'`;
    const summary = `SELECT ea.exam_id FROM result_access_identities peer JOIN result_network_institutions rni ON rni.id=peer.result_institution_id JOIN exam_administrations ea ON ea.id=peer.administration_id WHERE rni.meb_code=? AND peer.normalized_name=? AND peer.grade_level=? AND ((?<>'' AND peer.student_number_lookup_token=?) OR (?<>'' AND peer.tckn_lookup_token=?)) AND ea.channel='RESULT_NETWORK' AND ea.status='PUBLISHED'`;
    for (const [q, n] of [[lookup, 4], [summary, 7]] as const) {
      const plan = (d.prepare(`EXPLAIN QUERY PLAN ${q}`).all(...Array(n).fill('x')) as any[]).map((r) => r.detail).join(' | ');
      expect(plan).not.toMatch(/SCAN (rai|peer)\b/);
      expect(plan).not.toMatch(/SEARCH (rai|peer) USING INDEX sqlite_autoindex_result_access_identities_2 \(administration_id=\?\)/);
    }
    d.close();
  });
});
