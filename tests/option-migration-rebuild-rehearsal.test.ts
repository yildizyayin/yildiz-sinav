import {DatabaseSync} from 'node:sqlite';
import {describe,it,expect} from 'vitest';

/** A disposable SQLite proof, NOT a production/D1 migration script. */
describe('three-option rebuild rehearsal with inbound FK references',()=>{
 it('rebuilds a referenced table transactionally, preserves dependencies, and rolls back rehearsal',()=>{
  const db=new DatabaseSync(':memory:');
  try {
   db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE question_bank(id TEXT PRIMARY KEY, option_count INTEGER NOT NULL CHECK(option_count IN (4,5)),stem TEXT NOT NULL);
    CREATE TABLE question_learning_links(question_id TEXT NOT NULL REFERENCES question_bank(id),node_id TEXT NOT NULL);
    CREATE INDEX idx_option_choice ON question_bank(option_count);
    CREATE TABLE event_log(event TEXT);
    CREATE TRIGGER question_bank_update AFTER UPDATE ON question_bank BEGIN INSERT INTO event_log VALUES('updated'); END;
    INSERT INTO question_bank VALUES('q1',4,'A'),('q2',5,'B');
    INSERT INTO question_learning_links VALUES('q1','outcome1');`);
   db.exec('BEGIN IMMEDIATE');
   try {
    db.exec(`PRAGMA defer_foreign_keys=ON;
      CREATE TABLE question_bank_rebuilt(id TEXT PRIMARY KEY,option_count INTEGER NOT NULL CHECK(option_count IN (3,4,5)),stem TEXT NOT NULL);
      INSERT INTO question_bank_rebuilt SELECT * FROM question_bank;
      DROP TABLE question_bank;
      ALTER TABLE question_bank_rebuilt RENAME TO question_bank;
      CREATE INDEX idx_option_choice ON question_bank(option_count);
      CREATE TRIGGER question_bank_update AFTER UPDATE ON question_bank BEGIN INSERT INTO event_log VALUES('updated'); END;`);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect((db.prepare('PRAGMA integrity_check').get() as any).integrity_check).toBe('ok');
    expect((db.prepare('SELECT count(*) AS n FROM question_bank').get() as any).n).toBe(2);
    db.exec("INSERT INTO question_bank VALUES('q3',3,'C'); UPDATE question_bank SET stem='A2' WHERE id='q1'");
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_option_choice'").get()).toBeTruthy();
    expect((db.prepare('SELECT count(*) AS n FROM event_log').get() as any).n).toBe(1);
   } finally {db.exec('ROLLBACK');}
   expect((db.prepare('SELECT count(*) AS n FROM question_bank').get() as any).n).toBe(2);
   expect(()=>db.exec("INSERT INTO question_bank VALUES('q3',3,'C')")).toThrow();
   expect((db.prepare('SELECT count(*) AS n FROM question_learning_links').get() as any).n).toBe(1);
   expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {db.close();}
 });
});
