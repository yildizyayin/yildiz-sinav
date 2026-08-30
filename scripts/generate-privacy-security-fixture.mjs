import { mkdirSync, writeFileSync } from 'node:fs';
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const out = ['PRAGMA foreign_keys = ON;'];
const q = (value) => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const pw = (password = 'Demo123!') => {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  return { salt: salt.toString('base64'), hash: hash.toString('base64') };
};

const managerPassword = pw();
const studentPassword = pw();
out.push(`INSERT INTO institutions (id,name,code,city,district,status)
  VALUES ('inst_privacy_b','Synthetic Privacy Tenant B','PRIVB','Synthetic','Synthetic','ACTIVE')
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,code=excluded.code,city=excluded.city,district=excluded.district,status='ACTIVE',updated_at=CURRENT_TIMESTAMP;`);
out.push(`INSERT INTO institution_seasons (id,institution_id,academic_year,status,started_at)
  VALUES ('season_privacy_b','inst_privacy_b','2026-2027','ACTIVE','2026-09-01')
  ON CONFLICT(id) DO UPDATE SET institution_id=excluded.institution_id,academic_year=excluded.academic_year,status='ACTIVE',started_at=excluded.started_at;`);
out.push(`INSERT INTO classes (id,institution_id,season_id,grade_level,section,name,active)
  VALUES ('class_privacy_b','inst_privacy_b','season_privacy_b',7,'P','7/P',1)
  ON CONFLICT(id) DO UPDATE SET institution_id=excluded.institution_id,season_id=excluded.season_id,grade_level=excluded.grade_level,section=excluded.section,name=excluded.name,active=1;`);
out.push(`INSERT INTO student_entities (id,first_name,last_name,normalized_name,status,activated_at)
  VALUES ('stu_privacy_b','Synthetic','TenantB','synthetic tenantb','ACTIVE','2026-09-01')
  ON CONFLICT(id) DO UPDATE SET first_name=excluded.first_name,last_name=excluded.last_name,normalized_name=excluded.normalized_name,status='ACTIVE',activated_at=excluded.activated_at,updated_at=CURRENT_TIMESTAMP;`);
out.push(`INSERT INTO student_enrollments (id,student_id,institution_id,season_id,class_id,student_number,grade_level,section,status)
  VALUES ('enr_privacy_b','stu_privacy_b','inst_privacy_b','season_privacy_b','class_privacy_b','9001',7,'P','ACTIVE')
  ON CONFLICT(id) DO UPDATE SET student_id=excluded.student_id,institution_id=excluded.institution_id,season_id=excluded.season_id,class_id=excluded.class_id,student_number=excluded.student_number,grade_level=excluded.grade_level,section=excluded.section,status='ACTIVE';`);
out.push(`INSERT INTO users (id,institution_id,student_id,role,display_name,email,username,password_hash,password_salt,password_iterations,password_algo,active)
  VALUES ('usr_privacy_manager_b','inst_privacy_b',NULL,'INSTITUTION_MANAGER','Synthetic Privacy Manager B','privacy-manager-b@example.test','privacy-manager-b',${q(managerPassword.hash)},${q(managerPassword.salt)},100000,'PBKDF2-SHA256-v1',1)
  ON CONFLICT(id) DO UPDATE SET institution_id=excluded.institution_id,student_id=NULL,role='INSTITUTION_MANAGER',display_name=excluded.display_name,email=excluded.email,username=excluded.username,password_hash=excluded.password_hash,password_salt=excluded.password_salt,password_iterations=100000,password_algo='PBKDF2-SHA256-v1',active=1,updated_at=CURRENT_TIMESTAMP;`);
out.push(`INSERT INTO users (id,institution_id,student_id,role,display_name,email,username,password_hash,password_salt,password_iterations,password_algo,active)
  VALUES ('usr_privacy_student_b','inst_privacy_b','stu_privacy_b','STUDENT','Synthetic Privacy Student B','privacy-student-b@example.test','privacy-student-b',${q(studentPassword.hash)},${q(studentPassword.salt)},100000,'PBKDF2-SHA256-v1',1)
  ON CONFLICT(id) DO UPDATE SET institution_id=excluded.institution_id,student_id='stu_privacy_b',role='STUDENT',display_name=excluded.display_name,email=excluded.email,phone=NULL,username=excluded.username,password_hash=excluded.password_hash,password_salt=excluded.password_salt,password_iterations=100000,password_algo='PBKDF2-SHA256-v1',active=1,updated_at=CURRENT_TIMESTAMP;`);

