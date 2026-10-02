import { expect, it } from 'vitest';
import { issueAccess } from '../worker/result-network-entry';
import { resultRetentionFixture } from './helpers/result-retention-fixture';

function fixture() {
  const f = resultRetentionFixture();
  f.db.exec(`CREATE TABLE exams(id TEXT PRIMARY KEY,academic_year TEXT);
    INSERT INTO exams VALUES('e','2026-2027');
    CREATE TABLE national_institution_directory(meb_code TEXT,name TEXT,city TEXT,district TEXT,status TEXT);
    INSERT INTO national_institution_directory VALUES('code','Sentetik kurum','İstanbul','Kartal','ACTIVE');`);
  return f;
}
const request = (participantId = 'p000') => new Request('https://test', { method: 'POST', body: JSON.stringify({ administrationId: 'a', participantId, mebCode: 'code', fullName: 'Sentetik Öğrenci', studentNumber: '123', gradeLevel: 7 }) });
const user = { id: 'super', role: 'SUPER_ADMIN' } as any;

it('blocks identity issuance while another exam operation owns the lock', async () => {
  const f = fixture();
  try {
    f.db.exec("INSERT INTO exam_operation_locks VALUES('e','other-owner','FREEZE')");
    const response = await issueAccess(request(), f.env, user);
    expect(response.status).toBe(409);
    expect((await response.json() as any).error.code).toBe('EXAM_OPERATION_BUSY');
    expect(f.db.prepare('SELECT * FROM audit_logs').all()).toHaveLength(0);
    expect(f.db.prepare('SELECT * FROM result_access_identities').all()).toHaveLength(1);
  } finally { f.db.close(); }
});

it('rejects foreign participants and additions to the published cohort before writes', async () => {
  const f = fixture();
  try {
    const foreign = await issueAccess(request('foreign'), f.env, user);
    expect((await foreign.json() as any).error.code).toBe('RESULT_ACCESS_SCOPE_INVALID');
    f.db.exec("INSERT INTO exam_participants VALUES('new-participant','e','school')");
    const added = await issueAccess(request('new-participant'), f.env, user);
    expect(added.status).toBe(409);
    expect((await added.json() as any).error.code).toBe('RESULT_COHORT_FROZEN');
    expect(f.db.prepare('SELECT * FROM result_access_identities').all()).toHaveLength(1);
    expect(f.db.prepare('SELECT * FROM exam_operation_locks').all()).toHaveLength(0);
    expect((await issueAccess(request(), f.env, { role: 'TEACHER' } as any)).status).toBe(403);
  } finally { f.db.close(); }
});

it('allows code rotation for an existing participant in the current frozen version', async () => {
  const f = fixture();
  try {
    f.db.exec(`ALTER TABLE exam_administrations ADD COLUMN published_at TEXT;
      ALTER TABLE result_network_institutions ADD COLUMN display_name_snapshot TEXT;
      ALTER TABLE result_network_institutions ADD COLUMN city_snapshot TEXT;
      ALTER TABLE result_network_institutions ADD COLUMN district_snapshot TEXT;
      CREATE UNIQUE INDEX rni_scope ON result_network_institutions(administration_id,meb_code);
      ALTER TABLE result_access_identities ADD COLUMN id TEXT;
      ALTER TABLE result_access_identities ADD COLUMN grade_level INTEGER;
      ALTER TABLE result_access_identities ADD COLUMN normalized_name TEXT;
      ALTER TABLE result_access_identities ADD COLUMN student_number_lookup_token TEXT;
      ALTER TABLE result_access_identities ADD COLUMN tckn_lookup_token TEXT;
      ALTER TABLE result_access_identities ADD COLUMN access_code_hash TEXT;
      ALTER TABLE result_access_identities ADD COLUMN access_code_salt TEXT;
      ALTER TABLE result_access_identities ADD COLUMN expires_at TEXT;
      CREATE UNIQUE INDEX rai_scope ON result_access_identities(administration_id,participant_id);`);
    f.env.RESULT_LOOKUP_SECRET = 'synthetic-secret-only';
    const response = await issueAccess(request(), f.env, user);
    expect(response.status).toBe(201);
    expect((await response.json() as any).oneTimeDisplay).toBe(true);
    expect(f.db.prepare('SELECT * FROM result_access_identities').all()).toHaveLength(1);
    expect(f.db.prepare('SELECT * FROM audit_logs').all()).toHaveLength(1);
    expect(f.db.prepare('SELECT * FROM exam_operation_locks').all()).toHaveLength(0);
  } finally { f.db.close(); }
});
