import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { publishScheduledExamVideos } from '../worker/exam-admin-entry';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE video_links(id TEXT PRIMARY KEY,status TEXT,approved INTEGER,publish_at TEXT,published_at TEXT,updated_at TEXT);
    INSERT INTO video_links VALUES('due','SCHEDULED',0,'2026-09-30T17:00:00.000Z',NULL,NULL);
    INSERT INTO video_links VALUES('future','SCHEDULED',0,'2026-09-30T19:00:00.000Z',NULL,NULL);
    INSERT INTO video_links VALUES('draft','DRAFT',0,'2026-09-30T17:00:00.000Z',NULL,NULL);
    INSERT INTO video_links VALUES('unset','SCHEDULED',0,NULL,NULL,NULL);`);
  const atFixedTime = (sql: string) => sql.replaceAll('CURRENT_TIMESTAMP', "'2026-09-30 18:00:00'");
  const env = { DB: { prepare: (sql: string) => ({ run: async () => db.prepare(atFixedTime(sql)).run() }) } } as any;
  return { db, env, atFixedTime };
}
describe('exam video scheduled publication in SQLite', () => {
  it('promotes a due ISO timestamp on the same day while preserving future and draft videos', async () => {
    const { db, env } = fixture();
    try {
      await publishScheduledExamVideos(env);
      expect(db.prepare('SELECT status,approved FROM video_links WHERE id=?').get('due')).toMatchObject({ status: 'PUBLISHED', approved: 1 });
      expect(db.prepare('SELECT status FROM video_links WHERE id=?').get('future')).toMatchObject({ status: 'SCHEDULED' });
      expect(db.prepare('SELECT status FROM video_links WHERE id=?').get('draft')).toMatchObject({ status: 'DRAFT' });
      expect(db.prepare('SELECT status FROM video_links WHERE id=?').get('unset')).toMatchObject({ status: 'SCHEDULED' });
    } finally { db.close(); }
  });
  it('applies the same time gate to content and student review queries', () => {
    const { db, atFixedTime } = fixture();
    try {
      db.exec("UPDATE video_links SET status='PUBLISHED',approved=1 WHERE id IN ('due','future')");
      for (const file of ['worker/exam-admin-entry.ts', 'worker/standard-review-entry.ts']) {
        const source = readFileSync(file, 'utf8');
        const gates = [...source.matchAll(/(publish_at IS NULL OR datetime\(publish_at\)<=CURRENT_TIMESTAMP)/g)].map(match => match[1]);
        expect(gates.length).toBeGreaterThan(0);
        for (const gate of gates) {
          const rows = db.prepare(atFixedTime(`SELECT id FROM video_links WHERE status='PUBLISHED' AND (${gate})`)).all();
          expect(rows.map(row => row.id)).toEqual(['due']);
        }
      }
    } finally { db.close(); }
  });
});
