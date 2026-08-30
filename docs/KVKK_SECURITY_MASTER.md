# ANUNEX KVKK + Privacy-by-Design Security Master

Status: **P0 / production gate**  
Owner: ANUNEX platform  
Last review: 2026-08-28

> This file is the durable technical/compliance checkpoint for the ANUNEX assessment platform. It is not a substitute for Turkish legal advice. Final controller/processor role allocation, lawful bases, notices, contracts, VERBIS scope and cross-border transfer documentation must be approved by qualified Turkish KVKK counsel before commercial production use.

## 1. Non-negotiable product rules

1. **Data minimization by default.** Collect, expose and transmit only the data needed for the requested educational function.
2. **Tenant isolation is a release blocker.** An institution user must never access another institution's student, parent, teacher, exam, result, guidance or export data.
3. **Least privilege.** Teachers see only assigned classes/subjects; guidance teachers see only authorized guidance scope; parents see only linked children; students see only themselves. Super Admin sensitive access must be auditable.
4. **No secrets or production personal data in GitHub, CI logs or smoke reports.** Passwords, raw tokens, phone numbers, T.C. identity numbers, raw voice, raw camera frames and student names must not be written to build/deploy logs.
5. **AI receives pseudonymized context by default.** Nibiru/provider payloads must use internal opaque student identifiers unless identity is strictly required. Prefer grade, subject, outcome, performance and compact history over name/contact data.
6. **AI does not diagnose.** Nibiru must not infer or label medical/psychiatric conditions. Guidance/RBA signals remain educational/developmental and human-governed.
7. **No biometric attendance.** Do not implement face recognition, fingerprint recognition or voiceprint identification for attendance or authentication without a separate legal/security review.
8. **Camera optical reading is document processing, not identity recognition.** Crop/process only the optical form area where possible. Raw frames are ephemeral by default and are not retained after successful extraction unless a documented exception applies.
9. **Voice is ephemeral by default.** Do not persist raw student voice or derive biometric voice templates unless a separately approved feature requires it.
10. **WhatsApp/SMS messages minimize academic detail.** Prefer “A new report is available in ANUNEX; open the secure panel” over sending scores, weaknesses or counseling data in message bodies.
11. **Deletion is real.** `PASSIVE`/`ARCHIVED` is not treated as deletion. When retention is no longer justified, records must be deleted or irreversibly anonymized through a controlled job with audit evidence.
12. **Cross-border transfer is explicit.** Cloudflare, AI providers, Meta/WhatsApp, YouTube and any future processor must appear in the processor/transfer registry before personal data is sent.

## 2. Data domains to inventory

The processing inventory must cover at least:

- Institution: name, contacts, license/contract metadata.
- Staff/users: display name, email, phone, role, assignments, login/security metadata.
- Students: name, school number, class/section, enrollment state.
- Parents: identity/contact account data and parent-child links.
- Assessment: exam participation, answers, wrong/blank/correct state, net/score/rank, outcome/mastery data.
- Learning Graph / Student Intelligence: derived academic profile, evidence and priority outcomes.
- Guidance: counselor-approved educational instruments, reviewed development signals; raw responses restricted to authorized guidance workflow.
- Optical/camera: scan batch metadata, parsed answer records, temporary image artifacts where strictly necessary.
- Voice/Nibiru: command text, provider request/response metadata, safety routing; raw audio non-persistent by default.
- Communications: notification ledger, WhatsApp/SMS delivery metadata, pairing state.
- Security: sessions, hashed IP/security metadata, login attempts, audit logs, privileged access.
- Imports/exports: CSV/XLS/PDF/optical transfer files and export history.

Every domain must record: purpose, subject category, data category, lawful basis, recipients/processors, transfer status, retention trigger/period, deletion method and owner.

## 3. Controller / processor contract gate

Before onboarding paying institutions, counsel must approve the commercial role model. Technical assumption for implementation only:

- The institution may be the data controller for institution-directed processing of its students/staff.
- ANUNEX may act as processor where it processes solely on documented institution instructions.
- ANUNEX may be a separate controller for any independently determined purpose.

The system must not encode this assumption as a legal conclusion. Contracts and privacy notices must support the counsel-approved allocation.

