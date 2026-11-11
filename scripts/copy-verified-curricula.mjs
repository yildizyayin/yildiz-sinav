// Tanıtım ortamı: turns the JSON output of three read-only SELECTs on production (subjects, the verified 2027–2028
// curriculum versions and their outcomes — public MEB programs, no personal data) into INSERT OR IGNORE statements.
// Usage: node scripts/copy-verified-curricula.mjs subjects.json versions.json outcomes.json > tmp/curricula.sql
import { readFileSync } from 'node:fs';

const rows = (file) => { const data = JSON.parse(readFileSync(file, 'utf8')); return (Array.isArray(data) ? data : [data]).flatMap((r) => r.results || []); };
const lit = (v) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replaceAll("'", "''")}'`);
const [subjects, versions, outcomes] = process.argv.slice(2).map(rows);
if (!versions?.length || !outcomes?.length) { console.error('No verified curricula found; nothing to copy.'); process.exit(1); }
const out = ['PRAGMA foreign_keys = OFF;'];
for (const [table, list] of [['subjects', subjects], ['curriculum_versions', versions], ['outcomes', outcomes]]) {
  for (const r of list) { const cols = Object.keys(r); out.push(`INSERT OR IGNORE INTO ${table} (${cols.join(',')}) VALUES (${cols.map((c) => lit(r[c])).join(',')});`); }
}
out.push('PRAGMA foreign_keys = ON;');
process.stdout.write(`${out.join('\n')}\n`);
console.error(`Copied ${subjects.length} subjects, ${versions.length} curriculum versions, ${outcomes.length} outcomes.`);
