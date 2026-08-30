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
out.push(`INSERT OR REPLACE INTO institutions (id,name,code,city,district,status) VALUES ('inst_privacy_b','Synthetic Privacy Tenant B','PRIVB','Synthetic','Synthetic','ACTIVE');`);
out.push(`INSERT OR REPLACE INTO institution_seasons (id,institution_id,academic_year,status,started_at) VALUES ('season_privacy_b','inst_privacy_b','2026-2027','ACTIVE','2026-09-01');`);
out.push(`INSERT OR REPLACE INTO classes (id,institution_id,season_id,grade_level,section,name,active) VALUES ('class_privacy_b','inst_privacy_b','season_privacy_b',7,'P','7/P',1);`);
out.push(`INSERT OR REPLACE INTO student_entities (id,first_name,last_name,normalized_name,status,activated_at) VALUES ('stu_privacy_b','Synthetic','TenantB','synthetic tenantb','ACTIVE','2026-09-01');`);
out.push(`INSERT OR REPLACE INTO student_enrollments (id,student_id,institution_id,season_id,class_id,student_number,grade_level,section,status) VALUES ('enr_privacy_b','stu_privacy_b','inst_privacy_b','season_privacy_b','class_privacy_b','9001',7,'P','ACTIVE');`);
out.push(`INSERT OR REPLACE INTO users (id,institution_id,student_id,role,display_name,email,username,password_hash,password_salt,password_iterations,password_algo,active) VALUES ('usr_privacy_manager_b','inst_privacy_b',NULL,'INSTITUTION_MANAGER','Synthetic Privacy Manager B','privacy-manager-b@example.test','privacy-manager-b',${q(managerPassword.hash)},${q(managerPassword.salt)},100000,'PBKDF2-SHA256-v1',1);`);

out.push(`INSERT OR REPLACE INTO processing_activity_registry
  (id,code,title,purpose,subject_categories_json,data_categories_json,lawful_basis_code,recipients_json,owner_role,retention_policy_code,international_transfer,status,legal_review_note,approved_by,approved_at)
  VALUES ('pa_smoke_consent','SMOKE_CONSENT','Synthetic smoke explicit-consent activity','Automated staging verification only','["SYNTHETIC_TEST_SUBJECT"]','["SYNTHETIC_TEST_DATA"]','CONSENT','[]','SUPER_ADMIN',NULL,0,'APPROVED','Synthetic staging fixture; never a production legal basis','usr_super',CURRENT_TIMESTAMP);`);

out.push(`INSERT OR REPLACE INTO privacy_notice_versions
  (id,audience,version,title,content_hash,content_url,effective_at,retired_at,status,created_by)
  VALUES ('pn_smoke_student','STUDENT','smoke-v1','Synthetic staging privacy notice','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',NULL,'2026-01-01',NULL,'ACTIVE','usr_super');`);

for (const [id, processorId] of [
  ['tr_smoke_cloudflare', 'proc_cloudflare'],
  ['tr_smoke_meta', 'proc_meta_whatsapp'],
  ['tr_smoke_youtube', 'proc_youtube'],
  ['tr_smoke_nibiru', 'proc_nibiru_ai'],
]) {
  out.push(`INSERT OR REPLACE INTO international_transfer_registry
    (id,processor_id,destination_country_or_region,data_categories_json,subject_categories_json,transfer_mechanism,status,minimization_note)
    VALUES (${q(id)},${q(processorId)},'LEGAL_REVIEW_PENDING','["SYNTHETIC_SMOKE_ONLY"]','["SYNTHETIC_TEST_SUBJECT"]','TBD','LEGAL_REVIEW','Technical registry completeness fixture only; legal mechanism remains deliberately pending');`);
}

mkdirSync('tmp', { recursive: true });
writeFileSync('tmp/privacy-security-fixture.idempotent.sql', `${out.join('\n')}\n`);
console.log(`Generated ${out.length} synthetic privacy-security SQL statements.`);
