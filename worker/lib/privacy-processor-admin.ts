import type { AuthUser, Env } from '../types';
import { all, audit, badRequest, json, notFound, one, uuid } from './db';
import { processorReadyForPersonalData, transferReadyForPersonalData } from './privacy-operations';

/**
 * KVKK veri işleyen ve yurt dışı aktarım kayıtları (owner request 30 Oct). Until now these records could only be read;
 * the gate that blocks Nibiru's AI (privacy-external-gate) reads them. Here the Super Admin records the evidence and
 * approves. Nothing is approved by the system: every approval needs the Super Admin's explicit confirmation and a
 * written evidence reference (contract, document link or legal opinion number), and every change is audited with the
 * values before and after. The approval conditions are the gate's own conditions, so a record approved here is
 * exactly a record the gate lets through, and nothing less.
 */
const DPA = ['MISSING', 'UNDER_REVIEW', 'SIGNED', 'NOT_APPLICABLE'];
const TRAINING = ['UNKNOWN', 'DISABLED', 'ENABLED', 'NOT_APPLICABLE'];
const LEGAL = ['PENDING', 'APPROVED', 'REJECTED', 'NOT_APPLICABLE'];
const ROLE = ['PROCESSOR', 'SUBPROCESSOR', 'INDEPENDENT_CONTROLLER', 'TBD'];
const MECHANISM = ['TBD', 'ADEQUACY', 'STANDARD_CONTRACT', 'BINDING_CORPORATE_RULES', 'UNDERTAKING_APPROVAL', 'EXCEPTIONAL_CASE', 'NOT_CROSS_BORDER'];
const TRANSFER_STATUS = ['DRAFT', 'LEGAL_REVIEW', 'ACTIVE', 'SUSPENDED', 'RETIRED'];