Required commercial pack before production sales:

- Data processing / processor agreement where applicable.
- Institution privacy responsibilities schedule.
- Subprocessor list and change process.
- Security measures annex.
- Retention/deletion schedule.
- Incident notification responsibilities and contacts.
- Cross-border transfer documentation where applicable.

## 4. Notice and consent architecture

Separate concepts technically:

- **Privacy notice / aydınlatma:** versioned, audience-specific, hash-stamped and always recordable as delivered/acknowledged.
- **Explicit consent:** only for processing that actually relies on consent; separate from the notice; purpose-specific; withdrawable; evidence retained.
- **Contract/service acceptance:** never silently reused as privacy consent.

Audience minimum set:

- STUDENT
- PARENT
- TEACHER / GUIDANCE_TEACHER
- INSTITUTION_MANAGER
- Platform/admin staff where applicable

For minors, the legal approval model must be finalized by counsel; the database must be capable of recording the grantor separately from the student data subject.

## 5. Nibiru / multi-AI privacy boundary

### Default outbound AI payload

Allowed by default:

- opaque internal student reference
- grade level
- subject/topic/outcome codes
- wrong/blank/correct counts
- compact mastery/evidence summaries
- relevant educational preferences
- safety/governance flags

Disallowed unless a reviewed feature strictly needs them:

- full name
- phone/email
- T.C. identity number
- parent contact data
- exact home address
- raw counseling responses
- raw camera frames
- raw voice recordings
- authentication/session data

Provider routing must support an allowlist with documented purpose, data categories, region/transfer mechanism, retention/training settings and DPA status.

## 6. Special-risk educational/guidance data

- Raw counselor assessment responses are restricted to the authorized guidance path.
- Parent and ordinary teacher views must not expose counselor-only raw responses.
- Nibiru consumes only reviewed/approved development signals when counselor governance requires it.
- Do not produce medical, psychiatric or disability diagnoses from educational behavior.
- Any future special-category data feature requires a separate P0 privacy/security review before implementation.

## 7. Retention and deletion design

A retention policy must exist for each persistent entity. The policy defines:

- trigger (e.g. contract end, academic-year close, account deletion request)
- minimum/maximum retention justified by law/contract/purpose
- legal-hold behavior
- delete vs irreversible anonymize action
- backup/derived-data treatment
- completion evidence

Deletion jobs must cascade through derived academic data carefully. Deleting/anonymizing a student must account for, at minimum, enrollment, parent links, exam participants, answers/results, outcome results, Learning Graph/Student Intelligence, personal books, guidance data, notification references and export artifacts.

Never claim deletion is complete merely because a login was disabled.

## 8. Data-subject request workflow

The platform needs a controlled request register supporting at least:

- access/information
- correction
- deletion/anonymization
- objection/other statutory requests

Each request stores identity-verification state, scope, owner, received date, target deadline, actions, response state and evidence. Requests must never expose another tenant's or linked person's information during verification.

## 9. Cross-border / subprocessor gate

Before an external service receives personal data, record:

- processor/service name
- service purpose
- data categories
- data subjects
- destination/processing region where known
- controller/processor role
- DPA status
- cross-border transfer mechanism and supporting document
- standard-contract notification state/deadline where applicable
- retention/training configuration
- technical minimization applied

Initial services requiring explicit review:

- Cloudflare (Workers, D1, R2, KV, Queues and logs)
- each Nibiru AI model/provider
- Meta / WhatsApp Business
- YouTube/Google integrations
- email/SMS provider(s)
- error monitoring/analytics provider(s), if added

No provider is considered approved merely because an API key exists.

## 10. Security controls

Release-blocking controls:

- RBAC + institution/tenant scope checks on every personal-data endpoint.
- IDOR tests for student, parent, teacher, manager and Super Admin boundaries.
- Secure session cookies/tokens; logout revokes server-side session.
- Password hashing parameters reviewed; no plaintext/reversible passwords.
- MFA required for Super Admin before commercial production; strongly recommended for institution managers.
- CSRF protection where cookie-based state-changing requests require it.
- XSS/input/output encoding, SQL parameterization, upload type/size controls.
- Rate limiting and abuse controls for auth, exports, AI and communication endpoints.
- Sensitive exports require authorization and must be auditable.
- Logs redact personal data and secrets.
- GitHub Actions secrets only; never commit provider credentials.
- Backups and restore process documented and access-controlled.
- R2/object artifacts use private access by default and short-lived signed access where needed.
- Security headers and TLS enforced.

