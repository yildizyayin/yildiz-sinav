PRAGMA foreign_keys = ON;

-- KVKK/privacy governance foundation. These tables are administrative evidence and
-- workflow state; they do not by themselves determine a legal basis or controller role.

CREATE TABLE IF NOT EXISTS processing_activity_registry (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  purpose TEXT NOT NULL,
  subject_categories_json TEXT NOT NULL,
  data_categories_json TEXT NOT NULL,
  lawful_basis_code TEXT,
  recipients_json TEXT,
  owner_role TEXT,
  retention_policy_code TEXT,
  international_transfer INTEGER NOT NULL DEFAULT 0 CHECK(international_transfer IN (0,1)),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','LEGAL_REVIEW','APPROVED','RETIRED')),
  legal_review_note TEXT,
  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_processing_activity_status
  ON processing_activity_registry(status, international_transfer);

CREATE TABLE IF NOT EXISTS privacy_notice_versions (
  id TEXT PRIMARY KEY,
  audience TEXT NOT NULL CHECK(audience IN ('STUDENT','PARENT','TEACHER','GUIDANCE_TEACHER','INSTITUTION_MANAGER','PLATFORM_STAFF','OTHER')),
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  content_url TEXT,
  effective_at TEXT NOT NULL,
  retired_at TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','LEGAL_REVIEW','ACTIVE','RETIRED')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(audience, version)
);
CREATE INDEX IF NOT EXISTS idx_privacy_notice_active
  ON privacy_notice_versions(audience, status, effective_at DESC);

CREATE TABLE IF NOT EXISTS privacy_notice_receipts (
  id TEXT PRIMARY KEY,
  notice_version_id TEXT NOT NULL REFERENCES privacy_notice_versions(id),
  user_id TEXT REFERENCES users(id),
  student_id TEXT REFERENCES student_entities(id),
  institution_id TEXT REFERENCES institutions(id),
  delivered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TEXT,
  channel TEXT NOT NULL DEFAULT 'WEB' CHECK(channel IN ('WEB','MOBILE','EMAIL','PAPER','OTHER')),
  evidence_hash TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(user_id IS NOT NULL OR student_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_privacy_receipt_user
  ON privacy_notice_receipts(user_id, delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_privacy_receipt_student
  ON privacy_notice_receipts(student_id, delivered_at DESC);

CREATE TABLE IF NOT EXISTS consent_records (
  id TEXT PRIMARY KEY,
  purpose_code TEXT NOT NULL,
  subject_user_id TEXT REFERENCES users(id),
  subject_student_id TEXT REFERENCES student_entities(id),
  institution_id TEXT REFERENCES institutions(id),
  granted_by_user_id TEXT REFERENCES users(id),
  notice_version_id TEXT REFERENCES privacy_notice_versions(id),
  state TEXT NOT NULL CHECK(state IN ('GRANTED','WITHDRAWN','EXPIRED')),
  channel TEXT NOT NULL DEFAULT 'WEB' CHECK(channel IN ('WEB','MOBILE','PAPER','OTHER')),
  granted_at TEXT,
  withdrawn_at TEXT,
  evidence_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(subject_user_id IS NOT NULL OR subject_student_id IS NOT NULL),
  CHECK(state <> 'GRANTED' OR granted_at IS NOT NULL),
  CHECK(state <> 'WITHDRAWN' OR withdrawn_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_consent_student_purpose
  ON consent_records(subject_student_id, purpose_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consent_user_purpose
  ON consent_records(subject_user_id, purpose_code, created_at DESC);

CREATE TABLE IF NOT EXISTS processor_registry (
  id TEXT PRIMARY KEY,
  service_code TEXT NOT NULL UNIQUE,
  provider_name TEXT NOT NULL,
  service_name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  role_model TEXT CHECK(role_model IN ('PROCESSOR','SUBPROCESSOR','INDEPENDENT_CONTROLLER','TBD')),
  processing_region TEXT,
  data_categories_json TEXT,
  subject_categories_json TEXT,
  dpa_status TEXT NOT NULL DEFAULT 'MISSING' CHECK(dpa_status IN ('MISSING','UNDER_REVIEW','SIGNED','NOT_APPLICABLE')),
  training_on_customer_data TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(training_on_customer_data IN ('UNKNOWN','DISABLED','ENABLED','NOT_APPLICABLE')),
  retention_note TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  legal_review_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(legal_review_status IN ('PENDING','APPROVED','REJECTED','NOT_APPLICABLE')),
  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS international_transfer_registry (
  id TEXT PRIMARY KEY,
  processor_id TEXT NOT NULL REFERENCES processor_registry(id),
  destination_country_or_region TEXT,
  data_categories_json TEXT NOT NULL,
  subject_categories_json TEXT NOT NULL,
  transfer_mechanism TEXT NOT NULL DEFAULT 'TBD'
    CHECK(transfer_mechanism IN ('TBD','ADEQUACY','STANDARD_CONTRACT','BINDING_CORPORATE_RULES','UNDERTAKING_APPROVAL','EXCEPTIONAL_CASE','NOT_CROSS_BORDER')),
  agreement_reference TEXT,
  signed_at TEXT,
  authority_notification_required INTEGER NOT NULL DEFAULT 0 CHECK(authority_notification_required IN (0,1)),
  authority_notification_due_at TEXT,
  authority_notified_at TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','LEGAL_REVIEW','ACTIVE','SUSPENDED','RETIRED')),
  minimization_note TEXT,
  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_transfer_processor_status
  ON international_transfer_registry(processor_id, status);

CREATE TABLE IF NOT EXISTS retention_policies (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL,
  purpose_note TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  retention_days INTEGER CHECK(retention_days IS NULL OR retention_days >= 0),
  retention_note TEXT,
  disposal_action TEXT NOT NULL CHECK(disposal_action IN ('DELETE','ANONYMIZE','LEGAL_REVIEW')),
  legal_hold_supported INTEGER NOT NULL DEFAULT 1 CHECK(legal_hold_supported IN (0,1)),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','LEGAL_REVIEW','APPROVED','RETIRED')),
  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_retention_entity_status
  ON retention_policies(entity_type, status);

CREATE TABLE IF NOT EXISTS data_subject_requests (
  id TEXT PRIMARY KEY,
  institution_id TEXT REFERENCES institutions(id),
  requester_user_id TEXT REFERENCES users(id),
  subject_user_id TEXT REFERENCES users(id),
  subject_student_id TEXT REFERENCES student_entities(id),
  request_type TEXT NOT NULL CHECK(request_type IN ('ACCESS','INFORMATION','CORRECTION','DELETE','ANONYMIZE','OBJECT','OTHER')),
  identity_verification_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK(identity_verification_status IN ('PENDING','VERIFIED','REJECTED')),
  scope_note TEXT,
  status TEXT NOT NULL DEFAULT 'RECEIVED'
    CHECK(status IN ('RECEIVED','VERIFYING','IN_REVIEW','ACTION_REQUIRED','COMPLETED','REJECTED','CANCELLED')),
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  target_deadline_at TEXT,
  completed_at TEXT,
  response_evidence_hash TEXT,
  owner_user_id TEXT REFERENCES users(id),
  resolution_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(subject_user_id IS NOT NULL OR subject_student_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_dsr_status_deadline
  ON data_subject_requests(status, target_deadline_at);
CREATE INDEX IF NOT EXISTS idx_dsr_student
  ON data_subject_requests(subject_student_id, received_at DESC);

CREATE TABLE IF NOT EXISTS privacy_deletion_jobs (
  id TEXT PRIMARY KEY,
  institution_id TEXT REFERENCES institutions(id),
  subject_user_id TEXT REFERENCES users(id),
  subject_student_id TEXT REFERENCES student_entities(id),
  requested_by_user_id TEXT REFERENCES users(id),
  request_id TEXT REFERENCES data_subject_requests(id),
  mode TEXT NOT NULL CHECK(mode IN ('DELETE','ANONYMIZE')),
  reason_code TEXT NOT NULL,
  legal_hold INTEGER NOT NULL DEFAULT 0 CHECK(legal_hold IN (0,1)),
  legal_hold_note TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK(status IN ('PENDING','LEGAL_REVIEW','APPROVED','RUNNING','COMPLETED','FAILED','CANCELLED')),
  scheduled_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  affected_records INTEGER,
  result_hash TEXT,
  failure_summary TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(subject_user_id IS NOT NULL OR subject_student_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_privacy_deletion_status
  ON privacy_deletion_jobs(status, scheduled_at);

CREATE TABLE IF NOT EXISTS security_incidents (
  id TEXT PRIMARY KEY,
  incident_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  incident_type TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'UNDER_REVIEW' CHECK(risk_level IN ('UNDER_REVIEW','LOW','MEDIUM','HIGH','CRITICAL')),
  personal_data_involved INTEGER NOT NULL DEFAULT 0 CHECK(personal_data_involved IN (0,1)),
  affected_data_categories_json TEXT,
  affected_subject_categories_json TEXT,
  estimated_subject_count INTEGER CHECK(estimated_subject_count IS NULL OR estimated_subject_count >= 0),
  detected_at TEXT NOT NULL,
  confirmed_at TEXT,
  contained_at TEXT,
  authority_notification_due_at TEXT,
  authority_notified_at TEXT,
  affected_persons_notification_at TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','INVESTIGATING','CONTAINED','NOTIFICATION_REVIEW','CLOSED','FALSE_POSITIVE')),
  owner_user_id TEXT REFERENCES users(id),
  containment_note TEXT,
  legal_decision_note TEXT,
  postmortem_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_security_incident_deadline
  ON security_incidents(status, authority_notification_due_at);

-- Initial provider placeholders are intentionally PENDING/TBD. An API key or existing
-- integration is not treated as compliance approval.
INSERT OR IGNORE INTO processor_registry
  (id,service_code,provider_name,service_name,purpose,role_model,dpa_status,training_on_customer_data,legal_review_status)
VALUES
  ('proc_cloudflare','CLOUDFLARE','Cloudflare','Workers/D1/R2/KV/Queues','Platform hosting, storage, execution and delivery','TBD','MISSING','UNKNOWN','PENDING'),
  ('proc_meta_whatsapp','META_WHATSAPP','Meta','WhatsApp Business','Role-safe platform communications and pairing','TBD','MISSING','NOT_APPLICABLE','PENDING'),
  ('proc_youtube','YOUTUBE','Google/YouTube','YouTube','Educational video discovery/linking','TBD','MISSING','NOT_APPLICABLE','PENDING'),
  ('proc_nibiru_ai','NIBIRU_AI','Multiple providers','Nibiru AI routing','Pseudonymized educational assistance and analysis','TBD','MISSING','UNKNOWN','PENDING');