const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);
const text = (v: unknown, max: number) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };
const pick = (v: unknown, allowed: string[]) => { const s = String(v ?? '').trim().toUpperCase(); return allowed.includes(s) ? s : null; };
/** Five business days after the signing date (weekends skipped; official holidays are not known here, so this is the earliest due date). */
export function fiveBusinessDaysAfter(date: string): string { const d = new Date(`${date}T00:00:00Z`); let n = 0; while (n < 5) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; } return d.toISOString().slice(0, 10); }
const isoDate = (v: unknown) => { const s = String(v ?? '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };

/** The evidence that goes with every change: why this value is true. */
function evidenceOf(body: any): string | null { const e = text(body?.evidence, 600); return e && e.length >= 10 ? e : null; }

export async function processorDetail(env: Env, id: string) {
  const processor = await one<any>(env.DB.prepare(`SELECT * FROM processor_registry WHERE id=?`).bind(id));
  if (!processor) return null;
  const transfers = await all<any>(env.DB.prepare(`SELECT * FROM international_transfer_registry WHERE processor_id=? ORDER BY created_at DESC`).bind(id));
  const blockers: string[] = [];
  if (processor.active && !processorReadyForPersonalData(processor)) {
    if (!['APPROVED', 'NOT_APPLICABLE'].includes(processor.legal_review_status)) blockers.push('Hukuki inceleme onaylı değil.');
    if (!['SIGNED', 'NOT_APPLICABLE'].includes(processor.dpa_status)) blockers.push('Veri işleme sözleşmesi (DPA) imzalı değil.');
    if (processor.training_on_customer_data === 'UNKNOWN') blockers.push('Verilerle model eğitimi bilgisi girilmemiş.');
  }
  const live = transfers.filter((t: any) => t.status !== 'RETIRED');
  if (processor.active && !live.length) blockers.push('Yurt dışı aktarım kaydı yok (yurt dışı yoksa "Yurt dışı aktarım yok" kaydı girin).');
  for (const t of live) if (!transferReadyForPersonalData(t)) blockers.push(`Aktarım kaydı (${t.destination_country_or_region || 'bölge yok'}) etkin değil ya da dayanağı belirsiz.`);
  return { processor, transfers, ready: blockers.length === 0, blockers };
}

export async function listProcessors(env: Env): Promise<Response> {
  const rows = await all<any>(env.DB.prepare(`SELECT id FROM processor_registry ORDER BY active DESC,provider_name,service_name LIMIT 200`));
  const items = [];
  for (const r of rows) items.push(await processorDetail(env, r.id));
  return json({ ok: true, items });
}

export async function updateProcessor(request: Request, env: Env, actor: AuthUser, id: string): Promise<Response> {
  const before = await one<any>(env.DB.prepare(`SELECT * FROM processor_registry WHERE id=?`).bind(id));
  if (!before) return notFound('Veri işleyen kaydı bulunamadı.');
  const body: any = await request.json().catch(() => ({}));
  const evidence = evidenceOf(body);
  if (!evidence) return badRequest('Değişikliğin dayanağını yazın: sözleşme, belge bağlantısı ya da hukuki görüş (en az 10 karakter).', 'EVIDENCE_REQUIRED');
  const next = {
    dpa_status: body.dpaStatus === undefined ? before.dpa_status : pick(body.dpaStatus, DPA),
    training_on_customer_data: body.trainingOnCustomerData === undefined ? before.training_on_customer_data : pick(body.trainingOnCustomerData, TRAINING),
    legal_review_status: body.legalReviewStatus === undefined ? before.legal_review_status : pick(body.legalReviewStatus, LEGAL),
    role_model: body.roleModel === undefined ? before.role_model : pick(body.roleModel, ROLE),
    processing_region: body.processingRegion === undefined ? before.processing_region : text(body.processingRegion, 200),
    retention_note: body.retentionNote === undefined ? before.retention_note : text(body.retentionNote, 600),
  };
  if (!next.dpa_status || !next.training_on_customer_data || !next.legal_review_status || (body.roleModel !== undefined && !next.role_model)) return badRequest('Geçersiz değer.', 'INVALID_VALUE');
  // Approving is the owner's decision: an explicit confirmation, and only when the record already says what the
  // approval relies on (signed DPA, known training position). The system never approves by itself.
  if (next.legal_review_status === 'APPROVED' && before.legal_review_status !== 'APPROVED') {
    if (body.confirmApproval !== true) return badRequest('Onay için "Bu kaydı onaylıyorum" kutusunu işaretleyin.', 'APPROVAL_CONFIRMATION_REQUIRED');
    if (!['SIGNED', 'NOT_APPLICABLE'].includes(next.dpa_status)) return badRequest('DPA imzalı (ya da gerekmiyor) olmadan hukuki onay verilemez.', 'DPA_NOT_SIGNED');
    if (next.training_on_customer_data === 'UNKNOWN') return badRequest('Verilerle model eğitimi bilgisi girilmeden onay verilemez.', 'TRAINING_UNKNOWN');
  }
  const approved = next.legal_review_status === 'APPROVED';
  await env.DB.prepare(`UPDATE processor_registry SET dpa_status=?,training_on_customer_data=?,legal_review_status=?,role_model=?,processing_region=?,retention_note=?,approved_by=?,approved_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(next.dpa_status, next.training_on_customer_data, next.legal_review_status, next.role_model, next.processing_region, next.retention_note,
      approved ? (before.legal_review_status === 'APPROVED' ? before.approved_by : actor.id) : null,
      approved ? (before.legal_review_status === 'APPROVED' ? before.approved_at : new Date().toISOString()) : null, id).run();
  const changed = Object.fromEntries(Object.entries(next).filter(([k, v]) => before[k] !== v).map(([k, v]) => [k, { from: before[k], to: v }]));
  await audit(env.DB, actor.id, null, 'PRIVACY_PROCESSOR_UPDATED', 'processor_registry', id, { serviceCode: before.service_code, changed, evidence });
  return json({ ok: true, ...(await processorDetail(env, id)) });
}

export async function saveTransfer(request: Request, env: Env, actor: AuthUser, transferId: string | null): Promise<Response> {
  const body: any = await request.json().catch(() => ({}));
  const evidence = evidenceOf(body);
  if (!evidence) return badRequest('Değişikliğin dayanağını yazın: sözleşme, belge bağlantısı ya da hukuki görüş (en az 10 karakter).', 'EVIDENCE_REQUIRED');
  const before = transferId ? await one<any>(env.DB.prepare(`SELECT * FROM international_transfer_registry WHERE id=?`).bind(transferId)) : null;
  if (transferId && !before) return notFound('Aktarım kaydı bulunamadı.');
  const processorId = before?.processor_id || String(body.processorId || '');
  const processor = await one<any>(env.DB.prepare(`SELECT id,service_code FROM processor_registry WHERE id=?`).bind(processorId));
  if (!processor) return notFound('Veri işleyen kaydı bulunamadı.');
  const val = <T,>(key: string, fallback: T, parse: (v: unknown) => T) => body[key] === undefined ? fallback : parse(body[key]);
  const next = {
    destination_country_or_region: val('destination', before?.destination_country_or_region ?? null, (v) => text(v, 200)),
    data_categories_json: val('dataCategories', before?.data_categories_json ?? '[]', (v) => JSON.stringify((Array.isArray(v) ? v : String(v || '').split(',')).map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 30))),
    subject_categories_json: val('subjectCategories', before?.subject_categories_json ?? '[]', (v) => JSON.stringify((Array.isArray(v) ? v : String(v || '').split(',')).map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 30))),
    transfer_mechanism: val('mechanism', before?.transfer_mechanism ?? 'TBD', (v) => pick(v, MECHANISM)),
    agreement_reference: val('agreementReference', before?.agreement_reference ?? null, (v) => text(v, 300)),
    signed_at: val('signedAt', before?.signed_at ?? null, isoDate),
    authority_notified_at: val('authorityNotifiedAt', before?.authority_notified_at ?? null, isoDate),
    minimization_note: val('minimizationNote', before?.minimization_note ?? null, (v) => text(v, 600)),
    status: val('status', before?.status ?? 'DRAFT', (v) => pick(v, TRANSFER_STATUS)),
  };
  if (!next.transfer_mechanism || !next.status) return badRequest('Geçersiz değer.', 'INVALID_VALUE');
  // KVKK m.9 (2024): a standard contract is notified to the Authority within five business days of signing.
  const notificationRequired = next.transfer_mechanism === 'STANDARD_CONTRACT' ? 1 : 0;
  if (next.status === 'ACTIVE' && before?.status !== 'ACTIVE') {
    if (body.confirmApproval !== true) return badRequest('Etkinleştirmek için "Bu kaydı onaylıyorum" kutusunu işaretleyin.', 'APPROVAL_CONFIRMATION_REQUIRED');
    if (next.transfer_mechanism === 'TBD') return badRequest('Aktarım dayanağı seçilmeden kayıt etkinleştirilemez.', 'MECHANISM_REQUIRED');
    if (next.transfer_mechanism !== 'NOT_CROSS_BORDER' && !next.agreement_reference) return badRequest('Dayanak belgesinin adını ya da numarasını yazın.', 'AGREEMENT_REFERENCE_REQUIRED');
    if (notificationRequired && (!next.signed_at || !next.authority_notified_at)) return badRequest('Standart sözleşmede imza tarihi ve Kurum\'a bildirim tarihi girilmeden kayıt etkinleştirilemez.', 'AUTHORITY_NOTIFICATION_REQUIRED');
  }
  const active = next.status === 'ACTIVE';
  const id = transferId || uuid('xfer');
  const due = notificationRequired && next.signed_at ? fiveBusinessDaysAfter(next.signed_at) : null;
  if (before) {
    await env.DB.prepare(`UPDATE international_transfer_registry SET destination_country_or_region=?,data_categories_json=?,subject_categories_json=?,transfer_mechanism=?,agreement_reference=?,signed_at=?,authority_notification_required=?,authority_notification_due_at=?,authority_notified_at=?,status=?,minimization_note=?,approved_by=?,approved_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(next.destination_country_or_region, next.data_categories_json, next.subject_categories_json, next.transfer_mechanism, next.agreement_reference, next.signed_at, notificationRequired, due, next.authority_notified_at, next.status, next.minimization_note,
        active ? (before.status === 'ACTIVE' ? before.approved_by : actor.id) : null, active ? (before.status === 'ACTIVE' ? before.approved_at : new Date().toISOString()) : null, id).run();
  } else {
    await env.DB.prepare(`INSERT INTO international_transfer_registry(id,processor_id,destination_country_or_region,data_categories_json,subject_categories_json,transfer_mechanism,agreement_reference,signed_at,authority_notification_required,authority_notification_due_at,authority_notified_at,status,minimization_note,approved_by,approved_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, processorId, next.destination_country_or_region, next.data_categories_json, next.subject_categories_json, next.transfer_mechanism, next.agreement_reference, next.signed_at, notificationRequired, due, next.authority_notified_at, next.status, next.minimization_note, active ? actor.id : null, active ? new Date().toISOString() : null).run();
  }
  const changed = before ? Object.fromEntries(Object.entries(next).filter(([k, v]) => before[k] !== v).map(([k, v]) => [k, { from: before[k], to: v }])) : { created: next };
  await audit(env.DB, actor.id, null, before ? 'PRIVACY_TRANSFER_UPDATED' : 'PRIVACY_TRANSFER_CREATED', 'international_transfer_registry', id, { serviceCode: processor.service_code, changed, evidence });
  return json({ ok: true, transferId: id, ...(await processorDetail(env, processorId)) }, before ? 200 : 201);
}