Existing `audit_logs` remains the common audit backbone; new privacy workflows must also write meaningful actions without putting raw sensitive payloads in `details_json`.

## 11. Incident response

Maintain an incident record for suspected/confirmed personal-data incidents with:

- detection and confirmation timestamps
- affected systems/categories/estimated subjects
- containment actions
- risk assessment
- processor/institution notifications
- authority/affected-person notification decisions and timestamps
- evidence and post-incident actions

The operational runbook must support the KVKK Board's published 72-hour breach-notification interpretation. The timer must be visible and testable; legal counsel/DPO-equivalent owner decides notification content and necessity.

## 12. Production KVKK release gate

Production/commercial release is **BLOCKED** until all P0 items below are green or explicitly waived in writing after legal review:

- [ ] Processing inventory completed for all current modules.
- [ ] Controller/processor roles approved by counsel.
- [ ] Student/parent/staff/manager privacy notices approved and versioned.
- [ ] Consent purposes identified; no blanket/bundled consent.
- [ ] Retention/deletion schedule approved and executable.
- [ ] Data-subject request workflow implemented and tested.
- [ ] Cloudflare + all AI + WhatsApp/other subprocessors registered and reviewed.
- [ ] Cross-border transfer mechanism documented for each relevant processor.
- [ ] AI payload pseudonymization test passes.
- [ ] Guidance raw-data isolation test passes.
- [ ] Camera raw-frame retention test passes (ephemeral by default).
- [ ] Voice raw-audio/voiceprint non-retention test passes by default.
- [ ] Tenant/IDOR suite passes for every role.
- [ ] Super Admin MFA enabled for commercial production.
- [ ] Sensitive export audit test passes.
- [ ] Log/CI secret + PII leak scan passes.
- [ ] Deletion/anonymization end-to-end test passes.
- [ ] Incident-response drill passes and 72-hour timer is verified.
- [ ] VERBIS applicability/status confirmed by counsel/authorized advisor.

## 13. Mandatory automated acceptance suite

Add a `live-kvkk-security-smoke` gate before production closure. It must verify without exposing real personal data:

1. cross-tenant read/write denial
2. student self-scope
3. parent linked-child scope
4. teacher assignment scope
5. guidance-only raw assessment scope
6. logout session revocation
7. AI outbound payload redaction/pseudonymization
8. WhatsApp message minimization
9. protected export authorization + audit event
10. notice version + acknowledgement evidence
11. consent grant/withdrawal state where consent is used
12. deletion/anonymization job on synthetic subject
13. provider/transfer registry completeness
14. incident timer creation
15. no raw PII/secrets in smoke output

Synthetic fixtures only; production student data must not be copied into tests.

## 14. Official references to re-check during every legal review

- 6698 sayılı Kişisel Verilerin Korunması Kanunu, especially processing conditions, special categories, information obligation, data security, data-subject applications and cross-border transfers.
- KVKK “Veri Güvenliğine İlişkin Yükümlülükler”.
- KVKK “Yurt Dışına Aktarım” guidance and current standard-contract materials.
- KVKK “Üretken Yapay Zekâ ve Kişisel Verilerin Korunması Rehberi”.
- Current KVKK deletion/anonymization, special-category-data and breach-notification guidance.

Legal references must be checked against current official KVKK publications before signature or production activation.

## 15. Implementation order

P0-A — registry/schema foundation  
P0-B — tenant/role privacy audit  
P0-C — AI/WhatsApp/camera/voice minimization  
P0-D — notices/consent/DSAR/deletion APIs + Super Admin Privacy Center  
P0-E — retention jobs + incident center  
P0-F — automated KVKK/security smoke gate  
P0-G — counsel validation + contracts + transfer documents  
P0-H — commercial production approval

No new feature is allowed to weaken a completed privacy/security gate without updating this master and its tests.