out.push(`INSERT INTO processing_activity_registry
  (id,code,title,purpose,subject_categories_json,data_categories_json,lawful_basis_code,recipients_json,owner_role,retention_policy_code,international_transfer,status,legal_review_note,approved_by,approved_at)
  VALUES ('pa_smoke_consent','SMOKE_CONSENT','Synthetic smoke explicit-consent activity','Automated staging verification only','["SYNTHETIC_TEST_SUBJECT"]','["SYNTHETIC_TEST_DATA"]','CONSENT','[]','SUPER_ADMIN',NULL,0,'APPROVED','Synthetic staging fixture; never a production legal basis','usr_super',CURRENT_TIMESTAMP)
  ON CONFLICT(id) DO UPDATE SET code=excluded.code,title=excluded.title,purpose=excluded.purpose,subject_categories_json=excluded.subject_categories_json,data_categories_json=excluded.data_categories_json,lawful_basis_code='CONSENT',recipients_json='[]',owner_role='SUPER_ADMIN',retention_policy_code=NULL,international_transfer=0,status='APPROVED',legal_review_note=excluded.legal_review_note,approved_by='usr_super',approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP;`);

out.push(`INSERT INTO privacy_notice_versions
  (id,audience,version,title,content_hash,content_url,effective_at,retired_at,status,created_by)
  VALUES ('pn_smoke_student','STUDENT','smoke-v1','Synthetic staging privacy notice','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',NULL,'2026-01-01',NULL,'ACTIVE','usr_super')
  ON CONFLICT(id) DO UPDATE SET audience='STUDENT',version='smoke-v1',title=excluded.title,content_hash=excluded.content_hash,content_url=NULL,effective_at='2026-01-01',retired_at=NULL,status='ACTIVE',created_by='usr_super';`);

out.push(`INSERT INTO retention_policies
  (id,code,entity_type,purpose_note,trigger_event,retention_days,retention_note,disposal_action,legal_hold_supported,status,approved_by,approved_at)
  VALUES ('ret_smoke_student','SMOKE_SYNTHETIC_STUDENT_ERASURE','SYNTHETIC_STUDENT','Staging-only lifecycle verification for a dedicated synthetic subject.','SMOKE_REQUEST',0,'Never use as a production retention decision.','ANONYMIZE',1,'APPROVED','usr_super',CURRENT_TIMESTAMP)
  ON CONFLICT(id) DO UPDATE SET code=excluded.code,entity_type='SYNTHETIC_STUDENT',purpose_note=excluded.purpose_note,trigger_event='SMOKE_REQUEST',retention_days=0,retention_note=excluded.retention_note,disposal_action='ANONYMIZE',legal_hold_supported=1,status='APPROVED',approved_by='usr_super',approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP;`);

for (const [id, processorId] of [
  ['tr_smoke_cloudflare', 'proc_cloudflare'],
  ['tr_smoke_meta', 'proc_meta_whatsapp'],
  ['tr_smoke_youtube', 'proc_youtube'],
  ['tr_smoke_nibiru', 'proc_nibiru_ai'],
]) {
  out.push(`INSERT INTO international_transfer_registry
    (id,processor_id,destination_country_or_region,data_categories_json,subject_categories_json,transfer_mechanism,status,minimization_note)
    VALUES (${q(id)},${q(processorId)},'LEGAL_REVIEW_PENDING','["SYNTHETIC_SMOKE_ONLY"]','["SYNTHETIC_TEST_SUBJECT"]','TBD','LEGAL_REVIEW','Technical registry completeness fixture only; legal mechanism remains deliberately pending')
    ON CONFLICT(id) DO UPDATE SET processor_id=excluded.processor_id,destination_country_or_region='LEGAL_REVIEW_PENDING',data_categories_json='["SYNTHETIC_SMOKE_ONLY"]',subject_categories_json='["SYNTHETIC_TEST_SUBJECT"]',transfer_mechanism='TBD',status='LEGAL_REVIEW',minimization_note=excluded.minimization_note,updated_at=CURRENT_TIMESTAMP;`);
}

mkdirSync('tmp', { recursive: true });
writeFileSync('tmp/privacy-security-fixture.idempotent.sql', `${out.join('\n')}\n`);
console.log(`Generated ${out.length} synthetic privacy-security SQL statements.`);
